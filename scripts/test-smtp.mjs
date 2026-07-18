import { config as loadEnv } from "dotenv";
import nodemailer from "nodemailer";

loadEnv({ path: ".env" });

const host = process.env.EMAIL_HOST || process.env.SMTP_HOST;
const port = parseInt(process.env.EMAIL_PORT || process.env.SMTP_PORT || "587");
const user = process.env.EMAIL_USER || process.env.SMTP_USER;
const pass = process.env.EMAIL_PASSWORD || process.env.SMTP_PASS;
const secure = (process.env.EMAIL_SECURE || process.env.SMTP_SECURE) === "true";

console.log("Using SMTP config:", { host, port, secure, user, from: process.env.EMAIL_FROM });

const transporter = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: { user, pass },
  tls: { rejectUnauthorized: false },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
});

try {
  await transporter.verify();
  console.log("\nSMTP verify: SUCCESS - the server accepted the connection and login.");

  if (process.argv.includes("--send")) {
    const to = process.env.SMTP_TEST_TO || user;
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject: "RETC Asset Management - SMTP test",
      text: "This is a test email confirming the RETC Asset Management email configuration works.",
    });
    console.log(`Test email SENT to ${to}. messageId=${info.messageId}`);
  }
} catch (err) {
  console.error("\nSMTP verify/send: FAILED -", err?.message || err);
  process.exitCode = 1;
}
