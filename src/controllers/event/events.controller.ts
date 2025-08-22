import { type Request, type Response } from "express";
import { pool } from "../../config/db.js";

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}
function calculateDayDiff(start: Date, end: Date): number {
  const startDate = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate()
  );
  const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  const diffMs = endDate.getTime() - startDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

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
        status: event.status,
        registrationsCount: currentRegs,
        maxRegistrations: maxRegs,
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
