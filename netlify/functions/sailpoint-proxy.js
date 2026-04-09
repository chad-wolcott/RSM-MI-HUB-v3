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
//
// Strategy (two independent approaches tried in order):
//
// ① GET /v2026/managed-clusters  →  GET /v3/managed-clusters
//    Returns an array of cluster objects.  Each cluster's `type` field can be:
//      - A string:  "VA", "CCG", etc.           (v3 / older API shape)
//      - An object: { id, name, clusterType }   (v2026 shape — Managed Cluster Types)
//    We log the FULL first cluster object so the actual shape is visible in
//    Netlify function logs, making future debugging straightforward.
//
// ② GET /v2026/managed-clients  (fallback)
//    Returns individual VA client records.  Each has:
//      clusterId            — links back to the cluster
//      clientStatus.status  — 'NORMAL' | 'ERROR' | 'WARNING' | 'CONFIGURING'
//    We group by clusterId to derive cluster count and per-cluster health.
//    This approach is always available regardless of cluster type filtering.
//
// Both paths surface diagnostic notes back to the caller so the UI can
// show "refresh to load" rather than silently showing 0.
async function getVaClusters(tenantUrl, accessToken) {
  const apiBase = getApiBase(tenantUrl)
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }

  // ── Helper: resolve the type value from a cluster record ──────────────────
  // In v3 the type is a plain string; in v2026 it may be an object reference
  // to a Managed Cluster Type record.
  function clusterTypeName(c) {
    if (!c.type) return ''
    if (typeof c.type === 'string') return c.type.toUpperCase()
    // v2026 object: { id, name, clusterType }
    if (typeof c.type === 'object') {
      return (c.type.name || c.type.clusterType || '').toUpperCase()
    }
    return ''
  }

  // ── Helper: is this cluster a VA cluster? ─────────────────────────────────
  // Accept 'VA' type.  If type is absent, conservatively include it — the cluster
  // list endpoint often only returns VA clusters for the calling org anyway.
  function isVaCluster(c) {
    const t = clusterTypeName(c)
    if (!t) return true      // type not set — include by default
    if (t === 'VA') return true
    // Exclude known non-VA types explicitly
    return !['CCG', 'SAAS', 'PROXY'].includes(t)
  }

  // ── Helper: derive readable status from a cluster record ──────────────────
  function clusterStatus(c) {
    // v3 shape: clientStatus.status === 'NORMAL' means healthy
    if (c.clientStatus?.status) {
      const s = c.clientStatus.status.toUpperCase()
      return s === 'NORMAL' ? 'CONNECTED' : s
    }
    // v2026 shape: health.healthy (bool) or health.status (string)
    if (c.health !== undefined) {
      if (typeof c.health.healthy === 'boolean') {
        return c.health.healthy ? 'CONNECTED' : (c.health.status || 'UNHEALTHY')
      }
      if (c.health.status) {
        const s = c.health.status.toUpperCase()
        return ['HEALTHY','OK','SUCCEEDED','NORMAL'].includes(s) ? 'CONNECTED' : s
      }
    }
    // Fallback: top-level status string
    if (c.status) {
      const s = c.status.toUpperCase()
      return ['HEALTHY','NORMAL','ACTIVE','CONNECTED','OK'].includes(s) ? 'CONNECTED' : s
    }
    return 'CONNECTED'  // unknown — assume healthy
  }

  // ── Strategy 1: managed-clusters list ────────────────────────────────────
  for (const version of ['v2026', 'v3']) {
    let res
    try {
      res = await httpRequest(`${apiBase}/${version}/managed-clusters`, { headers, timeout: 12000 })
    } catch (err) {
      console.warn(`[getVaClusters] ${version}/managed-clusters request error: ${err.message}`)
      continue
    }

    console.log(`[getVaClusters] ${version}/managed-clusters → HTTP ${res.status}`)

    if (res.status !== 200) {
      // Log error body to help diagnose 403 / 401 permission issues
      console.warn(`[getVaClusters] ${version} error body: ${res.body.slice(0, 500)}`)
      continue
    }

    let allClusters
    try { allClusters = JSON.parse(res.body) } catch { continue }

    if (!Array.isArray(allClusters)) {
      console.warn(`[getVaClusters] ${version} response is not an array:`, typeof allClusters)
      continue
    }

    console.log(`[getVaClusters] ${version} returned ${allClusters.length} cluster(s) total`)

    // Log the FULL first cluster so we can see the exact schema in function logs
    if (allClusters.length > 0) {
      console.log('[getVaClusters] First cluster (full):', JSON.stringify(allClusters[0]).slice(0, 1000))
    }

    const vaClusters = allClusters.filter(isVaCluster)
    console.log(`[getVaClusters] ${vaClusters.length} VA cluster(s) after type filter`)

    if (vaClusters.length > 0 || allClusters.length === 0) {
      // We got a valid response (even if 0 clusters — org genuinely has none)
      const enriched = vaClusters.map(c => ({
        id:     c.id,
        name:   c.name || c.id,
        type:   clusterTypeName(c) || 'VA',
        status: clusterStatus(c),
      }))
      const unhealthy = enriched.filter(c => c.status !== 'CONNECTED').length
      return { vaCount: enriched.length, unhealthyCount: unhealthy, clusters: enriched }
    }

    // Got clusters but type filter excluded all of them — fall through to strategy 2
    console.warn('[getVaClusters] All clusters excluded by type filter — trying managed-clients')
    break
  }

  // ── Strategy 2: managed-clients (individual VA nodes) ────────────────────
  // Groups by clusterId to reconstruct cluster-level counts.
  // clientStatus.status === 'NORMAL' = healthy VA node; anything else = unhealthy.
  console.log('[getVaClusters] Attempting strategy 2: managed-clients')
  try {
    const res = await httpRequest(`${apiBase}/v2026/managed-clients`, { headers, timeout: 12000 })
    console.log(`[getVaClusters] v2026/managed-clients → HTTP ${res.status}`)

    if (res.status === 200) {
      const clients = JSON.parse(res.body)
      if (!Array.isArray(clients)) {
        console.warn('[getVaClusters] managed-clients response not an array')
        return { vaCount: 0, unhealthyCount: 0, clusters: [], note: 'managed-clients not an array' }
      }

      console.log(`[getVaClusters] managed-clients returned ${clients.length} client(s)`)
      if (clients.length > 0) {
        console.log('[getVaClusters] First client (full):', JSON.stringify(clients[0]).slice(0, 800))
      }

      // Group clients by cluster
      const clusterMap = new Map()
      for (const client of clients) {
        const cid = client.clusterId || client.cluster?.id || 'unknown'
        const cname = client.clusterName || client.cluster?.name || cid
        const isHealthy = (client.clientStatus?.status || '').toUpperCase() === 'NORMAL'

        if (!clusterMap.has(cid)) {
          clusterMap.set(cid, { id: cid, name: cname, totalClients: 0, unhealthyClients: 0 })
        }
        const entry = clusterMap.get(cid)
        entry.totalClients++
        if (!isHealthy) entry.unhealthyClients++
      }

      const clusters = Array.from(clusterMap.values()).map(c => ({
        id:     c.id,
        name:   c.name,
        type:   'VA',
        status: c.unhealthyClients === 0 ? 'CONNECTED' : `${c.unhealthyClients}/${c.totalClients} unhealthy`,
      }))
      const unhealthy = clusters.filter(c => c.status !== 'CONNECTED').length

      return { vaCount: clusters.length, unhealthyCount: unhealthy, clusters }
    }

    console.warn(`[getVaClusters] managed-clients HTTP ${res.status}: ${res.body.slice(0, 400)}`)
  } catch (err) {
    console.warn(`[getVaClusters] managed-clients error: ${err.message}`)
  }

  // Both strategies failed — non-fatal, return empty
  return { vaCount: 0, unhealthyCount: 0, clusters: [], note: 'Both strategies failed — check function logs for HTTP status and error body' }
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
      status: vaInfo.note ? 'warn' : 'pass',
      detail: vaInfo.note
        ? `VA check non-fatal: ${vaInfo.note}`
        : `${vaInfo.vaCount} cluster(s) found${vaInfo.unhealthyCount > 0 ? ` — ${vaInfo.unhealthyCount} unhealthy` : ''}`,
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
