# Prune

AI-powered photo culling desktop app. Connect your phone or select a folder, let the AI sort the keepers from the junk, then review and delete in one pass.

## Features

- **AI analysis** via local [Ollama](https://ollama.com) — no cloud, no uploads
- **iPhone import** over USB — browse and select photos directly from your camera roll
- **Android / SD card import** via MTP or drive letter
- **Swipe to keep or delete** with keyboard shortcuts
- **Automatic model download** — pulls the AI model if it isn't installed yet

## Requirements

- [Node.js](https://nodejs.org) 18+
- [Ollama](https://ollama.com) running locally
- iTunes or Apple Mobile Device Support (for iPhone import on Windows)

## Setup

```bash
npm install
npm run dev
```

## Models

Prune works with any Ollama vision model. Recommended:

| Model | Size | Notes |
|---|---|---|
| `moondream2` | ~1.7 GB | Fast, good for culling |
| `llava-phi3` | ~2.9 GB | More accurate |
| `llava:7b` | ~4.7 GB | Best quality, slower |

If the model isn't installed, Prune will offer to download it automatically.

## iPhone Import

1. Connect iPhone via USB
2. Unlock the phone and tap **Trust** when prompted
3. Open the **Import from Phone / Card** tab
4. Select your iPhone from the device list
5. Pick which photos to import, then choose a destination folder

## Build

```bash
npm run build
```

Produces a Windows installer in `dist/`.

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `→` or `K` | Keep photo |
| `←` or `D` | Delete photo |
| `↑` or `R` | Mark for review |
