// Gradient + underline — the underline (<u>...</u>) must remain visible when
// the label uses gradient mode.
//
// Symptom in production: with GradientScope.Glyph and a 4-corner gradient,
// `<u>hello</u>` renders the text correctly but the underline is missing
// (drawn with the canvas default fillStyle "#000000", which on dark / colored
// backgrounds blends in and disappears).
//
// Root cause this guards against:
//   In _drawContent the underline is drawn unconditionally via
//   `ctx.fillRect(curX, ..., w, h)` AFTER the gradient text branches. Most
//   gradient branches set `ctx.fillStyle` along the way (so the underline
//   inherits a sensible fill), but the per-glyph bilinear branch (gradOn,
//   non-vertical, Glyph scope) never assigns ctx.fillStyle — it only writes
//   to the temp canvas. The underline fillRect therefore uses whatever
//   fillStyle was leftover (default "#000000" on a fresh canvas), making it
//   invisible against many backgrounds.
//
// Contract being asserted:
//   1. When a word has style.underline, ctx.fillRect MUST be called.
//   2. The fillStyle in effect at that fillRect call MUST be a value the
//      label intentionally set in response to the current gradient/color
//      configuration — NOT empty string and NOT the canvas default "#000000"
//      leftover state.
//   3. Changing the gradient (or text color) MUST change the underline's
//      effective fillStyle — proving the underline tracks the configured
//      paint and isn't a hardcoded leftover.

import { Color } from "cc";
import { StyledLabel } from "../../../assets/styled-label/styled-label";
import { GradientScope, HAlign, VAlign } from "../../../assets/styled-label/styled-label.layout";

const DEFAULT_FONT_PX = 10;
const WIDTH_FACTOR    = 0.6;
const ASCENT_FACTOR   = 0.8;
const DESCENT_FACTOR  = 0.2;

interface FillRectEvent {
  x: number;
  y: number;
  w: number;
  h: number;
  fillStyleAtCall: any; // string or { __isGrad: true } sentinel object
  canvasW: number;
  canvasH: number;
}

