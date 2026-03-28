const { app, BrowserWindow, ipcMain, dialog, shell, protocol, Menu } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { spawn } = require('child_process')

let _afc = null
try { _afc = require('appium-ios-device') } catch (e) { console.error('appium-ios-device load failed:', e.message) }
const getAfc = () => _afc

// Handle electron-store as ESM module
let Store
async function getStore() {
  if (!Store) {
    const { default: ElectronStore } = await import('electron-store')
    Store = ElectronStore
  }
  return Store
}

let mainWindow
let store

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

async function createWindow() {
  const StoreClass = await getStore()
  store = new StoreClass()

  const iconPath = path.join(__dirname, '../../assets/icon.png')
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0e0c0f',
    icon: iconPath,
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false // needed to load local images via file:// in renderer
    }
  })

  mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized', true))
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized', false))

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'))
  }
}

// ── Window controls ──────────────────────────────────────────────────────────
ipcMain.handle('window-minimize', () => mainWindow?.minimize())
ipcMain.handle('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.handle('window-close', () => mainWindow?.close())
ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() ?? false)

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// ── IPC: Select folder ──────────────────────────────────────────────────────
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  })
  if (result.canceled || !result.filePaths.length) return null
  return result.filePaths[0]
})

// ── IPC: Load photos from folder ────────────────────────────────────────────
ipcMain.handle('load-photos', async (_, folderPath) => {
  const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.gif', '.bmp', '.tiff', '.tif']

  let files
  try {
    files = fs.readdirSync(folderPath)
  } catch (e) {
    return { error: e.message }
  }

  const photos = []
  for (const file of files) {
    const ext = path.extname(file).toLowerCase()
    if (!IMAGE_EXTS.includes(ext)) continue
    const fullPath = path.join(folderPath, file)
    try {
      const stat = fs.statSync(fullPath)
      photos.push({
        name: file,
        path: fullPath,
        size: stat.size,
        mtime: stat.mtime.toISOString()
      })
    } catch {}
  }

  // Sort by name (natural sort)
  photos.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  return photos
})

// ── Image conversion helpers ──────────────────────────────────────────────────
async function toJpegBuffer(buf, ext) {
  if (ext === '.heic' || ext === '.heif') {
    try {
      const convert = (await import('heic-convert')).default
      return Buffer.from(await convert({ buffer: buf, format: 'JPEG', quality: 0.85 }))
    } catch (e) {
      console.warn('heic-convert failed:', e.message)
    }
  }
  return buf
}

function mimeFromExt(ext) {
  const e = (ext || '').toLowerCase()
  if (e === '.jpg' || e === '.jpeg') return 'image/jpeg'
  if (e === '.png') return 'image/png'
  if (e === '.webp') return 'image/webp'
  if (e === '.gif') return 'image/gif'
  if (e === '.bmp') return 'image/bmp'
  if (e === '.tiff' || e === '.tif') return 'image/tiff'
  // HEIC/HEIF are converted to JPEG for renderer compatibility.
  if (e === '.heic' || e === '.heif') return 'image/jpeg'
  return 'application/octet-stream'
}

// ── Thumbnail worker pool (keeps conversion off the main thread) ──────────────
const { Worker } = require('worker_threads')
const THUMB_POOL_SIZE = Math.max(2, os.cpus().length - 1)
const thumbWorkers = []
const thumbPending = new Map() // id → { resolve, reject }
let thumbNextId = 0

function initThumbPool() {
  for (let i = 0; i < THUMB_POOL_SIZE; i++) {
    const w = new Worker(path.join(__dirname, 'thumb-worker.js'))
    w.on('message', ({ id, ok, buf, error }) => {
      const p = thumbPending.get(id)
      if (!p) return
      thumbPending.delete(id)
      ok ? p.resolve(Buffer.from(buf)) : p.reject(new Error(error))
    })
    w.on('error', e => console.error('thumb-worker error:', e.message))
    thumbWorkers.push(w)
  }
}
initThumbPool()

