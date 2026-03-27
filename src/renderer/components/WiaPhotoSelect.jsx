import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Image as ImageIcon, ArrowLeft, Check, ArrowRight } from 'lucide-react'
import './WiaPhotoSelect.css'

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatDate(raw) {
  if (!raw) return ''
  // WIA date is yyyyMMddHHmmss or similar
  try {
    const s = String(raw)
    if (s.length >= 8) {
      const y = s.slice(0, 4), mo = s.slice(4, 6), d = s.slice(6, 8)
      return `${d}/${mo}/${y}`
    }
  } catch {}
  return ''
}

function ThumbImg({ udid, photo }) {
  const [src, setSrc] = useState(null)
  const ref = useRef()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        obs.disconnect()
        window.electronAPI?.getAfcFileBase64({ udid, remotePath: photo.path })
          .then(b64 => {
            if (b64) setSrc(`data:image/jpeg;base64,${b64}`)
          })
      }
    }, { rootMargin: '200px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [photo.path, udid])

  return (
    <div ref={ref} className="wia-thumb">
      {src
        ? <img src={src} alt={photo.name} className="wia-thumb-img" />
        : <div className="wia-thumb-placeholder"><ImageIcon size={22} strokeWidth={1.5} /></div>
      }
    </div>
  )
}

export default function WiaPhotoSelect({ deviceId, onConfirm, onCancel }) {
  const [photos, setPhotos]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [selected, setSelected] = useState(new Set())

  useEffect(() => {
    load()
  }, [deviceId])

  const load = async () => {
    setLoading(true)
    setError(null)
    const list = await window.electronAPI?.listWiaPhotos(deviceId)
    setLoading(false)
    if (!list) {
      setError('No response from iPhone. Make sure the phone is unlocked and you tapped "Trust".')
      return
    }
    if (list.error) {
      setError(list.error)
      return
    }
    if (!Array.isArray(list) || list.length === 0) {
      setError('No photos found on this device. Make sure the phone is unlocked.')
      return
    }
    setPhotos(list)
    // Select all by default — use path as key (unique AFC path)
    setSelected(new Set(list.map(p => p.path || p.name)))
  }

  const key = (p) => p.path || p.name

  const toggle = (p) => {
    setSelected(s => {
      const n = new Set(s)
      n.has(key(p)) ? n.delete(key(p)) : n.add(key(p))
      return n
    })
  }

  const toggleAll = () => {
    if (selected.size === photos.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(photos.map(key)))
    }
  }

  const totalSelectedBytes = photos
    .filter(p => selected.has(key(p)))
    .reduce((s, p) => s + (p.size || 0), 0)

  if (loading) {
    return (
      <div className="wia-loading">
        <div className="wia-spinner" />
        <p>Reading photos from iPhone...</p>
        <p className="wia-hint">This may take a moment for large libraries.</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="wia-error">
        <p>{error}</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-ghost" onClick={load}>Try Again</button>
          <button className="btn btn-ghost" onClick={onCancel}>Back</button>
        </div>
      </div>
    )
  }

  return (
    <div className="wia-select">
      <div className="wia-toolbar">
        <button className="wia-select-all" onClick={toggleAll}>
          {selected.size === photos.length ? 'Deselect All' : 'Select All'}
        </button>
        <span className="wia-count">
          {selected.size} of {photos.length} selected
          {totalSelectedBytes > 0 && ` · ${formatBytes(totalSelectedBytes)}`}
        </span>
        <button className="btn btn-ghost wia-back-btn" onClick={onCancel}><ArrowLeft size={14} style={{verticalAlign:'middle', marginRight:4}} />Back</button>
      </div>

      <div className="wia-grid">
        {photos.map(photo => {
          const isSelected = selected.has(key(photo))
          return (
            <div
              key={key(photo)}
              className={`wia-item ${isSelected ? 'selected' : ''}`}
              onClick={() => toggle(photo)}
            >
              <div className="wia-item-check">{isSelected ? <Check size={10} /> : ''}</div>
              <ThumbImg udid={deviceId} photo={photo} />
              <div className="wia-item-name">{photo.name}</div>
              <div className="wia-item-meta">
                {formatDate(photo.date)}{photo.size ? ` · ${formatBytes(photo.size)}` : ''}
              </div>
            </div>
          )
        })}
      </div>

      <div className="wia-footer">
        <button
          className="btn btn-primary"
          onClick={() => onConfirm([...selected])}
          disabled={selected.size === 0}
        >
          Import {selected.size} photo{selected.size !== 1 ? 's' : ''} <ArrowRight size={15} style={{verticalAlign:'middle', marginLeft:4}} />
        </button>
      </div>
    </div>
  )
}
