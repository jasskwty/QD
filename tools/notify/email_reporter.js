#!/usr/bin/env node
// Sends a report to the owner's email (Resend API), or to Telegram if no email service is set.
// Usage: node tools/notify/email_reporter.js "<subject>" [--file report.md | "<body text>"]
// Settings come from environment variables only (the repo is public, so never put them in a file):
//   OWNER_EMAIL       where the report goes
//   RESEND_API_KEY    key from resend.com (free tier); REPORT_FROM optional, default "QD Office <onboarding@resend.dev>"
//   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID   used when there is no email setup
// With nothing set it prints the report (dry run) and exits 0, so agents never fail because of it.
import fs from 'node:fs/promises';

const [subject = 'تقرير الديوانية', ...rest] = process.argv.slice(2);
const fileIdx = rest.indexOf('--file');
const body = fileIdx >= 0 ? await fs.readFile(rest[fileIdx + 1], 'utf8') : (rest.join(' ') || '(بدون محتوى)');
const env = process.env;

const escape = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

async function viaResend() {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.REPORT_FROM || 'QD Office <onboarding@resend.dev>',
      to: [env.OWNER_EMAIL],
      subject,
      html: `<div dir="rtl" style="font-family:Tahoma,Arial;white-space:pre-wrap;line-height:1.7">${escape(body)}</div>`
    })
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
  return 'email';
}

async function viaTelegram() {
  const text = `📋 ${subject}\n\n${body}`.slice(0, 4000);
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text })
  });
  if (!r.ok) throw new Error(`Telegram ${r.status}: ${await r.text()}`);
  return 'telegram';
}

try {
  let sent;
  if (env.RESEND_API_KEY && env.OWNER_EMAIL) sent = await viaResend();
  else if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) sent = await viaTelegram();
  if (sent) console.log(`sent via ${sent}: ${subject}`);
  else console.log(`[dry run: no OWNER_EMAIL+RESEND_API_KEY or TELEGRAM_* set]\n${subject}\n\n${body}`);
} catch (e) {
  console.error('report not sent:', e.message);
  process.exitCode = 1;
}
