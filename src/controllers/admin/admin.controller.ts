import type { Request, Response } from "express";
import { pool } from "../../config/db.js";

export const getRegistrationDetails = async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT 
        r.registration_id,
        r.timestamp,
        r.event_id,
        e.event_name,
        e.event_description,
        e.venue,
        e.event_start_time,
        e.event_end_time,
        r.student_id,
        u.name AS student_name,
        u.email AS student_email,
        u.phone_number AS student_phone,
        u.department_id,
        u.batch,
        u.year,
        u.role,
        r.attendance_status,
        r.payment_status,
        r.food_preference,
        r.certificate,
        t.team_id,
        t.team_code,
        t.team_name,
        lead.name AS team_lead_name,
        lead.email AS team_lead_email,
        lead.phone_number AS team_lead_phone
      FROM team_registrations tr
      JOIN registrations r ON r.registration_id = tr.registration_id
      JOIN teams t ON tr.team_id = t.team_id
      JOIN users u ON r.student_id = u.user_id
      JOIN users lead ON t.team_lead_id = lead.user_id
      JOIN events e ON t.event_id = e.event_id
      ORDER BY r.timestamp DESC;
    `;

    const { rows } = await pool.query(query);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "No registrations found" });
    }

    res.json({ success: true, data: rows });
  } catch (err: any) {
    console.error("Error fetching registrations:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
};
