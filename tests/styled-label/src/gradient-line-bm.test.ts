// BitmapFont 4-corner gradient — scope=Line.
//
// Contract for Line mode: the 4 corner colors map to the LINE bounding box
// (not each glyph's box). All glyphs in a line share one coherent bilinear
// gradient, so adjacent glyphs that touch at the same x must have matching
// vertex colors at the seam. Each new line repeats the gradient independently.
//
// Vertex order per glyph quad: 0=BL, 1=BR, 2=TL, 3=TR.
// Color is written at vb[(base+v)*stride + 5..+8] as r,g,b,a in 0..1 range.
// Final per-vertex color = (glyphStyle/255) * (nodeColor/255) * (cornerColor/255).

import { BitmapFont, SpriteFrame, Texture2D, Color } from "cc";
import { StyledLabel } from "../../../assets/styled-label/styled-label";
import { GradientScope, HAlign, VAlign } from "../../../assets/styled-label/styled-label.layout";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeNode(width = 200, height = 80) {
  const tf = { width, height, anchorX: 0.5, anchorY: 0.5 };
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
    commonHeight: 72,
    fontSize: 72,
    base: 59,
    fontDefDictionary: {
      48: { rect: { x: 0, y: 0, width: 80, height: 100 }, xOffset: 0, yOffset: 0, xAdvance: 80 },
    },
  };
  const sf = new SpriteFrame();
  sf.texture = new Texture2D();
  (font as any).spriteFrame = sf;
  return font;
}

function freshLabel(str: string): StyledLabel {
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
  label.onLoad();
  label.onEnable();
  label.string = str;
  (label as any)._contentDirty = true;
  return label;
}

function vertColor(label: StyledLabel, vertIdx: number): { r: number; g: number; b: number; a: number } {
  const rd = (label as any)._renderData;
  const vb: Float32Array = rd.chunk.vb;
  const stride: number = rd.floatStride;
  const o = vertIdx * stride + 5;
  return { r: vb[o], g: vb[o + 1], b: vb[o + 2], a: vb[o + 3] };
}

function approx(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) < eps;
}

