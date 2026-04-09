import { useState, useEffect, useMemo } from 'react'
import {
  getUsers, addUser, updateUser, deleteUser, toggleUserStatus, resetUserStore,
  ROLE_OPTIONS, AUTH_SOURCE_OPTIONS, IDP_LABEL, userHasPassword,
} from '../lib/userStore'
import { setUserPassword } from '../lib/localAuth'
import { useResizableColumns } from '../lib/useResizableColumns.jsx'

const TABS = ['General', 'Identity Provider', 'Users', 'Vault Config', 'Health Check', 'SIEM', 'System Health']

// ── Shared helpers ────────────────────────────────────────────────────────────
function SettingRow({ label, hint, children }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', padding:'14px 0', borderBottom:'1px solid var(--border-subtle)', gap:20 }}>
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:500, color:'var(--text-1)', fontSize:13 }}>{label}</div>
        {hint && <div style={{ fontSize:11.5, color:'var(--text-3)', marginTop:3 }}>{hint}</div>}
      </div>
      <div style={{ flexShrink:0, minWidth:260 }}>{children}</div>
    </div>
  )
}

function SecretInput({ placeholder, defaultValue, value, onChange }) {
  const [revealed, setRevealed] = useState(false)
  const inputProps = onChange ? { value, onChange } : { defaultValue }
  return (
    <div style={{ display:'flex', gap:6 }}>
      <input className="input" type={revealed?'text':'password'} placeholder={placeholder} style={{ flex:1 }} {...inputProps} autoComplete="new-password"/>
      <button className="btn-icon" type="button" onClick={() => setRevealed(r => !r)} title={revealed?'Hide':'Reveal'}>
        {revealed
          ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:15,height:15}}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:15,height:15}}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
      </button>
    </div>
  )
}

const roleColor = { Administrator:'var(--red)', 'Onboarding Agent':'var(--accent)', Analyst:'var(--green)', 'Read-Only Auditor':'var(--rsm-gray)' }

function idpBadgeStyle(src) {
  return {
    fontSize:10.5, fontWeight:700, padding:'2px 8px', borderRadius:20,
    letterSpacing:'0.04em', display:'inline-block', whiteSpace:'nowrap',
    ...(src === 'entra' ? { background:'rgba(0,120,212,0.1)', color:'#0078d4', border:'1px solid rgba(0,120,212,0.22)' }
      : src === 'local' ? { background:'rgba(240,168,33,0.1)', color:'var(--amber)', border:'1px solid rgba(240,168,33,0.28)' }
      : { background:'rgba(63,156,53,0.1)', color:'var(--green)', border:'1px solid rgba(63,156,53,0.28)' }),
  }
}

