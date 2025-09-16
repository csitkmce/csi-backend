  import { type Request, type Response, type NextFunction } from 'express';
  import { verifyAccessToken } from '../utils/jwt.js';
  import { pool } from '../config/db.js';

  export interface AuthenticatedRequest extends Request {
    user?: any;
    isLoggedIn?: boolean;
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
    
    try {
      const payload = await verifyAccessToken(accessToken);
      if (!payload) {
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired access token',
          requiresLogin: true
        });
      }

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

  export const optionalAuthenticate = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    req.isLoggedIn = false;
    req.user = undefined;
  
    const authHeader = req.headers.authorization;
  
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }
  
    const accessToken = authHeader.split(' ')[1];
  
    if (!accessToken || accessToken === 'null' || accessToken === 'undefined') {
      return next();
    }
  
    try {
      const payload = await verifyAccessToken(accessToken);
    
      if (!payload || !payload.user_id) {
        return next();
      }
    
      const userQuery = await pool.query(
        `SELECT
          u.user_id,
          u.name,
          u.email,
          d.department_name AS department,
          u.batch,
          u.year
        FROM users u
        LEFT JOIN departments d ON u.department_id = d.department_id
        WHERE u.user_id = $1`,
        [payload.user_id]
      );
    
      if (userQuery.rowCount === 0) {
        return next();
      }
    
      req.user = userQuery.rows[0];
      req.isLoggedIn = true;
    
    } catch (error) {
      console.warn("Token verification failed:", error);
    }
  
    next();
  };