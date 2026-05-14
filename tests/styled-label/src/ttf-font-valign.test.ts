// TTF font vAlign — comprehensive scenarios for _fontAscent() selection logic.
//
// Fix invariant (styled-label.ts _fontAscent):
//   fba ≤ fontSize  →  use fontBoundingBoxAscent  (normal / system font)
//   fba > fontSize  →  use actualBoundingBoxAscent (inflated TTF: OpenSans-Bold etc.)
//   fba undefined   →  use actualBoundingBoxAscent (platform fallback)
//
// Test strategy: capture the baseline Y from ctx.fillText, then verify:
//   baseline == lineTop + expectedAscent  (within 0.5 px)
// where lineTop is derived from the vAlign formula and expectedAscent is
// whatever value the fix should have selected for that font scenario.
//
// Scenarios covered:
//   A  Normal TTF      fba=0.90× ≤ size  → uses fba
//   B  Boundary        fba=1.00× = size  → uses fba (≤ is inclusive)
//   C  Just over       fba=1.01× > size  → uses aba
//   D  Inflated TTF    fba=1.07× > size  → uses aba  (OpenSans-Bold style)
//   E  No fba          fba=undefined     → uses aba  (platform without the metric)

// ── Configurable canvas mock ──────────────────────────────────────────────────

let capturedDrawY = 0;
// Per-test font metric ratios (relative to fontSize extracted from ctx.font).
let mockFbaRatio: number | undefined = 0.85;
let mockAbaRatio = 0.72;

const mockCtxTTF = {
    clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {},
    drawImage(..._args: any[]) {},
    fillRect() {},
    fillText(_t: string, _x: number, y: number) { capturedDrawY = y; },
    font: '', fillStyle: '', textBaseline: '',
    measureText(_t: string) {
        const m = mockCtxTTF.font.match(/(\d+(?:\.\d+)?)px/);
        const fs = m ? parseFloat(m[1]) : 16;
        const result: Record<string, number> = {
            width: fs * 5,
            actualBoundingBoxAscent: fs * mockAbaRatio,
        };
        if (mockFbaRatio !== undefined) {
            result['fontBoundingBoxAscent'] = fs * mockFbaRatio;
        }
        return result;
    },
};

(global as any).document = {
    createElement: (_tag: string) => ({ width: 1, height: 1, getContext: () => mockCtxTTF }),
};

import { StyledLabel } from '../../../assets/styled-label/styled-label';
import { VAlign, HAlign, OverflowMode } from '../../../assets/styled-label/styled-label.layout';

// ── Helpers ───────────────────────────────────────────────────────────────────

const FONT_SIZE   = 40;
const LINE_HEIGHT = 40;  // = fontSize; no leading — the typical production case
const NODE_W      = 300;
const NODE_H      = 200;

// For single line, fontSize=lineHeight:
//   lineTop(BOTTOM)  = NODE_H - FONT_SIZE = 160
//   lineTop(CENTER)  = (NODE_H - FONT_SIZE) / 2 = 80
const LINE_TOP_BOTTOM = NODE_H - FONT_SIZE;   // 160
const LINE_TOP_CENTER = (NODE_H - FONT_SIZE) / 2;  // 80

function makeNode() {
    const tf = { width: NODE_W, height: NODE_H, anchorX: 0.5, anchorY: 0.5 };
    return {
        on: () => {}, off: () => {}, emit: () => {},
        flagChangedVersion: 1,
        worldMatrix: { m00:1,m01:0,m02:0,m03:0,m04:0,m05:1,m06:0,m07:0,m12:0,m13:0,m14:0,m15:1 },
        _getUITransformComp() { return tf; },
    };
}

function freshLabel(vAlign: VAlign): void {
    (StyledLabel as any)._mCtx = null;
    (StyledLabel as any)._measureCache?.clear();
    (StyledLabel as any)._inflatedMap = null;
    capturedDrawY = 0;

    const label = new StyledLabel();
    (label as any).node = makeNode();
    label.string     = 'Test';
    label.fontSize   = FONT_SIZE;
    label.lineHeight = LINE_HEIGHT;
    label.overflow   = OverflowMode.NONE;
    label.wordWrap   = false;
    label.align.horizontal = HAlign.LEFT;
    label.align.vertical   = vAlign;
    label.onLoad();
    label.onEnable();
    label._doUpdate();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    (StyledLabel as any)._mCtx = null;
    (StyledLabel as any)._measureCache?.clear();
    (StyledLabel as any)._inflatedMap = null;
    capturedDrawY = 0;
});

// ── Scenario A: Normal TTF (fba=0.90× ≤ size) ────────────────────────────────
// A typical custom TTF with well-declared metrics. Fix should use fba.

