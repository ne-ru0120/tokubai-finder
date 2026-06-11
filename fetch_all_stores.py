"""全国の shop=supermarket / chemist / drugstore を OSM(Overpass) から取得し、
既存 data/stores.json（14チェーン分）にマージする。
緯度1度ごとのバンドに分割し、エンドポイント切替＋バックオフで再試行。"""
import json, time, os, urllib.parse, urllib.request

LON_W, LON_E = 122, 154        # 日本を覆う経度
LAT_S, LAT_N = 24, 46          # 緯度（1度刻みでバンド分割）
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
CAT = {"supermarket": "スーパー", "chemist": "ドラッグストア", "drugstore": "ドラッグストア"}


def band_query(lat):
    bbox = f"{lat},{LON_W},{lat+1},{LON_E}"
    return (
        "[out:json][timeout:180];("
        f'node["shop"~"^(supermarket|chemist|drugstore)$"]({bbox});'
        f'way["shop"~"^(supermarket|chemist|drugstore)$"]({bbox});'
        ");out center tags;"
    )


def run(query, label):
    data = urllib.parse.urlencode({"data": query}).encode()
    for attempt in range(1, 6):
        ep = ENDPOINTS[(attempt - 1) % len(ENDPOINTS)]
        try:
            req = urllib.request.Request(ep, data=data, headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "tokubai-finder/1.0 (full store directory)",
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
    # 既存（14チェーン分）を読み込み、idで保持（リッチな情報を優先）
    by_id = {}
    if os.path.exists("data/stores.json"):
        for s in json.load(open("data/stores.json", encoding="utf-8")):
            by_id[s["id"]] = s
    print(f"existing: {len(by_id)} stores", flush=True)

    added = 0
    for lat in range(LAT_S, LAT_N):
        label = f"lat{lat}-{lat+1}"
        print(f"[{label}] querying...", flush=True)
        j = run(band_query(lat), label)
        if not j:
            continue
        band_add = 0
        for el in j.get("elements", []):
            t = el.get("tags", {})
            nm = t.get("name:ja") or t.get("name")
            if not nm:
                continue
            la = el.get("lat") or el.get("center", {}).get("lat")
            lo = el.get("lon") or el.get("center", {}).get("lon")
            if la is None:
                continue
            sid = f'osm_{el["type"]}_{el["id"]}'
            if sid in by_id:
                continue  # 既存（14チェーン等）を優先
            by_id[sid] = {
                "id": sid, "name": nm, "category": CAT.get(t.get("shop"), "スーパー"),
                "lat": round(la, 6), "lon": round(lo, 6),
            }
            band_add += 1
            added += 1
        print(f"[{label}] +{band_add} (total {len(by_id)})", flush=True)
        # 途中保存
        json.dump(list(by_id.values()), open("data/stores.json", "w", encoding="utf-8"), ensure_ascii=False)
        time.sleep(8)

    print(f"DONE added={added} total={len(by_id)} -> data/stores.json", flush=True)


if __name__ == "__main__":
    main()
