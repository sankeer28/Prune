import React, { useState, useEffect, useRef } from 'react'
import { analyzePhoto } from '../../utils/analyzePhoto.js'
import WiaPhotoSelect from './WiaPhotoSelect.jsx'
import { Smartphone, HardDrive, AlertTriangle, Camera, Check, Folder, RefreshCw, ArrowRight, Image as ImageIcon, LayoutGrid, Expand, X, ZoomIn, ZoomOut, RotateCw } from 'lucide-react'
import './SetupScreen.css'

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

// ── Lazy local thumbnail ───────────────────────────────────────────────────────
function LocalThumbImg({ photo, onOpenPreview }) {
  const [src, setSrc] = useState(null)
  const ref = useRef()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let alive = true
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        obs.disconnect()
        window.electronAPI?.readImageThumbBase64(photo.path).then(b64 => {
          if (alive && b64) setSrc(`data:image/jpeg;base64,${b64}`)
        })
      }
    }, { rootMargin: '200px' })
    obs.observe(el)
    return () => {
      alive = false
      obs.disconnect()
    }
  }, [photo.path])

  return (
    <div ref={ref} className="folder-thumb">
      <button
        className="folder-preview-btn"
        onClick={(e) => {
          e.stopPropagation()
          onOpenPreview(photo)
        }}
        title="Open full-size preview"
      >
        <Expand size={12} />
      </button>
      {src
        ? <img src={src} alt={photo.name} className="folder-thumb-img" />
        : <div className="folder-thumb-placeholder"><ImageIcon size={20} strokeWidth={1.5} /></div>
      }
    </div>
  )
}

