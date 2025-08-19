import { pool } from "../config/db.js";

export async function initDB() {
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    await pool.query(`DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('student', 'admin', 'master');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_type') THEN
        CREATE TYPE event_type AS ENUM ('event', 'hackathon');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_status') THEN
        CREATE TYPE event_status AS ENUM ('active', 'inactive');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'registration_status') THEN
        CREATE TYPE registration_status AS ENUM ('present', 'absent');
      END IF;
    END$$;`);

    // Departments
    await pool.query(`
      CREATE TABLE IF NOT EXISTS departments (
        department_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) UNIQUE NOT NULL
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
        password VARCHAR(255) NOT NULL
      );
    `);

    // Events
    await pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        type event_type NOT NULL,
        event_name VARCHAR(255) NOT NULL,
        event_description TEXT,
        venue VARCHAR(255),
        reg_start_time TIMESTAMP,
        reg_end_time TIMESTAMP,
        event_start_time TIMESTAMP,
        event_end_time TIMESTAMP,
        fee_amount DECIMAL(10,2) DEFAULT 0,
        status event_status DEFAULT 'active',
        max_registrations INT
      );
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

    // Trigger function to auto-assign unique team_code
    await pool.query(`
      CREATE OR REPLACE FUNCTION assign_team_code()
      RETURNS TRIGGER AS $$
      DECLARE
        new_code TEXT;
      BEGIN
        LOOP
          new_code := generate_team_code(6);
          EXIT WHEN NOT EXISTS (SELECT 1 FROM teams WHERE team_code = new_code);
        END LOOP;
        NEW.team_code := new_code;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Teams
    await pool.query(`
      CREATE TABLE IF NOT EXISTS teams (
        team_code TEXT PRIMARY KEY,
        team_name VARCHAR(255) NOT NULL,
        team_lead_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
        UNIQUE(team_name, team_lead_id)
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

    // Hackathon registrations
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hackathon_registrations (
        registration_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        team_code TEXT REFERENCES teams(team_code) ON DELETE CASCADE,
        event_id UUID REFERENCES events(event_id) ON DELETE CASCADE,
        UNIQUE(team_code, event_id)
      );
    `);

    // Registrations
    await pool.query(`
      CREATE TABLE IF NOT EXISTS registrations (
        registration_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        type event_type NOT NULL,
        timestamp TIMESTAMP DEFAULT NOW(),
        student_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
        event_id UUID REFERENCES events(event_id) ON DELETE CASCADE,
        team_code TEXT REFERENCES teams(team_code) ON DELETE SET NULL,
        ticket VARCHAR(255),
        certificate VARCHAR(255),
        status registration_status DEFAULT 'absent',
        payment_status BOOLEAN DEFAULT false,
        payment_reference_id VARCHAR(255),
        UNIQUE(student_id, event_id),
        CHECK (
          (type = 'hackathon' AND team_code IS NOT NULL) OR
          (type = 'event' AND team_code IS NULL)
        )
      );
    `);

    // Execom
    await pool.query(`
      CREATE TABLE IF NOT EXISTS execom (
        execom_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        year INT,
        academic_year INT,
        batch CHAR(10),
        position VARCHAR(255),
        upload_image VARCHAR(255),
        social_link VARCHAR(255)
      );
    `);

    console.log("Tables created/checked successfully");
  } catch (err) {
    console.error("Error initializing database:", err);
  }
}
