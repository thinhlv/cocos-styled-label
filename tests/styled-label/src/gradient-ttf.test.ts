// TTF vertical 2-color gradient (TL=TR, BL=BR) — bilinear temp-canvas path.
//
// Safari/WebKit clips createLinearGradient + fillText when top pair equals bottom
// pair colors; the engine routes this case through _paintBilinearGlyph instead.

import { Color } from "cc";
import { StyledLabel } from "../../../assets/styled-label/styled-label";
import { GradientScope, HAlign, VAlign } from "../../../assets/styled-label/styled-label.layout";

interface CapturedImg { data: Uint8ClampedArray; width: number; height: number }
const capturedPuts: CapturedImg[] = [];
let gradientsCreated = 0;
let textWasDrawn = false;

const ttfCtx: any = {
  clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {},
  drawImage() {}, fillRect() {},
  fillText() { textWasDrawn = true; },
  createLinearGradient() {
    gradientsCreated++;
    return { addColorStop: () => {} };
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
    return {
      width: 1,
      actualBoundingBoxAscent: 0.87,
      actualBoundingBoxDescent: 0.13,
      fontBoundingBoxAscent: 0.87,
      fontBoundingBoxDescent: 0.13,
    } as any;
  },
};

(global as any).document = {
  createElement: (_tag: string) => ({ width: 1, height: 1, getContext: () => ttfCtx }),
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
  capturedPuts.length = 0;
  gradientsCreated = 0;
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

describe("TTF vertical 2-color gradient — bilinear path (Safari-safe)", () => {
  test("Hello: one bilinear putImageData per character, no text linearGradient", () => {
    const label = freshLabel("Hello");
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Glyph;
    label.gradient.topLeft     = new Color(0, 255, 0, 255);
    label.gradient.topRight    = new Color(0, 255, 0, 255);
    label.gradient.bottomLeft  = new Color(255, 100, 50, 255);
    label.gradient.bottomRight = new Color(255, 100, 50, 255);
    label._doUpdate();

    expect(capturedPuts.length).toBe(5);
    expect(gradientsCreated).toBe(0);
  });

  test("uniform solid: solid word fill, no bilinear temp canvas", () => {
    const label = freshLabel("Hello");
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Glyph;
    label.gradient.topLeft     = new Color(255, 255, 255, 255);
    label.gradient.topRight    = new Color(255, 255, 255, 255);
    label.gradient.bottomLeft  = new Color(255, 255, 255, 255);
    label.gradient.bottomRight = new Color(255, 255, 255, 255);
    label._doUpdate();

    expect(capturedPuts.length).toBe(0);
    expect(gradientsCreated).toBe(0);
  });

  test("disabled gradient: no bilinear, no linearGradient", () => {
    const label = freshLabel("Hello");
    label._doUpdate();

    expect(capturedPuts.length).toBe(0);
    expect(gradientsCreated).toBe(0);
  });
});
