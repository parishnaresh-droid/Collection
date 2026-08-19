import requests
import time
import logging

logger = logging.getLogger(__name__)

PALETTE_KEYWORDS = {
    "rust":       ["rust", "terracotta", "burnt orange", "clay", "brick"],
    "olive":      ["olive", "khaki green", "military green", "moss"],
    "mustard":    ["mustard", "gold", "ochre"],
    "burgundy":   ["burgundy", "wine", "maroon", "oxblood"],
    "deep teal":  ["teal", "pine green"],
    "chocolate":  ["chocolate", "espresso", "coffee", "dark brown"],
    "coral":      ["coral"],
    "golden yellow": ["golden yellow", "sunflower"],
    "warm green": ["sage green", "warm green"],
    "peach":      ["peach"],
    "camel":      ["camel", "tan", "sand"],
    "emerald":    ["emerald"],
    "sapphire":   ["sapphire", "royal blue"],
    "true red":   ["true red", "scarlet"],
    "black":      ["black", "jet"],
    "deep purple": ["deep purple", "plum"],
    "soft blue":  ["soft blue", "sky blue"],
    "lavender":   ["lavender"],
    "rose":       ["rose", "dusty pink"],
    "soft grey":  ["heather grey", "soft grey"],
    "powder pink": ["powder pink", "blush"],
    "slate navy": ["slate", "navy"],
    "taupe":      ["taupe"],
    "dusty rose": ["dusty rose"],
    "sage":       ["sage"],
    "stone":      ["stone"],
    "navy":       ["navy"],
    "espresso":   ["espresso"],
}

SHOPIFY_STORES = ["universalstore.com", "midwesttrader.shop"]


def fetch_store_catalog(domain, max_pages=10, delay=0.5, timeout=15):
    """Pull the public product feed from a Shopify store. Returns a list of raw products."""
    products = []
    for page in range(1, max_pages + 1):
        url = f"https://{domain}/products.json?limit=250&page={page}"
        try:
            resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0 (palette-fit catalog refresh)"}, timeout=timeout)
        except requests.RequestException as e:
            logger.warning(f"Fetch failed for {domain} page {page}: {e}")
            break
        if resp.status_code != 200:
            break
        try:
            batch = resp.json().get("products", [])
        except ValueError:
            break
        if not batch:
            break
        products.extend(batch)
        time.sleep(delay)
    return products


def match_products_to_palette(products, domain):
    matches = []
    for p in products:
        title = p.get("title", "")
        handle = p.get("handle", "")
        product_url = f"https://{domain}/products/{handle}"
        for variant in p.get("variants", []):
            variant_color = (variant.get("option2") or variant.get("option1") or "").lower()
            price = variant.get("price")
            available = variant.get("available", False)
            for palette_name, keywords in PALETTE_KEYWORDS.items():
                if any(kw in variant_color for kw in keywords):
                    matches.append({
                        "store": domain,
                        "title": title,
                        "color_matched": palette_name,
                        "color_label": variant_color,
                        "price": float(price) if price else None,
                        "available": bool(available),
                        "url": product_url,
                    })
                    break
    return matches


def refresh_catalog(conn):
    """Fetch all configured stores and replace the cached product table."""
    all_matches = []
    errors = []
    for domain in SHOPIFY_STORES:
        try:
            raw = fetch_store_catalog(domain)
            matched = match_products_to_palette(raw, domain)
            all_matches.extend(matched)
            logger.info(f"{domain}: {len(raw)} products fetched, {len(matched)} palette matches")
        except Exception as e:
            errors.append(f"{domain}: {e}")
            logger.error(f"Catalog refresh failed for {domain}: {e}")

    with conn.cursor() as cur:
        cur.execute("DELETE FROM products")
        for m in all_matches:
            cur.execute(
                "INSERT INTO products (store, title, color_matched, color_label, price, available, url) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s)",
                (m["store"], m["title"], m["color_matched"], m["color_label"], m["price"], m["available"], m["url"]),
            )
    conn.commit()
    return {"matched": len(all_matches), "stores": SHOPIFY_STORES, "errors": errors}
