# /// script
# requires-python = ">=3.10"
# dependencies = ["mido", "soundfile", "numpy"]
# ///
# Renders the self-made packs. Every pack has 6 categories x 8 loops at the pack's own tempo, in
# one key over one 4-bar chord progression, so every loop in a pack layers with every other.
# Each loop has its natural length: drums and percussion are 1 bar (a few are 2 beats or 2 bars),
# pitched parts are 4 bars because they follow the progression.
# Loops are written as note patterns below and rendered with FluidSynth + MuseScore_General.
#
# Needs: fluidsynth on PATH, and the SoundFont at .soundfonts/MuseScore_General.sf3
#   (https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf3, MIT)
# Run:   uv run scripts/render-originals.py
# Output: public/packs/originals/{tempo}/{kit}/{part}.wav and public/packs/catalog.json
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import mido
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
SOUNDFONT = ROOT / ".soundfonts" / "MuseScore_General.sf3"
OUT_DIR = ROOT / "public" / "packs" / "originals"
CATALOG = ROOT / "public" / "packs" / "catalog.json"

SR = 44100
PPQ = 480
STEP_TICKS = PPQ // 4  # one step = a 16th note
BAR_STEPS = 16
PROGRESSION_STEPS = 4 * BAR_STEPS
TAIL_STEPS = 4 * BAR_STEPS  # rendered after the loop so release tails can be folded back
DRUM_CHANNEL = 9
PACK_LICENSE = "live-beat original / 音色: MuseScore_General (MIT)"

VELOCITY = {"X": 115, "x": 95, "o": 70, "-": 45}

# GM percussion keys
KICK, RIM, SNARE, CLAP, HAT, PEDAL, OPEN_HAT = 36, 37, 38, 39, 42, 44, 46
TOM_LO, TOM_MID, TOM_HI, CRASH, RIDE, RIDE_BELL = 45, 47, 50, 49, 51, 53
TAMB, COWBELL, BONGO_HI, BONGO_LO, CONGA_MUTE, CONGA_HI = 54, 56, 60, 61, 62, 63
CABASA, MARACAS, CLAVES, BLOCK_HI, BLOCK_LO, TRI_MUTE, TRI_OPEN, SHAKER = 69, 70, 75, 76, 77, 80, 81, 82

EVERY_8TH = range(0, 16, 2)
EVERY_16TH = range(16)
REST_BAR = "." * BAR_STEPS

# The progression of the pack being built: one dict per bar with the bass root, the melody root
# (MIDI notes), semitones from root to the chord third, and the chord voicing. Set by main().
BARS = []


def chord(root, lead, third, voicing):
    return {"root": root, "lead": lead, "third": third, "voicing": voicing}


def hits(pattern: str):
    """(step, velocity) for a step string such as 'X...x...' (one character per 16th note)."""
    return [(i, VELOCITY[c]) for i, c in enumerate(pattern) if c != "."]


def beat(*sections):
    """Unpitched loop. Each section is {gm_key: step string}; sections play one after another.
    The loop is as long as its step strings: 8 characters = 2 beats, 16 = 1 bar."""
    notes, offset = [], 0
    for section in sections:
        (length,) = {len(pattern) for pattern in section.values()}
        for key, pattern in section.items():
            notes += [(offset + step, key, vel, 1) for step, vel in hits(pattern)]
        offset += length
    return notes, offset


def line(pattern, base="root", velocity=100):
    """One bar of (step, tone, length) repeated over the progression.
    tone: 'r' root, '3' third, '5' fifth, '8' octave above the bar's `base` note."""
    notes = []
    for bar, ch in enumerate(BARS):
        tones = {"r": 0, "3": ch["third"], "5": 7, "8": 12}
        for step, tone, length in pattern:
            notes.append((bar * BAR_STEPS + step, ch[base] + tones[tone], velocity, length))
    return notes, PROGRESSION_STEPS


def stabs(pattern, length, octave=0):
    """Full voicing on every hit of a one-bar step string."""
    notes = [
        (bar * BAR_STEPS + step, note + 12 * octave, vel, length)
        for bar, ch in enumerate(BARS)
        for step, vel in hits(pattern)
        for note in ch["voicing"]
    ]
    return notes, PROGRESSION_STEPS


def arp(order, steps, length, velocity=90, octave=0):
    """One note at a time on the given steps of each bar.
    order: indexes into the bar's voicing plus its lowest note an octave up, cycled."""
    notes = []
    for bar, ch in enumerate(BARS):
        pool = ch["voicing"] + [ch["voicing"][0] + 12]
        for i, step in enumerate(steps):
            index = min(order[i % len(order)], len(pool) - 1)
            notes.append((bar * BAR_STEPS + step, pool[index] + 12 * octave, velocity, length))
    return notes, PROGRESSION_STEPS


