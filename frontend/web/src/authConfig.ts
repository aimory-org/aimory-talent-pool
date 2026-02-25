import type { ResourcesConfig } from 'aws-amplify'

// Environment variables for Cognito configuration
const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID
const userPoolClientId = import.meta.env.VITE_COGNITO_CLIENT_ID
const cognitoDomain = import.meta.env.VITE_COGNITO_DOMAIN

if (!userPoolId || !userPoolClientId || !cognitoDomain) {
  throw new Error(
    'Missing Cognito configuration. Set VITE_COGNITO_USER_POOL_ID, VITE_COGNITO_CLIENT_ID, and VITE_COGNITO_DOMAIN in your environment.'
  )
}

const redirectUrl =
  import.meta.env.VITE_COGNITO_REDIRECT_URI ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173')

export const amplifyConfig: ResourcesConfig = {
  Auth: {
    Cognito: {
      userPoolId,
      userPoolClientId,
      loginWith: {
        oauth: {
          domain: cognitoDomain,
          scopes: ['email', 'openid', 'profile'],
          redirectSignIn: [redirectUrl],
          redirectSignOut: [redirectUrl],
          responseType: 'code',
        },
      },
    },
  },
}

// Microsoft provider name (must match Cognito IdP configuration)
export const microsoftProvider = {
  custom: 'Microsoft',
}

// Allowed email suffixes for access control (optional)
export const allowedEmailSuffixes: string[] = (import.meta.env.VITE_ALLOWED_EMAIL_SUFFIXES || '')
  .split(',')
  .map((suffix: string) => suffix.trim().toLowerCase())
  .filter(Boolean)
