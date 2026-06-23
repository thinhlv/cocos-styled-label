// BitmapFont 4-corner gradient — per-vertex color writes into chunk.vb.
//
// Vertex order per glyph quad: 0=BL, 1=BR, 2=TL, 3=TR.
// Color is written at vb[(base+v)*stride + 5..+8] as r,g,b,a in 0..1 range.
//
// Final per-vertex color = (glyphStyle/255) * (nodeColor/255) * (cornerColor/255).
// With defaultColor=white and nodeColor=white, vertex color reduces to (cornerColor/255).

import { BitmapFont, SpriteFrame, Texture2D, Color } from "cc";
import { StyledLabel } from "../../../assets/styled-label/styled-label";
import { GradientScope, HAlign, VAlign } from "../../../assets/styled-label/styled-label.layout";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeNode(width = 100, height = 60) {
  const tf = { width, height, anchorX: 0.5, anchorY: 0.5 };
  return {
    on: () => {},
    off: () => {},
    emit: () => {},
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

function freshLabel(): StyledLabel {
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
  label.string = "0";
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("BitmapFont gradient — per-vertex 4-corner color", () => {
  test("vertical gradient (TL=TR=top, BL=BR=bot): bottom 2 verts = bot color, top 2 verts = top color", () => {
    const label = freshLabel();
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Glyph;
    label.gradient.topLeft     = new Color(0, 255, 0, 255);    // green
    label.gradient.topRight    = new Color(0, 255, 0, 255);
    label.gradient.bottomLeft  = new Color(255, 100, 50, 255); // orange-ish
    label.gradient.bottomRight = new Color(255, 100, 50, 255);
    label._doUpdate();

    // v=0 BL, v=1 BR → bot
    const bl = vertColor(label, 0);
    const br = vertColor(label, 1);
    expect(approx(bl.r, 1.0)).toBe(true);
    expect(approx(bl.g, 100 / 255)).toBe(true);
    expect(approx(bl.b, 50 / 255)).toBe(true);
    expect(approx(bl.a, 1.0)).toBe(true);
    expect(br).toEqual(bl);

    // v=2 TL, v=3 TR → top
    const tl = vertColor(label, 2);
    const tr = vertColor(label, 3);
    expect(approx(tl.r, 0)).toBe(true);
    expect(approx(tl.g, 1.0)).toBe(true);
    expect(approx(tl.b, 0)).toBe(true);
    expect(approx(tl.a, 1.0)).toBe(true);
    expect(tr).toEqual(tl);
  });

  test("full 4-corner: each vertex gets its own corner color", () => {
    const label = freshLabel();
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Glyph;
    label.gradient.bottomLeft  = new Color(255, 0,   0,   255); // red
    label.gradient.bottomRight = new Color(0,   255, 0,   255); // green
    label.gradient.topLeft     = new Color(0,   0,   255, 255); // blue
    label.gradient.topRight    = new Color(255, 255, 0,   255); // yellow
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

  test("corner color multiplies node color", () => {
    const label = freshLabel();
    (label as any).color = { r: 128, g: 128, b: 128, a: 255 };
    label.gradient.enabled = true;
    label.gradient.topLeft     = new Color(255, 255, 255, 255);
    label.gradient.topRight    = new Color(255, 255, 255, 255);
    label.gradient.bottomLeft  = new Color(255, 0, 0, 255); // red
    label.gradient.bottomRight = new Color(255, 0, 0, 255);
    label._doUpdate();

    const bl = vertColor(label, 0);
    // expect: (255/255 red) * (128/255 node) * (255/255 defaultColor)
    expect(approx(bl.r, 128 / 255)).toBe(true);
    expect(approx(bl.g, 0)).toBe(true);
    expect(approx(bl.b, 0)).toBe(true);
  });
});
