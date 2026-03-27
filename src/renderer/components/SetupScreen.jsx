import React, { useState, useEffect, useRef } from 'react'
import { analyzePhoto } from '../../utils/analyzePhoto.js'
import WiaPhotoSelect from './WiaPhotoSelect.jsx'
import { Smartphone, HardDrive, AlertTriangle, Camera, Check, Folder, RefreshCw, ArrowRight } from 'lucide-react'
import './SetupScreen.css'

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

// ── Import Tab ────────────────────────────────────────────────────────────────
function ImportTab({ onImported }) {
  const [scanning, setScanning]       = useState(false)
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
  const abortRef = useRef(false)

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
    setActiveTab('folder')
  }

  const handleSelectFolder = async () => {
    const p = await window.electronAPI?.selectFolder()
    if (p) loadFolder(p)
  }

  const handleStartAnalysis = async () => {
    setAnalyzing(true)
    abortRef.current = false
    const results = []

    for (let i = 0; i < photos.length; i++) {
      if (abortRef.current) break
      const photo = photos[i]
      setProgress({ current: i + 1, total: photos.length, file: photo.name })
      const base64   = await window.electronAPI?.readImageBase64(photo.path)
      const analysis = base64 ? await analyzePhoto(photo.path, base64, settings) : null
      results.push({ ...photo, analysis })
    }

    setAnalyzing(false)
    if (!abortRef.current) onComplete(results, folder)
  }

  const handleSkipAnalysis = () => {
    onComplete(photos.map(p => ({
      ...p,
      analysis: { recommendation: 'review', reason: 'Not analyzed', quality_score: 5, category: 'other', people_count: 0, issues: [] }
    })), folder)
  }

  const pct = progress.total > 0 ? (progress.current / progress.total) * 100 : 0

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

            {!analyzing && photos.length > 0 && (
              <div className="setup-actions">
                <button className="btn btn-primary" onClick={handleStartAnalysis} disabled={!ollamaOk || !modelReady || pulling}>
                  {!ollamaOk ? <><AlertTriangle size={14} style={{verticalAlign:'middle', marginRight:4}} />Ollama Offline</> : !modelReady ? <><AlertTriangle size={14} style={{verticalAlign:'middle', marginRight:4}} />Model not downloaded</> : `Analyze with AI (${settings.model})`}
                </button>
                <button className="btn btn-ghost" onClick={handleSkipAnalysis}>
                  Skip AI <ArrowRight size={14} style={{verticalAlign:'middle', marginLeft:4}} /> Review manually
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'import' && (
          <div className="setup-card">
            <ImportTab onImported={loadFolder} />
          </div>
        )}
      </div>
    </div>
  )
}
