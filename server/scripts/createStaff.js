/**
 * Creates (or promotes) a staff or admin account.
 *
 *   npm run create-admin          # asks for email, name and password
 *   npm run create-staff
 *
 * Or non-interactively (bash / cmd — PowerShell drops the `--`, so use the prompts there):
 *   npm run create-admin -- --email you@example.com --password "a-strong-password" --name "Your Name"
 *
 * Staff review dumping reports; admins can also approve partners and manage users.
 */
import readline from 'node:readline/promises';
import { Writable } from 'node:stream';
import { parseArgs } from 'node:util';
import bcrypt from 'bcryptjs';

process.env.ECOAI_SCRIPT = '1';
process.env.NODE_ENV ||= 'development';
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { User } = await import('../src/models/index.js');

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    email: { type: 'string' },
    password: { type: 'string' },
    name: { type: 'string' },
    role: { type: 'string', default: 'staff' },
  },
});
const role = values.role === 'admin' ? 'admin' : 'staff';
const label = role === 'admin' ? 'admin' : 'staff';
const interactive = Boolean(process.stdin.isTTY) && !values.email;
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const fail = async (message) => {
  console.error(`\n${message}`);
  await disconnectDB().catch(() => {});
  process.exit(1);
};

/** Reads one line from the terminal; `hidden` keeps passwords off the screen. */
async function ask(question, { hidden = false } = {}) {
  let muted = false;
  // readline echoes what's typed to its output stream, so mute the stream itself after the prompt.
  const output = new Writable({
    write(chunk, encoding, done) {
      if (!muted) process.stdout.write(chunk, encoding);
      done();
    },
  });
  const rl = readline.createInterface({ input: process.stdin, output, terminal: true });
  const answer = rl.question(question);
  muted = hidden;
  const value = await answer;
  rl.close();
  if (hidden) process.stdout.write('\n');
  return value.trim();
}

async function askPassword({ optional }) {
  for (;;) {
    const pw = await ask(optional ? 'New password (leave empty to keep the current one): ' : 'Password (min 8 characters): ', {
      hidden: true,
    });
    if (!pw && optional) return null;
    if (pw.length < 8) {
      console.log('  Password must be at least 8 characters.');
      continue;
    }
    if ((await ask('Confirm password: ', { hidden: true })) !== pw) {
      console.log('  Passwords did not match — try again.');
      continue;
    }
    return pw;
  }
}

if (!values.email && !interactive) {
  console.error(`Usage: npm run create-${label}    (then answer the questions)`);
  console.error(`   or: npm run create-${label} -- --email you@example.com --password "min 8 chars" [--name "Name"]`);
  process.exit(1);
}
if (values.password && values.password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

if (interactive) {
  if (positionals.length) {
    console.log('(The --email/--password options did not reach the script — PowerShell drops the "--".');
    console.log(' No problem, just answer the questions below.)\n');
  }
  console.log(`Create an EcoAI ${label} account\n`);
}

let email = values.email?.trim().toLowerCase();
while (!email || !EMAIL_RX.test(email)) {
  if (!interactive) await fail(`"${values.email}" is not a valid email address.`);
  if (email) console.log('  That does not look like an email address.');
  email = (await ask('Email: ')).toLowerCase();
}

await connectDB();
let user = await User.findOne({ email });

if (user) {
  if (interactive) {
    console.log(
      user.role === role
        ? `  ${email} is already ${label === 'admin' ? 'an admin' : 'staff'}.`
        : `  ${email} already exists (${user.role}) — it will be made ${label === 'admin' ? 'an admin' : 'staff'}.`,
    );
  }
  const password = values.password || (interactive ? await askPassword({ optional: true }) : null);
  user.role = role;
  user.status = 'active';
  if (password) {
    user.passwordHash = await bcrypt.hash(password, 12);
    if (!user.authProviders.includes('password')) user.authProviders.push('password');
  }
  const changed = user.isModified();
  await user.save();
  console.log(`\n${changed ? `Updated ${email}` : `No changes needed for ${email}`} — ${label} account ready.`);
} else {
  const fallbackName = role === 'admin' ? 'EcoAI Admin' : 'EcoAI Staff';
  const name = values.name || (interactive ? (await ask(`Name [${fallbackName}]: `)) || fallbackName : fallbackName);
  const password = values.password || (interactive ? await askPassword({ optional: false }) : null);
  if (!password) await fail(`A --password is required when creating a new ${label} account.`);
  user = await User.create({
    name,
    email,
    role,
    status: 'active',
    passwordHash: await bcrypt.hash(password, 12),
    authProviders: ['password'],
  });
  console.log(`\nCreated ${label} account ${email}.`);
}
console.log(`Sign in at ${role === 'admin' ? '/admin/login' : '/staff-login'} (e.g. http://localhost:5000${role === 'admin' ? '/admin/login' : '/staff-login'}).`);
await disconnectDB();
