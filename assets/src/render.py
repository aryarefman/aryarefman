"""Render the profile's 3D artwork into assets/.

  scene.html    -> seamless looping GIFs, dark and light (hero, pillars, metrics, footer)
  showcase.html -> transparent PNG mockups of the featured projects (assets/projects/)

Usage:  python assets/src/render.py [name ...]      (default: everything)
Needs:  pip install playwright pillow && playwright install chromium; ffmpeg on PATH; internet (three.js and fonts from CDNs).
"""
import functools
import http.server
import shutil
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

SRC = Path(__file__).resolve().parent
ASSETS = SRC.parent
# name: (width, height, frames per second)
SCENES = {"hero": (1280, 520, 25), "pillars": (1280, 380, 20), "metrics": (1280, 400, 25), "footer": (1280, 300, 20)}
# name: (width, height)
SHOWCASE = {"jagapadi": (1600, 760), "helaloka": (1200, 680), "narpati": (1200, 680), "aromasys": (1000, 640), "skyopt": (1000, 640), "siews": (1000, 640), "soc": (1000, 640)}
LAUNCH_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve():
    handler = functools.partial(QuietHandler, directory=str(SRC))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def open_page(browser, url, w, h):
    page = browser.new_page(viewport={"width": w, "height": h}, device_scale_factor=1)
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(url)
    page.wait_for_function("window.READY === true", timeout=120_000)
    if errors:
        raise RuntimeError(f"{url}: {errors}")
    return page


def encode(frames_dir: Path, fps: int, out: Path):
    # Ordered (bayer) dithering is stable frame to frame, so unchanged regions stay unchanged and the GIF stays small.
    graph = (
        "split[a][b];[a]palettegen=max_colors=256:stats_mode=full:reserve_transparent=0[p];"
        "[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle"
    )
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(fps), "-i", str(frames_dir / "f%04d.png"),
         "-filter_complex", graph, "-loop", "0", str(out)],
        check=True,
    )


def render_scene(browser, port, name):
    w, h, fps = SCENES[name]
    for theme in ("dark", "light"):
        page = open_page(browser, f"http://127.0.0.1:{port}/scene.html?scene={name}&theme={theme}", w, h)
        count = round(page.evaluate("window.LOOP") * fps)
        tmp = Path(tempfile.mkdtemp(prefix=f"render-{name}-{theme}-"))
        for i in range(count):
            page.evaluate(f"window.renderAt({i / fps})")
            page.screenshot(path=str(tmp / f"f{i:04d}.png"))
        out = ASSETS / f"{name}-{theme}.gif"
        encode(tmp, fps, out)
        shutil.rmtree(tmp)
        page.close()
        print(f"{out.name}: {count} frames, {out.stat().st_size / 1e6:.2f} MB")


def render_showcase(browser, port, name, pad=28):
    w, h = SHOWCASE[name]
    page = open_page(browser, f"http://127.0.0.1:{port}/showcase.html?id={name}", w, h)
    tmp = Path(tempfile.mkdtemp(prefix=f"showcase-{name}-")) / "shot.png"
    page.screenshot(path=str(tmp), omit_background=True)
    page.close()
    im = Image.open(tmp)
    # Trim empty transparent margins (ignoring the faintest shadow) and keep a little padding.
    l, t, r, b = im.getchannel("A").point(lambda a: 255 if a > 10 else 0).getbbox()
    im = im.crop((max(0, l - pad), max(0, t - pad), min(w, r + pad), min(h, b + pad)))
    if name != "jagapadi":
        # Same 16:9 frame for every grid card, so titles line up across the README columns.
        cw, ch = max(im.width, round(im.height * 16 / 9)), max(im.height, round(im.width * 9 / 16))
        framed = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
        framed.paste(im, ((cw - im.width) // 2, (ch - im.height) // 2))
        im = framed
    out = ASSETS / "projects" / f"{name}.png"
    out.parent.mkdir(exist_ok=True)
    im.save(out, optimize=True)
    shutil.rmtree(tmp.parent)
    print(f"projects/{out.name}: {im.size[0]}x{im.size[1]}, {out.stat().st_size / 1e6:.2f} MB")


def main(names):
    httpd = serve()
    port = httpd.server_address[1]
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=LAUNCH_ARGS)
        for name in names:
            if name in SCENES:
                render_scene(browser, port, name)
            elif name in SHOWCASE:
                render_showcase(browser, port, name)
            else:
                raise SystemExit(f"unknown name: {name}")
        browser.close()
    httpd.shutdown()


if __name__ == "__main__":
    main(sys.argv[1:] or [*SCENES, *SHOWCASE])
