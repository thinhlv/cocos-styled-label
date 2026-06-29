// 'Te' + vertical gradient (TL=TR, BL=BR) — bilinear path, kerning via drawImage positions.

import { Color } from "cc";
import { StyledLabel } from "../../../assets/styled-label/styled-label";
import { GradientScope, HAlign, VAlign } from "../../../assets/styled-label/styled-label.layout";

interface DrawCall { x: number; y: number; }
interface StrokeCall { text: string; x: number; y: number; }

let drawImageCalls: DrawCall[] = [];
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

let textWasDrawn = false;
const spyCtx: any = {
  clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {},
  fillRect() {},
  font: "",
  fillStyle: "" as any,
  strokeStyle: "" as any,
  textBaseline: "",
  lineWidth: 1, lineJoin: "miter", miterLimit: 10,
  shadowColor: "rgba(0,0,0,0)", shadowBlur: 0,
  createLinearGradient() { return { addColorStop() {} }; },
  fillText() { textWasDrawn = true; },
  strokeText(text: string, x: number, y: number) { strokeCalls.push({ text, x, y }); },
  drawImage(_img: any, x: number, y: number) { drawImageCalls.push({ x, y }); },
  putImageData() {},
  getImageData(_x: number, _y: number, w: number, h: number) {
    const d = new Uint8ClampedArray(w * h * 4);
    if (textWasDrawn) {
      for (let i = 0; i < d.length; i += 4) { d[i + 3] = 255; }
      textWasDrawn = false;
    }
    return { data: d, width: w, height: h };
  },
  canvas: { width: 400, height: 80 },
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
  createElement: () => ({ width: 400, height: 80, getContext: () => spyCtx }),
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
  drawImageCalls = [];
  strokeCalls = [];
  textWasDrawn = false;

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

describe("'Te' glyph position under vertical gradient (bilinear path)", () => {
  test("gradient ON + Glyph scope: 'e' drawImage x uses kerned advance of 'T'", () => {
    const label = freshLabel("Te");
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Glyph;
    setGradientColors(label);
    label._doUpdate();

    expect(drawImageCalls.length).toBe(2);
    const pad = 1;
    const xT = drawImageCalls[0].x + pad;
    const xe = drawImageCalls[1].x + pad;
    expect(xe - xT).toBe(widthOf("Te") - widthOf("e"));
  });

  test("gradient ON + Glyph scope + outline: strokeText word origin matches first glyph drawImage", () => {
    const label = freshLabel("Te");
    label.outline.enabled = true;
    label.outline.thickness = 2;
    label.outline.color = new Color(0, 0, 0, 255);
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Glyph;
    setGradientColors(label);
    label._doUpdate();

    const teStroke = strokeCalls.find(c => c.text === "Te");
    expect(teStroke).toBeDefined();
    expect(drawImageCalls.length).toBe(2);
    const pad = 1;
    expect(drawImageCalls[0].x + pad).toBe(teStroke!.x);
  });

  test("gradient ON + Line scope: bilinear per char with line uvBounds", () => {
    const label = freshLabel("Te");
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Line;
    setGradientColors(label);
    label._doUpdate();

    expect(drawImageCalls.length).toBe(2);
  });

  test("gradient OFF: single fillText word (no bilinear)", () => {
    const label = freshLabel("Te");
    label._doUpdate();

    expect(drawImageCalls.length).toBe(0);
  });
});
