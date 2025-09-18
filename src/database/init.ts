// src/database/init.ts (Updated with payments table)
import { pool } from "../config/db.js";

export async function initDB() {
  try {
   
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    // ENUMs
    await pool.query(`DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('student', 'admin', 'master');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_status') THEN
        CREATE TYPE event_status AS ENUM ('active', 'inactive');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendance_status') THEN
        CREATE TYPE attendance_status AS ENUM ('present', 'absent');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
        CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');
      END IF;
    END$$;`);

    // Departments
    await pool.query(`
      CREATE TABLE IF NOT EXISTS departments (
        department_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        department_name VARCHAR(255) UNIQUE NOT NULL
      );
    `);

    // Users
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        role user_role NOT NULL DEFAULT 'student',
        email VARCHAR(255) UNIQUE NOT NULL,
        phone_number VARCHAR(50),
        department_id UUID REFERENCES departments(department_id) ON DELETE SET NULL,
        batch CHAR(10),
        year INT,
        password VARCHAR(255) NOT NULL,
        college TEXT
      );
    `);

    // Events - with proper constraints for solo vs team events
    await pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        event_name VARCHAR(255) NOT NULL,
        event_description TEXT,
        event_image VARCHAR(255),
        venue VARCHAR(255),
        reg_start_time TIMESTAMP,
        reg_end_time TIMESTAMP,
        event_start_time TIMESTAMP,
        event_end_time TIMESTAMP,
        fee_amount DECIMAL(10,2) DEFAULT 0,
        status event_status DEFAULT 'active',
        max_registrations INT,
        whatsapp_link VARCHAR(500),
        food BOOLEAN DEFAULT false,
        team_name_required BOOLEAN NOT NULL DEFAULT false,
        min_team_size INT DEFAULT 1,
        max_team_size INT DEFAULT 1,
        CONSTRAINT check_team_sizes CHECK (min_team_size > 0 AND max_team_size > 0 AND min_team_size <= max_team_size),
        CONSTRAINT check_registration_times CHECK (reg_start_time IS NULL OR reg_end_time IS NULL OR reg_start_time < reg_end_time),
        CONSTRAINT check_event_times CHECK (event_start_time IS NULL OR event_end_time IS NULL OR event_start_time < event_end_time),
        CONSTRAINT check_solo_event_no_team_name CHECK (NOT (max_team_size = 1 AND team_name_required = true))
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS accommodations (
        accommodation_id SERIAL PRIMARY KEY,
        accommodation VARCHAR(255) NOT NULL
      );
    `);

    // Add comment for clarity
    await pool.query(`
      COMMENT ON COLUMN events.team_name_required IS 'Only applicable for team events (max_team_size > 1). Solo events (max_team_size = 1) cannot require team names.';
    `);

    // Function to ensure solo event logic
    await pool.query(`
      CREATE OR REPLACE FUNCTION ensure_solo_event_logic()
      RETURNS TRIGGER AS $$
      BEGIN
        -- If max_team_size is 1, force team_name_required to be false
        IF NEW.max_team_size = 1 THEN
          NEW.team_name_required := false;
        END IF;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Trigger to enforce solo event logic
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_ensure_solo_event_logic'
        ) THEN
          CREATE TRIGGER trigger_ensure_solo_event_logic
            BEFORE INSERT OR UPDATE ON events
            FOR EACH ROW
            EXECUTE FUNCTION ensure_solo_event_logic();
        END IF;
      END$$;
    `);

    // Team code generator function
    await pool.query(`
      CREATE OR REPLACE FUNCTION generate_team_code(length INT DEFAULT 6)
      RETURNS TEXT AS $$
      DECLARE
        chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        result TEXT := '';
      BEGIN
        FOR i IN 1..length LOOP
          result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
        END LOOP;
        RETURN result;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Trigger function to auto-assign unique team_code per event
    await pool.query(`
      CREATE OR REPLACE FUNCTION assign_team_code()
      RETURNS TRIGGER AS $$
      DECLARE
        new_code TEXT;
        max_attempts INT := 10;
        attempt_count INT := 0;
      BEGIN
        LOOP
          attempt_count := attempt_count + 1;
          new_code := generate_team_code(6);
          
          EXIT WHEN NOT EXISTS (
            SELECT 1 FROM teams WHERE event_id = NEW.event_id AND team_code = new_code
          );
          
          -- Prevent infinite loops
          IF attempt_count >= max_attempts THEN
            RAISE EXCEPTION 'Unable to generate unique team code after % attempts', max_attempts;
          END IF;
        END LOOP;
        
        NEW.team_code := new_code;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Teams
    await pool.query(`
      CREATE TABLE IF NOT EXISTS teams (
        team_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        team_code TEXT NOT NULL,
        team_name VARCHAR(255) NOT NULL,
        team_lead_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
        event_id UUID REFERENCES events(event_id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(event_id, team_code),
        CONSTRAINT check_team_name_length CHECK (LENGTH(TRIM(team_name)) BETWEEN 1 AND 100)
      );
    `);

    // Trigger to assign team_code before insert
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger WHERE tgname = 'before_team_insert'
        ) THEN
          CREATE TRIGGER before_team_insert
          BEFORE INSERT ON teams
          FOR EACH ROW
          WHEN (NEW.team_code IS NULL)
          EXECUTE FUNCTION assign_team_code();
        END IF;
      END$$;
    `);

    // Registrations
    await pool.query(`
      CREATE TABLE IF NOT EXISTS registrations (
        registration_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        timestamp TIMESTAMP DEFAULT NOW(),
        student_id UUID REFERENCES users(user_id) ON DELETE CASCADE NOT NULL,
        event_id UUID REFERENCES events(event_id) ON DELETE CASCADE NOT NULL,
        certificate VARCHAR(255),
        attendance_status attendance_status DEFAULT 'absent',
        payment_status BOOLEAN DEFAULT false,
        food_preference TEXT DEFAULT 'No food',
        accommodation_id INTEGER REFERENCES accommodations(id) ON DELETE SET NULL,
        UNIQUE(student_id, event_id)
      );
    `);

    // Payments table for Razorpay integration
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        payment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        registration_id UUID UNIQUE REFERENCES registrations(registration_id) ON DELETE CASCADE NOT NULL,
        razorpay_order_id VARCHAR(255) NOT NULL,
        razorpay_payment_id VARCHAR(255),
        razorpay_signature VARCHAR(255),
        amount DECIMAL(10,2) NOT NULL,
        status payment_status DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Team registrations (only for team events)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS team_registrations (
        registration_id UUID PRIMARY KEY REFERENCES registrations(registration_id) ON DELETE CASCADE,
        team_id UUID REFERENCES teams(team_id) ON DELETE CASCADE,
        joined_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(team_id, registration_id)
      );
    `);

    // Function to validate team registrations (ensure only team events create team registrations)
    await pool.query(`
      CREATE OR REPLACE FUNCTION validate_team_registration()
      RETURNS TRIGGER AS $$
      DECLARE
        event_max_team_size INT;
      BEGIN
        -- Get the event's max_team_size
        SELECT e.max_team_size INTO event_max_team_size
        FROM teams t
        JOIN events e ON t.event_id = e.event_id
        WHERE t.team_id = NEW.team_id;
        
        -- Only allow team registrations for team events (max_team_size > 1)
        IF event_max_team_size = 1 THEN
          RAISE EXCEPTION 'Cannot create team registration for solo events';
        END IF;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Trigger to validate team registrations
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger WHERE tgname = 'validate_team_registration_trigger'
        ) THEN
          CREATE TRIGGER validate_team_registration_trigger
            BEFORE INSERT ON team_registrations
            FOR EACH ROW
            EXECUTE FUNCTION validate_team_registration();
        END IF;
      END$$;
    `);

    // Execom positions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS execom_positions (
        position_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        title VARCHAR(255) UNIQUE NOT NULL,
        Priority INT
      );
    `);

    // Execom members
    await pool.query(`
      CREATE TABLE IF NOT EXISTS execom (
        execom_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        year INT,
        academic_year INT,
        batch VARCHAR(10),
        position_id UUID REFERENCES execom_positions(position_id) ON DELETE SET NULL,
        upload_image VARCHAR(255),
        social_link VARCHAR(255)
      );
    `);

    // Leetcode users table for leaderboard
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leetcode_users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        username VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create indexes for better performance and race condition prevention
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_registrations_event_student 
      ON registrations(event_id, student_id);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_registrations_student_event_lock 
      ON registrations(student_id, event_id) INCLUDE (registration_id);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_teams_event_name 
      ON teams(event_id, LOWER(team_name));
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_teams_event_code 
      ON teams(event_id, team_code);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_team_registrations_team 
      ON team_registrations(team_id);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_team_registrations_registration 
      ON team_registrations(registration_id);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_events_status_reg_time 
      ON events(status, reg_start_time, reg_end_time);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_events_max_team_size 
      ON events(max_team_size);
    `);

    // Payments table indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_payments_registration 
      ON payments(registration_id);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_payments_razorpay_order 
      ON payments(razorpay_order_id);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_payments_status 
      ON payments(status);
    `);

    // Create unique index for case-insensitive team names per event
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_event_team_name_unique 
      ON teams(event_id, LOWER(team_name));
    `);

    // Performance index for counting team members
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_team_registrations_count 
      ON team_registrations(team_id) INCLUDE (registration_id);
    `);

    // Update any existing events that might have invalid configurations
    await pool.query(`
      UPDATE events 
      SET team_name_required = false 
      WHERE max_team_size = 1 AND team_name_required = true;
    `);

    console.log(
      "Tables, constraints, triggers, and indexes created/checked successfully"
    );

    // Show current timezone 
    const timezoneResult = await pool.query(`SHOW timezone;`);
    console.log("Current session timezone:", timezoneResult.rows[0].TimeZone);

    // Show current IST time
    const timeResult = await pool.query(`SELECT NOW() as current_ist_time;`);
    console.log("Current IST time:", timeResult.rows[0].current_ist_time);
    
  } catch (err) {
    console.error("Error initializing database:", err);
    throw err;
  }
}
