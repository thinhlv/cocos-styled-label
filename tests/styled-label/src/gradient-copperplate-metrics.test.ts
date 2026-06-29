// Safari TTF gradient crop — Copperplate-like TextMetrics vs OpenSans-like control.
//
// Symptom (Safari, Copperplate.ttf): when gradient.enabled=true — even with all 4
// corners white — glyphs are vertically clipped. Outline renders correctly because
// strokeText is not bounded by CanvasGradient metrics.
//
// Root cause guarded here:
//   Per-glyph vertical gradient uses actualBoundingBoxAscent/Descent from measureText
//   to size createLinearGradient(yTop, yBot). On Safari with serif fonts like
//   Copperplate, actualBoundingBox* is much smaller than fontBoundingBox* (true ink
//   extent). WebKit clips gradient fills to the gradient box → top/bottom crop.
//
// OpenSans-Bold has aligned metrics on Safari → no visible crop with actualBoundingBox.

import { Color } from "cc";
import { StyledLabel } from "../../../assets/styled-label/styled-label";
import { GradientScope, HAlign, OverflowMode, VAlign } from "../../../assets/styled-label/styled-label.layout";

const BASELINE_RATIO = 0.26;
const DEFAULT_FONT_PX = 10;
const WIDTH_FACTOR = 0.6;

/** Cocos-style ascent from line-top to alphabetic baseline. */
function wordAscent(fs: number): number {
  return fs * (1 - BASELINE_RATIO / 2);
}

/** Minimum gradient / temp-canvas height that covers true font ink extent. */
function requiredInkHeight(fs: number, profile: MetricsProfile): number {
  return fs * (profile.fba + profile.fbd);
}

interface MetricsProfile {
  name: string;
  aba: number; // actualBoundingBoxAscent / fontSize
  abd: number;
  fba: number; // fontBoundingBoxAscent / fontSize
  fbd: number;
  omitFontBBox?: boolean;
}

const CopperplateLike: MetricsProfile = {
  name: "CopperplateLike",
  // Safari + Copperplate.ttf: actual box much smaller than font bounding box.
  aba: 0.60,
  abd: 0.12,
  fba: 1.05,
  fbd: 0.22,
};

const OpenSansLike: MetricsProfile = {
  name: "OpenSansLike",
  // OpenSans-Bold on Safari: metrics aligned — no crop with actualBoundingBox path.
  aba: 0.85,
  abd: 0.15,
  fba: 0.85,
  fbd: 0.15,
};

/** Safari custom TTF: fontBoundingBox* often omitted from measureText. */
const SafariCopperplateNoFBA: MetricsProfile = {
  name: "SafariCopperplateNoFBA",
  aba: 0.60,
  abd: 0.12,
  fba: 0,
  fbd: 0,
  omitFontBBox: true,
};

interface GradientCall { x0: number; y0: number; x1: number; y1: number }
interface FillTextEvent {
  ctxId: number;
  text: string;
  x: number;
  y: number;
  canvasW: number;
  canvasH: number;
}
interface StrokeCall { text: string; x: number; y: number }

let activeProfile: MetricsProfile = CopperplateLike;
let gradientsCreated: GradientCall[] = [];
let fillTextEvents: FillTextEvent[] = [];
let strokeCalls: StrokeCall[] = [];
const allMockCtxs: any[] = [];
let nextCtxId = 0;
let textWasDrawn = false;

function metricsForFont(fontStr: string): MetricsProfile & { fs: number; width: number } {
  const m = fontStr.match(/(\d+(?:\.\d+)?)px/);
  const fs = m ? parseFloat(m[1]) : DEFAULT_FONT_PX;
  const p = activeProfile;
  return {
    ...p,
    fs,
    width: fs * WIDTH_FACTOR,
  };
}

