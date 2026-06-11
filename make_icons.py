"""依存なしで PWA 用アイコン PNG を生成する。
ブランド色の角丸背景に白いショッピングカートを描く。"""
import zlib, struct, math, os

BRAND = (232, 70, 46)
WHITE = (255, 255, 255)

def new_canvas(n, color):
    return [[list(color) for _ in range(n)] for _ in range(n)]

def put(px, n, x, y, color, a=1.0):
    if 0 <= x < n and 0 <= y < n:
        if a >= 1:
            px[y][x] = list(color)
        else:
            for i in range(3):
                px[y][x][i] = int(px[y][x][i] * (1 - a) + color[i] * a)

def disc(px, n, cx, cy, r, color):
    for y in range(int(cy - r - 1), int(cy + r + 2)):
        for x in range(int(cx - r - 1), int(cx + r + 2)):
            d = math.hypot(x - cx, y - cy)
            if d <= r:
                put(px, n, x, y, color)
            elif d <= r + 1:
                put(px, n, x, y, color, r + 1 - d)

def ring(px, n, cx, cy, r, w, color):
    for y in range(int(cy - r - 1), int(cy + r + 2)):
        for x in range(int(cx - r - 1), int(cx + r + 2)):
            d = math.hypot(x - cx, y - cy)
            if r - w <= d <= r:
                put(px, n, x, y, color)

def thick_line(px, n, x0, y0, x1, y1, w, color):
    steps = int(max(abs(x1 - x0), abs(y1 - y0)) + 1)
    for i in range(steps + 1):
        t = i / steps
        cx = x0 + (x1 - x0) * t
        cy = y0 + (y1 - y0) * t
        disc(px, n, cx, cy, w / 2, color)

def rounded_bg(px, n, color, radius):
    for y in range(n):
        for x in range(n):
            # 角丸マスク
            rx = min(x, n - 1 - x)
            ry = min(y, n - 1 - y)
            if rx < radius and ry < radius:
                d = math.hypot(radius - rx, radius - ry)
                if d > radius:
                    continue
            put(px, n, x, y, color)

def draw_cart(px, n):
    s = n / 100.0  # 100基準でスケール
    col = WHITE
    w = 7 * s
    # カート枠（台形っぽい本体）
    thick_line(px, n, 30*s, 35*s, 78*s, 35*s, w, col)   # 上辺
    thick_line(px, n, 78*s, 35*s, 70*s, 62*s, w, col)   # 右辺
    thick_line(px, n, 70*s, 62*s, 38*s, 62*s, w, col)   # 下辺
    thick_line(px, n, 38*s, 62*s, 30*s, 35*s, w, col)   # 左辺
    # ハンドル
    thick_line(px, n, 30*s, 35*s, 20*s, 28*s, w, col)
    thick_line(px, n, 20*s, 28*s, 14*s, 28*s, w, col)
    # 車輪
    disc(px, n, 42*s, 76*s, 7*s, col)
    disc(px, n, 66*s, 76*s, 7*s, col)

def write_png(path, px, n):
    raw = bytearray()
    for y in range(n):
        raw.append(0)
        for x in range(n):
            raw += bytes(px[y][x])
    comp = zlib.compress(bytes(raw), 9)

    def chunk(typ, data):
        c = struct.pack('>I', len(data)) + typ + data
        return c + struct.pack('>I', zlib.crc32(typ + data) & 0xffffffff)

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', n, n, 8, 2, 0, 0, 0)
    with open(path, 'wb') as f:
        f.write(sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', comp) + chunk(b'IEND', b''))

def make(n, path):
    px = new_canvas(n, BRAND)
    # 透過にせず角丸背景（ブランド色のべた塗り、角だけ少し丸める見た目用に上にカート）
    draw_cart(px, n)
    write_png(path, px, n)
    print('wrote', path)

os.makedirs('icons', exist_ok=True)
make(192, 'icons/icon-192.png')
make(512, 'icons/icon-512.png')
make(180, 'icons/icon-180.png')
print('done')
