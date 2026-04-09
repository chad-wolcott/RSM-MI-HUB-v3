#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// RSM Defense MIH — Password Hash Generator
//
// Generates the Netlify environment variable values needed to add a local
// user to the server-side authentication system.
//
// Usage:
//   node scripts/hash-password.js <email> <password> [name] [role]
//
// Example:
//   node scripts/hash-password.js alice@rsmdefense.com "Str0ng!Pass2026" \
//       "Alice Johnson" "Analyst"
//
// Output: copy the printed env var lines into Netlify → Site Settings →
//   Environment Variables, then redeploy.  Never commit these values to git.
//
// Roles: Administrator | Analyst | Onboarding Agent | Read-Only Auditor
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto')

function emailToEnvKey(email) {
  return email.trim().toLowerCase()
    .replace(/[@.]/g, '_')
    .replace(/[^a-z0-9_]/g, '_')
    .toUpperCase()
}

function sha256hex(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex')
}

function randomHex(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex')
}

function initials(name) {
  return (name || '').trim().split(/\s+/).map(p => p[0] || '').join('').slice(0, 2).toUpperCase()
}

// ── Main ──────────────────────────────────────────────────────────────────────
const [,, email, password, name = '', role = 'Analyst'] = process.argv

if (!email || !password) {
  console.error('Usage: node scripts/hash-password.js <email> <password> [name] [role]')
  process.exit(1)
}

const salt    = randomHex(16)
const hash    = sha256hex(salt + password)
const key     = emailToEnvKey(email)
const init    = initials(name || email)

console.log('\n── Netlify Environment Variables ──────────────────────────────────────────────')
console.log('Add these in: Netlify → Site Settings → Environment Variables → Add variable')
console.log('Then trigger a redeploy for the function to pick them up.\n')
console.log(`MIH_USER_${key}_HASH=${hash}`)
console.log(`MIH_USER_${key}_SALT=${salt}`)
console.log(`MIH_USER_${key}_NAME=${name || email}`)
console.log(`MIH_USER_${key}_ROLE=${role}`)
console.log(`MIH_USER_${key}_INITIALS=${init}`)
console.log('\n── Verification ────────────────────────────────────────────────────────────────')
console.log(`Email:    ${email}`)
console.log(`Role:     ${role}`)
console.log(`Initials: ${init}`)
console.log(`Salt:     ${salt}`)
console.log(`Hash:     ${hash}`)
console.log('\n⚠️  Keep these values secret. Never commit them to source control.')
console.log('   The original password is NOT recoverable from the hash.\n')
