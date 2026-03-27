import React, { useState, useEffect } from 'react'
import { CheckCircle, Trash2, Check } from 'lucide-react'
import './FinalReview.css'

function HeicSafeImg({ path, alt, className }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    const ext = path.split('.').pop().toLowerCase()
    if (ext === 'heic' || ext === 'heif') {
      window.electronAPI?.readImageBase64(path).then(b64 => {
        if (b64) setSrc(`data:image/jpeg;base64,${b64}`)
      })
    } else {
      setSrc(`file://${path.replace(/\\/g, '/')}`)
    }
  }, [path])
  return src ? <img src={src} alt={alt} className={className} /> : null
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

export default function FinalReview({ photos, folderPath, onDone }) {
  const toDelete = photos.filter(p => p.decision === 'delete')
  const [rescued, setRescued] = useState(new Set())
  const [mode, setMode] = useState(null)
  const [status, setStatus] = useState(null) // null | 'running' | 'done' | 'error'
  const [errorMsg, setErrorMsg] = useState('')

  const finalDelete = toDelete.filter(p => !rescued.has(p.name))
  const totalBytes = finalDelete.reduce((s, p) => s + p.size, 0)

  const toggleRescue = (name) => {
    setRescued(r => {
      const next = new Set(r)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const execute = async () => {
    if (finalDelete.length === 0) { onDone(); return }
    setStatus('running')

    try {
      // Write log first
      await window.electronAPI?.writeDeletionLog({
        folderPath,
        deletedPhotos: finalDelete
      })

      const paths = finalDelete.map(p => p.path)
      let result

      if (mode === 'trash') {
        result = await window.electronAPI?.trashItems(paths)
      } else {
        result = await window.electronAPI?.deleteItems(paths)
      }

      if (result?.success) {
        setStatus('done')
      } else {
        setErrorMsg(result?.errors?.map(e => e.error).join(', ') || 'Unknown error')
        setStatus('error')
      }
    } catch (e) {
      setErrorMsg(e.message)
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <div className="final-done">
        <div className="final-done-card">
          <CheckCircle size={56} color="#4ade80" />
          <h2>{finalDelete.length} photos deleted</h2>
          <p className="final-done-sub">{formatBytes(totalBytes)} freed • deletion_log.json saved</p>
          <button className="btn btn-primary" onClick={onDone}>Start New Session</button>
        </div>
      </div>
    )
  }

  return (
    <div className="final-review">
      <div className="final-header">
        <h2>Final Review</h2>
        <div className="final-summary">
          <span className="final-count">{finalDelete.length} photos</span>
          <span className="final-bytes">{formatBytes(totalBytes)} to free</span>
        </div>
      </div>

      {toDelete.length === 0 ? (
        <div className="final-empty">
          <p>No photos marked for deletion.</p>
          <button className="btn btn-primary" onClick={onDone}>Back to Start</button>
        </div>
      ) : (
        <>
          <div className="final-grid">
            {toDelete.map(photo => {
              const isRescued = rescued.has(photo.name)
              return (
                <div
                  key={photo.name}
                  className={`final-thumb ${isRescued ? 'rescued' : ''}`}
                  onClick={() => toggleRescue(photo.name)}
                  title={isRescued ? 'Click to re-mark for deletion' : 'Click to rescue'}
                >
                  <div className="final-thumb-img-wrap">
                    <HeicSafeImg path={photo.path} alt={photo.name} className="final-thumb-img" />
                    {isRescued && <div className="rescued-overlay"><Check size={12} style={{verticalAlign:'middle', marginRight:3}} />Rescued</div>}
                  </div>
                  <div className="final-thumb-info">
                    <span className="final-thumb-name">{photo.name}</span>
                    <span className="final-thumb-reason">{photo.analysis?.reason || ''}</span>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="final-actions">
            {rescued.size > 0 && (
              <p className="final-rescued-note">{rescued.size} photo(s) rescued from deletion</p>
            )}

            {status !== 'running' && (
              <div className="final-btn-row">
                <button
                  className="btn btn-danger"
                  onClick={() => { setMode('trash'); execute() }}
                  disabled={status === 'running'}
                >
                  <Trash2 size={15} style={{verticalAlign:'middle', marginRight:6}} />Move {finalDelete.length} photo{finalDelete.length !== 1 ? 's' : ''} to Trash
                </button>
              </div>
            )}

            {status === 'running' && (
              <div className="final-running">Deleting files...</div>
            )}

            {status === 'error' && (
              <div className="final-error">Error: {errorMsg}</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
