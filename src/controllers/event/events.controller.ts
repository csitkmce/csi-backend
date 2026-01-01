import { type Request, type Response } from "express";
import { pool } from "../../config/db.js";
import {
  formatDate,
  formatTime,
  calculateDayDiff,
  getCurrentISTTime,
  toISTString,
} from "../../utils/dateUtils.js";
import type { AuthenticatedRequest } from "../../middleware/auth.middle.js";

export const getEvents = async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        e.*,
        (
          SELECT COUNT(DISTINCT r.registration_id)
          FROM registrations r
          WHERE r.event_id = e.event_id
        ) AS registrations_count
      FROM events e
      ORDER BY e.event_start_time DESC;
    `);

    const now = getCurrentISTTime();
    console.log(`Current IST time: ${toISTString(now)}`);

    const upcoming: any[] = [];
    const ongoing: any[] = [];
    const past: any[] = [];

    for (const event of rows) {
      if (event.status !== "active") continue;

      const start = new Date(event.event_start_time);
      const end = new Date(event.event_end_time);
      const regStart = new Date(event.reg_start_time);
      const regEnd = new Date(event.reg_end_time);

      const currentRegs = Number(event.registrations_count) || 0;
      const maxRegs = Number(event.max_registrations) || 0;

      const regOpen = now >= regStart && now <= regEnd;
      const regClosed = now > regEnd;

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
        regClosed,
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

      if (now < start) {
        upcoming.push(eventData);
      } else if (now >= start && now <= end) {
        ongoing.push(eventData);
      } else {
        past.push(eventData);
      }
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
  const eventId = req.params.eventId;

  if (!eventId) {
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

    if (eventRows.length === 0) {
      console.warn(`Event not found or inactive for ID: ${eventId}`);
      return res.status(404).json({ error: "Event not found or inactive" });
    }

    const event = eventRows[0];

    let isRegistered = false;
    if (req.isLoggedIn && req.user) {
      const { rows: registrationRows } = await pool.query(
        `SELECT 1 FROM registrations 
         WHERE student_id = $1 AND event_id = $2`,
        [req.user.user_id, eventId]
      );

      isRegistered = registrationRows.length > 0;
    }

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
      whatsapp: event.whatsapp_link,
      isRegistered: isRegistered
    };

    if (req.isLoggedIn && req.user) {
      return res.json({
        event: eventDetails,
        user: req.user,
        isLoggedIn: true,
      });
    } else {
      return res.json({
        event: eventDetails,
        user: null,
        isLoggedIn: false,
      });
    }

  } catch (error: any) {
    console.error("Error fetching event details:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};


export const getProgramEvents = async (req: Request, res: Response) => {
  try {
    const { programName } = req.params;

    const { rows } = await pool.query(`
      SELECT
        DATE(e.event_start_time) AS event_date,
        json_agg(
          json_build_object(
            'event_id', e.event_id,
            'event_name', e.event_name,
            'description', e.event_description,
            'image', e.event_image,
            'start_time', e.event_start_time,
            'end_time', e.event_end_time,
            'venue', e.venue
          )
          ORDER BY e.event_start_time
        ) AS events
      FROM events e
      JOIN programs p ON p.program_id = e.program_id
      WHERE LOWER(p.program_name) = LOWER($1)
        AND p.status = 'active'
        AND e.status = 'active'
        AND e.event_start_time IS NOT NULL
      GROUP BY event_date
      ORDER BY event_date;
    `, [programName]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Program not found or inactive' });
    }

    const groupedEvents = rows.reduce((acc, row) => {
      acc[row.event_date] = row.events;
      return acc;
    }, {} as Record<string, any>);

    res.json(groupedEvents);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch program events' });
  }
};