function colorEq(c: { r: number; g: number; b: number; a: number }, other: { r: number; g: number; b: number; a: number }, eps = 1e-6): boolean {
  return approx(c.r, other.r, eps) && approx(c.g, other.g, eps) && approx(c.b, other.b, eps) && approx(c.a, other.a, eps);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("BitmapFont gradient — scope=Line (per-line 4-corner)", () => {
  test("single-glyph line: TL/TR/BL/BR colors land on TL/TR/BL/BR vertices (parity with Glyph mode)", () => {
    const label = freshLabel("0");
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Line;
    label.gradient.bottomLeft  = new Color(255, 0,   0,   255);
    label.gradient.bottomRight = new Color(0,   255, 0,   255);
    label.gradient.topLeft     = new Color(0,   0,   255, 255);
    label.gradient.topRight    = new Color(255, 255, 0,   255);
    label._doUpdate();

    const bl = vertColor(label, 0);
    expect(approx(bl.r, 1.0) && approx(bl.g, 0) && approx(bl.b, 0)).toBe(true);

    const br = vertColor(label, 1);
    expect(approx(br.r, 0) && approx(br.g, 1.0) && approx(br.b, 0)).toBe(true);

    const tl = vertColor(label, 2);
    expect(approx(tl.r, 0) && approx(tl.g, 0) && approx(tl.b, 1.0)).toBe(true);

    const tr = vertColor(label, 3);
    expect(approx(tr.r, 1.0) && approx(tr.g, 1.0) && approx(tr.b, 0)).toBe(true);
  });

  test("vertical line gradient (TL=TR, BL=BR), 2 glyphs same line: every top vert = top color, every bottom vert = bot color", () => {
    const label = freshLabel("00");
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Line;
    label.gradient.topLeft     = new Color(0, 255, 0, 255);
    label.gradient.topRight    = new Color(0, 255, 0, 255);
    label.gradient.bottomLeft  = new Color(255, 100, 50, 255);
    label.gradient.bottomRight = new Color(255, 100, 50, 255);
    label._doUpdate();

    for (let q = 0; q < 2; q++) {
      const base = q * 4;
      const bl = vertColor(label, base + 0);
      const br = vertColor(label, base + 1);
      const tl = vertColor(label, base + 2);
      const tr = vertColor(label, base + 3);

      expect(approx(bl.r, 1.0)).toBe(true);
      expect(approx(bl.g, 100 / 255)).toBe(true);
      expect(approx(bl.b, 50 / 255)).toBe(true);
      expect(colorEq(br, bl)).toBe(true);

      expect(approx(tl.r, 0)).toBe(true);
      expect(approx(tl.g, 1.0)).toBe(true);
      expect(approx(tl.b, 0)).toBe(true);
      expect(colorEq(tr, tl)).toBe(true);
    }
  });

  test("full 4-corner, 2 glyphs same line: leftmost=BL/TL, rightmost=BR/TR, seam verts match across glyphs", () => {
    const label = freshLabel("00");
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Line;
    label.gradient.bottomLeft  = new Color(255, 0,   0,   255);
    label.gradient.bottomRight = new Color(0,   255, 0,   255);
    label.gradient.topLeft     = new Color(0,   0,   255, 255);
    label.gradient.topRight    = new Color(255, 255, 0,   255);
    label._doUpdate();

    const g0_BL = vertColor(label, 0);
    const g0_BR = vertColor(label, 1);
    const g0_TL = vertColor(label, 2);
    const g0_TR = vertColor(label, 3);
    const g1_BL = vertColor(label, 4);
    const g1_BR = vertColor(label, 5);
    const g1_TL = vertColor(label, 6);
    const g1_TR = vertColor(label, 7);

    expect(approx(g0_BL.r, 1.0) && approx(g0_BL.g, 0) && approx(g0_BL.b, 0)).toBe(true);
    expect(approx(g0_TL.r, 0) && approx(g0_TL.g, 0) && approx(g0_TL.b, 1.0)).toBe(true);
    expect(approx(g1_BR.r, 0) && approx(g1_BR.g, 1.0) && approx(g1_BR.b, 0)).toBe(true);
    expect(approx(g1_TR.r, 1.0) && approx(g1_TR.g, 1.0) && approx(g1_TR.b, 0)).toBe(true);

    const quads = (label as any)._bmQuads;
    if (quads[0].xr === quads[1].xl) {
      expect(colorEq(g0_BR, g1_BL)).toBe(true);
      expect(colorEq(g0_TR, g1_TL)).toBe(true);
    }

    expect(g0_BL.r > g0_BR.r).toBe(true);
    expect(g1_BR.g > g1_BL.g).toBe(true);
  });

  test("multi-line ('00<br/>00'): each line repeats the full gradient independently", () => {
    const label = freshLabel("00<br/>00");
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Line;
    label.gradient.bottomLeft  = new Color(255, 0,   0,   255);
    label.gradient.bottomRight = new Color(0,   255, 0,   255);
    label.gradient.topLeft     = new Color(0,   0,   255, 255);
    label.gradient.topRight    = new Color(255, 255, 0,   255);
    label._doUpdate();

    const lines = (label as any)._bmLines;
    expect(Array.isArray(lines)).toBe(true);
    expect(lines.length).toBe(2);

    const quads = (label as any)._bmQuads;
    expect(quads.length).toBe(4);

    const line0 = quads.filter((q: any) => q.lineIndex === 0);
    const line1 = quads.filter((q: any) => q.lineIndex === 1);
    expect(line0.length).toBe(2);
    expect(line1.length).toBe(2);

    for (const lineSlice of [line0, line1]) {
      const leftQuadIdx = quads.indexOf(lineSlice[0]);
      const rightQuadIdx = quads.indexOf(lineSlice[1]);
      const leftBL = vertColor(label, leftQuadIdx * 4 + 0);
      const leftTL = vertColor(label, leftQuadIdx * 4 + 2);
      const rightBR = vertColor(label, rightQuadIdx * 4 + 1);
      const rightTR = vertColor(label, rightQuadIdx * 4 + 3);

      expect(approx(leftBL.r, 1.0) && approx(leftBL.g, 0) && approx(leftBL.b, 0)).toBe(true);
      expect(approx(leftTL.r, 0) && approx(leftTL.g, 0) && approx(leftTL.b, 1.0)).toBe(true);
      expect(approx(rightBR.r, 0) && approx(rightBR.g, 1.0) && approx(rightBR.b, 0)).toBe(true);
      expect(approx(rightTR.r, 1.0) && approx(rightTR.g, 1.0) && approx(rightTR.b, 0)).toBe(true);
    }
  });

  test("node color multiplies the per-line gradient", () => {
    const label = freshLabel("0");
    (label as any).color = { r: 128, g: 128, b: 128, a: 255 };
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Line;
    label.gradient.topLeft     = new Color(255, 255, 255, 255);
    label.gradient.topRight    = new Color(255, 255, 255, 255);
    label.gradient.bottomLeft  = new Color(255, 0, 0, 255);
    label.gradient.bottomRight = new Color(255, 0, 0, 255);
    label._doUpdate();

    const bl = vertColor(label, 0);
    expect(approx(bl.r, 128 / 255)).toBe(true);
    expect(approx(bl.g, 0)).toBe(true);
    expect(approx(bl.b, 0)).toBe(true);
  });
});
