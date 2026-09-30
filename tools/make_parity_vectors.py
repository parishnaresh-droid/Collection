"""Generate reference LAB + CIEDE2000 values from the original Python module so
the JavaScript port can be checked against it rather than trusted."""
import json, random, sys
sys.path.insert(0, "tools/reference")
import colour

random.seed(7)
samples = [(0,0,0),(255,255,255),(157,104,78),(202,140,119),(44,58,79),(193,80,46),(85,107,47)]
samples += [(random.randrange(256), random.randrange(256), random.randrange(256)) for _ in range(300)]

against = "#2C3A4F"
out = []
for rgb in samples:
    lab = colour.rgb_to_lab(*rgb)
    de = colour.delta_e_2000(lab, colour.rgb_to_lab(*colour.hex_to_rgb(against)))
    out.append({"rgb": list(rgb), "lab": list(lab), "against": against, "deltaE": de})

with open("tests/parity-vectors.json", "w") as f:
    json.dump(out, f)
print(f"wrote {len(out)} vectors")
