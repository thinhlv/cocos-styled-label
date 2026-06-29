// Debug test: "Te" + gradient + Glyph scope shifts the 'e' glyph to the right.
//
// Symptom (TTF path, with outline enabled to make the misalignment visible):
//   - gradient OFF                          → outline and fill of 'e' align.
//   - gradient ON, scope = Line             → outline and fill of 'e' align.
//   - gradient ON, scope = Glyph            → 'e' fill drifts right of outline.
//
// Contract being tested:
//   Glyph screen position must not depend on whether gradient is enabled or on
//   which gradient scope is chosen. The per-glyph fill in Glyph scope must hit
//   the same x where the canvas would naturally place that glyph inside a
//   whole-word render (i.e. honoring the kerned advance of the preceding
//   characters as reported by measureText on the cumulative pair, not on the
//   single previous character).
//
// Synthetic kerning model: every char is 10px wide; the pair "Te" has a -2px
// kerning. Hence:
//   measureText("T")  = 10
//   measureText("e")  = 10
//   measureText("Te") = 18  ← kerning applied
//   kerned advance of 'T' inside "Te" = measureText("Te") - measureText("e") = 8

import { Color } from "cc";
import { StyledLabel } from "../../../assets/styled-label/styled-label";
import { GradientScope, HAlign, VAlign } from "../../../assets/styled-label/styled-label.layout";

interface FillCall   { text: string; x: number; y: number; }
interface StrokeCall { text: string; x: number; y: number; }

let fillCalls: FillCall[] = [];
let strokeCalls: StrokeCall[] = [];

const GLYPH_W = 10;
const TE_KERN = 2;

function widthOf(text: string): number {
  let w = text.length * GLYPH_W;
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] === "T" && text[i + 1] === "e") w -= TE_KERN;
  }
  return w;
}

const spyCtx: any = {
  clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {},
  drawImage() {}, fillRect() {},
  font: "",
  fillStyle: "" as any,
  strokeStyle: "" as any,
  textBaseline: "",
  lineWidth: 1, lineJoin: "miter", miterLimit: 10,
  shadowColor: "rgba(0,0,0,0)", shadowBlur: 0,
  createLinearGradient() { return { addColorStop() {} }; },
  fillText(text: string, x: number, y: number) { fillCalls.push({ text, x, y }); },
  strokeText(text: string, x: number, y: number) { strokeCalls.push({ text, x, y }); },
  measureText(t: string) {
    return {
      width: widthOf(t),
      actualBoundingBoxAscent: 12,
      actualBoundingBoxDescent: 4,
      fontBoundingBoxAscent: 14,
    } as any;
  },
};

(global as any).document = {
  createElement: () => ({ width: 1, height: 1, getContext: () => spyCtx }),
};

function makeNode() {
  const tf = { width: 300, height: 80, anchorX: 0.5, anchorY: 0.5 };
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
  fillCalls = [];
  strokeCalls = [];

  const label = new StyledLabel();
  (label as any).node = makeNode();
  label.string = text;
  label.fontSize = 40;
  label.lineHeight = 40;
  label.wordWrap = false;
  label.align.horizontal = HAlign.LEFT;
  label.align.vertical = VAlign.TOP;
  label.onLoad();
  label.onEnable();
  return label;
}

function setGradientColors(label: StyledLabel) {
  label.gradient.topLeft     = new Color(0, 255, 0, 255);
  label.gradient.topRight    = new Color(0, 255, 0, 255);
  label.gradient.bottomLeft  = new Color(255, 0, 0, 255);
  label.gradient.bottomRight = new Color(255, 0, 0, 255);
}

describe("'Te' glyph position invariance under gradient (TTF path)", () => {
  test("gradient ON + Glyph scope: word-level fillText uses native kerning (no per-glyph shift)", () => {
    const label = freshLabel("Te");
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Glyph;
    setGradientColors(label);
    label._doUpdate();

    const wordFills = fillCalls.filter(c => c.text === "Te");
    expect(wordFills.length).toBe(1);
    const perCharFills = fillCalls.filter(c => c.text === "T" || c.text === "e");
    expect(perCharFills.length).toBe(0);
  });

  test("gradient ON + Glyph scope + outline ON: fill and stroke share the same word origin", () => {
    const label = freshLabel("Te");
    label.outline.enabled = true;
    label.outline.thickness = 2;
    label.outline.color = new Color(0, 0, 0, 255);
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Glyph;
    setGradientColors(label);
    label._doUpdate();

    const teStroke = strokeCalls.find(c => c.text === "Te");
    const teFill = fillCalls.find(c => c.text === "Te");
    expect(teStroke).toBeDefined();
    expect(teFill).toBeDefined();
    expect(teFill!.x).toBe(teStroke!.x);
  });

  test("gradient ON + Line scope: 'Te' is drawn as a single fillText (canvas handles kerning natively, no shift)", () => {
    const label = freshLabel("Te");
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Line;
    setGradientColors(label);
    label._doUpdate();

    // Line scope draws the whole word in one fillText, so there is no
    // per-glyph positioning by the engine — the canvas places 'e' itself
    // using its native kerning. No shift can occur.
    const wordFills = fillCalls.filter(c => c.text === "Te");
    expect(wordFills.length).toBe(1);
    const perCharFills = fillCalls.filter(c => c.text === "T" || c.text === "e");
    expect(perCharFills.length).toBe(0);
  });

  test("gradient OFF: 'Te' is drawn as a single fillText (no shift possible)", () => {
    const label = freshLabel("Te");
    label._doUpdate();

    const wordFills = fillCalls.filter(c => c.text === "Te");
    expect(wordFills.length).toBe(1);
    const perCharFills = fillCalls.filter(c => c.text === "T" || c.text === "e");
    expect(perCharFills.length).toBe(0);
  });
});
