"""全国の対象チェーン店舗を OpenStreetMap(Overpass) から取得し data/stores.json を生成する。
レート制限・タイムアウトに備えてエンドポイント切替＋バックオフ再試行。"""
import json, time, urllib.parse, urllib.request, os, sys

BBOX = "24,122,46,154"  # 日本を覆うおおよその矩形
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

# (チェーン名, カテゴリ, 名前正規表現, 公式URL, OSM種別)
#  種別 super = shop=supermarket / drug = chemist|drugstore|amenity=pharmacy
CHAINS = [
    ("東急ストア", "スーパー", "東急ストア", "https://www.tokyu-store.co.jp/", "super"),
    ("西友", "スーパー", "西友|SEIYU|Seiyu", "https://www.seiyu.co.jp/", "super"),
    ("スーパー三和", "スーパー", "三和", "https://www.heartful-sanwa.co.jp/", "super"),
    ("Odakyu OX", "スーパー", "Odakyu *OX|小田急OX", "https://www.odakyu-ox.net/", "super"),
    ("業務スーパー", "スーパー", "業務スーパー", "https://www.gyomusuper.jp/", "super"),
    ("デポー", "スーパー", "デポー", "https://tokyo.seikatsuclub.coop/service/depot/", "super"),
    ("マツモトキヨシ", "ドラッグストア", "マツモトキヨシ|マツキヨ|[Mm]atsukiyo", "https://www.matsukiyococokara-online.com/store/", "drug"),
    ("サンドラッグ", "ドラッグストア", "サンドラッグ", "https://www.sundrug.co.jp/", "drug"),
    ("スギ薬局", "ドラッグストア", "スギ薬局|スギドラッグ", "https://www.sugi-net.jp/", "drug"),
    ("ココカラファイン", "ドラッグストア", "ココカラファイン", "https://www.cocokarafine.co.jp/", "drug"),
    ("クリエイトSD", "ドラッグストア", "クリエイト", "https://www.create-sd.co.jp/", "drug"),
    ("ウエルシア", "ドラッグストア", "ウエルシア|ウェルシア", "https://www.welcia.co.jp/", "drug"),
    ("トモズ", "ドラッグストア", "トモズ|Tomod", "https://www.tomods.jp/", "drug"),
    ("ツルハ", "ドラッグストア", "ツルハ", "https://www.tsuruha.co.jp/", "drug"),
]


def build_query(pattern, kind):
    if kind == "super":
        sel = (
            f'node["shop"="supermarket"]["name"~"{pattern}"]({BBOX});'
            f'way["shop"="supermarket"]["name"~"{pattern}"]({BBOX});'
        )
    else:
        sel = (
            f'node["shop"~"chemist|drugstore"]["name"~"{pattern}"]({BBOX});'
            f'way["shop"~"chemist|drugstore"]["name"~"{pattern}"]({BBOX});'
            f'node["amenity"="pharmacy"]["name"~"{pattern}"]({BBOX});'
            f'way["amenity"="pharmacy"]["name"~"{pattern}"]({BBOX});'
        )
    return f"[out:json][timeout:180];({sel});out center tags;"


def run_query(query, label):
    data = urllib.parse.urlencode({"data": query}).encode()
    for attempt in range(1, 6):
        ep = ENDPOINTS[(attempt - 1) % len(ENDPOINTS)]
        try:
            req = urllib.request.Request(ep, data=data, headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "tokubai-finder/1.0 (store directory build)",
            })
            with urllib.request.urlopen(req, timeout=200) as r:
                raw = r.read().decode("utf-8", "replace")
            if not raw.lstrip().startswith("{"):
                raise ValueError("non-JSON (likely rate limit)")
            return json.loads(raw)
        except Exception as e:
            wait = 30 * attempt
            print(f"  [{label}] attempt {attempt} failed via {ep.split('/')[2]}: {e} -> wait {wait}s", flush=True)
            time.sleep(wait)
    print(f"  [{label}] GAVE UP", flush=True)
    return None


def main():
    os.makedirs("data", exist_ok=True)
    out, seen = [], set()
    for name, category, pattern, url, kind in CHAINS:
        print(f"[{name}] querying...", flush=True)
        j = run_query(build_query(pattern, kind), name)
        if not j:
            continue
        added = 0
        for el in j.get("elements", []):
            t = el.get("tags", {})
            nm = t.get("name:ja") or t.get("name")
            la = el.get("lat") or el.get("center", {}).get("lat")
            lo = el.get("lon") or el.get("center", {}).get("lon")
            if not nm or la is None:
                continue
            key = (round(la, 5), round(lo, 5), nm)
            if key in seen:
                continue
            seen.add(key)
            out.append({
                "id": f'osm_{el["type"]}_{el["id"]}',
                "name": nm, "chain": name, "category": category,
                "lat": round(la, 6), "lon": round(lo, 6), "url": url,
            })
            added += 1
        print(f"[{name}] +{added} (total {len(out)})", flush=True)
        # 途中経過を保存
        with open("data/stores.json", "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False)
        time.sleep(12)

    print(f"DONE total={len(out)} -> data/stores.json", flush=True)


if __name__ == "__main__":
    main()
