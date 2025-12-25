import { getCurrentISTTime, toISTString } from '../utils/dateUtils.js';

interface Event {
  event_id: string;
  event_name: string;
  min_team_size: number;
  max_team_size: number;
  status: string;
  reg_start_time: string;
  reg_end_time: string;
  max_registrations: number;
  fee_amount: string;
  team_name_required: boolean;
}

interface CustomError extends Error {
  statusCode?: number;
}

export async function validateEventAccess(client: any, eventId: string): Promise<Event> {
  const eventResult = await client.query(
    `SELECT event_id, event_name, min_team_size, max_team_size, status,
            reg_start_time, reg_end_time, max_registrations, fee_amount, team_name_required
     FROM events WHERE event_id = $1 FOR UPDATE`,
    [eventId]
  );

  if (eventResult.rowCount === 0) {
    const error: CustomError = new Error("Event not found");
    error.statusCode = 404;
    throw error;
  }

  const event = eventResult.rows[0];

  if (event.min_team_size < 1 || event.max_team_size < 1 || event.min_team_size > event.max_team_size) {
    const error: CustomError = new Error("Invalid event configuration");
    error.statusCode = 400;
    throw error;
  }

  if (event.status !== "active") {
    const error: CustomError = new Error("Event is not active");
    error.statusCode = 400;
    throw error;
  }

  const now = getCurrentISTTime();
  
  if (event.reg_start_time) {
    const regStart = new Date(event.reg_start_time);
    console.log(` Registration validation:
      Current time (IST): ${toISTString(now)}
      Reg start time: ${toISTString(regStart)}
      Now < RegStart: ${now < regStart}`);
    
    if (now < regStart) {
      const error: CustomError = new Error("Registration has not started yet");
      error.statusCode = 400;
      throw error;
    }
  }
  
  if (event.reg_end_time) {
    const regEnd = new Date(event.reg_end_time);
    console.log(` Registration validation:
      Current time (IST): ${toISTString(now)}
      Reg end time: ${toISTString(regEnd)}
      Now > RegEnd: ${now > regEnd}`);
    
    if (now > regEnd) {
      const error: CustomError = new Error("Registration has ended");
      error.statusCode = 400;
      throw error;
    }
  }

  return event;
}

export async function checkExistingRegistration(
  client: any, 
  userId: string, 
  eventId: string
): Promise<{ exists: boolean; registration?: any }> {
  const existingReg = await client.query(
    `SELECT r.registration_id, r.payment_status, r.timestamp, r.accommodation_id, 
            r.food_preference, e.fee_amount
     FROM registrations r
     JOIN events e ON r.event_id = e.event_id
     WHERE r.student_id = $1 AND r.event_id = $2 
     FOR UPDATE OF r`,
    [userId, eventId]
  );
  
  if ((existingReg.rowCount ?? 0) > 0) {
    return {
      exists: true,
      registration: existingReg.rows[0]
    };
  }

  return { exists: false };
}

export async function getCurrentRegistrationCount(client: any, eventId: string, isTeamEvent: boolean): Promise<number> {
  let countQuery: string;
  
  if (isTeamEvent) {
    // For team events, count only teams with paid team lead
    countQuery = `
      SELECT COUNT(DISTINCT t.team_id) as count
      FROM teams t
      JOIN team_registrations tr ON t.team_id = tr.team_id
      JOIN registrations r ON tr.registration_id = r.registration_id
      WHERE t.event_id = $1 AND r.payment_status = true AND r.student_id = t.team_lead_id
    `;
  } else {
    // For solo events, count only PAID registrations
    countQuery = `
      SELECT COUNT(*) as count
      FROM registrations r
      WHERE r.event_id = $1 AND r.payment_status = true
    `;
  }

  const countResult = await client.query(countQuery, [eventId]);
  return parseInt(countResult.rows[0].count);
}

export async function handleRegistrationFlow(
  client: any,
  userId: string,
  userName: string,
  eventId: string,
  event: Event,
  teamName?: string,
  accommodationId?: number,
  foodPref?: string
): Promise<any> {
  const isSoloEvent = event.max_team_size === 1;
  const isTeamEvent = event.max_team_size > 1;

  if (isSoloEvent) {
    return await handleSoloEventRegistration(client, userId, eventId, event, accommodationId, foodPref);
  }

  if (isTeamEvent) {
    return await handleTeamEventRegistration(
      client, 
      userId, 
      userName, 
      eventId, 
      event, 
      teamName,
      accommodationId,
      foodPref
    );
  }

  const error: CustomError = new Error("Unexpected error in event type determination");
  error.statusCode = 500;
  throw error;
}

async function handleSoloEventRegistration(
  client: any, 
  userId: string, 
  eventId: string, 
  event: Event,
  accommodationId?: number,
  foodPref?: string
): Promise<any> {
  const feeAmount = parseFloat(event.fee_amount);
  const isFreeEvent = feeAmount <= 0;
  
  // For free events, set payment_status to true automatically
  const regResult = await client.query(
    `INSERT INTO registrations (student_id, event_id, accommodation_id, food_preference, payment_status)
     VALUES ($1, $2, $3, $4, $5) RETURNING registration_id, timestamp`,
    [userId, eventId, accommodationId || null, foodPref || 'No food', isFreeEvent]
  );
  
  // Get accommodation details if provided
  let accommodationData = null;
  if (accommodationId) {
    const accommodationResult = await client.query(
      'SELECT accommodation_id, accommodation FROM accommodations WHERE accommodation_id = $1',
      [accommodationId]
    );
    if (accommodationResult.rowCount && accommodationResult.rowCount > 0) {
      accommodationData = {
        id: accommodationResult.rows[0].accommodation_id,
        name: accommodationResult.rows[0].accommodation
      };
    }
  }
  
  return {
    success: true,
    message: isFreeEvent 
      ? "Successfully registered for solo event" 
      : "Registration created. Please complete payment to confirm your spot.",
    sendEmail: isFreeEvent, // Only send email for free events immediately
    data: {
      registrationId: regResult.rows[0].registration_id,
      eventName: event.event_name,
      eventType: "solo",
      feeAmount: event.fee_amount,
      paymentRequired: !isFreeEvent,
      paymentStatus: isFreeEvent,
      timestamp: regResult.rows[0].timestamp,
      accommodation: accommodationData,
      foodPreference: foodPref || 'No food'
    }
  };
}

