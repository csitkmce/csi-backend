import { type Response } from "express";
import { pool } from "../../config/db.js";
import type { AuthenticatedRequest } from "../../middleware/auth.middle.js";
import { sendEmail, getExecomApplicationConfirmationTemplate } from "../../config/email.js";

const VALID_POSITIONS = [
  "Program Coordinator",
  "Documentation Team",
  "Media Team",
  "Publicity Team",
  "Technical Team",
  "Design Team",
  "Operations Team"
] as const;

type ExecomPosition = (typeof VALID_POSITIONS)[number];

/**
 * POST /api/execom/application
 * Submit execom position preferences + answer.
 * Standalone — no connection with events or registrations.
 * Body: { preference1: string, preference2: string, preference3?: string, answer: string }
 */
export const submitExecomApplication = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.user_id;
    const userName = req.user?.name;
    const userEmail = req.user?.email;

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "User ID missing from token" });
    }

    // Fetch user's department_id to check eligibility
    const userResult = await pool.query(
      `SELECT department_id FROM users WHERE user_id = $1`,
      [userId]
    );

    if (userResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const departmentId = userResult.rows[0].department_id;
    const ELIGIBLE_DEPARTMENTS = [
      "5830cdf0-156d-4445-ac70-cac89d925a2c", // COMPUTER SCIENCE & ENGINEERING
      "c9c62a3b-a1ca-4f8c-9fad-de281706c448", // ELECTRICAL & COMPUTER ENGINEERING
      "dcfdd200-39e5-4769-8382-c5b208f854f9", // MASTER OF COMPUTER APPLICATIONS
    ];

    if (!ELIGIBLE_DEPARTMENTS.includes(departmentId)) {
      return res.status(400).json({
        success: false,
        message: "You are not eligible to apply. Only students from CS, ER, or MCA departments are eligible.",
      });
    }

    const { preference1, preference2, preference3, answer } = req.body;

    // Validate mandatory fields
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

    // Check application config (is it active? within time window?)
    const configResult = await pool.query(
      `SELECT is_active, start_time, end_time, whatsapp_link
       FROM execom_application_config
       WHERE config_id = 1`
    );

    if (configResult.rowCount === 0 || !configResult.rows[0].is_active) {
      return res.status(400).json({
        success: false,
        message: "Applications are currently closed",
      });
    }

    const config = configResult.rows[0];
    const now = new Date();

    if (config.start_time && now < new Date(config.start_time)) {
      return res.status(400).json({
        success: false,
        message: "Applications have not started yet",
      });
    }

    if (config.end_time && now > new Date(config.end_time)) {
      return res.status(400).json({
        success: false,
        message: "Applications have ended",
      });
    }

    // Check if user already has an execom application
    const existingApp = await pool.query(
      `SELECT application_id FROM execom_applications WHERE user_id = $1`,
      [userId]
    );

    if (existingApp.rowCount && existingApp.rowCount > 0) {
      return res.status(400).json({
        success: false,
        message: "You have already submitted an application",
      });
    }

    // Create the execom application
    const appResult = await pool.query(
      `INSERT INTO execom_applications (user_id, preference1, preference2, preference3, answer)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING application_id, preference1, preference2, preference3, answer, created_at`,
      [userId, preference1, preference2, preference3 || null, answer.trim()]
    );

    const application = appResult.rows[0];

    // Send confirmation email
    if (userEmail) {
      const emailTemplate = getExecomApplicationConfirmationTemplate({
        userName: userName || "Applicant",
        userEmail,
        preference1,
        preference2,
        preference3: preference3 || null,
        applicationId: application.application_id,
        whatsappLink: config.whatsapp_link || undefined,
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
      application,
      whatsappLink: config.whatsapp_link || null,
    });
  } catch (error: any) {
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
              ea.answer, ea.created_at, ea.updated_at
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

    // Fetch whatsapp link from config
    const configResult = await pool.query(
      `SELECT whatsapp_link FROM execom_application_config WHERE config_id = 1`
    );

    return res.status(200).json({
      success: true,
      application: result.rows[0],
      whatsappLink: configResult.rows[0]?.whatsapp_link || null,
    });
  } catch (error) {
    console.error("Error fetching execom application:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