def tune(*bars, velocity=95):
    """Explicit melody: one list of (step, midi note, length) per bar."""
    assert len(bars) == 4
    notes = [(bar * BAR_STEPS + step, note, velocity, length) for bar, part in enumerate(bars) for step, note, length in part]
    return notes, PROGRESSION_STEPS


def both(*loops):
    return [n for notes, _ in loops for n in notes], loops[0][1]


WHOLE = "x..............."


def voice_loops(top_line):
    """The eight voice loops; top_line is one high note per bar for the single-line loops."""
    held = tune(*[[(0, note, 16)] for note in top_line], velocity=100)
    return [
        ("Aahs", 52, stabs(WHOLE, 16)),
        ("Oohs", 53, stabs(WHOLE, 16, octave=1)),
        ("Synth Voice", 54, stabs("x.....x.........", 4)),
        ("Aah Line", 52, held),
        ("Ooh Pulse", 53, stabs("x...x...x...x...", 3)),
        ("Choir Pad", 91, stabs(WHOLE, 16, octave=1)),
        ("Voice Arp", 54, arp([0, 1, 2, 3], range(0, 16, 4), 4, octave=1)),
        ("Ooh Sigh", 53, arp([2, 1], [0, 8], 6, octave=1)),
    ]


# Each function returns category -> eight loops of
# (label, General MIDI program (0-based; None = the pack's drum kit), loop).

def originals_am():
    return {
        "drums": [
            ("House", None, beat({KICK: "X...X...X...X...", CLAP: "....X.......X...", HAT: "-.x.-.x.-.x.-.x."})),
            ("Boom Bap", None, beat({KICK: "X......x..x.....", SNARE: "....X.......X...", HAT: "x.o.x.o.x.o.x.o."})),
            ("Rock", None, beat({KICK: "X.......X.x.....", SNARE: "....X.......X...", HAT: "x.o.x.o.x.o.x.o."})),
            ("Half Time", None, beat({KICK: "X.........x.....", SNARE: "........X.......", HAT: "x.x.x.x-x.x.xxx."})),
            ("Funk", None, beat(  # 2 bars
                {KICK: "X..x..x...x..x..", SNARE: "....X..-.-..X..-", HAT: "xoxoxoxoxoxoxoxo"},
                {KICK: "X..x..x...x.x...", SNARE: "....X..-.-..X.xx", HAT: "xoxoxoxoxoxoxoxo"},
            )),
            ("Disco", None, beat({KICK: "X...X...X...X...", SNARE: "....X.......X...", OPEN_HAT: "..x...x...x...x.", HAT: "o...o...o...o..."})),
            ("Break", None, beat(  # 2 bars
                {KICK: "X.X.......XX....", SNARE: "....X..o.o..X..o", HAT: "x.x.x.x.x.x.x.x."},
                {KICK: "X.X.......X..X..", SNARE: "....X..o.o..X.Xo", HAT: "x.x.x.x.x.x.x.x."},
            )),
            ("Electro", None, beat({KICK: "X...X..xX...X.x.", RIM: "..x..x....x..x..", CLAP: "....X.......X...", HAT: "o-o-o-o-o-o-o-o-"})),
        ],
        "bass": [
            ("Octave", 38, line([(s, "r" if s % 4 == 0 else "8", 2) for s in EVERY_8TH])),
            ("Finger", 33, line([(0, "r", 3), (7, "r", 1), (10, "r", 3), (14, "5", 2)])),
            ("Pick 8ths", 34, line([(s, "r", 2) for s in range(0, 14, 2)] + [(14, "5", 2)])),
            ("Sub", 39, line([(0, "r", 10), (10, "r", 6)])),
            ("Slap", 36, line([(0, "r", 2), (3, "r", 1), (6, "8", 1), (7, "r", 1), (10, "r", 2), (13, "5", 1), (14, "8", 2)])),
            ("Pump", 38, line([(2, "r", 2), (6, "r", 2), (10, "r", 2), (14, "r", 2)])),
            ("Walking", 32, line([(0, "r", 4), (4, "3", 4), (8, "5", 4), (12, "3", 4)])),
            ("Pulse", 39, line([(s, "8" if s in (6, 14) else "r", 1) for s in EVERY_16TH])),
        ],
        "chords": [
            ("Warm Pad", 89, stabs(WHOLE, 16)),
            ("E-Piano", 4, stabs("x..x..x...x.x...", 2)),
            ("Organ", 16, stabs("..x...x...x...x.", 2)),
            ("Strings", 48, both(stabs(WHOLE, 16), stabs(WHOLE, 16, octave=1))),
            ("Vibes", 11, stabs("x.....x.........", 6)),
            ("Rhodes", 5, stabs("x.........x.....", 6)),
            ("Skank", 28, both(stabs("....x.......x...", 1), stabs("......o.......o.", 1))),
            ("Brass", 62, stabs("x.....x...x.....", 3)),
        ],
        "melody": [
            ("Piano Arp", 0, arp([0, 1, 2, 1], EVERY_8TH, 2)),
            ("Guitar Arp", 24, arp([0, 1, 2, 3, 2, 1], EVERY_16TH, 2, velocity=85)),
            ("Saw Arp", 81, arp([0, 2, 1, 2], EVERY_16TH, 1, velocity=80, octave=1)),
            ("Harp", 46, arp([3, 2, 1, 0, 1, 2, 3, 2], EVERY_8TH, 3, velocity=85)),
            ("Marimba", 12, arp([0, 2, 1, 2, 0, 2, 1, 3], EVERY_8TH, 2, octave=1)),
            ("Flute", 73, tune(
                [(0, 76, 4), (4, 74, 2), (6, 72, 2), (8, 69, 8)],
                [(0, 72, 4), (4, 69, 4), (8, 72, 4), (12, 74, 4)],
                [(0, 76, 6), (6, 79, 2), (8, 76, 8)],
                [(0, 74, 4), (4, 71, 4), (8, 74, 6), (14, 76, 2)],
            )),
            ("Glocken", 9, arp([2, 0, 1, 2, 0, 1], [0, 3, 6, 8, 11, 14], 2, octave=2)),
            ("Square", 80, line([(0, "r", 2), (3, "5", 1), (4, "8", 2), (8, "5", 2), (11, "3", 1), (12, "r", 4)], base="lead", velocity=85)),
        ],
        "percussion": [
            ("Shaker", None, beat({SHAKER: "x-o-x-o-"})),  # 2 beats
            ("Tambourine", None, beat({TAMB: "..o.X.o...o.X.o."})),
            ("Congas", None, beat({CONGA_MUTE: "o.o.X.o.o.o.....", CONGA_HI: "............x.x."})),
            ("Bongos", None, beat({BONGO_HI: "x.o.x.o.x.o...o.", BONGO_LO: "............x..."})),
            ("Cowbell", None, beat({COWBELL: "x...x.x.x...x.x."})),
            ("Claves", None, beat({CLAVES: "x..x..x...x.x..."})),
            ("Cabasa", None, beat({CABASA: "x.o.x.o.x.o.x.o.", TRI_OPEN: "........x.......", TRI_MUTE: "x...x.......x..."})),
            ("Blocks", None, beat({BLOCK_HI: "x..x....x..x....", BLOCK_LO: "......x.......x."})),
        ],
        "voice": voice_loops([76, 77, 76, 74]),
    }


