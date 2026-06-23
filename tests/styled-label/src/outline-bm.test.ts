// BitmapFont outline is intentionally a no-op.
//
// Reason: stamping outline as additional GPU quads can blow past the
// StaticVBAccessor chunk size for long BM labels (single comp must fit one
// chunk). Outline still works for TTF/system fonts.
//
// Contract: setting outline.enabled = true on a BitmapFont must NOT add any
// extra quads and must NOT throw; rendering proceeds as if outline were off.

import { BitmapFont, SpriteFrame, Texture2D, Color } from "cc";
import { StyledLabel } from "../../../assets/styled-label/styled-label";
import { HAlign, VAlign } from "../../../assets/styled-label/styled-label.layout";

function makeNode(width = 100, height = 60) {
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

function freshLabel(text = "0"): StyledLabel {
  (StyledLabel as any)._mCtx = null;
  (StyledLabel as any)._measureCache?.clear();
  (StyledLabel as any)._inflatedMap = null;
  (StyledLabel as any)._bmOutlineWarned = false;

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
  label.string = text;
  (label as any)._contentDirty = true;
  return label;
}

function quadCount(label: StyledLabel): number {
  const rd = (label as any)._renderData;
  return rd.vertexCount / 4;
}

describe("BitmapFont outline — no-op (not supported)", () => {
  test("baseline: 1 glyph → 1 quad", () => {
    const label = freshLabel("0");
    label._doUpdate();
    expect(quadCount(label)).toBe(1);
  });

  test("outline.enabled on BitmapFont does not add extra quads", () => {
    const label = freshLabel("0");
    label.outline.enabled = true;
    label.outline.thickness = 4;
    label.outline.soft = true;
    label.outline.color = new Color(255, 0, 0, 255);
    label._doUpdate();

    // Same quad count as disabled — outline silently skipped on BM.
    expect(quadCount(label)).toBe(1);
  });

  test("outline + offset on BitmapFont does not throw or shift main quad", () => {
    const baseline = freshLabel("0");
    baseline._doUpdate();
    const baseXL = (baseline as any)._renderData.data[0].x;
    const baseYB = (baseline as any)._renderData.data[0].y;

    const label = freshLabel("0");
    label.outline.enabled = true;
    label.outline.thickness = 2;
    label.outline.offsetX = 10;
    label.outline.offsetY = 8;
    label.outline.color = new Color(255, 0, 0, 255);
    label._doUpdate();

    expect(quadCount(label)).toBe(1);
    expect((label as any)._renderData.data[0].x).toBe(baseXL);
    expect((label as any)._renderData.data[0].y).toBe(baseYB);
  });

  test("emits warning once when outline.enabled set on BitmapFont", () => {
    const spy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const a = freshLabel("0");
      a.outline.enabled = true;
      a._doUpdate();
      const b = freshLabel("0");
      b.outline.enabled = true;
      b._doUpdate();
      // Warned at least once; flag prevents repeat within a process unless reset by freshLabel.
      expect(spy).toHaveBeenCalled();
      const msg = String(spy.mock.calls[0][0]);
      expect(msg).toMatch(/outline.*BitmapFont/i);
    } finally {
      spy.mockRestore();
    }
  });
});
