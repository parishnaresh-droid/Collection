"""
Outfit combination engine.

Builds complete looks (top + bottom + shoes + optional layer) with concrete
garment colours, then explains WHY using principles from menswear styling
research rather than arbitrary rules.

Research basis (see sources consulted during development):
  - Rectangle: shoulders/waist/hips similar width. Goal is to create structure
    and the illusion of a taper - layering and texture add visual weight up top.
  - Inverted triangle / trapezoid: broad chest tapering to narrow waist. Goal is
    balance - add visual weight below, avoid shoulder padding and skinny legs.
  - Triangle: hips wider than shoulders. Goal is to shift attention upward -
    structured shoulders, darker bottoms, pattern/texture on top.
  - Oval: waist is widest. Goal is to elongate - vertical lines, open layering,
    tonal dressing (matching top and bottom colours slims the silhouette),
    avoid horizontal contrast at the midsection.
  - Hourglass: defined waist. Goal is to preserve that definition rather than
    bury it under uniform volume.
"""

import colour

# Neutral bottoms and shoes that pair broadly. Kept separate from the
# skin-derived palette because bottoms are usually anchoring neutrals.
BOTTOM_NEUTRALS = {
    "charcoal": "#36454F",
    "black": "#1A1A1A",
    "raw denim": "#3B4A5F",
    "washed blue": "#A2B5CD",
    "stone": "#ADA587",
    "cream": "#E8E2D0",
    "olive": "#556B2F",
    "navy": "#2C3A4F",
}

SHOE_COLOURS = {
    "off white": "#F1EDE4",
    "white": "#FFFFFF",
    "dark brown": "#4A2E1D",
    "tan": "#C19A6B",
    "black": "#1A1A1A",
    "cream": "#E8E2D0",
}

# Per-body-shape styling strategy, from the research above.
SHAPE_STRATEGY = {
    "rectangle": {
        "goal": "create structure and a visual taper where there isn't a natural one",
        "top_fit": "boxy or relaxed with some texture or weight",
        "bottom_fit": "straight-leg",
        "layer_advice": "a layer worn open adds shoulder structure and breaks up the straight line",
        "wants_layer": True,
        "tonal": False,
    },
    "inverted triangle / trapezoid": {
        "goal": "balance a broad chest by adding visual weight below the waist",
        "top_fit": "relaxed but not boxy, avoid shoulder structure",
        "bottom_fit": "straight or slightly wide leg",
        "layer_advice": "skip padded or structured shoulders - they add width you already have",
        "wants_layer": False,
        "tonal": False,
    },
    "triangle / pear": {
        "goal": "shift visual attention upward to balance wider hips",
        "top_fit": "structured shoulder, texture or pattern up top",
        "bottom_fit": "straight-leg in a darker tone",
        "layer_advice": "a structured overshirt or jacket builds the shoulder line",
        "wants_layer": True,
        "tonal": False,
    },
    "oval / round": {
        "goal": "elongate the silhouette with vertical lines and tonal continuity",
        "top_fit": "straight, skimming - not clingy, not tented",
        "bottom_fit": "straight-leg, same tonal family as the top",
        "layer_advice": "an open unbuttoned layer creates a strong vertical line down the centre",
        "wants_layer": True,
        "tonal": True,
    },
    "hourglass": {
        "goal": "preserve the natural waist definition rather than bury it",
        "top_fit": "fitted or tucked",
        "bottom_fit": "straight or slightly tapered, mid-to-high rise",
        "layer_advice": "if layering, keep it open or belted so the waist stays visible",
        "wants_layer": True,
        "tonal": False,
    },
}


def _pick_bottom(top_hex, shape, tonal):
    """Choose a bottom colour that is perceptually well separated from the top
    (or deliberately close, for tonal/oval strategies). Uses Delta-E so the
    choice is measured, not guessed."""
    candidates = []
    for name, hexv in BOTTOM_NEUTRALS.items():
        d = colour.harmonises(top_hex, hexv)
        candidates.append((d, name, hexv))
    candidates.sort(key=lambda x: x[0])

    if tonal:
        # closest match that isn't essentially identical (avoid looking like a mistake)
        for d, name, hexv in candidates:
            if d > 8:
                return name, hexv, d
        return candidates[-1][1], candidates[-1][2], candidates[-1][0]

    # otherwise pick a clearly separated neutral - high contrast reads intentional
    strong = [c for c in candidates if c[0] > 35]
    pick = strong[0] if strong else candidates[-1]
    return pick[1], pick[2], pick[0]


def _pick_shoes(top_hex, bottom_hex):
    """Shoes should not compete with either garment."""
    best = None
    for name, hexv in SHOE_COLOURS.items():
        d_top = colour.harmonises(top_hex, hexv)
        d_bottom = colour.harmonises(bottom_hex, hexv)
        score = min(d_top, d_bottom)  # want to be distinct from BOTH
        if best is None or score > best[0]:
            best = (score, name, hexv)
    return best[1], best[2]


def build_combos(palette, shape, style, fit_preference, height_cm, max_combos=4):
    """Generate multiple complete outfit combos - one per palette colour."""
    strategy = SHAPE_STRATEGY.get(shape, SHAPE_STRATEGY["rectangle"])
    combos = []

    for c in palette["colors"][:max_combos]:
        top_hex = c["hex"]
        bottom_name, bottom_hex, bottom_delta = _pick_bottom(top_hex, shape, strategy["tonal"])
        shoe_name, shoe_hex = _pick_shoes(top_hex, bottom_hex)

        top_garment = style["tops"][0]
        bottom_garment = style["bottoms"][0]
        shoe_garment = style["shoes"][0]
        layer_garment = style["tops"][-1] if strategy["wants_layer"] and len(style["tops"]) > 1 else None

        why = (
            f"{c['name'].title()} sits in your palette, and against {bottom_name} the two are "
            f"{'deliberately close for a tonal, elongating line' if strategy['tonal'] else 'clearly separated'} "
            f"(\u0394E {bottom_delta}). For a {shape} build the aim is to {strategy['goal']} \u2014 so the top runs "
            f"{strategy['top_fit']} and the bottom stays {strategy['bottom_fit']}. "
            + (strategy["layer_advice"].capitalize() + "." if layer_garment else strategy["layer_advice"].capitalize() + ".")
        )

        combos.append({
            "name": f"{c['name'].title()} \u00d7 {bottom_name.title()}",
            "top": {"garment": top_garment, "colour": c["name"], "hex": top_hex,
                    "fit": strategy["top_fit"]},
            "bottom": {"garment": bottom_garment, "colour": bottom_name, "hex": bottom_hex,
                       "fit": strategy["bottom_fit"]},
            "shoes": {"garment": shoe_garment, "colour": shoe_name, "hex": shoe_hex},
            "layer": ({"garment": layer_garment, "colour": c["name"], "hex": top_hex}
                      if layer_garment else None),
            "delta_e_top_bottom": bottom_delta,
            "why": why,
        })

    return combos
