// TTF non-vertical 4-corner gradient (bilinear per-pixel) — verify pixel coloring math.
//
// Strategy: drive a single glyph render through the bilinear path.
// The mock fillText pre-fills the offscreen canvas with white text pixels (alpha=255).
// After putImageData, inspect the captured ImageData buffer to verify that:
//   - Corner pixels match the configured corner colors
//   - The center pixel is the average of all 4 corners (bilinear at u=v=0.5)
//   - Pixels with alpha=0 are left untouched (RGB remains 0)

import { Color } from "cc";
import { StyledLabel } from "../../../assets/styled-label/styled-label";
import { GradientScope, HAlign, VAlign } from "../../../assets/styled-label/styled-label.layout";

// ── Mock that lets us observe putImageData ───────────────────────────────────

interface CapturedImg { data: Uint8ClampedArray; width: number; height: number }
const capturedPuts: CapturedImg[] = [];

// Glyph dimensions chosen so tmpW=tmpH=3 (with pad=1):
// measureText.width = 1 → tmpW = ceil(1) + 2 = 3
// ascent + descent = 1 → tmpH = ceil(1) + 2 = 3
const GLYPH_W = 3;
const GLYPH_H = 3;

let textWasDrawn = false;

const ttfCtx: any = {
  clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {},
  drawImage() {}, fillRect() {},
  // Treat every fillText as having painted glyph pixels in white opaque.
  fillText() { textWasDrawn = true; },
  createLinearGradient() { return { addColorStop: () => {} }; },
  getImageData(_x: number, _y: number, w: number, h: number) {
    const d = new Uint8ClampedArray(w * h * 4);
    if (textWasDrawn) {
      for (let i = 0; i < d.length; i += 4) {
        d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = 255;
      }
      textWasDrawn = false;
    }
    return { data: d, width: w, height: h };
  },
  putImageData(img: any, _x: number, _y: number) {
    capturedPuts.push({
      data: new Uint8ClampedArray(img.data),
      width: img.width,
      height: img.height,
    });
  },
  font: "", fillStyle: "" as any, textBaseline: "",
  canvas: { width: 1, height: 1 },
  measureText(_t: string) {
    return { width: 1, actualBoundingBoxAscent: 0.5, actualBoundingBoxDescent: 0.5 } as any;
  },
};

(global as any).document = {
  createElement: (_tag: string) => ({ width: 1, height: 1, getContext: () => ttfCtx }),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeNode() {
  const tf = { width: 100, height: 60, anchorX: 0.5, anchorY: 0.5 };
  return {
    on: () => {}, off: () => {}, emit: () => {},
    flagChangedVersion: 1,
    worldMatrix: { m00: 1, m01: 0, m02: 0, m03: 0, m04: 0, m05: 1, m06: 0, m07: 0, m12: 0, m13: 0, m14: 0, m15: 1 },
    _getUITransformComp() { return tf; },
  };
}

function freshLabel(text: string): StyledLabel {
  (StyledLabel as any)._mCtx = null;
  capturedPuts.length = 0;
  textWasDrawn = false;

  const label = new StyledLabel();
  (label as any).node = makeNode();
  label.string = text;
  label.fontSize = 1; // matches mock measure
  label.lineHeight = 1;
  label.wordWrap = false;
  label.align.horizontal = HAlign.LEFT;
  label.align.vertical = VAlign.TOP;
  label.onLoad();
  label.onEnable();
  return label;
}

function pixelAt(img: CapturedImg, x: number, y: number): [number, number, number, number] {
  const idx = (y * img.width + x) * 4;
  return [img.data[idx], img.data[idx + 1], img.data[idx + 2], img.data[idx + 3]];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("TTF bilinear 4-corner — per-pixel interpolation correctness", () => {
  test("corner pixels carry their corner colors; center pixel is the 4-corner average", () => {
    const label = freshLabel("A");
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Glyph;
    label.gradient.topLeft     = new Color(255, 0,   0,   255); // red
    label.gradient.topRight    = new Color(0,   255, 0,   255); // green
    label.gradient.bottomLeft  = new Color(0,   0,   255, 255); // blue
    label.gradient.bottomRight = new Color(255, 255, 0,   255); // yellow
    label._doUpdate();

    expect(capturedPuts.length).toBe(1);
    const img = capturedPuts[0];
    expect(img.width).toBe(GLYPH_W);
    expect(img.height).toBe(GLYPH_H);

    // (0,0) → u=0,v=0 → TL = red
    expect(pixelAt(img, 0, 0).slice(0, 3)).toEqual([255, 0, 0]);
    // (W-1,0) → u=1,v=0 → TR = green
    expect(pixelAt(img, GLYPH_W - 1, 0).slice(0, 3)).toEqual([0, 255, 0]);
    // (0,H-1) → u=0,v=1 → BL = blue
    expect(pixelAt(img, 0, GLYPH_H - 1).slice(0, 3)).toEqual([0, 0, 255]);
    // (W-1,H-1) → u=1,v=1 → BR = yellow
    expect(pixelAt(img, GLYPH_W - 1, GLYPH_H - 1).slice(0, 3)).toEqual([255, 255, 0]);

    // Center (1,1) → u=v=0.5 → average:
    //   r = (255 + 0 + 0 + 255)/4 = 127.5 → 127 (|0 floor)
    //   g = (0 + 255 + 0 + 255)/4 = 127.5 → 127
    //   b = (0 + 0 + 255 + 0)/4 = 63.75 → 63
    const center = pixelAt(img, 1, 1);
    expect(center[0]).toBe(127);
    expect(center[1]).toBe(127);
    expect(center[2]).toBe(63);
  });

  test("alpha is preserved on glyph pixels (input alpha=255 → output alpha=255)", () => {
    const label = freshLabel("A");
    label.gradient.enabled = true;
    label.gradient.topLeft     = new Color(100, 100, 100, 255);
    label.gradient.topRight    = new Color(100, 100, 100, 255);
    label.gradient.bottomLeft  = new Color(200, 200, 200, 255);
    label.gradient.bottomRight = new Color(200, 200, 200, 255);
    // intentionally not vertical to force bilinear path? actually still vertical here.
    // Force bilinear by changing one corner:
    label.gradient.bottomRight = new Color(50, 50, 50, 255);
    label._doUpdate();

    const img = capturedPuts[0];
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        expect(pixelAt(img, x, y)[3]).toBe(255);
      }
    }
  });
});
