import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ImageIcon } from 'lucide-react'
import AnalysisBadge from './AnalysisBadge.jsx'

export default function PhotoCard({ photo, decision, showOverlay, onSwipe }) {
  const [imgSrc, setImgSrc]     = useState(null)
  const [loaded, setLoaded]     = useState(false)
  const [errored, setErrored]   = useState(false)

  useEffect(() => {
    if (!photo) return
    setLoaded(false)
    setErrored(false)
    setImgSrc(`file://${photo.path.replace(/\\/g, '/')}`)
  }, [photo])

  if (!photo) return null

  const showSpinner = imgSrc && !loaded && !errored

  const tint = decision === 'delete'
    ? 'rgba(248,113,113,0.25)'
    : decision === 'keep'
      ? 'rgba(74,222,128,0.2)'
      : 'transparent'

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      {/* Loading state: spinner + image icon */}
      {showSpinner && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 16, color: 'rgba(255,255,255,0.25)'
        }}>
          <ImageIcon size={48} strokeWidth={1} />
          <div style={{
            width: 28, height: 28,
            border: '2px solid rgba(255,255,255,0.1)',
            borderTopColor: 'rgba(255,255,255,0.5)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }} />
        </div>
      )}

      {/* Error state */}
      {errored && (
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 10,
          color: 'rgba(255,255,255,0.2)'
        }}>
          <ImageIcon size={48} strokeWidth={1} />
          <span style={{ fontSize: 12 }}>Could not load image</span>
        </div>
      )}

      {imgSrc && (
        <img
          src={imgSrc}
          alt={photo.name}
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            borderRadius: 8,
            display: loaded ? 'block' : 'none'
          }}
          draggable={false}
        />
      )}

      {/* Color tint overlay for live decision feedback */}
      {tint !== 'transparent' && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: tint,
          borderRadius: 8,
          pointerEvents: 'none',
          transition: 'background 0.2s'
        }} />
      )}

      <AnalysisBadge
        recommendation={photo.analysis?.recommendation}
        reason={photo.analysis?.reason}
        category={photo.analysis?.category}
        quality_score={photo.analysis?.quality_score}
        visible={showOverlay && !!photo.analysis}
      />

      <div style={{
        position: 'absolute',
        bottom: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        fontSize: 11,
        color: 'rgba(255,255,255,0.55)',
        background: 'rgba(0,0,0,0.5)',
        padding: '3px 10px',
        borderRadius: 8,
        backdropFilter: 'blur(4px)',
        maxWidth: 'calc(100% - 32px)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
      }}>
        {photo.name}
      </div>
    </div>
  )
}