// ── User form (Add + Edit) ────────────────────────────────────────────────────
function UserForm({ initial = {}, onSave, onCancel, mode = 'add' }) {
  const [form, setForm] = useState({
    name:            initial.name            || '',
    email:           initial.email           || '',
    role:            initial.role            || 'Analyst',
    authSource:      initial.authSource      || 'entra',
    status:          initial.status          || 'active',
    mfaRequired:     initial.mfaRequired !== undefined ? initial.mfaRequired : true,
    notes:           initial.notes           || '',
    password:        '',
    confirmPassword: '',
  })
  const [errors,  setErrors]  = useState({})
  const [saving,  setSaving]  = useState(false)
  const [saveErr, setSaveErr] = useState(null)
  // Edit-mode password change (collapsed by default)
  const [showPwChange, setShowPwChange] = useState(false)
  const [newPw,        setNewPw]        = useState('')
  const [confirmPw,    setConfirmPw]    = useState('')
  const [pwErrors,     setPwErrors]     = useState({})

  const set = k => e => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm(p => ({ ...p, [k]: v }))
    setErrors(p => { const n={...p}; delete n[k]; return n })
    setSaveErr(null)
  }

  const validate = () => {
    const e = {}
    if (!form.name.trim())  e.name  = 'Full name is required'
    if (!form.email.trim()) e.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email address'
    if (mode === 'add' && form.authSource === 'local') {
      if (!form.password) e.password = 'Password required for local accounts'
      else if (form.password.length < 12) e.password = 'Minimum 12 characters'
      if (form.password && form.confirmPassword !== form.password) e.confirmPassword = 'Passwords do not match'
    }
    setErrors(e)
    // Also validate edit-mode password change fields if visible
    if (mode === 'edit' && showPwChange) {
      const pe = {}
      if (!newPw) pe.newPw = 'Password is required'
      else if (newPw.length < 12) pe.newPw = 'Minimum 12 characters'
      if (newPw && confirmPw !== newPw) pe.confirmPw = 'Passwords do not match'
      setPwErrors(pe)
      if (Object.keys(pe).length > 0) return false
    } else {
      setPwErrors({})
    }
    return Object.keys(e).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const payload = {
        name:        form.name.trim(),
        email:       form.email.trim().toLowerCase(),
        role:        form.role,
        authSource:  form.authSource,
        idpLabel:    IDP_LABEL[form.authSource] || form.authSource,
        status:      form.status,
        mfaRequired: form.mfaRequired,
        notes:       form.notes,
      }
      // Pass password to parent so it can hash+store via setUserPassword()
      // _password is a transient field — never persisted directly
      if (mode === 'add' && (form.authSource === 'local' || form.authSource === 'both')) {
        payload._password = form.password
      }
      if (mode === 'edit' && showPwChange && newPw) {
        payload._password = newPw
      }
      onSave(payload)
    } catch (err) { setSaveErr(err.message) }
    setSaving(false)
  }

  const authInfo = AUTH_SOURCE_OPTIONS.find(o => o.value === form.authSource)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
      {saveErr && (
        <div style={{ padding:'10px 12px', background:'var(--red-dim)', border:'1px solid var(--red)', borderRadius:'var(--radius)', fontSize:12.5, color:'var(--red)' }}>
          {saveErr}
        </div>
      )}

      {/* Name + Email */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <div>
          <label className="input-label">Full Name *</label>
          <input className={`input${errors.name?' input-error':''}`} value={form.name} onChange={set('name')} placeholder="Jane Smith"/>
          {errors.name && <p className="error-msg">{errors.name}</p>}
        </div>
        <div>
          <label className="input-label">Email Address *</label>
          <input className={`input${errors.email?' input-error':''}`} type="email" value={form.email} onChange={set('email')} placeholder="jane@rsmdefense.com" disabled={mode==='edit'}/>
          {errors.email && <p className="error-msg">{errors.email}</p>}
          {mode==='edit' && <p style={{ fontSize:11, color:'var(--text-3)', marginTop:3 }}>Email cannot be changed after creation</p>}
        </div>
      </div>

      {/* Role */}
      <div>
        <label className="input-label">Role *</label>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:6 }}>
          {ROLE_OPTIONS.map(r => (
            <div key={r.value}
              onClick={() => setForm(p => ({ ...p, role:r.value }))}
              style={{
                padding:'9px 12px', borderRadius:'var(--radius)', cursor:'pointer',
                border:`1px solid ${form.role===r.value ? r.color : 'var(--border)'}`,
                background: form.role===r.value ? `${r.color}18` : 'var(--bg-hover)',
                transition:'all 0.15s',
              }}>
              <div style={{ fontSize:12.5, fontWeight:600, color:form.role===r.value ? r.color : 'var(--text-1)' }}>{r.value}</div>
              <div style={{ fontSize:11, color:'var(--text-3)', marginTop:2, lineHeight:1.4 }}>{r.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Auth Source */}
      <div>
        <label className="input-label">Authentication Source *</label>
        <p style={{ fontSize:11.5, color:'var(--text-3)', marginBottom:8 }}>Controls which identity provider this user authenticates through</p>
        <div style={{ display:'flex', gap:8 }}>
          {AUTH_SOURCE_OPTIONS.map(o => (
            <button key={o.value} type="button"
              onClick={() => setForm(p => ({ ...p, authSource:o.value }))}
              style={{
                flex:1, padding:'8px 10px', borderRadius:'var(--radius)',
                border:`1px solid ${form.authSource===o.value ? 'var(--accent)' : 'var(--border)'}`,
                background: form.authSource===o.value ? 'var(--accent-dim)' : 'var(--bg-hover)',
                color: form.authSource===o.value ? 'var(--accent)' : 'var(--text-2)',
                fontSize:12, fontWeight:600, cursor:'pointer', transition:'all 0.15s',
              }}>
              {o.label}
            </button>
          ))}
        </div>
        {authInfo && (
          <div style={{ marginTop:7, padding:'7px 10px', background:'var(--bg-hover)', borderRadius:'var(--radius)', fontSize:12, color:'var(--text-3)', display:'flex', gap:6, alignItems:'flex-start' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width:13, height:13, flexShrink:0, marginTop:1 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            {authInfo.hint}
          </div>
        )}
      </div>

      {/* Local password — add mode only */}
      {mode === 'add' && form.authSource === 'local' && (
        <div style={{ padding:'12px', background:'var(--amber-dim)', border:'1px solid rgba(240,168,33,0.3)', borderRadius:'var(--radius)' }}>
          <div style={{ fontSize:12, fontWeight:600, color:'var(--amber)', marginBottom:10, display:'flex', gap:6, alignItems:'center' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width:13, height:13 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Local accounts use password auth — migrate to Entra once IdP is configured
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <label className="input-label">Initial Password *</label>
              <SecretInput value={form.password} onChange={set('password')} placeholder="Min. 12 characters"/>
              {errors.password && <p className="error-msg">{errors.password}</p>}
            </div>
            <div>
              <label className="input-label">Confirm Password *</label>
              <SecretInput value={form.confirmPassword} onChange={set('confirmPassword')} placeholder="Repeat password"/>
              {errors.confirmPassword && <p className="error-msg">{errors.confirmPassword}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Edit-mode: change password section (local/both accounts only) */}
      {mode === 'edit' && (form.authSource === 'local' || form.authSource === 'both') && (
        <div style={{ border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'hidden' }}>
          <button type="button"
            onClick={() => { setShowPwChange(s => !s); setNewPw(''); setConfirmPw(''); setPwErrors({}) }}
            style={{ width:'100%', padding:'10px 14px', background:'var(--bg-hover)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:12.5, color:'var(--text-1)', fontWeight:500 }}>
            <span style={{ display:'flex', alignItems:'center', gap:7 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width:13, height:13, color:'var(--amber)' }}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              {showPwChange ? 'Cancel password change' : (initial.passwordHash ? 'Change password' : '⚠ Set password (required to log in)')}
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width:12, height:12, transform: showPwChange ? 'rotate(180deg)' : 'none', transition:'transform 0.15s' }}><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {showPwChange && (
            <div style={{ padding:'14px', background:'var(--amber-dim)', borderTop:'1px solid rgba(240,168,33,0.25)' }}>
              {!initial.passwordHash && (
                <div style={{ fontSize:11.5, color:'var(--amber)', marginBottom:10, fontWeight:500 }}>
                  This account has no password set — the user cannot log in until one is assigned.
                </div>
              )}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <label className="input-label">New Password *</label>
                  <SecretInput value={newPw} onChange={e => { setNewPw(e.target.value); setPwErrors(p => { const n={...p}; delete n.newPw; return n }) }} placeholder="Min. 12 characters"/>
                  {pwErrors.newPw && <p className="error-msg">{pwErrors.newPw}</p>}
                </div>
                <div>
                  <label className="input-label">Confirm New Password *</label>
                  <SecretInput value={confirmPw} onChange={e => { setConfirmPw(e.target.value); setPwErrors(p => { const n={...p}; delete n.confirmPw; return n }) }} placeholder="Repeat password"/>
                  {pwErrors.confirmPw && <p className="error-msg">{pwErrors.confirmPw}</p>}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Status + MFA */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <div>
          <label className="input-label">Status</label>
          <select className="input select" value={form.status} onChange={set('status')}>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10, paddingTop:22 }}>
          <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, color:'var(--text-1)' }}>
            <input type="checkbox" checked={form.mfaRequired} onChange={set('mfaRequired')} style={{ accentColor:'var(--accent)', width:15, height:15 }}/>
            <div>
              <div style={{ fontWeight:500 }}>Require MFA</div>
              <div style={{ fontSize:11, color:'var(--text-3)' }}>Enforced at login for this account</div>
            </div>
          </label>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="input-label">Admin Notes</label>
        <textarea className="input" value={form.notes} onChange={set('notes')} placeholder="Optional notes about this account…" style={{ height:54, resize:'vertical' }}/>
      </div>

      <div style={{ display:'flex', gap:10, justifyContent:'flex-end', paddingTop:4 }}>
        <button className="btn btn-ghost" type="button" onClick={onCancel} disabled={saving}>Cancel</button>
        <button className="btn btn-primary" type="button" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : mode==='add' ? 'Create User' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

// ── Delete confirmation ───────────────────────────────────────────────────────
function DeleteUserModal({ user, onConfirm, onClose }) {
  const [input, setInput] = useState('')
  const match = input.toLowerCase() === user.email.toLowerCase()
  return (
    <div className="modal-backdrop" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth:440 }}>
        <div className="modal-header">
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2" style={{ width:17, height:17 }}>
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
            <span className="modal-title" style={{ color:'var(--red)' }}>Remove User</span>
          </div>
        </div>
        <div className="modal-body">
          <p style={{ fontSize:13.5, color:'var(--text-1)', marginBottom:8 }}>
            Permanently remove <strong>{user.name}</strong> from the MIH platform?
          </p>
          <p style={{ fontSize:12.5, color:'var(--text-2)', lineHeight:1.6, marginBottom:16 }}>
            This deletes their access record and configuration. If they authenticate via Entra, access is revoked immediately. This action <strong>cannot be undone</strong>.
          </p>
          <div style={{ padding:'12px', background:'var(--red-dim)', border:'1px solid rgba(232,68,68,0.2)', borderRadius:'var(--radius)' }}>
            <label style={{ display:'block', fontSize:12, fontWeight:600, color:'var(--red)', marginBottom:6 }}>
              Type their email to confirm:&nbsp;
              <code style={{ fontFamily:'var(--font-mono)', background:'rgba(232,68,68,0.12)', padding:'1px 5px', borderRadius:3 }}>{user.email}</code>
            </label>
            <input className="input" value={input} onChange={e => setInput(e.target.value)} placeholder={user.email} autoFocus/>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={!match}
            style={{ opacity:match?1:0.4, cursor:match?'pointer':'not-allowed' }}>
            Remove User
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Users Tab ─────────────────────────────────────────────────────────────────
function Users() {
  const [users,      setUsers]      = useState([])
  const [search,     setSearch]     = useState('')
  const [roleFilter, setRoleFilter] = useState('All')
  const [idpFilter,  setIdpFilter]  = useState('All')
  const [statFilter, setStatFilter] = useState('All')
  const [mode,       setMode]       = useState('list')   // 'list' | 'add' | 'edit'
  const [editing,    setEditing]    = useState(null)
  const [deleting,   setDeleting]   = useState(null)
  const [toast,      setToast]      = useState(null)

  const reload = () => setUsers(getUsers())
  useEffect(reload, [])

  const showToast = (msg, type='success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3200) }

  // Resizable columns
  const USER_COLS = [
    { key:'user',      defaultWidth:230 },
    { key:'role',      defaultWidth:170 },
    { key:'idp',       defaultWidth:115 },
    { key:'mfa',       defaultWidth:65  },
    { key:'lastLogin', defaultWidth:150 },
    { key:'status',    defaultWidth:90  },
    { key:'actions',   defaultWidth:130 },
  ]
  const { getThProps, ResizeHandle } = useResizableColumns(USER_COLS, { storageKey:'mih-users-cols' })

  const filtered = useMemo(() => users.filter(u => {
    const q = search.toLowerCase()
    if (q && !u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false
    if (roleFilter !== 'All' && u.role !== roleFilter) return false
    if (idpFilter  !== 'All' && u.authSource !== idpFilter) return false
    if (statFilter !== 'All' && u.status !== statFilter) return false
    return true
  }), [users, search, roleFilter, idpFilter, statFilter])

  const counts = useMemo(() => ({
    total:    users.length,
    active:   users.filter(u => u.status==='active').length,
    disabled: users.filter(u => u.status==='disabled').length,
    entra:    users.filter(u => u.authSource==='entra').length,
    local:    users.filter(u => u.authSource==='local').length,
  }), [users])

  const handleAdd  = async p => {
    const { _password, ...fields } = p
    const newUser = addUser(fields, 'admin')
    // Hash and store password for local/both accounts
    if (_password && (fields.authSource === 'local' || fields.authSource === 'both')) {
      await setUserPassword(newUser.id, _password)
    }
    reload()
    setMode('list')
    showToast(`${fields.name} created`)
  }
  const handleEdit = async p => {
    try {
      const { _password, ...fields } = p
      updateUser(editing.id, fields)
      if (_password && (fields.authSource === 'local' || fields.authSource === 'both')) {
        await setUserPassword(editing.id, _password)
      }
      reload()
      setMode('list')
      setEditing(null)
      showToast(`${fields.name} updated`)
    } catch (err) { throw err }
  }
  const handleToggle = u => { toggleUserStatus(u.id); reload(); showToast(`${u.name} ${u.status==='active'?'disabled':'enabled'}`, u.status==='active'?'warn':'success') }
  const handleDelete = () => { deleteUser(deleting.id); reload(); setDeleting(null); showToast(`${deleting.name} removed`, 'warn') }
  const handleRoleChange = (id, role) => { updateUser(id, { role }); reload() }

  // ── Add / Edit form ────────────────────────────────────────────────────────
  if (mode === 'add' || mode === 'edit') {
    return (
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => { setMode('list'); setEditing(null) }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width:13, height:13 }}><polyline points="15 18 9 12 15 6"/></svg>
            Back to Users
          </button>
          <span style={{ fontSize:11, color:'var(--text-3)' }}>/</span>
          <span style={{ fontSize:14, fontWeight:600, color:'var(--text-1)' }}>
            {mode==='add' ? 'Create New User' : `Edit — ${editing?.name}`}
          </span>
        </div>
        <div style={{ maxWidth:620 }}>
          <UserForm initial={editing||{}} mode={mode} onSave={mode==='add'?handleAdd:handleEdit} onCancel={() => { setMode('list'); setEditing(null) }}/>
        </div>
      </div>
    )
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Stats + Add */}
      <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
        {[
          { label:'Total',    val:counts.total,    color:'var(--accent)' },
          { label:'Active',   val:counts.active,   color:'var(--green)'  },
          { label:'Disabled', val:counts.disabled,  color:'var(--text-3)' },
          { label:'Entra ID', val:counts.entra,    color:'#0078d4'       },
          { label:'Local',    val:counts.local,    color:'var(--amber)'  },
        ].map(s => (
          <div key={s.label} style={{ display:'flex', alignItems:'center', gap:7, padding:'5px 11px', background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--radius)', fontSize:12 }}>
            <span style={{ fontFamily:'var(--font-head)', fontWeight:700, fontSize:17, color:s.color }}>{s.val}</span>
            <span style={{ color:'var(--text-3)' }}>{s.label}</span>
          </div>
        ))}
        <button className="btn btn-primary btn-sm" style={{ marginLeft:'auto' }} onClick={() => setMode('add')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width:13, height:13 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          Add User
        </button>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:8, marginBottom:10, flexWrap:'wrap', alignItems:'center' }}>
        <div className="search-bar" style={{ flex:'0 1 210px' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className="input" placeholder="Name or email…" value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        <select className="input select" style={{ width:165, padding:'7px 28px 7px 10px' }} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="All">All Roles</option>
          {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.value}</option>)}
        </select>
        <select className="input select" style={{ width:130, padding:'7px 28px 7px 10px' }} value={idpFilter} onChange={e => setIdpFilter(e.target.value)}>
          <option value="All">All Auth Sources</option>
          <option value="entra">Entra ID</option>
          <option value="local">Local</option>
          <option value="both">Both</option>
        </select>
        <select className="input select" style={{ width:120, padding:'7px 28px 7px 10px' }} value={statFilter} onChange={e => setStatFilter(e.target.value)}>
          <option value="All">Any Status</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
        {(search||roleFilter!=='All'||idpFilter!=='All'||statFilter!=='All') && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setRoleFilter('All'); setIdpFilter('All'); setStatFilter('All') }}>Clear</button>
        )}
        <span style={{ marginLeft:'auto', fontSize:12, color:'var(--text-3)' }}>{filtered.length} user{filtered.length!==1?'s':''}</span>
      </div>

      {/* Entra info banner */}
      <div style={{ display:'flex', gap:8, alignItems:'flex-start', padding:'9px 12px', background:'rgba(0,120,212,0.06)', border:'1px solid rgba(0,120,212,0.2)', borderRadius:'var(--radius)', marginBottom:12, fontSize:12, color:'#0078d4' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width:14, height:14, flexShrink:0, marginTop:1 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        <span>
          <strong>Entra ID users</strong> are auto-provisioned on first login — their role comes from Entra group mappings (set in the Identity Provider tab). You can override the role or disable any account here. <strong>Local</strong> accounts use password auth and are intended only for bootstrap or break-glass scenarios.
        </span>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <div style={{ overflowX:'auto' }}>
          <table className="resizable-table">
            <thead>
              <tr>
                <th {...getThProps('user')}>User<ResizeHandle col="user"/></th>
                <th {...getThProps('role')}>Role<ResizeHandle col="role"/></th>
                <th {...getThProps('idp')}>Auth Source<ResizeHandle col="idp"/></th>
                <th {...getThProps('mfa')} style={{ ...getThProps('mfa').style, textAlign:'center' }}>MFA<ResizeHandle col="mfa"/></th>
                <th {...getThProps('lastLogin')}>Last Login<ResizeHandle col="lastLogin"/></th>
                <th {...getThProps('status')}>Status<ResizeHandle col="status"/></th>
                <th {...getThProps('actions')}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7}>
                  <div className="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width:34, height:34, display:'block', margin:'0 auto 10px', opacity:0.2 }}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    <h3>No users found</h3><p>Adjust your filters</p>
                  </div>
                </td></tr>
              ) : filtered.map(u => {
                const avatar = (u.initials || u.name.split(' ').map(p=>p[0]).join('').slice(0,2)).toUpperCase()
                const rc = roleColor[u.role] || 'var(--accent)'
                return (
                  <tr key={u.id} style={{ opacity:u.status==='disabled'?0.58:1, transition:'opacity 0.15s' }}>
                    {/* User */}
                    <td style={{ overflow:'hidden', maxWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                        <div style={{
                          width:30, height:30, borderRadius:'50%', flexShrink:0,
                          background:u.status==='disabled'?'var(--bg-panel)':`${rc}18`,
                          border:`1.5px solid ${u.status==='disabled'?'var(--border)':rc}`,
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:10.5, fontWeight:700, color:u.status==='disabled'?'var(--text-3)':rc,
                        }}>{avatar}</div>
                        <div style={{ minWidth:0 }}>
                          <div className="td-primary" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.name}</div>
                          <div style={{ fontSize:11.5, color:'var(--text-3)', fontFamily:'var(--font-mono)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.email}</div>
                          {u.notes && <div style={{ fontSize:10.5, color:'var(--amber)', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={u.notes}>📌 {u.notes}</div>}
                        </div>
                      </div>
                    </td>

                    {/* Role inline select */}
                    <td>
                      <select className="input select" value={u.role} onChange={e => handleRoleChange(u.id, e.target.value)}
                        style={{ padding:'4px 22px 4px 8px', fontSize:12, width:'100%', border:'1px solid transparent', background:'transparent', color:rc, fontWeight:600 }}>
                        {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.value}</option>)}
                      </select>
                    </td>

                    {/* Auth source badge */}
                    <td><span style={idpBadgeStyle(u.authSource)}>{u.idpLabel || IDP_LABEL[u.authSource] || u.authSource}</span></td>

                    {/* MFA */}
                    <td style={{ textAlign:'center' }}>
                      {u.mfaRequired
                        ? <svg viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" style={{ width:14, height:14 }}><polyline points="20 6 9 17 4 12"/></svg>
                        : <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" style={{ width:14, height:14 }}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
                    </td>

                    {/* Last Login */}
                    <td style={{ fontSize:12, fontFamily:'var(--font-mono)', color:'var(--text-3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {u.lastLogin || <span style={{ fontStyle:'italic', fontFamily:'inherit' }}>Never</span>}
                    </td>

                    {/* Status pill */}
                    <td>
                      <span className={`pill ${u.status==='active'?'pill-success':'pill-failed'}`}>
                        {u.status==='active'?'Active':'Disabled'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td>
                      <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                        {/* Edit */}
                        <button className="btn-icon" title="Edit user" onClick={() => { setEditing(u); setMode('edit') }}
                          style={{ color:'var(--accent)', borderColor:'rgba(0,156,222,0.2)' }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width:13, height:13 }}>
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>

                        {/* Enable / Disable */}
                        <button className="btn-icon" title={u.status==='active'?'Disable user':'Enable user'} onClick={() => handleToggle(u)}
                          style={{ color:u.status==='active'?'var(--amber)':'var(--green)', borderColor:u.status==='active'?'rgba(240,168,33,0.25)':'rgba(63,156,53,0.25)' }}>
                          {u.status==='active'
                            ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width:13, height:13 }}><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
                            : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width:13, height:13 }}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>}
                        </button>

                        {/* Delete */}
                        <button className="btn-icon" title="Remove user" onClick={() => setDeleting(u)}
                          style={{ color:'var(--red)', borderColor:'rgba(232,68,68,0.2)' }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width:13, height:13 }}>
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend + reset */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:10, flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
          {[
            { color:'#0078d4',        label:'Entra ID — auto-provisioned from group claims' },
            { color:'var(--amber)',   label:'Local — password auth, bootstrap only'          },
            { color:'var(--green)',   label:'Both — allows either auth method'               },
          ].map(({ color, label }) => (
            <div key={label} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11.5, color:'var(--text-3)' }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:color, flexShrink:0 }}/>
              {label}
            </div>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" style={{ fontSize:11, color:'var(--text-3)' }}
          onClick={() => { resetUserStore(); reload(); showToast('User store reset to seed data', 'warn') }}
          title="Dev helper: resets localStorage to seed users">
          ↺ Reset to defaults
        </button>
      </div>

      {deleting && <DeleteUserModal user={deleting} onConfirm={handleDelete} onClose={() => setDeleting(null)}/>}

      {toast && (
        <div className="toast-container">
          <div className="toast" style={{ borderLeft:`3px solid ${toast.type==='success'?'var(--green)':toast.type==='warn'?'var(--amber)':toast.type==='error'?'var(--red)':'var(--accent)'}` }}>
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Other tabs ────────────────────────────────────────────────────────────────
function General() {
  const [saved, setSaved] = useState(false)
  const save = () => { setSaved(true); setTimeout(() => setSaved(false), 2000) }
  return (
    <div>
      <SettingRow label="Application Display Name" hint="Shown in browser tab and login page">
        <input className="input" defaultValue="RSM Defense — Managed Identity Hub" />
      </SettingRow>
      <SettingRow label="Default Session Timeout (Idle)" hint="Minutes before idle session expires">
        <select className="input select"><option>15 minutes</option><option>30 minutes</option><option>60 minutes</option></select>
      </SettingRow>
      <SettingRow label="Absolute Session Timeout" hint="Maximum session duration regardless of activity">
        <select className="input select"><option>4 hours</option><option>8 hours</option><option>12 hours</option></select>
      </SettingRow>
      <SettingRow label="Dashboard Auto-Refresh Interval" hint="How often dashboard statistics are refreshed">
        <select className="input select"><option>1 minute</option><option>2 minutes</option><option>5 minutes</option><option>10 minutes</option></select>
      </SettingRow>
      <SettingRow label="Default Pagination Size" hint="Default rows shown in tenant and audit tables">
        <select className="input select"><option>10</option><option>25</option><option>50</option><option>100</option></select>
      </SettingRow>
      <SettingRow label="Timezone" hint="Timezone for all displayed timestamps">
        <select className="input select"><option>UTC</option><option>America/New_York</option><option>America/Chicago</option><option>America/Los_Angeles</option></select>
      </SettingRow>
      <div style={{ marginTop:20, display:'flex', gap:10 }}>
        <button className="btn btn-primary" onClick={save}>{saved?'✓ Saved':'Save Changes'}</button>
        <button className="btn btn-ghost">Reset to Defaults</button>
      </div>
    </div>
  )
}

function IdpConfig() {
  const [provider, setProvider] = useState('Entra ID')
  return (
    <div>
      <div className="input-group" style={{ marginBottom:20 }}>
        <label className="input-label">Active Identity Provider</label>
        <div style={{ display:'flex', gap:10 }}>
          {['Entra ID','Okta','Both'].map(p => (
            <div key={p} className={`radio-card${provider===p?' selected':''}`} style={{ flex:'none', minWidth:120 }} onClick={() => setProvider(p)}>
              <div className="radio-card-title">{p}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="section-title">OIDC Configuration — {provider}</div>
      <SettingRow label="Authority URL">
        <input className="input" defaultValue={provider==='Okta'?'https://rsm-defense.okta.com/oauth2/default':'https://login.microsoftonline.com/{tenant-id}/v2.0'} />
      </SettingRow>
      <SettingRow label="Client ID">
        <input className="input" defaultValue="a4f8b2c1-3d9e-4f7a-b6c5-e2d1f8a09b3c" />
      </SettingRow>
      <SettingRow label="Client Secret" hint="Stored encrypted at rest">
        <SecretInput defaultValue="••••••••••••••••••••••••••••••••" />
      </SettingRow>
      <SettingRow label="Redirect URI">
        <input className="input" defaultValue="https://mih.rsmdefense.com/auth/callback" />
      </SettingRow>
      <SettingRow label="Scopes">
        <input className="input" defaultValue="openid profile email groups" />
      </SettingRow>
      <div className="divider" />
      <div className="section-title">Group → Role Mapping</div>
      <p style={{ fontSize:12, color:'var(--text-3)', marginBottom:12, lineHeight:1.6 }}>
        Map Entra group Object IDs or display names to MIH roles. Users in these groups receive the mapped role on login. Per-user role overrides set in the Users tab take precedence.
      </p>
      {[
        { group:'MIH-Admins',     role:'Administrator',     envVar:'VITE_GROUP_ADMIN'      },
        { group:'MIH-Analysts',   role:'Analyst',           envVar:'VITE_GROUP_ANALYST'    },
        { group:'MIH-Onboarding', role:'Onboarding Agent',  envVar:'VITE_GROUP_ONBOARDING' },
        { group:'MIH-Auditors',   role:'Read-Only Auditor', envVar:'VITE_GROUP_AUDITOR'    },
      ].map(m => (
        <div key={m.group} style={{ display:'flex', gap:10, alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border-subtle)' }}>
          <div style={{ flex:1 }}>
            <input className="input" defaultValue={m.group} />
            <div style={{ fontSize:10.5, color:'var(--text-3)', marginTop:3, fontFamily:'var(--font-mono)' }}>env: {m.envVar}</div>
          </div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width:14, height:14, color:'var(--text-3)', flexShrink:0 }}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          <select className="input select" style={{ width:170 }} defaultValue={m.role}>
            <option>Administrator</option><option>Analyst</option><option>Onboarding Agent</option><option>Read-Only Auditor</option>
          </select>
        </div>
      ))}
      <div style={{ marginTop:20 }}>
        <button className="btn btn-primary">Save Configuration</button>
      </div>
    </div>
  )
}

function VaultConfig() {
  return (
    <div>
      <div className="section-title">Delinea Secret Server Connection</div>
      <SettingRow label="Vault URL" hint="Base URL for Delinea Secret Server REST API">
        <input className="input" defaultValue="https://vault.rsmdefense.com/SecretServer" />
      </SettingRow>
      <SettingRow label="Service Account Username" hint="Dedicated service account with least-privilege access">
        <input className="input" defaultValue="svc-mih-delinea" />
      </SettingRow>
      <SettingRow label="Service Account Password" hint="Stored encrypted at rest; supports rotation without restart">
        <SecretInput defaultValue="••••••••••••••••" />
      </SettingRow>
      <SettingRow label="Default Secret Folder" hint="Root folder for all tenant credentials">
        <input className="input" defaultValue="Clients" />
      </SettingRow>
      <SettingRow label="Connection Status">
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span className="health-dot healthy" />
          <span style={{ color:'var(--green)', fontSize:13, fontWeight:500 }}>Connected</span>
          <span className="mono" style={{ color:'var(--text-3)' }}>Last verified: 09:20:01</span>
        </div>
      </SettingRow>
      <div style={{ marginTop:20, display:'flex', gap:10 }}>
        <button className="btn btn-primary">Save Configuration</button>
        <button className="btn btn-secondary">Test Connection</button>
      </div>
    </div>
  )
}

function HealthCheckConfig() {
  return (
    <div>
      <div className="section-title">Health Check Polling</div>
      <SettingRow label="Polling Interval" hint="How frequently the backend polls each tenant's API">
        <select className="input select"><option>1 minute</option><option>3 minutes</option><option>5 minutes</option><option>10 minutes</option></select>
      </SettingRow>
      <SettingRow label="API Timeout Threshold" hint="Maximum wait before marking degraded">
        <select className="input select"><option>5 seconds</option><option>10 seconds</option><option>15 seconds</option><option>30 seconds</option></select>
      </SettingRow>
      <SettingRow label="Retry Attempts" hint="Retries before marking offline">
        <select className="input select"><option>1</option><option>3</option><option>5</option></select>
      </SettingRow>
      <SettingRow label="Retry Backoff">
        <select className="input select"><option>Fixed (2s)</option><option>Exponential (2s, 4s, 8s…)</option></select>
      </SettingRow>
      <SettingRow label="Degraded → Offline Threshold">
        <select className="input select"><option>5 minutes</option><option>15 minutes</option><option>30 minutes</option></select>
      </SettingRow>
      <div style={{ marginTop:20, display:'flex', gap:10 }}>
        <button className="btn btn-primary">Save Configuration</button>
        <button className="btn btn-secondary">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width:13, height:13 }}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          Poll All Tenants Now
        </button>
      </div>
    </div>
  )
}

function Siem() {
  const [proto, setProto] = useState('Webhook')
  return (
    <div>
      <div className="section-title">SIEM Integration</div>
      <SettingRow label="Export Protocol">
        <div style={{ display:'flex', gap:8 }}>
          {['Syslog (RFC 5424)','Webhook','Disabled'].map(p => (
            <div key={p} className={`radio-card${proto===p?' selected':''}`} style={{ flex:1, minWidth:0 }} onClick={() => setProto(p)}>
              <div className="radio-card-title" style={{ fontSize:12 }}>{p}</div>
            </div>
          ))}
        </div>
      </SettingRow>
      {proto==='Webhook' && <>
        <SettingRow label="Webhook URL" hint="POST endpoint for log events"><input className="input" placeholder="https://siem.example.com/ingest"/></SettingRow>
        <SettingRow label="Webhook Secret" hint="HMAC signing secret"><SecretInput placeholder="Enter signing secret"/></SettingRow>
        <SettingRow label="Event Types" hint="Which events to stream">
          {['LOGIN_SUCCESS','LOGIN_FAILED','TENANT_LAUNCH','CONFIG_CHANGE','TENANT_ONBOARD','ROLE_CHANGE'].map(et => (
            <label key={et} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5, fontSize:12.5, color:'var(--text-2)', cursor:'pointer' }}>
              <input type="checkbox" defaultChecked style={{ accentColor:'var(--accent)' }}/><span className="mono">{et}</span>
            </label>
          ))}
        </SettingRow>
      </>}
      {proto==='Syslog (RFC 5424)' && <>
        <SettingRow label="Syslog Host"><input className="input" placeholder="siem.internal.example.com"/></SettingRow>
        <SettingRow label="Port"><input className="input" defaultValue="514" style={{ width:100 }}/></SettingRow>
        <SettingRow label="Protocol"><select className="input select"><option>UDP</option><option>TCP</option><option>TLS</option></select></SettingRow>
      </>}
      <div style={{ marginTop:20, display:'flex', gap:10 }}>
        <button className="btn btn-primary" disabled={proto==='Disabled'}>Save Configuration</button>
        {proto!=='Disabled' && <button className="btn btn-secondary">Send Test Event</button>}
      </div>
    </div>
  )
}

function SystemHealth() {
  const items = [
    { name:'Backend API',        sub:'api.mih.rsmdefense.com',  status:'healthy',  detail:'45ms avg response' },
    { name:'Database',           sub:'PostgreSQL 16',            status:'healthy',  detail:'Primary replica healthy' },
    { name:'Delinea Vault',      sub:'vault.rsmdefense.com',     status:'healthy',  detail:'Last check: 09:22:01' },
    { name:'Entra ID',           sub:'login.microsoftonline.com',status:'healthy',  detail:'OIDC endpoint reachable' },
    { name:'SailPoint ISC APIs', sub:'12 tenants polled',         status:'degraded', detail:'2 tenants unreachable' },
    { name:'CyberArk PAM APIs',  sub:'8 tenants polled',          status:'degraded', detail:'1 tenant unreachable' },
  ]
  return (
    <div>
      <div style={{ display:'flex', gap:14, marginBottom:20 }}>
        {[{ label:'Active Sessions', val:6 },{ label:'Uptime', val:'99.8%' },{ label:'API Requests/hr', val:'1,204' }].map(s => (
          <div key={s.label} className="card card-sm" style={{ flex:1, textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-head)', fontSize:24, fontWeight:700, color:'var(--accent)' }}>{s.val}</div>
            <div style={{ fontSize:11, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.06em', marginTop:3 }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div className="section-title">Component Health</div>
      <div className="card card-sm">
        {items.map(item => (
          <div key={item.name} className="health-row">
            <span className={`health-dot ${item.status}`}/>
            <div style={{ flex:1 }}>
              <div className="health-row-name">{item.name}</div>
              <div className="health-row-sub">{item.sub}</div>
            </div>
            <span style={{ fontSize:12, color:'var(--text-3)' }}>{item.detail}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Admin Page ────────────────────────────────────────────────────────────────
export default function Admin() {
  const [activeTab, setActiveTab] = useState('General')
  const content = {
    General:             <General />,
    'Identity Provider': <IdpConfig />,
    Users:               <Users />,
    'Vault Config':      <VaultConfig />,
    'Health Check':      <HealthCheckConfig />,
    SIEM:                <Siem />,
    'System Health':     <SystemHealth />,
  }
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Administration</span>
        <div className="topbar-right">
          <span style={{ fontSize:11.5, color:'var(--red)', display:'flex', alignItems:'center', gap:4 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width:12, height:12 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Administrator access required
          </span>
        </div>
      </div>
      <div className="page-body">
        <div className="tab-bar">
          {TABS.map(t => <button key={t} className={`tab${activeTab===t?' active':''}`} onClick={() => setActiveTab(t)}>{t}</button>)}
        </div>
        {/* Users tab gets full width — other tabs capped at 800px */}
        <div style={{ maxWidth: activeTab==='Users' ? '100%' : 800 }}>
          {content[activeTab]}
        </div>
      </div>
    </>
  )
}
