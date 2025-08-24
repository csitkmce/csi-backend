import { type Response } from "express";
import { pool } from "../../config/db.js";
import type { AuthenticatedRequest } from "../../middleware/auth.middle.js";

export const registerForEvent = async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();

  try {
    const userId = req.user?.user_id;
    const userName = req.user?.name;
    const { eventId, teamName } = req.body;

    if (!userId || !eventId) {
      return res.status(400).json({ 
        success: false, 
        message: "User ID and Event ID are required" 
      });
    }

    if (!userName || userName.trim() === "") {
      return res.status(400).json({ 
        success: false, 
        message: "User name is required" 
      });
    }

    await client.query("BEGIN");
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");

    const eventResult = await client.query(
      `SELECT event_id, event_name, min_team_size, max_team_size, status,
              reg_start_time, reg_end_time, max_registrations, fee_amount, team_name_required
       FROM events WHERE event_id = $1 FOR UPDATE`,
      [eventId]
    );

    if (eventResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ 
        success: false, 
        message: "Event not found" 
      });
    }

    const event = eventResult.rows[0];

    if (event.min_team_size < 1 || event.max_team_size < 1 || event.min_team_size > event.max_team_size) {
      await client.query("ROLLBACK");
      return res.status(400).json({ 
        success: false, 
        message: "Invalid event configuration" 
      });
    }

    if (event.status !== "active") {
      await client.query("ROLLBACK");
      return res.status(400).json({ 
        success: false, 
        message: "Event is not active" 
      });
    }

    const now = new Date();
    if (event.reg_start_time && now < new Date(event.reg_start_time)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ 
        success: false, 
        message: "Registration has not started yet" 
      });
    }
    if (event.reg_end_time && now > new Date(event.reg_end_time)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ 
        success: false, 
        message: "Registration has ended" 
      });
    }

    const existingReg = await client.query(
      `SELECT registration_id FROM registrations 
       WHERE student_id = $1 AND event_id = $2 FOR UPDATE`,
      [userId, eventId]
    );
    
    if ((existingReg.rowCount ?? 0) > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ 
        success: false, 
        message: "You are already registered for this event" 
      });
    }

    const isSoloEvent = event.max_team_size === 1;
    const isTeamEvent = event.max_team_size > 1;

    if (event.max_registrations) {
      const currentCount = await getCurrentRegistrationCount(client, eventId, isTeamEvent);
      if (currentCount >= event.max_registrations) {
        await client.query("ROLLBACK");
        return res.status(400).json({ 
          success: false, 
          message: "Event registration is full" 
        });
      }
    }

    if (isSoloEvent) {
      return await handleSoloEventRegistration(client, userId, eventId, event, res);
    }

    if (isTeamEvent) {
      return await handleTeamEventRegistration(
        client, 
        userId, 
        userName.trim(), 
        eventId, 
        event, 
        teamName, 
        res
      );
    }

    await client.query("ROLLBACK");
    return res.status(500).json({ 
      success: false, 
      message: "Unexpected error in event type determination" 
    });

  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("Registration error:", error);

    if (error.code === "40001") {
      return res.status(409).json({ 
        success: false, 
        message: "Registration conflict. Please try again.",
        retryable: true 
      });
    }

    if (error.code === "23505") {
      return res.status(400).json({ 
        success: false, 
        message: "Registration conflict occurred. Please try again." 
      });
    }

    return res.status(500).json({
      success: false,
      message: "Registration failed due to server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  } finally {
    client.release();
  }
};

// Helper function to get current registration count
async function getCurrentRegistrationCount(client: any, eventId: string, isTeamEvent: boolean): Promise<number> {
  let countQuery: string;
  
  if (isTeamEvent) {
    countQuery = `SELECT COUNT(DISTINCT t.team_id) as count
                 FROM team_registrations tr
                 JOIN teams t ON tr.team_id = t.team_id
                 WHERE t.event_id = $1
                 FOR UPDATE OF t`;
  } else {
    countQuery = `SELECT COUNT(*) as count 
                 FROM registrations r
                 WHERE r.event_id = $1
                 FOR UPDATE OF r`;
  }

  const countResult = await client.query(countQuery, [eventId]);
  return parseInt(countResult.rows[0].count);
}

