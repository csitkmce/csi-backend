import nodemailer from 'nodemailer';

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailOptions) {
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: false, 
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to,
      subject,
      html,
      text,
    });

    console.log('Email sent:', info.messageId);
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
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.7; color: #222; margin: 0; padding: 0; background-color: #f4f4f5; }
          .wrapper { padding: 40px 20px; }
          .container { max-width: 560px; margin: 0 auto; background-color: #fff; border-radius: 8px; overflow: hidden; }
          .header { padding: 40px 40px 20px 40px; }
          .header h1 { margin: 0; font-size: 22px; font-weight: 600; color: #111; }
          .content { padding: 0 40px 40px 40px; }
          .button { 
            display: inline-block; 
            padding: 14px 32px; 
            background-color: #2563eb; 
            color: #ffffff !important; 
            text-decoration: none; 
            border-radius: 6px; 
            font-weight: 600;
            font-size: 14px;
          }
          .footer { text-align: center; padding: 24px 40px; color: #999; font-size: 12px; }
          .divider { height: 1px; background-color: #eee; margin: 24px 0; }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="container">
            <div class="header">
              <h1>Password Reset Request</h1>
            </div>
            <div class="content">
              <p>Hi ${userName},</p>
              <p>We received a request to reset your password. Click the button below to create a new password:</p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${resetLink}" class="button">Reset Password</a>
              </div>
              <p style="font-size: 13px; color: #666;">Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; font-size: 13px; color: #2563eb;">${resetLink}</p>
              <div class="divider"></div>
              <p style="font-size: 13px; color: #666;"><strong>This link will expire in 15 minutes.</strong></p>
              <p style="font-size: 13px; color: #666;">If you didn't request a password reset, you can safely ignore this email.</p>
            </div>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} CSI TKMCE. All rights reserved.</p>
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
    <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <h3 style="margin: 0 0 12px 0; font-size: 15px; font-weight: 600; color: #111;">Team Information</h3>
      <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
        <tr><td style="padding: 6px 0; color: #666;">Team Name</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${data.teamName || 'N/A'}</td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Team Code</td><td style="padding: 6px 0; font-weight: 600; text-align: right; font-family: monospace; font-size: 16px; color: #2563eb;">${data.teamCode}</td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Your Role</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${data.isTeamLead ? 'Team Lead' : 'Team Member'}</td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Team Size</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${data.currentMembers} / ${data.maxMembers}</td></tr>
      </table>
      ${data.minMembers && data.minMembers > 1 ? `<p style="margin: 12px 0 0 0; font-size: 13px; color: #666;"><em>Minimum ${data.minMembers} members required</em></p>` : ''}
      ${data.isTeamLead ? `
        <div style="margin-top: 16px; padding: 12px; background-color: #eff6ff; border-radius: 6px;">
          <p style="margin: 0; font-size: 13px; color: #1e40af;"><strong>As Team Lead:</strong> Share the team code <strong>${data.teamCode}</strong> with your team members so they can join.</p>
        </div>
      ` : ''}
    </div>
  ` : '';

  const accommodationSection = data.accommodation ? `
    <tr><td style="padding: 6px 0; color: #666;">Accommodation</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${data.accommodation.name}</td></tr>
  ` : '';

  const foodSection = data.foodPreference && data.foodPreference !== 'No food' ? `
    <tr><td style="padding: 6px 0; color: #666;">Food Preference</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${data.foodPreference}</td></tr>
  ` : '';

  const whatsappSection = data.whatsappLink ? `
    <div style="text-align: center; margin: 24px 0;">
      <a href="${data.whatsappLink}" style="display: inline-block; padding: 14px 32px; background-color: #22c55e; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
        Join WhatsApp Group
      </a>
    </div>
  ` : '';

  return {
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.7; color: #222; margin: 0; padding: 0; background-color: #f4f4f5; }
          .wrapper { padding: 40px 20px; }
          .container { max-width: 560px; margin: 0 auto; background-color: #fff; border-radius: 8px; overflow: hidden; }
          .header { padding: 40px 40px 20px 40px; }
          .header h1 { margin: 0; font-size: 22px; font-weight: 600; color: #111; }
          .header p { margin: 6px 0 0 0; font-size: 14px; color: #666; }
          .content { padding: 0 40px 40px 40px; }
          .qr-section { 
            text-align: center; 
            padding: 24px;
            background-color: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            margin: 24px 0;
          }
          .divider { height: 1px; background-color: #eee; margin: 24px 0; }
          .footer { text-align: center; padding: 24px 40px; color: #999; font-size: 12px; }
          .button { 
            display: inline-block; 
            padding: 14px 32px; 
            background-color: #2563eb; 
            color: #ffffff !important; 
            text-decoration: none; 
            border-radius: 6px; 
            font-weight: 600;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="container">
            <div class="header">
              <h1>Registration Confirmed</h1>
              <p>CSI TKMCE</p>
            </div>
            
            <div class="content">
              <p>Dear <strong>${data.userName}</strong>,</p>
              <p>Your registration for <strong>${data.eventName}</strong> has been confirmed.</p>
              
              ${teamSection}
              
              <div class="qr-section">
                <p style="margin: 0 0 16px 0; font-size: 14px; font-weight: 600; color: #111;">Your Registration QR Code</p>
                <div style="display: inline-block; padding: 8px; border: 1px solid #e5e7eb; border-radius: 6px; background: #fff;">
                  <img src="${qrCodeUrl}" alt="Registration QR Code" width="180" height="180" />
                </div>
                <p style="margin: 16px 0 0 0; font-size: 12px; color: #999;">Registration ID</p>
                <p style="margin: 4px 0 0 0; font-family: monospace; font-size: 14px; font-weight: 600; color: #111;">${data.registrationId}</p>
              </div>
              
              <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 24px 0;">
                <h3 style="margin: 0 0 12px 0; font-size: 15px; font-weight: 600; color: #111;">Event Details</h3>
                <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
                  <tr><td style="padding: 6px 0; color: #666;">Event</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${data.eventName}</td></tr>
                  ${data.eventVenue ? `<tr><td style="padding: 6px 0; color: #666;">Venue</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${data.eventVenue}</td></tr>` : ''}
                  ${data.eventStartDate ? `<tr><td style="padding: 6px 0; color: #666;">Starts</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${data.eventStartDate} at ${data.eventStartTime}</td></tr>` : ''}
                  ${data.eventEndDate ? `<tr><td style="padding: 6px 0; color: #666;">Ends</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${data.eventEndDate} at ${data.eventEndTime}</td></tr>` : ''}
                  ${accommodationSection}
                  ${foodSection}
                </table>
              </div>
              
              ${whatsappSection}
              
              <div class="divider"></div>
              
              <p style="font-size: 13px; color: #666; margin: 0;"><strong>Before the event:</strong></p>
              <ul style="margin: 8px 0 0 0; padding-left: 20px; font-size: 13px; color: #666;">
                <li>Bring a valid ID card</li>
                <li>Show your QR code at the registration desk</li>
                <li>Arrive 15 minutes early</li>
              </ul>
              
              <div style="text-align: center; margin-top: 32px;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/" class="button">
                  View Dashboard
                </a>
              </div>
            </div>
          </div>
          
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} CSI TKMCE. All rights reserved.</p>
            <p>This is an automated email, please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Registration Confirmed - CSI TKMCE

Dear ${data.userName},

Your registration for ${data.eventName} has been confirmed.

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

BEFORE THE EVENT:
- Bring a valid ID card
- Show your QR code at the registration desk
- Arrive 15 minutes early

View your dashboard: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/

© ${new Date().getFullYear()} CSI TKMCE. All rights reserved.
    `
  };
}

// Execom Application Confirmation Email Template
interface ExecomApplicationEmailData {
  userName: string;
  userEmail: string;
  preference1: string;
  preference2: string;
  preference3?: string | null;
  registrationId: string;
  whatsappLink?: string;
}

export function getExecomApplicationConfirmationTemplate(data: ExecomApplicationEmailData) {
  return {
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.7; color: #222; margin: 0; padding: 0; background-color: #f4f4f5; }
          .wrapper { padding: 40px 20px; }
          .container { max-width: 560px; margin: 0 auto; background-color: #fff; border-radius: 8px; overflow: hidden; }
          .header { padding: 40px 40px 20px 40px; }
          .header h1 { margin: 0; font-size: 22px; font-weight: 600; color: #111; }
          .header p { margin: 6px 0 0 0; font-size: 14px; color: #666; }
          .content { padding: 0 40px 40px 40px; }
          .divider { height: 1px; background-color: #eee; margin: 24px 0; }
          .footer { text-align: center; padding: 24px 40px; color: #999; font-size: 12px; }
          .pref-number {
            display: inline-block;
            width: 26px;
            height: 26px;
            line-height: 26px;
            text-align: center;
            background-color: #2563eb;
            color: #fff;
            border-radius: 50%;
            font-weight: 600;
            font-size: 13px;
            margin-right: 12px;
          }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="container">
            <div class="header">
              <h1>Application Received</h1>
              <p>CSI TKMCE Execom Recruitment</p>
            </div>
            
            <div class="content">
              <p>Dear <strong>${data.userName}</strong>,</p>
              <p>Thank you for applying for the <strong>CSI TKMCE Executive Committee</strong>. Your application has been received.</p>
              
              <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 24px 0;">
                <h3 style="margin: 0 0 16px 0; font-size: 15px; font-weight: 600; color: #111;">Your Preferences</h3>
                <div style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
                  <span class="pref-number">1</span>
                  <strong>${data.preference1}</strong>
                </div>
                <div style="padding: 10px 0;${data.preference3 ? ' border-bottom: 1px solid #e5e7eb;' : ''}">
                  <span class="pref-number">2</span>
                  <strong>${data.preference2}</strong>
                </div>
                ${data.preference3 ? `
                <div style="padding: 10px 0;">
                  <span class="pref-number">3</span>
                  <strong>${data.preference3}</strong>
                </div>
                ` : ''}
              </div>
              
              <div class="divider"></div>
              
              <p style="font-size: 13px; color: #666; margin: 0;"><strong>What happens next?</strong></p>
              <ul style="margin: 8px 0 0 0; padding-left: 20px; font-size: 13px; color: #666;">
                <li>Our team will review all applications carefully</li>
                <li>Shortlisted candidates may be contacted for further rounds</li>
                <li>Further updates and information will be shared in the WhatsApp group</li>
                <li>Final selections will be announced soon</li>
              </ul>
              
              ${data.whatsappLink ? `
              <div style="text-align: center; margin: 28px 0 0 0;">
                <a href="${data.whatsappLink}" style="display: inline-block; padding: 14px 32px; background-color: #22c55e; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
                  Join WhatsApp Group
                </a>
              </div>
              ` : ''}
              
              <div class="divider"></div>
              
              <p style="font-size: 12px; color: #999; margin: 0;">Registration ID: <strong style="color: #111; font-family: monospace;">${data.registrationId}</strong></p>
            </div>
          </div>
          
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} CSI TKMCE. All rights reserved.</p>
            <p>This is an automated email, please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Execom Application Received - CSI TKMCE

Dear ${data.userName},

Thank you for applying for the CSI TKMCE Executive Committee. Your application has been received.

YOUR PREFERENCES:
1. ${data.preference1}
2. ${data.preference2}
${data.preference3 ? `3. ${data.preference3}` : ''}

WHAT HAPPENS NEXT:
- Our team will review all applications carefully
- Shortlisted candidates may be contacted for further rounds
- Further updates and information will be shared in the WhatsApp group
- Final selections will be announced soon
${data.whatsappLink ? `
Join the WhatsApp group: ${data.whatsappLink}` : ''}

Registration ID: ${data.registrationId}

© ${new Date().getFullYear()} CSI TKMCE. All rights reserved.
    `
  };
}