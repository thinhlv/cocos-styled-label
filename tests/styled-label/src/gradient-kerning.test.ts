// Per-glyph gradient must respect kerning.
//
// When the canvas API reports kerned width via measureText(prefix), each glyph's
// fillText x position must come from the prefix width (so the next glyph sits at
// the kerned offset of the previous prefix), not from cumulative single-glyph widths.
//
// Bug repro: "Text" has negative kerning on the "Te" pair. With the broken impl,
// fillText("e", curX + measureText("T").width, …) lands at curX + glyphWidth("T"),
// which is wider than the kerned "Te" group → outline drawn via strokeText("Text", …)
// stays at the kerned positions, so the gradient-filled glyphs visibly drift right
// relative to the outline.

import { Color } from "cc";
import { StyledLabel } from "../../../assets/styled-label/styled-label";
import { GradientScope, HAlign, VAlign } from "../../../assets/styled-label/styled-label.layout";

interface FillCall { text: string; x: number; y: number; }
let fillCalls: FillCall[] = [];

// Simulated kerning table — pair "Te" is 2px narrower than naive T+e.
const NAIVE_GLYPH_W = 10;
function widthOf(text: string): number {
  // base = NAIVE_GLYPH_W per char; for every "Te" substring, shave 2px (kerning).
  let w = text.length * NAIVE_GLYPH_W;
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] === "T" && text[i + 1] === "e") w -= 2;
  }
  return w;
}

const spyCtx: any = {
  clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {},
  drawImage() {}, fillRect() {}, strokeText() {},
  font: "",
  fillStyle: "" as any,
  strokeStyle: "" as any,
  textBaseline: "",
  lineWidth: 1, lineJoin: "miter", miterLimit: 10,
  shadowColor: "rgba(0,0,0,0)", shadowBlur: 0,
  createLinearGradient() { return { addColorStop() {} }; },
  fillText(text: string, x: number, y: number) { fillCalls.push({ text, x, y }); },
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

describe("Per-glyph gradient — kerned glyph positions", () => {
  test("vertical gradient: 'e' in 'Text' sits at the kerned offset of 'T', not the unkerned glyph width", () => {
    const label = freshLabel("Text");
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Glyph;
    label.gradient.topLeft     = new Color(0, 255, 0, 255);
    label.gradient.topRight    = new Color(0, 255, 0, 255);
    label.gradient.bottomLeft  = new Color(255, 0, 0, 255);
    label.gradient.bottomRight = new Color(255, 0, 0, 255);
    label._doUpdate();

    // 4 chars expected.
    expect(fillCalls.map(c => c.text).join("")).toBe("Text");
    const xT = fillCalls[0].x;
    const xe = fillCalls[1].x;
    const xx = fillCalls[2].x;
    const xt = fillCalls[3].x;

    // 'e' must sit at the kerned offset of 'T' inside "Te":
    //   xT + measureText("Te") - measureText("e") = xT + 18 - 10 = xT + 8.
    expect(xe - xT).toBe(widthOf("Te") - widthOf("e"));
    // 'x' must sit at xT + (measureText("Tex") - measureText("x")) = xT + 18.
    expect(xx - xT).toBe(widthOf("Tex") - widthOf("x"));
    // 't' at xT + (measureText("Text") - measureText("t")) = xT + 28.
    expect(xt - xT).toBe(widthOf("Text") - widthOf("t"));
  });

  test("kerning consistency: end-of-last-glyph == measureText(whole word)", () => {
    const label = freshLabel("Text");
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Glyph;
    label.gradient.topLeft    = new Color(0, 255, 0, 255);
    label.gradient.topRight   = new Color(0, 255, 0, 255);
    label.gradient.bottomLeft = new Color(255, 0, 0, 255);
    label.gradient.bottomRight= new Color(255, 0, 0, 255);
    label._doUpdate();

    const x0 = fillCalls[0].x;
    const xt = fillCalls[3].x;
    // Position of final 't' relative to start must match measureText("Tex") (kerned).
    expect(xt - x0).toBe(widthOf("Tex"));
    // And start-to-end-of-word matches measureText("Text") (kerned), modulo last glyph width.
    const lastEnd = (xt - x0) + widthOf("t");
    expect(lastEnd).toBe(widthOf("Text"));
  });

});
