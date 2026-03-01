import { useEffect, useState, useCallback } from 'react'
import { signInWithRedirect, signOut, fetchAuthSession } from 'aws-amplify/auth'
import { Hub } from 'aws-amplify/utils'
import './App.css'
import { allowedEmailSuffixes, microsoftProvider } from './authConfig'
import { TalentDashboard } from './components/TalentDashboard'

interface UserInfo {
  username: string
  email: string
  name?: string
}

const SignOutButton = () => {
  const handleClick = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Sign-out failed', error)
    }
  }

  return (
    <button className="btn ghost" onClick={handleClick}>Log out</button>
  )
}

const useAuth = () => {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const checkUser = useCallback(async () => {
    try {
      // Fetch session and parse user info from ID token
      const session = await fetchAuthSession()
      const idToken = session.tokens?.idToken
      
      if (!idToken) {
        setUser(null)
        setIsLoading(false)
        return
      }
      
      // Parse claims from the ID token payload
      const payload = idToken.payload
      setUser({
        username: (payload.sub as string) || 'unknown',
        email: (payload.email as string) || (payload.sub as string) || 'unknown',
        name: payload.name as string | undefined,
      })
      
      // Clear the OAuth code from URL after successful auth
      if (window.location.search.includes('code=')) {
        window.history.replaceState({}, '', window.location.pathname)
      }
    } catch (err) {
      console.debug('No authenticated user:', err)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    // Listen for auth events
    const unsubscribe = Hub.listen('auth', ({ payload }: { payload: { event: string } }) => {
      console.debug('Auth event:', payload.event)
      switch (payload.event) {
        case 'signedIn':
        case 'signInWithRedirect':
        case 'tokenRefresh':
          checkUser()
          break
        case 'signedOut':
          setUser(null)
          setIsLoading(false)
          break
        case 'signInWithRedirect_failure':
          console.error('OAuth redirect failed')
          setIsLoading(false)
          break
      }
    })

    // Initial auth check
    checkUser()

    return unsubscribe
  }, [checkUser])

  return { user, isLoading }
}

const AccessControlledPanel = ({ user }: { user: UserInfo }) => {
  const accountAllowed =
    allowedEmailSuffixes.length === 0 ||
    allowedEmailSuffixes.some((suffix: string) => user.email.toLowerCase().endsWith(suffix))

  if (!accountAllowed) {
    return (
      <div className="panel warning">
        <p className="eyebrow">Access limited</p>
        <h3>Use a company-managed Microsoft account</h3>
        <p>
          You signed in as <strong>{user.email}</strong>. Only accounts that end with{' '}
          {allowedEmailSuffixes.map((suffix: string) => suffix.replace(/^@?/, '@')).join(' or ')} have access to this
          environment.
        </p>
        <SignOutButton />
      </div>
    )
  }

  return <InsightsGrid user={user} />
}

const InsightsGrid = ({ user }: { user: UserInfo }) => {
  const safeName = user.name || user.email

  return (
    <div className="w-full">
      {/* User Info Bar */}
      <div className="bg-slate-800/50 backdrop-blur-lg border-b border-white/10 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-300 font-medium text-sm">
              {safeName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium text-white">{safeName}</p>
              <p className="text-xs text-white/50">{user.email}</p>
            </div>
          </div>
          <SignOutButton />
        </div>
      </div>
      
      {/* Talent Dashboard */}
      <TalentDashboard />
    </div>
  )
}

function App() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-slate-800/50 backdrop-blur-lg rounded-2xl border border-white/10 p-8 text-center max-w-sm">
          <div className="animate-spin h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-white/60">Checking your session...</p>
        </div>
      </div>
    )
  }

  // Signed in - show full dashboard
  if (user) {
    return <AccessControlledPanel user={user} />
  }

  // Not signed in - show landing
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 mb-4 shadow-lg shadow-indigo-500/25">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-white mb-1">Talent Pool</h1>
          <p className="text-white/50 text-sm">Aimory Consulting</p>
        </div>
        
        {/* Login Card */}
        <div className="bg-slate-800/60 backdrop-blur-xl rounded-2xl border border-white/10 p-8 shadow-2xl">
          <div className="text-center mb-6">
            <h2 className="text-lg font-medium text-white mb-2">Welcome back</h2>
            <p className="text-white/50 text-sm">
              Sign in to access the candidate resume database
            </p>
          </div>
          
          <button 
            onClick={async () => {
              try {
                const session = await fetchAuthSession()
                if (session.tokens) {
                  window.location.reload()
                  return
                }
              } catch {}
              await signInWithRedirect({ provider: microsoftProvider })
            }}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-slate-800 font-medium py-3 px-4 rounded-xl transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.98]"
          >
            <svg className="w-5 h-5" viewBox="0 0 21 21" fill="none">
              <rect width="10" height="10" fill="#f25022"/>
              <rect x="11" width="10" height="10" fill="#7fba00"/>
              <rect y="11" width="10" height="10" fill="#00a4ef"/>
              <rect x="11" y="11" width="10" height="10" fill="#ffb900"/>
            </svg>
            Sign in with Microsoft
          </button>
          
          <p className="text-center text-white/30 text-xs mt-6">
            Use your company Microsoft account
          </p>
        </div>
        
        {/* Footer */}
        <p className="text-center text-white/20 text-xs mt-8">
          Internal use only
        </p>
      </div>
    </div>
  )
}

export default App
