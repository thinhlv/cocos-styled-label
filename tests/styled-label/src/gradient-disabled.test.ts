// Regression: when gradient.enabled=false, BMFont color path must behave exactly like before.
// All 4 verts share the same color = (defaultColor/255) * (nodeColor/255).

import { BitmapFont, SpriteFrame, Texture2D, Color } from "cc";
import { StyledLabel } from "../../../assets/styled-label/styled-label";
import { HAlign, VAlign } from "../../../assets/styled-label/styled-label.layout";

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

function readVertColor(label: StyledLabel, vertIdx: number) {
  const rd = (label as any)._renderData;
  const vb: Float32Array = rd.chunk.vb;
  const stride: number = rd.floatStride;
  const o = vertIdx * stride + 5;
  return { r: vb[o], g: vb[o + 1], b: vb[o + 2], a: vb[o + 3] };
}

describe("BitmapFont gradient disabled — hot path unchanged", () => {
  test("all 4 verts share the same color = defaultColor (× white node)", () => {
    (StyledLabel as any)._mCtx = null;
    (StyledLabel as any)._measureCache?.clear();
    (StyledLabel as any)._inflatedMap = null;
    const label = new StyledLabel();
    (label as any).node = makeNode();
    (label as any)._font = makeBMFont();
    label.fontSize = 40;
    label.lineHeight = 0;
    label.wordWrap = false;
    label.align.horizontal = HAlign.CENTER;
    label.align.vertical = VAlign.CENTER;
    label.defaultColor = new Color(128, 64, 200, 255);
    label.onLoad();
    label.onEnable();
    label.string = "0";
    (label as any)._contentDirty = true;
    expect(label.gradient.enabled).toBe(false);
    label._doUpdate();

    const expected = { r: 128 / 255, g: 64 / 255, b: 200 / 255, a: 1 };
    for (let v = 0; v < 4; v++) {
      const c = readVertColor(label, v);
      expect(Math.abs(c.r - expected.r)).toBeLessThan(1e-6);
      expect(Math.abs(c.g - expected.g)).toBeLessThan(1e-6);
      expect(Math.abs(c.b - expected.b)).toBeLessThan(1e-6);
      expect(Math.abs(c.a - expected.a)).toBeLessThan(1e-6);
    }
  });
});
