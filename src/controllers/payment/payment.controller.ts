import { type Response } from "express";
import { pool } from "../../config/db.js";
import type { AuthenticatedRequest } from "../../middleware/auth.middle.js";
import Razorpay from "razorpay";
import crypto from "crypto";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export const initiatePayment = async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  
  try {
    const userId = req.user?.user_id;
    const { registrationId } = req.body;

    if (!userId || !registrationId) {
      return res.status(400).json({
        success: false,
        message: "User ID and Registration ID are required"
      });
    }

    await client.query("BEGIN");

    const regResult = await client.query(
      `SELECT r.registration_id, r.student_id, r.event_id, r.payment_status,
              e.event_name, e.fee_amount, u.name, u.email
       FROM registrations r
       JOIN events e ON r.event_id = e.event_id
       JOIN users u ON r.student_id = u.user_id
       WHERE r.registration_id = $1 AND r.student_id = $2
       FOR UPDATE OF r`,
      [registrationId, userId]
    );

    if (regResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Registration not found"
      });
    }

    const registration = regResult.rows[0];
    const feeAmount = parseFloat(registration.fee_amount);

    if (feeAmount <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "This event is free. No payment required."
      });
    }

    if (registration.payment_status) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Payment already completed for this registration"
      });
    }

    // Create Razorpay order
    const options = {
      amount: Math.round(feeAmount * 100), // Convert to paise
      currency: "INR",
      receipt: `reg_${registrationId}`,
      notes: {
        registration_id: registrationId,
        event_name: registration.event_name,
        user_name: registration.name
      }
    };

    const razorpayOrder = await razorpay.orders.create(options);

    await client.query(
      `INSERT INTO payments (payment_id, registration_id, razorpay_order_id, amount, status)
       VALUES (uuid_generate_v4(), $1, $2, $3, 'pending')
       ON CONFLICT (registration_id) 
       DO UPDATE SET razorpay_order_id = $2, amount = $3, status = 'pending', created_at = NOW()`,
      [registrationId, razorpayOrder.id, feeAmount]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Payment initiated successfully",
      data: {
        orderId: razorpayOrder.id,
        amount: feeAmount,
        currency: "INR",
        eventName: registration.event_name,
        userName: registration.name,
        userEmail: registration.email
      }
    });

  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("Payment initiation error:", error);
    
    return res.status(500).json({
      success: false,
      message: "Failed to initiate payment",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  } finally {
    client.release();
  }
};

export const verifyPayment = async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  
  try {
    const userId = req.user?.user_id;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!userId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "All payment verification parameters are required"
      });
    }

    await client.query("BEGIN");

    const paymentResult = await client.query(
      `SELECT p.payment_id, p.registration_id, p.razorpay_order_id, p.amount, p.status,
              r.student_id, e.event_name
       FROM payments p
       JOIN registrations r ON p.registration_id = r.registration_id
       JOIN events e ON r.event_id = e.event_id
       WHERE p.razorpay_order_id = $1 AND r.student_id = $2
       FOR UPDATE OF p`,
      [razorpay_order_id, userId]
    );

    if (paymentResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Payment record not found"
      });
    }

    const payment = paymentResult.rows[0];

    if (payment.status === 'completed') {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Payment already verified"
      });
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature"
      });
    }

    await client.query(
      `UPDATE payments 
       SET razorpay_payment_id = $1, razorpay_signature = $2, status = 'completed', updated_at = NOW()
       WHERE payment_id = $3`,
      [razorpay_payment_id, razorpay_signature, payment.payment_id]
    );

    await client.query(
      `UPDATE registrations 
       SET payment_status = true
       WHERE registration_id = $1`,
      [payment.registration_id]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      data: {
        registrationId: payment.registration_id,
        eventName: payment.event_name,
        amount: payment.amount,
        paymentId: razorpay_payment_id
      }
    });

  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("Payment verification error:", error);
    
    return res.status(500).json({
      success: false,
      message: "Failed to verify payment",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  } finally {
    client.release();
  }
};

export const getPaymentStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.user_id;
    const { registrationId } = req.params;

    if (!userId || !registrationId) {
      return res.status(400).json({
        success: false,
        message: "User ID and Registration ID are required"
      });
    }

    const result = await pool.query(
      `SELECT r.registration_id, r.payment_status, r.timestamp,
              e.event_name, e.fee_amount,
              p.payment_id, p.razorpay_order_id, p.razorpay_payment_id, 
              p.amount, p.status, p.created_at, p.updated_at
       FROM registrations r
       JOIN events e ON r.event_id = e.event_id
       LEFT JOIN payments p ON r.registration_id = p.registration_id
       WHERE r.registration_id = $1 AND r.student_id = $2`,
      [registrationId, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Registration not found"
      });
    }

    const record = result.rows[0];
    const feeAmount = parseFloat(record.fee_amount);

    return res.status(200).json({
      success: true,
      data: {
        registrationId,
        eventName: record.event_name,
        feeAmount,
        paymentRequired: feeAmount > 0,
        paymentStatus: record.payment_status || false,
        paymentDetails: record.payment_id ? {
          paymentId: record.payment_id,
          razorpayOrderId: record.razorpay_order_id,
          razorpayPaymentId: record.razorpay_payment_id,
          amount: record.amount,
          status: record.status,
          createdAt: record.created_at,
          updatedAt: record.updated_at
        } : null
      }
    });

  } catch (error: any) {
    console.error("Get payment status error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get payment status",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};