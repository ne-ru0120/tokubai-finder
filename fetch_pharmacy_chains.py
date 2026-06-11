"""amenity=pharmacy（調剤併設）タグで登録されている主要ドラッグストアチェーンを
全国から取得し、data/stores.json にマージする。
（fetch_all_stores.py は shop タグのみ対象で、薬局タグのチェーン店が漏れていたため補完）"""
import json, time, os, urllib.parse, urllib.request

LON_W, LON_E = 122, 154
LAT_S, LAT_N = 24, 46
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
# 主要ドラッグストアチェーン名（薬局タグで登録されがちな店）
CHAINS = ("マツモトキヨシ|マツキヨ|サンドラッグ|スギ薬局|スギドラッグ|ココカラファイン|"
          "クリエイト|ウエルシア|ウェルシア|トモズ|ツルハ|セイムス|クスリのアオキ|"
          "ドラッグストアモリ|キリン堂|ゲンキー|ドラッグイレブン|ウェルパーク|コクミン|"
          "コスモス|カワチ|サツドラ|ダイコクドラッグ|ドラッグユタカ|ハックドラッグ|"
          "B&Dドラッグ|スギヤマ|くすりの福太郎")


def band_query(lat):
    bbox = f"{lat},{LON_W},{lat+1},{LON_E}"
    return (
        "[out:json][timeout:180];("
        f'node["amenity"="pharmacy"]["name"~"{CHAINS}"]({bbox});'
        f'way["amenity"="pharmacy"]["name"~"{CHAINS}"]({bbox});'
        ");out center tags;"
    )


def run(query, label):
    data = urllib.parse.urlencode({"data": query}).encode()
    for attempt in range(1, 6):
        ep = ENDPOINTS[(attempt - 1) % len(ENDPOINTS)]
        try:
            req = urllib.request.Request(ep, data=data, headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "tokubai-finder/1.0 (pharmacy chains)",
            })
            with urllib.request.urlopen(req, timeout=200) as r:
                raw = r.read().decode("utf-8", "replace")
            if not raw.lstrip().startswith("{"):
                raise ValueError("non-JSON (rate limit?)")
            return json.loads(raw)
        except Exception as e:
            wait = 25 * attempt
            print(f"  [{label}] attempt {attempt} via {ep.split('/')[2]} failed: {e} -> wait {wait}s", flush=True)
            time.sleep(wait)
    print(f"  [{label}] GAVE UP", flush=True)
    return None


def main():
    by_id = {}
    if os.path.exists("data/stores.json"):
        for s in json.load(open("data/stores.json", encoding="utf-8")):
            by_id[s["id"]] = s
    print(f"existing: {len(by_id)}", flush=True)

    added = 0
    for lat in range(LAT_S, LAT_N):
        label = f"lat{lat}-{lat+1}"
        print(f"[{label}] querying...", flush=True)
        j = run(band_query(lat), label)
        if not j:
            continue
        n = 0
        for el in j.get("elements", []):
            t = el.get("tags", {})
            nm = t.get("name:ja") or t.get("name")
            la = el.get("lat") or el.get("center", {}).get("lat")
            lo = el.get("lon") or el.get("center", {}).get("lon")
            if not nm or la is None:
                continue
            sid = f'osm_{el["type"]}_{el["id"]}'
            if sid in by_id:
                continue
            by_id[sid] = {"id": sid, "name": nm, "category": "ドラッグストア",
                          "lat": round(la, 6), "lon": round(lo, 6)}
            n += 1; added += 1
        print(f"[{label}] +{n} (total {len(by_id)})", flush=True)
        json.dump(list(by_id.values()), open("data/stores.json", "w", encoding="utf-8"), ensure_ascii=False)
        time.sleep(8)

    print(f"DONE added={added} total={len(by_id)}", flush=True)


if __name__ == "__main__":
    main()
