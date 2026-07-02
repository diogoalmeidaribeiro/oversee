import { useEffect, useRef, useState } from 'react'

// Subscribes to /ws/control and keeps the latest snapshot. Auto-reconnects.
export function useControlSocket() {
  const [snapshot, setSnapshot] = useState({ sessions: [], tmuxAvailable: false })
  const [connected, setConnected] = useState(false)
  const wsRef = useRef(null)

  useEffect(() => {
    let stop = false
    let backoff = 500

    function connect() {
      if (stop) return
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${location.host}/ws/control`)
      wsRef.current = ws
      ws.onopen = () => {
        setConnected(true)
        backoff = 500
      }
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.type === 'snapshot') setSnapshot(msg)
        } catch {}
      }
      ws.onclose = () => {
        setConnected(false)
        if (!stop) setTimeout(connect, (backoff = Math.min(backoff * 2, 5000)))
      }
      ws.onerror = () => ws.close()
    }
    connect()
    return () => {
      stop = true
      wsRef.current?.close()
    }
  }, [])

  return { snapshot, connected }
}
