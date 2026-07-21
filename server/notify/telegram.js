// Minimal Telegram Bot API connector — no deps, uses global fetch.
// Get a token from @BotFather, message your bot once, then detectChatId() finds
// the chat to deliver to.
import fs from 'node:fs/promises'

const API = 'https://api.telegram.org/bot'

export async function sendTelegram(token, chatId, text) {
  if (!token || !chatId) return { ok: false, error: 'missing token or chat id' }
  try {
    const res = await fetch(`${API}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    })
    const data = await res.json().catch(() => ({}))
    if (!data.ok) return { ok: false, error: data.description || `HTTP ${res.status}` }
    return { ok: true, messageId: data.result?.message_id }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}

// Replace the text of a message already sent — used by the live /follow view so a
// stream of updates edits one message in place instead of spamming the chat.
export async function editMessage(token, chatId, messageId, text) {
  if (!token || !chatId || !messageId) return { ok: false, error: 'missing ids' }
  try {
    const res = await fetch(`${API}${token}/editMessageText`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    })
    const data = await res.json().catch(() => ({}))
    // "message is not modified" is benign — we only edit on change, so it's rare.
    return { ok: !!data.ok, error: data.description }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}

// After the user has sent their bot a message, find the chat id from recent
// updates. (Bots can only message chats that have messaged them first.)
export async function detectChatId(token) {
  if (!token) return { ok: false, error: 'missing token' }
  try {
    const res = await fetch(`${API}${token}/getUpdates?limit=20&timeout=0`)
    const data = await res.json().catch(() => ({}))
    if (!data.ok) return { ok: false, error: data.description || `HTTP ${res.status}` }
    const msgs = (data.result || [])
      .map((u) => u.message || u.edited_message || u.channel_post)
      .filter(Boolean)
    const last = msgs[msgs.length - 1]
    const chat = last?.chat
    if (!chat?.id) return { ok: false, error: 'No messages yet — send your bot a message, then retry.' }
    return { ok: true, chatId: String(chat.id), name: chat.title || chat.first_name || chat.username || '' }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}

// Long-poll for incoming updates (commands the user sends the bot). offset acks
// everything below it; a server-side timeout keeps the request open (efficient).
export async function getUpdates(token, offset, timeout = 30) {
  try {
    const url = `${API}${token}/getUpdates?timeout=${timeout}&offset=${offset || 0}&allowed_updates=%5B%22message%22%5D`
    const res = await fetch(url)
    const data = await res.json().catch(() => ({}))
    if (!data.ok) return { ok: false, error: data.description || `HTTP ${res.status}`, result: [] }
    return { ok: true, result: data.result || [] }
  } catch (e) {
    return { ok: false, error: String(e?.message || e), result: [] }
  }
}

// Register the slash-command menu shown in Telegram's UI.
export async function setCommands(token, commands) {
  try {
    await fetch(`${API}${token}/setMyCommands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ commands }),
    })
  } catch { /* ignore */ }
}

// Resolve a file_id (e.g. a voice note) to its temporary storage path on
// Telegram's servers. Valid for ~1h; download it via downloadFile below.
export async function getFile(token, fileId) {
  if (!token || !fileId) return { ok: false, error: 'missing token or file id' }
  try {
    const res = await fetch(`${API}${token}/getFile?file_id=${encodeURIComponent(fileId)}`)
    const data = await res.json().catch(() => ({}))
    if (!data.ok) return { ok: false, error: data.description || `HTTP ${res.status}` }
    return { ok: true, filePath: data.result?.file_path }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}

// Download a file (by the file_path from getFile) to disk. Note the /file/ URL
// shape — the bot token lives in the path, not a header.
export async function downloadFile(token, filePath, destPath) {
  if (!token || !filePath) return { ok: false, error: 'missing token or file path' }
  try {
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`)
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const buf = Buffer.from(await res.arrayBuffer())
    await fs.writeFile(destPath, buf)
    return { ok: true, bytes: buf.length }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}

// Show a transient status in the chat ("recording audio…", "typing…") — best
// effort, never throws.
export async function sendChatAction(token, chatId, action = 'typing') {
  if (!token || !chatId) return
  try {
    await fetch(`${API}${token}/sendChatAction`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action }),
    })
  } catch { /* ignore */ }
}

// Verify a token and return the bot's @username.
export async function getBotInfo(token) {
  if (!token) return { ok: false, error: 'missing token' }
  try {
    const res = await fetch(`${API}${token}/getMe`)
    const data = await res.json().catch(() => ({}))
    if (!data.ok) return { ok: false, error: data.description || `HTTP ${res.status}` }
    return { ok: true, username: data.result?.username || '' }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}