const fillRectEvents: FillRectEvent[] = [];
const allMockCtxs: any[] = [];
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
  const ctx: any = {
    _font: "",
    _fillStyle: "#000000", // matches real canvas default
    canvas,
    textBaseline: "",
    clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {},
    drawImage() {}, putImageData() {},
    createLinearGradient() { return { addColorStop: () => {}, __isGrad: true }; },
    get font()  { return this._font; },
    set font(v: string) { this._font = v; },
    get fillStyle()  { return this._fillStyle; },
    set fillStyle(v: any) { this._fillStyle = v; },
    fillText(_t: string, _x: number, _y: number) { textWasDrawn = true; },
    fillRect(x: number, y: number, w: number, h: number) {
      fillRectEvents.push({
        x, y, w, h,
        fillStyleAtCall: ctx._fillStyle,
        canvasW: canvas.width,
        canvasH: canvas.height,
      });
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
    measureText(t: string) {
      const m = (ctx._font as string).match(/(\d+(?:\.\d+)?)px/);
      const fs = m ? parseFloat(m[1]) : DEFAULT_FONT_PX;
      const len = Math.max(1, (t ?? "").length);
      return {
        width: len * fs * WIDTH_FACTOR,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: len * fs * WIDTH_FACTOR,
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

  fillRectEvents.length = 0;
  textWasDrawn = false;
  for (const c of allMockCtxs) {
    c._font = "";
    c._fillStyle = "#000000";
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

function enable4CornerGradient(label: StyledLabel, scope: GradientScope, corners: { tl: Color; tr: Color; bl: Color; br: Color }): void {
  label.gradient.enabled = true;
  label.gradient.scope = scope;
  label.gradient.topLeft     = corners.tl;
  label.gradient.topRight    = corners.tr;
  label.gradient.bottomLeft  = corners.bl;
  label.gradient.bottomRight = corners.br;
}

// Underline rect lives on the MAIN offscreen canvas (sized for the whole word,
// width >> per-glyph temp canvas) and is thin compared to the canvas height.
function underlineEvents(): FillRectEvent[] {
  return fillRectEvents.filter(ev => ev.canvasW >= 100 && ev.h < ev.canvasH / 4);
}

const FOUR_CORNERS_A = {
  tl: new Color(255,   0,   0, 255),
  tr: new Color(  0, 255,   0, 255),
  bl: new Color(  0,   0, 255, 255),
  br: new Color(255, 255,   0, 255),
};
// Differs from A in BOTH bottom corners and one top corner — the underline
// sits at the bottom edge of the text, so we must vary BL/BR to be sure the
// assertion observes the change (regardless of whether the implementation
// derives the underline paint from top, bottom, or all four corners).
const FOUR_CORNERS_B = {
  tl: new Color(  0, 128, 255, 255),
  tr: new Color(  0, 255,   0, 255),
  bl: new Color(128,  64,  32, 255),
  br: new Color( 32,  64, 128, 255),
};

describe("TTF gradient + <u> — underline must remain visible", () => {
  test("baseline (no gradient): underline fillRect uses an intentional, non-default fillStyle", () => {
    const label = freshLabel("<u>hello</u>");
    label.onLoad(); label.onEnable();
    label._doUpdate();

    const ul = underlineEvents();
    expect(ul.length).toBe(1);
    expect(ul[0].fillStyleAtCall).not.toBe("");
    expect(ul[0].fillStyleAtCall).not.toBe("#000000");
  });

  test("[BUG] Glyph 4-corner gradient: underline fillRect is called", () => {
    const label = freshLabel("<u>hello</u>");
    enable4CornerGradient(label, GradientScope.Glyph, FOUR_CORNERS_A);
    label.onLoad(); label.onEnable();
    label._doUpdate();

    const ul = underlineEvents();
    expect(ul.length).toBe(1);
  });

  test("[BUG] Glyph 4-corner gradient: underline fillStyle is NOT canvas-default leftover", () => {
    const label = freshLabel("<u>hello</u>");
    enable4CornerGradient(label, GradientScope.Glyph, FOUR_CORNERS_A);
    label.onLoad(); label.onEnable();
    label._doUpdate();

    const ul = underlineEvents();
    expect(ul.length).toBe(1);
    const fs = ul[0].fillStyleAtCall;
    // Real Canvas default before any assignment is "#000000"; if the
    // bilinear branch forgets to set fillStyle, this is what we get.
    expect(fs).not.toBe("#000000");
    expect(fs).not.toBe("");
    expect(fs).toBeDefined();
  });

  test("[BUG] Glyph 4-corner gradient: underline fillStyle reflects the gradient (changing corners changes the underline paint)", () => {
    const labelA = freshLabel("<u>hello</u>");
    enable4CornerGradient(labelA, GradientScope.Glyph, FOUR_CORNERS_A);
    labelA.onLoad(); labelA.onEnable();
    labelA._doUpdate();
    const ulA = underlineEvents();
    expect(ulA.length).toBe(1);
    const fsA = ulA[0].fillStyleAtCall;

    const labelB = freshLabel("<u>hello</u>");
    enable4CornerGradient(labelB, GradientScope.Glyph, FOUR_CORNERS_B);
    labelB.onLoad(); labelB.onEnable();
    labelB._doUpdate();
    const ulB = underlineEvents();
    expect(ulB.length).toBe(1);
    const fsB = ulB[0].fillStyleAtCall;

    // Two configurations differing only in the gradient corners must produce
    // distinguishable underline paint. If both fall back to leftover/default
    // fillStyle they'd be identical — the assertion catches that.
    expect(fsA).not.toEqual(fsB);
  });

  test("[BUG] Line scope 4-corner gradient: underline fillRect is called with non-default fillStyle", () => {
    const label = freshLabel("<u>hello</u>");
    enable4CornerGradient(label, GradientScope.Line, FOUR_CORNERS_A);
    label.onLoad(); label.onEnable();
    label._doUpdate();

    const ul = underlineEvents();
    expect(ul.length).toBe(1);
    const fs = ul[0].fillStyleAtCall;
    expect(fs).not.toBe("#000000");
    expect(fs).not.toBe("");
  });
});
