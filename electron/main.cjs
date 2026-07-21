// Electron shell for oversee.sh. It forks the existing Node server (server/index.js)
// on an ephemeral loopback port, waits for it to report ready, then opens a window
// pointed at http://127.0.0.1:<port>. Because the server serves the UI same-origin,
// the frontend's relative /api and location.host WebSocket URLs work unchanged.
//
// CommonJS on purpose: the repo is "type": "module", so a bare .js here would load
// as ESM and hit Electron's ESM-main caveats. The forked server stays ESM.
const { app, BrowserWindow, Menu, dialog, utilityProcess, shell } = require('electron')
const path = require('node:path')
const { execSync } = require('node:child_process')

// Only one instance — a second launch just focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit()
  return
}

const serverEntry = path.join(__dirname, '..', 'server', 'index.js')
let serverChild = null
let win = null
let lastPort = 0

// A .app launched from Finder/Dock inherits a minimal PATH (no ~/.zshrc), so tmux,
// claude and git wouldn't be found. Resolve the real interactive PATH once and also
// prepend the common Homebrew locations as a fallback.
function fixPath() {
  if (process.platform !== 'darwin') return
  try {
    const sh = process.env.SHELL || '/bin/zsh'
    const out = execSync(`${sh} -ilc 'printf "%s" "$PATH"'`, { encoding: 'utf8', timeout: 5000 })
    if (out && out.trim()) process.env.PATH = out.trim()
  } catch {
    /* fall through to the static fallback below */
  }
  // APPEND common locations as a fallback only — never prepend. Prepending would
  // override the login shell's own ordering and can shadow the user's real tool
  // (e.g. an old ~/.local/bin/claude jumping ahead of their current nvm claude).
  const extra = ['/opt/homebrew/bin', '/usr/local/bin', `${process.env.HOME}/.local/bin`]
  const have = new Set((process.env.PATH || '').split(':'))
  process.env.PATH = [process.env.PATH, ...extra.filter((p) => !have.has(p))].filter(Boolean).join(':')
}

function fail(message) {
  dialog.showErrorBox('oversee.sh', message)
  app.isQuitting = true
  app.quit()
}

function startServer() {
  if (app.isPackaged) fixPath() // dev is launched from a terminal and already has PATH
  const env = { ...process.env, MC_EPHEMERAL: '1' }
  // Cap the V8 heap so a server-side leak OOMs the (restartable) child process
  // cleanly instead of exhausting system RAM and dragging the whole Mac into
  // swap-death. 1 GB is far above this monitor's real working set.
  serverChild = utilityProcess.fork(serverEntry, [], {
    env,
    stdio: 'inherit',
    execArgv: ['--max-old-space-size=1024'],
  })

  const timeout = setTimeout(() => fail('The oversee.sh server did not start in time.'), 15000)
  serverChild.on('message', (msg) => {
    if (msg && msg.type === 'ready') {
      clearTimeout(timeout)
      lastPort = msg.port
      createWindow(msg.port)
    }
  })
  serverChild.on('exit', (code) => {
    serverChild = null
    if (!app.isQuitting) fail(`The oversee.sh server stopped unexpectedly (exit ${code}).`)
  })
}

function createWindow(port) {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 560,
    title: 'oversee.sh',
    backgroundColor: '#0a0a0a',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })
  const url = process.env.MC_DEV ? 'http://localhost:5180' : `http://127.0.0.1:${port}`
  win.loadURL(url)
  if (process.env.MC_DEV) win.webContents.openDevTools({ mode: 'detach' })
  // Open target=_blank / external links in the system browser, not a new window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.on('closed', () => { win = null })
}

// A minimal menu — without it, xterm's Copy/Paste (Cmd+C/V) and DevTools are unavailable.
function buildMenu() {
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' }, { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ]
  return Menu.buildFromTemplate(template)
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(buildMenu())
  // In dev the backend is provided by `npm run dev:server` (4600) with Vite's proxy,
  // so we just open the window at the Vite URL. In production we fork the server.
  if (process.env.MC_DEV) createWindow(0)
  else startServer()
})

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  // Dock click on mac: reopen a window against the still-running server.
  if (BrowserWindow.getAllWindows().length === 0 && lastPort) createWindow(lastPort)
})

app.on('before-quit', () => {
  app.isQuitting = true
  // Stop our server child. tmux sessions are detached under the tmux daemon, NOT
  // children of this process, so they (and your running claude sessions) survive.
  serverChild?.kill()
})
