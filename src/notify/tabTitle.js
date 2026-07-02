// Reflect the number of sessions needing attention in the tab title, and play a
// short beep when that count rises while the tab is unfocused.

let prevAttention = 0
let audioCtx = null

export function updateTabTitle(attentionCount, muted) {
  const base = 'oversee.sh'
  document.title = attentionCount > 0 ? `(${attentionCount}) ${base}` : base

  if (!muted && attentionCount > prevAttention && document.hidden) {
    beep()
  }
  prevAttention = attentionCount
}

function beep() {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)()
    const o = audioCtx.createOscillator()
    const g = audioCtx.createGain()
    o.frequency.value = 660
    o.connect(g)
    g.connect(audioCtx.destination)
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.15, audioCtx.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.25)
    o.start()
    o.stop(audioCtx.currentTime + 0.26)
  } catch {}
}
