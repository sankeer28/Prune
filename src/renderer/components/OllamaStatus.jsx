import React, { useState, useEffect } from 'react'

export default function OllamaStatus() {
  const [status, setStatus] = useState('checking') // checking | ok | error

  const check = async () => {
    try {
      const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(3000) })
      setStatus(res.ok ? 'ok' : 'error')
    } catch {
      setStatus('error')
    }
  }

  useEffect(() => {
    check()
    const interval = setInterval(check, 10000)
    return () => clearInterval(interval)
  }, [])

  const color = status === 'ok' ? '#4ade80' : status === 'error' ? '#f87171' : '#fbbf24'
  const label = status === 'ok' ? 'Ollama ready' : status === 'error' ? 'Ollama offline' : 'Checking...'

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}
      onClick={check}
      title="Click to recheck"
    >
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: color,
        boxShadow: status === 'ok' ? `0 0 6px ${color}` : 'none',
        flexShrink: 0
      }} />
      {label}
    </div>
  )
}