def hiphop_dm():
    return {
        "drums": [
            ("Trap", None, beat({KICK: "X.....x...x.....", CLAP: "........X.......", HAT: "x.x.x.x.x.xxx.x."})),
            ("Boom", None, beat({KICK: "X......x.xX.....", SNARE: "....X.......X...", HAT: "x.o.x.o.x.o.x.o."})),
            ("Bounce", None, beat({KICK: "X..x......x..x..", CLAP: "....X.......X...", HAT: "xxo.xxo.xxo.xxo."})),
            ("Sparse", None, beat({KICK: "X.........X.....", SNARE: "....X.......X..o", OPEN_HAT: "..............x."})),
            ("Drill", None, beat(  # 2 bars
                {KICK: "X.....x..x......", SNARE: "........X.......", HAT: "x.xx.xx.x.xx.xx."},
                {KICK: "X.....x..x..x...", SNARE: "........X.....x.", HAT: "x.xx.xx.x.xx.xx."},
            )),
            ("808 Clap", None, beat({KICK: "X...x...X...x...", CLAP: "....X.......X...", HAT: "..x...x...x...x."})),
            ("Swing Hat", None, beat({KICK: "X.....x.X.......", SNARE: "....X.......X...", HAT: "x-xox-xox-xox-xo"})),
            ("Slow", None, beat({KICK: "X...........x...", SNARE: "........X.......", HAT: "x...x...x...x...", OPEN_HAT: "......x.......x."})),
        ],
        "bass": [
            ("Sub Long", 39, line([(0, "r", 14)])),
            ("Sub Bounce", 39, line([(0, "r", 3), (3, "r", 3), (10, "r", 4)])),
            ("Octave Drop", 38, line([(0, "8", 2), (2, "r", 6), (10, "r", 2), (12, "8", 4)])),
            ("Slide", 38, line([(0, "r", 6), (6, "5", 2), (8, "r", 6), (14, "3", 2)])),
            ("Finger", 33, line([(0, "r", 3), (7, "r", 1), (8, "5", 3), (14, "r", 2)])),
            ("Stab", 38, line([(0, "r", 1), (3, "r", 1), (6, "r", 1), (10, "r", 1), (12, "r", 2)])),
            ("Fretless", 35, line([(0, "r", 8), (8, "3", 4), (12, "5", 4)])),
            ("Pulse", 39, line([(s, "r", 2) for s in range(0, 14, 2)] + [(14, "8", 2)])),
        ],
        "chords": [
            ("Dark Pad", 89, stabs(WHOLE, 16)),
            ("Piano", 0, stabs("x.......x.......", 6)),
            ("Strings", 48, both(stabs(WHOLE, 16), stabs(WHOLE, 16, octave=1))),
            ("E-Piano", 4, stabs("x..x..x.........", 3)),
            ("Organ", 16, stabs(WHOLE, 15)),
            ("Brass Hit", 61, stabs("x.........x.x...", 2)),
            ("Halo", 94, stabs(WHOLE, 16, octave=1)),
            ("Pizzicato", 45, stabs("x.x...x.x...x...", 1)),
        ],
        "melody": [
            ("Music Box", 10, arp([2, 1, 0, 1], [0, 6, 8, 14], 3, octave=1)),
            ("Piano Riff", 0, arp([3, 2, 1, 2], [0, 3, 6, 8, 11, 14], 2, octave=1)),
            ("Flute", 73, tune(
                [(0, 74, 6), (6, 77, 2), (8, 74, 8)],
                [(0, 77, 4), (4, 74, 4), (8, 70, 8)],
                [(0, 74, 6), (6, 70, 2), (8, 67, 8)],
                [(0, 73, 4), (4, 76, 4), (8, 73, 6), (14, 74, 2)],
            )),
            ("Koto", 107, arp([0, 2, 3, 2], EVERY_8TH, 2, octave=1)),
            ("Square", 80, line([(0, "r", 3), (4, "3", 2), (8, "5", 4), (14, "r", 2)], base="lead", velocity=85)),
            ("Kalimba", 108, arp([0, 1, 2, 3, 2, 1], EVERY_16TH, 1, velocity=80, octave=1)),
            ("Whistle", 78, tune(
                [(0, 81, 12), (12, 77, 4)],
                [(0, 82, 12), (12, 77, 4)],
                [(0, 79, 12), (12, 74, 4)],
                [(0, 76, 16)],
            )),
            ("Glocken", 9, arp([2, 0, 1], [0, 3, 6, 10, 12], 2, octave=2)),
        ],
        "percussion": [
            ("Hat Roll", None, beat({HAT: "x-x-xxxx"})),  # 2 beats
            ("Cowbell", None, beat({COWBELL: "x..x..x...x.x..."})),
            ("Claves", None, beat({CLAVES: "x..x...x..x.x..."})),
            ("Congas", None, beat({CONGA_MUTE: "o.o.X.o.o.o.....", CONGA_HI: "............x.x."})),
            ("Maracas", None, beat({MARACAS: "x.o.x.o.x.o.x.o."})),
            ("Rim", None, beat({RIM: "..x..x.x..x..x.x"})),
            ("Tom Fill", None, beat(  # 2 bars: silent bar, then a fill
                {TOM_LO: REST_BAR},
                {TOM_HI: "........x.x.....", TOM_MID: "............x...", TOM_LO: "..............xx"},
            )),
            ("Shaker", None, beat({SHAKER: "o-x-o-x-o-x-o-x-"})),
        ],
        "voice": voice_loops([77, 77, 79, 76]),
    }


