import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { User } from '../models/index.js';

/**
 * Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD when that email has no
 * account yet, so a hosted deployment (no shell access) can be administered.
 * It never touches an existing account: sign-ups aren't email-verified, so someone
 * could have registered that address first.
 */
export async function ensureBootstrapAdmin() {
  const { email, password, name } = env.bootstrapAdmin;
  if (!email) return;

  const existing = await User.findOne({ email }).select('role').lean();
  if (existing) {
    if (existing.role !== 'admin') {
      console.warn(
        `[admin] ADMIN_EMAIL (${email}) already belongs to a ${existing.role} account, so it was not changed.\n` +
          '        Use a different ADMIN_EMAIL, or promote that account with "npm run create-admin".',
      );
    }
    return;
  }
  if (password.length < 10) {
    console.warn('[admin] ADMIN_EMAIL is set but ADMIN_PASSWORD is missing or shorter than 10 characters, so no admin was created.');
    return;
  }

  await User.create({
    name,
    email,
    role: 'admin',
    status: 'active',
    passwordHash: await bcrypt.hash(password, 12),
    authProviders: ['password'],
  });
  console.log(`[admin] Created the admin account ${email}. Sign in at /admin/login, then remove ADMIN_PASSWORD from the environment.`);
}
