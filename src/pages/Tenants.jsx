import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useResizableColumns } from '../lib/useResizableColumns.jsx'
import { useNavigate } from 'react-router-dom'
import { MOCK_TENANTS } from '../data/mock'
import { getLiveTenants, removeLiveTenant, updateLiveTenant } from '../lib/tenantStore'
import { refreshTenantCounts, validateISCTenant, deriveApiBase } from '../lib/sailpointApi'

// ── Source badge ──────────────────────────────────────────────────────────────
function SourceBadge({ source, simulated }) {
  if (source === 'live') {
    return (
      <span style={{
        display:'inline-flex', alignItems:'center', gap:4,
        fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20,
        background: simulated ? 'rgba(240,168,33,0.1)' : 'rgba(63,156,53,0.12)',
        color:      simulated ? 'var(--amber)' : 'var(--green)',
        border:`1px solid ${simulated ? 'rgba(240,168,33,0.25)' : 'rgba(63,156,53,0.25)'}`,
        letterSpacing:'0.05em', textTransform:'uppercase',
      }}>
        <span style={{
          width:5, height:5, borderRadius:'50%',
          background: simulated ? 'var(--amber)' : 'var(--green)',
          animation: simulated ? 'none' : 'livePulse 2s infinite',
        }}/>
        {simulated ? 'Simulated' : 'Live'}
      </span>
    )
  }
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:4,
      fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20,
      background:'rgba(136,139,141,0.1)', color:'var(--rsm-gray)',
      border:'1px solid rgba(136,139,141,0.2)',
      letterSpacing:'0.05em', textTransform:'uppercase',
    }}>
      <span style={{width:5,height:5,borderRadius:'50%',background:'var(--rsm-gray)'}}/>
      Mock
    </span>
  )
}

// ── SecretInput ────────────────────────────────────────────────────────────────
function SecretInput({ value, onChange, placeholder, disabled }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{position:'relative'}}>
      <input className="input" type={show?'text':'password'} value={value} onChange={onChange}
        placeholder={placeholder} disabled={disabled} style={{paddingRight:40}} autoComplete="new-password"/>
      <button type="button" onClick={()=>setShow(s=>!s)}
        style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:'var(--text-3)',cursor:'pointer',padding:4,display:'flex'}} tabIndex={-1}>
        {show
          ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:14,height:14}}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:14,height:14}}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
      </button>
    </div>
  )
}

