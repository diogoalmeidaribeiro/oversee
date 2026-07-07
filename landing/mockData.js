// Canned, fictional fleet so the hero mock is the real app UI without a server.
// Everything here is made up — projects, paths, prompts.
const S = 1000, M = 60 * S

export const MOCK_SESSIONS = [
  {
    sessionId: 'a1', cwd: '/Users/you/code/atlas-api', cwdName: 'atlas-api',
    state: 'waiting', justFinished: false, rawStatus: 'waiting',
    title: 'Add rate limiting to the public API', lastPrompt: 'Cap it at 100 req/min per key and return 429 with Retry-After',
    activity: null, filesCount: 8, tokensOut: 41200, lastTurn: { durationMs: 3 * M + 12 * S },
    ageMs: 40 * S, filesTouched: ['ratelimit.ts', 'middleware.ts', 'keys.ts'],
    doneSinceStart: 3, filesSinceStart: 22, tokensSinceStart: 128000, queued: 0,
  },
  {
    sessionId: 'a2', cwd: '/Users/you/code/nova-web', cwdName: 'nova-web',
    state: 'working', justFinished: false, rawStatus: 'busy',
    title: 'Refactor the checkout flow', lastPrompt: 'Split checkout into steps and persist progress between reloads',
    activity: 'Editing Checkout.tsx', filesCount: 5, tokensOut: 28800, lastTurn: { durationMs: 1 * M + 44 * S },
    ageMs: 6 * S, filesTouched: ['Checkout.tsx', 'useCheckout.ts', 'steps.ts'],
    doneSinceStart: 5, filesSinceStart: 31, tokensSinceStart: 214000, queued: 2,
  },
  {
    sessionId: 'a3', cwd: '/Users/you/code/nova-web', cwdName: 'nova-web',
    state: 'idle', justFinished: true, rawStatus: 'idle',
    title: 'Polish the empty states', lastPrompt: 'Give every empty list a friendly icon + one-line hint',
    activity: null, filesCount: 3, tokensOut: 15400, lastTurn: { durationMs: 52 * S },
    ageMs: 22 * S, filesTouched: ['EmptyState.tsx', 'lists.tsx'],
    doneSinceStart: 4, filesSinceStart: 12, tokensSinceStart: 78000, queued: 0,
  },
  {
    sessionId: 'a4', cwd: '/Users/you/code/ledger', cwdName: 'ledger',
    state: 'working', justFinished: false, rawStatus: 'busy',
    title: 'Migrate to the new billing webhook', lastPrompt: 'Port the webhook handler to v2 and add signature verification + retries',
    activity: 'Running tests', filesCount: 11, tokensOut: 63100, lastTurn: { durationMs: 4 * M + 8 * S },
    ageMs: 3 * S, filesTouched: ['webhook.ts', 'verify.ts', 'retry.ts', 'webhook.test.ts'],
    doneSinceStart: 7, filesSinceStart: 44, tokensSinceStart: 331000, queued: 1,
  },
  {
    sessionId: 'a5', cwd: '/Users/you/code/ledger', cwdName: 'ledger',
    state: 'waiting', justFinished: false, rawStatus: 'waiting',
    title: 'Fix the flaky currency test', lastPrompt: 'Should amounts round half-up or use banker’s rounding?',
    activity: null, filesCount: 2, tokensOut: 9800, lastTurn: { durationMs: 28 * S },
    ageMs: 71 * S, filesTouched: ['money.ts', 'money.test.ts'],
    doneSinceStart: 2, filesSinceStart: 6, tokensSinceStart: 41000, queued: 0,
  },
  {
    sessionId: 'a6', cwd: '/Users/you/code/pixel', cwdName: 'pixel',
    state: 'idle', justFinished: false, rawStatus: 'idle',
    title: 'Add SVG export', lastPrompt: 'Export the current canvas selection to a clean, minified SVG',
    activity: null, filesCount: 4, tokensOut: 18700, lastTurn: { durationMs: 1 * M + 9 * S },
    ageMs: 14 * M, filesTouched: ['export.ts', 'Canvas.tsx'],
    doneSinceStart: 6, filesSinceStart: 19, tokensSinceStart: 96000, queued: 0,
  },
]

export const MOCK_TASKS = [
  { id: 1, text: 'Ship rate limiting #atlas-api', status: 'todo', agent: null },
  { id: 2, text: 'Rework checkout steps #nova-web', status: 'in_progress', agent: 'nova-web' },
  { id: 3, text: 'Billing webhook v2 + retries #ledger', status: 'in_progress', agent: 'ledger' },
  { id: 4, text: 'SVG export for the canvas #pixel', status: 'done', agent: 'pixel' },
  { id: 5, text: 'Audit env var loading #atlas-api', status: 'todo', agent: null },
  { id: 6, text: 'Dark-mode polish pass', status: 'todo', agent: null },
]

export const MOCK_DONE_FEED = []
