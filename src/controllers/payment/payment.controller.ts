import { type Response } from "express";
import { pool } from "../../config/db.js";
import type { AuthenticatedRequest } from "../../middleware/auth.middle.js";
import Razorpay from "razorpay";
import crypto from "crypto";
import { sendEmail, getRegistrationConfirmationTemplate } from "../../config/email.js";
import { formatDate, formatTime } from "../../utils/dateUtils.js";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export const initiatePayment = async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  
  try {
    const userId = req.user?.user_id;
    const { registrationId } = req.body;

    if (!userId || !registrationId) {
      return res.status(400).json({
        success: false,
        message: "User ID and Registration ID are required"
      });
    }

    await client.query("BEGIN");

    const regResult = await client.query(
      `SELECT r.registration_id, r.student_id, r.event_id, r.payment_status,
              e.event_name, e.fee_amount, e.max_team_size, u.name, u.email
       FROM registrations r
       JOIN events e ON r.event_id = e.event_id
       JOIN users u ON r.student_id = u.user_id
       WHERE r.registration_id = $1 AND r.student_id = $2
       FOR UPDATE OF r`,
      [registrationId, userId]
    );

    if (regResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Registration not found"
      });
    }

    const registration = regResult.rows[0];
    const feeAmount = parseFloat(registration.fee_amount);

    if (feeAmount <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "This event is free. No payment required."
      });
    }

    if (registration.payment_status) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Payment already completed for this registration"
      });
    }

    // For team events, only team lead can pay
    if (registration.max_team_size > 1) {
      const teamCheckResult = await client.query(
        `SELECT t.team_lead_id FROM team_registrations tr
         JOIN teams t ON tr.team_id = t.team_id
         WHERE tr.registration_id = $1`,
        [registrationId]
      );

      if (teamCheckResult.rowCount && teamCheckResult.rowCount > 0) {
        const teamLeadId = teamCheckResult.rows[0].team_lead_id;
        if (teamLeadId !== userId) {
          await client.query("ROLLBACK");
          return res.status(403).json({
            success: false,
            message: "Only the team lead can make payment for the team"
          });
        }
      }
    }

    // Create Razorpay order
    const options = {
      amount: Math.round(feeAmount * 100), // Convert to paise
      currency: "INR",
      receipt: `reg_${registrationId}`,
      notes: {
        registration_id: registrationId,
        event_name: registration.event_name,
        user_name: registration.name
      }
    };

    const razorpayOrder = await razorpay.orders.create(options);

    await client.query(
      `INSERT INTO payments (payment_id, registration_id, razorpay_order_id, amount, status)
       VALUES (uuid_generate_v4(), $1, $2, $3, 'pending')
       ON CONFLICT (registration_id) 
       DO UPDATE SET razorpay_order_id = $2, amount = $3, status = 'pending', created_at = NOW()`,
      [registrationId, razorpayOrder.id, feeAmount]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Payment initiated successfully",
      data: {
        orderId: razorpayOrder.id,
        amount: feeAmount,
        currency: "INR",
        eventName: registration.event_name,
        userName: registration.name,
        userEmail: registration.email
      }
    });

  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("Payment initiation error:", error);
    
    return res.status(500).json({
      success: false,
      message: "Failed to initiate payment",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  } finally {
    client.release();
  }
};

