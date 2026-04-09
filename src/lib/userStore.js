// ─────────────────────────────────────────────────────────────────────────────
// RSM Defense MIH — User Store
//
// Manages MIH platform users in localStorage.  This is a prototype store —
// in production, user records live in a backend database.  Local users
// (authSource: 'local') are created here and validate against localAdmin.js.
// Entra users are auto-provisioned on first login; their records here act as
// overrides (role, status, allowedIdp) that take precedence over claims.
//
// User record shape:
// {
//   id:          string            unique ID
//   name:        string            display name
//   email:       string            primary email / login
//   initials:    string            2-char computed from name
//   role:        string            'Administrator' | 'Analyst' | 'Onboarding Agent' | 'Read-Only Auditor'
//   authSource:  string            'local' | 'entra' | 'both'
//   idpLabel:    string            display label, e.g. 'Entra ID', 'Local', 'Both'
//   status:      string            'active' | 'disabled'
//   mfaRequired: boolean           whether MFA must be verified at login
//   notes:       string            admin notes
//   lastLogin:   string | null     ISO timestamp
//   createdAt:   string            ISO timestamp
//   createdBy:   string | null     email of admin who created this record
//   source:      'local-store' | 'mock'  so the UI can tell seeded from managed
// }
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'mih-users'

// ── Seed data (used when localStorage is empty) ───────────────────────────────
const SEED_USERS = [
  {
    id: 'u001', name: 'Sarah Chen',    email: 'sarah.chen@rsmdefense.com',
    role: 'Administrator',    authSource: 'entra', idpLabel: 'Entra ID',
    status: 'active',  mfaRequired: true,  notes: '',
    lastLogin: '2026-03-11 09:14', createdAt: '2025-10-01T00:00:00Z', createdBy: 'system',
  },
  {
    id: 'u002', name: 'Marcus Webb',   email: 'marcus.webb@rsmdefense.com',
    role: 'Analyst',          authSource: 'entra', idpLabel: 'Entra ID',
    status: 'active',  mfaRequired: true,  notes: '',
    lastLogin: '2026-03-11 08:55', createdAt: '2025-10-01T00:00:00Z', createdBy: 'system',
  },
  {
    id: 'u003', name: 'Priya Nair',    email: 'priya.nair@rsmdefense.com',
    role: 'Onboarding Agent', authSource: 'entra', idpLabel: 'Entra ID',
    status: 'active',  mfaRequired: true,  notes: 'Primary onboarding contact',
    lastLogin: '2026-03-10 16:42', createdAt: '2025-10-01T00:00:00Z', createdBy: 'system',
  },
  {
    id: 'u004', name: 'Derek Santos',  email: 'derek.santos@rsmdefense.com',
    role: 'Analyst',          authSource: 'entra', idpLabel: 'Entra ID',
    status: 'active',  mfaRequired: true,  notes: '',
    lastLogin: '2026-03-11 07:30', createdAt: '2025-10-01T00:00:00Z', createdBy: 'system',
  },
  {
    id: 'u005', name: 'Lydia Okafor',  email: 'lydia.okafor@rsmdefense.com',
    role: 'Read-Only Auditor', authSource: 'entra', idpLabel: 'Entra ID',
    status: 'active',  mfaRequired: true,  notes: 'External auditor — read-only',
    lastLogin: '2026-03-09 14:20', createdAt: '2025-10-01T00:00:00Z', createdBy: 'system',
  },
  {
    id: 'u006', name: 'James Thornton',email: 'james.thornton@rsmdefense.com',
    role: 'Analyst',          authSource: 'entra', idpLabel: 'Entra ID',
    status: 'active',  mfaRequired: true,  notes: '',
    lastLogin: '2026-03-11 09:01', createdAt: '2025-10-01T00:00:00Z', createdBy: 'system',
  },
  {
    id: 'u007', name: 'Aisha Kamara',  email: 'aisha.kamara@rsmdefense.com',
    role: 'Onboarding Agent', authSource: 'entra', idpLabel: 'Entra ID',
    status: 'disabled', mfaRequired: true, notes: 'Access suspended pending review',
    lastLogin: '2026-03-08 11:15', createdAt: '2025-10-01T00:00:00Z', createdBy: 'system',
  },
  {
    id: 'u008', name: 'Ryan Kowalski', email: 'ryan.kowalski@rsmdefense.com',
    role: 'Administrator',    authSource: 'entra', idpLabel: 'Entra ID',
    status: 'active',  mfaRequired: true,  notes: 'Secondary admin',
    lastLogin: '2026-03-11 09:22', createdAt: '2025-10-01T00:00:00Z', createdBy: 'system',
  },
  {
    id: 'u009', name: 'Chad Wolcott',  email: 'chad.wolcott@rsmus.com',
    role: 'Administrator',    authSource: 'local', idpLabel: 'Local',
    status: 'active',  mfaRequired: false, notes: 'Bootstrap admin — local credentials only. Disable once Entra is configured.',
    lastLogin: null, createdAt: '2025-10-01T00:00:00Z', createdBy: 'system',
  },
]

