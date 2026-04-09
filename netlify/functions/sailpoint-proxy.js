// ─────────────────────────────────────────────────────────────────────────────
// RSM Defense MIH — Netlify Function: SailPoint ISC Proxy
// Path: /.netlify/functions/sailpoint-proxy
//
// Proxies requests to SailPoint IdentityNow (ISC) REST API server-side,
// bypassing browser CORS restrictions. Handles OAuth2 client_credentials
// token acquisition and subsequent API calls.
//
// Supported actions:
//   test-connectivity  — DNS + TLS reachability check (HEAD request to tenant)
//   get-token          — OAuth2 client_credentials token exchange
//   get-org-info       — Fetch org/tenant details (name, pod, org type)
//   get-identity-count — Count of active identities
//   get-va-clusters    — Virtual appliance cluster status (GET /v2026/managed-clusters)
//   full-validation    — Runs all checks in sequence, returns composite result
// ─────────────────────────────────────────────────────────────────────────────

const https = require('https')
const http  = require('http')

// ── CORS headers ──────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type':                 'application/json',
}

// ── HTTP helper ───────────────────────────────────────────────────────────────
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(url)
    const lib     = parsed.protocol === 'https:' ? https : http
    const timeout = options.timeout || 10000

    const reqOptions = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   options.method || 'GET',
      headers:  options.headers || {},
      timeout,
    }

    const req = lib.request(reqOptions, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        resolve({
          status:  res.statusCode,
          headers: res.headers,
          body:    data,
        })
      })
    })

    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')) })
    req.on('error',   (err) => reject(err))

    if (options.body) req.write(options.body)
    req.end()
  })
}

// ── Allowed ISC domains ───────────────────────────────────────────────────────
// Standard SailPoint ISC, demo instances, and RSM vanity domain.
const ALLOWED_DOMAINS = [
  '.identitynow.com',
  '.identitynow-demo.com',
  '.rsm.security',
]

function isAllowedDomain(hostname) {
  return ALLOWED_DOMAINS.some(d => hostname.endsWith(d))
}

// ── Derive API base URL from tenant URL ───────────────────────────────────────
// Standard ISC tenants use a parallel *.api.identitynow.com subdomain:
//   https://acme.identitynow.com      → https://acme.api.identitynow.com
//   https://acme.identitynow-demo.com → https://acme.api.identitynow-demo.com
//
// RSM vanity URLs (*.rsm.security) host the API on the same origin — the
// token endpoint lives at https://tenant.rsm.security/oauth/token with no
// separate api.* subdomain. We return the base URL as-is.
function getApiBase(tenantUrl) {
  try {
    const u    = new URL(tenantUrl)
    const host = u.hostname  // e.g. "acme.identitynow.com"
    const org  = host.split('.')[0]

    if (host.endsWith('.identitynow.com')) {
      return `https://${org}.api.identitynow.com`
    }
    if (host.endsWith('.identitynow-demo.com')) {
      return `https://${org}.api.identitynow-demo.com`
    }
    // *.rsm.security — vanity / reverse-proxy, API on same origin
    return `https://${host}`
  } catch {
    throw new Error(`Invalid tenant URL: ${tenantUrl}`)
  }
}

// ── Action: test-connectivity ─────────────────────────────────────────────────
async function testConnectivity(tenantUrl) {
  const result = { dns: false, tls: false, reachable: false, latencyMs: null }
  const start  = Date.now()

  try {
    const res = await httpRequest(tenantUrl, { method: 'HEAD', timeout: 8000 })
    result.dns       = true
    result.tls       = tenantUrl.startsWith('https')
    result.reachable = res.status < 500
    result.latencyMs = Date.now() - start
    result.httpStatus = res.status
  } catch (err) {
    result.error = err.message
  }

  return result
}

// ── Action: get-token ─────────────────────────────────────────────────────────
async function getToken(tenantUrl, clientId, clientSecret) {
  const apiBase    = getApiBase(tenantUrl)
  const tokenUrl   = `${apiBase}/oauth/token`
  const bodyParams = `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`

  const res = await httpRequest(tokenUrl, {
    method:  'POST',
    headers: {
      'Content-Type':   'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(bodyParams).toString(),
    },
    body:    bodyParams,
    timeout: 10000,
  })

  if (res.status !== 200) {
    let errDetail = ''
    try { errDetail = JSON.parse(res.body)?.error_description || '' } catch {}
    throw new Error(`Token request failed (HTTP ${res.status})${errDetail ? ': ' + errDetail : ''}`)
  }

  const token = JSON.parse(res.body)
  return { accessToken: token.access_token, expiresIn: token.expires_in, tokenType: token.token_type }
}

