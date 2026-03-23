import nodemailer from 'nodemailer'
import config from './env.js'

const { GMAIL_USER, GMAIL_APP_PASSWORD, CLIENT_URL } = config

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD,
  },
})

async function sendVerificationEmail(to, token) {
  const verifyUrl = `${CLIENT_URL}/project/4/verify/${token}`
  await transporter.sendMail({
    from: `"ChatApp" <${GMAIL_USER}>`,
    to,
    subject: 'Verify your email',
    html: `
      <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0f172a;color:#e2e8f0;border-radius:16px;">
        <h2 style="color:#38bdf8;margin-bottom:16px;">Verify Your Email</h2>
        <p>Click the button below to verify your email address and activate your account.</p>
        <a href="${verifyUrl}" style="display:inline-block;margin-top:20px;padding:12px 28px;background:linear-gradient(135deg,#6366f1,#0ea5e9);color:#0f172a;font-weight:600;border-radius:12px;text-decoration:none;">Verify Email</a>
        <p style="margin-top:24px;font-size:13px;color:#94a3b8;">If you didn't create an account, you can safely ignore this email.</p>
      </div>
    `,
  })
}

async function sendResetEmail(to, token) {
  const resetUrl = `${CLIENT_URL}/project/4/reset-password/${token}`
  await transporter.sendMail({
    from: `"ChatApp" <${GMAIL_USER}>`,
    to,
    subject: 'Reset your password',
    html: `
      <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0f172a;color:#e2e8f0;border-radius:16px;">
        <h2 style="color:#38bdf8;margin-bottom:16px;">Reset Your Password</h2>
        <p>Click the button below to reset your password. This link expires in 1 hour.</p>
        <a href="${resetUrl}" style="display:inline-block;margin-top:20px;padding:12px 28px;background:linear-gradient(135deg,#6366f1,#0ea5e9);color:#0f172a;font-weight:600;border-radius:12px;text-decoration:none;">Reset Password</a>
        <p style="margin-top:24px;font-size:13px;color:#94a3b8;">If you didn't request a password reset, you can safely ignore this email.</p>
      </div>
    `,
  })
}

export { sendVerificationEmail, sendResetEmail }
