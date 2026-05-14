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
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #000; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #000; color: #fff; padding: 20px; text-align: center; }
          .content { background-color: #fff; padding: 30px; border: 1px solid #000; }
          .button { 
            display: inline-block; 
            padding: 12px 30px; 
            background-color: #000; 
            color: #fff; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 20px 0;
          }
          .footer { text-align: center; padding: 20px; color: #555; font-size: 12px; }
          .warning { color: #000; font-weight: bold; }
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
            <p style="word-break: break-all; color: #000;">${resetLink}</p>
            <p class="warning">This link will expire in 15 minutes.</p>
            <p>If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.</p>
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
    <div style="border: 1px solid #000; padding: 15px; margin: 20px 0;">
      <h3 style="margin-top: 0; color: #000;">Team Information</h3>
      <p><strong>Team Name:</strong> ${data.teamName || 'N/A'}</p>
      <p><strong>Team Code:</strong> <span style="font-size: 18px; font-weight: bold; color: #000;">${data.teamCode}</span></p>
      <p><strong>Your Role:</strong> ${data.isTeamLead ? 'Team Lead' : 'Team Member'}</p>
      <p><strong>Team Size:</strong> ${data.currentMembers}/${data.maxMembers} members</p>
      ${data.minMembers && data.minMembers > 1 ? `<p><em>Minimum ${data.minMembers} members required</em></p>` : ''}
      ${data.isTeamLead ? `
        <div style="border-top: 1px solid #ccc; padding-top: 10px; margin-top: 10px;">
          <p style="margin: 0;"><strong>As Team Lead:</strong> Share the team code <strong>${data.teamCode}</strong> with your team members so they can join!</p>
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
      <a href="${data.whatsappLink}" style="display: inline-block; padding: 12px 30px; background-color: #000; color: #fff; text-decoration: none; border-radius: 5px; font-weight: bold;">
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
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #000; }
          .container { max-width: 650px; margin: 0 auto; padding: 20px; }
          .header { 
            background-color: #000;
            color: #fff; 
            padding: 30px 20px; 
            text-align: center; 
          }
          .content { background-color: #fff; padding: 30px; border: 1px solid #000; border-top: none; }
          .qr-section { 
            text-align: center; 
            padding: 20px; 
            border: 1px solid #ccc;
            margin: 20px 0;
          }
          .qr-code { 
            border: 2px solid #000; 
            padding: 10px; 
            background: #fff;
            display: inline-block;
          }
          .event-details { 
            padding: 20px; 
            margin: 20px 0;
            border-left: 3px solid #000;
          }
          .footer { 
            text-align: center; 
            padding: 20px; 
            color: #555; 
            font-size: 12px; 
          }
          .button { 
            display: inline-block; 
            padding: 12px 30px; 
            background-color: #000; 
            color: #fff; 
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
            <h1 style="margin: 0;">Registration Confirmed</h1>
            <p style="margin: 10px 0 0 0; font-size: 18px;">CSI TKMCE</p>
          </div>
          
          <div class="content">
            <p>Dear <strong>${data.userName}</strong>,</p>
            
            <p>Your registration for <strong>${data.eventName}</strong> has been confirmed successfully.</p>
            
            ${teamSection}
            
            <div class="qr-section">
              <h3 style="margin-top: 0; color: #000;">Your Registration QR Code</h3>
              <div class="qr-code">
                <img src="${qrCodeUrl}" alt="Registration QR Code" width="200" height="200" />
              </div>
              <p style="margin: 15px 0 5px 0; color: #555; font-size: 14px;">Registration ID:</p>
              <p style="margin: 0; font-family: monospace; font-size: 16px; font-weight: bold; color: #000;">${data.registrationId}</p>
              <p style="margin: 15px 0 0 0; color: #555; font-size: 13px;">
                <em>Save this QR code for event check-in</em>
              </p>
            </div>
            
            <div class="event-details">
              <h3 style="margin-top: 0; color: #000;">Event Details</h3>
              <p><strong>Event Name:</strong> ${data.eventName}</p>
              ${data.eventVenue ? `<p><strong>Venue:</strong> ${data.eventVenue}</p>` : ''}
              ${data.eventStartDate ? `<p><strong>Start:</strong> ${data.eventStartDate} at ${data.eventStartTime}</p>` : ''}
              ${data.eventEndDate ? `<p><strong>End:</strong> ${data.eventEndDate} at ${data.eventEndTime}</p>` : ''}
              ${accommodationSection}
              ${foodSection}
            </div>
            
            ${whatsappSection}
            
            <div style="border-left: 3px solid #000; padding: 15px; margin: 20px 0;">
              <h4 style="margin-top: 0; color: #000;">Important Notes</h4>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>Please bring a valid ID card to the event</li>
                <li>Show your QR code at the registration desk</li>
                <li>Arrive 15 minutes before the event starts</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/" class="button">
                View Dashboard
              </a>
            </div>
          </div>
          
          <div class="footer">
            <p style="margin-top: 15px;">&copy; ${new Date().getFullYear()} CSI TKMCE. All rights reserved.</p>
            <p>This is an automated email, please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Registration Confirmed - CSI TKMCE

Dear ${data.userName},

Your registration for ${data.eventName} has been confirmed successfully.

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
}

export function getExecomApplicationConfirmationTemplate(data: ExecomApplicationEmailData) {
  return {
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #000; }
          .container { max-width: 650px; margin: 0 auto; padding: 20px; }
          .header { 
            background-color: #000;
            color: #fff; 
            padding: 30px 20px; 
            text-align: center; 
          }
          .content { background-color: #fff; padding: 30px; border: 1px solid #000; border-top: none; }
          .preferences { 
            padding: 20px; 
            margin: 20px 0;
            border-left: 3px solid #000;
          }
          .preference-item {
            padding: 8px 0;
            border-bottom: 1px solid #ccc;
          }
          .preference-item:last-child { border-bottom: none; }
          .preference-rank {
            display: inline-block;
            width: 28px;
            height: 28px;
            line-height: 28px;
            text-align: center;
            background-color: #000;
            color: #fff;
            border-radius: 50%;
            font-weight: bold;
            margin-right: 12px;
            font-size: 14px;
          }
          .footer { 
            text-align: center; 
            padding: 20px; 
            color: #555; 
            font-size: 12px; 
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">Application Received</h1>
            <p style="margin: 10px 0 0 0; font-size: 18px;">CSI TKMCE Execom Recruitment</p>
          </div>
          
          <div class="content">
            <p>Dear <strong>${data.userName}</strong>,</p>
            
            <p>Thank you for applying for the <strong>CSI TKMCE Executive Committee</strong>. Your application has been received successfully.</p>
            
            <div class="preferences">
              <h3 style="margin-top: 0; color: #000;">Your Preferences</h3>
              <div class="preference-item">
                <span class="preference-rank">1</span>
                <strong>${data.preference1}</strong>
              </div>
              <div class="preference-item">
                <span class="preference-rank">2</span>
                <strong>${data.preference2}</strong>
              </div>
              ${data.preference3 ? `
              <div class="preference-item">
                <span class="preference-rank">3</span>
                <strong>${data.preference3}</strong>
              </div>
              ` : ''}
            </div>
            
            <div style="border-left: 3px solid #000; padding: 15px; margin: 20px 0;">
              <h4 style="margin-top: 0; color: #000;">What's Next?</h4>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>Our team will review all applications carefully</li>
                <li>Shortlisted candidates may be contacted for further rounds</li>
                <li>Final selections will be announced soon</li>
              </ul>
            </div>
            
            <p style="color: #555; font-size: 14px;">Registration ID: <strong style="color: #000; font-family: monospace;">${data.registrationId}</strong></p>
          </div>
          
          <div class="footer">
            <p style="margin-top: 15px;">&copy; ${new Date().getFullYear()} CSI TKMCE. All rights reserved.</p>
            <p>This is an automated email, please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Execom Application Received - CSI TKMCE

Dear ${data.userName},

Thank you for applying for the CSI TKMCE Executive Committee. Your application has been received successfully.

YOUR PREFERENCES:
1. ${data.preference1}
2. ${data.preference2}
${data.preference3 ? `3. ${data.preference3}` : ''}

WHAT'S NEXT:
- Our team will review all applications carefully
- Shortlisted candidates may be contacted for further rounds
- Final selections will be announced soon

Registration ID: ${data.registrationId}

© ${new Date().getFullYear()} CSI TKMCE. All rights reserved.
    `
  };
}