// ── Import Tab ────────────────────────────────────────────────────────────────
function ImportTab({ onImported }) {
  const [scanning, setScanning]       = useState(true)
  const [devices, setDevices]         = useState([])
  const [selectedDevice, setSelectedDevice] = useState(null)
  const [browsingFolders, setBrowsingFolders] = useState(false)
  const [photoFolders, setPhotoFolders]   = useState(null)
  const [sourceFolder, setSourceFolder]   = useState(null)
  const [selectedWiaNames, setSelectedWiaNames] = useState(null) // null = not picked yet
  const [showWiaPicker, setShowWiaPicker] = useState(false)
  const [destFolder, setDestFolder]       = useState(null)
  const [importing, setImporting]         = useState(false)
  const [importProgress, setImportProgress] = useState(null)
  const [importError, setImportError]     = useState(null)

  const scan = async () => {
    setScanning(true)
    setDevices([])
    setSelectedDevice(null)
    setPhotoFolders(null)
    setSourceFolder(null)
    const list = await window.electronAPI?.listAllStorage()
    setDevices(list || [])
    setScanning(false)
  }

  useEffect(() => { scan() }, [])

  const selectDevice = async (device) => {
    if (device.type === 'pnp-only') return // not accessible yet
    setSelectedDevice(device)
    setPhotoFolders(null)
    setSourceFolder(null)

    if (device.type === 'iphone') {
      setPhotoFolders([])
      setSourceFolder(device.path)
      setSelectedWiaNames(null)
      setShowWiaPicker(true)
    } else if (device.type === 'mtp') {
      setBrowsingFolders(true)
      const folders = await window.electronAPI?.browseMtpFolders(device.path)
      setBrowsingFolders(false)
      setPhotoFolders(folders || [])
    } else {
      setPhotoFolders([])
    }
  }

  const handleBrowseSource = async () => {
    const p = await window.electronAPI?.selectFolder()
    if (p) setSourceFolder(p)
  }

  const handleBrowseDest = async () => {
    const p = await window.electronAPI?.selectFolder()
    if (p) setDestFolder(p)
  }

  const handleImport = async () => {
    if (!sourceFolder || !destFolder) return
    setImporting(true)
    setImportError(null)
    setImportProgress({ current: 0, total: 0, file: 'Starting...' })

    const cleanup = window.electronAPI?.onImportProgress((data) => {
      setImportProgress(data)
    })

    let result
    if (selectedDevice?.type === 'iphone') {
      result = await window.electronAPI?.importSelectedWia({
        deviceId: sourceFolder,
        selectedNames: selectedWiaNames, // these are AFC remote paths
        destPath: destFolder
      })
    } else if (selectedDevice?.type === 'mtp') {
      result = await window.electronAPI?.importFromMtp({ sourcePath: sourceFolder, destPath: destFolder })
    } else {
      result = await window.electronAPI?.importPhotos({ sourcePath: sourceFolder, destPath: destFolder })
    }

    cleanup?.()
    setImporting(false)

    if (result?.success) {
      onImported(destFolder)
    } else {
      setImportError(result?.error || 'Import failed')
    }
  }

  const pct = importProgress?.total > 0
    ? (importProgress.current / importProgress.total * 100)
    : 30 // indeterminate pulse

  // WIA photo picker shown as overlay over the import pane
  if (showWiaPicker) {
    return (
      <WiaPhotoSelect
        deviceId={selectedDevice.path}
        onCancel={() => { setShowWiaPicker(false); setSelectedDevice(null) }}
        onConfirm={(names) => {
          setSelectedWiaNames(names)
          setShowWiaPicker(false)
        }}
      />
    )
  }

  return (
    <div className="import-pane">
      {/* Step 1: Device */}
      <div className="import-step">
        <div className="import-step-head">
          <span className="import-step-num">1</span>
          <span>Select your device</span>
          <button className="link-btn" onClick={scan} disabled={scanning} style={{ marginLeft: 'auto' }}>
            {scanning ? <><div className="import-spinner import-spinner-sm" style={{display:'inline-block', marginRight:6, verticalAlign:'middle'}} />Scanning</> : <><RefreshCw size={13} style={{verticalAlign:'middle', marginRight:4}} />Refresh</>}
          </button>
        </div>

        {!scanning && devices.length === 0 && (
          <div className="import-empty-devices">
            <p>No external drives or phones detected.</p>
            <p className="import-hint">
              Connect your phone via USB and set it to <strong>File Transfer</strong> mode,
              then click Refresh.
            </p>
          </div>
        )}

        {!scanning && devices.length > 0 && (
          <div className="device-list">
            {devices.map((d, i) => {
              const icon = d.type === 'iphone' ? <Smartphone size={18} /> : d.type === 'mtp' ? <Smartphone size={18} /> : d.type === 'pnp-only' ? <AlertTriangle size={18} /> : <HardDrive size={18} />
              const sub  = d.type === 'iphone' ? 'iPhone — ready to import' :
                           d.type === 'mtp' ? 'Android / MTP' :
                           d.type === 'pnp-only' ? 'Unlock phone & tap Trust, then Refresh' :
                           d.path
              const locked = d.type === 'pnp-only'
              return (
                <button
                  key={i}
                  className={`device-btn ${selectedDevice?.path === d.path ? 'active' : ''} ${locked ? 'locked' : ''}`}
                  onClick={() => selectDevice(d)}
                  disabled={locked}
                >
                  <span className="device-icon">{icon}</span>
                  <div className="device-info">
                    <span className="device-name">{d.label}</span>
                    <span className="device-path">{sub}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Step 2: Photo folder within device (skip for iPhone — uses picker) */}
      {selectedDevice && selectedDevice.type !== 'iphone' && (
        <div className="import-step">
          <div className="import-step-head">
            <span className="import-step-num">2</span>
            <span>Select photo folder</span>
          </div>

          {browsingFolders && (
            <div className="import-scanning">
              <div className="import-spinner" />
              <span>Scanning for photo folders...</span>
            </div>
          )}

          {!browsingFolders && photoFolders !== null && (
            <>
              {photoFolders.length > 0 && (
                <div className="folder-list">
                  {photoFolders.map(f => (
                    <button
                      key={f.path}
                      className={`folder-pick-btn ${sourceFolder === f.path ? 'active' : ''}`}
                      onClick={() => setSourceFolder(f.path)}
                    >
                      <Camera size={13} style={{verticalAlign:'middle', marginRight:6}} />{f.name}
                    </button>
                  ))}
                </div>
              )}

              {photoFolders.length === 0 && selectedDevice.type === 'mtp' && (
                <p className="import-hint">No DCIM/Camera folder auto-detected. Browse manually:</p>
              )}

              <button className="btn btn-ghost" onClick={handleBrowseSource} style={{ fontSize: 13 }}>
                {sourceFolder ? <><Check size={13} style={{verticalAlign:'middle', marginRight:4}} />{sourceFolder}</> : 'Browse to folder...'}
              </button>
            </>
          )}
        </div>
      )}

      {/* WIA: show selected photo summary + re-pick button */}
      {selectedDevice?.type === 'wia' && selectedWiaNames && (
        <div className="import-step">
          <div className="import-step-head">
            <span className="import-step-num">2</span>
            <span>{selectedWiaNames.length} photo{selectedWiaNames.length !== 1 ? 's' : ''} selected</span>
            <button className="link-btn" style={{ marginLeft: 'auto' }} onClick={() => setShowWiaPicker(true)}>
              Change selection
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Destination */}
      {(sourceFolder && (selectedDevice?.type !== 'iphone' || selectedWiaNames)) && (
        <div className="import-step">
          <div className="import-step-head">
            <span className="import-step-num">3</span>
            <span>Copy photos to</span>
          </div>
          <button className="btn btn-ghost" onClick={handleBrowseDest} style={{ fontSize: 13 }}>
            {destFolder ? <><Check size={13} style={{verticalAlign:'middle', marginRight:4}} />{destFolder}</> : 'Choose destination folder...'}
          </button>
        </div>
      )}

      {/* Import button + progress */}
      {sourceFolder && destFolder && (selectedDevice?.type !== 'iphone' || selectedWiaNames) && (
        <div className="import-step">
          {importing ? (
            <div className="progress-section">
              <div className="progress-label">
                {importProgress?.total > 0
                  ? `Copying ${importProgress.current} of ${importProgress.total}...`
                  : 'Preparing...'}
                <span className="progress-file">{importProgress?.file}</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: pct + '%', transition: 'width 0.4s' }} />
              </div>
            </div>
          ) : (
            <button className="btn btn-primary" onClick={handleImport}>
              Import Photos <ArrowRight size={15} style={{verticalAlign:'middle', marginLeft:4}} />
            </button>
          )}

          {importError && (
            <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 8 }}>
              Error: {importError}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main SetupScreen ──────────────────────────────────────────────────────────
export default function SetupScreen({ settings, onComplete }) {
  const [folder, setFolder]     = useState(null)
  const [photos, setPhotos]     = useState([])
  const [totalSize, setTotalSize] = useState(0)
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, file: '' })
  const [ollamaOk, setOllamaOk] = useState(true)
  const [modelReady, setModelReady] = useState(true)
  const [pulling, setPulling] = useState(false)
  const [pullStatus, setPullStatus] = useState('')
  const [pullPct, setPullPct] = useState(0)
  const [activeTab, setActiveTab] = useState('folder')
  const [showPhotoGrid, setShowPhotoGrid] = useState(false)
  const [selectedPhotoSet, setSelectedPhotoSet] = useState(new Set())
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
  const abortRef = useRef(false)

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
        setPreviewScale(1)
        setPreviewRotate(0)
        setPreviewOffset({ x: 0, y: 0 })
        setPreviewMode('fit')
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

  useEffect(() => {
    checkOllama()
  }, [settings.model])

  const checkOllama = async () => {
    try {
      const r = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(3000) })
      if (!r.ok) { setOllamaOk(false); return }
      setOllamaOk(true)
      const data = await r.json()
      const installed = (data.models || []).map(m => m.name.split(':')[0])
      const wantedBase = settings.model.split(':')[0]
      setModelReady(installed.includes(wantedBase))
    } catch {
      setOllamaOk(false)
    }
  }

  const handlePullModel = async () => {
    setPulling(true)
    setPullStatus('Starting download...')
    setPullPct(0)
    try {
      const r = await fetch('http://localhost:11434/api/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: settings.model, stream: true })
      })
      const reader = r.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop()
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const obj = JSON.parse(line)
            if (obj.total && obj.completed) {
              const pct = Math.round(obj.completed / obj.total * 100)
              setPullPct(pct)
              setPullStatus(`Downloading model... ${pct}%`)
            } else if (obj.status) {
              setPullStatus(obj.status.charAt(0).toUpperCase() + obj.status.slice(1))
            }
          } catch {}
        }
      }
      setModelReady(true)
      setPullStatus('')
    } catch (e) {
      setPullStatus('Download failed: ' + e.message)
    } finally {
      setPulling(false)
    }
  }

  const loadFolder = async (p) => {
    setFolder(p)
    const result = await window.electronAPI?.loadPhotos(p)
    if (result?.error) { alert(result.error); return }
    setPhotos(result)
    setTotalSize(result.reduce((s, ph) => s + ph.size, 0))
    setSelectedPhotoSet(new Set(result.map(ph => ph.path)))
    setShowPhotoGrid(false)
    setActiveTab('folder')
  }

  const handleSelectFolder = async () => {
    const p = await window.electronAPI?.selectFolder()
    if (p) loadFolder(p)
  }

  const toggleFolderPhoto = (path) => {
    setSelectedPhotoSet(s => {
      const next = new Set(s)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }

  const toggleAllFolderPhotos = () => {
    if (selectedPhotoSet.size === photos.length) {
      setSelectedPhotoSet(new Set())
    } else {
      setSelectedPhotoSet(new Set(photos.map(p => p.path)))
    }
  }

  const photosToReview = photos.filter(p => selectedPhotoSet.has(p.path))

  const openFolderPreview = async (photo) => {
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
      const ext = photo.path.split('.').pop().toLowerCase()
      if (ext === 'heic' || ext === 'heif') {
        const b64 = await window.electronAPI?.readImageBase64(photo.path)
        if (!b64) throw new Error('Could not load preview')
        setPreviewSrc(`data:image/jpeg;base64,${b64}`)
      } else {
        setPreviewSrc(`file://${photo.path.replace(/\\/g, '/')}`)
      }
    } catch {
      setPreviewError('Could not load full-size preview')
    } finally {
      setPreviewLoading(false)
    }
  }

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

  const handleStartAnalysis = async () => {
    setAnalyzing(true)
    abortRef.current = false
    const results = []

    for (let i = 0; i < photosToReview.length; i++) {
      if (abortRef.current) break
      const photo = photosToReview[i]
      setProgress({ current: i + 1, total: photosToReview.length, file: photo.name })
      const base64   = await window.electronAPI?.readImageBase64(photo.path)
      const analysis = base64 ? await analyzePhoto(photo.path, base64, settings) : null
      results.push({ ...photo, analysis })
    }

    setAnalyzing(false)
    if (!abortRef.current) onComplete(results, folder)
  }

  const handleSkipAnalysis = () => {
    onComplete(photosToReview.map(p => ({
      ...p,
      analysis: { recommendation: 'review', reason: 'Not analyzed', quality_score: 5, category: 'other', people_count: 0, issues: [] }
    })), folder)
  }

  const pct = progress.total > 0 ? (progress.current / progress.total) * 100 : 0

  const isSubset = selectedPhotoSet.size < photos.length && selectedPhotoSet.size > 0

  return (
    <div className="setup">
      <div className="setup-center">
        <h1 className="setup-title">
          <img src="/assets/icon.svg" alt="" style={{ width: 48, height: 48, verticalAlign: 'middle', marginRight: 10 }} />
          Prune
        </h1>
        <p className="setup-subtitle">AI-powered photo culling. Keep the best, delete the rest.</p>

        {!ollamaOk && (
          <div className="warning-banner">
            <span><AlertTriangle size={14} style={{verticalAlign:'middle', marginRight:6}} />Ollama not detected — make sure it's running</span>
            <button onClick={() => window.electronAPI?.openExternal('https://ollama.com')} className="link-btn">
              ollama.com ↗
            </button>
          </div>
        )}

        {ollamaOk && !modelReady && !pulling && (
          <div className="model-download-banner">
            <span>Model <strong>{settings.model}</strong> is not installed</span>
            <button className="btn btn-primary" style={{ fontSize: 12, padding: '5px 14px' }} onClick={handlePullModel}>
              Download model
            </button>
          </div>
        )}

        {pulling && (
          <div className="model-download-banner">
            <div style={{ fontSize: 13, marginBottom: 6 }}>
              <span>{pullStatus}</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: (pullPct || 5) + '%', transition: 'width 0.4s' }} />
            </div>
          </div>
        )}

        <div className="tab-bar">
          <button className={`tab-btn ${activeTab === 'folder' ? 'active' : ''}`} onClick={() => setActiveTab('folder')}>
            Open Folder
          </button>
          <button className={`tab-btn ${activeTab === 'import' ? 'active' : ''}`} onClick={() => setActiveTab('import')}>
            Import from Phone
          </button>
        </div>

        {activeTab === 'folder' && (
          <div className="setup-card">
            <button className="btn btn-ghost folder-btn" onClick={handleSelectFolder}>
              <Folder size={16} />
              {folder ? folder : 'Select Photo Folder'}
            </button>

            {photos.length > 0 && (
              <div className="folder-stats">
                <div className="stat">
                  <span className="stat-value">{photos.length}</span>
                  <span className="stat-label">Photos</span>
                </div>
                <div className="stat-divider" />
                <div className="stat">
                  <span className="stat-value">{formatBytes(totalSize)}</span>
                  <span className="stat-label">Total size</span>
                </div>
              </div>
            )}

            {photos.length > 0 && (
              <div className="folder-grid-toggle-row">
                <button
                  className={`folder-grid-toggle-btn ${showPhotoGrid ? 'active' : ''}`}
                  onClick={() => setShowPhotoGrid(s => !s)}
                >
                  <LayoutGrid size={13} />
                  {showPhotoGrid ? 'Hide preview' : 'Preview & select photos'}
                </button>
                {isSubset && (
                  <span className="folder-selection-note">
                    {selectedPhotoSet.size} of {photos.length} selected
                  </span>
                )}
              </div>
            )}

            {photos.length > 0 && showPhotoGrid && (
              <div className="folder-photo-select">
                <div className="folder-photo-toolbar">
                  <button className="wia-select-all" onClick={toggleAllFolderPhotos}>
                    {selectedPhotoSet.size === photos.length ? 'Deselect All' : 'Select All'}
                  </button>
                  <span className="wia-count">
                    {selectedPhotoSet.size} of {photos.length} selected
                  </span>
                </div>
                <div className="folder-photo-grid">
                  {photos.map(photo => {
                    const isSelected = selectedPhotoSet.has(photo.path)
                    return (
                      <div
                        key={photo.path}
                        className={`wia-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => toggleFolderPhoto(photo.path)}
                      >
                        <div className="wia-item-check">{isSelected ? <Check size={10} /> : ''}</div>
                        <LocalThumbImg photo={photo} onOpenPreview={openFolderPreview} />
                        <div className="wia-item-name">{photo.name}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {analyzing && (
              <div className="progress-section">
                <div className="progress-label">
                  Analyzing {progress.current} of {progress.total}...
                  <span className="progress-file">{progress.file}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: pct + '%' }} />
                </div>
                <button className="link-btn" onClick={() => { abortRef.current = true }}>Cancel</button>
              </div>
            )}

            {!analyzing && photosToReview.length > 0 && (
              <div className="setup-actions">
                <button className="btn btn-primary" onClick={handleStartAnalysis} disabled={!ollamaOk || !modelReady || pulling}>
                  {!ollamaOk
                    ? <><AlertTriangle size={14} style={{verticalAlign:'middle', marginRight:4}} />Ollama Offline</>
                    : !modelReady
                      ? <><AlertTriangle size={14} style={{verticalAlign:'middle', marginRight:4}} />Model not downloaded</>
                      : isSubset
                        ? `Analyze ${photosToReview.length} photos with AI`
                        : `Analyze with AI (${settings.model})`
                  }
                </button>
                <button className="btn btn-ghost" onClick={handleSkipAnalysis}>
                  Skip AI <ArrowRight size={14} style={{verticalAlign:'middle', marginLeft:4}} /> Review manually
                </button>
              </div>
            )}

            {!analyzing && photosToReview.length === 0 && photos.length > 0 && (
              <p className="folder-none-selected">No photos selected — select at least one to continue.</p>
            )}
          </div>
        )}

        {activeTab === 'import' && (
          <div className="setup-card">
            <ImportTab onImported={loadFolder} />
          </div>
        )}

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
    </div>
  )
}
