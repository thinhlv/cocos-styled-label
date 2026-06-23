// Gradient first-glyph clipping — measureText must reflect the requested font.
//
// Symptom in production: with a 4-corner gradient applied to "STYLED LABEL" at
// fontSize=40, the FIRST character of the FIRST line is severely clipped
// (e.g. only a thin slice of 'S' / '0' remains), while every subsequent
// character renders correctly. Multi-line text reproduces it only on the very
// first glyph — confirming a one-time state issue, not a layout / side-bearing
// issue.
//
// Root cause being guarded here:
//   _paintBilinearGlyph calls tmp.measureText(ch) to size the per-glyph temp
//   canvas, but at the moment of the very first call the temp ctx still has
//   the canvas default font ("10px sans-serif"). measureText returns metrics
//   for the DEFAULT font, not the requested font, so the temp canvas is sized
//   ~4x too small. fillText is then issued with the correct font, painting
//   ink that overflows the under-sized canvas and gets clipped.
//
// Contract being asserted (purely from the public API):
//   When _paintBilinearGlyph composites a glyph through the temp canvas, the
//   temp canvas at fillText time MUST be sized to accommodate ink rendered
//   in the requested font — not the default.
//
// Test fidelity: the mock gives EACH document.createElement('canvas') its own
// independent ctx with its own font state, so main-pipeline font assignments
// don't leak into the gradient temp ctx. canvas.width/height setters reset
// that ctx's font to "" (matching the real DOM contract). Between tests, all
// tracked ctxs and their canvases are reset to the "freshly created" state,
// so every test exercises the first-ever-call bug independently.

import { Color } from "cc";
import { StyledLabel } from "../../../assets/styled-label/styled-label";
import { GradientScope, HAlign, VAlign } from "../../../assets/styled-label/styled-label.layout";

const DEFAULT_FONT_PX = 10;     // canvas default = "10px sans-serif"
const WIDTH_FACTOR    = 0.6;
const ASCENT_FACTOR   = 0.8;
const DESCENT_FACTOR  = 0.2;

interface FillTextEvent {
  ctxId: number;
  text: string;
  x: number;
  y: number;
  fontAtCall: string;
  canvasW: number;
  canvasH: number;
}

const fillTextEvents: FillTextEvent[] = [];
const allMockCtxs: any[] = [];
let nextCtxId = 0;
let textWasDrawn = false;

function makeMockCanvas() {
  let theCtx: any = null;
  const canvas: any = {
    _w: 1,
    _h: 1,
    get width()  { return this._w; },
    set width(v: number)  { this._w = v; if (theCtx) theCtx._font = ""; },
    get height() { return this._h; },
    set height(v: number) { this._h = v; if (theCtx) theCtx._font = ""; },
    getContext() {
      if (!theCtx) {
        theCtx = makeMockCtx(canvas);
        allMockCtxs.push(theCtx);
      }
      return theCtx;
    },
  };
  return canvas;
}

function makeMockCtx(canvas: any) {
  const id = ++nextCtxId;
  const ctx: any = {
    _id: id,
    _font: "",
    canvas,
    fillStyle: "" as any,
    textBaseline: "",
    clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {},
    fillRect() {}, drawImage() {},
    createLinearGradient() { return { addColorStop: () => {} }; },
    putImageData() {},
    get font()  { return this._font; },
    set font(v: string) { this._font = v; },
    fillText(text: string, x: number, y: number) {
      fillTextEvents.push({
        ctxId: id,
        text, x, y,
        fontAtCall: ctx._font,
        canvasW: canvas.width,
        canvasH: canvas.height,
      });
      textWasDrawn = true;
    },
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
    measureText(_t: string) {
      const m = (ctx._font as string).match(/(\d+(?:\.\d+)?)px/);
      const fs = m ? parseFloat(m[1]) : DEFAULT_FONT_PX;
      return {
        width: fs * WIDTH_FACTOR,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: fs * WIDTH_FACTOR,
        actualBoundingBoxAscent: fs * ASCENT_FACTOR,
        actualBoundingBoxDescent: fs * DESCENT_FACTOR,
        fontBoundingBoxAscent: fs * ASCENT_FACTOR,
      } as any;
    },
  };
  return ctx;
}

(global as any).document = {
  createElement: (_tag: string) => makeMockCanvas(),
};

function makeNode() {
  const tf = { width: 400, height: 80, anchorX: 0.5, anchorY: 0.5 };
  return {
    on: () => {}, off: () => {}, emit: () => {},
    flagChangedVersion: 1,
    worldMatrix: { m00: 1, m01: 0, m02: 0, m03: 0, m04: 0, m05: 1, m06: 0, m07: 0, m12: 0, m13: 0, m14: 0, m15: 1 },
    _getUITransformComp() { return tf; },
  };
}

