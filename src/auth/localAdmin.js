// ─────────────────────────────────────────────────────────────────────────────
// RSM Defense MIH — Local Admin Account (Initial Setup Only)
//
// ⚠️  SECURITY WARNING ⚠️
// This local account exists ONLY to allow initial configuration of Entra ID
// before SSO is operational. It is intentionally visible in source code for
// this prototype frontend iteration.
//
// BEFORE PRODUCTION:
//   □ Move credential validation to a server-side API endpoint
//   □ Hash passwords with bcrypt on the server (never compare plaintext)
//   □ Rate-limit and lock out after failed attempts server-side
//   □ Delete this local account once Entra ID is configured and verified
//   □ Enable audit logging of local admin login events on the backend
//   □ Consider IP allowlisting for the local admin account
//
// This file should be removed or replaced entirely in the production backend.
// ─────────────────────────────────────────────────────────────────────────────

export const LOCAL_ADMIN = {
  email:       'chad.wolcott@rsmus.com',
  // ⚠️ PROTOTYPE ONLY — never store plaintext passwords in production
  password:    'P@ssword2026',
  displayName: 'Chad Wolcott',
  role:        'Administrator',
  initials:    'CW',
  idp:         'Local',
}

// Validate local admin credentials
// In production this must be a fetch() to a backend endpoint
export function validateLocalAdmin(email, password) {
  if (!email || !password) return null
  if (
    email.toLowerCase().trim() === LOCAL_ADMIN.email.toLowerCase() &&
    password === LOCAL_ADMIN.password
  ) {
    return {
      id:          'local-admin-001',
      name:        LOCAL_ADMIN.displayName,
      email:       LOCAL_ADMIN.email,
      role:        LOCAL_ADMIN.role,
      initials:    LOCAL_ADMIN.initials,
      idp:         LOCAL_ADMIN.idp,
      authMethod:  'local',
      loginTime:   new Date().toISOString(),
    }
  }
  return null
}