// ── Edit Tenant Modal ─────────────────────────────────────────────────────────
function EditTenantModal({ tenant, onSave, onClose }) {
  const ALLOWED_DOMAINS = ['.identitynow.com','.identitynow-demo.com','.rsm.security']
  const [form, setForm] = useState({
    client:          tenant.client          || '',
    contactEmail:    tenant.contactEmail    || '',
    notes:           tenant.notes           || '',
    tenantUrl:       tenant.url             || '',
    apiEndpoint:     tenant.apiBase         || '',
    credentialType:  tenant.credentialType  || 'local',
    localClientId:   tenant.localClientId   || '',
    localClientSecret: tenant.localClientSecret || '',
    delineaPath:     tenant.delineaPath     || '',
    delineaSecretId: tenant.delineaSecretId || '',
  })
  const [errors,    setErrors]    = useState({})
  const [validating,setValidating]= useState(false)
  const [valSteps,  setValSteps]  = useState([])
  const [valResult, setValResult] = useState(null)
  const [valError,  setValError]  = useState(null)
  const [saving,    setSaving]    = useState(false)

  const set = (k) => (e) => {
    setForm(p => ({...p,[k]:e.target.value}))
    setErrors(p => { const n={...p}; delete n[k]; return n })
    setValResult(null); setValError(null)
  }

  // Auto-derive API endpoint
  useEffect(() => {
    const derived = deriveApiBase(form.tenantUrl)
    if (derived) setForm(p => ({...p, apiEndpoint: derived}))
  }, [form.tenantUrl])

  const validate = () => {
    const e = {}
    if (!form.client.trim())       e.client = 'Client name required'
    if (!form.tenantUrl.trim())    e.tenantUrl = 'Tenant URL required'
    else {
      try { new URL(form.tenantUrl) } catch { e.tenantUrl = 'Invalid URL' }
      if (!e.tenantUrl) {
        const host = new URL(form.tenantUrl).hostname
        if (!ALLOWED_DOMAINS.some(d => host.endsWith(d)))
          e.tenantUrl = 'Must be *.identitynow.com, *.identitynow-demo.com, or *.rsm.security'
      }
    }
    if (!form.apiEndpoint.trim()) e.apiEndpoint = 'API endpoint required'
    if (form.credentialType === 'local') {
      if (!form.localClientId.trim())     e.localClientId = 'Client ID required'
      if (!form.localClientSecret.trim()) e.localClientSecret = 'Client secret required'
    } else {
      if (!form.delineaPath.trim())    e.delineaPath = 'Delinea path required'
      if (!form.delineaSecretId.trim()) e.delineaSecretId = 'Secret ID required'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const runRevalidate = async () => {
    if (!validate()) return
    setValidating(true); setValResult(null); setValError(null)
    const seed = [
      {id:'connectivity',label:'DNS & TLS Reachability',    status:'running',detail:''},
      {id:'tls',         label:'TLS Certificate Valid',     status:'pending',detail:''},
      {id:'api',         label:'API Endpoint Reachable',    status:'pending',detail:''},
      {id:'auth',        label:'OAuth2 Authentication',     status:'pending',detail:''},
      {id:'org',         label:'Org Configuration',        status:'pending',detail:''},
      {id:'identities',  label:'Identity Data Access',      status:'pending',detail:''},
      {id:'va',          label:'Virtual Appliance Clusters',status:'pending',detail:''},
    ]
    setValSteps(seed)
    try {
      const result = await validateISCTenant({
        tenantUrl:    form.tenantUrl,
        clientId:     form.localClientId,
        clientSecret: form.localClientSecret,
      })
      const merged = seed.map(d => {
        const r = result.steps?.find(s => s.id === d.id)
        return r ? {...d,...r} : d
      }).map(s => s.status === 'running' ? {...s,status:'pending'} : s)
      setValSteps(merged)
      if (result.success) setValResult(result.tenantData)
      else setValError(result.error || 'Validation failed')
    } catch (err) {
      setValError(err.message)
      setValSteps(prev => prev.map(s => s.status==='running' ? {...s,status:'fail',detail:err.message} : s))
    }
    setValidating(false)
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    const patch = {
      client:       form.client,
      contactEmail: form.contactEmail,
      notes:        form.notes,
      url:          form.tenantUrl,
      apiBase:      form.apiEndpoint,
      credentialType: form.credentialType,
      ...(form.credentialType === 'local' ? {
        localClientId:     form.localClientId,
        localClientSecret: form.localClientSecret,
      } : {
        delineaPath:     form.delineaPath,
        delineaSecretId: form.delineaSecretId,
      }),
      ...(valResult ? {
        orgName:       valResult.orgName,
        pod:           valResult.pod,
        identities:    valResult.identityCount,
        vas:           valResult.vaCount,
        vaUnhealthy:   valResult.vaUnhealthy,
        vaClusters:    valResult.vaClusters  || [],
        health:        'healthy',
        simulated:     false,
        lastChecked:   'Just now',
      } : {}),
    }
    updateLiveTenant(tenant.id, patch)
    setSaving(false)
    onSave()
  }

  const stepIcon = (status) => {
    if (status==='pass')    return <svg viewBox="0 0 24 24" fill="none" stroke="var(--green)"    strokeWidth="2.5" style={{width:13,height:13}}><polyline points="20 6 9 17 4 12"/></svg>
    if (status==='fail')    return <svg viewBox="0 0 24 24" fill="none" stroke="var(--red)"     strokeWidth="2.5" style={{width:13,height:13}}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    if (status==='warn')    return <svg viewBox="0 0 24 24" fill="none" stroke="var(--amber)"   strokeWidth="2"   style={{width:13,height:13}}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    if (status==='running') return <div style={{width:13,height:13,border:'2px solid rgba(0,156,222,0.3)',borderTopColor:'var(--accent)',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}/>
    return <div style={{width:13,height:13,borderRadius:'50%',border:'2px solid var(--border)'}}/>
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal" style={{maxWidth:580,maxHeight:'90vh',overflowY:'auto'}}>
        <div className="modal-header">
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:16,height:16,color:'var(--accent)'}}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            <span className="modal-title">Edit Tenant — {tenant.client}</span>
          </div>
        </div>
        <div className="modal-body" style={{display:'flex',flexDirection:'column',gap:14}}>

          {/* Client info */}
          <div>
            <div style={{fontSize:11,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-3)',marginBottom:10}}>Client Information</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
              <div>
                <label className="input-label">Client Name *</label>
                <input className={`input${errors.client?' input-error':''}`} value={form.client} onChange={set('client')} placeholder="Client name"/>
                {errors.client && <p className="error-msg">{errors.client}</p>}
              </div>
              <div>
                <label className="input-label">Contact Email</label>
                <input className="input" type="email" value={form.contactEmail} onChange={set('contactEmail')} placeholder="contact@client.com"/>
              </div>
            </div>
            <div>
              <label className="input-label">Notes</label>
              <textarea className="input" value={form.notes} onChange={set('notes')} placeholder="Optional notes…" style={{height:54,resize:'vertical'}}/>
            </div>
          </div>

          {/* Connection */}
          <div>
            <div style={{fontSize:11,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-3)',marginBottom:10}}>Connection</div>
            <div style={{marginBottom:10}}>
              <label className="input-label">Tenant URL *</label>
              <input className={`input${errors.tenantUrl?' input-error':''}`} value={form.tenantUrl} onChange={set('tenantUrl')} placeholder="https://org.identitynow.com"/>
              {errors.tenantUrl && <p className="error-msg">{errors.tenantUrl}</p>}
            </div>
            <div>
              <label className="input-label">API Endpoint *</label>
              <input className={`input${errors.apiEndpoint?' input-error':''}`} value={form.apiEndpoint} onChange={set('apiEndpoint')} placeholder="https://org.api.identitynow.com"/>
              {errors.apiEndpoint && <p className="error-msg">{errors.apiEndpoint}</p>}
            </div>
          </div>

          {/* Credentials */}
          <div>
            <div style={{fontSize:11,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-3)',marginBottom:10}}>Credentials</div>
            <div style={{display:'flex',gap:8,marginBottom:12}}>
              {['local','delinea'].map(t => (
                <button key={t} type="button"
                  onClick={() => { setForm(p=>({...p,credentialType:t})); setValResult(null); setValError(null) }}
                  style={{
                    flex:1, padding:'8px 0', borderRadius:'var(--radius)',
                    background: form.credentialType===t ? 'var(--accent)' : 'var(--bg-hover)',
                    border:`1px solid ${form.credentialType===t ? 'var(--accent)' : 'var(--border)'}`,
                    color: form.credentialType===t ? '#fff' : 'var(--text-2)',
                    fontSize:12.5, fontWeight:600, cursor:'pointer', transition:'all 0.15s',
                  }}>
                  {t === 'local' ? '🔑 Local OAuth2' : '🛡 Delinea Vault'}
                </button>
              ))}
            </div>

            {form.credentialType === 'local' && (
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div>
                  <label className="input-label">Client ID *</label>
                  <input className={`input${errors.localClientId?' input-error':''}`} value={form.localClientId} onChange={set('localClientId')} placeholder="OAuth2 Client ID" autoComplete="off"/>
                  {errors.localClientId && <p className="error-msg">{errors.localClientId}</p>}
                </div>
                <div>
                  <label className="input-label">Client Secret *</label>
                  <SecretInput value={form.localClientSecret} onChange={set('localClientSecret')} placeholder="Client secret"/>
                  {errors.localClientSecret && <p className="error-msg">{errors.localClientSecret}</p>}
                </div>
              </div>
            )}
            {form.credentialType === 'delinea' && (
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div>
                  <label className="input-label">Delinea Path *</label>
                  <input className={`input${errors.delineaPath?' input-error':''}`} value={form.delineaPath} onChange={set('delineaPath')} placeholder="Clients/Name/ISC-Admin"/>
                  {errors.delineaPath && <p className="error-msg">{errors.delineaPath}</p>}
                </div>
                <div>
                  <label className="input-label">Secret ID *</label>
                  <input className={`input${errors.delineaSecretId?' input-error':''}`} value={form.delineaSecretId} onChange={set('delineaSecretId')} placeholder="e.g. 1042"/>
                  {errors.delineaSecretId && <p className="error-msg">{errors.delineaSecretId}</p>}
                </div>
              </div>
            )}
          </div>

          {/* Re-validation section */}
          <div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-3)'}}>Connectivity Check</div>
              <button className="btn btn-secondary btn-sm" onClick={runRevalidate} disabled={validating}>
                {validating
                  ? <><div style={{width:11,height:11,border:'2px solid rgba(0,156,222,0.3)',borderTopColor:'var(--accent)',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}/> Validating…</>
                  : <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:11,height:11}}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Re-validate Connection</>}
              </button>
            </div>

            {valSteps.length > 0 && (
              <div style={{display:'flex',flexDirection:'column',gap:4}}>
                {valSteps.map(s => (
                  <div key={s.id} style={{display:'flex',alignItems:'flex-start',gap:8,padding:'5px 8px',background:'var(--bg-hover)',borderRadius:4}}>
                    <div style={{marginTop:1}}>{stepIcon(s.status)}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12.5,fontWeight:500,color:'var(--text-1)'}}>{s.label}</div>
                      {s.detail && <div style={{fontSize:11,color:'var(--text-3)',fontFamily:'var(--font-mono)',marginTop:1}}>{s.detail}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {valResult && (
              <div style={{marginTop:10,padding:'10px 12px',background:'var(--green-dim)',border:'1px solid var(--green)',borderRadius:'var(--radius)',fontSize:12.5,color:'var(--green)',display:'flex',alignItems:'center',gap:6}}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:13,height:13}}><polyline points="20 6 9 17 4 12"/></svg>
                Validation passed — tenant data updated
              </div>
            )}
            {valError && (
              <div style={{marginTop:10,padding:'10px 12px',background:'var(--red-dim)',border:'1px solid var(--red)',borderRadius:'var(--radius)',fontSize:12.5,color:'var(--red)'}}>
                <strong>Validation failed:</strong> {valError}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  )
}

// ── Launch Modal ──────────────────────────────────────────────────────────────
function LaunchModal({ tenant, onClose }) {
  const [step, setStep] = useState(0)

  const steps = [
    { label: 'Validating analyst session',  sub: 'Checking authentication token & role authorization…' },
    { label: 'Retrieving credentials',
      sub: tenant.source === 'live' && tenant.credentialType === 'delinea'
        ? `Fetching from Delinea: ${tenant.delineaPath || 'Secret Server'}`
        : tenant.source === 'live'
        ? `OAuth2 client credentials for ${tenant.client}`
        : `Fetching from Delinea: ${tenant.delineaSecret || 'Clients/' + tenant.client + '/ISC-Admin'}` },
    { label: 'Establishing secure session', sub: `Authenticating to ${tenant.type === 'ISC' ? 'SailPoint ISC' : 'CyberArk PAM'}…` },
    { label: 'Opening tenant console',      sub: `Opening ${tenant.client} in a new tab…` },
  ]

  const runLaunch = () => {
    setStep(1)
    const delays = [1400, 900, 900, 800]
    let current = 1
    const tick = () => {
      if (current > steps.length) return
      setTimeout(() => {
        current++
        setStep(current)
        // When the last step completes, open the URL
        if (current === steps.length + 1) {
          window.open(tenant.url, '_blank', 'noopener,noreferrer')
        }
        tick()
      }, delays[current - 1] || 900)
    }
    tick()
  }

  const statusOf = (i) => {
    if (step === 0)        return 'pending'
    if (i < step)          return 'success'
    if (i === step)        return 'running'
    return 'pending'
  }
  const isComplete = step > steps.length

  return (
    <div className="modal-backdrop" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal" style={{maxWidth:500}}>
        <div className="modal-header">
          <div style={{display:'flex',alignItems:'center',gap:8,flex:1,minWidth:0}}>
            <span className={`badge ${tenant.type==='ISC'?'badge-isc':'badge-pam'}`}>{tenant.type}</span>
            <SourceBadge source={tenant.source} simulated={tenant.simulated}/>
            <span className="modal-title" style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{tenant.client}</span>
          </div>
        </div>
        <div className="modal-body">
          <p style={{fontSize:12.5,color:'var(--text-3)',marginBottom:14,fontFamily:'var(--font-mono)'}}>{tenant.url}</p>

          {tenant.source === 'live' && (
            <div style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'var(--text-3)',marginBottom:14,padding:'6px 10px',background:'var(--bg-hover)',borderRadius:'var(--radius)'}}>
              {tenant.credentialType === 'local'
                ? <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:12,height:12}}><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>Local OAuth2 credentials</>
                : <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:12,height:12}}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Delinea Secret Server</>}
            </div>
          )}

          {steps.map((s, i) => {
            const st = statusOf(i + 1)
            return (
              <div className="launch-step" key={i}>
                <div className={`launch-step-icon ${st}`}>
                  {st==='running' && <div className="spinner"/>}
                  {st==='success' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:14,height:14}}><polyline points="20 6 9 17 4 12"/></svg>}
                  {st==='pending' && <span style={{fontSize:11,fontWeight:700}}>{i+1}</span>}
                </div>
                <div>
                  <div className={`launch-step-label${st==='running'?' active':st==='success'?' done':''}`}>{s.label}</div>
                  {st !== 'pending' && <div className="launch-step-sublabel">{s.sub}</div>}
                </div>
              </div>
            )
          })}

          {isComplete && (
            <div style={{marginTop:14,padding:'12px 14px',background:'var(--green-dim)',border:'1px solid var(--green)',borderRadius:'var(--radius)',color:'var(--green)',fontSize:13}}>
              <div style={{display:'flex',alignItems:'center',gap:8,fontWeight:600,marginBottom:6}}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:14,height:14}}><polyline points="20 6 9 17 4 12"/></svg>
                Console opened in a new tab
              </div>
              <button
                onClick={() => window.open(tenant.url, '_blank', 'noopener,noreferrer')}
                style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'var(--green)',background:'none',border:'1px solid var(--green)',borderRadius:'var(--radius)',padding:'5px 10px',cursor:'pointer',marginTop:4}}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:12,height:12}}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                Open again
              </button>
              {tenant.source === 'mock' && <div style={{fontSize:11,opacity:0.7,marginTop:6}}>(Mock tenant — no real session created)</div>}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>{isComplete ? 'Close' : 'Cancel'}</button>
          {step === 0 && (
            <button className="btn btn-primary" onClick={runLaunch}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:13,height:13}}><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Launch
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Delete confirmation modal ─────────────────────────────────────────────────
function DeleteModal({ tenant, onConfirm, onClose }) {
  const [confirmText, setConfirmText] = useState('')
  const required = tenant.client.toLowerCase()
  const isMatch  = confirmText.toLowerCase() === required

  return (
    <div className="modal-backdrop" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal" style={{maxWidth:440}}>
        <div className="modal-header">
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2" style={{width:17,height:17}}>
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
            <span className="modal-title" style={{color:'var(--red)'}}>Remove Tenant</span>
          </div>
        </div>
        <div className="modal-body">
          <p style={{fontSize:13.5,color:'var(--text-1)',marginBottom:8}}>
            You are about to permanently remove <strong>{tenant.client}</strong> from the Managed Identity Hub.
          </p>
          <p style={{fontSize:12.5,color:'var(--text-2)',marginBottom:16,lineHeight:1.6}}>
            This will delete all tenant configuration and stored credentials. This action <strong>cannot be undone</strong> — you will need to re-onboard the tenant to reconnect.
          </p>
          <div style={{padding:'12px',background:'var(--red-dim)',border:'1px solid rgba(232,68,68,0.2)',borderRadius:'var(--radius)',marginBottom:16}}>
            <label style={{display:'block',fontSize:12,fontWeight:600,color:'var(--red)',marginBottom:6}}>
              Type the client name to confirm: <code style={{fontFamily:'var(--font-mono)',background:'rgba(232,68,68,0.1)',padding:'1px 5px',borderRadius:3}}>{tenant.client}</code>
            </label>
            <input
              className="input"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder={`Type "${tenant.client}" to confirm`}
              autoFocus
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-danger"
            onClick={onConfirm}
            disabled={!isMatch}
            style={{opacity: isMatch ? 1 : 0.4, cursor: isMatch ? 'pointer' : 'not-allowed'}}
          >
            Remove Tenant
          </button>
        </div>
      </div>
    </div>
  )
}


