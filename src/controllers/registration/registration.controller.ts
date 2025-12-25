import { type Response } from "express";
import { pool } from "../../config/db.js";
import type { AuthenticatedRequest } from "../../middleware/auth.middle.js";
import { 
  validateEventAccess,
  checkExistingRegistration,
  handleRegistrationFlow,
  getCurrentRegistrationCount
} from "../../services/registration.service.js";
import { getCurrentISTTime, toISTString, formatDate, formatTime } from "../../utils/dateUtils.js";
import { sendEmail, getRegistrationConfirmationTemplate } from "../../config/email.js";

export const registerForEvent = async (req: AuthenticatedRequest, res: Response) => {
  console.log("registerForEvent called", { user: req.user, body: req.body });

  const client = await pool.connect();
  try {
    const userId = req.user?.user_id;
    const userName = req.user?.name;
    const userEmail = req.user?.email;
    const { eventId, teamName, accommodationId, foodPref } = req.body;

    console.log("Step 1: Validating input");
    if (!userId || !eventId) {
      console.log("❌ Missing userId or eventId");
      return res.status(400).json({ success: false, message: "User ID and Event ID are required" });
    }
    if (!userName || userName.trim() === "") {
      console.log("❌ Missing userName");
      return res.status(400).json({ success: false, message: "User name is required" });
    }

    // Validate accommodation if provided
    if (accommodationId) {
      const accommodationCheck = await client.query(
        'SELECT accommodation_id FROM accommodations WHERE accommodation_id = $1',
        [accommodationId]
      );
      if (accommodationCheck.rowCount === 0) {
        return res.status(400).json({ success: false, message: "Invalid accommodation selected" });
      }
    }

    console.log("Step 2: Starting transaction");
    await client.query("BEGIN");
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");

    console.log("Step 3: Validating event access");
    const event = await validateEventAccess(client, eventId);
    console.log("✅ Event validated", event);

    console.log("Step 4: Checking existing registration");
    const existingCheck = await checkExistingRegistration(client, userId, eventId);
    
    if (existingCheck.exists) {
      const existing = existingCheck.registration!;
      const feeAmount = parseFloat(existing.fee_amount);
      const isPaidEvent = feeAmount > 0;

      console.log("⚠️ Existing registration found", existing);

      // If already paid, don't allow re-registration
      if (existing.payment_status) {
        await client.query("ROLLBACK");
        return res.status(400).json({ 
          success: false, 
          message: "You are already registered for this event" 
        });
      }

      // If unpaid, return existing registration details
      await client.query("COMMIT");
      
      // Get accommodation details if exists
      let accommodationData = null;
      if (existing.accommodation_id) {
        const accommodationResult = await client.query(
          'SELECT accommodation_id, accommodation FROM accommodations WHERE accommodation_id = $1',
          [existing.accommodation_id]
        );
        if (accommodationResult.rowCount && accommodationResult.rowCount > 0) {
          accommodationData = {
            id: accommodationResult.rows[0].accommodation_id,
            name: accommodationResult.rows[0].accommodation
          };
        }
      }

      return res.status(200).json({
        success: true,
        message: "You have an existing unpaid registration. Please complete payment.",
        existingRegistration: true,
        data: {
          registrationId: existing.registration_id,
          eventName: event.event_name,
          eventType: event.max_team_size > 1 ? "team" : "solo",
          feeAmount: existing.fee_amount,
          paymentRequired: isPaidEvent,
          paymentStatus: false,
          timestamp: existing.timestamp,
          accommodation: accommodationData,
          foodPreference: existing.food_preference
        }
      });
    }

    console.log("✅ No existing registration found");

    if (event.max_registrations) {
      const isTeamEvent = event.max_team_size > 1;
      console.log(`Step 5: Counting current registrations for event ${eventId}`);
      const currentCount = await getCurrentRegistrationCount(client, eventId, isTeamEvent);
      console.log("Current registration count:", currentCount);

      if (currentCount >= event.max_registrations) {
        console.log("❌ Event registration is full");
        await client.query("ROLLBACK");
        return res.status(400).json({ success: false, message: "Event registration is full" });
      }
    }

    console.log("Step 6: Handling registration flow");
    const result = await handleRegistrationFlow(
      client, 
      userId, 
      userName.trim(), 
      eventId, 
      event, 
      teamName,
      accommodationId,
      foodPref
    );
    console.log("✅ Registration flow completed", result);

    // Get full event details for email
    const eventDetailsResult = await client.query(
      `SELECT event_name, venue, event_start_time, event_end_time, whatsapp_link
       FROM events WHERE event_id = $1`,
      [eventId]
    );
    const eventDetails = eventDetailsResult.rows[0];

    await client.query("COMMIT");
    console.log("✅ Transaction committed");

    // Send confirmation email for FREE events
    if (result.sendEmail && userEmail) {
      console.log("📧 Sending email for free event...");
      sendRegistrationEmail(userEmail, userName, result.data, eventDetails).catch(error => {
        console.error("Failed to send registration email:", error);
      });
    } else {
      console.log("📧 Email NOT sent - waiting for payment or no email flag");
    }

    return res.status(201).json(result);

  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("❌ Registration error:", error);

    if (error.code === "40001") {
      return res.status(409).json({ success: false, message: "Registration conflict. Please try again.", retryable: true });
    }

    if (error.code === "23505") {
      return res.status(400).json({ success: false, message: "Registration conflict occurred. Please try again." });
    }

    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }

    return res.status(500).json({
      success: false,
      message: "Registration failed due to server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  } finally {
    client.release();
    console.log("Step 7: Client released");
  }
};

export const joinTeam = async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  
  try {
    const userId = req.user?.user_id;
    const userName = req.user?.name;
    const userEmail = req.user?.email;
    const { eventId, teamCode, accommodationId, foodPref } = req.body;
    
    if (!userId || !teamCode || !eventId) {
      return res.status(400).json({ 
        success: false, 
        message: "User ID, Event ID, and Team Code are required" 
      });
    }

    // Validate accommodation if provided
    if (accommodationId) {
      const accommodationCheck = await client.query(
        'SELECT accommodation_id FROM accommodations WHERE accommodation_id = $1',
        [accommodationId]
      );
      if (accommodationCheck.rowCount === 0) {
        return res.status(400).json({ success: false, message: "Invalid accommodation selected" });
      }
    }

    const sanitizedTeamCode = teamCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(sanitizedTeamCode)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid team code format. Must be 6 alphanumeric characters." 
      });
    }

    await client.query("BEGIN");
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");

    const teamResult = await client.query(
      `SELECT t.team_id, t.team_name, t.team_code, t.team_lead_id, t.event_id,
              e.event_name, e.min_team_size, e.max_team_size, e.status,
              e.reg_start_time, e.reg_end_time, e.fee_amount, e.venue,
              e.event_start_time, e.event_end_time, e.whatsapp_link,
              lead.name as team_lead_name, lead.email as team_lead_email
       FROM teams t
       JOIN events e ON t.event_id = e.event_id
       LEFT JOIN users lead ON t.team_lead_id = lead.user_id
       WHERE t.team_code = $1 AND t.event_id = $2 FOR UPDATE OF t`,
      [sanitizedTeamCode, eventId]
    );

    if (teamResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ 
        success: false, 
        message: "Team not found with this code for the specified event" 
      });
    }

    const team = teamResult.rows[0];
    
    if (team.max_team_size === 1) {
      await client.query("ROLLBACK");
      return res.status(400).json({ 
        success: false, 
        message: "Cannot join team for solo events" 
      });
    }
    
    if (team.status !== "active") {
      await client.query("ROLLBACK");
      return res.status(400).json({ 
        success: false, 
        message: "Event is not active" 
      });
    }

    const now = getCurrentISTTime();
    
    if (team.reg_start_time) {
      const regStart = new Date(team.reg_start_time);
      if (now < regStart) {
        await client.query("ROLLBACK");
        return res.status(400).json({ 
          success: false, 
          message: "Registration has not started yet" 
        });
      }
    }
    
    if (team.reg_end_time) {
      const regEnd = new Date(team.reg_end_time);
      if (now > regEnd) {
        await client.query("ROLLBACK");
        return res.status(400).json({ 
          success: false, 
          message: "Registration has ended" 
        });
      }
    }

    // Check existing registration
    const existingCheck = await checkExistingRegistration(client, userId, team.event_id);
    
    if (existingCheck.exists) {
      await client.query("ROLLBACK");
      return res.status(400).json({ 
        success: false, 
        message: "You are already registered for this event" 
      });
    }

    if (team.team_lead_id === userId) {
      await client.query("ROLLBACK");
      return res.status(400).json({ 
        success: false, 
        message: "You cannot join your own team" 
      });
    }

    const memberCountResult = await client.query(
      `SELECT COUNT(*) as count 
       FROM team_registrations tr
       JOIN registrations r ON tr.registration_id = r.registration_id
       WHERE tr.team_id = $1`,
      [team.team_id]
    );

    const currentMembers = parseInt(memberCountResult.rows[0].count);
    
    if (currentMembers >= team.max_team_size) {
      await client.query("ROLLBACK");
      return res.status(400).json({ 
        success: false, 
        message: "Team is already full" 
      });
    }

    const feeAmount = parseFloat(team.fee_amount);
    const isFreeEvent = feeAmount <= 0;

    // Create registration - payment is handled by team lead, so set to true
    const regResult = await client.query(
      `INSERT INTO registrations (student_id, event_id, accommodation_id, food_preference, payment_status) 
       VALUES ($1, $2, $3, $4, $5) RETURNING registration_id, timestamp`,
      [userId, team.event_id, accommodationId || null, foodPref || 'No food', true]
    );
    
    const registrationId = regResult.rows[0].registration_id;
    const timestamp = regResult.rows[0].timestamp;

    await client.query(
      `INSERT INTO team_registrations (registration_id, team_id) 
       VALUES ($1, $2)`,
      [registrationId, team.team_id]
    );

    const teamMembersResult = await client.query(
      `SELECT u.user_id, u.name
       FROM team_registrations tr
       JOIN registrations r ON tr.registration_id = r.registration_id
       JOIN users u ON r.student_id = u.user_id
       JOIN teams t ON tr.team_id = t.team_id
       WHERE tr.team_id = $1 AND t.team_lead_id != u.user_id
       ORDER BY r.timestamp`,
      [team.team_id]
    );

    const teamMembers = teamMembersResult.rows.map((member) => ({
      id: member.user_id,
      name: member.name
    }));

    // Get accommodation details if provided
    let accommodationData = null;
    if (accommodationId) {
      const accommodationResult = await client.query(
        'SELECT accommodation_id, accommodation FROM accommodations WHERE accommodation_id = $1',
        [accommodationId]
      );
      if (accommodationResult.rowCount && accommodationResult.rowCount > 0) {
        accommodationData = {
          id: accommodationResult.rows[0].accommodation_id,
          name: accommodationResult.rows[0].accommodation
        };
      }
    }

    await client.query("COMMIT");
    
    const response = {
      success: true,
      message: "Successfully joined team",
      data: {
        registrationId,
        eventId: team.event_id,
        eventName: team.event_name,
        eventType: "team" as const,
        teamName: team.team_name,
        teamCode: team.team_code,
        teamId: team.team_id,
        teamLead: {
          id: team.team_lead_id,
          name: team.team_lead_name
        },
        isTeamLead: false,
        teamMembers,
        currentMembers: currentMembers + 1,
        maxMembers: team.max_team_size,
        minMembers: team.min_team_size,
        teamIsFull: (currentMembers + 1) >= team.max_team_size,
        feeAmount: team.fee_amount,
        paymentRequired: false, // Team lead already paid
        paymentStatus: true,
        timestamp: timestamp,
        accommodation: accommodationData
      }
    };

    // Send confirmation email to member who joined
    if (userEmail) {
      const eventDetails = {
        event_name: team.event_name,
        venue: team.venue,
        event_start_time: team.event_start_time,
        event_end_time: team.event_end_time,
        whatsapp_link: team.whatsapp_link
      };
      sendRegistrationEmail(userEmail, userName || 'User', response.data, eventDetails).catch(error => {
        console.error("Failed to send registration email:", error);
      });
    }

    return res.status(201).json(response);

  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("Join team error:", error);
    
    if (error.code === "40001") {
      return res.status(409).json({ 
        success: false, 
        message: "Join team conflict. Please try again.",
        retryable: true 
      });
    }
    
    if (error.code === "23505") {
      return res.status(400).json({ 
        success: false, 
        message: "Join team conflict occurred. Please try again." 
      });
    }

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    
    return res.status(500).json({
      success: false,
      message: "Failed to join team due to server error",
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
    const emailData = {
      userName,
      userEmail,
      eventName: registrationData.eventName || eventDetails.event_name,
      eventVenue: eventDetails.venue,
      ...(eventDetails.event_start_time && { eventStartDate: formatDate(new Date(eventDetails.event_start_time)) }),
      ...(eventDetails.event_start_time && { eventStartTime: formatTime(new Date(eventDetails.event_start_time)) }),
      ...(eventDetails.event_end_time && { eventEndDate: formatDate(new Date(eventDetails.event_end_time)) }),
      ...(eventDetails.event_end_time && { eventEndTime: formatTime(new Date(eventDetails.event_end_time)) }),
      registrationId: registrationData.registrationId,
      eventType: registrationData.eventType,
      teamName: registrationData.teamName,
      teamCode: registrationData.teamCode,
      isTeamLead: registrationData.isTeamLead,
      teamMembers: registrationData.teamMembers,
      currentMembers: registrationData.currentMembers,
      maxMembers: registrationData.maxMembers,
      minMembers: registrationData.minMembers,
      feeAmount: registrationData.feeAmount,
      paymentRequired: false, // Email only sent after payment, so always false here
      accommodation: registrationData.accommodation,
      foodPreference: registrationData.foodPreference,
      whatsappLink: eventDetails.whatsapp_link
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

export const getTeamByCode = async (req: AuthenticatedRequest, res: Response) => {
  const { teamCode } = req.params;

  if (!teamCode) {
    return res.status(400).json({
      success: false,
      message: "Team code is required"
    });
  }

  const client = await pool.connect();
  try {
    const sanitizedTeamCode = teamCode.trim().toUpperCase();

    const teamResult = await client.query(
      `SELECT t.team_id, t.team_name, t.team_code, t.team_lead_id,
              e.event_id, e.event_name, e.max_team_size, e.min_team_size,
              u.name AS team_lead_name
       FROM teams t
       JOIN events e ON t.event_id = e.event_id
       LEFT JOIN users u ON t.team_lead_id = u.user_id
       WHERE t.team_code = $1`,
      [sanitizedTeamCode]
    );

    if (teamResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Team not found"
      });
    }

    const team = teamResult.rows[0];

    const membersResult = await client.query(
      `SELECT u.user_id, u.name, u.email, r.timestamp
       FROM team_registrations tr
       JOIN registrations r ON tr.registration_id = r.registration_id
       JOIN users u ON r.student_id = u.user_id
       WHERE tr.team_id = $1
       ORDER BY r.timestamp`,
      [team.team_id]
    );

    return res.json({
      success: true,
      data: {
        teamId: team.team_id,
        teamName: team.team_name,
        teamCode: team.team_code,
        eventId: team.event_id,
        eventName: team.event_name,
        maxMembers: team.max_team_size,
        minMembers: team.min_team_size,
        teamLead: {
          id: team.team_lead_id,
          name: team.team_lead_name
        },
        members: membersResult.rows
      }
    });

  } catch (err: any) {
    console.error("Get team by code error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch team"
    });
  } finally {
    client.release();
  }
};

