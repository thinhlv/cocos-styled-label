// TTF font vAlign — fixed-ratio baseline contract.
//
// Contract: baseline Y = lineTop + fontSize * (1 - BASELINE_RATIO/2)
//                      = lineTop + fontSize * 0.87
// This is independent of the font's reported TextMetrics — the canvas's
// `textBaseline = 'alphabetic'` makes the font itself place glyphs relative
// to Y, so per-font fba/aba measurement is not needed and not used.
//
// The 5 scenarios exercise the full range of (fba, aba) values that previously
// caused baseline drift (commit 216421c heuristic). All five MUST produce the
// same baseline Y — that is exactly the property the fix delivers.

import { StyledLabel } from "../../../assets/styled-label/styled-label";
import {
  VAlign,
  OverflowMode,
  HAlign,
} from "../../../assets/styled-label/styled-label.layout";

// ── Configurable canvas mock ──────────────────────────────────────────────────

let capturedDrawY = 0;
let mockFbaRatio: number | undefined = 0.85;
let mockAbaRatio = 0.72;

const mockCtxTTF = {
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
    const m = mockCtxTTF.font.match(/(\d+(?:\.\d+)?)px/);
    const fs = m ? parseFloat(m[1]) : 16;
    const result: Record<string, number> = {
      width: fs * 5,
      actualBoundingBoxAscent: fs * mockAbaRatio,
    };
    if (mockFbaRatio !== undefined) {
      result["fontBoundingBoxAscent"] = fs * mockFbaRatio;
    }
    return result;
  },
};

(global as any).document = {
  createElement: (_tag: string) => ({ width: 1, height: 1, getContext: () => mockCtxTTF }),
};

// ── Constants ─────────────────────────────────────────────────────────────────

const FONT_SIZE = 40;
const LINE_HEIGHT = 40;
const NODE_W = 300;
const NODE_H = 200;

const BASELINE_RATIO = 0.26;
const FIXED_ASCENT = FONT_SIZE * (1 - BASELINE_RATIO / 2); // 0.87 * 40 = 34.8

// Single line + lineH=fontSize: alignH = fontSize, so
const LINE_TOP_BOTTOM = NODE_H - FONT_SIZE; // 160
const LINE_TOP_CENTER = (NODE_H - FONT_SIZE) / 2; // 80
const TOP_PAD = Math.ceil(FONT_SIZE * (BASELINE_RATIO / 2)); // 6

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeNode() {
  const tf = { width: NODE_W, height: NODE_H, anchorX: 0.5, anchorY: 0.5 };
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

function freshLabel(vAlign: VAlign): void {
  (StyledLabel as any)._mCtx = null;
  (StyledLabel as any)._measureCache?.clear();
  capturedDrawY = 0;

  const label = new StyledLabel();
  (label as any).node = makeNode();
  label.string = "Test";
  label.fontSize = FONT_SIZE;
  label.lineHeight = LINE_HEIGHT;
  label.overflow = OverflowMode.NONE;
  label.wordWrap = false;
  label.align.horizontal = HAlign.LEFT;
  label.align.vertical = vAlign;
  label.onLoad();
  label.onEnable();
  label._doUpdate();
}

beforeEach(() => {
  (StyledLabel as any)._mCtx = null;
  (StyledLabel as any)._measureCache?.clear();
  capturedDrawY = 0;
});

// ── Parametrised contract test ────────────────────────────────────────────────
//
// Five font-metric profiles that previously selected DIFFERENT ascents under
// the old heuristic. The new fixed-ratio model produces the SAME baseline Y
// for all of them — that's the invariant we need to prove.

const SCENARIOS: Array<{ name: string; fba: number | undefined; aba: number }> = [
  { name: "A — normal TTF (fba=0.90×, aba=0.72×)", fba: 0.9, aba: 0.72 },
  { name: "B — boundary (fba=1.00×, aba=0.80×)", fba: 1.0, aba: 0.8 },
  { name: "C — just-inflated (fba=1.01×, aba=0.80×)", fba: 1.01, aba: 0.8 },
  { name: "D — inflated (fba=1.07×, aba=0.73×)", fba: 1.07, aba: 0.73 },
  { name: "E — no fba (undefined, aba=0.73×)", fba: undefined, aba: 0.73 },
];

describe.each(SCENARIOS)("$name → fixed baseline = lineTop + 0.87 * fontSize", ({ fba, aba }) => {
  beforeEach(() => {
    mockFbaRatio = fba;
    mockAbaRatio = aba;
  });

  // Captured Y is the CANVAS Y. The canvas is grown by TOP_PAD upward so
  // diacritics/ascenders don't clip — the quad mapping shifts the canvas
  // origin above the node top by TOP_PAD, so canvas-Y for any vAlign =
  // node-relative lineTop + TOP_PAD + FIXED_ASCENT. World position is
  // unaffected by TOP_PAD because the quad height grows correspondingly.

  test("BOTTOM: baseline independent of font metrics", () => {
    freshLabel(VAlign.BOTTOM);
    expect(capturedDrawY).toBeCloseTo(LINE_TOP_BOTTOM + TOP_PAD + FIXED_ASCENT, 0);
  });

  test("CENTER: baseline independent of font metrics", () => {
    freshLabel(VAlign.CENTER);
    expect(capturedDrawY).toBeCloseTo(LINE_TOP_CENTER + TOP_PAD + FIXED_ASCENT, 0);
  });

  test("TOP: baseline = topPad + 0.87 * fontSize", () => {
    freshLabel(VAlign.TOP);
    expect(capturedDrawY).toBeCloseTo(TOP_PAD + FIXED_ASCENT, 0);
  });
});
