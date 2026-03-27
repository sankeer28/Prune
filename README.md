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

Prune works with any Ollama vision model. If a model isn't installed, Prune will offer to download it automatically.

| Model | Size | Notes |
|---|---|---|
| `moondream` | 1.7 GB | Fastest — great for quick culling |
| `qwen2.5vl:3b` | 3.2 GB | Fast, very capable for its size |
| `llava-phi3` | 2.9 GB | Balanced speed & quality |
| `minicpm-v` | 5.5 GB | High quality, supports hi-res images |
| `llava:7b` | 4.7 GB | Solid all-rounder |
| `llava:13b` | 8.0 GB | Higher quality, needs 16 GB RAM |
| `qwen2.5vl:7b` | 6.0 GB | Excellent — beats GPT-4o-mini on many tasks |
| `llama3.2-vision:11b` | 7.8 GB | Best all-round, 128K context |

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
