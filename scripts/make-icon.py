"""生成市场卡片图标 assets/icon-180.png：圆角深色底 + 西班牙国旗三色带 + ES。"""

from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

S = 180
OUT = Path(__file__).resolve().parent.parent / "assets" / "icon-180.png"
OUT.parent.mkdir(parents=True, exist_ok=True)

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# 圆角深色底
d.rounded_rectangle([0, 0, S - 1, S - 1], radius=38, fill=(16, 24, 38, 255))

# 中间的三色带（红-黄-红），圆角
left, right = 22, S - 22
top, bottom = 46, S - 46
h = bottom - top
third = h // 5
d.rounded_rectangle([left, top, right, top + third], radius=10, fill=(198, 11, 30, 255))
d.rectangle([left, top + third, right, bottom - third], fill=(255, 196, 0, 255))
d.rounded_rectangle([left, bottom - third, right, bottom], radius=10, fill=(198, 11, 30, 255))

# 黄色带上写 ES
font = None
for candidate in (
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\segoeuib.ttf",
    r"C:\Windows\Fonts\seguisb.ttf",
):
    try:
        font = ImageFont.truetype(candidate, 44)
        break
    except OSError:
        continue
if font is None:
    font = ImageFont.load_default()

text = "ES"
box = d.textbbox((0, 0), text, font=font)
tw, th = box[2] - box[0], box[3] - box[1]
cy = top + third + (h - 2 * third) / 2
d.text(
    (S / 2 - tw / 2 - box[0], cy - th / 2 - box[1]),
    text,
    font=font,
    fill=(24, 20, 10, 255),
)

img.save(OUT)
print("wrote", OUT, OUT.stat().st_size, "bytes")
