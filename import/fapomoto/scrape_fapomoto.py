import os, re, json, csv, time
from urllib.parse import urlparse
import requests
import xml.etree.ElementTree as ET

BASE_DIR = r"D:\\Projekty\\Projekt FAPO Polska\\import\\fapomoto"
IMG_DIR = os.path.join(BASE_DIR, "images")
os.makedirs(IMG_DIR, exist_ok=True)

session = requests.Session()
session.headers.update({"User-Agent":"Mozilla/5.0"})

def get(url):
    r = session.get(url, timeout=30)
    r.raise_for_status()
    return r

# 1) sitemap index
idx = get("https://www.fapomoto.com/sitemap.xml").text
root = ET.fromstring(idx)
ns = {"sm":"http://www.sitemaps.org/schemas/sitemap/0.9"}
sitemap_urls = [n.text.strip() for n in root.findall("sm:sitemap/sm:loc", ns) if n.text]
product_sitemaps = [u for u in sitemap_urls if "products" in u]

product_urls = []
for sm in product_sitemaps:
    xml = get(sm).text
    r = ET.fromstring(xml)
    urls = [n.text.strip() for n in r.findall("sm:url/sm:loc", ns) if n.text]
    product_urls.extend(urls)

# dedupe preserve order
seen = set(); dedup=[]
for u in product_urls:
    if u not in seen:
        seen.add(u); dedup.append(u)
product_urls = dedup

products = []
image_manifest = []

for i, purl in enumerate(product_urls, start=1):
    path = urlparse(purl).path
    m = re.match(r"^/products/([^/?#]+)", path)
    if not m:
        continue
    handle = m.group(1)
    js_url = f"https://www.fapomoto.com/products/{handle}.js"
    try:
        data = get(js_url).json()
    except Exception:
        continue

    # save raw product json
    raw_path = os.path.join(BASE_DIR, f"product_{handle}.json")
    with open(raw_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    row = {
        "handle": data.get("handle") or handle,
        "id": data.get("id"),
        "title": data.get("title"),
        "vendor": data.get("vendor"),
        "product_type": data.get("type"),
        "tags": ", ".join(data.get("tags", [])) if isinstance(data.get("tags"), list) else str(data.get("tags", "")),
        "price_min": data.get("price_min"),
        "price_max": data.get("price_max"),
        "url": purl,
        "images_count": len(data.get("images", []) or [])
    }
    products.append(row)

    for j, img in enumerate(data.get("images", []) or [], start=1):
        if not img:
            continue
        # normalize filename
        ext = os.path.splitext(urlparse(img).path)[1] or ".jpg"
        fname = f"{handle}__{j:02d}{ext}"
        fpath = os.path.join(IMG_DIR, fname)
        if not os.path.exists(fpath):
            try:
                ir = get(img)
                with open(fpath, "wb") as f:
                    f.write(ir.content)
            except Exception:
                continue
        image_manifest.append({
            "handle": handle,
            "product_title": data.get("title"),
            "image_url": img,
            "local_file": fpath
        })

# Write CSV outputs
products_csv = os.path.join(BASE_DIR, "products.csv")
with open(products_csv, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=["handle","id","title","vendor","product_type","tags","price_min","price_max","url","images_count"])
    w.writeheader(); w.writerows(products)

manifest_csv = os.path.join(BASE_DIR, "images_manifest.csv")
with open(manifest_csv, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=["handle","product_title","image_url","local_file"])
    w.writeheader(); w.writerows(image_manifest)

summary = {
    "product_sitemaps": product_sitemaps,
    "products_found": len(product_urls),
    "products_exported": len(products),
    "images_downloaded": len(image_manifest),
    "products_csv": products_csv,
    "images_manifest_csv": manifest_csv,
    "images_dir": IMG_DIR
}
with open(os.path.join(BASE_DIR, "summary.json"), "w", encoding="utf-8") as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)

print(json.dumps(summary, ensure_ascii=False, indent=2))
