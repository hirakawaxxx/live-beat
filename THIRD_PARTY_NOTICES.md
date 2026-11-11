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
(felt piano arpeggio, nylon guitar strum) are public domain. No attribution is
required. This app still names the source in the library footer.

- Fetched: 2026-11-11
- Source URL pattern:
  `https://huggingface.co/datasets/cueharbor/sound-library/resolve/main/{path}`
  (paths under `loops/drums/`, `loops/melodic/`, `loops/percussion/`)
- Fetch script: `scripts/fetch-cueharbor.mjs`
- Layout: `public/packs/cueharbor/{bpm}/{kit}/{part}.wav` (BPM 100 and 120;
  some kit parts are copies of another kit's loop)
