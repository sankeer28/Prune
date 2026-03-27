import React, { useState, useEffect } from 'react'
import './Settings.css'

const MODELS = [
  { id: 'moondream2', label: 'moondream2', size: '~1.7 GB', note: 'Fast, lightweight' },
  { id: 'llava-phi3', label: 'llava-phi3', size: '~2.9 GB', note: 'Balanced' },
  { id: 'llava:7b',   label: 'llava:7b',   size: '~4.1 GB', note: 'Most accurate' }
]

export default function Settings({ settings, onSave, onClose }) {
  const [local, setLocal] = useState({ ...settings })
  const [ollamaModels, setOllamaModels] = useState([])

  useEffect(() => {
    // Try to load available models from Ollama
    fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(3000) })
      .then(r => r.json())
      .then(d => {
        const names = (d.models || []).map(m => m.name)
        setOllamaModels(names)
      })
      .catch(() => {})
  }, [])

  const handleSave = () => {
    onSave(local)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal settings-modal">
        <div className="modal-title">Settings</div>

        <div className="settings-section">
          <label className="settings-label">Vision Model</label>
          <div className="model-list">
            {MODELS.map(m => (
              <div
                key={m.id}
                className={`model-option ${local.model === m.id ? 'active' : ''}`}
                onClick={() => setLocal(l => ({ ...l, model: m.id }))}
              >
                <div className="model-name">{m.label}</div>
                <div className="model-meta">{m.size} · {m.note}</div>
                {ollamaModels.includes(m.id) && <span className="model-installed">✓ installed</span>}
              </div>
            ))}
          </div>
          {ollamaModels.length > 0 && (
            <p className="settings-hint">Installed Ollama models: {ollamaModels.join(', ')}</p>
          )}
        </div>

        <div className="settings-section">
          <label className="settings-label">AI Strictness</label>
          <div className="radio-group">
            {['conservative', 'balanced', 'aggressive'].map(s => (
              <label key={s} className={`radio-opt ${local.strictness === s ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="strictness"
                  value={s}
                  checked={local.strictness === s}
                  onChange={() => setLocal(l => ({ ...l, strictness: s }))}
                />
                <span>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <label className="settings-label">Display</label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={local.showAiOverlay}
              onChange={e => setLocal(l => ({ ...l, showAiOverlay: e.target.checked }))}
            />
            <span className="toggle-label">Show AI overlay during review</span>
          </label>
          <p className="settings-hint">Turn off for unbiased review</p>
        </div>

        <div className="settings-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  )
}
