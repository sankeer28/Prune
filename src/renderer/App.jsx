import React, { useState, useEffect } from 'react'
import SetupScreen from './components/SetupScreen.jsx'
import ReviewScreen from './components/ReviewScreen.jsx'
import FinalReview from './components/FinalReview.jsx'
import Settings from './components/Settings.jsx'
import OllamaStatus from './components/OllamaStatus.jsx'
import { Settings2, Minus, Square, X, Maximize2 } from 'lucide-react'
import './App.css'
import iconUrl from '../../assets/icon.svg'

function WindowControls() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.electronAPI?.windowIsMaximized().then(v => setMaximized(v ?? false))
    const cleanup = window.electronAPI?.onWindowMaximized(setMaximized)
    return () => cleanup?.()
  }, [])

  return (
    <div className="win-controls">
      <button
        className="win-btn win-btn-min"
        onClick={() => window.electronAPI?.windowMinimize()}
        title="Minimize"
      >
        <Minus size={16} strokeWidth={2} />
      </button>
      <button
        className="win-btn win-btn-max"
        onClick={() => window.electronAPI?.windowMaximize()}
        title={maximized ? 'Restore' : 'Maximize'}
      >
        {maximized ? <Square size={14} strokeWidth={2} /> : <Maximize2 size={14} strokeWidth={2} />}
      </button>
      <button
        className="win-btn win-btn-close"
        onClick={() => window.electronAPI?.windowClose()}
        title="Close"
      >
        <X size={16} strokeWidth={2} />
      </button>
    </div>
  )
}

export default function App() {
  const [screen, setScreen] = useState('setup') // setup | review | final
  const [settingsReturnScreen, setSettingsReturnScreen] = useState('setup')
  const [photos, setPhotos] = useState([])
  const [folderPath, setFolderPath] = useState(null)
  const [settings, setSettings] = useState({
    model: 'moondream2',
    showAiOverlay: true,
    strictness: 'balanced'
  })

  useEffect(() => {
    window.electronAPI?.getSettings().then(s => {
      if (s) setSettings(s)
    })
  }, [])

  const handleAnalysisComplete = (analyzedPhotos, folder) => {
    setPhotos(analyzedPhotos)
    setFolderPath(folder)
    setScreen('review')
  }

  const handleReviewComplete = (reviewedPhotos) => {
    setPhotos(reviewedPhotos)
    setScreen('final')
  }

  const handleDeletionDone = () => {
    setPhotos([])
    setFolderPath(null)
    setScreen('setup')
  }

  const handleSaveSettings = async (newSettings) => {
    setSettings(newSettings)
    await window.electronAPI?.saveSettings(newSettings)
  }

  const openSettings = () => {
    setSettingsReturnScreen(screen)
    setScreen('settings')
  }

  const closeSettings = () => {
    setScreen(settingsReturnScreen === 'settings' ? 'setup' : settingsReturnScreen)
  }

  const handleSettingsIconClick = () => {
    if (screen === 'settings') {
      closeSettings()
      return
    }
    openSettings()
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-left">
          <span className="app-logo">
            <img src={iconUrl} alt="" className="app-logo-icon" />
            <span>Prune</span>
          </span>
          {screen !== 'setup' && (
            <span className="app-breadcrumb">
              {screen === 'review' ? 'Reviewing' : screen === 'final' ? 'Final Review' : 'Settings'}
            </span>
          )}
        </div>
        <div className="app-header-right">
          <OllamaStatus />
          <button
            className="icon-btn"
            onClick={handleSettingsIconClick}
            title={screen === 'settings' ? 'Back' : 'Settings'}
          >
            <Settings2 size={20} />
          </button>
        </div>
        <WindowControls />
      </header>

      <main className="app-main">
        {screen === 'setup' && (
          <SetupScreen
            settings={settings}
            onComplete={handleAnalysisComplete}
          />
        )}
        {screen === 'review' && (
          <ReviewScreen
            photos={photos}
            settings={settings}
            onComplete={handleReviewComplete}
            onCancel={() => { setPhotos([]); setFolderPath(null); setScreen('setup') }}
          />
        )}
        {screen === 'final' && (
          <FinalReview
            photos={photos}
            folderPath={folderPath}
            onDone={handleDeletionDone}
          />
        )}
        {screen === 'settings' && (
          <Settings
            settings={settings}
            onSave={handleSaveSettings}
            onClose={closeSettings}
            asPage
          />
        )}
      </main>
    </div>
  )
}
