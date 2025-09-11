import { type Request, type Response } from "express";
import { pool } from "../../config/db.js";
import {
  formatDate,
  formatTime,
  calculateDayDiff,
} from "../../utils/dateUtils.js";
import type { AuthenticatedRequest } from "../../middleware/auth.middle.js";
import { verifyAccessToken } from "../../utils/jwt.js";

export const getEvents = async (req: Request, res: Response) => {
  try {
    const loggedIn = req.query.loggedin === "true";
    let userId: string | null = null;

    if (loggedIn) {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: "Authorization header missing" });
      }

      const parts = authHeader.split(" ");
      if (parts.length !== 2 || !parts[1]) {
        return res
          .status(401)
          .json({ error: "Malformed authorization header" });
      }

      const token = parts[1];
      try {
        const payload = verifyAccessToken(token) as any;
        userId = payload.user_id;
      } catch (err) {
        return res.status(401).json({ error: "Invalid or expired token" });
      }
    }

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

    let userRegistrations = new Set<string>();

    if (loggedIn && userId) {
      const { rows: regRows } = await pool.query(
        `
        SELECT event_id
        FROM registrations
        WHERE user_id = $1
        UNION
        SELECT t.event_id
        FROM teams t
        JOIN team_members tm ON t.team_id = tm.team_id
        WHERE tm.user_id = $1
        `,
        [userId]
      );

      userRegistrations = new Set(regRows.map((r) => r.event_id));
    }

    for (const event of rows) {
      if (event.status !== "active") continue;

      const start = new Date(event.event_start_time);
      const end = new Date(event.event_end_time);
      const regStart = new Date(event.reg_start_time);
      const regEnd = new Date(event.reg_end_time);

      const currentRegs = Number(event.registrations_count) || 0;
      const maxRegs = Number(event.max_registrations) || 0;

      const regOpen = now >= regStart && now <= regEnd;
      const isRegistrationFull = maxRegs > 0 && currentRegs >= maxRegs;

      const registered =
        loggedIn && userId ? userRegistrations.has(event.event_id) : false;

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
        registered,
      };

      if (now < start) upcoming.push(eventData);
      else if (now >= start && now <= end) ongoing.push(eventData);
      else past.push(eventData);
    }

    res.json({ upcoming, ongoing, past });
  } catch (error: any) {
    console.error("Error fetching events:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getEventDetails = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  console.log('--- getEventDetails called ---');
  console.log('req.params:', req.params);
  console.log('req.user:', req.user);

  const eventId = req.params.eventId;
  console.log('eventId from params:', eventId);

  if (!eventId) {
    console.error('No eventId provided in URL params!');
    return res.status(400).json({ error: 'Event ID is required' });
  }

  try {
    const { rows: eventRows } = await pool.query(
      `SELECT 
         event_id, event_name, event_description, event_image,
         venue, reg_start_time, reg_end_time,
         event_start_time, event_end_time,
         fee_amount, food, min_team_size, max_team_size,
         team_name_required, status, max_registrations,
         whatsapp_link
       FROM events
       WHERE event_id = $1 AND status = 'active'`,
      [eventId]
    );

    console.log('eventRows:', eventRows);

    if (eventRows.length === 0) {
      console.warn(`Event not found or inactive for ID: ${eventId}`);
      return res.status(404).json({ error: "Event not found or inactive" });
    }

    const event = eventRows[0];

    const userId = req.user?.user_id;
    console.log('userId from auth middleware:', userId);

    const { rows: userRows } = await pool.query(
      `
      SELECT u.name, u.email, d.department_name AS department, u.batch, u.year
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.department_id
      WHERE u.user_id = $1
      `,
      [userId]
    );

    console.log('userRows:', userRows);
    const userInfo = userRows[0] || null;

    // Build full event object
    const eventDetails = {
      id: event.event_id,
      name: event.event_name,
      description: event.event_description,
      image: event.event_image,
      venue: event.venue,
      regStart: event.reg_start_time,
      regEnd: event.reg_end_time,
      eventStart: event.event_start_time,
      eventEnd: event.event_end_time,
      fee: parseFloat(event.fee_amount),
      food: event.food,
      team: {
        min: event.min_team_size,
        max: event.max_team_size,
      },
      teamNameRequired: event.team_name_required,
      status: event.status,
      maxRegistrations: event.max_registrations,
      whatsappLink: event.whatsapp_link,
    };

    return res.json({
      event: eventDetails,
      user: userInfo,
    });
  } catch (error: any) {
    console.error("Error fetching event details:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};