"""给演示奖品生成 6 张封面图（渐变色块 + 系统 emoji）。"""
from PIL import Image, ImageDraw, ImageFont
import os

OUT = os.path.join("public", "uploads")
os.makedirs(OUT, exist_ok=True)

ITEMS = [
    ("headphone", "🎧", (99, 102, 241), (168, 210, 255)),
    ("milktea", "🧋", (244, 174, 194), (255, 231, 214)),
    ("game", "🎮", (129, 140, 248), (199, 210, 254)),
    ("book", "📚", (110, 231, 183), (219, 252, 231)),
    ("movie", "🎬", (148, 163, 184), (226, 232, 240)),
    ("sleep", "😴", (253, 186, 116), (254, 235, 200)),
]

SIZE = 640
EMOJI_FONT = "C:/Windows/Fonts/seguiemj.ttf"


def gradient(size, c1, c2):
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size)
            px[x, y] = tuple(round(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
    return img


def main():
    for name, emoji, c1, c2 in ITEMS:
        img = gradient(SIZE, c1, c2).convert("RGBA")
        layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)

        # 底部柔光圆
        d.ellipse([SIZE * 0.12, SIZE * 0.12, SIZE * 0.88, SIZE * 0.88], fill=(255, 255, 255, 60))

        drawn = False
        try:
            font = ImageFont.truetype(EMOJI_FONT, 300)
            bbox = d.textbbox((0, 0), emoji, font=font, embedded_color=True)
            w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
            d.text(((SIZE - w) / 2 - bbox[0], (SIZE - h) / 2 - bbox[1]),
                   emoji, font=font, embedded_color=True)
            drawn = True
        except Exception as e:  # noqa: BLE001
            print("emoji render failed:", name, e)

        if not drawn:
            d.ellipse([SIZE * 0.3, SIZE * 0.3, SIZE * 0.7, SIZE * 0.7], fill=(255, 255, 255, 190))

        img = Image.alpha_composite(img, layer).convert("RGB")
        path = os.path.join(OUT, f"demo-{name}.jpg")
        img.save(path, quality=88)
        print("wrote", path)


if __name__ == "__main__":
    main()
