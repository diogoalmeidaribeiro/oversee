# Security

oversee is a local developer tool with a broad reach into your machine, so it's
worth understanding what it can do before you run it or expose it.

## What it can access

- **Reads** `~/.claude/sessions/` and `~/.claude/projects/` — the live session
  registry and full transcripts of every Claude Code session on the machine.
- **Launches and drives** terminals: sessions it starts run `claude` inside tmux,
  and it can type arbitrary input into them (which can run arbitrary commands).
- **Telegram bot (optional):** when linked, the linked chat can drive terminals
  (text + voice) — i.e. run commands on your machine — and read pane output.
- **Voice transcription (optional):** local only. Audio never leaves the machine;
  it's transcribed with whisper.cpp or the `openai-whisper` CLI on your box.

## Network exposure

- The server binds to **`127.0.0.1` (loopback) by default** — not reachable from
  other machines. There is **no authentication**.
- You can opt into LAN exposure with `MC_HOST=0.0.0.0` (e.g. to open the UI from a
  phone). **Only do this on a network you trust** — anyone who can reach the port
  can launch and drive terminals and read all your transcripts. Prefer an SSH
  tunnel or a private overlay network (Tailscale, etc.) over binding to `0.0.0.0`.
- The Electron app always uses an ephemeral loopback port.

## Telegram notes

- Only the single linked `chatId` is honored; other chats are ignored.
- The bot token grants control of the bot — treat it like a password. It's stored
  in `~/.claude/oversee-settings.json` (outside the repo) or passed via
  `MC_TG_TOKEN`/`MC_TG_CHAT`.
- Anyone with your bot token + chat can drive your terminals. Revoke via
  @BotFather if leaked.

## Reporting a vulnerability

Please report security issues privately to **diogo@brocode.studio** rather than
opening a public issue. We'll acknowledge and work on a fix before disclosure.
