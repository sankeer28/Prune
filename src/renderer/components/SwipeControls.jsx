import React from 'react'
import { Undo2, X, SkipForward, Check } from 'lucide-react'
import './SwipeControls.css'

export default function SwipeControls({ onDelete, onKeep, onSkip, onUndo, current, total }) {
  return (
    <div className="swipe-controls">
      <div className="swipe-progress">
        <span className="swipe-counter">{current} / {total}</span>
      </div>

      <div className="swipe-buttons">
        <button className="swipe-btn swipe-undo" onClick={onUndo} title="Undo (Z)">
          <Undo2 size={20} />
          <span className="swipe-label">Undo</span>
        </button>

        <button className="swipe-btn swipe-delete" onClick={onDelete} title="Delete (← or A)">
          <X size={20} />
          <span className="swipe-label">Delete</span>
        </button>

        <button className="swipe-btn swipe-skip" onClick={onSkip} title="Skip (Space)">
          <SkipForward size={20} />
          <span className="swipe-label">Skip</span>
        </button>

        <button className="swipe-btn swipe-keep" onClick={onKeep} title="Keep (→ or D)">
          <Check size={20} />
          <span className="swipe-label">Keep</span>
        </button>
      </div>

      <div className="swipe-hints">
        <span>← / A = delete</span>
        <span>Space = skip</span>
        <span>→ / D = keep</span>
        <span>Z = undo</span>
      </div>
    </div>
  )
}
