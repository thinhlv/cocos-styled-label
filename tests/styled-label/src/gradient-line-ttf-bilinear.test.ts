// TTF non-vertical 4-corner gradient — scope=Line.
//
// Contract: u is computed against the LINE bounding box, not each glyph.
// With TL=red and TR=green, a left glyph (A) must show predominantly red
// (its pixels live near u≈0 within the line), while the right glyph (B)
// must show predominantly green (its pixels live near u≈1).
// If u were per-glyph, each glyph would individually span [0..1] and the
// max red channel would match between A and B — that's the failure mode
// this test guards against.

import { Color } from "cc";
import { StyledLabel } from "../../../assets/styled-label/styled-label";
import { GradientScope, HAlign, VAlign } from "../../../assets/styled-label/styled-label.layout";

// ── Mock that captures putImageData calls ────────────────────────────────────

interface CapturedImg { data: Uint8ClampedArray; width: number; height: number }
const capturedPuts: CapturedImg[] = [];

let textWasDrawn = false;

const ttfCtx: any = {
  clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {},
  drawImage() {}, fillRect() {},
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
  measureText(t: string) {
    const len = Math.max(1, (t ?? "").length);
    // Per-char width = 2 so each glyph's tmp canvas (with pad=1) is 4x3 and
    // the leftmost glyph's padding column stays *left* of lineLeft (u < 0).
    return { width: len * 2, actualBoundingBoxAscent: 0.5, actualBoundingBoxDescent: 0.5 } as any;
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
  (StyledLabel as any)._measureCache?.clear();
  (StyledLabel as any)._inflatedMap = null;
  capturedPuts.length = 0;
  textWasDrawn = false;

  const label = new StyledLabel();
  (label as any).node = makeNode();
  label.string = text;
  label.fontSize = 1;
  label.lineHeight = 1;
  label.wordWrap = false;
  label.align.horizontal = HAlign.LEFT;
  label.align.vertical = VAlign.TOP;
  label.onLoad();
  label.onEnable();
  return label;
}

function maxChannel(img: CapturedImg, channel: 0 | 1 | 2): number {
  let max = 0;
  const px = img.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    if (px[i + channel] > max) max = px[i + channel];
  }
  return max;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("TTF scope=Line bilinear — u spans the entire line, not per glyph", () => {
  test("'AB' with TL=red TR=green: A's red max > B's red max; B's green max > A's green max", () => {
    const label = freshLabel("AB");
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Line;
    label.gradient.topLeft     = new Color(255, 0,   0,   255); // red
    label.gradient.topRight    = new Color(0,   255, 0,   255); // green
    label.gradient.bottomLeft  = new Color(255, 0,   0,   255); // red
    label.gradient.bottomRight = new Color(0,   255, 0,   255); // green
    label._doUpdate();

    expect(capturedPuts.length).toBe(2);
    const [imgA, imgB] = capturedPuts;

    const aRedMax = maxChannel(imgA, 0);
    const bRedMax = maxChannel(imgB, 0);
    const aGreenMax = maxChannel(imgA, 1);
    const bGreenMax = maxChannel(imgB, 1);

    // Left glyph leans toward TL/BL (red); right glyph leans toward TR/BR (green).
    expect(aRedMax).toBeGreaterThan(bRedMax);
    expect(bGreenMax).toBeGreaterThan(aGreenMax);
  });

  test("'AB' with TL=BL=red, TR=BR=green: A's leftmost-visible pixel ≈ red, B's rightmost-visible pixel ≈ green", () => {
    const label = freshLabel("AB");
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Line;
    label.gradient.topLeft     = new Color(255, 0, 0, 255);
    label.gradient.topRight    = new Color(0, 255, 0, 255);
    label.gradient.bottomLeft  = new Color(255, 0, 0, 255);
    label.gradient.bottomRight = new Color(0, 255, 0, 255);
    label._doUpdate();

    const [imgA, imgB] = capturedPuts;

    // With per-char width=2 and pad=1: each tmp canvas is 4 pixels wide.
    // A is rendered with baseX=-1 (cx=0 − pad), so its column x=1 sits at lineLeft (u=0).
    // B is rendered with baseX=1 (cx=2 − pad), so its column x=3 sits at lineRight (u=1).
    function pixelAtRow0(img: CapturedImg, x: number): [number, number, number] {
      const idx = (0 * img.width + x) * 4;
      return [img.data[idx], img.data[idx + 1], img.data[idx + 2]];
    }

    const aLeftVisible  = pixelAtRow0(imgA, 1);
    const bRightVisible = pixelAtRow0(imgB, 3);

    expect(aLeftVisible[0]).toBeGreaterThan(aLeftVisible[1]);   // A's leftmost-visible: red dominates
    expect(bRightVisible[1]).toBeGreaterThan(bRightVisible[0]); // B's rightmost-visible: green dominates
  });

  test("alpha is preserved on glyph pixels in line mode", () => {
    const label = freshLabel("AB");
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Line;
    label.gradient.topLeft     = new Color(100, 100, 100, 255);
    label.gradient.topRight    = new Color(50, 50, 50, 255);
    label.gradient.bottomLeft  = new Color(100, 100, 100, 255);
    label.gradient.bottomRight = new Color(200, 200, 200, 255);
    label._doUpdate();

    for (const img of capturedPuts) {
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const idx = (y * img.width + x) * 4;
          if (img.data[idx + 3] !== 0) {
            expect(img.data[idx + 3]).toBe(255);
          }
        }
      }
    }
  });
});
