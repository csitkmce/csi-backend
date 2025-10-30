import type { Request, Response } from 'express';
import { pool } from '../../config/db.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { sendEmail, getPasswordResetEmailTemplate } from '../../config/email.js';

// Request password reset
export const requestPasswordReset = async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ 
      success: false, 
      message: 'Email is required' 
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Find user by email
    const userResult = await client.query(
      'SELECT user_id, name, email FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    // Always return success to prevent email enumeration
    if (userResult.rowCount === 0) {
      console.log(`Password reset requested for non-existent email: ${email}`);
      return res.json({
        success: true,
        message: 'If an account exists with this email, you will receive a password reset link shortly.'
      });
    }

    const user = userResult.rows[0];

    // Generate secure random token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Set expiry to 15 minutes from now
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await client.query(
      `DELETE FROM password_reset_tokens
      WHERE user_id = $1`,
      [user.user_id]
    );

    // Store hashed token in database
    await client.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at) 
       VALUES ($1, $2, $3)`,
      [user.user_id, hashedToken, expiresAt]
    );

    // Create reset link
    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;

    // Send email
    const emailTemplate = getPasswordResetEmailTemplate(resetLink, user.name);
    
    await sendEmail({
      to: user.email,
      subject: 'Password Reset Request - CSI TKMCE',
      html: emailTemplate.html,
      text: emailTemplate.text,
    });

    await client.query('COMMIT');

    console.log(`Password reset email sent to: ${email}`);

    return res.json({
      success: true,
      message: 'If an account exists with this email, you will receive a password reset link shortly.'
    });

  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Password reset request error:', error);
    
    return res.status(500).json({
      success: false,
      message: 'Failed to process password reset request. Please try again later.'
    });
  } finally {
    client.release();
  }
};

// Verify reset token
export const verifyResetToken = async (req: Request, res: Response) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({
      success: false,
      message: 'Reset token is required'
    });
  }

  try {
    // Hash the token to compare with database
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const result = await pool.query(
      `SELECT prt.token_id, prt.user_id, prt.expires_at, u.email, u.name
       FROM password_reset_tokens prt
       JOIN users u ON prt.user_id = u.user_id
       WHERE prt.token = $1 AND prt.used = false`,
      [hashedToken]
    );

    if (result.rowCount === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    const tokenData = result.rows[0];
    const now = new Date();
    const expiresAt = new Date(tokenData.expires_at);

    if (now > expiresAt) {
      return res.status(400).json({
        success: false,
        message: 'Reset token has expired. Please request a new one.'
      });
    }

    return res.json({
      success: true,
      message: 'Token is valid',
      data: {
        email: tokenData.email,
        name: tokenData.name
      }
    });

  } catch (error: any) {
    console.error('Token verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify reset token'
    });
  }
};

// Reset password
export const resetPassword = async (req: Request, res: Response) => {
  const { token, password, confirmPassword } = req.body;

  // Validation
  if (!token || !password || !confirmPassword) {
    return res.status(400).json({
      success: false,
      message: 'Token, password, and confirm password are required'
    });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({
      success: false,
      message: 'Passwords do not match'
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 8 characters long'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Hash the token to compare with database
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find valid token
    const tokenResult = await client.query(
      `SELECT prt.token_id, prt.user_id, prt.expires_at
       FROM password_reset_tokens prt
       WHERE prt.token = $1 AND prt.used = false
       FOR UPDATE`,
      [hashedToken]
    );

    if (tokenResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    const tokenData = tokenResult.rows[0];
    const now = new Date();
    const expiresAt = new Date(tokenData.expires_at);

    if (now > expiresAt) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Reset token has expired. Please request a new one.'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update user password
    await client.query(
      'UPDATE users SET password = $1 WHERE user_id = $2',
      [hashedPassword, tokenData.user_id]
    );

    // Mark token as used
    await client.query(
      'UPDATE password_reset_tokens SET used = true WHERE token_id = $1',
      [tokenData.token_id]
    );

    await client.query('COMMIT');

    console.log(`Password successfully reset for user: ${tokenData.user_id}`);

    return res.json({
      success: true,
      message: 'Password has been reset successfully. You can now log in with your new password.'
    });

  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Password reset error:', error);
    
    return res.status(500).json({
      success: false,
      message: 'Failed to reset password. Please try again.'
    });
  } finally {
    client.release();
  }
};