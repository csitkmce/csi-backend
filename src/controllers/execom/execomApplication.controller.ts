import { type Response } from "express";
import { pool } from "../../config/db.js";
import type { AuthenticatedRequest } from "../../middleware/auth.middle.js";
import { sendEmail, getExecomApplicationConfirmationTemplate } from "../../config/email.js";

const VALID_POSITIONS = [
  "Program Coordinator",
  "Documentation",
  "Media team",
  "Publicity",
  "Tech team",
  "Volunteer",
  "Design team",
] as const;

type ExecomPosition = (typeof VALID_POSITIONS)[number];

/**
 * POST /api/execom/application
 * Submit execom position preferences + answer.
 * Creates a registration entry for the execom event so it appears
 * on the user's home dashboard like any other registered event.
 * Body: { eventId: string, preference1: string, preference2: string, preference3?: string, answer: string }
 */
export const submitExecomApplication = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const client = await pool.connect();

  try {
    const userId = req.user?.user_id;
    const userName = req.user?.name;
    const userEmail = req.user?.email;

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "User ID missing from token" });
    }

    const { eventId, preference1, preference2, preference3, answer } = req.body;

    // Validate mandatory fields
    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: "Event ID is required",
      });
    }

    if (!preference1 || !preference2) {
      return res.status(400).json({
        success: false,
        message: "Preference 1 and Preference 2 are required",
      });
    }

    if (!answer || !answer.trim()) {
      return res.status(400).json({
        success: false,
        message: "Answer is required",
      });
    }

    // Collect provided preferences for validation
    const preferences = [preference1, preference2];
    if (preference3) preferences.push(preference3);

    // Validate all preferences are from the allowed list
    for (const pref of preferences) {
      if (!VALID_POSITIONS.includes(pref as ExecomPosition)) {
        return res.status(400).json({
          success: false,
          message: `Invalid preference: "${pref}". Allowed positions: ${VALID_POSITIONS.join(", ")}`,
        });
      }
    }

    // Validate all provided preferences are unique
    const uniquePrefs = new Set(preferences);
    if (uniquePrefs.size !== preferences.length) {
      return res.status(400).json({
        success: false,
        message: "All preferences must be different",
      });
    }

    await client.query("BEGIN");

    // Check if user already has an execom application
    const existingApp = await client.query(
      `SELECT ea.application_id, ea.registration_id
       FROM execom_applications ea
       WHERE ea.user_id = $1`,
      [userId]
    );

    if (existingApp.rowCount && existingApp.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "You have already submitted an application",
      });
    }

    // Verify the event exists and is active
    const eventResult = await client.query(
      `SELECT event_id, event_name, status FROM events WHERE event_id = $1`,
      [eventId]
    );

    if (eventResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    const event = eventResult.rows[0];

    if (event.status !== "active") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Applications are currently closed",
      });
    }

    // Check if user is already registered for this event
    const existingReg = await client.query(
      `SELECT registration_id FROM registrations
       WHERE student_id = $1 AND event_id = $2`,
      [userId, eventId]
    );

    if (existingReg.rowCount && existingReg.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "You are already registered for this event",
      });
    }

    // Create registration entry (free event, payment_status = true)
    const regResult = await client.query(
      `INSERT INTO registrations (student_id, event_id, payment_status)
       VALUES ($1, $2, true)
       RETURNING registration_id, timestamp`,
      [userId, eventId]
    );

    const registrationId = regResult.rows[0].registration_id;

    // Create the execom application linked to the registration
    const appResult = await client.query(
      `INSERT INTO execom_applications (user_id, registration_id, preference1, preference2, preference3, answer)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING application_id, preference1, preference2, preference3, answer, created_at`,
      [userId, registrationId, preference1, preference2, preference3 || null, answer.trim()]
    );

    await client.query("COMMIT");

    const application = appResult.rows[0];

    // Send confirmation email
    if (userEmail) {
      const emailTemplate = getExecomApplicationConfirmationTemplate({
        userName: userName || "Applicant",
        userEmail,
        preference1,
        preference2,
        preference3: preference3 || null,
        registrationId,
      });

      sendEmail({
        to: userEmail,
        subject: "Application Received – CSI TKMCE Execom Recruitment",
        html: emailTemplate.html,
        text: emailTemplate.text,
      }).catch((error) => {
        console.error("Failed to send execom application email:", error);
      });
    }

    return res.status(201).json({
      success: true,
      message: "Application submitted successfully",
      application: {
        ...application,
        registrationId,
      },
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("Error submitting execom application:", error);

    if (error.code === "23505") {
      return res.status(400).json({
        success: false,
        message: "You have already submitted an application",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  } finally {
    client.release();
  }
};

/**
 * GET /api/execom/application
 * Retrieve the current user's execom position application.
 */
export const getExecomApplication = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "User ID missing from token" });
    }

    const result = await pool.query(
      `SELECT ea.application_id, ea.preference1, ea.preference2, ea.preference3,
              ea.answer, ea.registration_id, ea.created_at, ea.updated_at
       FROM execom_applications ea
       WHERE ea.user_id = $1`,
      [userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "No application found",
      });
    }

    return res.status(200).json({
      success: true,
      application: result.rows[0],
    });
  } catch (error) {
    console.error("Error fetching execom application:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
