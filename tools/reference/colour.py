"""
Colour science module.

Replaces the previous naive HSV-threshold approach with:
  - sRGB -> linear RGB -> CIE XYZ -> CIE L*a*b* conversion (D65 illuminant)
  - CIEDE2000 Delta-E for perceptual colour distance (industry standard)
  - A large named-colour database for nearest-colour naming
  - Undertone classification from the LAB a*/b* axes rather than RGB skew,
    which is far more reliable across lighting conditions.

Why LAB: RGB distance is perceptually wrong - two colours the same RGB
distance apart can look very different. LAB is designed so that equal
numeric distance ~ equal perceived difference. CIEDE2000 refines that
further with corrections for hue, chroma and lightness interactions.
"""

import math

# ---------------------------------------------------------------- conversions

def srgb_to_linear(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgb_to_xyz(r, g, b):
    r, g, b = srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b)
    # sRGB D65 matrix
    x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375
    y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750
    z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041
    return x * 100, y * 100, z * 100


def xyz_to_lab(x, y, z):
    # D65 reference white
    xn, yn, zn = 95.047, 100.000, 108.883
    def f(t):
        return t ** (1 / 3) if t > 0.008856 else (7.787 * t) + (16 / 116)
    fx, fy, fz = f(x / xn), f(y / yn), f(z / zn)
    L = (116 * fy) - 16
    a = 500 * (fx - fy)
    b = 200 * (fy - fz)
    return L, a, b


def rgb_to_lab(r, g, b):
    return xyz_to_lab(*rgb_to_xyz(r, g, b))


def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rgb_to_hex(r, g, b):
    return f"#{int(r):02X}{int(g):02X}{int(b):02X}"


# ---------------------------------------------------------------- CIEDE2000

