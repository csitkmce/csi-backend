import nodemailer from 'nodemailer';

// Configure email service
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: false, 
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD, 
  },
});

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailOptions) {
  try {
    const info = await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME || 'CSI TKMCE'}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      text,
    });

    console.log('Email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

// Password Reset Email Template
export function getPasswordResetEmailTemplate(resetLink: string, userName: string) {
  return {
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
          .content { background-color: #f9f9f9; padding: 30px; }
          .button { 
            display: inline-block; 
            padding: 12px 30px; 
            background-color: #4CAF50; 
            color: white; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 20px 0;
          }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          .warning { color: #d32f2f; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset Request</h1>
          </div>
          <div class="content">
            <p>Hi ${userName},</p>
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            <div style="text-align: center;">
              <a href="${resetLink}" class="button">Reset Password</a>
            </div>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #4CAF50;">${resetLink}</p>
            <p class="warning">This link will expire in 15 minutes.</p>
            <p>If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} CSI TKMCE. All rights reserved.</p>
            <p>This is an automated email, please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Hi ${userName},

      We received a request to reset your password. Use the link below to create a new password:

      ${resetLink}

      This link will expire in 15 minutes.

      If you didn't request a password reset, you can safely ignore this email.

      © ${new Date().getFullYear()} CSI TKMCE
    `
  };
}

// Registration Confirmation Email Template
interface RegistrationEmailData {
  userName: string;
  userEmail: string;
  eventName: string;
  eventVenue?: string;
  eventStartDate?: string;
  eventStartTime?: string;
  eventEndDate?: string;
  eventEndTime?: string;
  registrationId: string;
  eventType: 'solo' | 'team';
  teamName?: string;
  teamCode?: string;
  isTeamLead?: boolean;
  teamMembers?: Array<{ name: string }>;
  currentMembers?: number;
  maxMembers?: number;
  minMembers?: number;
  feeAmount?: string;
  paymentRequired?: boolean;
  accommodation?: { name: string };
  foodPreference?: string;
  whatsappLink?: string;
}

export function getRegistrationConfirmationTemplate(data: RegistrationEmailData) {
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.registrationId)}`;
  
  const teamSection = data.eventType === 'team' ? `
    <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
      <h3 style="margin-top: 0; color: #856404;">Team Information</h3>
      <p><strong>Team Name:</strong> ${data.teamName || 'N/A'}</p>
      <p><strong>Team Code:</strong> <span style="font-size: 18px; font-weight: bold; color: #0066cc;">${data.teamCode}</span></p>
      <p><strong>Your Role:</strong> ${data.isTeamLead ? 'Team Lead' : 'Team Member'}</p>
      <p><strong>Team Size:</strong> ${data.currentMembers}/${data.maxMembers} members</p>
      ${data.minMembers && data.minMembers > 1 ? `<p style="color: #856404;"><em>⚠️ Minimum ${data.minMembers} members required</em></p>` : ''}
      ${data.isTeamLead ? `
        <div style="background-color: #d1ecf1; border: 1px solid #bee5eb; padding: 10px; margin-top: 10px; border-radius: 4px;">
          <p style="margin: 0; color: #0c5460;"><strong>As Team Lead:</strong> Share the team code <strong>${data.teamCode}</strong> with your team members so they can join!</p>
        </div>
      ` : ''}
    </div>
  ` : '';

  const accommodationSection = data.accommodation ? `
    <p><strong>Accommodation:</strong> ${data.accommodation.name}</p>
  ` : '';

  const foodSection = data.foodPreference && data.foodPreference !== 'No food' ? `
    <p><strong>Food Preference:</strong> ${data.foodPreference}</p>
  ` : '';

  const whatsappSection = data.whatsappLink ? `
    <div style="text-align: center; margin: 20px 0;">
      <a href="${data.whatsappLink}" style="display: inline-block; padding: 12px 30px; background-color: #25D366; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
        📱 Join WhatsApp Group
      </a>
    </div>
  ` : '';

  return {
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 650px; margin: 0 auto; padding: 20px; }
          .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white; 
            padding: 30px 20px; 
            text-align: center; 
            border-radius: 10px 10px 0 0;
          }
          .content { background-color: #ffffff; padding: 30px; border: 1px solid #e0e0e0; }
          .qr-section { 
            text-align: center; 
            padding: 20px; 
            background-color: #f8f9fa; 
            border-radius: 8px;
            margin: 20px 0;
          }
          .qr-code { 
            border: 4px solid #667eea; 
            border-radius: 8px; 
            padding: 10px; 
            background: white;
            display: inline-block;
          }
          .event-details { 
            background-color: #f0f4ff; 
            padding: 20px; 
            border-radius: 8px; 
            margin: 20px 0;
            border-left: 4px solid #667eea;
          }
          .footer { 
            text-align: center; 
            padding: 20px; 
            color: #666; 
            font-size: 12px; 
            background-color: #f8f9fa;
            border-radius: 0 0 10px 10px;
          }
          .button { 
            display: inline-block; 
            padding: 12px 30px; 
            background-color: #667eea; 
            color: white; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 10px 0;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">🎉 Registration Confirmed!</h1>
            <p style="margin: 10px 0 0 0; font-size: 18px;">CSI TKMCE</p>
          </div>
          
          <div class="content">
            <p>Dear <strong>${data.userName}</strong>,</p>
            
            <p>Congratulations! Your registration for <strong>${data.eventName}</strong> has been confirmed successfully.</p>
            
            ${teamSection}
            
            <div class="qr-section">
              <h3 style="margin-top: 0; color: #667eea;">Your Registration QR Code</h3>
              <div class="qr-code">
                <img src="${qrCodeUrl}" alt="Registration QR Code" width="200" height="200" />
              </div>
              <p style="margin: 15px 0 5px 0; color: #666; font-size: 14px;">Registration ID:</p>
              <p style="margin: 0; font-family: monospace; font-size: 16px; font-weight: bold; color: #667eea;">${data.registrationId}</p>
              <p style="margin: 15px 0 0 0; color: #666; font-size: 13px;">
                <em>📱 Save this QR code for event check-in</em>
              </p>
            </div>
            
            <div class="event-details">
              <h3 style="margin-top: 0; color: #667eea;">Event Details</h3>
              <p><strong>Event Name:</strong> ${data.eventName}</p>
              ${data.eventVenue ? `<p><strong>Venue:</strong> ${data.eventVenue}</p>` : ''}
              ${data.eventStartDate ? `<p><strong>Start:</strong> ${data.eventStartDate} at ${data.eventStartTime}</p>` : ''}
              ${data.eventEndDate ? `<p><strong>End:</strong> ${data.eventEndDate} at ${data.eventEndTime}</p>` : ''}
              ${accommodationSection}
              ${foodSection}
            </div>
            
            ${whatsappSection}
            
            <div style="background-color: #e7f3ff; border-left: 4px solid #2196F3; padding: 15px; margin: 20px 0;">
              <h4 style="margin-top: 0; color: #1976D2;">Important Notes:</h4>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>Please bring a valid ID card to the event</li>
                <li>Show your QR code at the registration desk</li>
                <li>Arrive 15 minutes before the event starts</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard" class="button">
                View Dashboard
              </a>
            </div>
          </div>
          
          <div class="footer">
            <p style="margin-top: 15px;">© ${new Date().getFullYear()} CSI TKMCE. All rights reserved.</p>
            <p>This is an automated email, please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Registration Confirmed - CSI TKMCE

Dear ${data.userName},

Congratulations! Your registration for ${data.eventName} has been confirmed successfully.

Registration ID: ${data.registrationId}

${data.eventType === 'team' ? `
TEAM INFORMATION:
- Team Name: ${data.teamName}
- Team Code: ${data.teamCode}
- Your Role: ${data.isTeamLead ? 'Team Lead' : 'Team Member'}
- Team Size: ${data.currentMembers}/${data.maxMembers} members
${data.isTeamLead ? `\nAs Team Lead: Share the team code ${data.teamCode} with your team members!` : ''}
` : ''}

EVENT DETAILS:
- Event: ${data.eventName}
${data.eventVenue ? `- Venue: ${data.eventVenue}` : ''}
${data.eventStartDate ? `- Start: ${data.eventStartDate} at ${data.eventStartTime}` : ''}
${data.eventEndDate ? `- End: ${data.eventEndDate} at ${data.eventEndTime}` : ''}
${data.accommodation ? `- Accommodation: ${data.accommodation.name}` : ''}
${data.foodPreference && data.foodPreference !== 'No food' ? `- Food: ${data.foodPreference}` : ''}

IMPORTANT NOTES:
- Please bring a valid ID card to the event
- Show your QR code (Registration ID: ${data.registrationId}) at the registration desk
- Arrive 15 minutes before the event starts

View your dashboard: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard



© ${new Date().getFullYear()} CSI TKMCE. All rights reserved.
    `
  };
}