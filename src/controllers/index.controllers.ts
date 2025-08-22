import { type Response } from "express";
import { pool } from "../config/db.js";
import type { AuthenticatedRequest } from "../middleware/auth.middle.js";
import {
  formatDate,
  formatTime,
  calculateDayDiff,
} from "../utils/dateUtils.js";

export const getHome = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.user_id;
    if (!userId)
      return res.status(400).json({ message: "User ID missing from token" });

    const userResult = await pool.query(
      `SELECT name FROM users WHERE user_id = $1`,
      [userId]
    );
    if (userResult.rowCount === 0)
      return res.status(404).json({ message: "User not found" });
    const userName = userResult.rows[0].name;

    const { rows } = await pool.query(
      `SELECT e.event_id, e.event_name, e.event_description, e.event_image, e.venue,
              e.event_start_time, e.event_end_time, e.whatsapp_link,
              e.min_team_size, e.max_team_size,
              r.registration_id
       FROM registrations r
       JOIN events e ON r.event_id = e.event_id
       WHERE r.student_id = $1
       ORDER BY e.event_start_time ASC;`,
      [userId]
    );

    const events = [];

    for (const event of rows) {
      const start = new Date(event.event_start_time);
      const end = new Date(event.event_end_time);

      const eventData: any = {
        id: event.event_id,
        name: event.event_name,
        description: event.event_description,
        image: event.event_image,
        venue: event.venue,
        eventStartDate: formatDate(start),
        eventStartTime: formatTime(start),
        eventEndDate: formatDate(end),
        eventEndTime: formatTime(end),
        durationDays: calculateDayDiff(start, end),
        whatsapp: event.whatsapp_link,
        team: {
          min: event.min_team_size,
          max: event.max_team_size,
        },
      };

      if (event.min_team_size > 1) {
        const teamMembers = await pool.query(
          `
          SELECT u.user_id, u.name
          FROM team_registrations tr
          JOIN registrations r2 ON tr.registration_id = r2.registration_id
          JOIN users u ON r2.student_id = u.user_id
          WHERE tr.team_id = (
            SELECT team_id
            FROM team_registrations
            WHERE registration_id = $1
            LIMIT 1
          )
          AND u.user_id != $2
          `,
          [event.registration_id, userId]
        );

        eventData.teamMembers = teamMembers.rows.map((m) => ({
          id: m.user_id,
          name: m.name,
        }));
      }

      events.push(eventData);
    }

    return res.json({ name: userName, events });
  } catch (err) {
    console.error("Error in getHome:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export default getHome;
