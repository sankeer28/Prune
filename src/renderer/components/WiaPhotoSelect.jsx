import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Image as ImageIcon, ArrowLeft, Check, ArrowRight, Expand, X, ZoomIn, ZoomOut, RotateCw, RefreshCw } from 'lucide-react'
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

// Priority thumbnail queue — visible items go to front
let inFlight = 0
const MAX_FLIGHT = 8
const thumbQueue = [] // { udid, remotePath, resolve, priority }

function flushQueue() {
  while (inFlight < MAX_FLIGHT && thumbQueue.length > 0) {
    const { udid, remotePath, fileSize, resolve } = thumbQueue.shift()
    inFlight++
    window.electronAPI?.getAfcFileBase64({ udid, remotePath, fileSize })
      .then(resolve)
      .finally(() => { inFlight--; flushQueue() })
  }
}

function queueThumb(udid, remotePath, fileSize, priority = false) {
  return new Promise(resolve => {
    const item = { udid, remotePath, fileSize, resolve }
    if (priority) thumbQueue.unshift(item)
    else thumbQueue.push(item)
    flushQueue()
  })
}

function ThumbImg({ udid, photo, onOpenPreview }) {
  const [src, setSrc] = useState(null)
  const ref = useRef()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let queued = false

    // Visible now → high priority (front of queue)
    const nearObs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !queued) {
        queued = true
        nearObs.disconnect()
        farObs.disconnect()
        queueThumb(udid, photo.path, photo.size, true).then(b64 => {
          if (b64) setSrc(`data:image/jpeg;base64,${b64}`)
        })
      }
    }, { rootMargin: '0px' })

    // Coming up soon → low priority (back of queue)
    const farObs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !queued) {
        queued = true
        farObs.disconnect()
        queueThumb(udid, photo.path, photo.size, false).then(b64 => {
          if (b64) setSrc(`data:image/jpeg;base64,${b64}`)
        })
      }
    }, { rootMargin: '300px' })

    nearObs.observe(el)
    farObs.observe(el)
    return () => { nearObs.disconnect(); farObs.disconnect() }
  }, [photo.path, udid])

  return (
    <div ref={ref} className="wia-thumb">
      <button
        className="wia-preview-btn"
        onClick={(e) => {
          e.stopPropagation()
          onOpenPreview(photo)
        }}
        title="Open full-size preview"
      >
        <Expand size={12} />
      </button>
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
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewName, setPreviewName] = useState('')
  const [previewSrc, setPreviewSrc] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [previewScale, setPreviewScale] = useState(1)
  const [previewRotate, setPreviewRotate] = useState(0)
  const [previewOffset, setPreviewOffset] = useState({ x: 0, y: 0 })
  const [previewMode, setPreviewMode] = useState('fit')
  const [previewDragging, setPreviewDragging] = useState(false)
  const previewDragStartRef = useRef(null)

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

  const openPreview = useCallback(async (photo) => {
    setPreviewOpen(true)
    setPreviewName(photo.name)
    setPreviewSrc(null)
    setPreviewError('')
    setPreviewScale(1)
    setPreviewRotate(0)
    setPreviewOffset({ x: 0, y: 0 })
    setPreviewMode('fit')
    setPreviewDragging(false)
    previewDragStartRef.current = null
    setPreviewLoading(true)
    try {
      const result = await window.electronAPI?.getAfcFileFullBase64({
        udid: deviceId,
        remotePath: photo.path,
        fileSize: photo.size
      })
      if (!result?.base64) throw new Error('Could not load preview')
      const mime = result.mime || 'image/jpeg'
      setPreviewSrc(`data:${mime};base64,${result.base64}`)
    } catch {
      setPreviewError('Could not load full-size preview')
    } finally {
      setPreviewLoading(false)
    }
  }, [deviceId])

  const canPreviewPan = previewMode === 'actual' || previewScale > 1.01

  const zoomPreviewBy = (delta) => {
    setPreviewScale(s => clamp(s + delta, 0.25, 5))
  }

  const resetPreviewTransform = () => {
    setPreviewScale(1)
    setPreviewRotate(0)
    setPreviewOffset({ x: 0, y: 0 })
    setPreviewMode('fit')
  }

  const togglePreviewMode = () => {
    setPreviewMode(mode => mode === 'fit' ? 'actual' : 'fit')
    setPreviewScale(1)
    setPreviewOffset({ x: 0, y: 0 })
  }

  const handlePreviewWheel = (e) => {
    if (!previewSrc) return
    e.preventDefault()
    const step = e.deltaY < 0 ? 0.12 : -0.12
    setPreviewScale(s => clamp(s + step, 0.25, 5))
  }

  const handlePreviewMouseDown = (e) => {
    if (!canPreviewPan) return
    e.preventDefault()
    setPreviewDragging(true)
    previewDragStartRef.current = {
      x: e.clientX - previewOffset.x,
      y: e.clientY - previewOffset.y
    }
  }

  const handlePreviewMouseMove = (e) => {
    if (!previewDragging || !previewDragStartRef.current) return
    setPreviewOffset({
      x: e.clientX - previewDragStartRef.current.x,
      y: e.clientY - previewDragStartRef.current.y
    })
  }

  const stopPreviewDrag = () => {
    setPreviewDragging(false)
    previewDragStartRef.current = null
  }

  useEffect(() => {
    if (!previewOpen) return

    const onKey = (e) => {
      if (e.key === 'Escape') {
        setPreviewOpen(false)
        return
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        setPreviewScale(s => clamp(s + 0.15, 0.25, 5))
        return
      }
      if (e.key === '-') {
        e.preventDefault()
        setPreviewScale(s => clamp(s - 0.15, 0.25, 5))
        return
      }
      if (e.key === '0') {
        e.preventDefault()
        resetPreviewTransform()
        return
      }
      if (e.key.toLowerCase() === 'r') {
        e.preventDefault()
        setPreviewRotate(v => v + 90)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewOpen])

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
              <ThumbImg udid={deviceId} photo={photo} onOpenPreview={openPreview} />
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

      {previewOpen && (
        <div className="preview-modal-backdrop" onClick={() => setPreviewOpen(false)}>
          <div className="preview-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="preview-modal-header">
              <div className="preview-modal-title" title={previewName}>{previewName}</div>
              <div className="preview-modal-actions">
                <button className="preview-modal-icon-btn" onClick={() => zoomPreviewBy(-0.15)} title="Zoom out (-)">
                  <ZoomOut size={14} />
                </button>
                <span className="preview-zoom-readout">{Math.round(previewScale * 100)}%</span>
                <button className="preview-modal-icon-btn" onClick={() => zoomPreviewBy(0.15)} title="Zoom in (+)">
                  <ZoomIn size={14} />
                </button>
                <button className="preview-modal-mode-btn" onClick={togglePreviewMode} title="Toggle fit / actual size">
                  {previewMode === 'fit' ? '1:1' : 'Fit'}
                </button>
                <button className="preview-modal-icon-btn" onClick={() => setPreviewRotate(v => v + 90)} title="Rotate (R)">
                  <RotateCw size={14} />
                </button>
                <button className="preview-modal-icon-btn" onClick={resetPreviewTransform} title="Reset view (0)">
                  <RefreshCw size={14} />
                </button>
              </div>
              <button className="preview-modal-close" onClick={() => setPreviewOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="preview-modal-body">
              {previewLoading && <div className="preview-modal-loading">Loading full-size preview...</div>}
              {!previewLoading && previewError && <div className="preview-modal-error">{previewError}</div>}
              {previewSrc && !previewError && (
                <div
                  className="preview-modal-viewport"
                  onWheel={handlePreviewWheel}
                  onMouseMove={handlePreviewMouseMove}
                  onMouseUp={stopPreviewDrag}
                  onMouseLeave={stopPreviewDrag}
                >
                  <img
                    src={previewSrc}
                    alt={previewName}
                    className={`preview-modal-image ${previewMode === 'actual' ? 'actual' : 'fit'}`}
                    onMouseDown={handlePreviewMouseDown}
                    draggable={false}
                    style={{
                      transform: `translate(${previewOffset.x}px, ${previewOffset.y}px) scale(${previewScale}) rotate(${previewRotate}deg)`,
                      cursor: canPreviewPan ? (previewDragging ? 'grabbing' : 'grab') : 'default'
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