export const verifyPayment = async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  
  try {
    const userId = req.user?.user_id;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!userId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "All payment verification parameters are required"
      });
    }

    await client.query("BEGIN");

    const paymentResult = await client.query(
      `SELECT p.payment_id, p.registration_id, p.razorpay_order_id, p.amount, p.status,
              r.student_id, r.event_id, e.event_name, e.max_team_size,
              e.venue, e.event_start_time, e.event_end_time, e.whatsapp_link,
              u.name as user_name, u.email as user_email
       FROM payments p
       JOIN registrations r ON p.registration_id = r.registration_id
       JOIN events e ON r.event_id = e.event_id
       JOIN users u ON r.student_id = u.user_id
       WHERE p.razorpay_order_id = $1 AND r.student_id = $2
       FOR UPDATE OF p`,
      [razorpay_order_id, userId]
    );

    if (paymentResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Payment record not found"
      });
    }

    const payment = paymentResult.rows[0];

    if (payment.status === 'completed') {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Payment already verified"
      });
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature"
      });
    }

    await client.query(
      `UPDATE payments 
       SET razorpay_payment_id = $1, razorpay_signature = $2, status = 'completed', updated_at = NOW()
       WHERE payment_id = $3`,
      [razorpay_payment_id, razorpay_signature, payment.payment_id]
    );

    await client.query(
      `UPDATE registrations 
       SET payment_status = true
       WHERE registration_id = $1`,
      [payment.registration_id]
    );

    const isTeamEvent = payment.max_team_size > 1;
    let teamData = null;
    let allMembersData = [];

    // For team events, create team and send emails to all members
    if (isTeamEvent) {
      // Check if team already exists (shouldn't happen, but safety check)
      const existingTeamResult = await client.query(
        `SELECT t.team_id, t.team_code, t.team_name FROM team_registrations tr
         JOIN teams t ON tr.team_id = t.team_id
         WHERE tr.registration_id = $1`,
        [payment.registration_id]
      );

      let teamId, teamCode, teamName;

      if (existingTeamResult.rowCount === 0) {
        // Get team name from a temporary storage or generate one
        // First check if there's a team_name in session/temp storage
        // For now, we'll generate a default name
        const defaultTeamName = `${payment.user_name}'s Team`;

        // Generate team code
        const teamCodeGenerated = Math.random().toString(36).substring(2, 8).toUpperCase();

        // Create team
        const teamResult = await client.query(
          `INSERT INTO teams (team_name, team_lead_id, event_id, team_code)
           VALUES ($1, $2, $3, $4) RETURNING team_id, team_code, team_name`,
          [defaultTeamName, userId, payment.event_id, teamCodeGenerated]
        );

        teamId = teamResult.rows[0].team_id;
        teamCode = teamResult.rows[0].team_code;
        teamName = teamResult.rows[0].team_name;

        // Link registration to team
        await client.query(
          `INSERT INTO team_registrations (registration_id, team_id) 
           VALUES ($1, $2)`,
          [payment.registration_id, teamId]
        );
      } else {
        teamId = existingTeamResult.rows[0].team_id;
        teamCode = existingTeamResult.rows[0].team_code;
        teamName = existingTeamResult.rows[0].team_name;
      }

      // Get all team members including lead
      const membersResult = await client.query(
        `SELECT u.user_id, u.name, u.email, r.registration_id,
                r.accommodation_id, a.accommodation, r.food_preference
         FROM team_registrations tr
         JOIN registrations r ON tr.registration_id = r.registration_id
         JOIN users u ON r.student_id = u.user_id
         LEFT JOIN accommodations a ON r.accommodation_id = a.accommodation_id
         WHERE tr.team_id = $1
         ORDER BY CASE WHEN u.user_id = $2 THEN 0 ELSE 1 END, r.timestamp`,
        [teamId, userId]
      );

      allMembersData = membersResult.rows;
      const otherMembers = allMembersData.filter(m => m.user_id !== userId);

      teamData = {
        teamId,
        teamCode,
        teamName,
        teamLead: {
          id: userId,
          name: payment.user_name
        },
        teamMembers: otherMembers.map(m => ({ id: m.user_id, name: m.name })),
        currentMembers: allMembersData.length,
        maxMembers: payment.max_team_size
      };
    }

    await client.query("COMMIT");

    // Prepare event details
    const eventDetails = {
      event_name: payment.event_name,
      venue: payment.venue,
      event_start_time: payment.event_start_time,
      event_end_time: payment.event_end_time,
      whatsapp_link: payment.whatsapp_link
    };

    // Send emails to all team members after successful payment
    if (isTeamEvent && teamData && allMembersData.length > 0) {
      // Send emails asynchronously
      for (const member of allMembersData) {
        const isLead = member.user_id === userId;
        
        const memberRegistrationData = {
          registrationId: member.registration_id,
          eventName: payment.event_name,
          eventType: 'team' as const,
          teamName: teamData.teamName,
          teamCode: teamData.teamCode,
          teamId: teamData.teamId,
          isTeamLead: isLead,
          teamLead: teamData.teamLead,
          teamMembers: teamData.teamMembers,
          currentMembers: teamData.currentMembers,
          maxMembers: teamData.maxMembers,
          feeAmount: payment.amount,
          paymentRequired: false,
          paymentStatus: true,
          accommodation: member.accommodation_id ? {
            id: member.accommodation_id,
            name: member.accommodation
          } : null,
          foodPreference: member.food_preference
        };

        sendRegistrationEmail(
          member.email,
          member.name,
          memberRegistrationData,
          eventDetails
        ).catch(error => {
          console.error(`Failed to send email to ${member.email}:`, error);
        });
      }
    } else {
      // Send email for solo event
      const regDetailsResult = await client.query(
        `SELECT r.accommodation_id, a.accommodation, r.food_preference
         FROM registrations r
         LEFT JOIN accommodations a ON r.accommodation_id = a.accommodation_id
         WHERE r.registration_id = $1`,
        [payment.registration_id]
      );

      const regDetails = regDetailsResult.rows[0];

      const soloRegistrationData = {
        registrationId: payment.registration_id,
        eventName: payment.event_name,
        eventType: 'solo' as const,
        feeAmount: payment.amount,
        paymentRequired: false,
        paymentStatus: true,
        accommodation: regDetails.accommodation_id ? {
          id: regDetails.accommodation_id,
          name: regDetails.accommodation
        } : null,
        foodPreference: regDetails.food_preference
      };

      sendRegistrationEmail(
        payment.user_email,
        payment.user_name,
        soloRegistrationData,
        eventDetails
      ).catch(error => {
        console.error(`Failed to send email to ${payment.user_email}:`, error);
      });
    }

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      data: {
        registrationId: payment.registration_id,
        eventName: payment.event_name,
        amount: payment.amount,
        paymentId: razorpay_payment_id,
        ...(teamData && { team: teamData })
      }
    });

  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("Payment verification error:", error);
    
    return res.status(500).json({
      success: false,
      message: "Failed to verify payment",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  } finally {
    client.release();
  }
};

