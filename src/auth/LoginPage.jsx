import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'

export default function LoginPage() {
  const navigate = useNavigate()
  const {
    isAuthenticated,
    entraConfigured,
    msalLoading,
    localAuthLoading,
    localAuthError,
    entraError,
    signInEntra,
    signInLocal,
    setLocalAuthError,
    setEntraError,
  } = useAuth()

  const [showLocal, setShowLocal]   = useState(false)
  const [email,     setEmail]       = useState('chad.wolcott@rsmus.com')
  const [password,  setPassword]    = useState('')
  const [showPw,    setShowPw]      = useState(false)
  const [attempts,  setAttempts]    = useState(0)
  const [locked,    setLocked]      = useState(false)
  const [lockTimer, setLockTimer]   = useState(0)

  // Redirect if already authed
  useEffect(() => { if (isAuthenticated) navigate('/') }, [isAuthenticated, navigate])

  // Lock timer countdown
  useEffect(() => {
    if (!locked) return
    if (lockTimer <= 0) { setLocked(false); setAttempts(0); return }
    const t = setTimeout(() => setLockTimer(n => n - 1), 1000)
    return () => clearTimeout(t)
  }, [locked, lockTimer])

  const handleLocalSubmit = async (e) => {
    e.preventDefault()
    if (locked) return
    setLocalAuthError(null)

    const result = await signInLocal(email, password)
    if (!result.success) {
      const next = attempts + 1
      setAttempts(next)
      if (next >= 5) {
        setLocked(true)
        setLockTimer(30)
        setLocalAuthError('Too many failed attempts. Account locked for 30 seconds.')
      }
    }
  }

  const isLoading = msalLoading || localAuthLoading

  return (
    <div style={styles.root}>
      {/* Background grid */}
      <div style={styles.grid} />

      {/* Left brand panel */}
      <div style={styles.brand}>
        <div style={styles.brandInner}>
          <img src="/rsm-logo.png" alt="RSM" style={styles.logo} />
          <h1 style={styles.brandTitle}>Managed<br />Identity Hub</h1>
          <p style={styles.brandSub}>
            Centralized management console for SailPoint ISC and CyberArk PAM tenants.
            Secure access for RSM Defense managed identity analysts.
          </p>
          <div style={styles.features}>
            {[
              ['Single pane of glass', 'All client tenants in one console'],
              ['Secure credential injection', 'Powered by Delinea Secret Server'],
              ['Full audit trail', '365-day immutable logging'],
            ].map(([title, desc]) => (
              <div key={title} style={styles.featureItem}>
                <div style={styles.featureDot} />
                <div>
                  <div style={styles.featureTitle}>{title}</div>
                  <div style={styles.featureDesc}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={styles.brandFooter}>
          RSM Defense — Confidential &nbsp;·&nbsp; v1.0
        </div>
      </div>

      {/* Right login panel */}
      <div style={styles.panel}>
        <div style={styles.card}>
          <div style={styles.cardHead}>
            <div style={styles.cardIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:22,height:22}}>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <h2 style={styles.cardTitle}>Sign in to MIH</h2>
            <p style={styles.cardSub}>Multi-factor authentication required</p>
          </div>

          {/* ── Entra ID SSO ──────────────────────────── */}
          {!showLocal && (
            <div>
              {entraConfigured ? (
                <>
                  <button
                    style={{ ...styles.msBtn, opacity: isLoading ? 0.7 : 1 }}
                    onClick={signInEntra}
                    disabled={isLoading}
                  >
                    <MicrosoftIcon />
                    {msalLoading ? 'Redirecting to Microsoft…' : 'Sign in with Microsoft'}
                  </button>

                  {entraError && (
                    <div style={styles.errorBox}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:14,height:14,flexShrink:0}}>
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                      {entraError}
                    </div>
                  )}

                  <div style={styles.mfaNote}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:12,height:12,flexShrink:0}}>
                      <rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>
                    </svg>
                    MFA is enforced at the Entra ID level. Tokens without MFA will be rejected.
                  </div>

                  <div style={styles.divider}>
                    <span style={styles.dividerLine} />
                    <span style={styles.dividerText}>or</span>
                    <span style={styles.dividerLine} />
                  </div>
                </>
              ) : (
                <div style={styles.entraNotice}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:16,height:16,flexShrink:0,marginTop:1}}>
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Entra ID not yet configured</div>
                    <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                      Set <code style={styles.code}>VITE_ENTRA_CLIENT_ID</code> and <code style={styles.code}>VITE_ENTRA_TENANT_ID</code> environment variables in Netlify to enable Microsoft SSO. Use the local admin account below for initial setup.
                    </div>
                  </div>
                </div>
              )}

              {/* Initial Setup / Local Admin link */}
              <button style={styles.localLink} onClick={() => { setShowLocal(true); setLocalAuthError(null); }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:13,height:13}}>
                  <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
                {entraConfigured ? 'Use local admin account' : 'Sign in with local admin account'}
              </button>
            </div>
          )}

          {/* ── Local Admin Form ───────────────────────── */}
          {showLocal && (
            <form onSubmit={handleLocalSubmit}>
              <div style={styles.localBanner}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:13,height:13,flexShrink:0}}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <span>
                  <strong>Local admin — initial setup only.</strong> Configure Entra ID in Administration → Identity Provider, then disable this account.
                </span>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={styles.label}>Email address</label>
                <input
                  style={styles.input}
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setLocalAuthError(null) }}
                  autoComplete="username"
                  placeholder="email@rsmus.com"
                  disabled={localAuthLoading}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={styles.label}>Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    style={{ ...styles.input, paddingRight: 40 }}
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setLocalAuthError(null) }}
                    autoComplete="current-password"
                    placeholder="Enter password"
                    disabled={localAuthLoading || locked}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    style={styles.eyeBtn}
                    tabIndex={-1}
                  >
                    {showPw
                      ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:15,height:15}}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:15,height:15}}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                  </button>
                </div>
              </div>

              {localAuthError && (
                <div style={styles.errorBox}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:14,height:14,flexShrink:0}}>
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {locked ? `${localAuthError} (${lockTimer}s remaining)` : localAuthError}
                </div>
              )}

              {attempts > 0 && attempts < 5 && (
                <div style={{ fontSize: 11.5, color: '#f0a821', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:12,height:12}}>
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  {5 - attempts} attempt{5 - attempts !== 1 ? 's' : ''} remaining before lockout
                </div>
              )}

              <button
                type="submit"
                style={{ ...styles.submitBtn, opacity: (localAuthLoading || locked) ? 0.6 : 1 }}
                disabled={localAuthLoading || locked || !email || !password}
              >
                {localAuthLoading ? (
                  <><Spinner /> Authenticating…</>
                ) : locked ? (
                  `Locked (${lockTimer}s)`
                ) : (
                  'Sign in'
                )}
              </button>

              <button
                type="button"
                style={styles.localLink}
                onClick={() => { setShowLocal(false); setLocalAuthError(null) }}
              >
                ← Back to Microsoft sign-in
              </button>
            </form>
          )}
        </div>

        <div style={styles.footer}>
          RSM Defense Managed Identity Hub &nbsp;·&nbsp; Classification: Confidential<br />
          <span style={{ opacity: 0.4, fontSize: 11 }}>All access is logged and subject to audit</span>
        </div>
      </div>
    </div>
  )
}

