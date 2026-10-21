"""把下载到的表情包处理成透明背景的 PNG（只去掉外部白底，保留狗身体里的白色）。"""
from PIL import Image
from collections import deque
import os

SRC = "shots/_pack"
OUT = "public/mascot"
os.makedirs(OUT, exist_ok=True)

SRC = "shots/_pack"

PICKS = [
    ("s07.png", "happy.png", 340),   # 花丛里开嘴笑
    ("s09.png", "hello.png", 320),   # 挥手 + 爱心
    ("s19.png", "sleep.png", 300),   # 趴着睡
    ("s10.png", "cheer.png", 300),   # 竖大拇指
    ("s04.png", "read.png", 300),    # 趴在书上
    ("s16.png", "peek.png", 300),    # 探头
]

THRESH = 236  # 灰度高于这个值算背景


def strip_bg(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    seen = [[False] * w for _ in range(h)]
    q = deque()

    def is_bg(x, y):
        r, g, b, a = px[x, y]
        return a > 0 and r >= THRESH and g >= THRESH and b >= THRESH and max(r, g, b) - min(r, g, b) < 12

    for x in range(w):
        for y in (0, h - 1):
            if is_bg(x, y) and not seen[y][x]:
                seen[y][x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_bg(x, y) and not seen[y][x]:
                seen[y][x] = True
                q.append((x, y))

    while q:
        x, y = q.popleft()
        r, g, b, a = px[x, y]
        px[x, y] = (r, g, b, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and is_bg(nx, ny):
                seen[ny][nx] = True
                q.append((nx, ny))

    return im


def main():
    for src, dst, target in PICKS:
        path = os.path.join(SRC, src)
        im = Image.open(path)
        if getattr(im, "is_animated", False):
            im.seek(0)
        im = im.convert("RGBA")

        # 裁掉四周多余的透明/白边
        alpha = im.split()[3]
        im = strip_bg(im)
        bbox = im.getbbox()
        if bbox:
            im = im.crop(bbox)

        # 等比放到目标尺寸
        im.thumbnail((target, target), Image.LANCZOS)

        canvas = Image.new("RGBA", (target, target), (0, 0, 0, 0))
        canvas.paste(im, ((target - im.width) // 2, (target - im.height) // 2), im)
        out = os.path.join(OUT, dst)
        canvas.save(out)
        print("wrote", out, canvas.size)


if __name__ == "__main__":
    main()
