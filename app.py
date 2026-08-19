import os
import io
import colorsys
import cv2
import numpy as np
from flask import Flask, request, jsonify, render_template

app = Flask(__name__)

# ---------- skin tone extraction (same method validated earlier in the session) ----------

def extract_skin_tone(image_bytes):
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not read image")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(80, 80))
    if len(faces) == 0:
        raise ValueError("No face detected in the photo - try a clearer, front-facing shot")

    faces = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)
    x, y, w, h = faces[0]
    pad_x, pad_y = int(w * 0.20), int(h * 0.15)
    x0, y0 = x + pad_x, y + pad_y
    x1, y1 = x + w - pad_x, y + int(h * 0.75)
    face_region = img[y0:y1, x0:x1]

    ycbcr = cv2.cvtColor(face_region, cv2.COLOR_BGR2YCrCb)
    _, cr, cb = cv2.split(ycbcr)
    skin_mask = (cr >= 133) & (cr <= 173) & (cb >= 77) & (cb <= 127)
    bgr_pixels = face_region[skin_mask]
    if len(bgr_pixels) < 50:
        raise ValueError("Couldn't get a reliable skin sample - try better, more even lighting")

    b, g, r = np.median(bgr_pixels, axis=0)
    r, g, b = int(r), int(g), int(b)

    h_, s_, v_ = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    hue_deg = h_ * 360
    yellow_red_skew = r - b
    if yellow_red_skew > 25 and 15 <= hue_deg <= 50:
        undertone = "warm"
    elif yellow_red_skew < 10:
        undertone = "cool"
    else:
        undertone = "neutral"

    # HSV "value" (max channel) overestimates brightness for warm skin, since red
    # dominates while green/blue stay low. Perceptual luminance is more reliable.
    luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    depth = "deep" if luminance < 0.5 else "light"

    return {
        "hex": f"#{r:02X}{g:02X}{b:02X}",
        "rgb": [r, g, b],
        "undertone": undertone,
        "depth": depth,
        "pixels_sampled": int(len(bgr_pixels)),
    }


# ---------- palette selection by undertone + depth ----------

PALETTES = {
    ("warm", "deep"): {
        "label": "deep autumn",
        "colors": [
            {"name": "rust", "hex": "#C1502E"},
            {"name": "olive", "hex": "#556B2F"},
            {"name": "mustard", "hex": "#C99A2E"},
            {"name": "burgundy", "hex": "#7B2D26"},
            {"name": "deep teal", "hex": "#1B4D4A"},
            {"name": "chocolate", "hex": "#4A2E1D"},
        ],
    },
    ("warm", "light"): {
        "label": "warm spring",
        "colors": [
            {"name": "coral", "hex": "#E8724C"},
            {"name": "golden yellow", "hex": "#E3B23C"},
            {"name": "warm green", "hex": "#7A9B4E"},
            {"name": "peach", "hex": "#F0A875"},
            {"name": "camel", "hex": "#C19A6B"},
            {"name": "warm ivory", "hex": "#F5EBD8"},
        ],
    },
    ("cool", "deep"): {
        "label": "deep winter",
        "colors": [
            {"name": "emerald", "hex": "#0F6B4E"},
            {"name": "sapphire", "hex": "#1B4F91"},
            {"name": "true red", "hex": "#B0201E"},
            {"name": "black", "hex": "#1A1A1A"},
            {"name": "deep purple", "hex": "#4A2C5E"},
            {"name": "icy white", "hex": "#F2F3F5"},
        ],
    },
    ("cool", "light"): {
        "label": "cool summer",
        "colors": [
            {"name": "soft blue", "hex": "#7FA6C9"},
            {"name": "lavender", "hex": "#9B8CB5"},
            {"name": "rose", "hex": "#C97D8E"},
            {"name": "soft grey", "hex": "#9A9A9C"},
            {"name": "powder pink", "hex": "#E3B8C4"},
            {"name": "slate navy", "hex": "#3B4A5A"},
        ],
    },
    ("neutral", "deep"): {
        "label": "soft deep neutral",
        "colors": [
            {"name": "taupe", "hex": "#8A7A6B"},
            {"name": "dusty rose", "hex": "#A85C5C"},
            {"name": "sage", "hex": "#6B7A5E"},
            {"name": "stone", "hex": "#7D766A"},
            {"name": "navy", "hex": "#2C3A4F"},
            {"name": "espresso", "hex": "#3E2E24"},
        ],
    },
    ("neutral", "light"): {
        "label": "soft neutral",
        "colors": [
            {"name": "taupe", "hex": "#B8A99A"},
            {"name": "dusty rose", "hex": "#D4A5A5"},
            {"name": "sage", "hex": "#A3B18A"},
            {"name": "stone", "hex": "#C2BBAE"},
            {"name": "soft navy", "hex": "#5C6B7E"},
            {"name": "warm grey", "hex": "#9C9285"},
        ],
    },
}

