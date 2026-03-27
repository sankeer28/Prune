import React from 'react'

const CONFIG = {
  keep:   { emoji: '🟢', label: 'KEEP',   color: '#4ade80', bg: 'rgba(74, 222, 128, 0.15)' },
  delete: { emoji: '🔴', label: 'DELETE', color: '#f87171', bg: 'rgba(248, 113, 113, 0.15)' },
  review: { emoji: '🟡', label: 'REVIEW', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.15)' }
}

export default function AnalysisBadge({ recommendation, reason, category, quality_score, visible }) {
  if (!visible) return null
  const cfg = CONFIG[recommendation] || CONFIG.review

  return (
    <div style={{
      position: 'absolute',
      top: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
      zIndex: 10,
      pointerEvents: 'none'
    }}>
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: cfg.bg,
        border: `1px solid ${cfg.color}40`,
        borderRadius: 20,
        padding: '5px 14px',
        backdropFilter: 'blur(8px)'
      }}>
        <span style={{ fontSize: 12 }}>{cfg.emoji}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color, letterSpacing: 1 }}>{cfg.label}</span>
      </div>

      {category && (
        <div style={{
          background: 'rgba(0,0,0,0.6)',
          borderRadius: 12,
          padding: '3px 10px',
          fontSize: 11,
          color: '#ccc',
          backdropFilter: 'blur(8px)'
        }}>
          {category.replace('_', ' ')} · {quality_score}/10
        </div>
      )}

      {reason && (
        <div style={{
          background: 'rgba(0,0,0,0.65)',
          borderRadius: 8,
          padding: '4px 12px',
          fontSize: 12,
          color: '#ddd',
          maxWidth: 300,
          textAlign: 'center',
          lineHeight: 1.4,
          backdropFilter: 'blur(8px)'
        }}>
          {reason}
        </div>
      )}
    </div>
  )
}
