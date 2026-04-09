// ─────────────────────────────────────────────────────────────────────────────
// RSM Defense MIH — SailPoint ISC API Client
// All calls route through /.netlify/functions/sailpoint-proxy to avoid CORS.
// ─────────────────────────────────────────────────────────────────────────────

// In dev the Netlify CLI serves functions at the same origin.
// In production the function is on the same Netlify domain.
const PROXY_URL = '/.netlify/functions/sailpoint-proxy'

async function callProxy(action, tenantUrl, extra = {}) {
  const res = await fetch(PROXY_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ action, tenantUrl, ...extra }),
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error || `Proxy returned HTTP ${res.status}`)
  }

  return data
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run full validation sequence against a SailPoint ISC tenant.
 * Returns { success, steps, tenantData } from the proxy.
 */
export async function validateISCTenant({ tenantUrl, clientId, clientSecret }) {
  return callProxy('full-validation', tenantUrl, { clientId, clientSecret })
}

/**
 * Quick connectivity check only (no credentials required).
 */
export async function testISCConnectivity(tenantUrl) {
  return callProxy('test-connectivity', tenantUrl)
}

/**
 * Derive the API base URL from a tenant URL — mirrors the proxy's getApiBase().
 * *.identitynow.com      → *.api.identitynow.com
 * *.identitynow-demo.com → *.api.identitynow-demo.com
 * *.rsm.security         → same origin (vanity/reverse-proxy, no separate api.* host)
 */
export function deriveApiBase(tenantUrl) {
  try {
    const u    = new URL(tenantUrl)
    const host = u.hostname
    const org  = host.split('.')[0]

    if (host.endsWith('.identitynow.com'))      return `https://${org}.api.identitynow.com`
    if (host.endsWith('.identitynow-demo.com')) return `https://${org}.api.identitynow-demo.com`
    if (host.endsWith('.rsm.security'))         return `https://${host}`
    return ''
  } catch {
    return ''
  }
}

/**
 * Check whether we're running in an environment where the Netlify
 * function is available. In local dev without the Netlify CLI this
 * will fail; we surface a clear message rather than a confusing error.
 */
export async function isProxyAvailable() {
  try {
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'test-connectivity', tenantUrl: 'https://example.identitynow.com' }),
      signal: AbortSignal.timeout(4000),
    })
    return res.status < 500
  } catch {
    return false
  }
}

/**
 * Refresh identity count + VA status for an already-onboarded tenant.
 * Lighter than full-validation — just re-auths and pulls current counts.
 */
export async function refreshTenantCounts({ tenantUrl, clientId, clientSecret }) {
  return callProxy('refresh-counts', tenantUrl, { clientId, clientSecret })
}