def lofi_c():
    return {
        "drums": [
            ("Dusty", None, beat({KICK: "X.....x...X.....", SNARE: "....X.......X...", HAT: "x.o.x.o.x.o.x.o."})),
            ("Lazy", None, beat({KICK: "X..x......x.....", RIM: "....X.......X...", HAT: "x.o.x.o.x.o.x.o."})),
            ("Ride", None, beat({KICK: "X.........x.....", PEDAL: "....x.......x...", RIDE: "x.o.x.o.x.o.x.o."})),
            ("Bap", None, beat({KICK: "X......x..x..x..", SNARE: "....X.......X...", HAT: "x.x.x.x.x.x.x.x."})),
            ("Shuffle", None, beat(  # 2 bars
                {KICK: "X.....x...X.....", SNARE: "....X.......X...", HAT: "x.o.x.o.x.o.x.o."},
                {KICK: "X.....x..xX.....", SNARE: "....X..-....X.-x", HAT: "x.o.x.o.x.o.x.o."},
            )),
            ("Soft Kick", None, beat({KICK: "X.......x.x.....", RIM: "....x.......x...", HAT: "o.o.o.o.o.o.o.o."})),
            ("Half", None, beat({KICK: "X...............", SNARE: "........X.......", RIDE: "x.o.x.o.x.o.x.o."})),
            ("Ghost", None, beat({KICK: "X..x..x...x.....", SNARE: "....X.-..-..X..-", HAT: "x.o.x.o.x.o.x.o."})),
        ],
        "bass": [
            ("Upright", 32, line([(0, "r", 6), (8, "5", 4), (14, "r", 2)])),
            ("Walk", 32, line([(0, "r", 4), (4, "3", 4), (8, "5", 4), (12, "3", 4)])),
            ("Lazy", 33, line([(0, "r", 3), (6, "r", 2), (10, "5", 4)])),
            ("Fretless", 35, line([(0, "r", 10), (12, "5", 4)])),
            ("Two Feel", 32, line([(0, "r", 8), (8, "5", 8)])),
            ("Bounce", 33, line([(0, "r", 2), (3, "r", 1), (8, "r", 2), (11, "5", 1), (14, "8", 2)])),
            ("Sub", 39, line([(0, "r", 12)])),
            ("Octaves", 33, line([(0, "r", 4), (6, "8", 2), (8, "r", 4), (14, "8", 2)])),
        ],
        "chords": [
            ("Rhodes", 4, stabs(WHOLE, 14)),
            ("Rhodes Stab", 4, stabs("x..x......x.....", 3)),
            ("Wurli", 5, stabs("..x...x...x...x.", 2)),
            ("Jazz Guitar", 26, stabs("x.....x.........", 5)),
            ("Vibes", 11, stabs(WHOLE, 12)),
            ("Piano", 0, stabs("x.........x.x...", 3)),
            ("Warm Pad", 89, stabs(WHOLE, 16)),
            ("Nylon", 24, stabs("x...x...x...x...", 3)),
        ],
        "melody": [
            ("Rhodes Arp", 4, arp([0, 1, 2, 3, 4, 3, 2, 1], EVERY_8TH, 2)),
            ("Guitar Lick", 26, arp([4, 3, 2, 1], [0, 3, 6, 8], 3)),
            ("Vibes Line", 11, tune(
                [(0, 77, 4), (4, 76, 4), (8, 74, 8)],
                [(0, 74, 4), (4, 71, 4), (8, 74, 8)],
                [(0, 76, 6), (6, 79, 2), (8, 76, 8)],
                [(0, 72, 4), (4, 69, 4), (8, 72, 6), (14, 74, 2)],
            )),
            ("Flute", 73, tune(
                [(0, 81, 8), (8, 77, 8)],
                [(0, 79, 8), (8, 74, 8)],
                [(0, 79, 12), (12, 76, 4)],
                [(0, 76, 16)],
            )),
            ("Piano Run", 0, arp([0, 1, 2, 3, 4, 3, 2, 1], EVERY_16TH, 1, velocity=75, octave=1)),
            ("Sax", 66, line([(0, "r", 4), (6, "3", 2), (8, "5", 6)], base="lead", velocity=90)),
            ("Music Box", 10, arp([3, 1, 2, 0], range(0, 16, 4), 4, octave=2)),
            ("Trumpet", 59, tune(
                [(2, 74, 2), (4, 77, 4), (10, 76, 6)],
                [(2, 74, 2), (4, 71, 4), (10, 74, 6)],
                [(2, 72, 2), (4, 76, 4), (10, 79, 6)],
                [(2, 72, 2), (4, 69, 4), (10, 72, 6)],
            )),
        ],
        "percussion": [
            ("Shaker", None, beat({SHAKER: "o-x-o-x-"})),  # 2 beats
            ("Rim Click", None, beat({RIM: "....x..x....x..."})),
            ("Foot Hat", None, beat({PEDAL: "....x.......x...", HAT: "..o...o...o...o."})),
            ("Tambourine", None, beat({TAMB: "....x.......x.o."})),
            ("Bongos", None, beat({BONGO_HI: "x.o.x.o.x.o...o.", BONGO_LO: "............x..."})),
            ("Triangle", None, beat({TRI_MUTE: "x.x.x...x.x.x...", TRI_OPEN: "......x.......x."})),
            ("Ride Bell", None, beat({RIDE_BELL: "x...x...x...x..."})),
            ("Woodblock", None, beat({BLOCK_HI: "x.....x...x....."})),
        ],
        "voice": voice_loops([77, 74, 76, 76]),
    }


