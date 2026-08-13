# ADR-0001: No build step, plain ES modules

## Status
Accepted

## Date
2026-08-02

## Context

The app is distributed to school and college fest organisers, many of whom
are teachers rather than developers. The predecessor system was Google Apps
Script, where deployment meant pasting code into an editor and clicking
Deploy — no tooling to install.

A React + Vite + TypeScript build was the original plan. It requires Node,
npm install, and a build command before every deploy. For the target user
that is not a minor inconvenience; it is the difference between adopting the
tool and not.

## Decision

Plain JavaScript ES modules, loaded directly by the browser. The Firebase SDK
is imported from Google's CDN as ES modules. No bundler, no transpiler, no
package.json.

Deployment is: edit `config.js`, drag the folder onto Netlify Drop.

## Consequences

**Good**
- Deploy in minutes with no software installed
- Edit-and-reload development loop, same as Apps Script
- No dependency tree to age, no lockfile, no audit warnings
- Nothing to rebuild when a fest is picked up again a year later

**Bad**
- No TypeScript, so type errors surface at runtime
- More hand-written DOM code than JSX would need
- No tree-shaking or minification; first load ships more bytes
- No npm ecosystem — dnd-kit, chart libraries and similar are unavailable,
  so drag-reorder and PDF output are implemented directly

**Mitigations**
- Pure domain logic is isolated in `js/domain/` and covered by `tests.html`
- `lib/ui.js` provides the small component vocabulary JSX would have
- Module files are loaded on demand per admin screen, limiting first paint cost
