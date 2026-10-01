import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transporter = null;

function smtpTransport() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.mail.host,
      port: env.mail.port,
      secure: env.mail.port === 465,
      auth: { user: env.mail.user, pass: env.mail.pass },
    });
  }
  return transporter;
}

async function postJson(url, headers, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`${res.status} ${data.message || data.error || res.statusText}`);
  }
}

/**
 * One message to one recipient. SMTP works locally; hosts that block SMTP (Render's
 * free plan) can use Brevo or Resend, which send over HTTPS.
 */
const PROVIDERS = {
  smtp: ({ to, subject, text, html }) =>
    smtpTransport().sendMail({ from: `"${env.mail.fromName}" <${env.mail.from}>`, to, subject, text, html }),
  brevo: ({ to, subject, text, html }) =>
    postJson(
      'https://api.brevo.com/v3/smtp/email',
      { 'api-key': env.mail.brevoKey },
      {
        sender: { name: env.mail.fromName, email: env.mail.from },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
      },
    ),
  resend: ({ to, subject, text, html }) =>
    postJson(
      'https://api.resend.com/emails',
      { Authorization: `Bearer ${env.mail.resendKey}` },
      { from: `${env.mail.fromName} <${env.mail.from}>`, to: [to], subject, html, text },
    ),
};

const escape = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Minimal branded HTML wrapper so emails look consistent. */
function layout({ heading, lines = [], cta }) {
  const rows = lines.map((line) => `<p style="margin:0 0 10px;color:#334155;font-size:14px;line-height:1.6">${line}</p>`).join('');
  const button = cta
    ? `<a href="${escape(cta.href)}" style="display:inline-block;margin-top:12px;padding:10px 18px;background:#8245ec;color:#ffffff;border-radius:10px;font-weight:600;text-decoration:none">${escape(cta.label)}</a>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f1f5f4;font-family:Segoe UI,Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
    <div style="padding:18px 24px;background:#050414;color:#fff;font-weight:700;font-size:18px">Eco<span style="color:#9b6ff1">AI</span></div>
    <div style="padding:24px">
      <h2 style="margin:0 0 14px;color:#0f172a;font-size:18px">${escape(heading)}</h2>
      ${rows}${button}
    </div>
    <div style="padding:14px 24px;background:#f8fafc;color:#94a3b8;font-size:12px">You receive this because of your EcoAI account or role.</div>
  </div></body></html>`;
}

/**
 * Sends an email. Never throws: email is best-effort and must not break the request
 * that triggered it. Each recipient gets their own copy so addresses stay private.
 */
export async function sendMail({ to, subject, text, heading, lines, cta }) {
  const recipients = [...new Set([].concat(to).filter(Boolean))];
  if (!env.mail.enabled || recipients.length === 0) return false;
  const html = layout({ heading: heading || subject, lines: lines || [escape(text)], cta });
  const send = PROVIDERS[env.mail.provider];
  const results = await Promise.allSettled(recipients.map((addr) => send({ to: addr, subject, text, html })));
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length) console.error(`[mail] "${subject}" failed for ${failed.length}/${recipients.length} recipient(s): ${failed[0].reason?.message}`);
  return failed.length < recipients.length;
}

export { escape as escapeHtml };