function freshLabel(text: string, fontSize = 40): StyledLabel {
  (StyledLabel as any)._mCtx = null;
  (StyledLabel as any)._measureCache?.clear();
  (StyledLabel as any)._inflatedMap = null;

  fillTextEvents.length = 0;
  textWasDrawn = false;
  // Reset every ctx the mock has handed out so every test re-runs the
  // first-ever paint where ctx.font defaults to "" / "10px sans-serif".
  for (const c of allMockCtxs) {
    c._font = "";
    c.canvas._w = 1;
    c.canvas._h = 1;
  }

  const label = new StyledLabel();
  (label as any).node = makeNode();
  label.string = text;
  label.fontSize = fontSize;
  label.lineHeight = fontSize;
  label.wordWrap = false;
  label.align.horizontal = HAlign.LEFT;
  label.align.vertical = VAlign.TOP;
  return label;
}

function enableBilinearGradient(label: StyledLabel, scope: GradientScope = GradientScope.Glyph): void {
  label.gradient.enabled = true;
  label.gradient.scope = scope;
  label.gradient.topLeft     = new Color(255,   0,   0, 255);
  label.gradient.topRight    = new Color(  0, 255,   0, 255);
  label.gradient.bottomLeft  = new Color(  0,   0, 255, 255);
  label.gradient.bottomRight = new Color(255, 255,   0, 255);
}

// Per-glyph fillText events live on the GRADIENT temp ctx — identified by a
// small canvas (sized to a single glyph) and single-character text.
function gradientGlyphEvents(): FillTextEvent[] {
  return fillTextEvents.filter(ev => ev.text.length === 1 && ev.canvasW < 200);
}

describe("TTF bilinear gradient — first-glyph clipping", () => {
  test("[BUG] first character: temp canvas is sized for the REQUESTED font, not the default", () => {
    const FONT_SIZE = 40;
    const EXPECTED_INK_W = FONT_SIZE * WIDTH_FACTOR;     // 24
    const DEFAULT_INK_W  = DEFAULT_FONT_PX * WIDTH_FACTOR; // 6

    const label = freshLabel("0", FONT_SIZE);
    enableBilinearGradient(label);
    label.onLoad(); label.onEnable();
    label._doUpdate();

    const evs = gradientGlyphEvents();
    expect(evs.length).toBe(1);
    const ev = evs[0];
    expect(ev.canvasW).toBeGreaterThanOrEqual(EXPECTED_INK_W);
    // Buggy implementation would yield ~DEFAULT_INK_W + 2 (default-font sizing).
    expect(ev.canvasW).toBeGreaterThan(DEFAULT_INK_W + 4);
  });

  test("[BUG] every glyph across multi-line text is correctly sized (no first-of-line clipping)", () => {
    const FONT_SIZE = 40;
    const EXPECTED_INK_W = FONT_SIZE * WIDTH_FACTOR;

    const label = freshLabel("0000<br/>SSSSS<br/>HHHHH", FONT_SIZE);
    enableBilinearGradient(label);
    label.onLoad(); label.onEnable();
    label._doUpdate();

    const evs = gradientGlyphEvents();
    expect(evs.length).toBe(14); // 4+5+5
    for (const ev of evs) {
      expect(ev.canvasW).toBeGreaterThanOrEqual(EXPECTED_INK_W);
    }
  });

  test("ctx.font at the moment of fillText must match the requested font (no stale default)", () => {
    const label = freshLabel("AB", 40);
    enableBilinearGradient(label);
    label.onLoad(); label.onEnable();
    label._doUpdate();

    const evs = gradientGlyphEvents();
    expect(evs.length).toBeGreaterThanOrEqual(2);
    for (const ev of evs) {
      expect(ev.fontAtCall).toMatch(/40px/);
    }
  });

  test("[BUG] same first-glyph invariant under GradientScope.Line", () => {
    const FONT_SIZE = 40;
    const EXPECTED_INK_W = FONT_SIZE * WIDTH_FACTOR;

    const label = freshLabel("AB", FONT_SIZE);
    enableBilinearGradient(label, GradientScope.Line);
    label.onLoad(); label.onEnable();
    label._doUpdate();

    const evs = gradientGlyphEvents();
    expect(evs.length).toBeGreaterThanOrEqual(2);
    for (const ev of evs) {
      expect(ev.canvasW).toBeGreaterThanOrEqual(EXPECTED_INK_W);
    }
  });
});
