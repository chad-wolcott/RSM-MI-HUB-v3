import { useState, useEffect, createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useNavigate, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import LoginPage from './auth/LoginPage'
import AuthCallback from './auth/AuthCallback'
import Dashboard from './pages/Dashboard'
import Tenants from './pages/Tenants'
import Onboard from './pages/Onboard'
import Admin from './pages/Admin'
import AuditLogs from './pages/AuditLogs'

// ── Theme Context ─────────────────────────────────────────────────────────────
const ThemeCtx = createContext(null)
export const useTheme = () => useContext(ThemeCtx)

// ── Icons ─────────────────────────────────────────────────────────────────────
export const Icon = {
  Dashboard:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  Tenants:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Onboard:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 3"/><path d="M12 3v1m0 16v1M3 12h1m16 0h1"/></svg>,
  Admin:      () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M8.46 15.54a5 5 0 0 1 0-7.07"/></svg>,
  Audit:      () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>,
  Sun:        () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
  Moon:       () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
  Logout:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  Shield:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:32,height:32}}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
}

// ── Auth Guard ────────────────────────────────────────────────────────────────
function RequireAuth({ children }) {
  const { isAuthenticated, msalLoading } = useAuth()
  if (msalLoading) return <FullPageSpinner />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

// ── Role Guard ────────────────────────────────────────────────────────────────
function RequireRole({ roles, children }) {
  const { user } = useAuth()
  if (!roles.includes(user?.role)) {
    return (
      <div className="page-body" style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:300 }}>
        <div className="empty-state">
          <Icon.Shield />
          <h3>Access Denied</h3>
          <p>Your role (<strong>{user?.role}</strong>) does not have permission to view this page.</p>
        </div>
      </div>
    )
  }
  return children
}

// ── Loading screen ────────────────────────────────────────────────────────────
function FullPageSpinner() {
  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#00041f', gap:16 }}>
      <img src="/rsm-logo.png" alt="RSM" style={{ width:80, marginBottom:8 }} />
      <div style={{ width:32, height:32, border:'3px solid rgba(0,156,222,0.2)', borderTopColor:'#009CDE', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ fontFamily:"'IBM Plex Sans',sans-serif", fontSize:13, color:'#3d5580' }}>Loading MIH…</div>
    </div>
  )
}

// ── IdP Badge ─────────────────────────────────────────────────────────────────
function IdpBadge({ idp }) {
  const isLocal = idp === 'Local'
  const isEntra = idp === 'Entra ID'
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:3, fontSize:10, fontWeight:600,
      padding:'1px 6px', borderRadius:4,
      background: isLocal ? 'rgba(240,168,33,0.1)' : isEntra ? 'rgba(0,156,222,0.1)' : 'rgba(63,156,53,0.1)',
      color: isLocal ? '#f0a821' : isEntra ? '#009CDE' : '#3F9C35',
      border:`1px solid ${isLocal?'rgba(240,168,33,0.2)':isEntra?'rgba(0,156,222,0.2)':'rgba(63,156,53,0.2)'}`,
      letterSpacing:'0.04em',
    }}>
      {isLocal && '⚙ '}
      {idp}
    </span>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar() {
  const { theme, toggleTheme } = useTheme()
  const { user, signOut } = useAuth()

  const navItems = [
    { to: '/',        label: 'Dashboard',      icon: Icon.Dashboard },
    { to: '/tenants', label: 'Tenants',         icon: Icon.Tenants },
    { to: '/onboard', label: 'Onboard Tenant',  icon: Icon.Onboard, roles: ['Onboarding Agent','Administrator'] },
    { to: '/admin',   label: 'Administration',  icon: Icon.Admin,   roles: ['Administrator'] },
    { to: '/audit',   label: 'Audit Logs',      icon: Icon.Audit,   roles: ['Administrator','Read-Only Auditor'] },
  ]

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <img src="/rsm-logo.png" alt="RSM" />
        <div className="sidebar-logo-label">
          <span>Defense</span>
          <span>Managed Identity Hub</span>
        </div>
      </div>

      <div className="sidebar-section-label">Navigation</div>
      <nav className="sidebar-nav">
        {navItems.map(item => {
          if (item.roles && !item.roles.includes(user?.role)) return null
          return (
            <NavLink key={item.to} to={item.to} end={item.to==='/'} className={({isActive})=>`nav-item${isActive?' active':''}`}>
              <item.icon />
              {item.label}
            </NavLink>
          )
        })}
      </nav>

      {/* Local admin warning */}
      {user?.authMethod === 'local' && (
        <div style={{ margin:'0 10px 10px', padding:'8px 10px', background:'rgba(240,168,33,0.08)', border:'1px solid rgba(240,168,33,0.2)', borderRadius:6, fontSize:11, color:'#c8902a', lineHeight:1.5, display:'flex', gap:6, alignItems:'flex-start' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:12,height:12,flexShrink:0,marginTop:2}}>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span>Local admin session. Configure Entra ID in <strong>Admin → Identity Provider</strong>.</span>
        </div>
      )}

      <div className="sidebar-footer">
        <div className="user-info">
          <div className="user-avatar">{user?.initials || '??'}</div>
          <div className="user-details">
            <span className="user-name">{user?.name || 'Unknown'}</span>
            <span className="user-role">{user?.role}</span>
          </div>
        </div>
        <div style={{ marginBottom:8 }}>
          <IdpBadge idp={user?.idp || 'Unknown'} />
        </div>
        <div className="sidebar-actions">
          <button className="sidebar-btn" onClick={toggleTheme}>
            {theme === 'dark' ? <Icon.Sun /> : <Icon.Moon />}
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <button className="sidebar-btn" onClick={signOut}>
            <Icon.Logout />
            Logout
          </button>
        </div>
      </div>
    </aside>
  )
}

// ── Authenticated shell ───────────────────────────────────────────────────────
function Shell() {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <Routes>
          <Route path="/"        element={<Dashboard />} />
          <Route path="/tenants" element={<Tenants />} />
          <Route path="/onboard" element={<RequireRole roles={['Onboarding Agent','Administrator']}><Onboard /></RequireRole>} />
          <Route path="/admin"   element={<RequireRole roles={['Administrator']}><Admin /></RequireRole>} />
          <Route path="/audit"   element={<RequireRole roles={['Administrator','Read-Only Auditor']}><AuditLogs /></RequireRole>} />
          <Route path="*"        element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  )
}

// ── Router ────────────────────────────────────────────────────────────────────
function AppRouter() {
  return (
    <Routes>
      <Route path="/login"         element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/*" element={<RequireAuth><Shell /></RequireAuth>} />
    </Routes>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('mih-theme')
    if (saved) return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('mih-theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  return (
    <ThemeCtx.Provider value={{ theme, toggleTheme }}>
      <BrowserRouter>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </BrowserRouter>
    </ThemeCtx.Provider>
  )
}
