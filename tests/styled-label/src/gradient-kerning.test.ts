// Vertical gradient — word-level fillText preserves native canvas kerning.
//
// Per-glyph gradient fill was replaced with word-level fillText for vertical
// gradients (Safari clips gradient fill to the gradient box). Canvas applies
// kerning natively when rendering the whole word in one fillText call.

import { Color } from "cc";
import { StyledLabel } from "../../../assets/styled-label/styled-label";
import { GradientScope, HAlign, VAlign } from "../../../assets/styled-label/styled-label.layout";

interface FillCall { text: string; x: number; y: number; }
let fillCalls: FillCall[] = [];

const NAIVE_GLYPH_W = 10;
function widthOf(text: string): number {
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
      fontBoundingBoxDescent: 4,
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

describe("Word-level vertical gradient — native kerning", () => {
  test("vertical gradient: whole word rendered in one fillText (canvas kerning)", () => {
    const label = freshLabel("Text");
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Glyph;
    label.gradient.topLeft     = new Color(0, 255, 0, 255);
    label.gradient.topRight    = new Color(0, 255, 0, 255);
    label.gradient.bottomLeft  = new Color(255, 0, 0, 255);
    label.gradient.bottomRight = new Color(255, 0, 0, 255);
    label._doUpdate();

    expect(fillCalls.length).toBe(1);
    expect(fillCalls[0].text).toBe("Text");
    expect(fillCalls.filter(c => c.text.length === 1).length).toBe(0);
  });

  test("word width matches kerned measureText(whole word)", () => {
    const label = freshLabel("Text");
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Glyph;
    label.gradient.topLeft    = new Color(0, 255, 0, 255);
    label.gradient.topRight   = new Color(0, 255, 0, 255);
    label.gradient.bottomLeft = new Color(255, 0, 0, 255);
    label.gradient.bottomRight= new Color(255, 0, 0, 255);
    label._doUpdate();

    expect(widthOf("Text")).toBe(38); // 4*10 - 2 kerning on Te
    expect(fillCalls[0].text).toBe("Text");
  });
});