async function handleSoloEventRegistration(
  client: any, 
  userId: string, 
  eventId: string, 
  event: any, 
  res: Response
) {
  const regResult = await client.query(
    `INSERT INTO registrations (student_id, event_id)
     VALUES ($1, $2) RETURNING registration_id, timestamp`,
    [userId, eventId]
  );
  
  await client.query("COMMIT");
  
  return res.status(201).json({
    success: true,
    message: "Successfully registered for solo event",
    data: {
      registrationId: regResult.rows[0].registration_id,
      eventName: event.event_name,
      eventType: "solo",
      feeAmount: event.fee_amount,
      paymentRequired: parseFloat(event.fee_amount) > 0,
      timestamp: regResult.rows[0].timestamp
    }
  });
}

// Handle team event registration
async function handleTeamEventRegistration(
  client: any,
  userId: string,
  userName: string,
  eventId: string,
  event: any,
  teamName: string | undefined,
  res: Response
) {
  let finalTeamName: string;

  if (event.team_name_required) {
    if (!teamName || teamName.trim() === "") {
      await client.query("ROLLBACK");
      return res.status(400).json({ 
        success: false, 
        message: "Team name is required for this event" 
      });
    }
    
    const trimmedName = teamName.trim();
    
    if (trimmedName.length < 1 || trimmedName.length > 100) {
      await client.query("ROLLBACK");
      return res.status(400).json({ 
        success: false, 
        message: "Team name must be between 1 and 100 characters" 
      });
    }

    if (!/^[\w\s\-_()]+$/.test(trimmedName)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ 
        success: false, 
        message: "Team name contains invalid characters" 
      });
    }

    const nameCheck = await client.query(
      `SELECT 1 FROM teams 
       WHERE event_id = $1 AND LOWER(team_name) = LOWER($2) 
       FOR UPDATE`,
      [eventId, trimmedName]
    );
    
    if ((nameCheck.rowCount ?? 0) > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ 
        success: false, 
        message: "Team name already exists. Please choose a different name." 
      });
    }
    
    finalTeamName = trimmedName;
  } else {
    finalTeamName = await generateUniqueTeamName(client, eventId, userName);
  }

  const regResult = await client.query(
    `INSERT INTO registrations (student_id, event_id)
     VALUES ($1, $2) RETURNING registration_id, timestamp`,
    [userId, eventId]
  );
  
  const registrationId = regResult.rows[0].registration_id;
  const timestamp = regResult.rows[0].timestamp;

  const teamResult = await client.query(
    `INSERT INTO teams (team_name, team_lead_id, event_id, team_code)
     VALUES ($1, $2, $3, NULL) RETURNING team_id, team_code`,
    [finalTeamName, userId, eventId]
  );
  
  const teamId = teamResult.rows[0].team_id;
  const teamCode = teamResult.rows[0].team_code;

  await client.query(
    `INSERT INTO team_registrations (registration_id, team_id) 
     VALUES ($1, $2)`,
    [registrationId, teamId]
  );

  await client.query("COMMIT");
  
  return res.status(201).json({
    success: true,
    message: "Successfully registered and team created",
    data: {
      registrationId,
      eventName: event.event_name,
      eventType: "team",
      teamName: finalTeamName,
      teamId,
      teamCode,
      isTeamLead: true,
      currentMembers: 1,
      maxMembers: event.max_team_size,
      minMembers: event.min_team_size,
      canInviteMembers: true,
      feeAmount: event.fee_amount,
      paymentRequired: parseFloat(event.fee_amount) > 0,
      timestamp: timestamp
    }
  });
}

// Generate unique team name for auto-assignment
async function generateUniqueTeamName(client: any, eventId: string, baseName: string): Promise<string> {
  const result = await client.query(`
    WITH existing_names AS (
      SELECT team_name
      FROM teams 
      WHERE event_id = $1 
        AND (LOWER(team_name) = LOWER($2) 
             OR LOWER(team_name) ~ ('^' || LOWER($2) || ' \\([0-9]+\\)$'))
      FOR UPDATE
    ),
    max_suffix AS (
      SELECT COALESCE(
        MAX(
          CASE 
            WHEN team_name ~ (LOWER($2) || ' \\(([0-9]+)\\)$')
            THEN (regexp_match(team_name, '\\(([0-9]+)\\)$'))[1]::int
            ELSE 0
          END
        ), 0
      ) as max_num
      FROM existing_names
    )
    SELECT 
      CASE 
        WHEN max_num = 0 AND NOT EXISTS (
          SELECT 1 FROM existing_names WHERE LOWER(team_name) = LOWER($2)
        ) THEN $2
        ELSE $2 || ' (' || (max_num + 1) || ')'
      END as unique_name
    FROM max_suffix
  `, [eventId, baseName]);

  return result.rows[0].unique_name;
}

