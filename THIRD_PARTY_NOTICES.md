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

## Colorosse music loops (CC BY 4.0)

Loop stems under `public/packs/colorosse/{62,52,108,84}/` are vendored from
four music loops by [Colorosse](https://www.colorosse.com), licensed under
[Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)
(CC BY 4.0). **Attribution is required.** Unmodified WAV stems; no samples or
generative models were used by the author (procedural synthesis).

- "Anvil — Crypt Loop" by Oğuzhan Girgin (Colorosse), licensed under CC BY 4.0 —
  <https://www.colorosse.com/assets/audio/music/anvil-music-loop> (62 BPM)
- "Prism — Void Loop" by Oğuzhan Girgin (Colorosse), licensed under CC BY 4.0 —
  <https://www.colorosse.com/assets/audio/music/prism-music-loop> (52 BPM)
- "Rust — Neon Loop" by Oğuzhan Girgin (Colorosse), licensed under CC BY 4.0 —
  <https://www.colorosse.com/assets/audio/music/rust-music-loop> (108 BPM)
- "Timber — Hearth Loop" by Oğuzhan Girgin (Colorosse), licensed under CC BY 4.0 —
  <https://www.colorosse.com/assets/audio/music/timber-music-loop> (84 BPM)

- Fetched: 2026-11-11
- Source URLs:
  `https://cdn.colorosse.com/downloads/{anvil,prism,rust,timber}-music-loop/{name}-music-loop.zip`
- Fetch script: `scripts/fetch-colorosse.mjs`; catalog packs: `scripts/add-ccby-packs.mjs`
- Layout: `public/packs/colorosse/{bpm}/{name}-kit/{drums,bass,chords,percussion}.wav`
  - Anvil, Rust: drums / bass / chords stems; `lead` stored as `percussion.wav`.
  - Prism has no drums or lead stem: `texture` is stored as `drums.wav` and
    `bells` as `percussion.wav`.
  - Timber has no drums stem: its catalog drums slot plays `bass.wav`
    (pad labels say "bass (drums slot)"); `lead` is `percussion.wav`.
- Per-loop license text (with the author's attribution line):
  `public/packs/licenses/colorosse-{name}-{bpm}.txt` (CC-BY-4.0)
- The author asks (not a license condition) that the loops are not rehosted as a
  pack and not used to train generative models.

## Of Far Different Nature — LOOP BOX #1 (CC BY 4.0)

Loops under `public/packs/oga-ofdn/` come from
[LOOP BOX #1](https://opengameart.org/content/loop-box-1-beats-for-rpg-platformers-visual-novels-adventure-puzzle-games-simulators-menu)
on OpenGameArt, licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode).
**Attribution is required**, in the form requested by the author:

> Music by Of Far Different Nature (<https://fardifferent.carrd.co/>)

Tracks used (7 of 15): "Just Do It", "Nature Loop", "Friendly Trap", "Timed"
(140 BPM); "8-Bit Hero Quest", "Act and Contemplate" (130 BPM); "Choppin"
(128 BPM, offered as a same-BPM replacement sound, not in a pack).

- Changes made: converted from OGG to 16-bit PCM WAV with ffmpeg; no other
  processing. The ZIP carries no BPM metadata, so each BPM was derived from the
  loop length (a whole number of beats at that BPM) and is not author-stated.
- Fetched: 2026-11-11
- Source URL:
  `https://opengameart.org/sites/default/files/of_far_different_nature_-_loop_box_1_cc-by_-_ogg_files.zip`
- Fetch script: `scripts/fetch-ofdn.mjs`
- Layout: `public/packs/oga-ofdn/{bpm}/{slug}-kit/chords.wav` (full-mix loops use
  the `chords` part)
- License text: `public/packs/licenses/oga-ofdn-loop-box-1.txt`

## Credits page

All CC0 and CC BY works are also listed in the app at `/credits`
(`public/credits.html`), linked from the library footer.
