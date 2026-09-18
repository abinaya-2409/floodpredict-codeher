import nodemailer from 'nodemailer';

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  previewUrl?: string;   // Ethereal preview URL when using test transport
  error?: string;
  configured: boolean;
  channel: 'smtp' | 'ethereal' | 'unconfigured';
}

/* ---------------------------------------------------------------------------
 * Authorized email addresses allowed to receive OTPs
 * Only these addresses will receive verification emails.
 * Add more as needed.
 * ------------------------------------------------------------------------ */
export const AUTHORIZED_EMAILS: ReadonlySet<string> = new Set([
  'bhavanasri522@gmail.com',
  'itsabinaya24@gmail.com',
]);

/* ---------------------------------------------------------------------------
 * JalRakshak AI Dedicated Ethereal Test Account
 * This is a real SMTP service (smtp.ethereal.email) that captures emails
 * and makes them viewable at the preview URL. It does NOT deliver to real
 * inboxes. Use Gmail App Password env vars for live inbox delivery.
 * ------------------------------------------------------------------------ */
const ETHEREAL_SMTP = {
  host: 'smtp.ethereal.email',
  port: 587,
  secure: false,
  user: 'ivmffylzwojpqoum@ethereal.email',
  pass: 'Vvsrz2AyUqqeXzCM9b',
  from: '"JalRakshak AI Alert System" <ivmffylzwojpqoum@ethereal.email>',
};

/**
 * Creates an outbound email transporter.
 *
 * Priority order:
 * 1. Gmail App Password (GMAIL_USER + GMAIL_APP_PASSWORD) → real inbox delivery
 * 2. Generic SMTP (SMTP_HOST etc.)                        → real inbox delivery
 * 3. Ethereal fallback (hardcoded above)                  → preview URL only
 */
function createTransporter(): {
  transporter: nodemailer.Transporter;
  fromAddress: string;
  channel: 'smtp' | 'ethereal';
} {
  // --- Option A: Gmail App Password ---
  const gmailUser = process.env.GMAIL_USER?.trim();
  const gmailPass = process.env.GMAIL_APP_PASSWORD?.trim().replace(/\s+/g, '');
  if (gmailUser && gmailPass) {
    return {
      transporter: nodemailer.createTransport({
        service: 'gmail',
        auth: { user: gmailUser, pass: gmailPass },
        connectionTimeout: 8000,
      }),
      fromAddress: `"JalRakshak AI Alert System" <${gmailUser}>`,
      channel: 'smtp',
    };
  }

  // --- Option B: Custom SMTP ---
  const smtpHost = process.env.SMTP_HOST?.trim();
  const smtpPort = Number(process.env.SMTP_PORT) || 587;
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();
  const smtpFrom = process.env.SMTP_FROM?.trim() || smtpUser;
  if (smtpHost && smtpUser && smtpPass) {
    return {
      transporter: nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
        connectionTimeout: 8000,
      }),
      fromAddress: `"JalRakshak AI Alert System" <${smtpFrom}>`,
      channel: 'smtp',
    };
  }

  // --- Fallback: Ethereal test account (always available) ---
  return {
    transporter: nodemailer.createTransport({
      host: ETHEREAL_SMTP.host,
      port: ETHEREAL_SMTP.port,
      secure: ETHEREAL_SMTP.secure,
      auth: { user: ETHEREAL_SMTP.user, pass: ETHEREAL_SMTP.pass },
      connectionTimeout: 3000,
      socketTimeout: 3000,
    }),
    fromAddress: ETHEREAL_SMTP.from,
    channel: 'ethereal',
  };
}

