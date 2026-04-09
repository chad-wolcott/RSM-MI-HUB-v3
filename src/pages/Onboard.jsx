import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { validateISCTenant, deriveApiBase, isProxyAvailable } from '../lib/sailpointApi'
import { addLiveTenant, buildTenantRecord } from '../lib/tenantStore'
import { useAuth } from '../auth/AuthContext'

// ── Step definitions ──────────────────────────────────────────────────────────
const ISC_STEPS = ['Tenant Type', 'Client Info', 'Connection', 'Credentials', 'Validation', 'Review']
const PAM_STEPS = ['Tenant Type', 'Client Info', 'Connection', 'Credentials', 'Validation', 'Review']

// ── Small reusable components ─────────────────────────────────────────────────
function StepIndicator({ steps, current }) {
  return (
    <div className="wizard-steps mb-20">
      {steps.map((label, i) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <div className={`wizard-step${i < current ? ' done' : i === current ? ' active' : ''}`}>
            <div className="wizard-step-num">
              {i < current
                ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{width:13,height:13}}><polyline points="20 6 9 17 4 12"/></svg>
                : i + 1}
            </div>
            <span className="wizard-step-label">{label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`wizard-connector${i < current ? ' done' : ''}`} />
          )}
        </div>
      ))}
    </div>
  )
}

function Field({ label, hint, error, required, children }) {
  return (
    <div className="input-group">
      <label className="input-label">{label}{required && <span style={{color:'var(--red)',marginLeft:3}}>*</span>}</label>
      {children}
      {hint  && !error && <p className="input-hint">{hint}</p>}
      {error && <p className="error-msg">{error}</p>}
    </div>
  )
}

function SecretInput({ value, onChange, placeholder, disabled, id }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        className="input"
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        style={{ paddingRight: 40 }}
        autoComplete="new-password"
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'var(--text-3)', cursor:'pointer', padding:4, display:'flex' }}
        tabIndex={-1}
      >
        {show
          ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:15,height:15}}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:15,height:15}}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
      </button>
    </div>
  )
}

function CheckRow({ status, label, detail }) {
  const cfg = {
    pass:    { cls: 'pass',    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:14,height:14}}><polyline points="20 6 9 17 4 12"/></svg>, color: 'var(--green)' },
    fail:    { cls: 'fail',    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:14,height:14}}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>, color: 'var(--red)' },
    warn:    { cls: 'running', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:14,height:14}}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>, color: 'var(--amber)' },
    running: { cls: 'running', icon: <div className="spinner" />, color: 'var(--accent)' },
    pending: { cls: 'pending', icon: <div style={{width:14,height:14,borderRadius:'50%',border:'2px solid var(--border)'}} />, color: 'var(--text-3)' },
  }
  const { cls, icon, color } = cfg[status] || cfg.pending
  return (
    <div className={`check-item ${cls}`}>
      <div style={{ color, display:'flex', flexShrink:0 }}>{icon}</div>
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:500, color:'var(--text-1)', fontSize:13 }}>{label}</div>
        {detail && <div style={{ fontSize:11.5, color:'var(--text-3)', marginTop:2, fontFamily:'var(--font-mono)' }}>{detail}</div>}
      </div>
    </div>
  )
}

function ReviewRow({ label, value, mono, secret }) {
  const [revealed, setRevealed] = useState(false)
  return (
    <div style={{ display:'flex', padding:'9px 0', borderBottom:'1px solid var(--border-subtle)', gap:16, alignItems:'flex-start' }}>
      <span style={{ width:180, flexShrink:0, fontSize:12, fontWeight:600, letterSpacing:'0.04em', textTransform:'uppercase', color:'var(--text-3)', paddingTop:2 }}>{label}</span>
      <span style={{ fontFamily:mono?'var(--font-mono)':undefined, fontSize:mono?12.5:13, color:'var(--text-1)', flex:1, wordBreak:'break-all', display:'flex', alignItems:'center', gap:8 }}>
        {secret
          ? <>{revealed ? value : '••••••••••••••••'} <button style={{ background:'none', border:'none', color:'var(--text-3)', cursor:'pointer', fontSize:11, padding:0 }} onClick={()=>setRevealed(r=>!r)}>{revealed?'hide':'reveal'}</button></>
          : value}
      </span>
    </div>
  )
}