function makeMockCanvas() {
  let theCtx: any = null;
  const canvas: any = {
    _w: 400,
    _h: 80,
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
    strokeStyle: "",
    textBaseline: "",
    lineWidth: 1,
    lineJoin: "miter",
    miterLimit: 10,
    shadowColor: "rgba(0,0,0,0)",
    shadowBlur: 0,
    clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {},
    fillRect() {}, drawImage() {},
    createLinearGradient(x0: number, y0: number, x1: number, y1: number) {
      gradientsCreated.push({ x0, y0, x1, y1 });
      return { addColorStop: () => {} };
    },
    putImageData() {},
    get font()  { return this._font; },
    set font(v: string) { this._font = v; },
    fillText(text: string, x: number, y: number) {
      fillTextEvents.push({
        ctxId: id,
        text, x, y,
        canvasW: canvas.width,
        canvasH: canvas.height,
      });
      textWasDrawn = true;
    },
    strokeText(text: string, x: number, y: number) {
      strokeCalls.push({ text, x, y });
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
      const met = metricsForFont(ctx._font);
      const base: any = {
        width: met.width,
        actualBoundingBoxAscent:  met.fs * met.aba,
        actualBoundingBoxDescent: met.fs * met.abd,
      };
      if (!met.omitFontBBox) {
        base.fontBoundingBoxAscent  = met.fs * met.fba;
        base.fontBoundingBoxDescent = met.fs * met.fbd;
      }
      return base;
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

function resetMocks(profile: MetricsProfile) {
  activeProfile = profile;
  (StyledLabel as any)._mCtx = null;
  (StyledLabel as any)._measureCache?.clear();
  (StyledLabel as any)._inflatedMap = null;
  gradientsCreated = [];
  fillTextEvents = [];
  strokeCalls = [];
  textWasDrawn = false;
  for (const c of allMockCtxs) {
    c._font = "";
    c.canvas._w = 400;
    c.canvas._h = 80;
  }
}

function freshLabel(text: string, profile: MetricsProfile, fontSize = 40): StyledLabel {
  resetMocks(profile);
  const label = new StyledLabel();
  (label as any).node = makeNode();
  label.string = text;
  label.fontSize = fontSize;
  label.lineHeight = fontSize;
  label.wordWrap = false;
  label.overflow = OverflowMode.CLAMP;
  label.align.horizontal = HAlign.LEFT;
  label.align.vertical = VAlign.TOP;
  return label;
}

function enableUniformWhiteGradient(label: StyledLabel): void {
  label.gradient.enabled = true;
  label.gradient.scope = GradientScope.Glyph;
  label.gradient.topLeft     = new Color(255, 255, 255, 255);
  label.gradient.topRight    = new Color(255, 255, 255, 255);
  label.gradient.bottomLeft  = new Color(255, 255, 255, 255);
  label.gradient.bottomRight = new Color(255, 255, 255, 255);
}

function enableColoredVerticalGradient(label: StyledLabel): void {
  label.gradient.enabled = true;
  label.gradient.scope = GradientScope.Glyph;
  label.gradient.topLeft     = new Color(255, 240, 200, 255);
  label.gradient.topRight    = new Color(255, 240, 200, 255);
  label.gradient.bottomLeft  = new Color(255, 200, 50, 255);
  label.gradient.bottomRight = new Color(255, 200, 50, 255);
}

/** Padded ink height used by _glyphInkMetrics when fontBoundingBox is missing. */
function paddedInkHeight(fs: number): number {
  const wa = wordAscent(fs);
  const pad = Math.ceil(fs * BASELINE_RATIO / 2);
  const emAscent = wa + pad;
  const emDescent = pad;
  const aba = fs * SafariCopperplateNoFBA.aba;
  const abd = fs * SafariCopperplateNoFBA.abd;
  const ascentPx = Math.max(aba, wa, emAscent) + pad;
  const descentPx = Math.max(abd, emDescent) + pad;
  return ascentPx + descentPx;
}

function enableBilinearGradient(label: StyledLabel): void {
  label.gradient.enabled = true;
  label.gradient.scope = GradientScope.Glyph;
  label.gradient.topLeft     = new Color(255,   0,   0, 255);
  label.gradient.topRight    = new Color(  0, 255,   0, 255);
  label.gradient.bottomLeft  = new Color(  0,   0, 255, 255);
  label.gradient.bottomRight = new Color(255, 255,   0, 255);
}

/** Per-glyph fillText on the bilinear temp canvas (small canvas height). */
function bilinearGlyphEvents(): FillTextEvent[] {
  return fillTextEvents.filter(ev => ev.text.length === 1 && ev.canvasH < 80);
}

/** Per-glyph vertical gradient fillText (offscreen canvas, not the temp glyph buffer). */
function verticalGlyphFills(): FillTextEvent[] {
  return fillTextEvents.filter(ev => ev.text.length === 1 && ev.canvasH >= 80);
}

describe("TTF gradient — Copperplate-like Safari metrics", () => {
  const FONT_SIZE = 40;
  const TEXT = "TAP TO PLAY";

  test("uniform white 4-corner gradient: solid word fill, no CanvasGradient (Safari bypass)", () => {
    const label = freshLabel(TEXT, CopperplateLike, FONT_SIZE);
    enableUniformWhiteGradient(label);
    label.onLoad(); label.onEnable();
    label._doUpdate();

    expect(gradientsCreated.length).toBe(0);
    expect(verticalGlyphFills().length).toBe(0);
    expect(fillTextEvents.length).toBeGreaterThanOrEqual(1);
    // Each word drawn with word-level fillText (same path as solid fill).
    for (const ev of fillTextEvents) {
      expect(ev.text.length).toBeGreaterThan(0);
    }
  });

  test("[BUG] colored vertical gradient without fontBoundingBox: word gradient span is padded", () => {
    const label = freshLabel("PLAY", SafariCopperplateNoFBA, FONT_SIZE);
    enableColoredVerticalGradient(label);
    label.onLoad(); label.onEnable();
    label._doUpdate();

    expect(gradientsCreated.length).toBeGreaterThanOrEqual(1);
    const required = paddedInkHeight(FONT_SIZE);
    for (const g of gradientsCreated) {
      expect(g.y1 - g.y0).toBeGreaterThanOrEqual(required - 0.01);
    }
    // Word-level fill, not per-glyph.
    expect(fillTextEvents.some(ev => ev.text === "PLAY")).toBe(true);
  });

  test("OpenSans-like control: uniform white uses solid bypass, no gradient", () => {
    const label = freshLabel(TEXT, OpenSansLike, FONT_SIZE);
    enableUniformWhiteGradient(label);
    label.onLoad(); label.onEnable();
    label._doUpdate();

    expect(gradientsCreated.length).toBe(0);
    expect(fillTextEvents.length).toBeGreaterThanOrEqual(1);
  });

  test("solid fill without gradient: word-level fillText, no per-glyph linearGradient", () => {
    const label = freshLabel(TEXT, CopperplateLike, FONT_SIZE);
    label.onLoad(); label.onEnable();
    label._doUpdate();

    expect(gradientsCreated.length).toBe(0);
    const wordFills = fillTextEvents.filter(ev => ev.text === TEXT);
    expect(wordFills.length).toBe(1);
  });

  test("outline + uniform white gradient: strokeText independent of gradient bounds", () => {
    const label = freshLabel(TEXT, CopperplateLike, FONT_SIZE);
    enableUniformWhiteGradient(label);
    label.outline.enabled = true;
    label.outline.thickness = 2;
    label.outline.color = new Color(0, 0, 0, 255);
    label.onLoad(); label.onEnable();
    label._doUpdate();

    expect(strokeCalls.length).toBeGreaterThanOrEqual(1);
    expect(strokeCalls[0].text).toBe(TEXT);
    // Uniform white fill uses word-level solid path alongside outline stroke.
    expect(gradientsCreated.length).toBe(0);
  });

  test("[BUG] bilinear 4-corner: temp canvas height covers padded ink (no fontBoundingBox)", () => {
    const label = freshLabel("Y", SafariCopperplateNoFBA, FONT_SIZE);
    enableBilinearGradient(label);
    label.onLoad(); label.onEnable();
    label._doUpdate();

    const evs = bilinearGlyphEvents();
    expect(evs.length).toBe(1);
    const required = Math.ceil(paddedInkHeight(FONT_SIZE)) + 2; // pad=1 each side
    expect(evs[0].canvasH).toBeGreaterThanOrEqual(required);
  });
});