function convertInWorker(buf, ext) {
  const id = thumbNextId++
  const worker = thumbWorkers[id % thumbWorkers.length]
  return new Promise((resolve, reject) => {
    thumbPending.set(id, { resolve, reject })
    // Transfer buffer ownership to worker — zero copy
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    worker.postMessage({ id, buf: ab, ext }, [ab])
  })
}

// ── In-memory thumbnail cache (max 600 entries ≈ ~5 MB) ──────────────────────
const thumbMemCache = new Map()
const THUMB_CACHE_MAX = 600

function cacheThumb(key, buf) {
  if (thumbMemCache.size >= THUMB_CACHE_MAX) {
    thumbMemCache.delete(thumbMemCache.keys().next().value) // evict oldest
  }
  thumbMemCache.set(key, buf)
}

async function toThumbnailBuffer(buf, ext, cacheKey) {
  if (cacheKey && thumbMemCache.has(cacheKey)) return thumbMemCache.get(cacheKey)
  const result = await convertInWorker(buf, ext)
  if (cacheKey) cacheThumb(cacheKey, result)
  return result
}

// ── IPC: Read image as base64 ────────────────────────────────────────────────
ipcMain.handle('read-image-base64', async (_, imagePath) => {
  try {
    const ext = path.extname(imagePath).toLowerCase()
    let data = fs.readFileSync(imagePath)
    data = await toJpegBuffer(data, ext)
    return data.toString('base64')
  } catch (e) {
    return null
  }
})

// ── IPC: Read image thumbnail as base64 ──────────────────────────────────────
ipcMain.handle('read-image-thumb-base64', async (_, imagePath) => {
  try {
    const ext = path.extname(imagePath).toLowerCase()
    const data = fs.readFileSync(imagePath)
    const cacheKey = (`local:${imagePath}`).replace(/[^a-z0-9]/gi, '_')
    const thumb = await toThumbnailBuffer(data, ext, cacheKey)
    return thumb.toString('base64')
  } catch (e) {
    return null
  }
})

// ── IPC: Get settings ────────────────────────────────────────────────────────
ipcMain.handle('get-settings', () => {
  return store.get('settings', {
    model: 'moondream2',
    showAiOverlay: true,
    strictness: 'balanced'
  })
})

// ── IPC: Save settings ───────────────────────────────────────────────────────
ipcMain.handle('save-settings', (_, settings) => {
  store.set('settings', settings)
  return true
})

// ── IPC: Write deletion log ──────────────────────────────────────────────────
ipcMain.handle('write-deletion-log', async (_, { folderPath, deletedPhotos }) => {
  const logPath = path.join(folderPath, 'deletion_log.json')
  const log = {
    timestamp: new Date().toISOString(),
    totalDeleted: deletedPhotos.length,
    totalBytes: deletedPhotos.reduce((sum, p) => sum + p.size, 0),
    files: deletedPhotos.map(p => ({
      name: p.name,
      size: p.size,
      reason: p.analysis?.reason || 'User decision',
      recommendation: p.analysis?.recommendation || 'delete'
    }))
  }
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2))
  return logPath
})

// ── IPC: Trash items ─────────────────────────────────────────────────────────
ipcMain.handle('trash-items', async (_, photoPaths) => {
  const errors = []
  for (const p of photoPaths) {
    try {
      await shell.trashItem(p)
    } catch (e) {
      errors.push({ path: p, error: e.message })
    }
  }
  return { success: errors.length === 0, errors }
})

// ── IPC: Permanently delete items ────────────────────────────────────────────
ipcMain.handle('delete-items', async (_, photoPaths) => {
  const errors = []
  for (const p of photoPaths) {
    try {
      fs.unlinkSync(p)
    } catch (e) {
      errors.push({ path: p, error: e.message })
    }
  }
  return { success: errors.length === 0, errors }
})

// ── IPC: Open URL in browser ─────────────────────────────────────────────────
ipcMain.handle('open-external', async (_, url) => {
  await shell.openExternal(url)
})

