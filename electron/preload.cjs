// Preload — the only native capability the renderer gets under contextIsolation.
// getPathForFile turns a dropped File into its real filesystem path: Electron 32+
// removed File.path, and webUtils is the supported replacement. The embedded
// terminals use this to insert a dropped file's path, like macOS Terminal does.
const { contextBridge, webUtils } = require('electron')

contextBridge.exposeInMainWorld('overseeNative', {
  getPathForFile: (file) => {
    try { return webUtils.getPathForFile(file) } catch { return '' }
  },
})
