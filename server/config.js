import os from 'node:os'
import path from 'node:path'

const home = os.homedir()

export const config = {
  port: Number(process.env.MC_PORT) || 4600,

  // Where Claude Code writes its live registry + transcripts.
  claudeDir: path.join(home, '.claude'),
  sessionsDir: path.join(home, '.claude', 'sessions'),
  projectsDir: path.join(home, '.claude', 'projects'),

  // A session is considered dead if its registry file hasn't been touched in this long.
  staleMs: 45_000,

  // How long a "just finished" badge/notification stays hot after a session goes idle.
  justFinishedMs: 120_000,

  // Debounce for coalescing a burst of registry writes into one snapshot push.
  snapshotDebounceMs: 250,

  // Notification anti-spam.
  notifyCooldownMs: 10_000,   // per session + transition
  notifyCoalesceMs: 2_000,    // burst window -> single summary
  startupGraceMs: 4_000,      // seed state on boot without notifying

  // Prefix for tmux sessions the hub owns.
  tmuxPrefix: 'cc_',
  tmuxBin: process.env.MC_TMUX || 'tmux',
  claudeBin: process.env.MC_CLAUDE || 'claude',
}
