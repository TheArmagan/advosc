"""Builds screenshots/hero.png, the collage at the top of the README.

Run it from anywhere after changing the words below or a screenshot:

    python scripts/make-hero.py

Needs Pillow, and Windows for the Segoe UI fonts.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "screenshots"
FONTS = Path(r"C:\Windows\Fonts")

TITLE = "ADVOSC"
DESCRIPTION = "A desktop app for your VRChat chatbox, avatar parameters and automations."
FOOTNOTE = "Runs in your tray. Free and open source."
TILES = ["chatbox-simple-editor", "automations-rule", "avatar-osc-parameters", "chatbox-advanced-editor"]

WIDTH, HEIGHT = 1600, 760
MARGIN = 44
GAP = 20
TEXT_WIDTH = 410
RADIUS = 12

BACKGROUND = (10, 10, 10)
BORDER = (46, 44, 42)
TEXT = (245, 245, 244)
MUTED = (168, 162, 158)


def wrap(draw, text, font, width):
    lines, line = [], ""
    for word in text.split():
        candidate = f"{line} {word}".strip()
        if draw.textlength(candidate, font=font) > width and line:
            lines.append(line)
            line = word
        else:
            line = candidate
    return lines + [line]


def rounded(image, radius):
    # Drawn at 4x and scaled down, because Pillow's rounded corners aren't antialiased.
    mask = Image.new("L", (image.width * 4, image.height * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, mask.width - 1, mask.height - 1), radius * 4, fill=255)
    return mask.resize(image.size, Image.Resampling.LANCZOS)


def main():
    canvas = Image.new("RGB", (WIDTH, HEIGHT), BACKGROUND)
    draw = ImageDraw.Draw(canvas)

    grid_x = MARGIN + TEXT_WIDTH + 40
    tile_w = (WIDTH - MARGIN - grid_x - GAP) // 2
    tile_h = tile_w * 800 // 1280
    grid_h = tile_h * 2 + GAP
    grid_y = (HEIGHT - grid_h) // 2

    for i, name in enumerate(TILES):
        shot = Image.open(SHOTS / f"{name}.png").convert("RGB")
        shot = shot.resize((tile_w, tile_h), Image.Resampling.LANCZOS)
        x = grid_x + (i % 2) * (tile_w + GAP)
        y = grid_y + (i // 2) * (tile_h + GAP)
        canvas.paste(shot, (x, y), rounded(shot, RADIUS))
        draw.rounded_rectangle((x, y, x + tile_w - 1, y + tile_h - 1), RADIUS, outline=BORDER, width=1)

    title_font = ImageFont.truetype(str(FONTS / "segoeuib.ttf"), 76)
    description_font = ImageFont.truetype(str(FONTS / "segoeui.ttf"), 36)
    footnote_font = ImageFont.truetype(str(FONTS / "segoeui.ttf"), 26)

    logo = Image.open(ROOT / "build" / "icon.png").convert("RGBA").resize((104, 104), Image.Resampling.LANCZOS)
    description = wrap(draw, DESCRIPTION, description_font, TEXT_WIDTH)
    footnote = wrap(draw, FOOTNOTE, footnote_font, TEXT_WIDTH)

    block = 104 + 18 + 96 + 16 + len(description) * 48 + 26 + len(footnote) * 36
    y = (HEIGHT - block) // 2
    canvas.paste(logo, (MARGIN, y), logo)
    y += 104 + 18
    draw.text((MARGIN, y), TITLE, font=title_font, fill=TEXT)
    y += 96 + 16
    for line in description:
        draw.text((MARGIN, y), line, font=description_font, fill=TEXT)
        y += 48
    y += 26
    for line in footnote:
        draw.text((MARGIN, y), line, font=footnote_font, fill=MUTED)
        y += 36

    palette = canvas.quantize(colors=200, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    palette.save(SHOTS / "hero.png", optimize=True)
    print(f"hero.png: {(SHOTS / 'hero.png').stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