// JoinTeam function 
export const joinTeam = async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  
  try {
    const userId = req.user?.user_id;
    const { eventId, teamCode } = req.body;
    
    if (!userId || !teamCode || !eventId) {
      return res.status(400).json({ 
        success: false, 
        message: "User ID, Event ID, and Team Code are required" 
      });
    }

    const sanitizedTeamCode = teamCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(sanitizedTeamCode)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid team code format. Must be 6 alphanumeric characters." 
      });
    }

    await client.query("BEGIN");
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");

    const teamResult = await client.query(
      `SELECT t.team_id, t.team_name, t.team_code, t.team_lead_id, t.event_id,
              e.event_name, e.min_team_size, e.max_team_size, e.status,
              e.reg_start_time, e.reg_end_time, e.fee_amount,
              lead.name as team_lead_name
       FROM teams t
       JOIN events e ON t.event_id = e.event_id
       LEFT JOIN users lead ON t.team_lead_id = lead.user_id
       WHERE t.team_code = $1 AND t.event_id = $2 FOR UPDATE OF t`,
      [sanitizedTeamCode, eventId]
    );

    if (teamResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ 
        success: false, 
        message: "Team not found with this code for the specified event" 
      });
    }

    const team = teamResult.rows[0];
    
    if (team.max_team_size === 1) {
      await client.query("ROLLBACK");
      return res.status(400).json({ 
        success: false, 
        message: "Cannot join team for solo events" 
      });
    }
    
    if (team.status !== "active") {
      await client.query("ROLLBACK");
      return res.status(400).json({ 
        success: false, 
        message: "Event is not active" 
      });
    }

    const now = new Date();
    if (team.reg_start_time && now < new Date(team.reg_start_time)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ 
        success: false, 
        message: "Registration has not started yet" 
      });
    }
    
    if (team.reg_end_time && now > new Date(team.reg_end_time)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ 
        success: false, 
        message: "Registration has ended" 
      });
    }

    const existingReg = await client.query(
      `SELECT registration_id FROM registrations 
       WHERE student_id = $1 AND event_id = $2 FOR UPDATE`,
      [userId, team.event_id]
    );
    
    if ((existingReg.rowCount ?? 0) > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ 
        success: false, 
        message: "You are already registered for this event" 
      });
    }

    if (team.team_lead_id === userId) {
      await client.query("ROLLBACK");
      return res.status(400).json({ 
        success: false, 
        message: "You cannot join your own team" 
      });
    }

    const memberCountResult = await client.query(
      `SELECT COUNT(*) as count 
       FROM team_registrations tr
       JOIN registrations r ON tr.registration_id = r.registration_id
       WHERE tr.team_id = $1 FOR UPDATE OF r`,
      [team.team_id]
    );
    
    const currentMembers = parseInt(memberCountResult.rows[0].count);
    
    if (currentMembers >= team.max_team_size) {
      await client.query("ROLLBACK");
      return res.status(400).json({ 
        success: false, 
        message: "Team is already full" 
      });
    }

    const regResult = await client.query(
      `INSERT INTO registrations (student_id, event_id) 
       VALUES ($1, $2) RETURNING registration_id, timestamp`,
      [userId, team.event_id]
    );
    
    const registrationId = regResult.rows[0].registration_id;
    const timestamp = regResult.rows[0].timestamp;

    await client.query(
      `INSERT INTO team_registrations (registration_id, team_id) 
       VALUES ($1, $2)`,
      [registrationId, team.team_id]
    );

    const teamMembersResult = await client.query(
      `SELECT u.user_id, u.name
       FROM team_registrations tr
       JOIN registrations r ON tr.registration_id = r.registration_id
       JOIN users u ON r.student_id = u.user_id
       JOIN teams t ON tr.team_id = t.team_id
       WHERE tr.team_id = $1 AND t.team_lead_id != u.user_id
       ORDER BY tr.joined_at`,
      [team.team_id]
    );

    const teamMembers = teamMembersResult.rows.map((member) => ({
      id: member.user_id,
      name: member.name
    }));

    await client.query("COMMIT");
    
    return res.status(201).json({
      success: true,
      message: "Successfully joined team",
      data: {
        registrationId,
        eventId: team.event_id,
        eventName: team.event_name,
        eventType: "team",
        teamName: team.team_name,
        teamCode: team.team_code,
        teamId: team.team_id,
        teamLead: {
          id: team.team_lead_id,
          name: team.team_lead_name
        },
        isTeamLead: false,
        teamMembers,
        currentMembers: currentMembers + 1,
        maxMembers: team.max_team_size,
        minMembers: team.min_team_size,
        teamIsFull: (currentMembers + 1) >= team.max_team_size,
        feeAmount: team.fee_amount,
        paymentRequired: parseFloat(team.fee_amount) > 0,
        timestamp: timestamp
      }
    });

  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("Join team error:", error);
    
    if (error.code === "40001") {
      return res.status(409).json({ 
        success: false, 
        message: "Join team conflict. Please try again.",
        retryable: true 
      });
    }
    
    if (error.code === "23505") {
      return res.status(400).json({ 
        success: false, 
        message: "Join team conflict occurred. Please try again." 
      });
    }
    
    return res.status(500).json({
      success: false,
      message: "Failed to join team due to server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  } finally {
    client.release();
  }
};

