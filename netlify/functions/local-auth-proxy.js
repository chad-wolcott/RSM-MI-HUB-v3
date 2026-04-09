// ─────────────────────────────────────────────────────────────────────────────
// RSM Defense MIH — Netlify Function: Local Authentication Proxy
// Path: /.netlify/functions/local-auth-proxy
//
// Validates local (non-Entra) user credentials entirely server-side.
// Credentials are NEVER stored in the browser.  The browser only sends
// email + password; this function checks them against:
//
//   1. Netlify environment variables (preferred for production)
//      Each local user gets two env vars:
//        MIH_USER_{SAFE_EMAIL}_HASH  — bcrypt-style SHA-256+salt hash
//        MIH_USER_{SAFE_EMAIL}_SALT  — random hex salt
//      where SAFE_EMAIL is the email with @/. replaced by underscores,
//      uppercased. e.g. chad.wolcott@rsmus.com → CHAD_WOLCOTT_RSMUS_COM
//
//   2. Bootstrap fallback (hardcoded, prototype-only)
//      chad.wolcott@rsmus.com / P@ssword2026 — remove once Entra is live
//
// Password hashing:
//   SHA-256(salt + password)  — same algorithm as the browser-side localAuth.js
//   Run `node scripts/hash-password.js <email> <password>` to generate env vars.
//
// ⚠️  SECURITY NOTE:
//   SHA-256 is used here to match the browser-side Web Crypto implementation.
//   In a real production deployment, use bcrypt/argon2 server-side instead.
//   The current approach is substantially more secure than localStorage but
//   SHA-256 is not ideal for password hashing at scale.
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto')

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type':                 'application/json',
}

// ── Bootstrap credentials (prototype only) ────────────────────────────────────
// Remove this block once all local users are managed via env vars or a backend DB.
const BOOTSTRAP_USERS = [
  {
    email:       'chad.wolcott@rsmus.com',
    password:    'P@ssword2026',   // plain — compared directly only in bootstrap
    name:        'Chad Wolcott',
    role:        'Administrator',
    initials:    'CW',
    idpLabel:    'Local',
    authSource:  'local',
  },
]

// ── Convert email to env-var-safe key ──────────────────────────────────────────
function emailToEnvKey(email) {
  return email.trim().toLowerCase()
    .replace(/[@.]/g, '_')
    .replace(/[^a-z0-9_]/g, '_')
    .toUpperCase()
}

// ── SHA-256 hex (Node crypto) ─────────────────────────────────────────────────
function sha256hex(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex')
}

// ── Validate password against env var credentials ────────────────────────────
function checkEnvCredential(email, password) {
  const key  = emailToEnvKey(email)
  const hash = process.env[`MIH_USER_${key}_HASH`]
  const salt = process.env[`MIH_USER_${key}_SALT`]
  const name = process.env[`MIH_USER_${key}_NAME`]  || email
  const role = process.env[`MIH_USER_${key}_ROLE`]  || 'Analyst'
  const init = process.env[`MIH_USER_${key}_INITIALS`] || email.slice(0,2).toUpperCase()

  if (!hash || !salt) return null   // no env creds for this user

  const computed = sha256hex(salt + password)
  if (computed !== hash) return null

  return {
    email,
    name,
    role,
    initials: init,
    idpLabel:   'Local',
    authSource: 'local',
  }
}

// ── Validate against bootstrap list ──────────────────────────────────────────
function checkBootstrap(email, password) {
  const user = BOOTSTRAP_USERS.find(
    u => u.email.toLowerCase() === email.toLowerCase()
  )
  if (!user) return null
  if (user.password !== password) return null
  return {
    email:      user.email,
    name:       user.name,
    role:       user.role,
    initials:   user.initials,
    idpLabel:   user.idpLabel,
    authSource: user.authSource,
  }
}

// ── Lambda handler ─────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const { email, password } = body
  if (!email || !password) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: 'email and password are required' }),
    }
  }

  // Intentional delay — makes brute-force meaningfully slower
  await new Promise(r => setTimeout(r, 400 + Math.random() * 200))

  // Priority: env-var credentials > bootstrap fallback
  const user = checkEnvCredential(email, password) || checkBootstrap(email, password)

  if (!user) {
    // Return 200 with success:false so callers don't get confused by 401 vs 403
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ success: false }),
    }
  }

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({
      success:    true,
      id:         `local-${emailToEnvKey(user.email)}`,
      name:       user.name,
      email:      user.email,
      role:       user.role,
      initials:   user.initials,
      idp:        user.idpLabel,
      authMethod: 'local',
      loginTime:  new Date().toISOString(),
    }),
  }
}
