import { pool } from "../config/db.js";

export async function initDB() {
  try {
    //ENUMS
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

    //USERS 
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        role user_role NOT NULL DEFAULT 'student',
        email VARCHAR(255) UNIQUE NOT NULL,
        phone_number VARCHAR(50),
        department VARCHAR(255),
        batch CHAR(10),
        year INT,
        password VARCHAR(255) NOT NULL
      );
    `);

    //EVENTS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        event_id SERIAL PRIMARY KEY,
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

    //REGISTRATIONS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS registrations (
        registration_id SERIAL PRIMARY KEY,
        type event_type NOT NULL,
        timestamp TIMESTAMP DEFAULT NOW(),
        student_id INT REFERENCES users(user_id) ON DELETE CASCADE,
        event_id INT REFERENCES events(event_id) ON DELETE CASCADE,
        ticket VARCHAR(255),
        certificate VARCHAR(255),
        status registration_status DEFAULT 'absent',
        payment_status BOOLEAN DEFAULT false,
        payment_reference_id VARCHAR(255)
      );
    `);

    //EXE-COM
    await pool.query(`
      CREATE TABLE IF NOT EXISTS execom (
        execom_id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        year INT,
        academic_year INT,
        batch CHAR(10),
        position VARCHAR(255),
        upload_image VARCHAR(255),
        social_link VARCHAR(255)
      );
    `);

    //TEAMS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS teams (
        team_code VARCHAR(50) PRIMARY KEY,
        team_name VARCHAR(255) NOT NULL,
        team_lead_id INT REFERENCES users(user_id) ON DELETE SET NULL
      );
    `);

    //HACKATHON REGISTRATIONS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hackathon_registrations (
        registration_id SERIAL PRIMARY KEY,
        team_code VARCHAR(50) REFERENCES teams(team_code) ON DELETE CASCADE
      );
    `);

    console.log("Tables created/checked successfully");
  } catch (err) {
    console.error("Error initializing database:", err);
  }
}
