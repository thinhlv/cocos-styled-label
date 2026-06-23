// Integration tests for vAlign pixel position.
//
// Strategy: intercept ctx.fillText to capture the actual drawY, then measure:
//   topGap    = drawY - actualBoundingBoxAscent    (canvas top → actual glyph top)
//   bottomGap = canvasH - drawY - actualDescent    (actual glyph bottom → canvas bottom)
//
// For CENTER these must be equal; for TOP topGap≈0; for BOTTOM bottomGap≈0.
// Tests are independent of any formula — they only check pixel geometry.
//
// Mock simulates a TTF font with fontBoundingBoxAscent >> actualBoundingBoxAscent
// (like OpenSans-Bold), which exposed the bug where the wrong ascent value was used.
//
// Bug: _fontAscent() returned fontBoundingBoxAscent (1.07x) instead of
//      actualBoundingBoxAscent (0.73x), shifting all text ~0.34×fontSize downward.

import { StyledLabel } from "../../../assets/styled-label/styled-label";
import {
  VAlign,
  OverflowMode,
  HAlign,
} from "../../../assets/styled-label/styled-label.layout";

// ── Canvas mock ───────────────────────────────────────────────────────────────

let capturedDrawY = 0;

const mockCtxV = {
  clearRect() {},
  save() {},
  restore() {},
  translate() {},
  rotate() {},
  drawImage(..._args: any[]) {},
  fillRect() {},
  fillText(_t: string, _x: number, y: number) {
    capturedDrawY = y;
  },
  font: "",
  fillStyle: "",
  textBaseline: "",
  measureText(_t: string) {
    const m = mockCtxV.font.match(/(\d+(?:\.\d+)?)px/);
    const fs = m ? parseFloat(m[1]) : 16;
    // Simulate a TTF font: declared ascent (fontBoundingBoxAscent) is larger than
    // actual rendered height (actualBoundingBoxAscent). This mirrors real fonts like
    // OpenSans-Bold where fontBoundingBoxAscent ≈ 1.07× and actual ≈ 0.73× fontSize.
    return {
      width: 10,
      fontBoundingBoxAscent: fs * 1.07,
      actualBoundingBoxAscent: fs * 0.73,
    };
  },
};

(global as any).document = {
  createElement: (_tag: string) => ({ width: 1, height: 1, getContext: () => mockCtxV }),
};

function makeNodeV(width: number, height: number) {
  const tf = { width, height, anchorX: 0.5, anchorY: 0.5 };
  return {
    on: () => {},
    off: () => {},
    emit: () => {},
    flagChangedVersion: 1,
    worldMatrix: { m00: 1, m01: 0, m02: 0, m03: 0, m04: 0, m05: 1, m06: 0, m07: 0, m12: 0, m13: 0, m14: 0, m15: 1 },
    _getUITransformComp() {
      return tf;
    },
  };
}

function freshLabelV(width = 150, height = 60): StyledLabel {
  (StyledLabel as any)._mCtx = null;
  (StyledLabel as any)._measureCache?.clear();
  (StyledLabel as any)._inflatedMap = null;
  const label = new StyledLabel();
  (label as any).node = makeNodeV(width, height);
  return label;
}

function setupReproLabel(vAlign: VAlign): void {
  const label = freshLabelV(150, 60);
  label.string = "o";
  label.fontSize = 5;
  label.lineHeight = 40;
  label.overflow = OverflowMode.SHRINK;
  label.wordWrap = false;
  label.align.horizontal = HAlign.CENTER;
  label.align.vertical = vAlign;
  label.onLoad();
  label.onEnable();
  capturedDrawY = 0;
  label._doUpdate();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("vAlign — pixel gap invariant (fontSize=5, lineH=40, nodeH=60)", () => {
  // Actual rendered character bounds from mock (independent of which ascent the impl uses).
  const nodeH = 60;
  const fontSize = 5;
  const actualAscent = fontSize * 0.73; // actual rendered height above baseline
  const actualDescent = fontSize * 0.2; // estimated descent below baseline

  test("CENTER: topGap ≈ bottomGap (text visually centered)", () => {
    setupReproLabel(VAlign.CENTER);
    const topGap = capturedDrawY - actualAscent;
    const bottomGap = nodeH - capturedDrawY - actualDescent;
    expect(Math.abs(topGap - bottomGap)).toBeLessThan(1);
  });

  test("TOP: topGap < 2 (text near canvas top, within textPad)", () => {
    setupReproLabel(VAlign.TOP);
    const topGap = capturedDrawY - actualAscent;
    expect(topGap).toBeLessThan(2);
  });

  test("BOTTOM: bottomGap ≈ 0 (text near canvas bottom)", () => {
    setupReproLabel(VAlign.BOTTOM);
    const bottomGap = nodeH - capturedDrawY - actualDescent;
    expect(Math.abs(bottomGap)).toBeLessThan(1);
  });
});
