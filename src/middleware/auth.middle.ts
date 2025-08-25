import { type Request, type Response, type NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt.js';
import { pool } from '../config/db.js'; 

export interface AuthenticatedRequest extends Request {
  user?: any;
}

export const authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false,
      message: 'Missing or invalid authorization header',
      requiresLogin: true
    });
  }

  const accessToken = authHeader.split(' ')[1];

  if (!accessToken) {
    return res.status(401).json({ 
      success: false,
      message: 'No access token provided',
      requiresLogin: true
    });
  }

  const payload = await verifyAccessToken(accessToken);

  if (!payload) {
    return res.status(401).json({ 
      success: false,
      message: 'Invalid or expired access token',
      requiresLogin: true
    });
  }

  try {
    const userQuery = await pool.query(
      "SELECT user_id, name, email FROM users WHERE user_id = $1",
      [payload.user_id]
    );

    if (userQuery.rowCount === 0) {
      return res.status(401).json({
        success: false,
        message: "User not found",
        requiresLogin: true
      });
    }

    req.user = userQuery.rows[0];
    return next();

  } catch (error) {
    console.error("User fetch error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};