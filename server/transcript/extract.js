// Folds transcript JSONL records into a compact "what has this session done"
// summary. State-snapshot records (ai-title, last-prompt) are latest-wins, so we
// simply apply records in file order (byte order), never by timestamp.

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Update'])

export function emptySummary() {
  return {
    title: null,
    lastPrompt: null,
    activity: null,        // last tool_use name (what it's doing/did)
    lastStopReason: null,  // 'end_turn' | 'tool_use' | ...
    lastTurn: null,        // { durationMs, messageCount }
    tokensOut: 0,
    filesTouched: [],      // distinct file paths edited
    _files: new Set(),
    messageCount: 0,
    queuedNet: 0,          // pending queued prompts (enqueue - dequeue), clamped in finalize
  }
}

function fileArg(input) {
  if (!input || typeof input !== 'object') return null
  return input.file_path || input.filePath || input.path || input.notebook_path || null
}

// Apply one parsed record to the running summary (mutates + returns it).
// When `live` is provided (an object with turns/tokensOut/files/newTurns), stats
// that happen AFTER the initial backfill are also accumulated there — this is how
// we get "done since the hub started" cheaply (see tailer.js).
export function applyRecord(sum, rec, live = null) {
  if (!rec || typeof rec !== 'object') return sum
  switch (rec.type) {
    case 'ai-title':
      if (rec.aiTitle) sum.title = rec.aiTitle
      break
    case 'last-prompt':
      if (rec.lastPrompt) sum.lastPrompt = rec.lastPrompt
      break
    case 'user':
      sum.messageCount++
      break
    case 'assistant': {
      sum.messageCount++
      const msg = rec.message || {}
      const content = Array.isArray(msg.content) ? msg.content : []
      for (const block of content) {
        if (block.type === 'tool_use') {
          sum.activity = block.name
          const f = fileArg(block.input)
          if (f && EDIT_TOOLS.has(block.name)) {
            sum._files.add(f)
            if (live) live.files.add(f)
          }
        }
      }
      if (msg.stop_reason) sum.lastStopReason = msg.stop_reason
      const out = msg.usage?.output_tokens
      if (typeof out === 'number') {
        sum.tokensOut += out
        if (live) live.tokensOut += out
      }
      break
    }
    case 'system':
      if (rec.subtype === 'turn_duration') {
        sum.lastTurn = { durationMs: rec.durationMs, messageCount: rec.messageCount }
        if (live) {
          live.turns++
          live.newTurns.push({ durationMs: rec.durationMs, messageCount: rec.messageCount })
        }
      }
      break
    case 'queue-operation': {
      const op = rec.operation
      if (op === 'enqueue') sum.queuedNet++
      else if (op) sum.queuedNet-- // dequeue / remove / cancel / dismiss
      break
    }
    case 'file-history-snapshot': {
      const tracked = rec.snapshot?.trackedFileBackups
      if (tracked) for (const k of Object.keys(tracked)) sum._files.add(k)
      break
    }
    default:
      break
  }
  return sum
}

// Finalize the serializable view (drop internal Set).
export function finalize(sum) {
  const files = [...sum._files]
  return {
    title: sum.title,
    lastPrompt: sum.lastPrompt,
    activity: sum.activity,
    lastStopReason: sum.lastStopReason,
    lastTurn: sum.lastTurn,
    tokensOut: sum.tokensOut,
    filesTouched: files.slice(-40),
    filesCount: files.length,
    messageCount: sum.messageCount,
    queued: Math.max(0, sum.queuedNet),
  }
}
