"""重新裁剪：从上一步的裁坏版本还原 → 按内容自动找上下边界 → 只留面板。

原图仍在上传附件里（~/.dsh/attachments），先拷回来再算。
"""

from PIL import Image
from pathlib import Path
import os
import shutil
import stat

from PIL import Image as PILImage

BASE = Path(__file__).resolve().parent.parent
SHOTS = BASE / "assets" / "screenshots"
ATTACH = Path(r"C:\Users\Lenovo\.dsh\attachments\v1\objects")

SOURCES = {
    "1-practice.png": ATTACH / "c7" / "c77a5dd52df186156262cd251ee06628d5b202b8f5455e77788d0daefb215f28",
    "2-scenario.png": ATTACH / "f9" / "f99be46c5329f0f06dfa9a70d2d17a37a59b9624ed803c9cc6bb0ee7e70f1736",
    "3-progress.png": ATTACH / "24" / "24644e82fdafb312ebbf41ab03045dde69b21d67eac4194b0d861babebef2a67",
}

BG = (236, 237, 232)
LEFT, RIGHT = 564, 1424          # 面板左右边界（实测）
PAD_X, PAD_TOP, PAD_BOTTOM = 16, 10, 20
SCAN_TOP = 40                    # 窗口标题栏下沿
DARK = 200                       # 亮度低于这个算「有内容」（文字/按钮/输入框）


def is_content(px, x, y):
    r, g, b = px[x, y]
    return (r + g + b) / 3 < DARK


for name, src in SOURCES.items():
    # 1) 还原原图
    dst = SHOTS / name
    os.chmod(dst, stat.S_IWRITE | stat.S_IREAD)
    shutil.copyfile(src, dst)

    im = PILImage.open(dst).convert("RGB")
    w, h = im.size
    px = im.load()

    # 2) 找内容的上下边界（只看面板那一列范围）
    #    底部 12 行是窗口边框/阴影，不算内容
    rows = []
    for y in range(SCAN_TOP, h - 12):
        count = 0
        for x in range(LEFT, RIGHT + 1, 2):
            if is_content(px, x, y):
                count += 1
        if count > 4:
            rows.append(y)
    top, bottom = min(rows), max(rows)

    # 3) 裁剪
    box = (LEFT - PAD_X, max(SCAN_TOP, top - PAD_TOP), RIGHT + PAD_X, min(h, bottom + PAD_BOTTOM))
    out = im.crop(box)
    out.save(dst, optimize=True)
    print(f"{name}: {w}x{h} -> {out.size[0]}x{out.size[1]}  content y=[{top}..{bottom}] box={box} {dst.stat().st_size:,}B")