def dance_fm():
    return {
        "drums": [
            ("Four Floor", None, beat({KICK: "X...X...X...X...", CLAP: "....X.......X...", OPEN_HAT: "..x...x...x...x."})),
            ("Tech", None, beat({KICK: "X...X...X...X...", HAT: "x-x-x-x-x-x-x-x-", RIM: "......x......x.."})),
            ("Garage", None, beat({KICK: "X.....x...X.....", SNARE: "....X.......X...", HAT: "..x.x.x...x.x.x."})),
            ("Trance", None, beat({KICK: "X...X...X...X...", SNARE: "....X.......X...", HAT: "-.x.-.x.-.x.-.x."})),
            ("Break", None, beat(  # 2 bars
                {KICK: "X.X.......XX....", SNARE: "....X..o.o..X..o", HAT: "x.x.x.x.x.x.x.x."},
                {KICK: "X.X.......X..X..", SNARE: "....X..o.o..X.Xo", HAT: "x.x.x.x.x.x.x.x."},
            )),
            ("Electro", None, beat({KICK: "X..x..x.X..x....", SNARE: "....X.......X...", HAT: "x.x.x.x.x.x.x.x."})),
            ("Build", None, beat(  # 2 bars
                {KICK: "X...X...X...X...", SNARE: "x...x...x...x..."},
                {KICK: "X...X...X...X...", SNARE: "x.x.x.x.xxxxxxxx"},
            )),
            ("Minimal", None, beat({KICK: "X...X...X...X...", CLAP: "............X..."})),
        ],
        "bass": [
            ("Offbeat", 38, line([(2, "r", 2), (6, "r", 2), (10, "r", 2), (14, "r", 2)])),
            ("Rolling", 39, line([(s, "r", 1) for s in EVERY_16TH if s % 4])),
            ("Octave", 38, line([(s, "r" if s % 4 == 0 else "8", 2) for s in EVERY_8TH])),
            ("Acid", 38, line([(0, "r", 1), (2, "r", 1), (3, "8", 1), (6, "r", 1), (8, "5", 1), (10, "r", 1), (11, "8", 1), (14, "3", 1)])),
            ("Sub", 39, line([(0, "r", 16)])),
            ("Stab", 87, line([(0, "r", 2), (6, "r", 2), (12, "r", 2)])),
            ("Disco", 33, line([(0, "r", 2), (2, "8", 2), (4, "r", 2), (6, "8", 2), (8, "r", 2), (10, "8", 2), (12, "5", 2), (14, "8", 2)])),
            ("Gallop", 39, line([(s, "r", 1) for s in (0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15)])),
        ],
        "chords": [
            ("Poly Pad", 90, stabs(WHOLE, 16)),
            ("Saw Stab", 81, stabs("x..x..x...x..x..", 1)),
            ("Organ", 17, stabs("..x...x...x...x.", 2)),
            ("House Piano", 1, stabs("x..x..x...x.x...", 2)),
            ("Strings", 50, both(stabs(WHOLE, 16), stabs(WHOLE, 16, octave=1))),
            ("Sweep", 95, stabs(WHOLE, 16)),
            ("Brass", 62, stabs("x.......x.x.....", 2)),
            ("Marimba", 12, stabs("x..x..x..x..x..x", 1)),
        ],
        "melody": [
            ("Saw Arp", 81, arp([0, 1, 2, 3], EVERY_16TH, 1, velocity=80, octave=1)),
            ("Square Arp", 80, arp([3, 2, 1, 0, 1, 2], EVERY_16TH, 1, velocity=80, octave=1)),
            ("Crystal", 98, arp([2, 0, 1, 2, 0, 1], [0, 3, 6, 8, 11, 14], 2, octave=1)),
            ("Lead", 81, tune(
                [(0, 72, 3), (3, 75, 3), (6, 77, 2), (8, 80, 8)],
                [(0, 77, 3), (3, 80, 3), (6, 77, 2), (8, 73, 8)],
                [(0, 75, 3), (3, 80, 3), (6, 75, 2), (8, 72, 8)],
                [(0, 70, 3), (3, 75, 3), (6, 79, 2), (8, 75, 8)],
            )),
            ("Calliope", 82, line([(0, "r", 2), (2, "5", 2), (4, "8", 2), (6, "5", 2), (8, "r", 2), (10, "5", 2), (12, "8", 2), (14, "3", 2)], base="lead", velocity=85)),
            ("Chiff", 83, arp([0, 2, 1, 3], EVERY_8TH, 1, octave=1)),
            ("Piano Riff", 1, arp([3, 2, 1, 2], [0, 3, 6, 8, 11, 14], 2, octave=1)),
            ("Charang", 84, tune([(0, 84, 16)], [(0, 85, 16)], [(0, 84, 16)], [(0, 82, 16)], velocity=85)),
        ],
        "percussion": [
            ("Hats 16", None, beat({HAT: "x-o-x-o-"})),  # 2 beats
            ("Open Hat", None, beat({OPEN_HAT: "..x...x...x...x."})),
            ("Clap", None, beat({CLAP: "....x..x....x..."})),
            ("Shaker", None, beat({SHAKER: "x-o-x-o-x-o-x-o-"})),
            ("Cowbell", None, beat({COWBELL: "x...x.x.x...x.x."})),
            ("Congas", None, beat({CONGA_MUTE: "o.o.X.o.o.o.....", CONGA_HI: "............x.x."})),
            ("Ride", None, beat({RIDE: "x.o.x.o.x.o.x.o."})),
            ("Crash", None, beat({CRASH: "X..............."}, {CRASH: REST_BAR})),  # 2 bars
        ],
        "voice": voice_loops([80, 80, 80, 79]),
    }