def delta_e_2000(lab1, lab2):
    """CIEDE2000 colour difference. Lower = more similar. <2 is near-identical
    to the human eye, <10 is a close match."""
    L1, a1, b1 = lab1
    L2, a2, b2 = lab2

    avg_L = (L1 + L2) / 2
    C1 = math.sqrt(a1 ** 2 + b1 ** 2)
    C2 = math.sqrt(a2 ** 2 + b2 ** 2)
    avg_C = (C1 + C2) / 2

    G = 0.5 * (1 - math.sqrt(avg_C ** 7 / (avg_C ** 7 + 25 ** 7))) if avg_C > 0 else 0
    a1p, a2p = a1 * (1 + G), a2 * (1 + G)

    C1p = math.sqrt(a1p ** 2 + b1 ** 2)
    C2p = math.sqrt(a2p ** 2 + b2 ** 2)
    avg_Cp = (C1p + C2p) / 2

    def hp(ap, bp):
        if ap == 0 and bp == 0:
            return 0
        h = math.degrees(math.atan2(bp, ap))
        return h + 360 if h < 0 else h

    h1p, h2p = hp(a1p, b1), hp(a2p, b2)

    if C1p * C2p == 0:
        dhp = 0
    elif abs(h2p - h1p) <= 180:
        dhp = h2p - h1p
    elif h2p - h1p > 180:
        dhp = h2p - h1p - 360
    else:
        dhp = h2p - h1p + 360

    dLp = L2 - L1
    dCp = C2p - C1p
    dHp = 2 * math.sqrt(C1p * C2p) * math.sin(math.radians(dhp) / 2)

    if C1p * C2p == 0:
        avg_hp = h1p + h2p
    elif abs(h1p - h2p) <= 180:
        avg_hp = (h1p + h2p) / 2
    elif h1p + h2p < 360:
        avg_hp = (h1p + h2p + 360) / 2
    else:
        avg_hp = (h1p + h2p - 360) / 2

    T = (1 - 0.17 * math.cos(math.radians(avg_hp - 30))
         + 0.24 * math.cos(math.radians(2 * avg_hp))
         + 0.32 * math.cos(math.radians(3 * avg_hp + 6))
         - 0.20 * math.cos(math.radians(4 * avg_hp - 63)))

    d_theta = 30 * math.exp(-(((avg_hp - 275) / 25) ** 2))
    Rc = 2 * math.sqrt(avg_Cp ** 7 / (avg_Cp ** 7 + 25 ** 7)) if avg_Cp > 0 else 0
    Sl = 1 + ((0.015 * (avg_L - 50) ** 2) / math.sqrt(20 + (avg_L - 50) ** 2))
    Sc = 1 + 0.045 * avg_Cp
    Sh = 1 + 0.015 * avg_Cp * T
    Rt = -math.sin(math.radians(2 * d_theta)) * Rc

    return math.sqrt(
        (dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2
        + Rt * (dCp / Sc) * (dHp / Sh)
    )


# ------------------------------------------------- named colour database
# Fashion-relevant named colours across the full spectrum. Each entry is
# (name, hex, family). Used for nearest-colour naming via Delta-E.

NAMED_COLOURS = [
    # neutrals / black-white axis
    ("black", "#000000", "neutral"), ("jet", "#1A1A1A", "neutral"),
    ("charcoal", "#36454F", "neutral"), ("graphite", "#4B4B4B", "neutral"),
    ("slate grey", "#708090", "neutral"), ("ash grey", "#B2BEB5", "neutral"),
    ("silver", "#C0C0C0", "neutral"), ("light grey", "#D3D3D3", "neutral"),
    ("off white", "#F5F5F0", "neutral"), ("ivory", "#FFFFF0", "neutral"),
    ("cream", "#FFFDD0", "neutral"), ("bone", "#E3DAC9", "neutral"),
    ("white", "#FFFFFF", "neutral"),
    # browns / earth
    ("espresso", "#3C2415", "brown"), ("chocolate", "#4A2E1D", "brown"),
    ("coffee", "#6F4E37", "brown"), ("chestnut", "#954535", "brown"),
    ("cognac", "#9A463D", "brown"), ("tan", "#D2B48C", "brown"),
    ("camel", "#C19A6B", "brown"), ("sand", "#E2CA9B", "brown"),
    ("beige", "#F5F5DC", "brown"), ("taupe", "#8A7A6B", "brown"),
    ("khaki", "#C3B091", "brown"), ("stone", "#Ada587", "brown"),
    # reds
    ("burgundy", "#7B2D26", "red"), ("oxblood", "#4A0404", "red"),
    ("maroon", "#800000", "red"), ("wine", "#722F37", "red"),
    ("brick", "#8B3A2E", "red"), ("true red", "#B0201E", "red"),
    ("crimson", "#DC143C", "red"), ("cherry", "#DE3163", "red"),
    # oranges
    ("rust", "#C1502E", "orange"), ("terracotta", "#B85C38", "orange"),
    ("burnt orange", "#CC5500", "orange"), ("clay", "#B66A50", "orange"),
    ("apricot", "#FBCEB1", "orange"), ("peach", "#F0A875", "orange"),
    ("coral", "#E8724C", "orange"),
    # yellows
    ("mustard", "#C99A2E", "yellow"), ("ochre", "#CC7722", "yellow"),
    ("gold", "#D4AF37", "yellow"), ("golden yellow", "#E3B23C", "yellow"),
    ("butter", "#F3E5AB", "yellow"), ("lemon", "#FFF44F", "yellow"),
    # greens
    ("olive", "#556B2F", "green"), ("moss", "#8A9A5B", "green"),
    ("sage", "#9CAF88", "green"), ("forest", "#228B22", "green"),
    ("hunter green", "#355E3B", "green"), ("emerald", "#0F6B4E", "green"),
    ("mint", "#98FF98", "green"), ("military green", "#4B5320", "green"),
    # blues / teals
    ("deep teal", "#1B4D4A", "blue"), ("teal", "#008080", "blue"),
    ("cyan", "#00B7EB", "blue"), ("sky blue", "#87CEEB", "blue"),
    ("cobalt", "#0047AB", "blue"), ("sapphire", "#1B4F91", "blue"),
    ("navy", "#2C3A4F", "blue"), ("midnight navy", "#191970", "blue"),
    ("denim blue", "#6F8FAF", "blue"), ("washed blue", "#A2B5CD", "blue"),
    ("powder blue", "#B0E0E6", "blue"),
    # purples / pinks
    ("deep purple", "#4A2C5E", "purple"), ("plum", "#8E4585", "purple"),
    ("aubergine", "#3D2B3D", "purple"), ("lavender", "#9B8CB5", "purple"),
    ("mauve", "#E0B0FF", "purple"), ("rose", "#C97D8E", "pink"),
    ("dusty rose", "#C4A0A0", "pink"), ("blush", "#DE5D83", "pink"),
    ("powder pink", "#E3B8C4", "pink"),
]

_NAMED_LAB = [(name, hexv, family, rgb_to_lab(*hex_to_rgb(hexv)))
              for name, hexv, family in NAMED_COLOURS]


def nearest_colour_name(r, g, b, top_n=1):
    """Find the closest named colour(s) using perceptual Delta-E."""
    lab = rgb_to_lab(r, g, b)
    scored = [(delta_e_2000(lab, nlab), name, hexv, family)
              for name, hexv, family, nlab in _NAMED_LAB]
    scored.sort(key=lambda x: x[0])
    results = [{"name": n, "hex": h, "family": f, "delta_e": round(d, 2)}
               for d, n, h, f in scored[:top_n]]
    return results[0] if top_n == 1 else results


def classify_undertone(r, g, b):
    """Undertone from LAB a*/b* axes.
    b* = yellow(+) to blue(-);  a* = red(+) to green(-).
    Warm skin sits high on b*; cool skin sits lower on b* with relatively
    higher a*. This is far more stable than raw RGB differences because
    LAB already accounts for perceptual lightness."""
    L, a, b = rgb_to_lab(r, g, b)
    if b <= 0:
        return "cool", L, a, b
    ratio = a / b if b != 0 else 999
    if b >= 18 and ratio < 1.0:
        undertone = "warm"
    elif b < 12 or ratio > 1.35:
        undertone = "cool"
    else:
        undertone = "neutral"
    return undertone, L, a, b


def classify_depth(r, g, b):
    """Depth from LAB L* (perceptual lightness), not RGB max."""
    L, _, _ = rgb_to_lab(r, g, b)
    if L < 40:
        return "deep", L
    elif L < 62:
        return "medium", L
    else:
        return "light", L


def harmonises(hex_a, hex_b, max_delta=None):
    """Delta-E between two colours - useful for checking whether a garment
    colour is too close to another (muddy) or well separated."""
    lab_a = rgb_to_lab(*hex_to_rgb(hex_a))
    lab_b = rgb_to_lab(*hex_to_rgb(hex_b))
    return round(delta_e_2000(lab_a, lab_b), 2)
