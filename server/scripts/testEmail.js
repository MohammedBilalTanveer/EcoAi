/**
 * Sends one test email with the current email settings and says exactly what happened.
 *
 *   npm run test-email                     # asks who to send it to
 *   npm run test-email you@example.com
 */
import readline from 'node:readline/promises';

process.env.ECOAI_SCRIPT = '1';
process.env.NODE_ENV ||= 'development';
const { env } = await import('../src/config/env.js');
const { sendTestEmail } = await import('../src/services/mailer.js');

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let to = process.argv.slice(2).find((a) => EMAIL_RX.test(a));

if (!to && process.stdin.isTTY) {
  const suggestion = env.authorityEmail || env.mail.from;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`Send the test email to${suggestion ? ` [${suggestion}]` : ''}: `)).trim();
  rl.close();
  to = answer || suggestion;
}
if (!to || !EMAIL_RX.test(to)) {
  console.error('Usage: npm run test-email you@example.com');
  process.exit(1);
}

console.log(`\nProvider: ${env.mail.provider || 'none'} · From: ${env.mail.from || '(not set)'} · To: ${to}`);
const result = await sendTestEmail(to);
if (result.ok) {
  console.log('\n✅ Sent. Check the inbox (and the Spam / Promotions folders) in a minute or two.');
  if (result.provider === 'brevo') console.log('   Delivery status: Brevo → Transactional → Logs.');
} else {
  console.log(`\n❌ Not sent: ${result.error}`);
  if (result.hint) console.log(`   ${result.hint}`);
  process.exitCode = 1;
}
