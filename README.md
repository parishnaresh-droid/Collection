# Tone

A personal stylist for people who were never taught this, built out of colour
science and anatomy rather than vibes.

Upload one photo. It measures your colouring the way dermatology measures skin,
works out the proportions of your own frame, and returns a palette and three
complete outfits — with the reasoning attached to every choice.

**Live:** https://parishnaresh-droid.github.io/Collection/

Everything runs in the browser. There is no server, no account, and no upload —
the photo is decoded into a `<canvas>` on the device and the only things that
survive are two hex values.

---

## Why it exists

Ask the internet what suits you and you get vibes: *wear what makes you feel
confident, find your aesthetic, invest in quality basics.* None of it tells you
which basics, in which colour, cut how, for your face and your frame.

The irritating part is that a lot of it is measurable. Whether a colour flatters
your face is a question about the distance between two points in a perceptual
colour space. Whether a hem length works on you is a question about where it
falls between your shoulder and the floor. This finds those answers and shows
its working.

---

## What's actually in here

### Colour — `assets/js/core/colour.js`

The full pipeline, written from first principles rather than pulled from a
library, because the product rests on it being right.

```
sRGB → linear RGB → CIE XYZ (D65) → CIE L*a*b* → CIE LCh
```

- **CIEDE2000** perceptual colour difference, validated against the
  Sharma/Wu/Dalal certification vectors (33 published test pairs, agreement to
  4 decimal places) and against a Python reference implementation across 307
  random colours to 1e-13.
- **Individual Typology Angle** — `ITA° = arctan((L* − 50) / b*) × 180/π` — the
  measure dermatology uses to classify skin depth objectively. Six bands, with
  thresholds from Chardon et al. (1991), extended by Del Bino et al. (2013).
- **Undertone from hue angle**, not from subtracting RGB channels. Melanin
  pushes the b* axis up, haemoglobin pushes a* up, so `h = atan2(b*, a*)` is
  exactly the balance between the two pigments. Below a chroma floor the hue
  angle is numerically unstable, so the module reports neutral rather than
  inventing an undertone.
- **Harmony scoring** in three separate terms — hue relationship, value
  separation, chroma agreement — combined with weights that are written down
  rather than hidden. Modelled on the structure Ou & Luo used for two-colour
  harmony.

### Palette — `assets/js/core/palette.js`

Builds a wearable palette from the reading rather than sorting the person into
one of twelve pre-drawn "seasons". Colours are generated in LCh and fitted back
into sRGB gamut, with a lightness-dependent chroma ceiling so nothing comes out
fluorescent.

The derived part worth pointing at: a colour within a few degrees of your skin's
hue *and* a few points of its lightness has nothing to push against, so near the
face it reads as an extension of it. That is the whole mechanism behind "that
colour washes you out" — and it is the one piece of colour advice that is
genuinely computable, so the app computes it and shows you the swatch.

### Anatomy — `assets/js/core/anatomy.js`

Two different things get called "body type" and they are not the same:

- **Horizontal shape** from chest/waist/hip ratios, plus *drop* (chest minus
  waist), which is the tailoring trade's own number.
- **Vertical proportion** from standard body-segment ratios (Drillis & Contini,
  1966): shoulder at 0.818 of stature, natural waist 0.600, hip joint 0.530,
  knee 0.285.

Sources disagree about which uneven proportion is ideal — a third, two thirds,
the golden section. They agree on the negative: a hem that splits the silhouette
into two equal halves is the one that reliably reads wrong. So the module
computes *that* line and converts it into a garment body length you can check
against a size chart, instead of inventing a precision nobody has.

Volume is treated as a budget rather than a yes/no: each fit costs points, each
frame has an allowance derived from height, shape and drop.

### Photo — `assets/js/core/photo.js`

Three problems, in order:

1. **The camera lied about the colour.** Shades-of-grey illuminant estimation
   (Minkowski mean, p=6) with capped gains. Ordinary indoor warmth gets
   corrected; a genuinely colourful scene is left alone, because the grey-world
   assumption fails badly on, say, a courtyard full of orange marigolds.
