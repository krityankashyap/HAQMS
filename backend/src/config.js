// Centralised environment validation. Reads and validates required env vars at module
// load; throws loudly if any are missing so the server refuses to boot rather than
// running silently with unsafe defaults.

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is not set');

const raw = process.env.CORS_ALLOWED_ORIGINS;
if (!raw || !raw.trim()) throw new Error('CORS_ALLOWED_ORIGINS environment variable is not set');
const CORS_ALLOWED_ORIGINS = raw.split(',').map(s => s.trim()).filter(Boolean);

module.exports = { JWT_SECRET, CORS_ALLOWED_ORIGINS };