// ── PowerShell helpers ────────────────────────────────────────────────────────
function runPS(script) {
  const tmp = path.join(os.tmpdir(), `Prune_${Date.now()}.ps1`)
  fs.writeFileSync(tmp, script, 'utf8')
  return new Promise((resolve, reject) => {
    const ps = spawn('powershell', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tmp
    ])
    let out = '', err = ''
    ps.stdout.on('data', d => out += d)
    ps.stderr.on('data', d => err += d)
    ps.on('close', code => {
      fs.unlink(tmp, () => {})
      code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || `Exit ${code}`))
    })
    ps.on('error', reject)
  })
}

function runPSStream(script, onLine) {
  const tmp = path.join(os.tmpdir(), `Prune_${Date.now()}.ps1`)
  fs.writeFileSync(tmp, script, 'utf8')
  return new Promise((resolve, reject) => {
    const ps = spawn('powershell', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tmp
    ])
    let buf = ''
    ps.stdout.on('data', d => {
      buf += d.toString()
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const l of lines) { if (l.trim()) onLine(l.trim()) }
    })
    ps.stderr.on('data', d => console.error('[PS]', d.toString()))
    ps.on('close', code => {
      fs.unlink(tmp, () => {})
      if (buf.trim()) onLine(buf.trim())
      resolve(code)
    })
    ps.on('error', reject)
  })
}

// ── IPC: List ALL storage — drive letters + MTP (Android) + AFC (iPhone) ───────
ipcMain.handle('list-all-storage', async () => {
  const results = []
  const seenPaths = new Set()

  const add = (item) => {
    const key = item.path || item.label
    if (seenPaths.has(key)) return
    seenPaths.add(key)
    results.push(item)
  }

  // iPhone via appium-ios-device (AFC protocol over usbmux)
  try {
    const { utilities } = getAfc()
    const udids = await utilities.getConnectedDevices()
    for (const udid of udids) {
      let name = 'Apple iPhone'
      try {
        const info = await utilities.getDeviceInfo(udid)
        name = info.DeviceName || info.ProductType || 'Apple iPhone'
      } catch {}
      add({ type: 'iphone', path: udid, label: ` ${name}` })
    }
  } catch (e) {
    console.log('AFC/iPhone detect:', e.message)
  }

  if (process.platform === 'win32') {
    // Regular drive letters D-Z (removable drives, SD cards)
    for (let i = 68; i <= 90; i++) {
      const letter = String.fromCharCode(i)
      const p = `${letter}:\\`
      if (fs.existsSync(p)) {
        add({ type: 'drive', path: p, label: `${letter}: (drive)` })
      }
    }

    // MTP devices via Shell.Application (Android phones, cameras)
    try {
      const out = await runPS(`
        $shell = New-Object -ComObject Shell.Application
        $myComp = $shell.Namespace(17)
        $result = @()
        foreach ($item in $myComp.Items()) {
          $p = $item.Path
          if ($item.IsFolder -and $p -notmatch '^[A-Za-z]:\\\\$') {
            $result += [PSCustomObject]@{ name=$item.Name; path=$p }
          }
        }
        if ($result.Count -gt 0) { ConvertTo-Json @($result) -Compress } else { Write-Output '[]' }
      `)
      const devices = JSON.parse(out || '[]')
      for (const d of (Array.isArray(devices) ? devices : [devices])) {
        if (d && d.name) add({ type: 'mtp', path: d.path, label: d.name })
      }
    } catch (e) {
      console.error('MTP detect failed:', e.message)
    }
  } else {
    // macOS: /Volumes
    try {
      const vols = fs.readdirSync('/Volumes')
      for (const v of vols) {
        if (!v.startsWith('.') && v !== 'Macintosh HD') {
          add({ type: 'drive', path: `/Volumes/${v}`, label: v })
        }
      }
    } catch {}
  }

  return results
})

