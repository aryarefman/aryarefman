"""Render the profile's 3D artwork into assets/.

  scene.html    -> seamless looping GIFs in the outer-space theme (hero, pillars, metrics, footer)
  showcase.html -> looping GIF mockups of the featured projects (assets/projects/)

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

from playwright.sync_api import sync_playwright

SRC = Path(__file__).resolve().parent
ASSETS = SRC.parent
# name: (width, height, frames per second)
SCENES = {"hero": (1280, 520, 25), "pillars": (1280, 380, 15), "metrics": (1280, 400, 15), "seasons": (1280, 400, 15), "footer": (1280, 420, 15)}
# name: (width, height)
SHOWCASE = {"jagapadi": (1120, 540), **{n: (880, 520) for n in ("helaloka", "narpati", "algoverse", "aromasys", "skyopt", "siews", "soc")}}
SHOWCASE_FPS = 10
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


def render_scene(browser, port, name, themes=("dark",)):
    w, h, fps = SCENES[name]
    for theme in themes:
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


def render_showcase(browser, port, name):
    w, h = SHOWCASE[name]
    for theme in ("dark",):
        page = open_page(browser, f"http://127.0.0.1:{port}/showcase.html?id={name}&theme={theme}", w, h)
        count = round(page.evaluate("window.LOOP") * SHOWCASE_FPS)
        tmp = Path(tempfile.mkdtemp(prefix=f"showcase-{name}-{theme}-"))
        for i in range(count):
            page.evaluate(f"window.renderAt({i / SHOWCASE_FPS})")
            page.screenshot(path=str(tmp / f"f{i:04d}.png"))
        out = ASSETS / "projects" / f"{name}-{theme}.gif"
        out.parent.mkdir(exist_ok=True)
        encode(tmp, SHOWCASE_FPS, out)
        shutil.rmtree(tmp)
        page.close()
        print(f"projects/{out.name}: {count} frames, {out.stat().st_size / 1e6:.2f} MB")


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