function buildEmailHtml(otpCode: string, toEmail: string, wardName?: string): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>JalRakshak AI – Verification Code</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #080f1a; color: #e2e8f0; margin: 0; padding: 24px; }
        .container { max-width: 560px; margin: 0 auto; background: #0f1c2e; border: 1px solid #1e3a5f; border-radius: 16px; overflow: hidden; }
        .header { background: linear-gradient(135deg, #0d9488, #0284c7); padding: 28px 24px; text-align: center; }
        .header h1 { margin: 0; color: #fff; font-size: 24px; font-weight: 800; }
        .header p { margin: 6px 0 0; color: #e0f2fe; font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; }
        .content { padding: 32px 24px; }
        .otp-badge { background: #080f1a; border: 2px solid #14b8a6; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0; }
        .otp-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 10px; }
        .otp-code { font-size: 42px; font-weight: 900; letter-spacing: 12px; color: #38bdf8; font-family: 'Courier New', monospace; }
        .ward-tag { display: inline-block; background: #1e293b; color: #38bdf8; padding: 4px 14px; border-radius: 9999px; font-size: 12px; font-weight: 600; margin-top: 12px; }
        .info { color: #94a3b8; font-size: 14px; line-height: 1.7; margin: 0 0 12px; }
        .meta { color: #64748b; font-size: 12px; line-height: 1.6; }
        .alert-box { background: rgba(239,68,68,.08); border-left: 3px solid #ef4444; padding: 12px 16px; border-radius: 6px; margin: 20px 0; font-size: 13px; color: #fca5a5; }
        .footer { background: #080f1a; padding: 16px 24px; text-align: center; font-size: 11px; color: #475569; border-top: 1px solid #1e293b; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🌊 JalRakshak AI</h1>
          <p>Chennai Flood Alert &amp; Inundation Defense System</p>
        </div>
        <div class="content">
          <p class="info">Hello <strong>${toEmail}</strong>,</p>
          <p class="info">Your one-time verification code to access the <strong>JalRakshak AI</strong> Flood Risk Portal is:</p>

          <div class="otp-badge">
            <div class="otp-label">Verification Code</div>
            <div class="otp-code">${otpCode}</div>
            ${wardName ? `<div class="ward-tag">📍 Ward: ${wardName}</div>` : ''}
          </div>

          <p class="info">This code expires in <strong>5 minutes</strong>. Do not share it with anyone.</p>

          <div class="alert-box">
            <strong>🚨 Emergency Helplines</strong><br>
            GCC Control Room: <strong>1913</strong> &nbsp;|&nbsp; Disaster Management: <strong>1077</strong>
          </div>

          <p class="meta">If you did not request this code, please ignore this email.</p>
        </div>
        <div class="footer">
          JalRakshak AI &bull; Greater Chennai Corporation &amp; TNSDMA Hydrological Defense
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Sends a real OTP email to an authorized address.
 * Falls back to Ethereal (preview URL) if no Gmail/SMTP credentials are set.
 */
export async function sendOtpEmail(
  toEmail: string,
  otpCode: string,
  wardName?: string
): Promise<EmailSendResult> {
  const { transporter, fromAddress, channel } = createTransporter();

  const htmlContent = buildEmailHtml(otpCode, toEmail, wardName);

  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to: toEmail,
      subject: `[JalRakshak AI] ${otpCode} – Your Flood Portal Verification Code`,
      text: `Your JalRakshak AI verification code is: ${otpCode}. Valid for 5 minutes. Emergency: GCC 1913 / Disaster 1077.`,
      html: htmlContent,
    });

    const previewUrl = channel === 'ethereal'
      ? nodemailer.getTestMessageUrl(info) as string
      : undefined;

    if (previewUrl) {
      console.log(`\n[JalRakshak Email] ✅ OTP email captured by Ethereal for ${toEmail}`);
      console.log(`[JalRakshak Email] 👁  Preview URL: ${previewUrl}\n`);
    } else {
      console.log(`[JalRakshak Email] ✅ OTP email delivered to real inbox: ${toEmail} (ID: ${info.messageId})`);
    }

    return {
      success: true,
      configured: true,
      channel,
      messageId: info.messageId,
      previewUrl,
    };
  } catch (error: any) {
    console.error(`[JalRakshak Email] ❌ Failed to send to ${toEmail}:`, error?.message);
    return {
      success: false,
      configured: true,
      channel,
      error: error?.message || 'SMTP transmission error',
    };
  }
}
