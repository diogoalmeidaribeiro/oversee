import { Logo } from '../src/components/Logo.jsx'
import { HeroMock } from './HeroMock.jsx'
import { HeroShader } from './HeroShader.jsx'

const REPO = 'https://github.com/diogoalmeidaribeiro/oversee'
const DOWNLOAD = REPO + '/releases'

function Brackets() {
  return (
    <span className="lx" aria-hidden="true">
      <i className="lx-tl" /><i className="lx-tr" /><i className="lx-bl" /><i className="lx-br" />
    </span>
  )
}

const FEATURES = [
  { k: 'attention', t: 'Attention-first', d: 'WAITING and DONE cards sort to the top, red and pulsing. You always know exactly who needs you next.' },
  { k: 'drive', t: 'Launch & drive', d: 'Start a claude session in any folder and type into it — arrow keys, prompts, menus — straight from the window.' },
  { k: 'fleet', t: 'Fleet overview', d: 'needs-you · running · done · files · tokens · queued, totalled live across every project you have open.' },
  { k: 'alerts', t: 'Native alerts', d: 'A macOS notification the instant a session flips to “needs your input,” plus a tab badge and a sound when you’re away.' },
  { k: 'persist', t: 'Survives restarts', d: 'Launched sessions run inside tmux. Refresh, reopen, or restart the app — nothing is lost, scrollback intact.' },
  { k: 'local', t: 'Local-only', d: 'It reads the files Claude Code already writes in ~/.claude. No API, no account, no config, nothing leaves your machine.' },
]

const STEPS = [
  { n: '01', t: 'Run your claude terminals', d: 'As many as you want, in any folder. Keep working exactly how you already do.' },
  { n: '02', t: 'Open oversee', d: 'It watches ~/.claude/sessions and the transcripts Claude Code already writes — nothing to wire up.' },
  { n: '03', t: 'Everything on one screen', d: 'Attention-sorted, launchable, drivable. No API keys, no dashboards to configure.' },
]

function TerminalMock() {
  return (
    <div className="term">
      <Brackets />
      <div className="term-bar">
        <span className="tdot" /><span className="tdot" /><span className="tdot" />
        <span className="term-title">ledger — cc_7f3a2b</span>
      </div>
      <pre className="term-body">
{`❯ add retries to the billing webhook

`}<span className="tg">●</span>{` I'll wrap the handler in a backoff loop and add a
  max-attempts guard, then update the tests.

  `}<span className="tm">Updating</span>{` webhook.ts
  `}<span className="tm">Updating</span>{` retry.ts
  `}<span className="tm">Running</span>{`  webhook.test.ts

`}<span className="tgreen">✔</span>{` Done — 3 files changed, 14 tests passing.

❯ `}<span className="tcaret">▋</span>
      </pre>
    </div>
  )
}

export function Landing() {
  return (
    <div className="ov">
      <nav className="nav">
        <a className="nav-brand" href="#top"><Logo connected size={22} /><span className="brand-name">oversee</span></a>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href={REPO}>Source</a>
        </div>
        <a className="btn btn-sm" href={DOWNLOAD}>Download</a>
      </nav>

      {/* HERO */}
      <header className="hero" id="top">
        <HeroShader />
        <div className="hero-copy">
          <span className="eyebrow">LOCAL · NO API · FOR CLAUDE CODE</span>
          <h1 className="h1">Every Claude terminal,<br /><span className="accent">on one screen.</span></h1>
          <p className="lede">
            You run a dozen <code>claude</code> terminals and lose track of what you asked, which are working,
            and which are waiting on you. oversee floats the ones that need you to the top — and lets you launch
            new sessions and type into them without hunting through tabs.
          </p>
          <div className="cta-row">
            <a className="btn btn-lg" href={DOWNLOAD}><span className="apple"></span> Download for macOS</a>
            <a className="btn btn-lg btn-ghost" href={REPO}>View source ↗</a>
          </div>
          <div className="cta-meta">Apple Silicon · unsigned build — first launch: right-click → Open</div>
        </div>

        <div className="shell">
          <Brackets />
          <div className="shell-label"><span className="live" /> live · try it — drag a task onto an agent, expand a card</div>
          <div className="shell-inner"><HeroMock /></div>
        </div>
      </header>

      {/* FEATURES */}
      <section className="section" id="features">
        <div className="sec-head">
          <span className="eyebrow">WHAT YOU GET</span>
          <h2 className="h2">A control room for your agents.</h2>
        </div>
        <div className="grid">
          {FEATURES.map((f) => (
            <div className="card-f" key={f.k}>
              <Brackets />
              <div className="card-f-t">{f.t}</div>
              <div className="card-f-d">{f.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* DRIVE */}
      <section className="section split">
        <div className="split-copy">
          <span className="eyebrow">DRIVE, DON’T JUST WATCH</span>
          <h2 className="h2">Type into any session, from one window.</h2>
          <p className="lede">
            Sessions oversee launches run inside <strong>tmux</strong>. Open the embedded terminal to drive them:
            answer a prompt, pick a menu option, paste a fix. Close it and reopen later — it reattaches with your
            scrollback intact.
          </p>
          <ul className="ticks">
            <li>Full keyboard: arrows, enter, Claude’s selector menus</li>
            <li>Drag a task from the inbox onto an agent to dispatch it</li>
            <li>Resize the terminal; the pane follows</li>
          </ul>
        </div>
        <TerminalMock />
      </section>

      {/* HOW */}
      <section className="section" id="how">
        <div className="sec-head">
          <span className="eyebrow">HOW IT WORKS</span>
          <h2 className="h2">No API. No config. No account.</h2>
        </div>
        <div className="steps">
          {STEPS.map((s) => (
            <div className="step" key={s.n}>
              <div className="step-n">{s.n}</div>
              <div className="step-t">{s.t}</div>
              <div className="step-d">{s.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* SPECS STRIP */}
      <div className="specs">
        {['Local-only', 'No API keys', 'macOS · Apple Silicon', 'tmux-backed', 'Reads ~/.claude', 'Open source'].map((s) => (
          <span className="spec" key={s}>{s}</span>
        ))}
      </div>

      {/* FINAL CTA */}
      <section className="final">
        <Brackets />
        <h2 className="h2">Stop hunting through terminal tabs.</h2>
        <p className="lede center">It’s local, free, and reads nothing but the files already on your machine.</p>
        <div className="cta-row center">
          <a className="btn btn-lg" href={DOWNLOAD}><span className="apple"></span> Download oversee</a>
          <a className="btn btn-lg btn-ghost" href={REPO}>Read the source ↗</a>
        </div>
      </section>

      <footer className="foot">
        <div className="foot-brand"><Logo connected size={18} /><span className="brand-name">oversee</span></div>
        <span className="foot-mid">built for Claude Code</span>
        <div className="foot-links">
          <a href={REPO}>GitHub</a>
          <span>© 2026</span>
        </div>
      </footer>
    </div>
  )
}
