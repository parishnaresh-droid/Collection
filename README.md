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

Every neutral is derived from the person's own hue and chroma rather than
picked from a lookup table — a three-entry table is exactly how everyone ends up
with the same greys. Across a test population of twelve readings the palettes
cover all twelve hue sectors and produce twenty-one distinct named colours; the
suite in `tests/palette.test.mjs` asserts that no two readings collapse onto the
same wardrobe.

**Black and white get an explicit verdict every time**, because they are the two
colours everybody already owns. True black suits deep, cool-to-neutral,
high-contrast colouring; everything else gets charcoal, soft black, espresso or
ink navy, with the reason. Whites run optic / soft white / oyster / ivory /
cream on the same logic.

The derived part worth pointing at: a colour within a few degrees of your skin's
hue *and* a few points of its lightness has nothing to push against, so near the
face it reads as an extension of it. That is the whole mechanism behind "that
colour washes you out" — and it is the one piece of colour advice that is
genuinely computable, so the app computes it, shows you the swatch, and lets you
put a crop of your own face on it to check.

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

### Face — `assets/js/core/face.js`

A real detector rather than a heuristic: [pico.js](https://github.com/nenadmarkus/picojs),
a decision-tree cascade in about 200 lines (MIT), plus the same author's pupil
localiser. 240KB and 1.2MB of binary, both served from this origin, both loaded
only once a photo exists. No neural network, no CDN, nothing leaves the device.

Pupils matter because inter-pupillary distance is the classic unit of facial
anthropometry. With two pupils you get scale *and* roll angle, so the sample
regions are placed in a frame attached to the face rather than to the
photograph — a head tilted thirty degrees still gets measured on its cheeks.
The localiser's internal jitter is seeded, so the same photo always reads the
same.

### Photo — `assets/js/core/photo.js`

Four problems, in order:

1. **The face is a tenth of the frame.** Two passes: find it cheaply on a 900px
   draft, then re-render at whatever resolution puts ~300px across the face
   before measuring anything. Measuring skin from two hundred pixels is
   measuring noise.
2. **The camera lied about the colour.** Shades-of-grey illuminant estimation
   (Minkowski mean, p=6) with capped gains. Ordinary indoor warmth gets
   corrected; a genuinely colourful scene is left alone, because the grey-world
   assumption fails badly on a courtyard full of orange marigolds. Detection
   runs on the *original* pixels — letting white balance vote on where the face
   is sent the detector chasing flowers.
3. **Skin is not one colour.** Five regions — forehead, both cheeks, nose
   bridge, jaw — are measured separately and weighted, their pixels pooled, and
   the pool clustered with k-means in CIELAB. Clusters closer than ΔE 10 are
   merged first, because a lit cheek and a shaded one are the same skin. The
   largest surviving cluster is the reading: the major colour on the face.
   Anything more than ΔE 15 from it is flagged as an outlier and excluded —
   that is how a beard stops becoming "your skin tone".
4. **Which pixels are hair.** A narrow window above the face, median of its
   darker half.

The five regions are drawn on the photo as a read-only overlay so you can see
exactly what was sampled, and two handles move the whole frame, because
automatic detection is right most of the time and confidently wrong the rest.

### The rest

| File | What it does |
| --- | --- |
| `assets/js/core/wardrobe.js` | Eight style archetypes and six occasions, described by what they do to a silhouette |
| `assets/js/core/outfit.js` | Picks the archetype, resolves fits against the volume budget, assigns colours from named palette slots, generates the explanations and the confidence score |
| `assets/js/ui/garments.js` | Draws every piece as a vector flat-lay in the exact recommended colour |
| `assets/js/ui/figure3d.js` | The 3D fitting room: a mannequin generated from the measurements, dressed in the recommended outfit |
| `assets/js/ui/sharecard.js` | Composes the reading into a 1080×1350 PNG on a 2D canvas |
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

### The 3D fitting room — `assets/js/ui/figure3d.js`

A rigged 3D man in an outfit costs about twenty dollars on a stock site and
looks good, but it is one fixed body wearing one fixed set of clothes, and
redistributing it on a public site needs a licence a free portfolio project has
no business pretending to hold. So the figure is generated:

- Cross-sections are solved from real circumferences. Given a chest of 100cm and
  a width-to-depth ratio, the ellipse with that perimeter is found numerically
  (Ramanujan's approximation), so the mannequin's chest really is 100cm around.
- Those sections are lofted into one continuous surface — no spheres stuck onto
  cylinders, which is what made the first attempt look like a toy. Shoulder
  breadth comes from the deltoids rather than from flaring the torso, because a
  torso that reaches full shoulder width in three centimetres of height is a
  shelf.
- Garments are offset shells over the same sections, expanded by the ease of the
  fit the engine chose: ~2cm for straight, ~6cm for oversized, with a dropped
  shoulder above a threshold. An open jacket is lofted over part of the
  circumference so you can see what it is layered over.
- Three-point studio lighting over an image-based environment, soft shadows, and
  **neutral tone mapping** rather than ACES — on a page whose entire claim is
  "this is your colour", holding the hue matters more than cinematic roll-off.

Shoes are lofted from a last — sections along the length of the foot, each a
half-ellipse flat on the ground — rather than carved out of a box. Blazers and
coats get a lapel built as a *roll* of the jacket's own front edge: a flat quad
stuck to the chest reads as a ribbon, which is exactly how the first attempt
looked. Hands are a flattened ellipsoid at the wrist, because a limb tapering
to a rounded stump is the detail your eye calls unfinished before it can say why.

Two bugs here are worth recording. Ease was being added to the **radius** when
pattern cutting states it as **circumference** — 6cm on a radius is 38cm round
the chest, which is why every oversized garment rendered as a cape. And the
lofted surfaces were wound inside-out, so the near faces were culled and you
looked straight through a garment to the mannequin; in isolation it still looked
like a t-shirt, because you were seeing the inside of its far wall.

three.js loads on demand, not on page load.

### What this won't do

- **No bought 3D models.** See above.
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
