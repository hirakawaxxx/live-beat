# Loop Cycle Sync + Ring Indicators Implementation Plan

> **この文書は古い内容を含みます。** 音源・パッド構成・同期ルール・BPM の現行仕様は `docs/superpowers/specs/2026-11-11-self-made-packs-design.md` を正とします。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quantize pad joins to the longest active loop cycle and show Soft Mint circular beat rings on each pad.

**Architecture:** Extend pure timing helpers; audio-engine uses max active loop duration for boundaries; play UI draws SVG rings driven by engine transport snapshot via rAF.

**Tech Stack:** Existing vanilla ES modules, Web Audio, `node:test`

## Global Constraints

- Soft Mint only; no Groovepad black-neon clone
- CSP: no inline script/style
- TDD for timing helpers; `node --test`
- Work in `/Users/hdymacuser/repos/hirakawaxxx/live-beat/.worktrees/live-beat-impl`
- Spec addendum: `docs/superpowers/specs/2026-11-11-loop-cycle-sync-design.md`
- After JS/CSS changes run `node scripts/sw-revision.mjs` before final commit of UI assets if precached files change

---

### Task 1: Timing helpers for cycles and beats

**Files:**
- Modify: `public/js/timing.js`
- Modify: `test/timing.test.js`

**Interfaces:**
- Keep: `barDurationSec(bpm)`, `nextBarTime(currentTime, originTime, barDur)`
- Add: `beatDurationSec(bpm) => 60/bpm`
- Add: `beatsForDuration(durationSec, bpm) => Math.round(durationSec / beatDurationSec(bpm))`
- Add: `nextCycleTime(currentTime, originTime, cycleDur)` — same math as `nextBarTime` (may re-export alias)
- Add: `quantizeOnTime({ currentTime, originTime, barDur, activeCycleDurs })`  
  - if `activeCycleDurs` empty → `nextBarTime(..., barDur)` with MIN_LEAD handled by caller OR include lead in helper  
  - else → `nextBarTime(..., Math.max(...activeCycleDurs))`

- [ ] **Step 1:** Write failing tests for `beatDurationSec`, `beatsForDuration`, `quantizeOnTime` empty vs non-empty active cycles
- [ ] **Step 2:** Run `node --test test/timing.test.js` — expect FAIL
- [ ] **Step 3:** Implement helpers
- [ ] **Step 4:** Tests PASS
- [ ] **Step 5:** Commit `feat: add loop-cycle quantization helpers`

---

### Task 2: Audio engine longest-cycle boundaries + transport snapshot

**Files:**
- Modify: `public/js/audio-engine.js`

**Interfaces:**
- Replace `boundaryTime` to use `quantizeOnTime` with durations of pads that are active and not cancelled (include sounding + scheduled start, exclude pure disposed)
- Track `loopDuration` from buffer on load
- Expose `getPadTransport(padId)` or `getTransportSnapshot()`:
  ```js
  {
    currentTime, originTime, bpm,
    pads: {
      [padId]: {
        state: 'off' | 'waiting' | 'playing' | 'stopping',
        loopDuration, beats, startTime, stopTime | null,
        phase: number // 0..1 while playing/waiting relative to cycle
      }
    }
  }
  ```
- Phase while playing: `((currentTime - origin) % loopDuration) / loopDuration` using pad loopDuration
- Waiting: phase frozen at 0 or show master cycle progress — use master longest cycle progress for waiting pads

- [ ] **Step 1:** Implement engine changes
- [ ] **Step 2:** `node --check public/js/audio-engine.js` + full `node --test`
- [ ] **Step 3:** Commit `feat: quantize pads to longest active loop cycle`

---

### Task 3: Circular ring UI on pads

**Files:**
- Modify: `public/play-app.js`, `public/style.css`, `public/play.html` if needed
- Run: `node scripts/sw-revision.mjs`

**UI:**
- Each pad button contains: SVG ring (circle with stroke-dasharray segments) + label span
- Segments = beats (16 for Pulse). Soft Mint colors via CSS variables
- `data-state=off|waiting|playing`
- rAF reads `engine.getTransportSnapshot()` and updates `--ring-progress` (0–1) or stroke-dashoffset
- Prefer DOM APIs; no innerHTML with untrusted strings
- `prefers-reduced-motion: reduce` → snap updates, no smooth spin if any

- [ ] **Step 1:** Build ring markup in `createPadButton`
- [ ] **Step 2:** CSS Soft Mint ring states
- [ ] **Step 3:** rAF updater
- [ ] **Step 4:** `node --test` + `node scripts/sw-revision.mjs`
- [ ] **Step 5:** Commit `feat: show circular beat rings on pads`

---

## Spec coverage

| Requirement | Task |
|-------------|------|
| Longest active cycle wait | 1–2 |
| First pad uses bar boundary | 1–2 |
| Circular beat indicator | 3 |
| Soft Mint / CSP | 3 |