// ── Action: get-org-info ──────────────────────────────────────────────────────
async function getOrgInfo(tenantUrl, accessToken) {
  const apiBase = getApiBase(tenantUrl)

  // Try v3 org endpoint
  const res = await httpRequest(`${apiBase}/v3/org-config`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    timeout: 10000,
  })

  if (res.status === 200) {
    const data = JSON.parse(res.body)
    return {
      orgName:   data.orgName || data.name,
      pod:       data.pod,
      region:    data.region,
      productionStatus: data.status,
    }
  }

  // Fallback: beta tenant-config
  const res2 = await httpRequest(`${apiBase}/beta/tenant-config/product`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    timeout: 10000,
  })

  if (res2.status === 200) {
    const data = JSON.parse(res2.body)
    return { orgName: data.name || data.displayName, pod: data.pod }
  }

  return { orgName: null, pod: null }
}

// ── Action: get-identity-count ────────────────────────────────────────────────
// v2025/identities requires X-SailPoint-Experimental: true
// limit=1 + count=true — reads X-Total-Count header, downloads nothing
async function getIdentityCount(tenantUrl, accessToken) {
  const apiBase = getApiBase(tenantUrl)

  const res = await httpRequest(
    `${apiBase}/v2025/identities?limit=1&count=true`,
    {
      headers: {
        Authorization:               `Bearer ${accessToken}`,
        Accept:                      'application/json',
        'X-SailPoint-Experimental': 'true',
      },
      timeout: 12000,
    }
  )

  if (res.status === 200) {
    const count = parseInt(res.headers['x-total-count'] || '0', 10)
    return { count, raw: res.headers['x-total-count'] }
  }

  // Fallback: v3 search/count — no experimental header needed
  const countBody = JSON.stringify({ indices: ['identities'], query: { query: '*' } })
  const res2 = await httpRequest(`${apiBase}/v3/search/count`, {
    method:  'POST',
    headers: {
      Authorization:    `Bearer ${accessToken}`,
      Accept:           'application/json',
      'Content-Type':  'application/json',
      'Content-Length': Buffer.byteLength(countBody).toString(),
    },
    body:    countBody,
    timeout: 12000,
  })

  if (res2.status === 204 || res2.status === 200) {
    const count = parseInt(res2.headers['x-total-count'] || '0', 10)
    return { count, source: 'search-count' }
  }

  throw new Error(`Identity count failed — v2025 HTTP ${res.status}, search/count HTTP ${res2.status}`)
}