function initials(name = '') {
  return name.trim().split(/\s+/).map(p => p[0] || '').join('').slice(0, 2).toUpperCase()
}

// ── Read ──────────────────────────────────────────────────────────────────────
export function getUsers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
    // First run — seed
    saveUsers(SEED_USERS)
    return SEED_USERS
  } catch {
    return SEED_USERS
  }
}

// ── Write ─────────────────────────────────────────────────────────────────────
export function saveUsers(users) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(users))
    return true
  } catch {
    return false
  }
}

// ── Add ───────────────────────────────────────────────────────────────────────
export function addUser(fields, createdBy = null) {
  const existing = getUsers()
  // Prevent duplicate email
  if (existing.some(u => u.email.toLowerCase() === fields.email.toLowerCase())) {
    throw new Error(`A user with email "${fields.email}" already exists.`)
  }
  const user = {
    id:          `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name:        fields.name.trim(),
    email:       fields.email.trim().toLowerCase(),
    initials:    initials(fields.name),
    role:        fields.role        || 'Analyst',
    authSource:  fields.authSource  || 'entra',
    idpLabel:    fields.idpLabel    || 'Entra ID',
    status:      fields.status      || 'active',
    mfaRequired: fields.mfaRequired !== undefined ? fields.mfaRequired : true,
    notes:       fields.notes       || '',
    lastLogin:   null,
    createdAt:   new Date().toISOString(),
    createdBy,
  }
  const updated = [...existing, user]
  saveUsers(updated)
  return user
}

// ── Update ────────────────────────────────────────────────────────────────────
export function updateUser(id, patch) {
  const existing = getUsers()
  // Email uniqueness check (exclude self)
  if (patch.email) {
    const conflict = existing.find(u => u.id !== id && u.email.toLowerCase() === patch.email.toLowerCase())
    if (conflict) throw new Error(`Email "${patch.email}" is already in use.`)
  }
  // Recompute initials if name changed
  if (patch.name) patch.initials = initials(patch.name)
  const updated = existing.map(u => u.id === id ? { ...u, ...patch } : u)
  saveUsers(updated)
  return updated.find(u => u.id === id)
}

// ── Delete ────────────────────────────────────────────────────────────────────
export function deleteUser(id) {
  const existing = getUsers()
  const updated  = existing.filter(u => u.id !== id)
  saveUsers(updated)
  return updated
}

// ── Toggle status ─────────────────────────────────────────────────────────────
export function toggleUserStatus(id) {
  const existing = getUsers()
  const user     = existing.find(u => u.id === id)
  if (!user) return existing
  return updateUser(id, { status: user.status === 'active' ? 'disabled' : 'active' })
}

// ── Reset store (dev helper) ──────────────────────────────────────────────────
export function resetUserStore() {
  saveUsers(SEED_USERS)
  return SEED_USERS
}

// ── Auth source options ───────────────────────────────────────────────────────
export const AUTH_SOURCE_OPTIONS = [
  { value: 'entra', label: 'Entra ID',   hint: 'Authenticates via Microsoft Entra (Azure AD)' },
  { value: 'local', label: 'Local',      hint: 'Local credentials only — for bootstrap/break-glass accounts' },
  { value: 'both',  label: 'Both',       hint: 'Allows either Entra or local login (use sparingly)' },
]

// ── Role options ──────────────────────────────────────────────────────────────
export const ROLE_OPTIONS = [
  { value: 'Administrator',     color: 'var(--red)',      desc: 'Full system access including user management and admin settings' },
  { value: 'Analyst',           color: 'var(--green)',    desc: 'View tenants, launch sessions, view audit logs' },
  { value: 'Onboarding Agent',  color: 'var(--accent)',   desc: 'Onboard new tenants, limited admin access' },
  { value: 'Read-Only Auditor', color: 'var(--rsm-gray)', desc: 'Read-only access to tenant list and audit logs' },
]

export const IDP_LABEL = {
  entra: 'Entra ID',
  local: 'Local',
  both:  'Both',
}

// ── Password-set flag helpers (UI only — actual hash lives in localAuth.js) ──
// Returns true if this user has a password hash stored
export function userHasPassword(user) {
  return !!(user?.passwordHash && user?.passwordSalt)
}
