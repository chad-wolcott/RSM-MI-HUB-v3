// ─────────────────────────────────────────────────────────────────────────────
// RSM Defense MIH — Tenant Store
// Manages live (real) tenants in localStorage, separate from mock data.
// The Tenants page merges both sources and tags each row with its origin.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'mih-live-tenants'

// ── Read ──────────────────────────────────────────────────────────────────────
export function getLiveTenants() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

// ── Write ─────────────────────────────────────────────────────────────────────
export function saveLiveTenants(tenants) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tenants))
    return true
  } catch {
    return false
  }
}

// ── Add a validated tenant ────────────────────────────────────────────────────
export function addLiveTenant(tenant) {
  const existing = getLiveTenants()
  // Prevent duplicate by URL
  const deduped = existing.filter(t => t.url !== tenant.url)
  const updated = [...deduped, { ...tenant, source: 'live', addedAt: new Date().toISOString() }]
  saveLiveTenants(updated)
  return updated
}

// ── Remove ────────────────────────────────────────────────────────────────────
export function removeLiveTenant(id) {
  const existing = getLiveTenants()
  const updated  = existing.filter(t => t.id !== id)
  saveLiveTenants(updated)
  return updated
}

// ── Update ────────────────────────────────────────────────────────────────────
export function updateLiveTenant(id, patch) {
  const existing = getLiveTenants()
  const updated  = existing.map(t => t.id === id ? { ...t, ...patch } : t)
  saveLiveTenants(updated)
  return updated
}

// ── Build tenant record from onboarding form + validation result ──────────────
export function buildTenantRecord(form, validationResult) {
  const td = validationResult?.tenantData || {}

  return {
    id:          `live-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    source:      'live',
    client:      form.clientName,
    clientId:    form.clientId,
    type:        form.tenantType,          // 'ISC' | 'PAM'
    health:      'healthy',                // Assume healthy after successful validation
    url:         form.tenantUrl,
    apiBase:     form.apiEndpoint || td.apiBase || '',
    contactEmail: form.contactEmail,
    notes:       form.notes || '',

    // Credential config
    credentialType: form.credentialType,   // 'local' | 'delinea'
    // For local creds — stored only in memory during the session for launch.
    // In production these must be stored in the vault and never in localStorage.
    ...(form.credentialType === 'local' ? {
      localClientId:     form.localClientId,
      localClientSecret: form.localClientSecret, // ⚠️ prototype only
    } : {
      delineaPath:     form.delineaPath,
      delineaSecretId: form.delineaSecretId,
    }),

    // Live data from validation
    orgName:       td.orgName     || form.clientName,
    pod:           td.pod         || null,
    identities:    td.identityCount || 0,
    accounts:      0,
    vas:           td.vaCount     || 0,
    vaUnhealthy:   td.vaUnhealthy || 0,
    vaClusters:    td.vaClusters  || [],
    lastChecked:   'Just now',
    addedAt:       new Date().toISOString(),
    addedBy:       null, // Set by caller if auth context available
  }
}