// ── IPC: Browse MTP device for photo folders ──────────────────────────────────
ipcMain.handle('browse-mtp-folders', async (_, devicePath) => {
  if (process.platform !== 'win32') return []
  try {
    // Escape single quotes in path for PS
    const safePath = devicePath.replace(/'/g, "''")
    const out = await runPS(`
      $shell = New-Object -ComObject Shell.Application
      $device = $shell.Namespace('${safePath}')
      $found = @()
      function Find-Folders($folder, $depth) {
        if (!$folder -or $depth -gt 7) { return }
        foreach ($item in $folder.Items()) {
          if ($item.IsFolder) {
            $n = $item.Name
            if ($n -imatch '^(DCIM|Camera|Photos|Pictures|100APPLE|100ANDRO|100PHOTO|PHOTO|IMG_|WhatsApp Images)') {
              $script:found += [PSCustomObject]@{ name=$n; path=$item.Path }
            }
            Find-Folders $item.GetFolder ($depth+1)
          }
        }
      }
      Find-Folders $device 0
      if ($found.Count -gt 0) { ConvertTo-Json @($found) -Compress } else { Write-Output '[]' }
    `)
    const folders = JSON.parse(out || '[]')
    return Array.isArray(folders) ? folders : [folders]
  } catch (e) {
    console.error('browse-mtp-folders failed:', e.message)
    return []
  }
})

// ── iPhone AFC helpers ────────────────────────────────────────────────────────
const IMAGE_EXTS_AFC = ['.jpg','.jpeg','.png','.heic','.heif','.webp','.gif','.bmp','.tiff','.tif','.mov','.mp4']

function friendlyIphoneError(e) {
  let msg = e.message || String(e)
  if (msg.includes('Unexpected data:')) {
    try {
      const match = msg.match(/Unexpected data:\s*(\{.*\})/)
      if (match) {
        const obj = JSON.parse(match[1])
        if (obj.Error === 'PasswordProtected') {
          return 'Your iPhone is locked. Please unlock it with your passcode and try again.'
        }
        if (obj.Error === 'InvalidService') {
          return 'Service unavailable. Please reconnect your iPhone, unlock it, and ensure you tap "Trust".'
        }
        if (obj.Error) {
          return `iPhone error: ${obj.Error}. Please check your phone.`
        }
      }
    } catch (err) {}
  }
  if (msg.includes('PasswordProtected')) {
    return 'Your iPhone is locked. Please unlock it with your passcode and try again.'
  }
  return msg
}

async function afcListPhotos(afc, dir = '/DCIM') {
  const photos = []
  // Let listDirectory throw — caller handles errors
  const entries = await afc.listDirectory(dir)
  const list = Array.isArray(entries) ? entries : Object.keys(entries || {})
  for (const entry of list) {
    if (entry === '.' || entry === '..') continue
    const full = `${dir}/${entry}`
    try {
      const info = await afc.getFileInfo(full)
      if (info.ifmt === 'S_IFDIR') {
        photos.push(...await afcListPhotos(afc, full))
      } else {
        const ext = path.extname(entry).toLowerCase()
        if (IMAGE_EXTS_AFC.includes(ext)) {
          photos.push({ name: entry, path: full, size: info.size || 0, mtime: info.mtimeMs || '' })
        }
      }
    } catch (e) {
      console.warn('AFC getFileInfo failed for', full, e.message)
    }
  }
  return photos
}

// ── IPC: List photos on iPhone (AFC) ─────────────────────────────────────────
ipcMain.handle('list-wia-photos', async (_, udid) => {
  let afc
  try {
    const { services } = getAfc()
    console.log('AFC: connecting to', udid)
    afc = await services.startAfcService(udid)
    console.log('AFC: connected, listing root /')

    // Diagnose root to see what's available
    let rootEntries
    try {
      rootEntries = await afc.listDirectory('/')
      console.log('AFC root entries:', rootEntries)
    } catch (e) {
      console.error('AFC: cannot list root:', e.message)
      await afc.close()
      return { error: `Cannot access iPhone filesystem: ${friendlyIphoneError(e)} Make sure the phone is unlocked and you tapped "Trust".` }
    }

    const photos = await afcListPhotos(afc)
    console.log('AFC: found', photos.length, 'photos')
    await afc.close()

    if (photos.length === 0) {
      return { error: 'No photos found in /DCIM on this iPhone. Make sure the phone is unlocked.' }
    }

    return photos
  } catch (e) {
    if (afc) try { await afc.close() } catch {}
    console.error('list-iphone-photos failed:', e.message, e.stack)
    return { error: `Failed to connect to iPhone: ${friendlyIphoneError(e)}` }
  }
})

// ── AFC parallel connection pool ──────────────────────────────────────────────
const AFC_WORKERS = 6   // parallel connections per device
const AFC_CHUNK   = 900 * 1024

const afcPools = new Map() // udid → { workers: [{afc,busy}], pending: [] }

function getPool(udid) {
  if (!afcPools.has(udid)) {
    afcPools.set(udid, {
      workers: Array.from({ length: AFC_WORKERS }, () => ({ afc: null, busy: false })),
      pending: []
    })
  }
  return afcPools.get(udid)
}

async function afcRead(udid, remotePath, knownSize) {
  const pool = getPool(udid)
  return new Promise((resolve, reject) => {
    pool.pending.push({ remotePath, knownSize, resolve, reject })
    scheduleWorkers(udid)
  })
}

function scheduleWorkers(udid) {
  const pool = afcPools.get(udid)
  if (!pool) return
  for (const worker of pool.workers) {
    if (!worker.busy && pool.pending.length > 0) {
      runWorker(udid, worker)
    }
  }
}

async function runWorker(udid, worker) {
  const pool = afcPools.get(udid)
  worker.busy = true
  try {
    if (!worker.afc) {
      const { services } = getAfc()
      worker.afc = await services.startAfcService(udid)
    }
    while (pool.pending.length > 0) {
      const { remotePath, knownSize, resolve, reject } = pool.pending.shift()
      try {
        const buf = await afcReadFile(worker.afc, remotePath, knownSize)
        resolve(buf)
      } catch (e) {
        try { await worker.afc.close() } catch {}
        worker.afc = null
        reject(e)
        break
      }
    }
  } catch (e) {
    // Worker setup failed — drain its share
    while (pool.pending.length > 0) {
      const { reject: rej } = pool.pending.shift()
      rej(e)
    }
    worker.afc = null
  } finally {
    worker.busy = false
    if (pool.pending.length > 0) runWorker(udid, worker)
  }
}

async function afcReadFile(afc, remotePath, knownSize) {
  const size = knownSize || (await afc.getFileInfo(remotePath)).size || 0
  const handle = await afc.openFile(remotePath, 2)
  const chunks = []
  let remaining = size
  while (remaining > 0) {
    const toRead = Math.min(AFC_CHUNK, remaining)
    const chunk = await afc.readFile(handle, toRead)
    chunks.push(chunk)
    remaining -= chunk.length
    if (chunk.length < toRead) break
  }
  await afc.closeFileHandle(handle)
  return Buffer.concat(chunks)
}

// ── IPC: Get a single file from iPhone AFC as base64 (for thumbnails) ────────
ipcMain.handle('get-afc-file-base64', async (_, { udid, remotePath, fileSize }) => {
  try {
    const ext = path.extname(remotePath).toLowerCase()
    const cacheKey = (udid.slice(-8) + remotePath).replace(/[^a-z0-9]/gi, '_')
    if (thumbMemCache.has(cacheKey)) return thumbMemCache.get(cacheKey).toString('base64')
    const buf = await afcRead(udid, remotePath, fileSize)
    const thumb = await toThumbnailBuffer(buf, ext, cacheKey)
    return thumb.toString('base64')
  } catch (e) {
    return null
  }
})

// ── IPC: Get a single full-resolution file from iPhone AFC as base64 ─────────
ipcMain.handle('get-afc-file-full-base64', async (_, { udid, remotePath, fileSize }) => {
  try {
    const ext = path.extname(remotePath).toLowerCase()
    const buf = await afcRead(udid, remotePath, fileSize)
    const out = await toJpegBuffer(buf, ext)
    return {
      base64: out.toString('base64'),
      mime: mimeFromExt(ext),
      converted: ext === '.heic' || ext === '.heif'
    }
  } catch (e) {
    return null
  }
})

// ── IPC: Import selected photos from iPhone (AFC) ────────────────────────────
ipcMain.handle('import-selected-wia', async (_, { deviceId: udid, selectedNames, destPath }) => {
  let afc
  try {
    if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true })
    const { services } = getAfc()
    afc = await services.startAfcService(udid)

    const total = selectedNames.length
    let copied = 0

    mainWindow.webContents.send('import-progress', { current: 0, total, file: 'Connecting...' })

    for (const remotePath of selectedNames) {
      const name = path.basename(remotePath)
      const localPath = path.join(destPath, name)
      if (!fs.existsSync(localPath)) {
        const buf = await afcReadFile(afc, remotePath)
        fs.writeFileSync(localPath, buf)
      }
      copied++
      mainWindow.webContents.send('import-progress', { current: copied, total, file: name })
    }

    await afc.close()
    return { success: true, copied, total }
  } catch (e) {
    if (afc) try { await afc.close() } catch {}
    return { success: false, error: friendlyIphoneError(e) }
  }
})

