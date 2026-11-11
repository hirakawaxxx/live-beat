# Third-party notices

## Zen Maru Gothic

The files in `public/fonts/` are subsets of Zen Maru Gothic, Copyright 2021 The
Zen Maru Gothic Project Authors. They are licensed under the SIL Open Font
License, Version 1.1. See `public/fonts/OFL.txt`.

## Loops — MuseScore_General SoundFont (MIT)

Every loop under `public/packs/originals/` is an original note pattern written
for live-beat (`scripts/render-originals.py`) and rendered to WAV with
FluidSynth using the MuseScore_General SoundFont. The SoundFont itself is not
shipped; only the rendered audio is.

- SoundFont: MuseScore_General.sf3 (MIT). FluidR3 by Frank Wen (c) 2000-02,
  FluidR3Mono by Michael Cowgill (c) 2014-17, adaptation by S. Christian
  Collins (c) 2018-19.
- Fetched: 2026-11-11
- Source URL:
  `https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf3`
- License text: `public/packs/licenses/musescore-general.txt`
- Layout: `public/packs/originals/{tempo}/{kit}/{part}.wav`

## Credits page

The SoundFont and font credits are also shown in the app at `/credits`
(`public/credits.html`), linked from the library footer.