// ── Action: get-va-clusters ───────────────────────────────────────────────────
// Endpoint:  GET /v2026/managed-clusters
//            No experimental header required.  Returns all clusters for the org.
//
// VA cluster health:
//   The cluster-level health comes from the `health` object on each cluster record,
//   specifically `health.healthy` (boolean) and `health.status` (string).
//   The VA cluster status-change event trigger confirms statuses of "Succeeded"
//   (healthy) and "Failed" (unhealthy) at the cluster level via healthCheckResult.
//
// Type filtering:
//   Only include clusters where type === 'VA'.  CCG / SaaS clusters have
//   type === 'CCG' or no VAs at all — exclude them so counts stay accurate.
//
// Fallback chain:
//   v2026  →  v3  (some orgs lag behind API versions; both endpoints are identical
//   in structure so the same parsing logic works for both)
async function getVaClusters(tenantUrl, accessToken) {
  const apiBase = getApiBase(tenantUrl)
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }

  // Try v2026 first, fall back to v3 for orgs not yet on the latest version
  let body = null
  for (const version of ['v2026', 'v3']) {
    const res = await httpRequest(`${apiBase}/${version}/managed-clusters`, {
      headers,
      timeout: 12000,
    })
    if (res.status === 200) {
      body = res.body
      console.log(`[getVaClusters] /${version}/managed-clusters succeeded`)
      break
    }
    console.warn(`[getVaClusters] /${version}/managed-clusters returned HTTP ${res.status}`)
  }

  if (!body) {
    return { vaCount: 0, unhealthyCount: 0, clusters: [], note: 'Both v2026 and v3 failed' }
  }

  const allClusters = JSON.parse(body)

  // Log raw shape of first cluster to help diagnose health field issues
  if (allClusters.length > 0) {
    const sample = allClusters[0]
    console.log('[getVaClusters] Sample cluster keys:', Object.keys(sample).join(', '))
    if (sample.health !== undefined) {
      console.log('[getVaClusters] sample.health:', JSON.stringify(sample.health))
    }
    if (sample.clientStatus !== undefined) {
      console.log('[getVaClusters] sample.clientStatus:', JSON.stringify(sample.clientStatus))
    }
  }

  // Filter to VA clusters only — type 'VA' (upper or lower case)
  // Exclude CCG / SaaS proxy clusters (type 'CCG') and anything else
  const vaClusters = allClusters.filter(c => {
    const t = (c.type || '').toUpperCase()
    return t === 'VA'
  })

  // Determine health — multiple possible shapes depending on API version:
  //
  // Shape A (v2026 cluster list):
  //   c.health = { healthy: true|false, status: 'HEALTHY'|'UNHEALTHY'|'FAILED', ... }
  //
  // Shape B (v3 cluster list):
  //   c.clientStatus = { status: 'NORMAL'|'ERROR'|'WARNING'|'CONFIGURING' }
  //
  // Shape C (some tenants):
  //   c.status = string
  //
  // We check all three in priority order.
  function deriveStatus(c) {
    // Shape A — preferred
    if (c.health !== undefined) {
      if (typeof c.health.healthy === 'boolean') {
        return c.health.healthy ? 'CONNECTED' : (c.health.status || 'UNHEALTHY')
      }
      if (typeof c.health.status === 'string') {
        const hs = c.health.status.toUpperCase()
        return ['HEALTHY', 'OK', 'SUCCEEDED'].includes(hs) ? 'CONNECTED' : hs
      }
    }
    // Shape B — v3 clientStatus
    if (c.clientStatus?.status) {
      const cs = c.clientStatus.status.toUpperCase()
      return cs === 'NORMAL' ? 'CONNECTED' : cs
    }
    // Shape C — top-level status string
    if (c.status) {
      const st = c.status.toUpperCase()
      return ['HEALTHY', 'NORMAL', 'ACTIVE', 'CONNECTED', 'SUCCEEDED'].includes(st)
        ? 'CONNECTED' : st
    }
    // Unknown — assume healthy (don't penalise tenants with partial data)
    return 'CONNECTED'
  }

  const enriched = vaClusters.map(c => ({
    id:     c.id,
    name:   c.name || c.id,
    type:   'VA',
    status: deriveStatus(c),
  }))

  const vaCount    = enriched.length
  const unhealthy  = enriched.filter(c => c.status !== 'CONNECTED').length

  return { vaCount, unhealthyCount: unhealthy, clusters: enriched }
}

// ── Action: full-validation ───────────────────────────────────────────────────
async function fullValidation(tenantUrl, clientId, clientSecret) {
  const steps = []
  let accessToken = null

  // Step 1: Connectivity
  try {
    const conn = await testConnectivity(tenantUrl)
    steps.push({
      id: 'connectivity',
      label: 'DNS & TLS Reachability',
      status: conn.reachable ? 'pass' : 'fail',
      detail: conn.reachable
        ? `Reachable in ${conn.latencyMs}ms — HTTP ${conn.httpStatus}`
        : (conn.error || 'Host unreachable'),
    })
    if (!conn.reachable) {
      return { success: false, steps, error: 'Tenant URL is unreachable' }
    }
  } catch (err) {
    steps.push({ id: 'connectivity', label: 'DNS & TLS Reachability', status: 'fail', detail: err.message })
    return { success: false, steps, error: err.message }
  }

  // Step 2: TLS cert (implicit from successful HTTPS request above)
  steps.push({
    id: 'tls',
    label: 'TLS Certificate Valid',
    status: 'pass',
    detail: `HTTPS connection established to ${getApiBase(tenantUrl)}`,
  })

  // Step 3: API endpoint
  try {
    const apiBase = getApiBase(tenantUrl)
    const apiRes  = await httpRequest(`${apiBase}/oauth/token`, { method: 'HEAD', timeout: 8000 })
    steps.push({
      id: 'api',
      label: 'API Endpoint Reachable',
      status: apiRes.status < 500 ? 'pass' : 'fail',
      detail: `${apiBase}/oauth/token → HTTP ${apiRes.status}`,
    })
  } catch (err) {
    steps.push({ id: 'api', label: 'API Endpoint Reachable', status: 'fail', detail: err.message })
    return { success: false, steps, error: 'API endpoint unreachable' }
  }

  // Step 4: OAuth authentication
  try {
    const tok = await getToken(tenantUrl, clientId, clientSecret)
    accessToken = tok.accessToken
    steps.push({
      id: 'auth',
      label: 'OAuth2 Authentication',
      status: 'pass',
      detail: `Token issued — expires in ${tok.expiresIn}s`,
    })
  } catch (err) {
    steps.push({ id: 'auth', label: 'OAuth2 Authentication', status: 'fail', detail: err.message })
    return { success: false, steps, error: `Authentication failed: ${err.message}` }
  }

  // Step 5: Data retrieval
  let orgInfo       = {}
  let identityCount = 0
  let vaInfo        = {}

  try {
    orgInfo = await getOrgInfo(tenantUrl, accessToken)
    steps.push({
      id: 'org',
      label: 'Org Configuration Retrieved',
      status: 'pass',
      detail: orgInfo.orgName
        ? `Org: ${orgInfo.orgName}${orgInfo.pod ? ' — Pod: ' + orgInfo.pod : ''}`
        : 'Org info retrieved',
    })
  } catch (err) {
    steps.push({ id: 'org', label: 'Org Configuration Retrieved', status: 'warn', detail: `Non-fatal: ${err.message}` })
  }

  try {
    const ic      = await getIdentityCount(tenantUrl, accessToken)
    identityCount = ic.count
    steps.push({
      id: 'identities',
      label: 'Identity Data Access',
      status: 'pass',
      detail: `${identityCount.toLocaleString()} identities found`,
    })
  } catch (err) {
    steps.push({ id: 'identities', label: 'Identity Data Access', status: 'warn', detail: `Non-fatal: ${err.message}` })
  }

  try {
    vaInfo = await getVaClusters(tenantUrl, accessToken)
    steps.push({
      id: 'va',
      label: 'Virtual Appliance Clusters',
      status: 'pass',
      detail: `${vaInfo.vaCount} cluster(s) found${vaInfo.unhealthyCount > 0 ? ` — ${vaInfo.unhealthyCount} unhealthy` : ''}`,
    })
  } catch (err) {
    steps.push({ id: 'va', label: 'Virtual Appliance Clusters', status: 'warn', detail: `Non-fatal: ${err.message}` })
  }

  return {
    success: true,
    steps,
    tenantData: {
      orgName:       orgInfo.orgName,
      pod:           orgInfo.pod,
      identityCount,
      vaCount:       vaInfo.vaCount || 0,
      vaUnhealthy:   vaInfo.unhealthyCount || 0,
      vaClusters:    vaInfo.clusters || [],
      apiBase:       getApiBase(tenantUrl),
    },
  }
}