// ── VA Cluster Popover ─────────────────────────────────────────────────────
// Shows a popup when clicking the VA count cell.
// Uses a portal-free fixed-position approach: measures the click target's
// bounding rect and positions the panel absolutely on the page.
function VAPopover({ tenant, onClose }) {
  const ref = React.useRef(null)

  // Close on outside click
  React.useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    // slight delay so the opening click doesn't immediately close
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 50)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler) }
  }, [onClose])

  const clusters = tenant.vaClusters || []
  const total    = tenant.vas || clusters.length
  const unhealthy = tenant.vaUnhealthy || clusters.filter(c => !['CONNECTED','HEALTHY','VALID','ACTIVE'].includes((c.status||'').toUpperCase())).length

  const statusInfo = (s) => {
    const up = (s || 'UNKNOWN').toUpperCase()
    if (['CONNECTED','HEALTHY','VALID','ACTIVE'].includes(up))
      return { label: up.charAt(0) + up.slice(1).toLowerCase(), color: 'var(--green)', bg: 'rgba(63,156,53,0.12)', dot: 'var(--green)' }
    if (['WARNING','DEGRADED'].includes(up))
      return { label: up.charAt(0) + up.slice(1).toLowerCase(), color: 'var(--amber)', bg: 'rgba(240,168,33,0.12)', dot: 'var(--amber)' }
    if (['DISCONNECTED','OFFLINE','ERROR'].includes(up))
      return { label: up.charAt(0) + up.slice(1).toLowerCase(), color: 'var(--red)', bg: 'rgba(232,68,68,0.12)', dot: 'var(--red)' }
    return { label: s || 'Unknown', color: 'var(--text-3)', bg: 'var(--bg-hover)', dot: 'var(--text-3)' }
  }

  return (
    <div ref={ref} style={{
      position:    'fixed',
      zIndex:      2000,
      top:         '50%',
      left:        '50%',
      transform:   'translate(-50%, -50%)',
      width:       320,
      background:  'var(--bg-card)',
      border:      '1px solid var(--border)',
      borderRadius:'var(--radius-lg)',
      boxShadow:   '0 8px 32px rgba(0,0,0,0.4)',
      overflow:    'hidden',
    }}>
      {/* Header */}
      <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--bg-panel)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width:14, height:14, color:'var(--accent)' }}>
            <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
          <span style={{ fontSize:12.5, fontWeight:600, color:'var(--text-1)' }}>Virtual Appliances</span>
          <span style={{ fontSize:11, color:'var(--text-3)' }}>— {tenant.client}</span>
        </div>
        <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text-3)', cursor:'pointer', padding:4, display:'flex', borderRadius:4 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width:14, height:14 }}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* Summary bar */}
      <div style={{ display:'flex', gap:0, borderBottom:'1px solid var(--border)' }}>
        {[
          { label:'Total',     val:total,              color:'var(--accent)' },
          { label:'Healthy',   val:total - unhealthy,  color:'var(--green)'  },
          { label:'Unhealthy', val:unhealthy,           color: unhealthy > 0 ? 'var(--red)' : 'var(--text-3)' },
        ].map((s,i) => (
          <div key={s.label} style={{ flex:1, padding:'9px 0', textAlign:'center', borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ fontFamily:'var(--font-head)', fontSize:18, fontWeight:700, color:s.color, lineHeight:1 }}>{s.val}</div>
            <div style={{ fontSize:10, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.06em', marginTop:3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Cluster list */}
      <div style={{ maxHeight:260, overflowY:'auto', padding:'6px 0' }}>
        {clusters.length === 0 ? (
          <div style={{ padding:'20px', textAlign:'center', fontSize:12.5, color:'var(--text-3)', fontStyle:'italic' }}>
            {tenant.source === 'mock' ? 'Mock tenant — cluster details not available' : 'No VA cluster data retrieved yet. Refresh to load.'}
          </div>
        ) : clusters.map((c, i) => {
          const si = statusInfo(c.status)
          return (
            <div key={c.id || i} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 14px', borderBottom:'1px solid var(--border-subtle)' }}>
              <span style={{ width:7, height:7, borderRadius:'50%', background:si.dot, flexShrink:0,
                boxShadow: si.dot === 'var(--green)' ? '0 0 0 2px rgba(63,156,53,0.2)' : 'none' }}/>
              <span style={{ flex:1, fontSize:12.5, color:'var(--text-1)', fontFamily:'var(--font-mono)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {c.name || c.id}
              </span>
              <span style={{ fontSize:11, fontWeight:600, padding:'2px 7px', borderRadius:20, background:si.bg, color:si.color, whiteSpace:'nowrap' }}>
                {si.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ padding:'8px 14px', borderTop:'1px solid var(--border)', fontSize:11, color:'var(--text-3)', display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--bg-panel)' }}>
        <span>{tenant.source === 'live' ? `Last refreshed: ${tenant.lastChecked || 'unknown'}` : 'Mock data'}</span>
        <span style={{ fontSize:10, opacity:0.6 }}>ISC v2025 managed-clusters</span>
      </div>
    </div>
  )
}

// ── Main Tenants Page ─────────────────────────────────────────────────────────
export default function Tenants() {
  const navigate = useNavigate()

  const [liveTenants,  setLiveTenants]  = useState([])
  const [search,       setSearch]       = useState('')
  const [typeFilter,   setType]         = useState('All')
  const [statFilter,   setStat]         = useState('All')
  const [sourceFilter, setSource]       = useState('All')
  const [sortCol,      setSortCol]      = useState('client')
  const [sortDir,      setSortDir]      = useState('asc')
  const [page,         setPage]         = useState(1)
  const [pageSize,     setPageSize]     = useState(25)

  const [launching,   setLaunching]   = useState(null)
  const [editing,     setEditing]     = useState(null)
  const [deleting,    setDeleting]    = useState(null)
  const [toast,       setToast]       = useState(null)
  const [vaPopover,   setVaPopover]  = useState(null)

  // Per-row refresh state: { [tenantId]: 'refreshing' | 'done' | 'error' }
  const [refreshState, setRefreshState] = useState({})

  const reload = () => setLiveTenants(getLiveTenants())
  useEffect(reload, [])

  const allTenants = useMemo(() => [
    ...liveTenants.map(t => ({...t, source:'live'})),
    ...MOCK_TENANTS.map(t => ({...t, source:'mock'})),
  ], [liveTenants])

  const liveTenantCount = liveTenants.length
  const mockTenantCount = MOCK_TENANTS.length

  const filtered = useMemo(() => {
    return allTenants
      .filter(t => {
        const q = search.toLowerCase()
        if (q && !t.client.toLowerCase().includes(q) && !(t.url||'').toLowerCase().includes(q)) return false
        if (typeFilter !== 'All' && t.type !== typeFilter) return false
        if (statFilter !== 'All' && t.health !== statFilter.toLowerCase()) return false
        if (sourceFilter !== 'All' && t.source !== sourceFilter.toLowerCase()) return false
        return true
      })
      .sort((a, b) => {
        if (a.source !== b.source && sortCol === 'client') return a.source === 'live' ? -1 : 1
        let av = a[sortCol] ?? '', bv = b[sortCol] ?? ''
        if (typeof av === 'string') av = av.toLowerCase()
        if (typeof bv === 'string') bv = bv.toLowerCase()
        return av < bv ? (sortDir==='asc'?-1:1) : av > bv ? (sortDir==='asc'?1:-1) : 0
      })
  }, [allTenants, search, typeFilter, statFilter, sourceFilter, sortCol, sortDir])

  const totalPages = Math.ceil(filtered.length / pageSize)
  const paginated  = filtered.slice((page-1)*pageSize, page*pageSize)

  const sort = (col) => {
    if (sortCol === col) setSortDir(d => d==='asc'?'desc':'asc')
    else { setSortCol(col); setSortDir('asc') }
    setPage(1)
  }

  const showToast = (msg, type='info') => {
    setToast({msg, type})
    setTimeout(() => setToast(null), 3000)
  }

  const copyUrl = (url) => {
    navigator.clipboard.writeText(url)
    showToast('URL copied to clipboard')
  }

  const handleDelete = () => {
    removeLiveTenant(deleting.id)
    reload()
    setDeleting(null)
    showToast(`${deleting.client} removed`, 'success')
  }

  const handleEditSave = () => {
    reload()
    setEditing(null)
    showToast('Tenant updated successfully', 'success')
  }

  // Refresh counts for a single live tenant
  const handleRefresh = async (tenant) => {
    if (!tenant.localClientId || !tenant.localClientSecret) {
      showToast('Refresh requires stored OAuth2 credentials (Delinea refresh coming soon)', 'warn')
      return
    }
    setRefreshState(p => ({...p, [tenant.id]: 'refreshing'}))
    try {
      const result = await refreshTenantCounts({
        tenantUrl:    tenant.url,
        clientId:     tenant.localClientId,
        clientSecret: tenant.localClientSecret,
      })
      if (result.success) {
        updateLiveTenant(tenant.id, {
          identities:  result.identityCount,
          vas:         result.vaCount,
          vaUnhealthy: result.vaUnhealthy,
          vaClusters:  result.vaClusters  || [],
          health:      result.vaUnhealthy > 0 ? 'degraded' : 'healthy',
          lastChecked: 'Just now',
        })
        reload()
        setRefreshState(p => ({...p, [tenant.id]: 'done'}))
        showToast(`${tenant.client} refreshed — ${(result.identityCount||0).toLocaleString()} identities`, 'success')
        setTimeout(() => setRefreshState(p => ({...p, [tenant.id]: undefined})), 3000)
      } else {
        setRefreshState(p => ({...p, [tenant.id]: 'error'}))
        showToast(`Refresh failed: ${result.error}`, 'error')
        setTimeout(() => setRefreshState(p => ({...p, [tenant.id]: undefined})), 4000)
      }
    } catch (err) {
      setRefreshState(p => ({...p, [tenant.id]: 'error'}))
      showToast(`Refresh error: ${err.message}`, 'error')
      setTimeout(() => setRefreshState(p => ({...p, [tenant.id]: undefined})), 4000)
    }
  }

  // ── Resizable columns ────────────────────────────────────────────────────
  const COLS = [
    { key: 'source',      defaultWidth: 100 },
    { key: 'client',      defaultWidth: 200 },
    { key: 'type',        defaultWidth: 70  },
    { key: 'health',      defaultWidth: 110 },
    { key: 'vas',         defaultWidth: 80  },
    { key: 'identities',  defaultWidth: 160 },
    { key: 'url',         defaultWidth: 240 },
    { key: 'actions',     defaultWidth: 170 },
  ]
  const { getThProps, ResizeHandle } = useResizableColumns(COLS, { storageKey: 'mih-tenants-cols' })

  const SortIcon = ({ col }) => {
    if (sortCol !== col) return <span style={{opacity:0.2,marginLeft:3}}>↕</span>
    return <span style={{marginLeft:3}}>{sortDir==='asc'?'↑':'↓'}</span>
  }

  const healthBadge = (h) => (
    <span className={`badge badge-health-${h}`}>
      <span className={`health-dot ${h}`}/>
      {h.charAt(0).toUpperCase() + h.slice(1)}
    </span>
  )

  const vaCell = (t) => {
    const count = t.vas ?? 0
    const bad   = t.vaUnhealthy ?? 0
    const hasClusters = (t.vaClusters && t.vaClusters.length > 0) || count > 0
    const color = bad > 0 ? 'var(--red)' : count > 0 ? 'var(--green)' : 'var(--text-3)'
    return (
      <button onClick={() => setVaPopover(t)}
        title={hasClusters ? 'Click to view VA cluster details' : 'No VA data — refresh to load'}
        style={{
          background:'none', border:'none', cursor: hasClusters ? 'pointer' : 'default',
          padding:'2px 4px', borderRadius:4, display:'inline-flex', alignItems:'center', gap:4,
          fontFamily:'var(--font-mono)', fontSize:12, color,
          textDecoration: hasClusters ? 'underline dotted' : 'none', textUnderlineOffset:3,
        }}>
        {count > 0 ? count : '—'}
        {bad > 0 && <span style={{color:'var(--red)',fontSize:10,marginLeft:1}}>⚠{bad}</span>}
        {hasClusters && count > 0 && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:9,height:9,opacity:0.45,flexShrink:0}}><polyline points="6 9 12 15 18 9"/></svg>}
      </button>
    )
  }

  const countCell = (t) => {
    const n = t.type === 'ISC' ? (t.identities ?? 0) : (t.accounts ?? 0)
    return n > 0 ? n.toLocaleString() : <span style={{color:'var(--text-3)',fontStyle:'italic'}}>—</span>
  }

  const clearFilters = () => { setSearch(''); setType('All'); setStat('All'); setSource('All'); setPage(1) }
  const hasFilters   = search || typeFilter!=='All' || statFilter!=='All' || sourceFilter!=='All'

  return (
    <>
      <style>{`
        @keyframes livePulse { 0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(63,156,53,0.4)} 50%{opacity:.7;box-shadow:0 0 0 3px rgba(63,156,53,0)} }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes refreshSpin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .refresh-btn-spinning svg { animation: refreshSpin 0.7s linear infinite; }
        .btn-icon:hover { background: var(--bg-hover) !important; }
      `}</style>

      <div className="topbar">
        <span className="topbar-title">Tenant List</span>
        <div style={{display:'flex',alignItems:'center',gap:10,marginLeft:8}}>
          {liveTenantCount > 0 && (
            <span style={{display:'flex',alignItems:'center',gap:5,fontSize:12,color:'var(--green)'}}>
              <span style={{width:6,height:6,borderRadius:'50%',background:'var(--green)',animation:'livePulse 2s infinite'}}/>
              {liveTenantCount} live
            </span>
          )}
          <span style={{fontSize:12,color:'var(--text-3)'}}>{mockTenantCount} mock</span>
        </div>
        <div className="topbar-right">
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/onboard')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:13,height:13}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            Onboard Tenant
          </button>
          <span style={{fontSize:11.5,color:'var(--text-3)'}}>Page size:</span>
          <select className="input select" style={{width:70,padding:'5px 28px 5px 8px',fontSize:12}}
            value={pageSize} onChange={e => { setPageSize(+e.target.value); setPage(1) }}>
            {[10,25,50,100].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="page-body">
        <div className="table-wrap">
          {/* Filters */}
          <div className="table-header" style={{flexWrap:'wrap',gap:8}}>
            <div className="search-bar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input className="input" placeholder="Search by client name or URL…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}/>
            </div>
            <select className="input select" style={{width:90,padding:'7px 28px 7px 10px'}} value={typeFilter} onChange={e=>{setType(e.target.value);setPage(1)}}>
              {['All','ISC','PAM'].map(o => <option key={o}>{o}</option>)}
            </select>
            <select className="input select" style={{width:130,padding:'7px 28px 7px 10px'}} value={statFilter} onChange={e=>{setStat(e.target.value);setPage(1)}}>
              {['All','Healthy','Degraded','Offline'].map(o => <option key={o}>{o}</option>)}
            </select>
            <select className="input select" style={{width:130,padding:'7px 28px 7px 10px'}} value={sourceFilter} onChange={e=>{setSource(e.target.value);setPage(1)}}>
              <option value="All">All Sources</option>
              <option value="live">Live only</option>
              <option value="mock">Mock only</option>
            </select>
            {hasFilters && <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear filters</button>}
            <span style={{marginLeft:'auto',fontSize:12,color:'var(--text-3)'}}>{filtered.length} tenant{filtered.length!==1?'s':''}</span>
          </div>

          {/* Table */}
          <div style={{overflowX:'auto'}}>
            <table className="resizable-table">
              <thead>
                <tr>
                  <th onClick={()=>sort('source')}  className={sortCol==='source'?'sorted':''} {...getThProps('source')}>Source <SortIcon col="source"/><ResizeHandle col="source"/></th>
                  <th onClick={()=>sort('client')}  className={sortCol==='client'?'sorted':''} {...getThProps('client')}>Client Name <SortIcon col="client"/><ResizeHandle col="client"/></th>
                  <th onClick={()=>sort('type')}    className={sortCol==='type'?'sorted':''} {...getThProps('type')}>Type <SortIcon col="type"/><ResizeHandle col="type"/></th>
                  <th onClick={()=>sort('health')}  className={sortCol==='health'?'sorted':''} {...getThProps('health')}>Health <SortIcon col="health"/><ResizeHandle col="health"/></th>
                  <th onClick={()=>sort('vas')}     className={sortCol==='vas'?'sorted':''} {...getThProps('vas')}>VAs <SortIcon col="vas"/><ResizeHandle col="vas"/></th>
                  <th onClick={()=>sort('identities')} className={sortCol==='identities'?'sorted':''} {...getThProps('identities')}>Identities / Accounts <SortIcon col="identities"/><ResizeHandle col="identities"/></th>
                  <th {...getThProps('url')}>Tenant URL<ResizeHandle col="url"/></th>
                  <th {...getThProps('actions')}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr><td colSpan={8}>
                    <div className="empty-state">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:36,height:36,display:'block',margin:'0 auto 10px',opacity:0.2}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      <h3>No tenants found</h3>
                      <p>Try adjusting your search or filters</p>
                      {hasFilters && <button className="btn btn-secondary btn-sm" style={{marginTop:12}} onClick={clearFilters}>Clear all filters</button>}
                    </div>
                  </td></tr>
                ) : paginated.map(t => (
                  <tr key={t.id} style={{background: t.source==='live' && !t.simulated ? 'rgba(63,156,53,0.018)' : undefined}}>
                    <td><SourceBadge source={t.source} simulated={t.simulated}/></td>
                    <td>
                      <div style={{display:'flex',flexDirection:'column',gap:2}}>
                        <span className="td-primary">{t.client}</span>
                        {t.orgName && t.orgName !== t.client && (
                          <span style={{fontSize:11,color:'var(--text-3)',fontFamily:'var(--font-mono)'}}>{t.orgName}</span>
                        )}
                      </div>
                    </td>
                    <td><span className={`badge ${t.type==='ISC'?'badge-isc':'badge-pam'}`}>{t.type}</span></td>
                    <td>{healthBadge(t.health)}</td>
                    <td style={{padding:'6px 6px'}}>{vaCell(t)}</td>
                    <td style={{fontFamily:'var(--font-mono)',fontSize:12}}>{countCell(t)}</td>
                    <td>
                      <div className="url-cell" onClick={() => copyUrl(t.url)} title={t.url}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:11,height:11,flexShrink:0}}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                        <span className="truncate">{(t.url||'').replace('https://','')}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{display:'flex',gap:4,alignItems:'center'}}>
                        {/* Launch */}
                        <button className="btn btn-primary btn-sm" onClick={() => setLaunching(t)} title="Launch tenant console">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:11,height:11}}><polygon points="5 3 19 12 5 21 5 3"/></svg>
                          Launch
                        </button>

                        {/* Live-only actions */}
                        {t.source === 'live' && (<>
                          {/* Refresh counts */}
                          <button
                            className={`btn-icon${refreshState[t.id]==='refreshing' ? ' refresh-btn-spinning' : ''}`}
                            onClick={() => handleRefresh(t)}
                            disabled={refreshState[t.id]==='refreshing'}
                            title="Refresh identity count"
                            style={{
                              color: refreshState[t.id]==='done' ? 'var(--green)' : refreshState[t.id]==='error' ? 'var(--red)' : 'var(--text-3)',
                              borderColor: refreshState[t.id]==='done' ? 'rgba(63,156,53,0.3)' : refreshState[t.id]==='error' ? 'rgba(232,68,68,0.3)' : undefined,
                            }}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:13,height:13}}>
                              <polyline points="23 4 23 10 17 10"/>
                              <polyline points="1 20 1 14 7 14"/>
                              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                            </svg>
                          </button>

                          {/* Edit */}
                          <button
                            className="btn-icon"
                            onClick={() => setEditing(t)}
                            title="Edit tenant configuration"
                            style={{color:'var(--accent)',borderColor:'rgba(0,156,222,0.2)'}}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:13,height:13}}>
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>

                          {/* Delete */}
                          <button
                            className="btn-icon"
                            onClick={() => setDeleting(t)}
                            title="Remove tenant"
                            style={{color:'var(--red)',borderColor:'rgba(232,68,68,0.2)'}}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:13,height:13}}>
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                              <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                            </svg>
                          </button>
                        </>)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <span className="pagination-info">Showing {(page-1)*pageSize+1}–{Math.min(page*pageSize,filtered.length)} of {filtered.length}</span>
              <div className="pagination-btns">
                <button className="page-btn" onClick={()=>setPage(1)} disabled={page===1}>«</button>
                <button className="page-btn" onClick={()=>setPage(p=>p-1)} disabled={page===1}>‹</button>
                {Array.from({length:Math.min(totalPages,7)},(_,i) => {
                  const p = Math.max(1,Math.min(page-3,totalPages-6))+i
                  return p<=totalPages ? <button key={p} className={`page-btn${p===page?' active':''}`} onClick={()=>setPage(p)}>{p}</button> : null
                })}
                <button className="page-btn" onClick={()=>setPage(p=>p+1)} disabled={page===totalPages}>›</button>
                <button className="page-btn" onClick={()=>setPage(totalPages)} disabled={page===totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div style={{display:'flex',gap:20,marginTop:14,padding:'0 4px',flexWrap:'wrap'}}>
          {[
            ['var(--green)',   'livePulse 2s infinite', 'Live — real tenant, actively connected'],
            ['var(--amber)',   'none',                   'Simulated — validated locally without Netlify Functions'],
            ['var(--rsm-gray)','none',                   'Mock — example data only'],
          ].map(([color, anim, label]) => (
            <div key={label} style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'var(--text-3)'}}>
              <span style={{width:6,height:6,borderRadius:'50%',background:color,animation:anim}}/>
              {label}
            </div>
          ))}
        </div>
      </div>

      {launching && <LaunchModal  tenant={launching} onClose={() => setLaunching(null)}/>}
      {editing   && <EditTenantModal tenant={editing} onSave={handleEditSave} onClose={() => setEditing(null)}/>}
      {deleting  && <DeleteModal  tenant={deleting}  onConfirm={handleDelete} onClose={() => setDeleting(null)}/>}

      {toast && (
        <div className="toast-container">
          <div className="toast" style={{
            borderLeft: `3px solid ${
              toast.type==='success' ? 'var(--green)' :
              toast.type==='error'   ? 'var(--red)'   :
              toast.type==='warn'    ? 'var(--amber)'  : 'var(--accent)'
            }`,
          }}>
            {toast.msg}
          </div>
        </div>
      )}

      {vaPopover && (
        <>
          <div onClick={() => setVaPopover(null)}
            style={{ position:'fixed', inset:0, zIndex:1999, background:'rgba(0,0,0,0.35)', backdropFilter:'blur(1px)' }}
          />
          <VAPopover tenant={vaPopover} onClose={() => setVaPopover(null)} />
        </>
      )}
    </>
  )
}
