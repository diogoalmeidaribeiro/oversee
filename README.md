# Mission Control

A localhost hub to watch — and drive — all your Claude Code terminals at once.

You run 10+ `claude` terminals and lose track of what you asked, which are working,
which are waiting on you, and what got done. Mission Control puts every session on
one screen: the ones **waiting for you** or **just finished** float to the top, and
you can **launch new sessions and type into them** without hunting through tabs.

It works entirely off local files Claude Code already writes — no API, no config:

- `~/.claude/sessions/<pid>.json` — live per-process registry; the `status` field
  (`busy` / `waiting` / `idle` / `shell`) is the ground truth for each session's state.
- `~/.claude/projects/<slug>/<sessionId>.jsonl` — the transcript, joined by
  `sessionId`, for the auto-title, last prompt, current activity, files touched, and tokens.

## Run it

```bash
npm install
npm start        # builds the UI and serves everything on http://localhost:4600
```

For development with hot-reload:

```bash
npm run dev      # UI on http://localhost:5173, server on :4600 (proxied)
```

Open the URL. Every running `claude` session shows up automatically.

## What you get

- **Fleet overview** — a KPI strip across the top (needs-you · running · done ·
  files · tokens · queued) with a left "news rail": per-project progress bars and a
  reverse-chronological "recently done" feed. Throughput counts (done / files /
  tokens) are measured **since the hub started** — they come free from watching new
  transcript lines land, and reset on restart. `queued` is the net pending-prompt
  depth (enqueue − dequeue), a real "still to do" signal.
- **Attention-first** — `WAITING` (red, pulsing) and `DONE` (green) cards sort to
  the top. Live `RUNNING`, `IDLE`, and `SHELL` states too.
- **Grouped / Flat toggle** — group cards by project (each with a section header
  showing session count + aggregate status), or see one flat attention-sorted grid.
  Projects that need you float to the top; group headers are collapsible. Your
  choice is remembered.
- **Design** — a dark, monospace (Geist Mono) terminal aesthetic with corner-bracket
  panels, following the Eliza design language.
- **Per session** — auto-title, last ask, current tool activity, files touched,
  token count, last-turn duration, and (on expand) a live `git diff` stat.
- **Launch + drive** — the **+ Launch session** button starts `claude` in a folder
  you pick, owned by the hub. Click **Open terminal** to type into it in the browser.
- **Alerts** — native macOS notification on `busy → waiting` ("needs your input")
  and on finish, plus a `(N)` tab-title count and a sound when the tab is unfocused
  (mute with the 🔔 toggle). Anti-spam: per-session cooldown, burst coalescing, and
  a startup grace so restarting the hub never floods you.

## How the terminals persist

Hub-launched sessions run inside **tmux** (the one system dependency — already on
most dev Macs; `brew install tmux` if not). The browser terminal streams pane output
via `tmux pipe-pane` and forwards keystrokes via `tmux send-keys`. Because tmux keeps
the pane running detached:

- **Refresh the browser** → the terminal reattaches with scrollback intact.
- **Restart the hub server** → tmux (and your running `claude`) survive; the hub
  rediscovers `cc_*` sessions on boot. No lost work.

If tmux isn't installed, everything except launching/embedding terminals still works
(monitor-only mode).

## Notes & limits

- **Read-only for scattered terminals.** The hub can only *type into* sessions it
  launched itself (there's no supported way to inject input into a `claude` CLI it
  didn't start). Sessions you started elsewhere show up fully, but read-only.
- **Liveness** is confirmed by a `pid` + process-start-time fingerprint via `ps`,
  not by heartbeat freshness — a running-but-idle `claude` can be quiet for hours
  and still be alive. Recycled PIDs on stale registry files are rejected by the
  fingerprint.

## Layout

```
server/   Node (pure JS, no native deps): registry watcher, transcript tailer,
          state engine, tmux manager, notifier, HTTP + two WebSocket channels.
src/      Vite + React UI: session grid, cards, xterm.js terminal, launch dialog.
```