# fit + shoe pairing logic per palette color name - extend as more colors are added
PAIRINGS = {
    "rust": {"bottom": "straight-leg, charcoal or raw denim", "shoes": "off-white sneakers or dark brown boots"},
    "olive": {"bottom": "straight-leg, black or stone chino", "shoes": "white sneakers or tan boots"},
    "mustard": {"bottom": "straight-leg, navy or charcoal", "shoes": "white sneakers or tan boots"},
    "burgundy": {"bottom": "straight-leg, black or charcoal", "shoes": "white sneakers or black leather"},
    "deep teal": {"bottom": "straight-leg, black or stone", "shoes": "white sneakers or camel boots"},
    "chocolate": {"bottom": "straight-leg, black or olive-toned", "shoes": "white sneakers or cream boots"},
}
DEFAULT_PAIRING = {"bottom": "straight-leg, black or a neutral one shade darker", "shoes": "white sneakers or a neutral leather shoe"}


# ---------- body shape classifier (same logic validated earlier) ----------

def classify_body_shape(chest, waist, hip):
    chest, waist, hip = float(chest), float(waist), float(hip)
    shoulder_hip_diff = chest - hip
    waist_drop_chest = chest - waist
    waist_drop_hip = hip - waist
    close = lambda a, b, pct=0.05: abs(a - b) <= pct * max(a, b)

    if close(chest, hip, 0.05) and waist_drop_chest / chest > 0.12 and waist_drop_hip / hip > 0.12:
        shape, reason = "hourglass", "chest and hip are close in width, waist is clearly narrower than both"
    elif shoulder_hip_diff / chest > 0.08:
        shape, reason = "inverted triangle / trapezoid", "chest and shoulders noticeably wider than hip"
    elif -shoulder_hip_diff / hip > 0.08:
        shape, reason = "triangle / pear", "hip noticeably wider than chest and shoulders"
    elif waist > chest and waist > hip:
        shape, reason = "oval / round", "waist is the widest point, wider than both chest and hip"
    else:
        shape, reason = "rectangle", "chest, waist, and hip are all within a similar range - little taper at the waist"

    return {"shape": shape, "reason": reason}


STYLE_GUIDANCE = {
    "hourglass": {
        "works": ["fitted or tailored through the body", "wrap styles and belted jackets"],
        "avoid": ["boxy oversized fits head-to-toe - they hide the taper you have"],
    },
    "inverted triangle / trapezoid": {
        "works": ["straight or tapered trousers to balance the shoulders", "open collars, V-necks"],
        "avoid": ["structured/padded shoulders, horizontal stripes across the chest"],
    },
    "triangle / pear": {
        "works": ["structured shoulders or layering on top", "darker, straight-leg bottoms"],
        "avoid": ["skinny bottoms with a loose top - emphasizes hip-heavy silhouette"],
    },
    "oval / round": {
        "works": ["vertical lines, open unbuttoned layering", "structured shoulder"],
        "avoid": ["tucked-in fitted shirts, wide belts at the waist"],
    },
    "rectangle": {
        "works": ["oversized and boxy fits", "layering to build shape"],
        "avoid": ["nothing structurally - oversized fits work with this frame, not against it"],
    },
}


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/analyze", methods=["POST"])
def analyze():
    try:
        if "photo" not in request.files:
            return jsonify({"error": "No photo uploaded"}), 400
        photo_bytes = request.files["photo"].read()
        skin = extract_skin_tone(photo_bytes)

        chest = request.form.get("chest")
        waist = request.form.get("waist")
        hip = request.form.get("hip")
        if not (chest and waist and hip):
            return jsonify({"error": "Chest, waist, and hip measurements are required"}), 400

        shape_result = classify_body_shape(chest, waist, hip)
        guidance = STYLE_GUIDANCE[shape_result["shape"]]

        palette_key = (skin["undertone"], skin["depth"])
        palette = PALETTES.get(palette_key, PALETTES[("neutral", "light")])

        outfits = []
        for c in palette["colors"]:
            pairing = PAIRINGS.get(c["name"], DEFAULT_PAIRING)
            outfits.append({
                "top_color": c["name"],
                "top_hex": c["hex"],
                "bottom": pairing["bottom"],
                "shoes": pairing["shoes"],
            })

        return jsonify({
            "skin": skin,
            "palette_label": palette["label"],
            "shape": shape_result,
            "style_works": guidance["works"],
            "style_avoid": guidance["avoid"],
            "outfits": outfits,
        })
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Something went wrong: {e}"}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