# bpm: the tempo the pack is rendered at and opens with.
# drum_kit: preset number in the SoundFont's percussion bank (0 Standard, 24 Electronic,
#   25 TR-808, 32 Jazz). swing: how far every second 16th note is delayed, as a fraction of a step.
PACKS = [
    {
        "id": "originals-am", "title": "Originals Am", "loops": originals_am, "bpm": 120, "drum_kit": 0, "swing": 0,
        "kits": ["dawn", "harbor", "lantern", "meadow", "nimbus", "orchard", "pebble", "quartz"],
        "bars": [  # Am | F | C | G
            chord(33, 69, 3, [57, 60, 64]), chord(29, 65, 4, [57, 60, 65]),
            chord(36, 72, 4, [55, 60, 64]), chord(31, 67, 4, [55, 59, 62]),
        ],
    },
    {
        "id": "hiphop-dm", "title": "Hip Hop Dm", "loops": hiphop_dm, "bpm": 90, "drum_kit": 25, "swing": 0.12,
        "kits": [f"hiphop-{i}" for i in range(1, 9)],
        "bars": [  # Dm | Bb | Gm | A
            chord(38, 74, 3, [57, 62, 65]), chord(34, 70, 4, [58, 62, 65]),
            chord(31, 67, 3, [58, 62, 67]), chord(33, 69, 4, [57, 61, 64]),
        ],
    },
    {
        "id": "lofi-c", "title": "Lo-Fi C", "loops": lofi_c, "bpm": 80, "drum_kit": 32, "swing": 0.2,
        "kits": [f"lofi-{i}" for i in range(1, 9)],
        "bars": [  # Dm7 | G7 | Cmaj7 | Am7 (rootless voicings; the bass carries the root)
            chord(38, 74, 3, [53, 57, 60, 64]), chord(31, 67, 4, [53, 57, 59, 64]),
            chord(36, 72, 4, [52, 55, 59, 62]), chord(33, 69, 3, [52, 55, 57, 60]),
        ],
    },
    {
        "id": "dance-fm", "title": "Dance Fm", "loops": dance_fm, "bpm": 126, "drum_kit": 24, "swing": 0,
        "kits": [f"dance-{i}" for i in range(1, 9)],
        "bars": [  # Fm | Db | Ab | Eb
            chord(29, 65, 3, [53, 56, 60]), chord(37, 61, 4, [53, 56, 61]),
            chord(32, 68, 4, [51, 56, 60]), chord(39, 63, 4, [51, 55, 58]),
        ],
    },
]