// ── Icons & Helpers ───────────────────────────────────────────────────────────
function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 21 21" style={{ width: 18, height: 18, flexShrink: 0 }}>
      <rect x="1"  y="1"  width="9" height="9" fill="#f25022"/>
      <rect x="11" y="1"  width="9" height="9" fill="#7fba00"/>
      <rect x="1"  y="11" width="9" height="9" fill="#00a4ef"/>
      <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
    </svg>
  )
}

function Spinner() {
  return (
    <div style={{
      width: 14, height: 14,
      border: '2px solid rgba(255,255,255,0.3)',
      borderTopColor: '#fff',
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
      display: 'inline-block',
    }} />
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    background: '#00041f',
    position: 'relative',
    overflow: 'hidden',
  },
  grid: {
    position: 'absolute',
    inset: 0,
    backgroundImage: `
      linear-gradient(rgba(0,156,222,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,156,222,0.03) 1px, transparent 1px)
    `,
    backgroundSize: '40px 40px',
    pointerEvents: 'none',
  },
  brand: {
    flex: '0 0 420px',
    background: 'linear-gradient(160deg, #000153 0%, #000830 60%, #00041f 100%)',
    borderRight: '1px solid rgba(0,156,222,0.15)',
    display: 'flex',
    flexDirection: 'column',
    padding: '0 48px',
    position: 'relative',
    overflow: 'hidden',
  },
  brandInner: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    paddingTop: 60,
  },
  logo: {
    width: 100,
    height: 'auto',
    marginBottom: 36,
    objectFit: 'contain',
    objectPosition: 'left',
  },
  brandTitle: {
    fontFamily: "'Rajdhani', sans-serif",
    fontSize: 40,
    fontWeight: 700,
    color: '#fff',
    lineHeight: 1.1,
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  brandSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.45)',
    lineHeight: 1.7,
    marginBottom: 40,
  },
  features: { display: 'flex', flexDirection: 'column', gap: 18 },
  featureItem: { display: 'flex', gap: 14, alignItems: 'flex-start' },
  featureDot: {
    width: 6, height: 6,
    borderRadius: '50%',
    background: '#009CDE',
    marginTop: 7,
    flexShrink: 0,
    boxShadow: '0 0 8px rgba(0,156,222,0.6)',
  },
  featureTitle: { fontSize: 13.5, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 2 },
  featureDesc:  { fontSize: 12, color: 'rgba(255,255,255,0.35)' },
  brandFooter: {
    padding: '24px 0',
    fontSize: 11,
    color: 'rgba(255,255,255,0.2)',
    letterSpacing: '0.04em',
  },
  panel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 24px',
    position: 'relative',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    background: 'rgba(5,12,42,0.9)',
    border: '1px solid rgba(0,156,222,0.18)',
    borderRadius: 12,
    padding: '32px 28px 28px',
    boxShadow: '0 8px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,156,222,0.05)',
    backdropFilter: 'blur(12px)',
  },
  cardHead: { textAlign: 'center', marginBottom: 28 },
  cardIcon: {
    width: 48, height: 48,
    borderRadius: '50%',
    background: 'rgba(0,156,222,0.12)',
    border: '1px solid rgba(0,156,222,0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 14px',
    color: '#009CDE',
  },
  cardTitle: {
    fontFamily: "'Rajdhani', sans-serif",
    fontSize: 22,
    fontWeight: 700,
    color: '#dce8ff',
    margin: '0 0 4px',
    letterSpacing: '0.03em',
  },
  cardSub: { fontSize: 12.5, color: '#3d5580', margin: 0 },
  msBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: '11px 20px',
    background: '#fff',
    border: 'none',
    borderRadius: 6,
    color: '#1a1a1a',
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "'IBM Plex Sans', sans-serif",
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    marginBottom: 14,
  },
  mfaNote: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 6,
    fontSize: 11.5,
    color: '#3d5580',
    background: 'rgba(0,156,222,0.05)',
    border: '1px solid rgba(0,156,222,0.1)',
    borderRadius: 6,
    padding: '8px 10px',
    marginBottom: 16,
    lineHeight: 1.5,
  },
  entraNotice: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    background: 'rgba(240,168,33,0.08)',
    border: '1px solid rgba(240,168,33,0.25)',
    borderRadius: 6,
    padding: '12px 14px',
    color: '#f0a821',
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 1.5,
  },
  code: {
    background: 'rgba(0,0,0,0.3)',
    padding: '1px 5px',
    borderRadius: 3,
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    color: '#009CDE',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: 'rgba(0,156,222,0.12)',
  },
  dividerText: {
    fontSize: 11,
    color: '#3d5580',
    flexShrink: 0,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  localLink: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
    padding: '9px 16px',
    background: 'transparent',
    border: '1px solid rgba(0,156,222,0.15)',
    borderRadius: 6,
    color: '#7899cc',
    fontSize: 13,
    fontFamily: "'IBM Plex Sans', sans-serif",
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    marginTop: 8,
  },
  localBanner: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    background: 'rgba(240,168,33,0.07)',
    border: '1px solid rgba(240,168,33,0.2)',
    borderRadius: 6,
    padding: '10px 12px',
    fontSize: 12,
    color: '#c8902a',
    lineHeight: 1.5,
    marginBottom: 18,
  },
  label: {
    display: 'block',
    fontSize: 11.5,
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: '#3d5580',
    marginBottom: 6,
    fontFamily: "'IBM Plex Sans', sans-serif",
  },
  input: {
    width: '100%',
    padding: '9px 12px',
    background: 'rgba(6,13,40,0.8)',
    border: '1px solid rgba(22,32,72,0.9)',
    borderRadius: 6,
    color: '#dce8ff',
    fontSize: 13.5,
    fontFamily: "'IBM Plex Sans', sans-serif",
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  },
  eyeBtn: {
    position: 'absolute',
    right: 10,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'transparent',
    border: 'none',
    color: '#3d5580',
    cursor: 'pointer',
    padding: 4,
    display: 'flex',
  },
  errorBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    background: 'rgba(232,68,68,0.08)',
    border: '1px solid rgba(232,68,68,0.25)',
    borderRadius: 6,
    padding: '9px 12px',
    color: '#e84444',
    fontSize: 12.5,
    marginBottom: 12,
    lineHeight: 1.5,
  },
  submitBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '11px 20px',
    background: '#009CDE',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "'IBM Plex Sans', sans-serif",
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    marginBottom: 4,
  },
  footer: {
    marginTop: 28,
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.2)',
    textAlign: 'center',
    lineHeight: 1.8,
    letterSpacing: '0.02em',
  },
}
