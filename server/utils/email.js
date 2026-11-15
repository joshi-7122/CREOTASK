/* =========================================================
   CREOTASK — Email service (Nodemailer)
   In development, logs to console instead of sending real email.
   Swap SMTP config in .env to send real emails.
   ========================================================= */
"use strict";
const nodemailer = require("nodemailer");

let transporter;

function getTransporter() {
  if (transporter) return transporter;
  if (process.env.NODE_ENV === "development" && !process.env.SMTP_USER?.includes("@") ) {
    // Use Ethereal (auto) in dev when no real SMTP config given
    transporter = nodemailer.createTransport({
      host: "localhost",
      port: 1025,
      ignoreTLS: true,
    });
  } else {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

/** In NODE_ENV=test, mail is captured here instead of sent (tests read tokens from it). */
const outbox = [];

const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function sendMail({ to, subject, html, text }) {
  if (process.env.NODE_ENV === "test") {
    outbox.push({ to, subject, text, html, at: Date.now() });
    return;
  }
  if (process.env.NODE_ENV === "development") {
    // Always log in dev so the developer can grab the token
    console.log(`\n📧  [EMAIL] To: ${to}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   ${text || "(html only)"}\n`);
    return;
  }
  const t = getTransporter();
  await t.sendMail({
    from: process.env.EMAIL_FROM || "CreoTask <noreply@creotask.in>",
    to,
    subject,
    html,
    text,
  });
}

async function sendVerificationEmail(email, token) {
  const link = `${process.env.CLIENT_ORIGIN || "http://localhost:3000"}/verify-email?token=${token}`;
  await sendMail({
    to: email,
    subject: "Verify your CreoTask account",
    text: `Click the link to verify your email: ${link}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#f5b301">Verify your CreoTask email</h2>
        <p>Click the button below to activate your account. This link expires in 24 hours.</p>
        <a href="${link}" style="display:inline-block;padding:12px 24px;background:#f5b301;color:#111;text-decoration:none;border-radius:8px;font-weight:600">Verify Email</a>
        <p style="color:#999;font-size:12px;margin-top:24px">If you didn't create a CreoTask account, ignore this email.</p>
      </div>
    `,
  });
}

async function sendPasswordResetEmail(email, token) {
  const link = `${process.env.CLIENT_ORIGIN || "http://localhost:3000"}/reset-password?token=${token}`;
  await sendMail({
    to: email,
    subject: "Reset your CreoTask password",
    text: `Reset your password: ${link} (expires in 1 hour)`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#f5b301">Reset your password</h2>
        <p>Click the button below to set a new password. This link expires in 1 hour.</p>
        <a href="${link}" style="display:inline-block;padding:12px 24px;background:#f5b301;color:#111;text-decoration:none;border-radius:8px;font-weight:600">Reset Password</a>
        <p style="color:#999;font-size:12px;margin-top:24px">If you didn't request this, ignore this email.</p>
      </div>
    `,
  });
}

async function sendPasswordChangedEmail(email) {
  await sendMail({
    to: email,
    subject: "Your CreoTask password was changed",
    text: "Your CreoTask password was just changed and other sessions were signed out. If this wasn't you, reset your password immediately and contact support.",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#f5b301">Your password was changed</h2>
        <p>Your CreoTask password was just changed and your other sessions were signed out.</p>
        <p>If this wasn't you, reset your password immediately and contact support.</p>
      </div>
    `,
  });
}

async function sendOfferEmail(email, projectTitle, offerLink) {
  await sendMail({
    to: email,
    subject: `You've received an offer for "${projectTitle}"`,
    text: `View and accept your offer: ${offerLink}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#f5b301">You have a new offer!</h2>
        <p>A client has sent you an offer for <strong>${escHtml(projectTitle)}</strong>. Review the terms and accept within 72 hours.</p>
        <a href="${offerLink}" style="display:inline-block;padding:12px 24px;background:#f5b301;color:#111;text-decoration:none;border-radius:8px;font-weight:600">View Offer</a>
      </div>
    `,
  });
}

module.exports = { sendMail, sendVerificationEmail, sendPasswordResetEmail, sendPasswordChangedEmail, sendOfferEmail, outbox };
