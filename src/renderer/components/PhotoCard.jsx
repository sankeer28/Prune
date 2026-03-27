import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import AnalysisBadge from './AnalysisBadge.jsx'

export default function PhotoCard({ photo, decision, showOverlay, onSwipe }) {
  const [imgSrc, setImgSrc] = useState(null)

  useEffect(() => {
    if (!photo) return
    setImgSrc(`file://${photo.path.replace(/\\/g, '/')}`)
  }, [photo])

  if (!photo) return null

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
      {imgSrc && (
        <img
          src={imgSrc}
          alt={photo.name}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            borderRadius: 8,
            display: 'block'
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
