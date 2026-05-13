// BitmapFont vAlign — extended scenarios beyond number-normal.fnt.
//
// Tests two additional font configurations to ensure vAlign is correct
// regardless of nativeSize, base, lineHeight ratio, or number of lines.
//
// Scenario B: Compact font (nativeSize=48, base=38, glyph with descent)
//   Verifies that a different nativeSize/base ratio renders correctly.
//   Glyph '0': yOffset=4, height=50 → nativeVisBtm=54 (visBtm=36@fontSize32)
//
// Scenario C: Multi-line bitmap text (2 lines, '0<br>0')
//   Verifies CENTER and BOTTOM account for leadingLogH (height of preceding lines).
//   Using original number-normal.fnt metrics at fontSize=24.
//
// All assertions check rendered vertex Y positions (screen-local Y-up coords),
// not internal formulas — independent of implementation details.

import { BitmapFont, SpriteFrame, Texture2D } from 'cc';
import { StyledLabel } from '../../../assets/styled-label/styled-label';
import { VAlign, HAlign } from '../../../assets/styled-label/styled-label.layout';

// ── Shared node factory ───────────────────────────────────────────────────────

function makeNode(width: number, height: number) {
    const tf = { width, height, anchorX: 0.5, anchorY: 0.5 };
    return {
        on: () => {}, off: () => {}, emit: () => {},
        flagChangedVersion: 1,
        worldMatrix: { m00:1,m01:0,m02:0,m03:0,m04:0,m05:1,m06:0,m07:0,m12:0,m13:0,m14:0,m15:1 },
        _getUITransformComp() { return tf; },
    };
}

// Min Y (bottom edge) and max Y (top edge) across ALL quads in render data.
// Handles both single-glyph and multi-glyph (multi-line) output.
function allGlyphBounds(label: StyledLabel): { yt: number; yb: number } {
    const data = (label as any)._renderData?.data as Array<{ y: number }>;
    let yt = -Infinity, yb = Infinity;
    for (const v of data) {
        if (v.y > yt) yt = v.y;
        if (v.y < yb) yb = v.y;
    }
    return { yt, yb };
}

// ── Scenario B ────────────────────────────────────────────────────────────────
//
// Font metrics:
//   commonHeight=48, base=38, nativeSize=48
//   Glyph '0' (id=48): yOffset=4, height=50  → nativeVisBtm=54
//
// Rendering at fontSize=32, nodeH=80:
//   defaultScale = 32/48 ≈ 0.6667
//   visTop = 4  × 0.6667 ≈ 2.667
//   visBtm = 54 × 0.6667 = 36
//
// Expected screen coords (Y-up, anchor=0.5, nodeH=80):
//   nodeTop    = +40,  nodeBottom = -40,  nodeCenter = 0

describe('BitmapFont Scenario B — nativeSize=48, base=38, fontSize=32, nodeH=80', () => {
    const NODE_H_B   = 80;
    const FONT_SIZE_B = 32;
    const nodeTop    =  NODE_H_B / 2;   // +40
    const nodeBottom = -NODE_H_B / 2;   // -40

    function makeFontB(): BitmapFont {
        const font = new BitmapFont();
        (font as any).fntConfig = {
            commonHeight: 48,
            fontSize:     48,
            base:         38,
            fontDefDictionary: {
                32: { rect: { x:0, y:0, width:0, height:0 }, xOffset:0, yOffset:0, xAdvance:16 },
                48: { rect: { x:0, y:0, width:36, height:50 }, xOffset:2, yOffset:4, xAdvance:40 },
            },
        };
        const sf = new SpriteFrame(); sf.texture = new Texture2D();
        (font as any).spriteFrame = sf;
        return font;
    }

    function freshB(vAlign: VAlign): StyledLabel {
        (StyledLabel as any)._mCtx = null;
        (StyledLabel as any)._measureCache?.clear();
        const label = new StyledLabel();
        (label as any).node = makeNode(300, NODE_H_B);
        (label as any)._font = makeFontB();
        label.fontSize   = FONT_SIZE_B;
        label.lineHeight = 0;
        label.wordWrap   = false;
        label.align.horizontal = HAlign.CENTER;
        label.align.vertical   = vAlign;
        label.onLoad();
        label.onEnable();
        label.string = '0';
        (label as any)._contentDirty = true;
        label._doUpdate();
        return label;
    }

    test('TOP: glyph visual top ≈ node top (within 2px)', () => {
        const { yt } = allGlyphBounds(freshB(VAlign.TOP));
        expect(Math.abs(yt - nodeTop)).toBeLessThan(2);
    });

    test('CENTER: glyph visual center ≈ node center (within 1px)', () => {
        const { yt, yb } = allGlyphBounds(freshB(VAlign.CENTER));
        expect(Math.abs((yt + yb) / 2)).toBeLessThan(1);
    });

    test('BOTTOM: glyph visual bottom ≈ node bottom (within 2px)', () => {
        const { yb } = allGlyphBounds(freshB(VAlign.BOTTOM));
        expect(Math.abs(yb - nodeBottom)).toBeLessThan(2);
    });
});

