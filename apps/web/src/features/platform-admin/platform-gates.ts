import 'server-only';
import { adminDatabase } from './database';
// Rollout compatibility: existing regular authentication works before admin
// infrastructure is configured. Once configured, dependency failures fail closed.
export async function registrationAvailable() {
  // A separate local identity store must not control hosted user registration.
  // Hosted registration remains enforced by that project's existing Auth setup.
  if (process.env.PLATFORM_DATA_MODE !== 'database') return true;
  if (!process.env.PLATFORM_ADMIN_DATABASE_URL) return true;
  const { rows } = await adminDatabase().query('select registration_enabled and not maintenance as allowed from platform_private.platform_settings');
  return rows[0]?.allowed === true;
}
