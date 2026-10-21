"""生成 PWA 图标（192 / 512），配色与 public/icon.svg 一致。"""
from PIL import Image, ImageDraw

def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

C1 = (0x5B, 0x5B, 0xD6)
C2 = (0x7C, 0x6C, 0xF5)
C3 = (0x4B, 0xC4, 0xA4)


def gradient(size):
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x / size * 0.55 + y / size * 0.45)
            color = lerp(C1, C2, t / 0.6) if t < 0.6 else lerp(C2, C3, (t - 0.6) / 0.4)
            px[x, y] = color
    return img


def rounded_mask(size, radius, scale=1):
    m = Image.new("L", (size * scale, size * scale), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size * scale - 1, size * scale - 1], radius=radius * scale, fill=255)
    return m.resize((size, size), Image.LANCZOS)


def make(size, path):
    img = gradient(size)
    mask = rounded_mask(size, int(size * 0.22), 4)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)

    d = ImageDraw.Draw(out)
    w = int(size * 0.09)
    # 对勾
    p1 = (size * 0.29, size * 0.52)
    p2 = (size * 0.44, size * 0.67)
    p3 = (size * 0.73, size * 0.36)
    d.line([p1, p2, p3], fill=(255, 255, 255, 255), width=w, joint="curve")
    for p in (p1, p3):
        r = w / 2
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=(255, 255, 255, 255))

    out.save(path)
    print("wrote", path, size)


if __name__ == "__main__":
    make(192, "public/icon-192.png")
    make(512, "public/icon-512.png")
