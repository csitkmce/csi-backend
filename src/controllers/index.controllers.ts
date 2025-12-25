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
    const userName = req.user?.name;  
    if (!userId) {
      return res.status(400).json({ message: "User ID missing from token" });
    }

    const userResult = await pool.query(
      `SELECT u.name, u.email, u.batch, u.year, d.department_name
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.department_id
       WHERE u.user_id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const userData = userResult.rows[0];
    const { name, email, batch, year, department_name } = userData;


    
    const { rows } = await pool.query(
      `SELECT e.event_id, e.event_name, e.event_description, e.event_image, e.venue,
              e.event_start_time, e.event_end_time, e.whatsapp_link,
              e.min_team_size, e.max_team_size,
              r.registration_id, r.certificate
       FROM registrations r
       JOIN events e ON r.event_id = e.event_id
       WHERE r.student_id = $1 
         AND e.status = 'active'
         AND r.payment_status = true
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
        certificate: event.certificate || null,
        registrationId: event.registration_id
      };

      if (event.max_team_size > 1) {
        const teamInfo = await pool.query(
          `SELECT t.team_id, t.team_name, t.team_code, t.team_lead_id,
                  lead.name as team_lead_name,
                  u.user_id, u.name
           FROM team_registrations tr
           JOIN teams t ON tr.team_id = t.team_id
           LEFT JOIN users lead ON t.team_lead_id = lead.user_id
           JOIN registrations r2 ON tr.registration_id = r2.registration_id
           JOIN users u ON r2.student_id = u.user_id
           WHERE t.team_id = (
             SELECT team_id
             FROM team_registrations
             WHERE registration_id = $1
             LIMIT 1
           )
           ORDER BY CASE WHEN t.team_lead_id = u.user_id THEN 0 ELSE 1 END`,
          [event.registration_id]
        );
        
        if ((teamInfo?.rowCount ?? 0) > 0) {
          const teamData = teamInfo.rows[0];
          const teamCode = teamData.team_code;
          const teamName = teamData.team_name;
          const teamLeadId = teamData.team_lead_id;
          const teamLeadName = teamData.team_lead_name;
          const members = teamInfo.rows
            .filter((m) => m.user_id !== teamLeadId)
            .map((m) => ({
              id: m.user_id,
              name: m.name,
            }));
          eventData.teamId = teamData.team_id;
          eventData.teamName = teamName;
          eventData.teamCode = teamCode;
          eventData.teamLead = {
            id: teamLeadId,
            name: teamLeadName
          };
          eventData.teamMembers = members;
          eventData.isTeamLead = teamLeadId === userId;
          eventData.currentMembers = teamInfo.rows.length;
        }
      } else {
        eventData.eventType = "solo";
      }
      events.push(eventData);
    }
    
    return res.json({ 
      name: name, 
      email: email,
      department: department_name,
      batch: batch.trim(), 
      graduationYear: year,
      events 
    });
  } catch (err) {
    console.error("Error in getHome:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export default getHome;

export const getUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.user_id;
    const userName = req.user?.name;
    const userEmail = req.user?.email;  
    if (!userId) {
      return res.status(400).json({ message: "User ID missing from token" });
    } 
    return res.json({ userId, userName, userEmail });
  } catch (err) {
    console.error("Error in getUser:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}