async function handleTeamEventRegistration(
  client: any,
  userId: string,
  userName: string,
  eventId: string,
  event: Event,
  teamName?: string,
  accommodationId?: number,
  foodPref?: string
): Promise<any> {
  const feeAmount = parseFloat(event.fee_amount);
  const isFreeEvent = feeAmount <= 0;

  let finalTeamName: string;

  // Determine team name
  if (teamName && teamName.trim() !== "") {
    finalTeamName = teamName.trim();

    // Check for duplicates
    const nameCheck = await client.query(
      `SELECT 1 FROM teams 
       WHERE event_id = $1 AND LOWER(team_name) = LOWER($2) 
       FOR UPDATE`,
      [eventId, finalTeamName]
    );

    if ((nameCheck.rowCount ?? 0) > 0) {
      const error: CustomError = new Error("Team name already exists. Please choose a different name.");
      error.statusCode = 400;
      throw error;
    }
  } else {
    finalTeamName = await generateUniqueTeamName(client, eventId, userName);
  }

  // Create registration - for free events, set payment_status to true
  const regResult = await client.query(
    `INSERT INTO registrations (student_id, event_id, accommodation_id, food_preference, payment_status)
     VALUES ($1, $2, $3, $4, $5) RETURNING registration_id, timestamp`,
    [userId, eventId, accommodationId || null, foodPref || 'No food', isFreeEvent]
  );

  const registrationId = regResult.rows[0].registration_id;
  const timestamp = regResult.rows[0].timestamp;

  let teamId = null;
  let teamCode = null;

  // For FREE events, create team immediately
  if (isFreeEvent) {
    const teamCodeGenerated = Math.random().toString(36).substring(2, 8).toUpperCase();

    const teamResult = await client.query(
      `INSERT INTO teams (team_name, team_lead_id, event_id, team_code)
       VALUES ($1, $2, $3, $4) RETURNING team_id, team_code`,
      [finalTeamName, userId, eventId, teamCodeGenerated]
    );

    teamId = teamResult.rows[0].team_id;
    teamCode = teamResult.rows[0].team_code;

    // Link registration to team
    await client.query(
      `INSERT INTO team_registrations (registration_id, team_id) 
       VALUES ($1, $2)`,
      [registrationId, teamId]
    );
  }

  // Get accommodation details if provided
  let accommodationData = null;
  if (accommodationId) {
    const accommodationResult = await client.query(
      'SELECT accommodation_id, accommodation FROM accommodations WHERE accommodation_id = $1',
      [accommodationId]
    );
    if (accommodationResult.rowCount > 0) {
      accommodationData = {
        id: accommodationResult.rows[0].accommodation_id,
        name: accommodationResult.rows[0].accommodation
      };
    }
  }

  return {
    success: true,
    message: isFreeEvent 
      ? "Successfully registered and team created"
      : "Registration created. Please complete payment to create your team.",
    sendEmail: isFreeEvent, // Only send email for free events immediately
    data: {
      registrationId,
      eventName: event.event_name,
      eventType: "team",
      teamName: finalTeamName,
      teamId,
      teamCode,
      isTeamLead: true,
      currentMembers: isFreeEvent ? 1 : 0,
      maxMembers: event.max_team_size,
      minMembers: event.min_team_size,
      canInviteMembers: isFreeEvent,
      feeAmount: event.fee_amount,
      paymentRequired: !isFreeEvent,
      paymentStatus: isFreeEvent,
      timestamp: timestamp,
      accommodation: accommodationData,
      foodPreference: foodPref || 'No food'
    }
  };
}

async function generateUniqueTeamName(client: any, eventId: string, baseName: string): Promise<string> {
  const result = await client.query(`
    WITH existing_names AS (
      SELECT team_name
      FROM teams
      WHERE event_id = $1
        AND (LOWER(team_name) = LOWER($2) OR LOWER(team_name) ~ ('^' || LOWER($2) || ' (\\\\([0-9]+\\\\))'))
    ),
    max_suffix AS (
      SELECT COALESCE(
        MAX(
          CASE
            WHEN team_name ~ ('^' || LOWER($2) || ' (\\\\([0-9]+\\\\))')
            THEN (regexp_match(team_name, '\\\\(([0-9]+)\\\\)'))[1]::int
            ELSE 0
          END
        ), 0
      ) as max_num
      FROM existing_names
    )
    SELECT 
      CASE
        WHEN max_num = 0 AND NOT EXISTS (SELECT 1 FROM existing_names WHERE LOWER(team_name) = LOWER($2))
        THEN $2
        ELSE $2 || ' (' || (max_num + 1) || ')'
      END as unique_name
    FROM max_suffix
    FOR UPDATE
  `, [eventId, baseName]);

  return result.rows[0].unique_name;
}