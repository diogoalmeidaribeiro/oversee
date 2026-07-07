// Minimal Telegram Bot API connector — no deps, uses global fetch.
// Get a token from @BotFather, message your bot once, then detectChatId() finds
// the chat to deliver to.
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
    return { ok: true }
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
