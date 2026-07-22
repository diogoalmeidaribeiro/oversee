import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

// Backslash-escape everything outside a shell-safe set — mirrors how macOS
// Terminal inserts the path of a file you drag into it.
function shellEscapePath(p) {
  return p.replace(/([^A-Za-z0-9,._+:@%/-])/g, '\\$1')
}

// Embeds a hub-owned tmux session as an interactive terminal. Output streams in
// over /ws/pty; keystrokes and resizes go back out. Reconnects on close.
export function TerminalPane({ tmuxName, fontSize = 12 }) {
  const hostRef = useRef(null)

  useEffect(() => {
    if (!tmuxName) return
    const term = new Terminal({
      fontSize,
      fontFamily: '"Geist Mono", ui-monospace, Menlo, monospace',
      theme: {
        background: '#0a0a0a',
        foreground: '#e1e1e1',
        cursor: '#ec594f',
        selectionBackground: '#252527',
      },
      cursorBlink: true,
      scrollback: 5000,
      convertEol: false,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(hostRef.current)
    try { fit.fit() } catch {}

    let ws
    let stopped = false
    let backoff = 500

    function connect() {
      if (stopped) return
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/ws/pty?name=${encodeURIComponent(tmuxName)}`)
      ws.binaryType = 'arraybuffer'
      ws.onopen = () => {
        backoff = 500
        sendResize()
      }
      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          try {
            const msg = JSON.parse(ev.data)
            if (msg.type === 'error') term.write(`\r\n[mission-control] ${msg.message}\r\n`)
            return
          } catch {
            term.write(ev.data)
            return
          }
        }
        term.write(new Uint8Array(ev.data))
      }
      ws.onclose = () => {
        if (!stopped) setTimeout(connect, (backoff = Math.min(backoff * 2, 4000)))
      }
      ws.onerror = () => ws.close()
    }

    function sendResize() {
      try {
        fit.fit()
        if (ws?.readyState === 1) ws.send(JSON.stringify({ t: 'r', c: term.cols, r: term.rows }))
      } catch {}
    }

    const onData = term.onData((d) => {
      if (ws?.readyState === 1) ws.send(JSON.stringify({ t: 'i', d }))
    })

    // Drag a file from Finder onto the terminal → type its escaped OS path, just
    // like macOS Terminal. Needs the Electron preload (window.overseeNative); in a
    // plain browser the filesystem path isn't available, so we no-op.
    const host = hostRef.current
    const onDragOver = (e) => {
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onDrop = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const toPath = window.overseeNative?.getPathForFile
      if (!toPath || ws?.readyState !== 1) return
      const paths = Array.from(e.dataTransfer?.files || [])
        .map((f) => { try { return toPath(f) } catch { return '' } })
        .filter(Boolean)
      if (!paths.length) return
      ws.send(JSON.stringify({ t: 'i', d: paths.map(shellEscapePath).join(' ') }))
      term.focus()
    }
    host.addEventListener('dragover', onDragOver)
    host.addEventListener('drop', onDrop)

    const ro = new ResizeObserver(() => sendResize())
    ro.observe(hostRef.current)
    connect()
    term.focus()

    return () => {
      stopped = true
      onData.dispose()
      host.removeEventListener('dragover', onDragOver)
      host.removeEventListener('drop', onDrop)
      ro.disconnect()
      ws?.close()
      term.dispose()
    }
  }, [tmuxName, fontSize])

  return <div className="terminal-host" ref={hostRef} />
}
