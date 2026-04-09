// ─────────────────────────────────────────────────────────────────────────────
// RSM Defense MIH — Entra ID (Azure AD) MSAL Configuration
//
// HOW TO CONFIGURE:
//   1. Register a Single-Page Application in Azure Entra ID
//   2. Set the Redirect URI to your deployed URL + /auth/callback
//      e.g. https://mih.netlify.app/auth/callback  (and http://localhost:5173/auth/callback for dev)
//   3. Enable ID tokens under Authentication > Implicit grant
//   4. Set VITE_ENTRA_CLIENT_ID and VITE_ENTRA_TENANT_ID in your Netlify
//      environment variables (Site settings → Environment variables)
//   5. Remove the fallback placeholder values below once configured
// ─────────────────────────────────────────────────────────────────────────────

export const ENTRA_CONFIG = {
  // Replace with your Azure App Registration Client ID
  // Netlify env var: VITE_ENTRA_CLIENT_ID
  clientId: import.meta.env.VITE_ENTRA_CLIENT_ID || 'YOUR_ENTRA_CLIENT_ID_HERE',

  // Replace with your Azure Tenant ID (or 'common' for multi-tenant)
  // Netlify env var: VITE_ENTRA_TENANT_ID
  tenantId: import.meta.env.VITE_ENTRA_TENANT_ID || 'YOUR_ENTRA_TENANT_ID_HERE',

  // The redirect URI must match exactly what is registered in your App Registration
  // For local dev: http://localhost:5173/auth/callback
  // For production: https://your-site.netlify.app/auth/callback
  redirectUri: import.meta.env.VITE_REDIRECT_URI || window.location.origin + '/auth/callback',
}

// ── MSAL Browser Configuration ────────────────────────────────────────────────
export const msalConfig = {
  auth: {
    clientId:    ENTRA_CONFIG.clientId,
    authority:   `https://login.microsoftonline.com/${ENTRA_CONFIG.tenantId}`,
    redirectUri: ENTRA_CONFIG.redirectUri,
    postLogoutRedirectUri: window.location.origin + '/login',
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation:        'sessionStorage', // Safer than localStorage for security
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return
        if (import.meta.env.DEV) {
          const prefix = '[MSAL]'
          if (level === 0) console.error(prefix, message)
          else if (level === 1) console.warn(prefix, message)
          else console.log(prefix, message)
        }
      },
      piiLoggingEnabled: false,
      logLevel: 2, // Warning
    },
  },
}

// ── Login Request (what we ask for at sign-in) ────────────────────────────────
export const loginRequest = {
  scopes: ['openid', 'profile', 'email', 'User.Read'],
  // prompt: 'select_account' — uncomment to always show account picker
}

// ── Token Request (silent token acquisition) ──────────────────────────────────
export const tokenRequest = {
  scopes: ['User.Read'],
}

// ── MIH Role → Entra Group mapping ───────────────────────────────────────────
// Configure these to match your Entra ID group Object IDs or display names
// These are checked against the 'groups' claim in the ID token
export const ROLE_GROUP_MAP = {
  Administrator:     import.meta.env.VITE_GROUP_ADMIN      || 'MIH-Admins',
  'Onboarding Agent':import.meta.env.VITE_GROUP_ONBOARDING || 'MIH-Onboarding',
  Analyst:           import.meta.env.VITE_GROUP_ANALYST    || 'MIH-Analysts',
  'Read-Only Auditor':import.meta.env.VITE_GROUP_AUDITOR   || 'MIH-Auditors',
}

// ── Helper: derive MIH role from Entra claims ─────────────────────────────────
export function getRoleFromClaims(account) {
  if (!account) return 'Analyst'

  // Check idTokenClaims for group memberships
  const claims = account.idTokenClaims || {}
  const groups = claims.groups || []
  const roles  = claims.roles  || []

  // Check roles claim first (app roles are more reliable than group IDs)
  if (roles.includes('MIH.Admin')      || groups.includes(ROLE_GROUP_MAP['Administrator']))      return 'Administrator'
  if (roles.includes('MIH.Onboarding') || groups.includes(ROLE_GROUP_MAP['Onboarding Agent']))  return 'Onboarding Agent'
  if (roles.includes('MIH.Auditor')    || groups.includes(ROLE_GROUP_MAP['Read-Only Auditor'])) return 'Read-Only Auditor'
  if (roles.includes('MIH.Analyst')    || groups.includes(ROLE_GROUP_MAP['Analyst']))            return 'Analyst'

  // Default to Analyst if authenticated but no recognized group
  return 'Analyst'
}

// ── Is Entra configured? ──────────────────────────────────────────────────────
// Returns false when still using placeholder values — hides the Entra button
export function isEntraConfigured() {
  return (
    ENTRA_CONFIG.clientId !== 'YOUR_ENTRA_CLIENT_ID_HERE' &&
    ENTRA_CONFIG.tenantId !== 'YOUR_ENTRA_TENANT_ID_HERE' &&
    ENTRA_CONFIG.clientId.length > 10
  )
}