# category -> (reverb send (MIDI CC 91, 0-127), output peak, stereo)
PART_MIX = {
    "drums": (20, 0.5, False),
    "bass": (0, 0.42, False),
    "chords": (60, 0.32, True),
    "melody": (50, 0.32, False),
    "percussion": (30, 0.3, False),
    "voice": (70, 0.32, True),
}
# Pad grid is 4 columns x 6 rows, shown as six 2x2 blocks; block order left-to-right, top-to-bottom.
BLOCKS = ["drums", "bass", "chords", "melody", "percussion", "voice"]


def write_midi(path: Path, notes, loop_steps: int, program, reverb: int, pack: dict) -> None:
    """Writes one pass of the loop followed by silence for the release tails."""
    channel = DRUM_CHANNEL if program is None else 0
    swing_ticks = round(pack["swing"] * STEP_TICKS)
    events = []  # (tick, order, message)
    for step, note, velocity, length in notes:
        on = step * STEP_TICKS + (swing_ticks if step % 2 else 0)
        off = (step + length) * STEP_TICKS - 10
        events.append((on, 1, mido.Message("note_on", channel=channel, note=note, velocity=velocity)))
        events.append((off, 0, mido.Message("note_off", channel=channel, note=note)))
    events.sort(key=lambda e: (e[0], e[1]))

    track = mido.MidiTrack()
    track.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(pack["bpm"]), time=0))
    track.append(mido.Message("program_change", channel=channel, time=0,
                              program=pack["drum_kit"] if program is None else program))
    track.append(mido.Message("control_change", channel=channel, control=91, value=reverb, time=0))
    track.append(mido.Message("control_change", channel=channel, control=93, value=0, time=0))  # no chorus
    now = 0
    for tick, _, message in events:
        track.append(message.copy(time=tick - now))
        now = tick
    track.append(mido.MetaMessage("end_of_track", time=(loop_steps + TAIL_STEPS) * STEP_TICKS - now))
    midi = mido.MidiFile(ticks_per_beat=PPQ)
    midi.tracks.append(track)
    midi.save(path)