// ── IPC: Import from MTP device (streaming progress) ─────────────────────────
ipcMain.handle('import-from-mtp', async (_, { sourcePath, destPath }) => {
  try {
    if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true })

    const safeSource = sourcePath.replace(/'/g, "''")
    const safeDest   = destPath.replace(/\\/g, '\\\\').replace(/'/g, "''")

    let total = 0, copied = 0

    await runPSStream(`
      $shell  = New-Object -ComObject Shell.Application
      $src    = $shell.Namespace('${safeSource}')
      $dst    = $shell.Namespace('${safeDest}')

      if (!$src) { Write-Output 'ERROR:Cannot open source folder'; exit 1 }

      $exts = @('.jpg','.jpeg','.png','.heic','.heif','.webp','.gif','.bmp','.tiff','.tif')
      $items = @($src.Items() | Where-Object { $exts -contains [IO.Path]::GetExtension($_.Name).ToLower() })
      $total = $items.Count
      Write-Output "TOTAL:$total"
      [Console]::Out.Flush()

      for ($i = 0; $i -lt $items.Count; $i++) {
        $item     = $items[$i]
        $destFile = Join-Path '${safeDest}' $item.Name
        if (!(Test-Path $destFile)) {
          $dst.CopyHere($item, 1044)
          $t = 120
          while ($t-- -gt 0 -and !(Test-Path $destFile)) { Start-Sleep -Milliseconds 500 }
        }
        $n = $i + 1
        Write-Output "PROGRESS:$($n):$($total):$($item.Name)"
        [Console]::Out.Flush()
      }
      Write-Output 'COMPLETE'
    `, (line) => {
      if (line.startsWith('TOTAL:')) {
        total = parseInt(line.slice(6)) || 0
        mainWindow.webContents.send('import-progress', { current: 0, total, file: 'Starting...' })
      } else if (line.startsWith('PROGRESS:')) {
        const [, cur, tot, file] = line.split(':')
        copied = parseInt(cur)
        mainWindow.webContents.send('import-progress', { current: copied, total: parseInt(tot), file })
      } else if (line.startsWith('ERROR:')) {
        console.error('MTP import error:', line)
      }
    })

    return { success: true, copied, total }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// ── IPC: Import photos from regular drive ────────────────────────────────────
ipcMain.handle('import-photos', async (_, { sourcePath, destPath }) => {
  const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.gif', '.bmp', '.tiff', '.tif']
  try {
    if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true })
    const files = fs.readdirSync(sourcePath)
    const imageFiles = files.filter(f => IMAGE_EXTS.includes(path.extname(f).toLowerCase()))
    let copied = 0
    for (const file of imageFiles) {
      const src  = path.join(sourcePath, file)
      const dest = path.join(destPath, file)
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(src, dest)
        copied++
      }
      mainWindow.webContents.send('import-progress', { current: copied, total: imageFiles.length, file })
    }
    return { success: true, copied, total: imageFiles.length }
  } catch (e) {
    return { success: false, error: e.message }
  }
})
