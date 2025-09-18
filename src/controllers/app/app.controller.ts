import type { Request, Response } from "express";
import { pool } from "../../config/db.js";

export const getAttendanceDetails = async (req: Request, res: Response) => {
  try {
    const { regId } = req.body;

    if (!regId) {
      return res.status(400).json({ error: "regId is required" });
    }

const result = await pool.query(
  `SELECT 
     u.user_id,
     u.name,
     u.email,
     u.phone_number,
     d.department_name,
     t.team_name,
     r.food_preference,
     r.attendance_status,
     e.event_name
   FROM registrations r
   LEFT JOIN users u ON r.student_id = u.user_id
   LEFT JOIN departments d ON u.department_id = d.department_id
   LEFT JOIN team_registrations tr ON r.registration_id = tr.registration_id
   LEFT JOIN teams t ON tr.team_id = t.team_id
   LEFT JOIN events e ON r.event_id = e.event_id
   WHERE r.registration_id = $1`,
  [regId]
);


    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = result.rows[0];

    // Map DB values to desired response
    const response = {
      id: user.user_id,
      name: user.name,
      team: user.team_name ?? null,
      food: user.food_preference ?? null,
      event: user.event_name ?? null,
      email: user.email,
      phone: user.phone_number,
      department: user.department_name,
      present: user.attendance_status === 'present' ? true : false,
    };

    res.json(response);
  } catch (error) {
    console.error("Error fetching attendance:", error);
    res.status(500).json({ error: "Server error" });
  }
};

export const markAttendancePresent = async (req: Request, res: Response) => {
  try {
    const { regId } = req.body;

    if (!regId) {
      return res.status(400).json({ error: "regId is required" });
    }

    const result = await pool.query(
      `UPDATE registrations
       SET attendance_status = 'present'
       WHERE registration_id = $1`,
      [regId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Registration not found" });
    }

    // Only send success back
    res.json({ success: true });
  } catch (error) {
    console.error("Error marking attendance:", error);
    res.status(500).json({ error: "Server error" });
  }
};