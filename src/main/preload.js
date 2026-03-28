const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  loadPhotos: (folderPath) => ipcRenderer.invoke('load-photos', folderPath),
  readImageBase64: (imagePath) => ipcRenderer.invoke('read-image-base64', imagePath),
  readImageThumbBase64: (imagePath) => ipcRenderer.invoke('read-image-thumb-base64', imagePath),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  writeDeletionLog: (data) => ipcRenderer.invoke('write-deletion-log', data),
  trashItems: (paths) => ipcRenderer.invoke('trash-items', paths),
  deleteItems: (paths) => ipcRenderer.invoke('delete-items', paths),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  importPhotos: (data) => ipcRenderer.invoke('import-photos', data),
  importFromMtp: (data) => ipcRenderer.invoke('import-from-mtp', data),
  importFromWia: (data) => ipcRenderer.invoke('import-from-wia', data),
  listWiaPhotos: (deviceId) => ipcRenderer.invoke('list-wia-photos', deviceId),
  getAfcFileBase64: (data) => ipcRenderer.invoke('get-afc-file-base64', data),
  getAfcFileFullBase64: (data) => ipcRenderer.invoke('get-afc-file-full-base64', data),
  importSelectedWia: (data) => ipcRenderer.invoke('import-selected-wia', data),
  listAllStorage: () => ipcRenderer.invoke('list-all-storage'),
  browseMtpFolders: (devicePath) => ipcRenderer.invoke('browse-mtp-folders', devicePath),
  onImportProgress: (cb) => {
    ipcRenderer.on('import-progress', (_, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('import-progress')
  },
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onWindowMaximized: (cb) => {
    ipcRenderer.on('window-maximized', (_, val) => cb(val))
    return () => ipcRenderer.removeAllListeners('window-maximized')
  }
})
