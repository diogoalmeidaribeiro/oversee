# Contributing

Thanks for your interest in oversee! It's a small, dependency-light project and
contributions are welcome.

## Getting set up

```bash
git clone https://github.com/diogoalmeidaribeiro/oversee.git
cd oversee
npm install
npm run dev        # UI on http://localhost:5180, server on :4600 (proxied)
```

For the desktop shell during development:

```bash
npm run electron:dev
```

Requirements: **Node ≥ 18**, **tmux** (to launch/drive sessions), and the
**`claude`** CLI on your PATH. Voice transcription is optional (see the README).

## Guidelines

- **Keep it dependency-light.** The server is pure JS with only `ws`, `chokidar`,
  and `node-notifier`. Please avoid adding runtime dependencies without a good
  reason, and never add native modules to the server.
- **Match the surrounding style.** No formatter is enforced; mirror the existing
  code — 2-space indent, no semicolons where the file omits them, and the concise
  comment style that explains *why*.
- **Small, focused PRs** are easier to review. Describe what changed and how you
  tested it.
- **Test your change end-to-end** by running the app (`npm run dev` or
  `npm run electron:dev`) and exercising the affected path, not just that it builds.

## Reporting bugs / ideas

Open an issue at
https://github.com/diogoalmeidaribeiro/oversee/issues with steps to reproduce
(macOS version, Node version, and what you saw vs. expected). For security
issues, see [SECURITY.md](SECURITY.md) instead.

By contributing, you agree your contributions are licensed under the project's
[MIT License](LICENSE).