def render(notes, loop_steps: int, program, part: str, pack: dict, out: Path) -> None:
    reverb, peak, stereo = PART_MIX[part]
    loop_samples = round(loop_steps / 4 * 60 / pack["bpm"] * SR)
    with tempfile.TemporaryDirectory() as tmp:
        mid, wav = Path(tmp) / "loop.mid", Path(tmp) / "loop.wav"
        write_midi(mid, notes, loop_steps, program, reverb, pack)
        subprocess.run(
            ["fluidsynth", "-ni", "-q", "-g", "0.5", "-r", str(SR), "-O", "s16", "-T", "wav", "-F", str(wav),
             str(SOUNDFONT), str(mid)],
            check=True, capture_output=True,
        )
        audio, sr = sf.read(wav, dtype="float32", always_2d=True)
    if sr != SR or audio.shape[0] < loop_samples:
        raise RuntimeError(f"{out}: rendered {audio.shape[0]} samples at {sr} Hz, need {loop_samples}")
    # Fold the release tail (everything after the loop end) back onto the loop. The tail is the
    # exact continuation of the last sample, so the loop point is seamless.
    loop = np.zeros((loop_samples, audio.shape[1]), dtype=np.float32)
    for start in range(0, audio.shape[0], loop_samples):
        chunk = audio[start:start + loop_samples]
        loop[:chunk.shape[0]] += chunk
    if not stereo:
        loop = loop.mean(axis=1, keepdims=True)
    loudest = float(np.abs(loop).max())
    if loudest < 1e-4:
        raise RuntimeError(f"{out}: rendered silence")
    out.parent.mkdir(parents=True, exist_ok=True)
    sf.write(out, loop * (peak / loudest), SR, subtype="PCM_16")


def side_pads(pack: dict, loops: dict, side: str, first: int) -> list:
    """24 pads in grid order; each 2x2 block holds four loops of one category."""
    pads = [None] * 24
    for block, part in enumerate(BLOCKS):
        for k in range(4):
            row = (block // 2) * 2 + k // 2
            col = (block % 2) * 2 + k % 2
            kit = pack["kits"][first + k]
            pads[row * 4 + col] = {
                "id": f"{side}-{row * 4 + col}",
                "label": loops[part][first + k][0],
                "part": part,
                "kitSlug": kit,
                "src": f"/packs/originals/{pack['bpm']}/{kit}/{part}.wav",
            }
    return pads


def main() -> None:
    global BARS
    if not SOUNDFONT.exists():
        raise SystemExit(f"missing {SOUNDFONT} (see the header of this script)")
    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    entries = []
    for pack in PACKS:
        BARS = pack["bars"]
        loops = pack["loops"]()
        assert set(loops) == set(BLOCKS), pack["id"]
        for part, items in loops.items():
            assert len(items) == len(pack["kits"]), (pack["id"], part)
            for kit, (label, program, (notes, loop_steps)) in zip(pack["kits"], items):
                out = OUT_DIR / str(pack["bpm"]) / kit / f"{part}.wav"
                render(notes, loop_steps, program, part, pack, out)
                print(f"{out.relative_to(ROOT)}: {label}, {loop_steps / 4:g} beats")
        entries.append({
            "id": pack["id"], "title": pack["title"], "bpm": pack["bpm"], "license": PACK_LICENSE, "layout": "blocks",
            "sides": {"A": side_pads(pack, loops, "A", 0), "B": side_pads(pack, loops, "B", 4)},
        })
    CATALOG.write_text(json.dumps({"packs": entries}, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
