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


## Build

```bash
npm run build
```
Produces a Windows installer in `dist/`.