export const getRegistrationStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.user_id;
    const { eventId } = req.params;

    if (!userId || !eventId) {
      return res.status(400).json({ 
        success: false, 
        message: "User ID and Event ID are required" 
      });
    }

    const client = await pool.connect();
    
    try {
      const registrationResult = await client.query(
        `SELECT r.registration_id, r.timestamp, r.payment_status, r.attendance_status,
                r.accommodation_id, a.accommodation, e.event_name, e.max_team_size, 
                e.fee_amount, r.food_preference
         FROM registrations r
         JOIN events e ON r.event_id = e.event_id
         LEFT JOIN accommodations a ON r.accommodation_id = a.accommodation_id
         WHERE r.student_id = $1 AND r.event_id = $2`,
        [userId, eventId]
      );

      if (registrationResult.rowCount === 0) {
        return res.status(200).json({
          success: true,
          data: {
            isRegistered: false,
            registrationId: null
          }
        });
      }

      const registration = registrationResult.rows[0];
      const isTeamEvent = registration.max_team_size > 1;

      let teamInfo = null;
      if (isTeamEvent) {
        const teamResult = await client.query(
          `SELECT t.team_id, t.team_name, t.team_code, t.team_lead_id,
                  COUNT(tr.registration_id) as current_members,
                  e.max_team_size, e.min_team_size
           FROM team_registrations tr_user
           JOIN teams t ON tr_user.team_id = t.team_id
           JOIN events e ON t.event_id = e.event_id
           LEFT JOIN team_registrations tr ON t.team_id = tr.team_id
           WHERE tr_user.registration_id = $1
           GROUP BY t.team_id, t.team_name, t.team_code, t.team_lead_id, e.max_team_size, e.min_team_size`,
          [registration.registration_id]
        );

        if ((teamResult.rowCount ?? 0) > 0) {
          const team = teamResult.rows[0];
          teamInfo = {
            teamId: team.team_id,
            teamName: team.team_name,
            teamCode: team.team_code,
            isTeamLead: team.team_lead_id === userId,
            currentMembers: parseInt(team.current_members),
            maxMembers: team.max_team_size,
            minMembers: team.min_team_size,
            teamIsFull: parseInt(team.current_members) >= team.max_team_size
          };
        }
      }

      const accommodationData = registration.accommodation_id ? {
        id: registration.accommodation_id,
        name: registration.accommodation
      } : null;

      return res.status(200).json({
        success: true,
        data: {
          isRegistered: true,
          registrationId: registration.registration_id,
          eventName: registration.event_name,
          eventType: isTeamEvent ? "team" : "solo",
          timestamp: registration.timestamp,
          paymentStatus: registration.payment_status,
          attendanceStatus: registration.attendance_status,
          feeAmount: registration.fee_amount,
          paymentRequired: parseFloat(registration.fee_amount) > 0 && !registration.payment_status,
          accommodation: accommodationData,
          foodPreference: registration.food_preference,
          teamInfo
        }
      });

    } finally {
      client.release();
    }

  } catch (error: any) {
    console.error("Get registration status error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get registration status",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};