// ── Proxy availability banner ─────────────────────────────────────────────────
function ProxyWarning({ available }) {
  if (available === null) return null
  if (available) return null
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 14px', background:'rgba(240,168,33,0.07)', border:'1px solid rgba(240,168,33,0.2)', borderRadius:'var(--radius)', color:'var(--amber)', fontSize:12.5, marginBottom:16, lineHeight:1.5 }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:15,height:15,flexShrink:0,marginTop:1}}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <div>
        <strong>Netlify Functions not detected.</strong> Real connectivity tests require the Netlify CLI for local dev (<code style={{background:'rgba(0,0,0,0.2)',padding:'1px 4px',borderRadius:3,fontFamily:'var(--font-mono)',fontSize:11}}>npx netlify dev</code>) or deployment to Netlify. You can still complete the form — validation will run when deployed.
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// Main Onboard Component
// ═════════════════════════════════════════════════════════════════════════════
export default function Onboard() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [step,      setStep]      = useState(0)
  const [errors,    setErrors]    = useState({})
  const [done,      setDone]      = useState(false)
  const [newTenant, setNewTenant] = useState(null)

  // Proxy availability check
  const [proxyAvailable, setProxyAvailable] = useState(null)

  useEffect(() => {
    isProxyAvailable().then(setProxyAvailable)
  }, [])

  // Validation state
  const [validating,      setValidating]      = useState(false)
  const [validated,       setValidated]        = useState(false)
  const [validationSteps, setValidationSteps]  = useState([])
  const [validationError, setValidationError]  = useState(null)
  const [tenantData,      setTenantData]       = useState(null)

  const STEPS = ISC_STEPS

  // ── Form state ──────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    // Step 0
    tenantType:     '',
    // Step 1
    clientName:     '',
    clientId:       '',
    contactEmail:   '',
    notes:          '',
    // Step 2
    tenantUrl:      '',
    apiEndpoint:    '',
    // Step 3 - credentials
    credentialType: 'local',   // 'local' | 'delinea'
    // Local credential fields
    localClientId:     '',
    localClientSecret: '',
    // Delinea fields
    delineaPath:     '',
    delineaSecretId: '',
  })

  const set = (k) => (e) => {
    setForm(p => ({ ...p, [k]: e.target.value }))
    setErrors(p => { const n = {...p}; delete n[k]; return n })
  }

  const setVal = (k, v) => {
    setForm(p => ({ ...p, [k]: v }))
    setErrors(p => { const n = {...p}; delete n[k]; return n })
  }

  // Auto-derive API endpoint from tenant URL
  useEffect(() => {
    if (form.tenantUrl && form.tenantType === 'ISC') {
      const derived = deriveApiBase(form.tenantUrl)
      if (derived) setForm(p => ({ ...p, apiEndpoint: derived }))
    }
  }, [form.tenantUrl, form.tenantType])

  // ── Validation logic ────────────────────────────────────────────────────────
  const validate = (rules) => {
    const e = {}
    rules.forEach(([key, label, type]) => {
      const v = form[key]
      if (!v || !v.trim()) { e[key] = `${label} is required`; return }
      if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) e[key] = 'Invalid email address'
      if (type === 'url') {
        try { new URL(v) } catch { e[key] = 'Must be a valid URL (https://…)'; return }
        if (!v.startsWith('https://')) e[key] = 'URL must use HTTPS'
      }
    })
    setErrors(e)
    return Object.keys(e).length === 0
  }

  // ── Navigation ──────────────────────────────────────────────────────────────
  const next = () => {
    if (step === 0) {
      if (!form.tenantType) { setErrors({ tenantType: 'Please select a tenant type' }); return }
    }
    if (step === 1) {
      if (!validate([['clientName','Client Name'],['clientId','Client ID'],['contactEmail','Contact Email','email']])) return
    }
    if (step === 2) {
      if (!validate([['tenantUrl','Tenant URL','url'],['apiEndpoint','API Endpoint URL','url']])) return
      // ISC URL must match one of the allowed domains
      const ALLOWED = ['.identitynow.com', '.identitynow-demo.com', '.rsm.security']
      const urlHost = (() => { try { return new URL(form.tenantUrl).hostname } catch { return '' } })()
      if (form.tenantType === 'ISC' && !ALLOWED.some(d => urlHost.endsWith(d))) {
        setErrors({ tenantUrl: 'SailPoint ISC tenant URL must be *.identitynow.com, *.identitynow-demo.com, or *.rsm.security' }); return
      }
    }
    if (step === 3) {
      if (form.credentialType === 'local') {
        if (!validate([['localClientId','Client ID'],['localClientSecret','Client Secret']])) return
      } else {
        if (!validate([['delineaPath','Delinea Path'],['delineaSecretId','Secret ID']])) return
      }
    }
    setErrors({})
    setStep(s => s + 1)
  }

  const back = () => {
    if (step === 0) { navigate('/'); return }
    setStep(s => s - 1)
    setErrors({})
  }

  // ── Real validation via Netlify proxy ────────────────────────────────────────
  const runValidation = async () => {
    setValidating(true)
    setValidated(false)
    setValidationError(null)
    setValidationSteps([])
    setTenantData(null)

    // Seed the step display immediately so the user sees progress
    const initialSteps = [
      { id: 'connectivity', label: 'DNS & TLS Reachability',    status: 'running', detail: `Connecting to ${form.tenantUrl}…` },
      { id: 'tls',          label: 'TLS Certificate Valid',      status: 'pending', detail: '' },
      { id: 'api',          label: 'API Endpoint Reachable',     status: 'pending', detail: '' },
      { id: 'auth',         label: 'OAuth2 Authentication',      status: 'pending', detail: '' },
      { id: 'org',          label: 'Org Configuration Retrieved',status: 'pending', detail: '' },
      { id: 'identities',   label: 'Identity Data Access',       status: 'pending', detail: '' },
      { id: 'va',           label: 'Virtual Appliance Clusters', status: 'pending', detail: '' },
    ]
    setValidationSteps(initialSteps)

    // If proxy not available, run a simulated validation
    if (!proxyAvailable) {
      await runSimulatedValidation()
      return
    }

    try {
      const result = await validateISCTenant({
        tenantUrl:    form.tenantUrl,
        clientId:     form.localClientId,
        clientSecret: form.localClientSecret,
      })

      // Merge returned steps with our display steps
      const mergedSteps = initialSteps.map(disp => {
        const returned = result.steps?.find(s => s.id === disp.id)
        return returned ? { ...disp, ...returned } : disp
      })
      // Fill any un-reported steps as pending/skipped
      setValidationSteps(mergedSteps.map(s => s.status === 'running' ? { ...s, status: 'pending' } : s))

      if (result.success) {
        setTenantData(result.tenantData)
        setValidated(true)
      } else {
        setValidationError(result.error || 'Validation failed. Check credentials and try again.')
      }
    } catch (err) {
      setValidationError(`Connection error: ${err.message}`)
      setValidationSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'fail', detail: err.message } : s))
    } finally {
      setValidating(false)
    }
  }

  // Simulated validation for when proxy isn't running (local dev without netlify dev)
  const runSimulatedValidation = async () => {
    const delay = (ms) => new Promise(r => setTimeout(r, ms))
    const steps = [
      { id:'connectivity', label:'DNS & TLS Reachability',    detail:`${form.tenantUrl} → simulated` },
      { id:'tls',          label:'TLS Certificate Valid',      detail:'TLS 1.3 — simulated' },
      { id:'api',          label:'API Endpoint Reachable',     detail:`${form.apiEndpoint}/oauth/token → simulated` },
      { id:'auth',         label:'OAuth2 Authentication',      detail:'Token issued — simulated (deploy to Netlify for real auth)' },
      { id:'org',          label:'Org Configuration Retrieved',detail:`Org: ${form.clientName} (simulated)` },
      { id:'identities',   label:'Identity Data Access',       detail:'Identity count: simulated' },
      { id:'va',           label:'Virtual Appliance Clusters', detail:'VA data: simulated' },
    ]

    const current = [...steps.map((s, i) => ({ ...s, status: i === 0 ? 'running' : 'pending' }))]
    setValidationSteps(current)

    for (let i = 0; i < steps.length; i++) {
      await delay(i === 0 ? 800 : 600)
      setValidationSteps(prev => prev.map((s, idx) => {
        if (idx === i)   return { ...s, status: 'pass' }
        if (idx === i+1) return { ...s, status: 'running', detail: steps[i+1]?.detail || '' }
        return s
      }))
    }

    await delay(300)
    setValidationSteps(prev => prev.map(s => ({ ...s, status: 'pass' })))
    setTenantData({ orgName: form.clientName, identityCount: 0, vaCount: 0, vaUnhealthy: 0, simulated: true })
    setValidated(true)
    setValidating(false)
  }

  // ── Confirm onboarding ──────────────────────────────────────────────────────
  const handleConfirm = () => {
    const record = buildTenantRecord(form, { tenantData })
    record.addedBy = user?.email || 'unknown'
    if (tenantData?.simulated) record.simulated = true
    addLiveTenant(record)
    setNewTenant(record)
    setDone(true)
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (done && newTenant) {
    return (
      <>
        <div className="topbar"><span className="topbar-title">Onboard Tenant</span></div>
        <div className="page-body">
          <div className="card" style={{ maxWidth:560, margin:'48px auto', padding:'40px 32px' }}>
            <div style={{ textAlign:'center', marginBottom:24 }}>
              <div style={{ width:64, height:64, borderRadius:'50%', background:'var(--green-dim)', border:'2px solid var(--green)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" style={{width:28,height:28}}><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <h2 style={{ fontFamily:'var(--font-head)', fontSize:22, fontWeight:700, marginBottom:8 }}>Tenant Onboarded</h2>
              <p style={{ color:'var(--text-2)', fontSize:13.5 }}>
                <strong style={{color:'var(--text-1)'}}>{newTenant.client}</strong> has been added to the Managed Identity Hub.
              </p>
            </div>

            {/* Summary */}
            <div style={{ background:'var(--bg-hover)', borderRadius:'var(--radius)', padding:'14px 16px', marginBottom:20 }}>
              {[
                ['Type',        <span className={`badge ${newTenant.type==='ISC'?'badge-isc':'badge-pam'}`}>{newTenant.type}</span>],
                ['Tenant URL',  <span style={{fontFamily:'var(--font-mono)',fontSize:12}}>{newTenant.url}</span>],
                ['Credentials', newTenant.credentialType === 'local' ? 'Local OAuth2 client credentials' : 'Delinea Secret Server'],
                ['Identities',  newTenant.identities > 0 ? newTenant.identities.toLocaleString() : (newTenant.simulated ? 'Simulated' : 'N/A')],
                ['Pod',         newTenant.pod || '—'],
              ].map(([label, val]) => (
                <div key={label} style={{ display:'flex', alignItems:'center', gap:16, padding:'6px 0', borderBottom:'1px solid var(--border-subtle)' }}>
                  <span style={{ width:110, fontSize:11.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', color:'var(--text-3)' }}>{label}</span>
                  <span style={{ fontSize:13, color:'var(--text-1)' }}>{val}</span>
                </div>
              ))}
            </div>

            {newTenant.simulated && (
              <div style={{ padding:'10px 14px', background:'rgba(240,168,33,0.07)', border:'1px solid rgba(240,168,33,0.2)', borderRadius:'var(--radius)', fontSize:12.5, color:'var(--amber)', marginBottom:20 }}>
                This tenant was validated in <strong>simulated mode</strong> (Netlify Functions not available locally). Deploy to Netlify and re-validate for a live connectivity test.
              </div>
            )}

            <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
              <button className="btn btn-primary" onClick={() => navigate('/tenants')}>View in Tenant List</button>
              <button className="btn btn-secondary" onClick={() => {
                setStep(0); setDone(false); setValidated(false); setValidationSteps([]); setTenantData(null); setNewTenant(null)
                setForm({ tenantType:'',clientName:'',clientId:'',contactEmail:'',notes:'',tenantUrl:'',apiEndpoint:'',credentialType:'local',localClientId:'',localClientSecret:'',delineaPath:'',delineaSecretId:'' })
              }}>
                Onboard Another
              </button>
            </div>
          </div>
        </div>
      </>
    )
  }

  // ── Wizard ──────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Onboard Tenant</span>
        <span className="topbar-sub">— Guided setup wizard</span>
        {proxyAvailable === true && (
          <span style={{ marginLeft:8, display:'flex', alignItems:'center', gap:5, fontSize:12, color:'var(--green)' }}>
            <div style={{width:6,height:6,borderRadius:'50%',background:'var(--green)'}} />
            Netlify Functions active
          </span>
        )}
      </div>

      <div className="page-body">
        <div style={{ maxWidth:740, margin:'0 auto' }}>
          <StepIndicator steps={STEPS} current={step} />

          {/* ── Step 0: Tenant Type ───────────────────────────────────────── */}
          {step === 0 && (
            <div className="card">
              <div className="section-title">Select Tenant Type</div>
              <p style={{ color:'var(--text-2)', fontSize:13, marginBottom:18 }}>Choose the identity platform for this client.</p>
              <div className="radio-group">
                <div className={`radio-card${form.tenantType==='ISC'?' selected':''}`} onClick={() => setVal('tenantType','ISC')}>
                  <span className="badge badge-isc" style={{alignSelf:'flex-start',marginBottom:6}}>ISC</span>
                  <div className="radio-card-title">SailPoint Identity Security Cloud</div>
                  <div className="radio-card-sub">Managed identity governance. OAuth2 client credentials authentication via IdentityNow REST API v3/beta.</div>
                </div>
                <div className={`radio-card${form.tenantType==='PAM'?' selected':''}`} onClick={() => setVal('tenantType','PAM')} style={{opacity:0.6,cursor:'default'}} title="CyberArk PAM coming soon">
                  <span className="badge badge-pam" style={{alignSelf:'flex-start',marginBottom:6}}>PAM</span>
                  <div className="radio-card-title">CyberArk Privileged Access Management</div>
                  <div className="radio-card-sub">Privileged account management via PVWA REST API. <strong style={{color:'var(--amber)'}}>Coming soon.</strong></div>
                </div>
              </div>
              {errors.tenantType && <p className="error-msg" style={{marginTop:10}}>{errors.tenantType}</p>}
            </div>
          )}

          {/* ── Step 1: Client Info ───────────────────────────────────────── */}
          {step === 1 && (
            <div className="card">
              <div className="section-title">Client Information</div>
              <div className="two-col">
                <Field label="Client Name" required error={errors.clientName}>
                  <input className={`input${errors.clientName?' input-error':''}`} value={form.clientName} onChange={set('clientName')} placeholder="e.g. Northgate Defense Systems" />
                </Field>
                <Field label="Internal Client ID" required error={errors.clientId} hint="Internal reference code for this client">
                  <input className={`input${errors.clientId?' input-error':''}`} value={form.clientId} onChange={set('clientId')} placeholder="e.g. CLT-0042" />
                </Field>
              </div>
              <Field label="Primary Contact Email" required error={errors.contactEmail}>
                <input className={`input${errors.contactEmail?' input-error':''}`} type="email" value={form.contactEmail} onChange={set('contactEmail')} placeholder="contact@client.com" />
              </Field>
              <Field label="Notes" hint="Optional notes about this client or tenant">
                <textarea className="input" value={form.notes} onChange={set('notes')} placeholder="Any relevant context about this client's environment…" />
              </Field>
            </div>
          )}

          {/* ── Step 2: Connection Details ────────────────────────────────── */}
          {step === 2 && (
            <div className="card">
              <div className="section-title">Tenant Connection Details</div>
              <Field label="Tenant URL" required error={errors.tenantUrl} hint="Allowed: *.identitynow.com, *.identitynow-demo.com, *.rsm.security">
                <input
                  className={`input${errors.tenantUrl?' input-error':''}`}
                  value={form.tenantUrl}
                  onChange={set('tenantUrl')}
                  placeholder="https://acme.identitynow.com"
                />
              </Field>
              <Field label="API Endpoint URL" required error={errors.apiEndpoint} hint="Auto-derived from tenant URL — verify before proceeding">
                <input
                  className={`input${errors.apiEndpoint?' input-error':''}`}
                  value={form.apiEndpoint}
                  onChange={set('apiEndpoint')}
                  placeholder="https://acme.api.identitynow.com"
                />
              </Field>
              {form.tenantUrl && form.apiEndpoint && (
                <div style={{ padding:'10px 14px', background:'var(--accent-dim)', border:'1px solid rgba(0,156,222,0.15)', borderRadius:'var(--radius)', fontSize:12.5, color:'var(--accent)', display:'flex', alignItems:'flex-start', gap:8 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:14,height:14,flexShrink:0,marginTop:1}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                  <div>
                    <div>Token endpoint will be: <code style={{fontFamily:'var(--font-mono)',fontSize:11.5}}>{form.apiEndpoint}/oauth/token</code></div>
                    <div style={{marginTop:2,opacity:0.8}}>This is auto-derived. Only change if your org uses a custom API domain.</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Credentials ───────────────────────────────────────── */}
          {step === 3 && (
            <div className="card">
              <div className="section-title">Credential Configuration</div>
              <p style={{ color:'var(--text-2)', fontSize:13, marginBottom:18 }}>Choose how MIH will authenticate to this tenant when launching sessions and polling health data.</p>

              {/* Credential type selector */}
              <div className="radio-group" style={{ marginBottom:20 }}>
                <div
                  className={`radio-card${form.credentialType==='local'?' selected':''}`}
                  onClick={() => setVal('credentialType','local')}
                >
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:16,height:16,color:'var(--accent)'}}><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
                    <div className="radio-card-title">Local Credentials</div>
                  </div>
                  <div className="radio-card-sub">Enter an OAuth2 Client ID and Client Secret directly. Credentials are stored locally in the browser for this session and in the tenant record.</div>
                  <div style={{ marginTop:6, fontSize:11, color:'var(--amber)' }}>⚠ Prototype: production should use a vault</div>
                </div>
                <div
                  className={`radio-card${form.credentialType==='delinea'?' selected':''}`}
                  onClick={() => setVal('credentialType','delinea')}
                >
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:16,height:16,color:'var(--green)'}}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    <div className="radio-card-title">Delinea Secret Server</div>
                  </div>
                  <div className="radio-card-sub">Reference a secret stored in Delinea Secret Server. Credentials are retrieved at launch time — never stored in MIH.</div>
                  <div style={{ marginTop:6, fontSize:11, color:'var(--green)' }}>✓ Recommended for production</div>
                </div>
              </div>

              {/* Local credential fields */}
              {form.credentialType === 'local' && (
                <div style={{ padding:'16px', background:'var(--bg-hover)', borderRadius:'var(--radius)', border:'1px solid var(--border)' }}>
                  <div style={{ fontSize:12, fontWeight:600, letterSpacing:'0.04em', textTransform:'uppercase', color:'var(--text-3)', marginBottom:12 }}>
                    OAuth2 Client Credentials — {form.clientName || 'Tenant'}
                  </div>
                  <Field label="Client ID" required error={errors.localClientId} hint="The OAuth2 client_id from SailPoint ISC (Admin → API Management → OAuth Clients)">
                    <input
                      className={`input${errors.localClientId?' input-error':''}`}
                      value={form.localClientId}
                      onChange={set('localClientId')}
                      placeholder="e.g. a4f8b2c1-3d9e-4f7a-b6c5-e2d1f8a09b3c"
                      autoComplete="off"
                    />
                  </Field>
                  <Field label="Client Secret" required error={errors.localClientSecret} hint="The client secret — keep this confidential">
                    <SecretInput
                      value={form.localClientSecret}
                      onChange={set('localClientSecret')}
                      placeholder="Enter client secret"
                    />
                  </Field>
                  <div style={{ padding:'10px 12px', background:'rgba(240,168,33,0.06)', border:'1px solid rgba(240,168,33,0.15)', borderRadius:'var(--radius)', fontSize:12, color:'var(--amber)', lineHeight:1.6 }}>
                    <strong>How to create an OAuth2 client in SailPoint ISC:</strong><br/>
                    Admin → API Management → OAuth Clients → New OAuth Client<br/>
                    Grant type: <code style={{fontFamily:'var(--font-mono)',fontSize:11}}>client_credentials</code> &nbsp;·&nbsp;
                    Scopes: <code style={{fontFamily:'var(--font-mono)',fontSize:11}}>idn:all</code> (or minimum required)
                  </div>
                </div>
              )}

              {/* Delinea fields */}
              {form.credentialType === 'delinea' && (
                <div style={{ padding:'16px', background:'var(--bg-hover)', borderRadius:'var(--radius)', border:'1px solid var(--border)' }}>
                  <div style={{ fontSize:12, fontWeight:600, letterSpacing:'0.04em', textTransform:'uppercase', color:'var(--text-3)', marginBottom:12 }}>
                    Delinea Secret Server Reference
                  </div>
                  <Field label="Secret Folder Path" required error={errors.delineaPath} hint="Full folder path in Delinea (e.g. Clients/Acme/ISC-Admin)">
                    <input className={`input${errors.delineaPath?' input-error':''}`} value={form.delineaPath} onChange={set('delineaPath')} placeholder="Clients/ClientName/ISC-Admin" />
                  </Field>
                  <Field label="Secret ID" required error={errors.delineaSecretId} hint="Numeric ID of the secret record in Delinea">
                    <input className={`input${errors.delineaSecretId?' input-error':''}`} value={form.delineaSecretId} onChange={set('delineaSecretId')} placeholder="e.g. 1042" />
                  </Field>
                  <div style={{ padding:'10px 12px', background:'var(--accent-dim)', border:'1px solid rgba(0,156,222,0.15)', borderRadius:'var(--radius)', fontSize:12, color:'var(--accent)', lineHeight:1.6 }}>
                    MIH will retrieve credentials from Delinea at launch time using the configured service account. Credentials are never cached or stored in MIH.
                    <br/><strong>Note:</strong> Real Delinea retrieval requires the MIH backend service (Netlify Functions or API server) to have network access to your Delinea vault.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: Validation ────────────────────────────────────────── */}
          {step === 4 && (
            <div className="card">
              <div className="section-title">Connectivity Validation</div>
              <p style={{ color:'var(--text-2)', fontSize:13, marginBottom:12 }}>
                Testing connectivity to <strong style={{color:'var(--text-1)'}}>{form.tenantUrl}</strong>
                {form.credentialType === 'local'
                  ? ' using the provided OAuth2 client credentials.'
                  : ' — credentials will be retrieved from Delinea at launch time.'}
              </p>

              <ProxyWarning available={proxyAvailable} />

              {/* Validation steps */}
              {validationSteps.length > 0 && (
                <div style={{ marginBottom:14 }}>
                  {validationSteps.map(s => (
                    <CheckRow key={s.id} status={s.status} label={s.label} detail={s.detail} />
                  ))}
                </div>
              )}

              {/* Tenant data summary after success */}
              {validated && tenantData && !tenantData.simulated && (
                <div style={{ padding:'12px 16px', background:'var(--green-dim)', border:'1px solid var(--green)', borderRadius:'var(--radius)', marginBottom:14 }}>
                  <div style={{ fontWeight:600, color:'var(--green)', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:14,height:14}}><polyline points="20 6 9 17 4 12"/></svg>
                    All checks passed — tenant validated
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 20px', fontSize:12.5 }}>
                    {tenantData.orgName      && <div><span style={{color:'var(--text-3)'}}>Org name: </span><strong style={{color:'var(--text-1)'}}>{tenantData.orgName}</strong></div>}
                    {tenantData.pod          && <div><span style={{color:'var(--text-3)'}}>Pod: </span><strong style={{color:'var(--text-1)'}}>{tenantData.pod}</strong></div>}
                    <div><span style={{color:'var(--text-3)'}}>Identities: </span><strong style={{color:'var(--text-1)'}}>{tenantData.identityCount?.toLocaleString() || '—'}</strong></div>
                    <div><span style={{color:'var(--text-3)'}}>VA clusters: </span><strong style={{color:'var(--text-1)'}}>{tenantData.vaCount ?? '—'}</strong></div>
                  </div>
                </div>
              )}

              {validated && tenantData?.simulated && (
                <div style={{ padding:'10px 14px', background:'var(--green-dim)', border:'1px solid var(--green)', borderRadius:'var(--radius)', color:'var(--green)', fontSize:13, display:'flex', gap:8, alignItems:'center', marginBottom:14 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:14,height:14}}><polyline points="20 6 9 17 4 12"/></svg>
                  <strong>Simulated validation passed.</strong> Deploy to Netlify for live credential testing.
                </div>
              )}

              {validationError && (
                <div style={{ padding:'12px 14px', background:'var(--red-dim)', border:'1px solid var(--red)', borderRadius:'var(--radius)', color:'var(--red)', fontSize:13, marginBottom:14 }}>
                  <strong>Validation failed:</strong> {validationError}
                  <div style={{ marginTop:6, fontSize:12, opacity:0.8 }}>Check your tenant URL and credentials, then retry.</div>
                </div>
              )}

              {/* Run / Retry button */}
              {!validating && (
                <button className="btn btn-primary" onClick={runValidation}>
                  {validationSteps.length > 0
                    ? <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:13,height:13}}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>Retry Validation</>
                    : <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:13,height:13}}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>Run Connectivity Test</>}
                </button>
              )}
              {validating && (
                <div style={{ fontSize:12.5, color:'var(--text-3)', display:'flex', alignItems:'center', gap:8, marginTop:4 }}>
                  <div style={{ width:14, height:14, border:'2px solid var(--accent-dim)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
                  Testing connectivity…
                  <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>
              )}
            </div>
          )}

          {/* ── Step 5: Review ────────────────────────────────────────────── */}
          {step === 5 && (
            <div className="card">
              <div className="section-title">Review & Confirm</div>
              <p style={{ color:'var(--text-2)', fontSize:13, marginBottom:20 }}>
                Review all details before adding this tenant to the Managed Identity Hub.
              </p>
              <ReviewRow label="Tenant Type"     value={<span className={`badge ${form.tenantType==='ISC'?'badge-isc':'badge-pam'}`}>{form.tenantType}</span>} />
              <ReviewRow label="Client Name"     value={form.clientName} />
              <ReviewRow label="Client ID"       value={form.clientId} mono />
              <ReviewRow label="Contact Email"   value={form.contactEmail} />
              <ReviewRow label="Tenant URL"      value={form.tenantUrl} mono />
              <ReviewRow label="API Endpoint"    value={form.apiEndpoint} mono />

              <div style={{ height:1, background:'var(--border)', margin:'12px 0' }} />
              <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text-3)', marginBottom:8 }}>Credentials</div>
              <ReviewRow label="Method" value={form.credentialType === 'local' ? 'Local OAuth2 client credentials' : 'Delinea Secret Server'} />
              {form.credentialType === 'local'   && <ReviewRow label="Client ID"    value={form.localClientId}     mono />}
              {form.credentialType === 'local'   && <ReviewRow label="Client Secret" value={form.localClientSecret} mono secret />}
              {form.credentialType === 'delinea' && <ReviewRow label="Delinea Path"  value={form.delineaPath}       mono />}
              {form.credentialType === 'delinea' && <ReviewRow label="Secret ID"     value={form.delineaSecretId}   mono />}

              {tenantData && !tenantData.simulated && (
                <>
                  <div style={{ height:1, background:'var(--border)', margin:'12px 0' }} />
                  <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text-3)', marginBottom:8 }}>Live Tenant Data</div>
                  {tenantData.orgName     && <ReviewRow label="Org Name"   value={tenantData.orgName} />}
                  {tenantData.pod         && <ReviewRow label="Pod"        value={tenantData.pod} mono />}
                  <ReviewRow label="Identities" value={(tenantData.identityCount || 0).toLocaleString()} />
                  <ReviewRow label="VA Clusters" value={tenantData.vaCount?.toString() || '0'} />
                </>
              )}

              {form.notes && <ReviewRow label="Notes" value={form.notes} />}
            </div>
          )}

          {/* ── Navigation ────────────────────────────────────────────────── */}
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:16 }}>
            <button className="btn btn-ghost" onClick={back}>
              {step === 0 ? 'Cancel' : '← Back'}
            </button>
            <div style={{ display:'flex', gap:8 }}>
              {step < STEPS.length - 1 && (
                <button
                  className="btn btn-primary"
                  onClick={next}
                  disabled={step === 4 && !validated}
                >
                  {step === 4
                    ? validated ? 'Continue →' : 'Run validation to continue'
                    : 'Next →'}
                </button>
              )}
              {step === STEPS.length - 1 && (
                <button className="btn btn-success" onClick={handleConfirm}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:13,height:13}}><polyline points="20 6 9 17 4 12"/></svg>
                  Confirm &amp; Add Tenant
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
