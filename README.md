# oversee

**One screen for every Claude Code terminal.** The ones waiting on you float to the
top — launch new sessions, type into them, and drive them from your phone.

MIT-licensed · macOS (Apple Silicon) · local-only, no API, no account.

You run 10+ `claude` terminals and lose track of what you asked, which are working,
which are waiting on you, and what got done. oversee puts every session on one
screen: the ones **waiting for you** or **just finished** float to the top, and you
can **launch new sessions and type into them** without hunting through tabs — in the
browser, the desktop app, or over Telegram.

## Download (macOS)

Grab the latest `.dmg` from the
[**Releases**](https://github.com/diogoalmeidaribeiro/oversee/releases) page and drag
oversee into Applications.

It's a free, **unsigned** build, so macOS Gatekeeper blocks it on first launch. Open
it the hard way once and macOS remembers your choice:

- **Right-click the app → Open → Open**, or
- run `xattr -dr com.apple.quarantine /Applications/oversee.app`

**You'll also need:**

- The [`claude`](https://docs.anthropic.com/en/docs/claude-code) CLI on your `PATH`.
- [`tmux`](https://github.com/tmux/tmux) to launch/drive sessions — `brew install tmux`.
  Without it, oversee still runs in monitor-only mode.
- *(optional, for Telegram voice)* `ffmpeg` + a local whisper — see below.

Open the app; every running `claude` session shows up automatically.

## Run from source

```bash
npm install
npm start        # builds the UI + serves on http://localhost:4600 (loopback only)
```

Development with hot-reload:

```bash
npm run dev            # UI on http://localhost:5180, server on :4600 (proxied)
npm run electron:dev   # the desktop shell, in dev
```

Build your own app bundle (DMG + zip land in `release/`):

```bash
npm run dist
```

The server binds to **loopback only** by default. To reach the UI from another
device (e.g. your phone), set `MC_HOST=0.0.0.0` — but only on a network you trust:
there is no authentication. See [SECURITY.md](SECURITY.md).

## How it works

It reads the files Claude Code already writes — no API, no config:

- `~/.claude/sessions/<pid>.json` — live per-process registry; the `status` field
  (`busy` / `waiting` / `idle` / `shell`) is the ground truth for each session's state.
- `~/.claude/projects/<slug>/<sessionId>.jsonl` — the transcript, joined by
  `sessionId`, for the auto-title, last prompt, current activity, files touched, and tokens.

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
  panels.
- **Per session** — auto-title, last ask, current tool activity, files touched,
  token count, last-turn duration, and (on expand) a live `git diff` stat.
- **Launch + drive** — the **+ Launch session** button starts `claude` in a folder
  you pick, owned by the hub. Click **Open terminal** to type into it in the browser.
- **Alerts** — native macOS notification on `busy → waiting` ("needs your input")
  and on finish, plus a `(N)` tab-title count and a sound when the tab is unfocused
  (mute with the 🔔 toggle). Anti-spam: per-session cooldown, burst coalescing, and
  a startup grace so restarting the hub never floods you.

## Drive terminals from Telegram (text + voice)

Once Telegram is linked (Settings → Notifications, or `MC_TG_TOKEN`/`MC_TG_CHAT`),
the bot is two-way — from your phone you can drive any hub-launched terminal:

- `/sessions` — list drivable terminals, `/use <n>` — pick the one to drive.
- Send **any text** → it's typed into that session + Enter, and the bot replies
  with a snapshot of the pane a couple seconds later.
- Send a **voice note** → transcribed locally, echoed back, then typed in.
- `/follow <n>` — **live-stream** the terminal: one message that updates in place as
  the pane changes (raw screen, so you see menus and the working state); `/unfollow`
  to stop. `/peek` is the one-shot version.
- `/enter` `/esc` `/up` `/down` `/key <name>` (e.g. `C-c`, `Tab`) — press a key to
  drive Claude's menus.

Everything stays locked to the single linked chat. Only `cc_*` (hub-launched)
sessions are drivable — see the read-only note below.

**Voice setup (fully local, no API).** Transcription auto-detects one of:
- [`openai-whisper`](https://github.com/openai/whisper) — the `whisper` CLI
  (`pip install -U openai-whisper`); accepts the voice note directly. Zero config.
- [`whisper.cpp`](https://github.com/ggerganov/whisper.cpp) — faster; `brew install
  whisper-cpp`, grab a model (e.g. `ggml-base.en.bin`), then set `MC_WHISPER=whisper-cli`
  and `MC_WHISPER_MODEL=/path/to/ggml-base.en.bin`.

Both need `ffmpeg` on PATH. Language auto-detects; pin it with `MC_WHISPER_LANG=en`
(or `pt`, …). Without a backend, text driving still works; voice returns a hint.

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
          state engine, tmux manager, notifier + Telegram bot, voice transcribe,
          HTTP + two WebSocket channels.
src/      Vite + React UI: session grid, cards, xterm.js terminal, launch dialog.
electron/ Desktop shell — forks the server on a loopback port, opens a window.
landing/  Marketing site (reuses the real UI components for the hero mock).
```

## Contributing

Issues and PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). For security
reports, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 Diogo Ribeiro.