2. **Which pixels are skin.** A YCbCr envelope, tightened with a channel-order
   and saturation test, then grouped into connected blobs. Each blob is scored
   on size (a band, not a maximum), aspect, fill, position and — the thing that
   settles close calls — **local luminance variance**, because a face has eyes
   and a mouth and a wall does not.
3. **Which pixels are hair.** A narrow window above the face box, median of its
   darker half.

Face detection runs on the *original* pixels and sampling on the corrected ones,
which matters: letting the white balance vote on where the face is sent the
detector chasing flowers.

Both sample points are draggable, because automatic detection is right most of
the time and confidently wrong the rest, and the user can see their own face
better than any heuristic can.

### The rest

| File | What it does |
| --- | --- |
| `assets/js/core/wardrobe.js` | Eight style archetypes and six occasions, described by what they do to a silhouette |
| `assets/js/core/outfit.js` | Picks the archetype, resolves fits against the volume budget, assigns colours from named palette slots, generates the explanations and the confidence score |
| `assets/js/ui/garments.js` | Draws every piece as a vector flat-lay in the exact recommended colour |
| `assets/js/ui/hero.js` | A single fragment shader that drifts from grey into the user's palette |
| `assets/js/ui/figure.js` | The interactive proportion diagram |
| `assets/js/ui/fitting.js` | The tool: photo → reading → frame → results |

---

## Design

The page is black and white until it knows you. Every colour that appears after
the reading comes out of the reading — injected into `--p-*` custom properties
at runtime and picked up by the nav, the marquee and the hero shader. Nothing
is coloured decoratively, which is what makes the moment the palette arrives
feel like something.

- Type: Instrument Serif (display), Inter (interface), JetBrains Mono (numbers),
  self-hosted, Latin subsets only — 172KB total, no third-party request.
- Motion: native CSS scroll-driven animations (`animation-timeline: view()`)
  where supported, with an IntersectionObserver fallback, all gated behind
  `prefers-reduced-motion`.
- Eight-step type scale on `clamp()`, two easing curves, one accent.

---

## Running it

It is a static site. Any web server will do:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

ES modules mean `file://` will not work — it needs a server.

### Tests

```bash
node tests/colour.test.mjs     # 46 assertions, no dependencies
node tests/photo.test.mjs      # runs the real pipeline over a portrait
```

The photo test needs a fixture, and a fixture is somebody's face, so it is not
in the repository. Point `tools/make_fixture.py` at any front-facing photo and
the test picks it up; without one it skips rather than fails.

`tools/make_parity_vectors.py` regenerates the reference values that check the
JavaScript against `tools/reference/colour.py`.

---

## What it deliberately does not do

- **No real product photographs.** Every image of a garment online belongs to
  whoever shot it. The pieces are drawn as vectors in the recommended colour,
  which is more honest anyway — the swatch on screen *is* the recommendation.
- **No generated images of the user.** Not from their photo, not at all.
- **No shopping links yet.** Retail data goes stale fast. Over the course of
  building this, one chain closed, a listing sold between being indexed and
  being checked, and a category went out of stock inside ten minutes. Links
  belong on a scheduled feed from retailers who publish one, not on a live
  scrape pretending to be current.
- **No pretending the score is a measurement.** There is no ground truth for
  "does this suit him". The colour distances underneath are real; the weighting
  of them is a judgement, and it is in the source rather than hidden.

---

## References

- Sharma, G., Wu, W. & Dalal, E. (2005). *The CIEDE2000 colour-difference
  formula: implementation notes, supplementary test data, and mathematical
  observations.*
- Chardon, A., Cretois, I. & Hourseau, C. (1991). *Skin colour typology and
  suntanning pathways.*
- Del Bino, S. & Bernerd, F. (2013). *Variations in skin colour and the
  biological consequences of ultraviolet radiation exposure.*
- Ou, L.-C. & Luo, M. R. (2006). *A colour harmony model for two-colour
  combinations.*
- Drillis, R. & Contini, R. (1966). *Body segment parameters.*
- Finlayson, G. & Trezzi, E. (2004). *Shades of grey and colour constancy.*
