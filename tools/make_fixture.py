"""Turn any photo into the raw fixture the photo test reads.

    python3 tools/make_fixture.py /path/to/portrait.jpg

Writes tests/fixtures/portrait.rgba and portrait.json. The fixture is not
committed: it is someone's face.
"""
import json
import sys
from pathlib import Path

from PIL import Image

MAX_EDGE = 1400

src = Path(sys.argv[1] if len(sys.argv) > 1 else "portrait.jpg")
im = Image.open(src).convert("RGBA")
w, h = im.size
scale = min(1, MAX_EDGE / max(w, h))
if scale < 1:
    im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)

out = Path(__file__).resolve().parent.parent / "tests" / "fixtures"
out.mkdir(parents=True, exist_ok=True)
im.tobytes()  # force decode
import numpy as np
np.array(im, dtype=np.uint8).tofile(out / "portrait.rgba")
(out / "portrait.json").write_text(json.dumps({"width": im.size[0], "height": im.size[1]}))
print(f"wrote {out}/portrait.rgba at {im.size[0]}x{im.size[1]}")
