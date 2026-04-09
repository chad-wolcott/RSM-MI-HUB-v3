import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { useMsal, useIsAuthenticated } from '@azure/msal-react'
import { InteractionStatus } from '@azure/msal-browser'
import { loginRequest, getRoleFromClaims, isEntraConfigured } from './msalConfig'
import { validateLocalUser } from '../lib/localAuth'

// ─────────────────────────────────────────────────────────────────────────────
const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

const SESSION_KEY = 'mih-local-session'

// ── Auth Provider ─────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const { instance, accounts, inProgress } = useMsal()
  const msalAuthenticated = useIsAuthenticated()

  // Local admin session persisted in sessionStorage
  const [localUser, setLocalUser] = useState(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY)
      return stored ? JSON.parse(stored) : null
    } catch { return null }
  })

  const [localAuthError, setLocalAuthError] = useState(null)
  const [localAuthLoading, setLocalAuthLoading] = useState(false)
  const [entraError, setEntraError] = useState(null)

  // ── Entra user derived from MSAL account ─────────────────────────────────
  const entraUser = msalAuthenticated && accounts.length > 0
    ? {
        id:         accounts[0].homeAccountId,
        name:       accounts[0].name || accounts[0].username,
        email:      accounts[0].username,
        role:       getRoleFromClaims(accounts[0]),
        initials:   (accounts[0].name || accounts[0].username).split(' ').map(p => p[0]).join('').slice(0,2).toUpperCase(),
        idp:        'Entra ID',
        authMethod: 'entra',
        mfaVerified: !!(accounts[0].idTokenClaims?.amr?.includes('mfa') || accounts[0].idTokenClaims?.acr === 'possessionorinherence'),
        loginTime:  new Date().toISOString(),
      }
    : null

  // Active user: Entra takes precedence over local
  const user = entraUser || localUser

  // Authenticated if either method has a valid session
  const isAuthenticated = !!user

  // MFA status
  const hasMfa = entraUser
    ? entraUser.mfaVerified
    : localUser?.authMethod === 'local' // Local admin is trusted for initial setup

  // ── Entra Sign-in ─────────────────────────────────────────────────────────
  const signInEntra = useCallback(async () => {
    setEntraError(null)
    try {
      await instance.loginRedirect({
        ...loginRequest,
        prompt: 'select_account',
      })
    } catch (err) {
      if (err.errorCode !== 'user_cancelled') {
        setEntraError(err.errorMessage || 'Authentication failed. Please try again.')
      }
    }
  }, [instance])

  // ── Local Admin Sign-in ───────────────────────────────────────────────────
  const signInLocal = useCallback(async (email, password) => {
    setLocalAuthError(null)
    setLocalAuthLoading(true)

    try {
      // validateLocalUser checks the userStore for any active local/both account
      // and verifies the SHA-256 hashed password stored alongside that record.
      // Falls back to the hardcoded bootstrap credential for chad.wolcott until
      // an explicit password is set via the Admin → Users panel.
      const result = await validateLocalUser(email, password)

      if (result) {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(result))
        setLocalUser(result)
        setLocalAuthLoading(false)
        return { success: true }
      } else {
        setLocalAuthError('Invalid email or password.')
        setLocalAuthLoading(false)
        return { success: false, error: 'Invalid email or password.' }
      }
    } catch (err) {
      console.error('[localAuth] Validation error:', err)
      setLocalAuthError('Authentication error. Please try again.')
      setLocalAuthLoading(false)
      return { success: false, error: err.message }
    }
  }, [])

  // ── Sign-out ──────────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    if (localUser) {
      sessionStorage.removeItem(SESSION_KEY)
      setLocalUser(null)
    }
    if (msalAuthenticated) {
      await instance.logoutRedirect({
        postLogoutRedirectUri: window.location.origin + '/login',
      })
    }
    if (!msalAuthenticated) {
      window.location.href = '/login'
    }
  }, [instance, msalAuthenticated, localUser])

  // ── Handle MSAL redirect response ────────────────────────────────────────
  useEffect(() => {
    instance.handleRedirectPromise().catch(err => {
      if (err.errorCode !== 'user_cancelled') {
        setEntraError(err.errorMessage || 'Sign-in redirect failed.')
      }
    })
  }, [instance])

  const entraConfigured = isEntraConfigured()
  const msalLoading = inProgress !== InteractionStatus.None

  return (
    <AuthCtx.Provider value={{
      user,
      isAuthenticated,
      hasMfa,
      entraConfigured,
      msalLoading,
      localAuthLoading,
      localAuthError,
      entraError,
      signInEntra,
      signInLocal,
      signOut,
      setLocalAuthError,
      setEntraError,
    }}>
      {children}
    </AuthCtx.Provider>
  )
}
