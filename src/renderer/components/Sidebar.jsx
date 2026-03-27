import React from 'react'
import { Trash2, Heart, SkipForward, ArrowLeft } from 'lucide-react'
import './Sidebar.css'

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

export default function Sidebar({ photos, decisions, onCancel }) {
  const total = photos.length
  const reviewed = Object.keys(decisions).length
  const remaining = total - reviewed

  const deleteCount = Object.values(decisions).filter(d => d === 'delete').length
  const keepCount = Object.values(decisions).filter(d => d === 'keep').length
  const skipCount = Object.values(decisions).filter(d => d === 'skip').length

  const deleteBytes = photos
    .filter(p => decisions[p.name] === 'delete')
    .reduce((s, p) => s + p.size, 0)

  // Category breakdown
  const categories = {}
  photos.forEach(p => {
    const cat = p.analysis?.category || 'other'
    categories[cat] = (categories[cat] || 0) + 1
  })
  const catEntries = Object.entries(categories).sort((a, b) => b[1] - a[1])
  const maxCat = Math.max(...catEntries.map(c => c[1]), 1)

  return (
    <div className="sidebar" style={{ justifyContent: 'space-between' }}>
      <div className="sidebar-section">
        <h3 className="sidebar-heading">Progress</h3>
        <div className="sidebar-stat">
          <span className="sidebar-stat-label">Reviewed</span>
          <span className="sidebar-stat-value">{reviewed} / {total}</span>
        </div>
        <div className="sidebar-progress-bar">
          <div className="sidebar-progress-fill" style={{ width: total ? (reviewed / total * 100) + '%' : 0 }} />
        </div>
        <div className="sidebar-stat">
          <span className="sidebar-stat-label">Remaining</span>
          <span className="sidebar-stat-value">{remaining}</span>
        </div>
      </div>

      <div className="sidebar-section">
        <h3 className="sidebar-heading">Decisions</h3>
        <div className="sidebar-decision-row delete">
          <span><Trash2 size={13} style={{verticalAlign:'middle', marginRight:6}} />Delete</span>
          <span className="sidebar-badge delete">{deleteCount}</span>
        </div>
        <div className="sidebar-decision-row keep">
          <span><Heart size={13} style={{verticalAlign:'middle', marginRight:6}} />Keep</span>
          <span className="sidebar-badge keep">{keepCount}</span>
        </div>
        <div className="sidebar-decision-row skip">
          <span><SkipForward size={13} style={{verticalAlign:'middle', marginRight:6}} />Skip</span>
          <span className="sidebar-badge">{skipCount}</span>
        </div>
      </div>

      {deleteBytes > 0 && (
        <div className="sidebar-section">
          <h3 className="sidebar-heading">To Free</h3>
          <div className="sidebar-big-stat">{formatBytes(deleteBytes)}</div>
        </div>
      )}

      {catEntries.length > 0 && (
        <div className="sidebar-section">
          <h3 className="sidebar-heading">Categories</h3>
          {catEntries.slice(0, 6).map(([cat, count]) => (
            <div key={cat} className="sidebar-cat-row">
              <span className="sidebar-cat-label">{cat.replace('_', ' ')}</span>
              <div className="sidebar-cat-bar">
                <div
                  className="sidebar-cat-fill"
                  style={{ width: (count / maxCat * 100) + '%' }}
                />
              </div>
              <span className="sidebar-cat-count">{count}</span>
            </div>
          ))}
        </div>
      )}
      <div className="sidebar-footer">
        <button className="sidebar-back-btn" onClick={onCancel}>
          <ArrowLeft size={14} style={{verticalAlign:'middle', marginRight:6}} />Back to Home
        </button>
      </div>
    </div>
  )
}