// Helper function to send registration email
async function sendRegistrationEmail(
  userEmail: string,
  userName: string,
  registrationData: any,
  eventDetails: any
) {
  try {
    const emailDataBase = {
      userName,
      userEmail,
      eventName: registrationData.eventName || eventDetails.event_name,
      eventVenue: eventDetails.venue,
      registrationId: registrationData.registrationId,
      eventType: registrationData.eventType,
      teamName: registrationData.teamName,
      teamCode: registrationData.teamCode,
      isTeamLead: registrationData.isTeamLead,
      teamMembers: registrationData.teamMembers,
      currentMembers: registrationData.currentMembers,
      maxMembers: registrationData.maxMembers,
      feeAmount: registrationData.feeAmount,
      paymentRequired: false,
      accommodation: registrationData.accommodation,
      foodPreference: registrationData.foodPreference,
      whatsappLink: eventDetails.whatsapp_link
    };

    const emailData = {
      ...emailDataBase,
      ...(eventDetails.event_start_time && { eventStartDate: formatDate(new Date(eventDetails.event_start_time)) }),
      ...(eventDetails.event_start_time && { eventStartTime: formatTime(new Date(eventDetails.event_start_time)) }),
      ...(eventDetails.event_end_time && { eventEndDate: formatDate(new Date(eventDetails.event_end_time)) }),
      ...(eventDetails.event_end_time && { eventEndTime: formatTime(new Date(eventDetails.event_end_time)) })
    };

    const emailTemplate = getRegistrationConfirmationTemplate(emailData);

    await sendEmail({
      to: userEmail,
      subject: `Registration Confirmed - ${registrationData.eventName || eventDetails.event_name}`,
      html: emailTemplate.html,
      text: emailTemplate.text
    });

    console.log(`✅ Registration confirmation email sent to ${userEmail}`);
  } catch (error) {
    console.error("Error sending registration email:", error);
    throw error;
  }
}

export const getPaymentStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.user_id;
    const { registrationId } = req.params;

    if (!userId || !registrationId) {
      return res.status(400).json({
        success: false,
        message: "User ID and Registration ID are required"
      });
    }

    const result = await pool.query(
      `SELECT r.registration_id, r.payment_status, r.timestamp,
              e.event_name, e.fee_amount,
              p.payment_id, p.razorpay_order_id, p.razorpay_payment_id, 
              p.amount, p.status, p.created_at, p.updated_at
       FROM registrations r
       JOIN events e ON r.event_id = e.event_id
       LEFT JOIN payments p ON r.registration_id = p.registration_id
       WHERE r.registration_id = $1 AND r.student_id = $2`,
      [registrationId, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Registration not found"
      });
    }

    const record = result.rows[0];
    const feeAmount = parseFloat(record.fee_amount);

    return res.status(200).json({
      success: true,
      data: {
        registrationId,
        eventName: record.event_name,
        feeAmount,
        paymentRequired: feeAmount > 0,
        paymentStatus: record.payment_status || false,
        paymentDetails: record.payment_id ? {
          paymentId: record.payment_id,
          razorpayOrderId: record.razorpay_order_id,
          razorpayPaymentId: record.razorpay_payment_id,
          amount: record.amount,
          status: record.status,
          createdAt: record.created_at,
          updatedAt: record.updated_at
        } : null
      }
    });

  } catch (error: any) {
    console.error("Get payment status error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get payment status",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};