// Get user's registration status for an event
export const getRegistrationStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.user_id;
    const { eventId } = req.params;

    if (!userId || !eventId) {
      return res.status(400).json({ 
        success: false, 
        message: "User ID and Event ID are required" 
      });
    }

    const client = await pool.connect();
    
    try {
      const registrationResult = await client.query(
        `SELECT r.registration_id, r.timestamp, r.payment_status, r.attendance_status,
                e.event_name, e.max_team_size, e.fee_amount
         FROM registrations r
         JOIN events e ON r.event_id = e.event_id
         WHERE r.student_id = $1 AND r.event_id = $2`,
        [userId, eventId]
      );

      if (registrationResult.rowCount === 0) {
        return res.status(200).json({
          success: true,
          data: {
            isRegistered: false,
            registrationId: null
          }
        });
      }

      const registration = registrationResult.rows[0];
      const isTeamEvent = registration.max_team_size > 1;

      let teamInfo = null;
      if (isTeamEvent) {
        const teamResult = await client.query(
          `SELECT t.team_id, t.team_name, t.team_code, t.team_lead_id,
                  COUNT(tr.registration_id) as current_members,
                  e.max_team_size, e.min_team_size
           FROM team_registrations tr_user
           JOIN teams t ON tr_user.team_id = t.team_id
           JOIN events e ON t.event_id = e.event_id
           LEFT JOIN team_registrations tr ON t.team_id = tr.team_id
           WHERE tr_user.registration_id = $1
           GROUP BY t.team_id, t.team_name, t.team_code, t.team_lead_id, e.max_team_size, e.min_team_size`,
          [registration.registration_id]
        );

        if ((teamResult.rowCount ?? 0) > 0) {
          const team = teamResult.rows[0];
          teamInfo = {
            teamId: team.team_id,
            teamName: team.team_name,
            teamCode: team.team_code,
            isTeamLead: team.team_lead_id === userId,
            currentMembers: parseInt(team.current_members),
            maxMembers: team.max_team_size,
            minMembers: team.min_team_size,
            teamIsFull: parseInt(team.current_members) >= team.max_team_size
          };
        }
      }

      return res.status(200).json({
        success: true,
        data: {
          isRegistered: true,
          registrationId: registration.registration_id,
          eventName: registration.event_name,
          eventType: isTeamEvent ? "team" : "solo",
          timestamp: registration.timestamp,
          paymentStatus: registration.payment_status,
          attendanceStatus: registration.attendance_status,
          feeAmount: registration.fee_amount,
          paymentRequired: parseFloat(registration.fee_amount) > 0,
          teamInfo
        }
      });

    } finally {
      client.release();
    }

  } catch (error: any) {
    console.error("Get registration status error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get registration status",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};