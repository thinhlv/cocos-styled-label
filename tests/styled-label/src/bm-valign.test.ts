// BitmapFont vAlign pixel-position tests.
//
// Strategy: call _doUpdate(), then read renderData.data vertex positions.
// Cocos quad layout: data[0]=BL, data[1]=BR, data[2]=TL, data[3]=TR.
//   data[0].y = yb (bottom edge, screen-local Y-up)
//   data[2].y = yt (top edge,    screen-local Y-up)
//
// number-normal.fnt key metrics:
//   common lineHeight=72  base=59
//   char '0': yOffset=-1, height=119  → scaled at fontSize=40: ~66.1 px tall
//
// Bug (before fix):
//   lineMaxScale initialised to fontScale (1) instead of the actual word scale
//   (fontSize/nativeSize = 40/72 ≈ 0.556).  The term
//     nativeBase × (lineMaxScale − scale) = 59 × (1 − 0.556) ≈ +26 px
//   shifts every glyph DOWN regardless of vAlign.
//
// Tests are independent of implementation internals (_bmQuads, formulas).
// They only check that the rendered vertex Y positions satisfy visual geometry.

import { BitmapFont, SpriteFrame, Texture2D } from 'cc';
import { StyledLabel } from '../../../assets/styled-label/styled-label';
import { VAlign, HAlign } from '../../../assets/styled-label/styled-label.layout';

// ── Constants matching user's repro scenario ──────────────────────────────────

const NODE_H  = 67;
const NODE_W  = 300;
const ANCHOR  = 0.5;
const FONT_SIZE = 40;        // intentionally ≠ nativeSize (72) to expose the bug

// Glyph data for digit '0' from number-normal.fnt
const DIGIT_0_YOFFSET = -1;
const DIGIT_0_HEIGHT  = 119;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeNode(width = NODE_W, height = NODE_H) {
    const tf = { width, height, anchorX: ANCHOR, anchorY: ANCHOR };
    return {
        on: () => {}, off: () => {}, emit: () => {},
        flagChangedVersion: 1,
        worldMatrix: { m00:1,m01:0,m02:0,m03:0,m04:0,m05:1,m06:0,m07:0,m12:0,m13:0,m14:0,m15:1 },
        _getUITransformComp() { return tf; },
    };
}

function makeBMFont(): BitmapFont {
    const font = new BitmapFont();
    (font as any).fntConfig = {
        commonHeight: 72,
        fontSize:     72,
        base:         59,
        fontDefDictionary: {
            // space (id=32) — zero height, skipped for visual-bbox
            32: { rect: { x: 0, y: 0, width: 0, height: 0 }, xOffset: 0, yOffset: 0, xAdvance: 21 },
            // digit '0' (id=48)
            48: { rect: { x: 0, y: 0, width: 80, height: DIGIT_0_HEIGHT }, xOffset: -1, yOffset: DIGIT_0_YOFFSET, xAdvance: 78 },
        },
    };
    const sf = new SpriteFrame();
    sf.texture = new Texture2D();
    (font as any).spriteFrame = sf;
    return font;
}

function freshBMLabel(vAlign: VAlign): StyledLabel {
    (StyledLabel as any)._mCtx = null;
    (StyledLabel as any)._measureCache?.clear();

    const label = new StyledLabel();
    (label as any).node = makeNode();

    (label as any)._font = makeBMFont();

    label.fontSize   = FONT_SIZE;
    label.lineHeight = 0;     // let BitmapFont use its own commonHeight
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

// Read the rendered top/bottom Y from renderData vertex positions.
// Cocos writes quads as BL(0) BR(1) TL(2) TR(3); y of TL = yt, y of BL = yb.
function glyphEdges(label: StyledLabel): { yt: number; yb: number } {
    const data = (label as any)._renderData?.data;
    return { yt: data[2].y, yb: data[0].y };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BitmapFont vAlign — rendered vertex Y positions (number-normal.fnt, digit "0", fontSize=40)', () => {
    // Screen-local coords (Y-up, anchor=0.5, nodeH=67):
    //   node top    = +33.5
    //   node center =  0
    //   node bottom = -33.5
    const nodeTop    =  NODE_H / 2;   // +33.5
    const nodeBottom = -NODE_H / 2;   // -33.5

    test('TOP: glyph visual top ≈ node top (within 2px)', () => {
        const { yt } = glyphEdges(freshBMLabel(VAlign.TOP));
        expect(Math.abs(yt - nodeTop)).toBeLessThan(2);
    });

    test('CENTER: glyph visual center ≈ node center (within 1px)', () => {
        const { yt, yb } = glyphEdges(freshBMLabel(VAlign.CENTER));
        expect(Math.abs((yt + yb) / 2)).toBeLessThan(1);
    });

    test('BOTTOM: glyph visual bottom ≈ node bottom (within 2px)', () => {
        const { yb } = glyphEdges(freshBMLabel(VAlign.BOTTOM));
        expect(Math.abs(yb - nodeBottom)).toBeLessThan(2);
    });
});