describe('Scenario A — Normal TTF (fba=0.90×, aba=0.72×) → uses fba', () => {
    beforeEach(() => { mockFbaRatio = 0.90; mockAbaRatio = 0.72; });
    const expectedAscent = FONT_SIZE * 0.90;  // 36

    test('BOTTOM: baseline = lineTop + fba', () => {
        freshLabel(VAlign.BOTTOM);
        expect(capturedDrawY).toBeCloseTo(LINE_TOP_BOTTOM + expectedAscent, 0);
    });

    test('CENTER: baseline = lineTop + fba', () => {
        freshLabel(VAlign.CENTER);
        expect(capturedDrawY).toBeCloseTo(LINE_TOP_CENTER + expectedAscent, 0);
    });
});

// ── Scenario B: Boundary (fba=1.00× = size) ───────────────────────────────────
// fba exactly equals fontSize — the condition is ≤, so fba should still be used.

describe('Scenario B — Boundary TTF (fba=1.00×, aba=0.80×) → uses fba', () => {
    beforeEach(() => { mockFbaRatio = 1.00; mockAbaRatio = 0.80; });
    const expectedAscent = FONT_SIZE * 1.00;  // 40

    test('BOTTOM: baseline = lineTop + fba (boundary fba=fontSize)', () => {
        freshLabel(VAlign.BOTTOM);
        expect(capturedDrawY).toBeCloseTo(LINE_TOP_BOTTOM + expectedAscent, 0);
    });

    test('CENTER: baseline = lineTop + fba (boundary fba=fontSize)', () => {
        freshLabel(VAlign.CENTER);
        expect(capturedDrawY).toBeCloseTo(LINE_TOP_CENTER + expectedAscent, 0);
    });
});

// ── Scenario C: Just over boundary (fba=1.01× > size) ─────────────────────────
// Barely inflated — fix falls back to aba.

describe('Scenario C — Just-inflated TTF (fba=1.01×, aba=0.80×) → uses aba', () => {
    beforeEach(() => { mockFbaRatio = 1.01; mockAbaRatio = 0.80; });
    const expectedAscent = FONT_SIZE * 0.80;  // 32 (aba)

    test('BOTTOM: baseline = lineTop + aba (fba just above threshold)', () => {
        freshLabel(VAlign.BOTTOM);
        expect(capturedDrawY).toBeCloseTo(LINE_TOP_BOTTOM + expectedAscent, 0);
    });

    test('CENTER: baseline = lineTop + aba (fba just above threshold)', () => {
        freshLabel(VAlign.CENTER);
        expect(capturedDrawY).toBeCloseTo(LINE_TOP_CENTER + expectedAscent, 0);
    });
});

// ── Scenario D: Inflated TTF (fba=1.07× — OpenSans-Bold style) ────────────────
// fba > size: declared ascent exceeds the em-square. Fix must use aba.
// This is the original bug that commit 216421c fixed — verify it stays fixed.

describe('Scenario D — Inflated TTF (fba=1.07×, aba=0.73×) → uses aba', () => {
    beforeEach(() => { mockFbaRatio = 1.07; mockAbaRatio = 0.73; });
    const expectedAscent = FONT_SIZE * 0.73;  // 29.2 (aba)

    test('BOTTOM: baseline = lineTop + aba (inflated fba rejected)', () => {
        freshLabel(VAlign.BOTTOM);
        expect(capturedDrawY).toBeCloseTo(LINE_TOP_BOTTOM + expectedAscent, 0);
    });

    test('CENTER: baseline = lineTop + aba (inflated fba rejected)', () => {
        freshLabel(VAlign.CENTER);
        expect(capturedDrawY).toBeCloseTo(LINE_TOP_CENTER + expectedAscent, 0);
    });
});

// ── Scenario E: No fontBoundingBoxAscent (platform fallback) ──────────────────
// Some environments (older WebGL contexts) don't provide fontBoundingBoxAscent.
// Fix must fall back to actualBoundingBoxAscent.

describe('Scenario E — No fba (undefined, aba=0.73×) → uses aba', () => {
    beforeEach(() => { mockFbaRatio = undefined; mockAbaRatio = 0.73; });
    const expectedAscent = FONT_SIZE * 0.73;  // 29.2 (aba)

    test('BOTTOM: baseline = lineTop + aba (fba unavailable)', () => {
        freshLabel(VAlign.BOTTOM);
        expect(capturedDrawY).toBeCloseTo(LINE_TOP_BOTTOM + expectedAscent, 0);
    });

    test('CENTER: baseline = lineTop + aba (fba unavailable)', () => {
        freshLabel(VAlign.CENTER);
        expect(capturedDrawY).toBeCloseTo(LINE_TOP_CENTER + expectedAscent, 0);
    });
});
