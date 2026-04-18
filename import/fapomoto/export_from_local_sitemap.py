import os, csv, json, re, time
from urllib.parse import urlparse
import requests
import xml.etree.ElementTree as ET

BASE=r"D:\\Projekty\\Projekt FAPO Polska\\import\\fapomoto"
XML_PATH=os.path.join(BASE,'sitemap_products.xml')
IMG_DIR=os.path.join(BASE,'images_from_sitemap')
os.makedirs(IMG_DIR, exist_ok=True)

with open(XML_PATH,'r',encoding='utf-8') as f:
    xml=f.read()
root=ET.fromstring(xml)
ns={'sm':'http://www.sitemaps.org/schemas/sitemap/0.9','img':'http://www.google.com/schemas/sitemap-image/1.1'}

sess=requests.Session()
sess.headers.update({'User-Agent':'Mozilla/5.0'})

def download(url, dest):
    for _ in range(4):
        try:
            r=sess.get(url,timeout=45)
            if r.status_code==200:
                with open(dest,'wb') as f: f.write(r.content)
                return True
            time.sleep(1.2)
        except Exception:
            time.sleep(1.2)
    return False

rows=[]
for url in root.findall('sm:url',ns):
    loc=url.find('sm:loc',ns)
    if loc is None or not loc.text:
        continue
    purl=loc.text.strip()
    if '/products/' not in purl:
        continue
    title_node=url.find('img:image/img:title',ns)
    caption_node=url.find('img:image/img:caption',ns)
    img_nodes=url.findall('img:image/img:loc',ns)
    img_urls=[n.text.strip() for n in img_nodes if n is not None and n.text]
    m=re.search(r'/products/([^/?#]+)',purl)
    handle=m.group(1) if m else ''

    if not img_urls:
        rows.append({
            'handle':handle,'product_url':purl,'title':title_node.text.strip() if title_node is not None and title_node.text else '',
            'caption':caption_node.text.strip() if caption_node is not None and caption_node.text else '',
            'image_url':'','local_file':''
        })
        continue

    for idx,img in enumerate(img_urls, start=1):
        ext=os.path.splitext(urlparse(img).path)[1] or '.jpg'
        fname=f"{handle}__{idx:02d}{ext}"
        fpath=os.path.join(IMG_DIR,fname)
        ok=True
        if not os.path.exists(fpath):
            ok=download(img,fpath)
        rows.append({
            'handle':handle,'product_url':purl,'title':title_node.text.strip() if title_node is not None and title_node.text else '',
            'caption':caption_node.text.strip() if caption_node is not None and caption_node.text else '',
            'image_url':img,'local_file':fpath if ok else ''
        })

csv_path=os.path.join(BASE,'products_with_images_from_sitemap.csv')
with open(csv_path,'w',newline='',encoding='utf-8') as f:
    w=csv.DictWriter(f,fieldnames=['handle','product_url','title','caption','image_url','local_file'])
    w.writeheader(); w.writerows(rows)

summary={
  'rows':len(rows),
  'unique_products':len(set(r['product_url'] for r in rows)),
  'images_linked':len([r for r in rows if r['image_url']]),
  'images_downloaded':len([r for r in rows if r['local_file']]),
  'csv':csv_path,
  'images_dir':IMG_DIR
}
with open(os.path.join(BASE,'summary_sitemap_images.json'),'w',encoding='utf-8') as f:
    json.dump(summary,f,ensure_ascii=False,indent=2)
print(json.dumps(summary,ensure_ascii=False,indent=2))
