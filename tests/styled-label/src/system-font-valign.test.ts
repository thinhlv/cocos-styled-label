// System font vAlign — same fixed-ratio contract as TTF.
//
// Cocos Label uses a constant: baseline = lineTop + fontSize * (1 - BASELINE_RATIO/2)
// independent of font metrics. This test verifies the system-font path produces
// the same baseline regardless of what fba/aba the canvas reports.

import { StyledLabel } from "../../../assets/styled-label/styled-label";
import {
  VAlign,
  OverflowMode,
  HAlign,
} from "../../../assets/styled-label/styled-label.layout";

// ── Canvas mock — Arial-like system font ─────────────────────────────────────

let capturedDrawY = 0;

const SYS_FBA_RATIO = 0.85; // fontBoundingBoxAscent / fontSize  (≤ 1 → system font)
const SYS_FBD_RATIO = 0.15; // fontBoundingBoxDescent / fontSize
const SYS_ABA_RATIO = 0.72; // actualBoundingBoxAscent  (smaller than fba)
const SYS_ABD_RATIO = 0.15; // actualBoundingBoxDescent

const mockCtxSys = {
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
    const m = mockCtxSys.font.match(/(\d+(?:\.\d+)?)px/);
    const fs = m ? parseFloat(m[1]) : 16;
    return {
      width: fs * 5,
      fontBoundingBoxAscent: fs * SYS_FBA_RATIO,
      fontBoundingBoxDescent: fs * SYS_FBD_RATIO,
      actualBoundingBoxAscent: fs * SYS_ABA_RATIO,
      actualBoundingBoxDescent: fs * SYS_ABD_RATIO,
    };
  },
};

(global as any).document = {
  createElement: (_tag: string) => ({ width: 1, height: 1, getContext: () => mockCtxSys }),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const FONT_SIZE = 40;
const LINE_HEIGHT = 40; // = fontSize, no leading — the common production case
const NODE_H = 200;
const NODE_W = 300;

function makeNode(width: number, height: number) {
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

function freshLabel(vAlign: VAlign): StyledLabel {
  (StyledLabel as any)._mCtx = null;
  (StyledLabel as any)._measureCache?.clear();
  const label = new StyledLabel();
  (label as any).node = makeNode(NODE_W, NODE_H);
  label.string = "1,200,000";
  label.fontSize = FONT_SIZE;
  label.lineHeight = LINE_HEIGHT;
  label.overflow = OverflowMode.NONE;
  label.wordWrap = false;
  label.align.horizontal = HAlign.LEFT;
  label.align.vertical = vAlign;
  label.onLoad();
  label.onEnable();
  capturedDrawY = 0;
  label._doUpdate();
  return label;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// Fixed-ratio baseline. The captured Y is the CANVAS Y, which is offset above
// the node top by TOP_PAD so ascenders/diacritics never clip.
const BASELINE_RATIO = 0.26;
const FIXED_ASCENT = FONT_SIZE * (1 - BASELINE_RATIO / 2); // 0.87 * 40 = 34.8
const TOP_PAD = Math.ceil(FONT_SIZE * (BASELINE_RATIO / 2)); // 6

describe("system font vAlign — fixed-ratio baseline (independent of font metrics)", () => {
  test("BOTTOM: baseline = (nodeH - fontSize) + TOP_PAD + 0.87 * fontSize", () => {
    freshLabel(VAlign.BOTTOM);
    const expectedBaseline = (NODE_H - FONT_SIZE) + TOP_PAD + FIXED_ASCENT;
    expect(capturedDrawY).toBeCloseTo(expectedBaseline, 0);
  });

  test("CENTER: baseline = (nodeH - fontSize)/2 + TOP_PAD + 0.87 * fontSize", () => {
    freshLabel(VAlign.CENTER);
    const expectedBaseline = (NODE_H - FONT_SIZE) / 2 + TOP_PAD + FIXED_ASCENT;
    expect(capturedDrawY).toBeCloseTo(expectedBaseline, 0);
  });

  test("TOP: baseline = TOP_PAD + 0.87 * fontSize", () => {
    freshLabel(VAlign.TOP);
    expect(capturedDrawY).toBeCloseTo(TOP_PAD + FIXED_ASCENT, 0);
  });
});
