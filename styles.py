"""
Style archetype definitions. Each style is structured data the recommendation
engine can reason over - not just a label. Deliberately starting with 8
well-differentiated archetypes rather than all ~12 requested; the structure
below makes adding more a data-only change, no logic change.
"""

STYLES = {
    "90s_relaxed": {
        "label": "90s Relaxed",
        "description": "Boxy tees, relaxed denim, retro sneakers - unfussy volume, nothing tailored.",
        "tops": ["boxy tee", "oversized sweatshirt", "denim jacket"],
        "bottoms": ["relaxed jeans", "straight jeans", "cargo trousers"],
        "shoes": ["retro low-profile sneakers", "chunky sneakers"],
        "fit": "relaxed",
        "silhouette": "boxy top + relaxed straight bottom",
        "occasions": ["everyday", "university", "travel"],
    },
    "streetwear": {
        "label": "Streetwear",
        "description": "Oversized silhouettes, graphic pieces, sneaker-led.",
        "tops": ["oversized graphic tee", "heavyweight hoodie", "track jacket"],
        "bottoms": ["relaxed cargo", "wide-leg trouser", "track pant"],
        "shoes": ["chunky sneakers", "high-top sneakers"],
        "fit": "oversized",
        "silhouette": "oversized top + relaxed-to-wide bottom",
        "occasions": ["everyday", "university", "night out"],
    },
    "old_money": {
        "label": "Old Money",
        "description": "Polos, knitwear, tailored trousers, loafers - neutral and unbranded.",
        "tops": ["knit polo", "merino crewneck", "oxford shirt"],
        "bottoms": ["tailored trouser", "pleated chino"],
        "shoes": ["penny loafer", "suede derby"],
        "fit": "regular",
        "silhouette": "fitted-to-regular top + tailored straight bottom",
        "occasions": ["work", "dinner", "date"],
    },
    "minimal": {
        "label": "Minimal",
        "description": "Simple silhouettes, clean colour, elevated basics - nothing extraneous.",
        "tops": ["clean crewneck", "structured tee", "unbranded overshirt"],
        "bottoms": ["straight trouser", "tapered chino"],
        "shoes": ["low-profile leather sneaker", "minimal derby"],
        "fit": "regular",
        "silhouette": "straight top + straight bottom, single dominant colour",
        "occasions": ["everyday", "work", "date"],
    },
    "smart_casual": {
        "label": "Smart Casual",
        "description": "Relaxed tailoring meets casual pieces - the versatile middle ground.",
        "tops": ["oxford shirt", "knit polo", "unstructured blazer"],
        "bottoms": ["tapered chino", "straight trouser"],
        "shoes": ["clean leather sneaker", "suede loafer"],
        "fit": "regular",
        "silhouette": "fitted top + tapered bottom",
        "occasions": ["work", "dinner", "date", "travel"],
    },
    "quiet_luxury": {
        "label": "Quiet Luxury",
        "description": "Premium material over branding - subtle, restrained, considered.",
        "tops": ["heavyweight tee", "cashmere-blend crewneck", "unbranded overshirt"],
        "bottoms": ["wide-leg wool trouser", "straight trouser"],
        "shoes": ["minimal leather sneaker", "suede loafer"],
        "fit": "regular",
        "silhouette": "clean top + straight-to-wide bottom, one material story",
        "occasions": ["work", "dinner", "date"],
    },
    "y2k": {
        "label": "Y2K",
        "description": "Early-2000s revival - lower rise, technical fabric, retro-futurist detail.",
        "tops": ["baby tee", "zip-up track top", "mesh layering piece"],
        "bottoms": ["low-rise cargo", "flare jean"],
        "shoes": ["chunky retro sneaker"],
        "fit": "fitted-to-relaxed mix",
        "silhouette": "fitted or cropped top + low-rise wide bottom",
        "occasions": ["night out", "party", "festival"],
    },
    "workwear": {
        "label": "Workwear",
        "description": "Utility jackets, durable fabric, straight lines - built, not styled.",
        "tops": ["chore jacket", "flannel overshirt", "canvas jacket"],
        "bottoms": ["straight-leg canvas trouser", "relaxed jean"],
        "shoes": ["leather boot", "durable low-top"],
        "fit": "relaxed",
        "silhouette": "structured top layer + straight bottom",
        "occasions": ["everyday", "travel", "gym"],
    },
}

OCCASIONS = [
    "everyday", "university", "date", "night out", "work", "dinner",
    "wedding", "party", "travel", "beach", "festival", "gym", "formal event",
]

FIT_PREFERENCES = ["slim", "regular", "relaxed", "oversized", "baggy"]


def height_proportion_note(height_cm):
    """Proportional guidance, not rigid rules - per spec, height informs volume
    and length choices without restricting what's allowed."""
    if height_cm is None:
        return None
    h = float(height_cm)
    if h < 170:
        return ("At this height, keep trouser length and top volume controlled - a slightly "
                "cropped top and a trouser break right at the shoe (not stacking) keeps "
                "proportions clean even in relaxed or oversized pieces.")
    elif h > 185:
        return ("At this height you can carry more length and volume without it reading as "
                "sloppy - a longer top length and a fuller trouser leg stay balanced rather "
                "than overwhelming the frame.")
    else:
        return ("A fairly standard proportional range - most standard garment lengths and "
                "breaks will sit as designed without needing adjustment.")


def fit_preference_note(stated_fit, body_shape):
    """Honest cross-check between what the person asked for and what the
    ratio math found - not a refusal, a real styling caveat either way."""
    if not stated_fit:
        return None
    stated_fit = stated_fit.lower()
    if stated_fit == "slim" and body_shape == "rectangle":
        return ("You've picked slim - workable, but with minimal waist taper a fully slim fit "
                "head-to-toe can read flat rather than sharp. Slim on top with a straight-leg "
                "(not slim) bottom keeps some structure instead of going skin-tight everywhere.")
    if stated_fit in ("oversized", "baggy") and body_shape == "hourglass":
        return ("Oversized works, but going baggy head-to-toe will bury the waist definition "
                "your proportions actually have. One oversized piece with one fitted piece "
                "keeps the shape visible instead of hiding it.")
    if stated_fit in ("oversized", "baggy") and body_shape == "rectangle":
        return ("Good match - this is the one body shape where oversized and baggy genuinely "
                "flatter rather than just hide, since there's little natural taper to lose.")
    return None
