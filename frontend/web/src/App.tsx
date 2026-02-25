import { useEffect, useState, useCallback } from 'react'
import { signInWithRedirect, signOut, getCurrentUser, fetchUserAttributes } from 'aws-amplify/auth'
import { Hub } from 'aws-amplify/utils'
import './App.css'
import { allowedEmailSuffixes, microsoftProvider } from './authConfig'

interface UserInfo {
  username: string
  email: string
  name?: string
}

const SignInButton = () => {
  const handleClick = async () => {
    try {
      // Check if already authenticated
      try {
        await getCurrentUser()
        // Already signed in - just reload to refresh state
        window.location.reload()
        return
      } catch {
        // Not signed in, proceed with redirect
      }
      await signInWithRedirect({ provider: microsoftProvider })
    } catch (error: unknown) {
      // Handle "already authenticated" gracefully
      if (error instanceof Error && error.name === 'UserAlreadyAuthenticatedException') {
        window.location.reload()
        return
      }
      console.error('Microsoft sign-in failed', error)
    }
  }

  return (
    <button className="btn primary" onClick={handleClick}>
      Sign in with Microsoft
    </button>
  )
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
      const currentUser = await getCurrentUser()
      const attributes = await fetchUserAttributes()
      setUser({
        username: currentUser.username,
        email: attributes.email || currentUser.username,
        name: attributes.name,
      })
    } catch {
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    checkUser()

    // Listen for auth events
    const unsubscribe = Hub.listen('auth', ({ payload }: { payload: { event: string } }) => {
      switch (payload.event) {
        case 'signedIn':
        case 'tokenRefresh':
          checkUser()
          break
        case 'signedOut':
          setUser(null)
          break
      }
    })

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
    <div className="dashboard">
      <section className="panel">
        <p className="eyebrow">Welcome back</p>
        <div className="profile">
          <div>
            <h3>{safeName}</h3>
            <p>{user.email}</p>
          </div>
          <SignOutButton />
        </div>
      </section>

      <section className="panel metrics">
        <article>
          <p className="label">Documents in review</p>
          <span className="value">18</span>
          <p className="hint">Synced from resume pipeline</p>
        </article>
        <article>
          <p className="label">LLM extractions</p>
          <span className="value">12</span>
          <p className="hint">Ready for analyst QA</p>
        </article>
        <article>
          <p className="label">Profiles published</p>
          <span className="value accent">6</span>
          <p className="hint">Last 24h</p>
        </article>
      </section>

      <section className="panel next-steps">
        <p className="eyebrow">Next up</p>
        <ul>
          <li>Spot-check the latest LLM extraction batch and flag anomalies.</li>
          <li>Upload a new resume to S3 (`raw/onedrive/`) to kick off the workflow.</li>
          <li>Review CloudWatch alarms before opening the pipeline to partners.</li>
        </ul>
      </section>
    </div>
  )
}

function App() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="shell">
        <div className="panel muted" style={{ margin: '2rem auto', maxWidth: '400px', textAlign: 'center' }}>
          <p className="eyebrow">Authenticating</p>
          <h3>Checking your session…</h3>
        </div>
      </div>
    )
  }

  return (
    <div className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Aimory Talent Pool</p>
          <h1>Control room for resume intelligence</h1>
          <p className="lede">
            Securely upload, classify, and normalize resumes with an AWS pipeline guarded by Cognito + Microsoft
            sign-in. Use this shell as the launchpad for your analyst tools.
          </p>
        </div>
        <div className="cta">
          {user ? <SignOutButton /> : <SignInButton />}
        </div>
      </header>

      <main>
        {!user ? (
          <div className="panel emphasis">
            <p className="eyebrow">Single sign-on required</p>
            <h2>Sign in with Microsoft</h2>
            <p>
              We use AWS Cognito with Microsoft Entra ID federation for identity. Your Microsoft account will be used
              to authenticate via Cognito.
            </p>
            <SignInButton />
          </div>
        ) : (
          <AccessControlledPanel user={user} />
        )}
      </main>
    </div>
  )
}

export default App
