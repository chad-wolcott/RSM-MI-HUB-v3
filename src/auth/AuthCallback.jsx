import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMsal } from '@azure/msal-react'
import { InteractionStatus } from '@azure/msal-browser'

// Handles the redirect back from Entra ID after sign-in
export default function AuthCallback() {
  const { instance, inProgress } = useMsal()
  const navigate = useNavigate()

  useEffect(() => {
    if (inProgress === InteractionStatus.None) {
      // MSAL handles the token exchange automatically via handleRedirectPromise
      // in the AuthProvider. Once done, redirect to dashboard.
      const accounts = instance.getAllAccounts()
      if (accounts.length > 0) {
        navigate('/', { replace: true })
      } else {
        navigate('/login', { replace: true })
      }
    }
  }, [inProgress, instance, navigate])

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#00041f',
      color: '#7899cc',
      gap: 16,
      fontFamily: "'IBM Plex Sans', sans-serif",
    }}>
      <div style={{
        width: 36, height: 36,
        border: '3px solid rgba(0,156,222,0.2)',
        borderTopColor: '#009CDE',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <div style={{ fontSize: 14, color: '#7899cc' }}>Completing sign-in…</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
