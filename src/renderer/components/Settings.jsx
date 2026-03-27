import React, { useState, useEffect } from 'react'
import { ArrowLeft, Check } from 'lucide-react'
import './Settings.css'

const MODELS = [
  { id: 'moondream',         label: 'moondream',            size: '1.7 GB',  note: 'Fastest · great for quick culling' },
  { id: 'qwen2.5vl:3b',     label: 'qwen2.5vl:3b',         size: '3.2 GB',  note: 'Fast · very capable for size' },
  { id: 'llava-phi3',        label: 'llava-phi3',           size: '2.9 GB',  note: 'Balanced speed & quality' },
  { id: 'minicpm-v',         label: 'minicpm-v',            size: '5.5 GB',  note: 'High quality · supports hi-res' },
  { id: 'llava:7b',          label: 'llava:7b',             size: '4.7 GB',  note: 'Solid all-rounder' },
  { id: 'llava:13b',         label: 'llava:13b',            size: '8.0 GB',  note: 'Higher quality · needs 16 GB RAM' },
  { id: 'qwen2.5vl:7b',     label: 'qwen2.5vl:7b',         size: '6.0 GB',  note: 'Excellent · beats GPT-4o-mini' },
  { id: 'llama3.2-vision:11b', label: 'llama3.2-vision:11b', size: '7.8 GB', note: 'Best all-round · 128K context' },
]

export default function Settings({ settings, onSave, onClose, asPage = false }) {
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

  const settingsBody = (
    <>
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
              {ollamaModels.includes(m.id) && <span className="model-installed"><Check size={11} style={{verticalAlign:'middle', marginRight:3}} />installed</span>}
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
    </>
  )

  if (asPage) {
    return (
      <div className="settings-page">
        <div className="settings-page-head settings-page-shell">
          <button className="btn btn-ghost settings-back-btn" onClick={onClose}>
            <ArrowLeft size={14} /> Back
          </button>
          <div className="settings-page-title-wrap">
            <div className="settings-page-title">Settings</div>
            <div className="settings-page-subtitle">Adjust model and review behavior</div>
          </div>
        </div>
        <div className="settings-content settings-content-page settings-page-shell">
          {settingsBody}
        </div>
        <div className="settings-footer settings-footer-page settings-page-shell">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal settings-modal">
        <div className="modal-title">Settings</div>
        <div className="settings-content">
          {settingsBody}
        </div>
        <div className="settings-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  )
}
