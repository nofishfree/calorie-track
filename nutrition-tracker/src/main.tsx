import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from 'react-error-boundary'
import type { FallbackProps } from 'react-error-boundary'
import App from './App'

function ErrorFallback({ error }: FallbackProps) {
  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h1>发生错误</h1>
      <p>{(error as Error).message || '未知错误'}</p>
      <button onClick={() => window.location.reload()}>刷新页面</button>
    </div>
  )
}

const root = document.getElementById('root')
if (!root) {
  console.error('Root element not found')
} else {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
}

