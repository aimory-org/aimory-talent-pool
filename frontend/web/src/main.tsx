import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Amplify } from 'aws-amplify'
import './index.css'
import App from './App.tsx'
import { amplifyConfig } from './authConfig'

// Configure Amplify with Cognito settings
Amplify.configure(amplifyConfig)

const container = document.getElementById('root')

if (!container) {
  throw new Error('Failed to locate root element')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
