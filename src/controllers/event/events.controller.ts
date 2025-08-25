import { type Request, type Response } from "express";
import { pool } from "../../config/db.js";
import { formatDate, formatTime, calculateDayDiff } from "../../utils/dateUtils.js";
import type { AuthenticatedRequest } from "../../middleware/auth.middle.js";


export const getEvents = async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`
     SELECT 
      e.*,
      CASE 
        WHEN e.max_team_size = 1 THEN (
          SELECT COUNT(DISTINCT r.registration_id)
          FROM registrations r
          WHERE r.event_id = e.event_id
        )
        ELSE (
          SELECT COUNT(DISTINCT t.team_id)
          FROM teams t
          WHERE t.event_id = e.event_id
        )
      END AS registrations_count
    FROM events e
    ORDER BY e.event_start_time ASC;
    `);

    const now = new Date();
    const upcoming: any[] = [];
    const ongoing: any[] = [];
    const past: any[] = [];

    rows.forEach((event) => {
      if (event.status !== "active") return;

      const start = new Date(event.event_start_time);
      const end = new Date(event.event_end_time);
      const regStart = new Date(event.reg_start_time);
      const regEnd = new Date(event.reg_end_time);

      const currentRegs = Number(event.registrations_count) || 0;
      const maxRegs = Number(event.max_registrations) || 0;

      const regOpen = now >= regStart && now <= regEnd;
      const isRegistrationFull = maxRegs > 0 && currentRegs >= maxRegs;

      const durationDays = calculateDayDiff(start, end);

      const eventData = {
        id: event.event_id,
        name: event.event_name,
        description: event.event_description,
        image: event.event_image,
        venue: event.venue,

        eventStartDate: formatDate(start),
        eventStartTime: formatTime(start),
        eventEndDate: formatDate(end),
        eventEndTime: formatTime(end),

        regOpen,
        isRegistrationFull,
        regStartDate: formatDate(regStart),
        regStartTime: formatTime(regStart),
        regEndDate: formatDate(regEnd),
        regEndTime: formatTime(regEnd),

        durationDays,
        fee: event.fee_amount,
        whatsapp: event.whatsapp_link,
        food: event.food,
        team: {
          min: event.min_team_size,
          max: event.max_team_size,
        },
      };

      // Categorization
      if (now < start) {
        upcoming.push(eventData);
      } else if (now >= start && now <= end) {
        ongoing.push(eventData);
      } else {
        past.push(eventData);
      }
    });

    res.json({ upcoming, ongoing, past });
  } catch (error: any) {
    console.error("Error fetching events:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getEventDetails = async (req: AuthenticatedRequest, res: Response) => {
  const eventId = req.params.eventId;

  try {
    const { rows: eventRows } = await pool.query(
      `SELECT event_id, event_name, event_description, event_image
       FROM events
       WHERE event_id = $1 AND status = 'active'`,
      [eventId]
    );

    if (eventRows.length === 0) {
      return res.status(404).json({ error: "Event not found or inactive" });
    }

    const event = eventRows[0];

    const userId = req.user?.user_id;
    const { rows: userRows } = await pool.query(
      `
      SELECT u.name, u.email, d.department_name AS department, u.batch, u.year
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.department_id
      WHERE u.user_id = $1
      `,
      [userId]
    );

    const userInfo = userRows[0] || null;

    return res.json({
      event: {
        name: event.event_name,
        description: event.event_description,
        image: event.event_image,
      },
      user: userInfo,
    });
  } catch (error: any) {
    console.error("Error fetching event details:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
};