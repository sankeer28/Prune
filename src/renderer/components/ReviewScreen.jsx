import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import PhotoCard from './PhotoCard.jsx'
import SwipeControls from './SwipeControls.jsx'
import Sidebar from './Sidebar.jsx'
import './ReviewScreen.css'

export default function ReviewScreen({ photos, settings, onComplete, onCancel }) {
  const [index, setIndex] = useState(0)
  const [decisions, setDecisions] = useState({}) // name -> 'keep' | 'delete' | 'skip'
  const [history, setHistory] = useState([]) // stack of {name, decision, index}
  const [animDir, setAnimDir] = useState(null) // 'left' | 'right' | null
  const [isAnimating, setIsAnimating] = useState(false)

  const current = photos[index]
  const isLast = index >= photos.length

  const decide = useCallback((decision) => {
    if (isAnimating || !current) return

    setAnimDir(decision === 'delete' ? 'left' : decision === 'keep' ? 'right' : null)
    setIsAnimating(true)

    setHistory(h => [...h, { name: current.name, decision, index }])
    setDecisions(d => ({ ...d, [current.name]: decision }))

    setTimeout(() => {
      setIndex(i => i + 1)
      setAnimDir(null)
      setIsAnimating(false)
    }, decision === 'skip' ? 0 : 280)
  }, [current, index, isAnimating])

  const handleUndo = useCallback(() => {
    if (history.length === 0) return
    const last = history[history.length - 1]
    setHistory(h => h.slice(0, -1))
    setDecisions(d => {
      const next = { ...d }
      delete next[last.name]
      return next
    })
    setIndex(last.index)
  }, [history])

  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT') return
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') decide('delete')
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') decide('keep')
      else if (e.key === ' ') { e.preventDefault(); decide('skip') }
      else if (e.key === 'z' || e.key === 'Z') handleUndo()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [decide, handleUndo])

  if (isLast) {
    return (
      <div className="review-done">
        <div className="review-done-card">
          <h2>All photos reviewed!</h2>
          <p className="review-done-sub">
            {Object.values(decisions).filter(d => d === 'delete').length} marked for deletion,{' '}
            {Object.values(decisions).filter(d => d === 'keep').length} to keep
          </p>
          <button
            className="btn btn-primary"
            onClick={() => onComplete(photos.map(p => ({ ...p, decision: decisions[p.name] || 'skip' })))}
          >
            Proceed to Final Review →
          </button>
          <button className="btn btn-ghost" onClick={() => setIndex(0)}>
            Start Over
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="review-screen">
      <Sidebar photos={photos} decisions={decisions} onCancel={onCancel} />

      <div className="review-main">
        <div className="review-photo-area">
          <AnimatePresence mode="wait">
            <motion.div
              key={current?.name}
              initial={{ opacity: 0, x: animDir === 'left' ? 80 : animDir === 'right' ? -80 : 0 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{
                opacity: 0,
                x: animDir === 'left' ? -120 : animDir === 'right' ? 120 : 0,
                rotate: animDir === 'left' ? -4 : animDir === 'right' ? 4 : 0
              }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              style={{ width: '100%', height: '100%', position: 'absolute' }}
            >
              <PhotoCard
                photo={current}
                decision={decisions[current?.name]}
                showOverlay={settings.showAiOverlay}
              />
            </motion.div>
          </AnimatePresence>
        </div>

        <SwipeControls
          onDelete={() => decide('delete')}
          onKeep={() => decide('keep')}
          onSkip={() => decide('skip')}
          onUndo={handleUndo}
          current={index + 1}
          total={photos.length}
        />
      </div>
    </div>
  )
}