// ── Scenario C ────────────────────────────────────────────────────────────────
//
// Multi-line bitmap text using original number-normal.fnt metrics.
// Two lines '0<br>0' rendered at fontSize=24, nodeH=70.
//
// Font metrics (same as bm-valign.test.ts):
//   commonHeight=72, base=59, nativeSize=72
//   Glyph '0': yOffset=-1, height=119
//
// Rendering at fontSize=24:
//   defaultScale = 24/72 ≈ 0.3333
//   visTop  = -1 × 0.3333 ≈ -0.333
//   visBtm  = 118 × 0.3333 ≈ 39.333
//   lineH   = 72 × (24/72) = 24
//   leadingLogH = 24  (height of first line, spacing=0)
//
// CENTER: lineY = (70 − visTop − leadingLogH − visBtm) / 2 ≈ 3.5
//   combined visual span: canvas [3.167 … 66.833] → screen center ≈ 0
// BOTTOM: lineY = 70 − 24 − 39.333 ≈ 6.667
//   second line bottom: 6.667+24+39.333 = 70 → screen yb = −35 = −nodeH/2

describe('BitmapFont Scenario C — multi-line "0<br>0", number-normal metrics, fontSize=24, nodeH=70', () => {
    const NODE_H_C    = 70;
    const FONT_SIZE_C = 24;
    const nodeCenter  = 0;
    const nodeBottom  = -NODE_H_C / 2;  // -35

    function makeFontC(): BitmapFont {
        const font = new BitmapFont();
        (font as any).fntConfig = {
            commonHeight: 72,
            fontSize:     72,
            base:         59,
            fontDefDictionary: {
                32: { rect: { x:0, y:0, width:0, height:0 }, xOffset:0, yOffset:0, xAdvance:21 },
                48: { rect: { x:0, y:0, width:80, height:119 }, xOffset:-1, yOffset:-1, xAdvance:78 },
            },
        };
        const sf = new SpriteFrame(); sf.texture = new Texture2D();
        (font as any).spriteFrame = sf;
        return font;
    }

    function freshC(vAlign: VAlign): StyledLabel {
        (StyledLabel as any)._mCtx = null;
        (StyledLabel as any)._measureCache?.clear();
        const label = new StyledLabel();
        (label as any).node = makeNode(300, NODE_H_C);
        (label as any)._font = makeFontC();
        label.fontSize   = FONT_SIZE_C;
        label.lineHeight = 0;
        label.wordWrap   = false;
        label.align.horizontal = HAlign.CENTER;
        label.align.vertical   = vAlign;
        label.onLoad();
        label.onEnable();
        label.string = '0<br>0';
        (label as any)._contentDirty = true;
        label._doUpdate();
        return label;
    }

    test('CENTER: combined visual center of both lines ≈ node center (within 1px)', () => {
        const { yt, yb } = allGlyphBounds(freshC(VAlign.CENTER));
        expect(Math.abs((yt + yb) / 2 - nodeCenter)).toBeLessThan(1);
    });

    test('BOTTOM: bottom of last line ≈ node bottom (within 2px)', () => {
        const { yb } = allGlyphBounds(freshC(VAlign.BOTTOM));
        expect(Math.abs(yb - nodeBottom)).toBeLessThan(2);
    });
});
