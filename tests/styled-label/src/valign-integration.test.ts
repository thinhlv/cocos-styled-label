// Integration tests for vAlign pixel position.
//
// Strategy: intercept ctx.fillText to capture the actual drawY, then measure:
//   topGap    = drawY - fontAscent    (canvas top → glyph top)
//   bottomGap = canvasH - drawY - fontDescent  (glyph bottom → canvas bottom)
//
// For CENTER these must be equal; for TOP topGap≈0; for BOTTOM bottomGap≈0.
// Tests are independent of any formula — they only check pixel geometry.
//
// Repro: fontSize=5, lineHeight=40, nodeH=60, VAlign.CENTER
//   Bug (wrong formula):  drawY≈14 → topGap=10,   bottomGap=45  (wildly off)
//   Fix (correct formula): drawY≈31.5 → topGap=27.5, bottomGap=27.5 (equal ✓)

// ── Canvas mock ───────────────────────────────────────────────────────────────

let capturedDrawY = 0;

const mockCtxV = {
    clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {},
    drawImage(..._args: any[]) {},
    fillRect() {},
    fillText(_t: string, _x: number, y: number) { capturedDrawY = y; },
    font: '', fillStyle: '', textBaseline: '',
    measureText(_t: string) {
        const m = mockCtxV.font.match(/(\d+(?:\.\d+)?)px/);
        const fs = m ? parseFloat(m[1]) : 16;
        return { width: 10, fontBoundingBoxAscent: fs * 0.8, actualBoundingBoxAscent: fs * 0.8 };
    },
};

(global as any).document = {
    createElement: (_tag: string) => ({ width: 1, height: 1, getContext: () => mockCtxV }),
};

import { StyledLabel } from '../../../assets/styled-label/styled-label';
import { VAlign, HAlign, OverflowMode } from '../../../assets/styled-label/styled-label.layout';

function makeNodeV(width: number, height: number) {
    const tf = { width, height, anchorX: 0.5, anchorY: 0.5 };
    return {
        on: () => {}, off: () => {}, emit: () => {},
        flagChangedVersion: 1,
        worldMatrix: { m00:1,m01:0,m02:0,m03:0,m04:0,m05:1,m06:0,m07:0,m12:0,m13:0,m14:0,m15:1 },
        _getUITransformComp() { return tf; },
    };
}

function freshLabelV(width = 150, height = 60): StyledLabel {
    (StyledLabel as any)._mCtx = null;
    (StyledLabel as any)._measureCache?.clear();
    const label = new StyledLabel();
    (label as any).node = makeNodeV(width, height);
    return label;
}

function setupReproLabel(vAlign: VAlign): void {
    const label = freshLabelV(150, 60);
    label.string = 'o';
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

describe('vAlign — pixel gap invariant (fontSize=5, lineH=40, nodeH=60)', () => {
    // fontAscent = 0.8 * fontSize, fontDescent = 0.2 * fontSize (from mock)
    const nodeH = 60;
    const fontSize = 5;
    const fontAscent = fontSize * 0.8;   // 4
    const fontDescent = fontSize * 0.2;  // 1

    test('CENTER: topGap ≈ bottomGap (text visually centered)', () => {
        setupReproLabel(VAlign.CENTER);
        const topGap = capturedDrawY - fontAscent;
        const bottomGap = nodeH - capturedDrawY - fontDescent;
        expect(Math.abs(topGap - bottomGap)).toBeLessThan(1);
    });

    test('TOP: topGap < 2 (text near canvas top, within textPad)', () => {
        setupReproLabel(VAlign.TOP);
        const topGap = capturedDrawY - fontAscent;
        expect(topGap).toBeLessThan(2);
    });

    test('BOTTOM: bottomGap ≈ 0 (text near canvas bottom)', () => {
        setupReproLabel(VAlign.BOTTOM);
        const bottomGap = nodeH - capturedDrawY - fontDescent;
        expect(Math.abs(bottomGap)).toBeLessThan(1);
    });
});