// ── Lambda handler ─────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  // Handle CORS preflight
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
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }

  const { action, tenantUrl, clientId, clientSecret } = body

  if (!tenantUrl) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'tenantUrl is required' }) }
  }

  // Domain allowlist — *.identitynow.com, *.identitynow-demo.com, *.rsm.security
  try {
    const u = new URL(tenantUrl)
    if (!isAllowedDomain(u.hostname)) {
      return {
        statusCode: 400,
        headers: CORS,
        body: JSON.stringify({
          error: `tenantUrl hostname "${u.hostname}" is not permitted. Allowed domains: *.identitynow.com, *.identitynow-demo.com, *.rsm.security`,
        }),
      }
    }
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid tenantUrl' }) }
  }

  try {
    let result

    switch (action) {
      case 'test-connectivity':
        result = await testConnectivity(tenantUrl)
        break

      case 'get-token':
        if (!clientId || !clientSecret) {
          return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'clientId and clientSecret required' }) }
        }
        result = await getToken(tenantUrl, clientId, clientSecret)
        // Never return the actual token in the response — just confirm success
        result = { success: true, expiresIn: result.expiresIn, tokenType: result.tokenType }
        break

      case 'full-validation':
        if (!clientId || !clientSecret) {
          return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'clientId and clientSecret required for full validation' }) }
        }
        result = await fullValidation(tenantUrl, clientId, clientSecret)
        break

      // Lightweight refresh — re-authenticates and fetches current identity count + VA status
      // Used by the tenant list refresh button without re-running full validation
      case 'refresh-counts':
        if (!clientId || !clientSecret) {
          return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'clientId and clientSecret required for refresh-counts' }) }
        }
        try {
          const tok      = await getToken(tenantUrl, clientId, clientSecret)
          const ic       = await getIdentityCount(tenantUrl, tok.accessToken)
          const vaInfo   = await getVaClusters(tenantUrl, tok.accessToken)
          result = {
            success:       true,
            identityCount: ic.count,
            vaCount:       vaInfo.vaCount,
            vaUnhealthy:   vaInfo.unhealthyCount,
            vaClusters:    vaInfo.clusters || [],
            refreshedAt:   new Date().toISOString(),
          }
        } catch (err) {
          result = { success: false, error: err.message }
        }
        break

      default:
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: `Unknown action: ${action}` }) }
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify(result) }

  } catch (err) {
    console.error('[sailpoint-proxy] Error:', err)
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message || 'Internal proxy error' }),
    }
  }
}
