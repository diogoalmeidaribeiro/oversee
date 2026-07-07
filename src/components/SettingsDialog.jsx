import { useEffect, useState } from 'react'
import { Brackets } from './Brackets.jsx'
import { Icon } from './icons.jsx'

// Notification settings — currently the Telegram connector. Enter a bot token,
// let it auto-detect the chat id (after you message the bot), send a test, save.
export function SettingsDialog({ onClose }) {
  const [enabled, setEnabled] = useState(false)
  const [token, setToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [status, setStatus] = useState(null) // { kind: 'ok'|'err'|'info', msg }
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((s) => {
        const tg = s?.telegram || {}
        setEnabled(!!tg.enabled)
        setToken(tg.token || '')
        setChatId(tg.chatId || '')
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const post = (url, body) =>
    fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json())

  const detect = async () => {
    setBusy(true); setStatus({ kind: 'info', msg: 'Looking for a recent message to your bot…' })
    const r = await post('/api/telegram/detect', { token }).catch(() => ({ ok: false, error: 'request failed' }))
    setBusy(false)
    if (r.ok) { setChatId(r.chatId); setStatus({ kind: 'ok', msg: `Found chat${r.name ? ` · ${r.name}` : ''} (${r.chatId})` }) }
    else setStatus({ kind: 'err', msg: r.error || 'could not detect chat' })
  }

  const test = async () => {
    setBusy(true); setStatus({ kind: 'info', msg: 'Sending a test message…' })
    const r = await post('/api/telegram/test', { token, chatId }).catch(() => ({ ok: false, error: 'request failed' }))
    setBusy(false)
    if (r.ok) setStatus({ kind: 'ok', msg: `Sent — check Telegram${r.bot ? ` (@${r.bot})` : ''}` })
    else setStatus({ kind: 'err', msg: r.error || 'test failed' })
  }

  const save = async () => {
    setBusy(true)
    await post('/api/settings', { telegram: { enabled, token, chatId } }).catch(() => {})
    setBusy(false)
    setStatus({ kind: 'ok', msg: 'Saved' })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings" onClick={(e) => e.stopPropagation()}>
        <Brackets />
        <div className="settings-head">
          <h3>Notifications</h3>
          <button className="icon" onClick={onClose} title="Close"><Icon.close /></button>
        </div>

        <div className="settings-sec">
          <div className="settings-row">
            <label className="tg-title"><Icon.send /> Telegram</label>
            <button
              className={`toggle${enabled ? ' on' : ''}`}
              onClick={() => setEnabled((v) => !v)}
              title={enabled ? 'Enabled' : 'Disabled'}
            >
              <span className="knob" />
            </button>
          </div>
          <p className="settings-hint">
            Create a bot with <code>@BotFather</code>, paste its token below, send your bot any message,
            then hit <strong>Detect</strong>.
          </p>

          <label className="field">
            <span>Bot token</span>
            <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456:ABC-DEF…" spellCheck={false} autoComplete="off" />
          </label>

          <label className="field">
            <span>Chat ID</span>
            <div className="field-row">
              <input value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="e.g. 84021…" spellCheck={false} autoComplete="off" />
              <button className="ghost sm" disabled={!token || busy} onClick={detect}>Detect</button>
            </div>
          </label>

          {status && <div className={`settings-status ${status.kind}`}>{status.msg}</div>}

          <p className="settings-hint cmds">
            Message your bot to drive the inbox: <code>/task &lt;text&gt;</code> · <code>/tasks</code> · <code>/status</code>
          </p>
        </div>

        <div className="modal-actions">
          <button className="ghost" disabled={!token || !chatId || busy} onClick={test}>Send test</button>
          <div className="spacer" />
          <button className="ghost" onClick={onClose}>Close</button>
          <button className="primary" disabled={busy} onClick={save}>Save</button>
        </div>
      </div>
    </div>
  )
}
