// Independent test: system font VAlign CENTER / BOTTOM alignment.
//
// Problem: after the TTF-ascent fix (commit 216421c), _fontAscent() now prefers
// actualBoundingBoxAscent over fontBoundingBoxAscent. For TTF fonts with inflated
// declared ascent (fba > fontSize) this is correct. But for system fonts (Arial-like)
// fontBoundingBoxAscent ≈ 0.85× is the proper line-box ascent, while
// actualBoundingBoxAscent ≈ 0.72× is only the pixel height of the sample string.
// Using 0.72× shifts the baseline up ~0.13×fontSize ≈ 1/8 char height, so
// CENTER/BOTTOM text appears slightly above the expected position.
//
// Standard Cocos label behaviour:
//   baseline = lineTop + fontBoundingBoxAscent
//
// This test verifies that our label matches that behaviour for system fonts.

// ── Canvas mock — Arial-like system font ─────────────────────────────────────

let capturedDrawY = 0;

const SYS_FBA_RATIO  = 0.85;   // fontBoundingBoxAscent / fontSize  (≤ 1 → system font)
const SYS_FBD_RATIO  = 0.15;   // fontBoundingBoxDescent / fontSize
const SYS_ABA_RATIO  = 0.72;   // actualBoundingBoxAscent  (smaller than fba)
const SYS_ABD_RATIO  = 0.15;   // actualBoundingBoxDescent

const mockCtxSys = {
    clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {},
    drawImage(..._args: any[]) {},
    fillRect() {},
    fillText(_t: string, _x: number, y: number) { capturedDrawY = y; },
    font: '', fillStyle: '', textBaseline: '',
    measureText(_t: string) {
        const m = mockCtxSys.font.match(/(\d+(?:\.\d+)?)px/);
        const fs = m ? parseFloat(m[1]) : 16;
        return {
            width: fs * 5,
            fontBoundingBoxAscent:  fs * SYS_FBA_RATIO,
            fontBoundingBoxDescent: fs * SYS_FBD_RATIO,
            actualBoundingBoxAscent:  fs * SYS_ABA_RATIO,
            actualBoundingBoxDescent: fs * SYS_ABD_RATIO,
        };
    },
};

(global as any).document = {
    createElement: (_tag: string) => ({ width: 1, height: 1, getContext: () => mockCtxSys }),
};

import { StyledLabel } from '../../../assets/styled-label/styled-label';
import { VAlign, HAlign, OverflowMode } from '../../../assets/styled-label/styled-label.layout';

// ── Helpers ───────────────────────────────────────────────────────────────────

const FONT_SIZE   = 40;
const LINE_HEIGHT = 40;   // = fontSize, no leading — the common production case
const NODE_H      = 200;
const NODE_W      = 300;

function makeNode(width: number, height: number) {
    const tf = { width, height, anchorX: 0.5, anchorY: 0.5 };
    return {
        on: () => {}, off: () => {}, emit: () => {},
        flagChangedVersion: 1,
        worldMatrix: { m00:1,m01:0,m02:0,m03:0,m04:0,m05:1,m06:0,m07:0,m12:0,m13:0,m14:0,m15:1 },
        _getUITransformComp() { return tf; },
    };
}

function freshLabel(vAlign: VAlign): StyledLabel {
    (StyledLabel as any)._mCtx = null;
    (StyledLabel as any)._measureCache?.clear();
    (StyledLabel as any)._inflatedMap = null;
    const label = new StyledLabel();
    (label as any).node = makeNode(NODE_W, NODE_H);
    label.string      = '1,200,000';
    label.fontSize    = FONT_SIZE;
    label.lineHeight  = LINE_HEIGHT;
    label.overflow    = OverflowMode.NONE;
    label.wordWrap    = false;
    label.align.horizontal = HAlign.LEFT;
    label.align.vertical   = vAlign;
    label.onLoad();
    label.onEnable();
    capturedDrawY = 0;
    label._doUpdate();
    return label;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// Expected baseline position that matches standard Cocos label:
//   lineTop = vOffset (computed from alignH = fontSize = lineH)
//   baseline = lineTop + fontBoundingBoxAscent
const fba = FONT_SIZE * SYS_FBA_RATIO;   // = 34

describe('system font vAlign — baseline matches standard label (fontSize = lineHeight)', () => {

    test('BOTTOM: baseline = (nodeH - fontSize) + fontBoundingBoxAscent', () => {
        freshLabel(VAlign.BOTTOM);
        // lineTop = nodeH - alignH = nodeH - fontSize
        const expectedBaseline = (NODE_H - FONT_SIZE) + fba;   // 160 + 34 = 194
        expect(capturedDrawY).toBeCloseTo(expectedBaseline, 0);
    });

    test('CENTER: baseline = (nodeH - fontSize)/2 + fontBoundingBoxAscent', () => {
        freshLabel(VAlign.CENTER);
        // lineTop = (nodeH - alignH)/2 = (nodeH - fontSize)/2
        const expectedBaseline = (NODE_H - FONT_SIZE) / 2 + fba;   // 80 + 34 = 114
        expect(capturedDrawY).toBeCloseTo(expectedBaseline, 0);
    });

    test('TOP: baseline = textPad + fontBoundingBoxAscent', () => {
        freshLabel(VAlign.TOP);
        // VAlign.TOP adds textPad = ceil(fontSize * 0.15) for diacritics above baseline.
        // lineY = 0 + 0 + textPad, then baseline = lineY + fontBoundingBoxAscent.
        const textPad = Math.ceil(FONT_SIZE * 0.15);
        const expectedBaseline = textPad + fba;
        expect(capturedDrawY).toBeCloseTo(expectedBaseline, 0);
    });
});
