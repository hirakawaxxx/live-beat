# Third-party notices

## Zen Maru Gothic

The files in `public/fonts/` are subsets of Zen Maru Gothic, Copyright 2021 The
Zen Maru Gothic Project Authors. They are licensed under the SIL Open Font
License, Version 1.1. See `public/fonts/OFL.txt`.

## Pulse Open Loops

Loop samples are vendored under `public/packs/` from
[Pulse Open Loops](https://pulse.studiosphere.space/open-loops/kits).
Those samples are dedicated to the public domain under CC0 1.0.
No attribution is required. This app still names the source in the library
footer.

- Fetched: 2026-11-11
- Source URL pattern:
  `https://pulse.studiosphere.space/open-loops/kits/{slug}-{bpm}/download`
  (slugs: copper-step, ember-weave, glass-orbit, ion-bloom, lunar-relay,
  prism-current, rust-arc, velvet-grid; BPM: 96, 120, 140)
- Fetch script: `scripts/fetch-pulse-kits.mjs`
- Per-kit license text: `public/packs/licenses/{slug}-{bpm}.txt` (CC0-1.0)

## CueHarbor Sound Library

Loop samples under `public/packs/cueharbor/` are vendored from the
[CueHarbor Sound Library](https://huggingface.co/datasets/cueharbor/sound-library)
dataset on Hugging Face. The dataset is licensed CC0 1.0; the melodic loops
(felt piano arpeggio, nylon guitar strum/arpeggio) are public domain. No attribution is
required. This app still names the source in the library footer.

- Fetched: 2026-11-11
- Source URL pattern:
  `https://huggingface.co/datasets/cueharbor/sound-library/resolve/main/{path}`
  (paths under `loops/drums/`, `loops/melodic/`, `loops/percussion/`)
- Fetch script: `scripts/fetch-cueharbor.mjs`
- Layout: `public/packs/cueharbor/{bpm}/{kit}/{part}.wav` (BPM 90, 96, 100 and
  120; some kit parts are copies of another kit's loop, and parts with no
  same-BPM loop (90 percussion, 96 bass) reuse a drum loop)
- 90 BPM: rock-beat, arcade-game-drum-loop-14, felt-piano-arpeggio (d-min).
  96 BPM: shuffle, cajon-groove, nylon-guitar-arpeggio (e-min).

## Colorosse music loops

Loop stems under `public/packs/colorosse/` are vendored from the CC0 music
loops by [Colorosse](https://www.colorosse.com): Arcade Loop (A Aeolian,
151.999 BPM) and Market Loop "Vellum" (G Mixolydian, 127.999 BPM). Both are
CC0 1.0 (procedural synthesis, no samples). No attribution is required; the app
still names the source in the library footer.

- Fetched: 2026-11-11
- Source URLs:
  `https://cdn.colorosse.com/downloads/arcade-music-loop/arcade-music-loop.zip`
  and
  `https://cdn.colorosse.com/downloads/vellum-music-loop/vellum-music-loop.zip`
- Fetch script: `scripts/fetch-colorosse.mjs`
- Layout: `public/packs/colorosse/{bpm}/{kit}/{drums,bass,chords,percussion}.wav`
  (the `lead` stem is stored as `percussion.wav`; catalog packs repeat the one
  kit as three labelled kit slugs sharing the same files)
- Per-loop license text: `public/packs/licenses/colorosse-{name}-{bpm}.txt`
  (CC0-1.0)
