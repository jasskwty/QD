#!/usr/bin/env node
// Alerts the owner right away: a phone call (Twilio) and/or a Telegram message.
// Usage: node tools/notify/call_notifier.js "<message>"
// Settings come from environment variables only (never put them in a file, the repo is public):
//   Phone call:  TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (your Twilio number), OWNER_PHONE (e.g. +965XXXXXXXX)
//   Telegram:    TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
// Both run when both are set. With nothing set it prints the message (dry run) and exits 0.
const message = process.argv.slice(2).join(' ') || 'تنبيه من شركة الديوانية';
const env = process.env;
const xml = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

async function call() {
  const twiml = `<Response><Say voice="Polly.Zeina" language="arb">${xml(message)}</Say><Pause length="1"/><Say voice="Polly.Zeina" language="arb">${xml(message)}</Say></Response>`;
  const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Calls.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: env.OWNER_PHONE, From: env.TWILIO_FROM, Twiml: twiml })
  });
  if (!r.ok) throw new Error(`Twilio ${r.status}: ${await r.text()}`);
}

async function telegram() {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: `🚨 ${message}` })
  });
  if (!r.ok) throw new Error(`Telegram ${r.status}: ${await r.text()}`);
}

const jobs = [];
if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM && env.OWNER_PHONE) jobs.push(['call', call]);
if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) jobs.push(['telegram', telegram]);
if (!jobs.length) console.log(`[dry run: no TWILIO_* or TELEGRAM_* set] ${message}`);
for (const [name, fn] of jobs) {
  try { await fn(); console.log(`alert sent via ${name}`); }
  catch (e) { console.error(`${name} failed:`, e.message); process.exitCode = 1; }
}
