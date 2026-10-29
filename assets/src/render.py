"""Render the 3D scenes in scene.html to seamless looping GIFs in assets/.

Usage:  python assets/src/render.py [scene ...]      (default: hero pillars footer)
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
SCENES = {"hero": (1280, 460, 25), "pillars": (1280, 380, 20), "footer": (1280, 330, 20)}


def prepare_inputs():
    # The footer shows the waterfall cutout from the head to just above the knees.
    me = Image.open(ASSETS / "arya-waterfall.png")
    me.crop((0, 0, me.width, int(me.height * 0.62))).save(SRC / "me-waist.png")


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve():
    handler = functools.partial(QuietHandler, directory=str(SRC))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


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


def main(names):
    prepare_inputs()
    httpd = serve()
    port = httpd.server_address[1]
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        for name in names:
            w, h, fps = SCENES[name]
            for theme in ("dark", "light"):
                page = browser.new_page(viewport={"width": w, "height": h}, device_scale_factor=1)
                errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
                page.goto(f"http://127.0.0.1:{port}/scene.html?scene={name}&theme={theme}")
                page.wait_for_function("window.READY === true", timeout=120_000)
                if errors:
                    raise RuntimeError(f"{name}/{theme}: {errors}")
                loop = page.evaluate("window.LOOP")
                count = round(loop * fps)
                tmp = Path(tempfile.mkdtemp(prefix=f"render-{name}-{theme}-"))
                for i in range(count):
                    page.evaluate(f"window.renderAt({i / fps})")
                    page.screenshot(path=str(tmp / f"f{i:04d}.png"))
                out = ASSETS / f"{name}-{theme}.gif"
                encode(tmp, fps, out)
                shutil.rmtree(tmp)
                page.close()
                print(f"{out.name}: {count} frames, {out.stat().st_size / 1e6:.2f} MB")
        browser.close()
    httpd.shutdown()


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    main(args or list(SCENES))
