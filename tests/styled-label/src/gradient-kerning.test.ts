// Per-glyph bilinear gradient must respect kerning (vertical 2-color uses bilinear on Safari).

import { Color } from "cc";
import { StyledLabel } from "../../../assets/styled-label/styled-label";
import { GradientScope, HAlign, VAlign } from "../../../assets/styled-label/styled-label.layout";

interface DrawCall { x: number; y: number; }
let drawImageCalls: DrawCall[] = [];

const NAIVE_GLYPH_W = 10;
function widthOf(text: string): number {
  let w = text.length * NAIVE_GLYPH_W;
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] === "T" && text[i + 1] === "e") w -= 2;
  }
  return w;
}

let textWasDrawn = false;
const spyCtx: any = {
  clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {},
  fillRect() {}, strokeText() {},
  font: "",
  fillStyle: "" as any,
  strokeStyle: "" as any,
  textBaseline: "",
  lineWidth: 1, lineJoin: "miter", miterLimit: 10,
  shadowColor: "rgba(0,0,0,0)", shadowBlur: 0,
  createLinearGradient() { return { addColorStop() {} }; },
  fillText() { textWasDrawn = true; },
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
      fontBoundingBoxDescent: 4,
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

describe("Bilinear vertical gradient — kerned glyph positions", () => {
  test("vertical 2-color: drawImage x positions follow kerning for each char", () => {
    const label = freshLabel("Text");
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Glyph;
    label.gradient.topLeft     = new Color(0, 255, 0, 255);
    label.gradient.topRight    = new Color(0, 255, 0, 255);
    label.gradient.bottomLeft  = new Color(255, 0, 0, 255);
    label.gradient.bottomRight = new Color(255, 0, 0, 255);
    label._doUpdate();

    expect(drawImageCalls.length).toBe(4);
    const pad = 1;
    const xT = drawImageCalls[0].x + pad;
    const xe = drawImageCalls[1].x + pad;
    const xx = drawImageCalls[2].x + pad;
    const xt = drawImageCalls[3].x + pad;

    expect(xe - xT).toBe(widthOf("Te") - widthOf("e"));
    expect(xx - xT).toBe(widthOf("Tex") - widthOf("x"));
    expect(xt - xT).toBe(widthOf("Text") - widthOf("t"));
  });
});
