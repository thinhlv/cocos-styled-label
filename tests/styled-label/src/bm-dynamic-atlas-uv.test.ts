// BitmapFont UV remapping when font texture is relocated in a dynamic atlas.
//
// Contract: font image (Fw×Fh) placed at offset (Ox, Oy) inside texture (Tw×Th).
// Glyph at (gx, gy, gw, gh) within the font image must sample:
//   TL/BT u = (Ox+gx)/Tw,  v_top = (Oy+gy)/Th,  v_bot = (Oy+gy+gh)/Th
// Vertex order per quad: 0=BL, 1=BR, 2=TL, 3=TR.

import { BitmapFont, SpriteFrame, Texture2D, Rect } from "cc";
import { StyledLabel } from "../../../assets/styled-label/styled-label";
import { HAlign, VAlign } from "../../../assets/styled-label/styled-label.layout";

const GLYPH = { x: 10, y: 20, width: 80, height: 100 };
const FONT_W = 512;
const FONT_H = 256;
const ATLAS_W = 2048;
const ATLAS_H = 2048;
const PACK_OX = 100;
const PACK_OY = 200;

function expectedUV(ox: number, oy: number, tw: number, th: number) {
  const u0 = (ox + GLYPH.x) / tw;
  const u1 = (ox + GLYPH.x + GLYPH.width) / tw;
  const v0 = (oy + GLYPH.y) / th;
  const v1 = (oy + GLYPH.y + GLYPH.height) / th;
  return { u0, u1, v0, v1 };
}

function makeNode(width = 300, height = 80) {
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

function makeBMFont(tex: Texture2D, sfRect: Rect | null): BitmapFont {
  const font = new BitmapFont();
  (font as any).fntConfig = {
    commonHeight: 72,
    fontSize: 72,
    base: 59,
    fontDefDictionary: {
      48: {
        rect: { x: GLYPH.x, y: GLYPH.y, width: GLYPH.width, height: GLYPH.height },
        xOffset: 0,
        yOffset: 0,
        xAdvance: 80,
      },
    },
  };
  const sf = new SpriteFrame();
  sf.texture = tex;
  sf.rect = sfRect;
  (font as any).spriteFrame = sf;
  return font;
}

function freshBMLabel(font: BitmapFont): StyledLabel {
  (StyledLabel as any)._mCtx = null;
  (StyledLabel as any)._measureCache?.clear();
  (StyledLabel as any)._inflatedMap = null;

  const label = new StyledLabel();
  (label as any).node = makeNode();
  (label as any)._font = font;
  label.fontSize = 40;
  label.lineHeight = 0;
  label.wordWrap = false;
  label.align.horizontal = HAlign.CENTER;
  label.align.vertical = VAlign.CENTER;
  label.onLoad();
  label.onEnable();
  label.string = "0";
  (label as any)._contentDirty = true;
  label._doUpdate();
  return label;
}

function quadUV(label: StyledLabel): { bl: [number, number]; tl: [number, number]; br: [number, number]; tr: [number, number] } {
  const rd = (label as any)._renderData;
  const vb: Float32Array = rd.chunk.vb;
  const stride: number = rd.floatStride;
  const u = (v: number) => vb[v * stride + 3];
  const vv = (v: number) => vb[v * stride + 4];
  return {
    bl: [u(0), vv(0)],
    tl: [u(2), vv(2)],
    br: [u(1), vv(1)],
    tr: [u(3), vv(3)],
  };
}

function expectUV(label: StyledLabel, ox: number, oy: number, tw: number, th: number) {
  const exp = expectedUV(ox, oy, tw, th);
  const got = quadUV(label);
  expect(got.bl[0]).toBeCloseTo(exp.u0);
  expect(got.bl[1]).toBeCloseTo(exp.v1);
  expect(got.tl[0]).toBeCloseTo(exp.u0);
  expect(got.tl[1]).toBeCloseTo(exp.v0);
  expect(got.br[0]).toBeCloseTo(exp.u1);
  expect(got.br[1]).toBeCloseTo(exp.v1);
  expect(got.tr[0]).toBeCloseTo(exp.u1);
  expect(got.tr[1]).toBeCloseTo(exp.v0);
}

describe("BitmapFont dynamic atlas UV remapping", () => {
  test("Scenario A — unpacked font texture (Ox=0, Oy=0)", () => {
    const tex = new Texture2D();
    tex.width = FONT_W;
    tex.height = FONT_H;
    const font = makeBMFont(tex, new Rect(0, 0, FONT_W, FONT_H));
    const label = freshBMLabel(font);
    expectUV(label, 0, 0, FONT_W, FONT_H);
  });

  test("Scenario B — font packed into atlas at offset (100, 200)", () => {
    const tex = new Texture2D();
    tex.uuid = "atlas-tex-uuid";
    tex.width = ATLAS_W;
    tex.height = ATLAS_H;
    const font = makeBMFont(tex, new Rect(PACK_OX, PACK_OY, FONT_W, FONT_H));
    const label = freshBMLabel(font);
    expectUV(label, PACK_OX, PACK_OY, ATLAS_W, ATLAS_H);
  });

  test("Scenario C — UV refreshes when atlas relocates without content change", () => {
    const tex = new Texture2D();
    tex.width = FONT_W;
    tex.height = FONT_H;
    const font = makeBMFont(tex, new Rect(0, 0, FONT_W, FONT_H));
    const label = freshBMLabel(font);
    expectUV(label, 0, 0, FONT_W, FONT_H);

    const posBefore = (label as any)._renderData.data[0];

    const sf = (font as any).spriteFrame as SpriteFrame;
    const atlasTex = new Texture2D();
    atlasTex.uuid = "atlas-tex-uuid";
    atlasTex.width = ATLAS_W;
    atlasTex.height = ATLAS_H;
    sf.texture = atlasTex;
    sf.rect = new Rect(PACK_OX, PACK_OY, FONT_W, FONT_H);

    (label as any)._contentDirty = false;
    label._doUpdate();

    expectUV(label, PACK_OX, PACK_OY, ATLAS_W, ATLAS_H);
    expect((label as any)._renderData.data[0].x).toBeCloseTo(posBefore.x);
    expect((label as any)._renderData.data[0].y).toBeCloseTo(posBefore.y);
  });
});
