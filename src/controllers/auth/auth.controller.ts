import { type Request, type Response } from 'express';
import { pool } from '../../config/db.js'
import bcrypt from 'bcrypt';
import { generateTokens, verifyRefreshToken } from '../../utils/jwt.js';

export const loginUser = async (req: Request, res: Response) => {
    const { email, password } = req.body;

    const query = 'SELECT user_id, email, password FROM users WHERE email = $1';
    const { rows } = await pool.query(query, [email]);

    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const tokens = generateTokens({ user_id: user.user_id});
    res.json({ ...tokens, user: { user_id: user.user_id } });
}

export const registerUser = async (req: Request, res: Response) => {
  const { name, email, department, batch, year, phone_number, password } = req.body;

  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      'INSERT INTO users (name, role, email, phone_number, department_id, batch, year, password) VALUES ($1, \'student\', $2, $3, $4, $5, $6, $7 ) RETURNING user_id, name, email',
      [name, email, phone_number, department, batch, year, hashedPassword]
    );

    const user = result.rows[0];
    const token = await generateTokens({ user_id: user.user_id });

    res.status(201).json({ user, token });
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ message: 'Registration failed', error: err.message });
  }
};

export const refreshToken = (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  try {
    const payload = verifyRefreshToken(refreshToken) as any;
    const tokens = generateTokens({ user_id: payload.user_id });
    res.json({ ...tokens });
  } catch (err) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
};

export const logoutUser = async (req: Request, res: Response) => {
  res.json({ message: 'Logged out successfully' });
};