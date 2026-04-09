// ─────────────────────────────────────────────────────────────────────────────
// RSM Defense MIH — Local Authentication
//
// Auth flow (in priority order):
//
//   1. /.netlify/functions/local-auth-proxy  (server-side — preferred)
//      Credentials validated against Netlify environment variables only.
//      The browser never sees or stores a password hash.
//      Falls back to the bootstrap chad.wolcott account automatically.
//      Run: npx netlify dev  (not plain npm run dev) to use this path locally.
//
//   2. localStorage hash store  (browser-side — local dev fallback)
//      Used when the Netlify function is unreachable (plain npm run dev).
//      Passwords set via Admin → Users → Set Password are stored as
//      SHA-256(salt+plaintext) hashes alongside the user record.
//      The hardcoded chad.wolcott bootstrap credential also works here.
//
// Password algorithm (both paths identical):
//   SHA-256(hex_salt_16_bytes + plaintext_password)
//   Browser: Web Crypto API (crypto.subtle)
//   Server:  Node crypto module
//
// ⚠️  SHA-256 is used to match across both environments without extra packages.
//     For a full production backend, replace with bcrypt or argon2 server-side.
//     The env-var approach is already a major security improvement over
//     storing credentials in localStorage.
//
// To add a new server-side user:
//   node scripts/hash-password.js <email> <password> [name] [role]
//   Paste the output env vars into Netlify → Site Settings → Environment Vars
//   then redeploy.
// ─────────────────────────────────────────────────────────────────────────────

import { getUsers, updateUser } from './userStore.js'

const AUTH_PROXY_URL = '/.netlify/functions/local-auth-proxy'

// ── Web Crypto helpers (browser, used in fallback path + Admin password set) ──

function randomHex(bytes = 16) {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function sha256hex(str) {
  const data = new TextEncoder().encode(str)
  const buf  = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── Public: hash a new password (called by Admin → Set Password) ──────────────
export async function hashPassword(plaintext) {
  const salt = randomHex(16)
  const hash = await sha256hex(salt + plaintext)
  return { hash, salt }
}

// ── Public: verify a plaintext password against a stored hash ────────────────
export async function verifyPassword(plaintext, storedHash, storedSalt) {
  const computed = await sha256hex(storedSalt + plaintext)
  return computed === storedHash
}

// ── Public: set or change password for a local user in the user store ─────────
// Writes passwordHash + passwordSalt onto the user record in localStorage.
// Used by the Admin UI; the Netlify function uses env vars instead.
export async function setUserPassword(userId, plaintext) {
  const { hash, salt } = await hashPassword(plaintext)
  updateUser(userId, { passwordHash: hash, passwordSalt: salt })
}

// ── Check whether the Netlify auth function is reachable ─────────────────────
let _proxyAvailableCache = null   // cache result per page load — avoid re-probing

async function isAuthProxyAvailable() {
  if (_proxyAvailableCache !== null) return _proxyAvailableCache
  try {
    const res = await fetch(AUTH_PROXY_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: '__probe__', password: '__probe__' }),
      signal:  AbortSignal.timeout(3000),
    })
    // Any non-5xx response means the function is deployed and running
    _proxyAvailableCache = res.status < 500
  } catch {
    _proxyAvailableCache = false
  }
  return _proxyAvailableCache
}

// ── Path 1: validate via Netlify server-side function ─────────────────────────
async function validateViaProxy(email, password) {
  const res = await fetch(AUTH_PROXY_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email: email.trim().toLowerCase(), password }),
  })
  const data = await res.json()
  if (!res.ok || !data.success) return null
  return {
    id:          data.id,
    name:        data.name,
    email:       data.email,
    role:        data.role,
    initials:    data.initials,
    idp:         data.idp || 'Local',
    authMethod:  'local',
    mfaVerified: false,
    loginTime:   new Date().toISOString(),
  }
}

// ── Path 2: validate via browser-side localStorage store ─────────────────────
// For local development without npx netlify dev.
async function validateViaLocalStore(email, password) {
  const normalEmail = email.trim().toLowerCase()
  const users       = getUsers()

  const user = users.find(u =>
    (u.authSource === 'local' || u.authSource === 'both') &&
    u.email.toLowerCase() === normalEmail &&
    u.status === 'active'
  )
  if (!user) return null

  // Case 1: explicit password hash set via Admin UI
  if (user.passwordHash && user.passwordSalt) {
    const ok = await verifyPassword(password, user.passwordHash, user.passwordSalt)
    if (!ok) return null
  }
  // Case 2: bootstrap fallback for chad.wolcott with no hash yet
  else if (normalEmail === 'chad.wolcott@rsmus.com') {
    if (password !== 'P@ssword2026') return null
  }
  // Case 3: local account with no password set — cannot log in yet
  else {
    return null
  }

  return {
    id:          user.id,
    name:        user.name,
    email:       user.email,
    role:        user.role,
    initials:    (user.initials || user.name.split(' ').map(p => p[0]).join('').slice(0, 2)).toUpperCase(),
    idp:         user.idpLabel || 'Local',
    authMethod:  'local',
    mfaVerified: false,
    loginTime:   new Date().toISOString(),
  }
}

// ── Public: main entry point — validate a local login attempt ────────────────
export async function validateLocalUser(email, password) {
  if (!email || !password) return null

  // Always try the Netlify function first — credentials never touch the browser
  try {
    if (await isAuthProxyAvailable()) {
      return await validateViaProxy(email, password)
    }
  } catch (err) {
    console.warn('[localAuth] Proxy unavailable, falling back to local store:', err.message)
    _proxyAvailableCache = false   // don't keep retrying a broken proxy
  }

  // Fallback: localStorage-backed hashes (local dev without netlify dev)
  console.warn('[localAuth] Using browser-side credential fallback — run "npx netlify dev" for server-side auth')
  return await validateViaLocalStore(email, password)
}
