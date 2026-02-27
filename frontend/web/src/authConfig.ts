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

// Use environment variable if set, otherwise detect at runtime
// List all possible redirect URIs - Amplify will match the current origin
const configuredRedirectUri = import.meta.env.VITE_COGNITO_REDIRECT_URI

// Function to get the config - needed because redirect URIs must be determined at runtime
export const getAmplifyConfig = (): ResourcesConfig => {
  // Get redirect URL at runtime, not build time
  const redirectUrl = configuredRedirectUri || window.location.origin
  
  return {
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
}

// Keep backward compat export - but this will use runtime origin now
export const amplifyConfig = typeof window !== 'undefined' 
  ? getAmplifyConfig() 
  : {} as ResourcesConfig

// Microsoft provider name (must match Cognito IdP configuration)
export const microsoftProvider = {
  custom: 'Microsoft',
}

// Allowed email suffixes for access control (optional)
export const allowedEmailSuffixes: string[] = (import.meta.env.VITE_ALLOWED_EMAIL_SUFFIXES || '')
  .split(',')
  .map((suffix: string) => suffix.trim().toLowerCase())
  .filter(Boolean)
