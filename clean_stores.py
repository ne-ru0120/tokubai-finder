"""data/stores.json から日本国外（韓国・済州島）の店舗と、明らかな非店舗ノイズを除去する。
沖縄(lat24-27)は残し、韓国域(lat32.5-39 & lon<129.2)とハングル名を除外。"""
import json, re

hangul = re.compile(r'[가-힣ᄀ-ᇿ]')
NOISE = ('リパーク', 'コインパーキング', '駐車場', 'タイムズ24', 'Times', 'パーキング')


def is_korea(s):
    if hangul.search(s['name']):
        return True
    if 32.5 <= s['lat'] <= 39.0 and s['lon'] < 129.2:
        return True
    return False


def is_noise(s):
    return any(n in s['name'] for n in NOISE)


def main():
    d = json.load(open('data/stores.json', encoding='utf-8'))
    before = len(d)
    kept, kr, noise = [], 0, 0
    for s in d:
        if is_korea(s):
            kr += 1; continue
        if is_noise(s):
            noise += 1; continue
        kept.append(s)
    json.dump(kept, open('data/stores.json', 'w', encoding='utf-8'), ensure_ascii=False)
    print(f'before={before} removed_korea={kr} removed_noise={noise} kept={len(kept)}')


if __name__ == '__main__':
    main()
