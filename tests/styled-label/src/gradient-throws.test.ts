// GradientScope.Line is now supported on both BM and TTF paths; these tests
// verify it no longer throws (regression guard against the phase-1 stub).
// Non-vertical 4-corner (TL≠TR or BL≠BR) on TTF: bilinear path, does not throw.

import { BitmapFont, SpriteFrame, Texture2D, Color } from "cc";
import { StyledLabel } from "../../../assets/styled-label/styled-label";
import { GradientScope, HAlign, VAlign } from "../../../assets/styled-label/styled-label.layout";

// Lightweight canvas mock for the TTF path. Supports getImageData/putImageData
// for the bilinear (non-vertical) 4-corner code path.
const ttfCtx = {
  clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {},
  drawImage() {}, fillRect() {}, fillText() {},
  createLinearGradient() { return { addColorStop: () => {} }; },
  getImageData(_x: number, _y: number, w: number, h: number) {
    return { data: new Uint8ClampedArray(Math.max(1, w * h) * 4), width: w, height: h };
  },
  putImageData(_img: any, _x: number, _y: number) {},
  font: "", fillStyle: "" as any, textBaseline: "",
  canvas: { width: 1, height: 1 },
  measureText(_t: string) {
    return { width: 10, actualBoundingBoxAscent: 12, actualBoundingBoxDescent: 3 } as any;
  },
};
(global as any).document = {
  createElement: (_tag: string) => ({ width: 1, height: 1, getContext: () => ttfCtx }),
};

function makeNode() {
  const tf = { width: 100, height: 60, anchorX: 0.5, anchorY: 0.5 };
  return {
    on: () => {}, off: () => {}, emit: () => {},
    flagChangedVersion: 1,
    worldMatrix: { m00: 1, m01: 0, m02: 0, m03: 0, m04: 0, m05: 1, m06: 0, m07: 0, m12: 0, m13: 0, m14: 0, m15: 1 },
    _getUITransformComp() { return tf; },
  };
}

function makeBMFont(): BitmapFont {
  const font = new BitmapFont();
  (font as any).fntConfig = {
    commonHeight: 72, fontSize: 72, base: 59,
    fontDefDictionary: {
      48: { rect: { x: 0, y: 0, width: 80, height: 100 }, xOffset: 0, yOffset: 0, xAdvance: 80 },
    },
  };
  const sf = new SpriteFrame();
  sf.texture = new Texture2D();
  (font as any).spriteFrame = sf;
  return font;
}

function freshBMLabel(): StyledLabel {
  (StyledLabel as any)._mCtx = null;
  const label = new StyledLabel();
  (label as any).node = makeNode();
  (label as any)._font = makeBMFont();
  label.fontSize = 40;
  label.lineHeight = 0;
  label.wordWrap = false;
  label.align.horizontal = HAlign.CENTER;
  label.align.vertical = VAlign.CENTER;
  label.onLoad();
  label.onEnable();
  label.string = "0";
  (label as any)._contentDirty = true;
  return label;
}

function freshTTFLabel(): StyledLabel {
  (StyledLabel as any)._mCtx = null;
  const label = new StyledLabel();
  (label as any).node = makeNode();
  label.string = "0";
  label.fontSize = 40;
  label.lineHeight = 40;
  label.wordWrap = false;
  label.align.horizontal = HAlign.LEFT;
  label.align.vertical = VAlign.TOP;
  label.onLoad();
  label.onEnable();
  return label;
}

describe("Gradient throws — supported configs do not throw", () => {
  test("BM path: scope=Line does NOT throw", () => {
    const label = freshBMLabel();
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Line;
    expect(() => label._doUpdate()).not.toThrow();
  });

  test("TTF path: scope=Line does NOT throw", () => {
    const label = freshTTFLabel();
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Line;
    expect(() => label._doUpdate()).not.toThrow();
  });

  test("TTF path: non-vertical 4-corner (TL≠TR) does NOT throw (bilinear path)", () => {
    const label = freshTTFLabel();
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Glyph;
    label.gradient.topLeft     = new Color(255, 0, 0, 255);
    label.gradient.topRight    = new Color(0, 255, 0, 255); // different
    label.gradient.bottomLeft  = new Color(0, 0, 255, 255);
    label.gradient.bottomRight = new Color(0, 0, 255, 255);
    expect(() => label._doUpdate()).not.toThrow();
  });

  test("TTF path: non-vertical 4-corner (BL≠BR) does NOT throw (bilinear path)", () => {
    const label = freshTTFLabel();
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Glyph;
    label.gradient.topLeft     = new Color(255, 0, 0, 255);
    label.gradient.topRight    = new Color(255, 0, 0, 255);
    label.gradient.bottomLeft  = new Color(0, 0, 255, 255);
    label.gradient.bottomRight = new Color(0, 255, 0, 255); // different
    expect(() => label._doUpdate()).not.toThrow();
  });

  test("TTF path: vertical (TL=TR, BL=BR) does NOT throw", () => {
    const label = freshTTFLabel();
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Glyph;
    label.gradient.topLeft     = new Color(0, 255, 0, 255);
    label.gradient.topRight    = new Color(0, 255, 0, 255);
    label.gradient.bottomLeft  = new Color(255, 100, 50, 255);
    label.gradient.bottomRight = new Color(255, 100, 50, 255);
    expect(() => label._doUpdate()).not.toThrow();
  });
});
