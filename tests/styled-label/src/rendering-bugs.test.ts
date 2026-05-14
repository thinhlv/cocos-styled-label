// Tests for two rendering bugs visible on web / native / editor.
//
// Bug 1 — Underline overruns closing tag:
//   "<u>All three</u> xin chào" underlines the space before "xin".
//
// Bug 2 — Sprite top-clipped when fontAscent < spriteHeight:
//   With vAlign=TOP, diacriticPad=4 and fontAscent=16 (mock), sprH=24:
//   canvasTopY = lineY + fontAscent - sprH = 4 + 16 - 24 = -4 < 0 → clipped.
//   Separately, large fontSize (e.g. 48) with vAlign=CENTER produces vOffset=0
//   so lineY=0, canvasTopY = 0 + 16 - 48 = -32 → deeply clipped.

// ── Canvas mock ───────────────────────────────────────────────────────────────

const mockCtxU = {
    clearRect(_x: number, _y: number, _w: number, _h: number) {},
    fillText(_t: string, _x: number, _y: number) {},
    fillRect(_x: number, _y: number, _w: number, _h: number) {},
    save() {}, restore() {}, translate() {}, rotate() {},
    drawImage(..._args: any[]) {},
    measureText(t: string) {
        return {
            width: t.length * 10,
            fontBoundingBoxAscent: 16,  // always 16 regardless of font size
            actualBoundingBoxAscent: 16,
        };
    },
    font: '', fillStyle: '', textBaseline: '',
};

(global as any).document = {
    createElement: (_tag: string) => ({ width: 1, height: 1, getContext: () => mockCtxU }),
};

import { StyledLabel } from '../../../assets/styled-label/styled-label';
import { SpriteAtlas, SpriteFrame, Rect } from 'cc';
import { VAlign } from '../../../assets/styled-label/styled-label.layout';

const prv = (obj: any) => obj as Record<string, any>;

function makeNodeU(width = 200, height = 60) {
    const tf = { width, height, anchorX: 0.5, anchorY: 0.5 };
    return {
        on:  (_e: string, _f: any, _c: any) => {},
        off: (_e: string, _f: any, _c: any) => {},
        emit: (_e: string) => {},
        flagChangedVersion: 1,
        worldMatrix: { m00:1,m01:0,m02:0,m03:0,m04:0,m05:1,m06:0,m07:0,m12:0,m13:0,m14:0,m15:1 },
        _getUITransformComp() { return tf; },
    };
}

function freshLabel(width = 200, height = 60): StyledLabel {
    (StyledLabel as any)._mCtx = null;
    (StyledLabel as any)._measureCache?.clear();
    (StyledLabel as any)._inflatedMap = null;
    const label = new StyledLabel();
    (label as any).node = makeNodeU(width, height);
    return label;
}

function makeMockAtlas(): SpriteAtlas {
    const atlas = new SpriteAtlas();
    const frame = new SpriteFrame();
    frame.rect = new Rect(0, 0, 32, 32);
    (frame as any).texture = { width: 32, height: 32 };
    atlas.addFrame('emoji', frame);
    return atlas;
}

// ── Bug 1: underline width ────────────────────────────────────────────────────

describe('Underline — only underlines text inside <u> tag', () => {
    test('<u>All three</u> space after tag is NOT underlined', () => {
        const label = freshLabel();
        label.string = '<u>All three</u> xin chào';
        label.onLoad();
        label.onEnable();

        const widths: number[] = [];
        jest.spyOn(mockCtxU, 'fillRect').mockImplementation(
            (_x: number, _y: number, w: number, _h: number) => { widths.push(w); },
        );

        label._doUpdate();
        jest.restoreAllMocks();

        // Only one underline rect should be drawn.
        expect(widths.length).toBe(1);

        // "All three " (10 chars × 10 = 100) vs "All three" (9 chars × 10 = 90).
        // The underline MUST NOT cover the trailing space.
        const underlineW = widths[0];
        expect(underlineW).toBeLessThan(100);   // trailing space excluded
        expect(underlineW).toBeCloseTo(90, 0);  // exactly "All three"
    });

    test('<u>word</u> with no trailing space — width unchanged', () => {
        const label = freshLabel();
        label.string = '<u>hello</u>';
        label.onLoad();
        label.onEnable();

        const widths: number[] = [];
        jest.spyOn(mockCtxU, 'fillRect').mockImplementation(
            (_x: number, _y: number, w: number, _h: number) => { widths.push(w); },
        );

        label._doUpdate();
        jest.restoreAllMocks();

        expect(widths.length).toBe(1);
        expect(widths[0]).toBeCloseTo(50, 0); // "hello" = 5 × 10
    });

    test('<u>multiple words</u> followed by more text — no trailing-space underline', () => {
        const label = freshLabel();
        label.string = '<u>one two three</u> more';
        label.onLoad();
        label.onEnable();

        const widths: number[] = [];
        jest.spyOn(mockCtxU, 'fillRect').mockImplementation(
            (_x: number, _y: number, w: number, _h: number) => { widths.push(w); },
        );

        label._doUpdate();
        jest.restoreAllMocks();

        expect(widths.length).toBe(1);
        // "one two three" = 13 chars × 10 = 130 (no trailing space)
        expect(widths[0]).toBeLessThanOrEqual(130);
    });
});

// ── Bug 2: sprite not clipped ─────────────────────────────────────────────────

describe('Sprite rendering — no clipping', () => {
    // Intercept render calls and return captured arguments.
    function renderCallsFor(
        html: string,
        setup?: (label: StyledLabel) => void,
    ): Array<{ canvasTopY: number; dh: number; canvasH: number }> {
        const label = freshLabel();
        label.string = html;
        label.spriteAtlas = makeMockAtlas();
        setup?.(label);
        label.onLoad();
        label.onEnable();
        label._doUpdate();

        const spr = prv(label)._spriteRenderer;
        const calls: Array<{ canvasTopY: number; dh: number; canvasH: number }> = [];
        const orig = spr.render.bind(spr);
        let capturedCanvasH = 0;
        const origBegin = spr.beginFrame.bind(spr);
        spr.beginFrame = (_ax: number, _ay: number, _w: number, aH: number) => {
            capturedCanvasH = aH;
            origBegin(_ax, _ay, _w, aH);
        };
        spr.render = (frame: any, _x: number, topY: number, _dw: number, dh: number) => {
            calls.push({ canvasTopY: topY, dh, canvasH: capturedCanvasH });
            orig(frame, _x, topY, _dw, dh);
        };

        prv(label)._contentDirty = true;
        label._doUpdate();

        spr.render = orig;
        return calls;
    }

    // ── default vAlign=CENTER, fontSize=24 (mock fontAscent=16) ──────────────
    // vOffset = (40 - 24) / 2 = 8, lineY = 8; old formula: canvasTopY = 8+16-24 = 0 ✓

    test('default config: sprite canvasTopY >= 0', () => {
        const calls = renderCallsFor('<sprite=emoji>');
        expect(calls.length).toBeGreaterThan(0);
        for (const { canvasTopY } of calls) {
            expect(canvasTopY).toBeGreaterThanOrEqual(0);
        }
    });

    test('default config: sprite bottom does not exceed canvas height', () => {
        const calls = renderCallsFor('<sprite=emoji>');
        expect(calls.length).toBeGreaterThan(0);
        for (const { canvasTopY, dh, canvasH } of calls) {
            expect(canvasTopY + dh).toBeLessThanOrEqual(canvasH);
        }
    });

    // ── vAlign=TOP exposes the clipping bug ───────────────────────────────────
    // diacriticPad=4, vOffset=0, lineY=4; old formula: canvasTopY = 4+16-24 = -4 < 0

    test('[BUG] vAlign=TOP: sprite canvasTopY >= 0 (was -4 with old formula)', () => {
        const calls = renderCallsFor('<sprite=emoji>', (label) => {
            label.align.vertical = VAlign.TOP;
        });
        expect(calls.length).toBeGreaterThan(0);
        for (const { canvasTopY } of calls) {
            expect(canvasTopY).toBeGreaterThanOrEqual(0);
        }
    });

    test('[BUG] vAlign=TOP: sprite bottom does not exceed canvas height', () => {
        const calls = renderCallsFor('<sprite=emoji>', (label) => {
            label.align.vertical = VAlign.TOP;
        });
        expect(calls.length).toBeGreaterThan(0);
        for (const { canvasTopY, dh, canvasH } of calls) {
            expect(canvasTopY + dh).toBeLessThanOrEqual(canvasH);
        }
    });

    // ── large fontSize exposes the bug for CENTER too ─────────────────────────
    // fontSize=48, mock fontAscent=16, vOffset=0; old formula: canvasTopY = 0+16-48 = -32

    test('[BUG] fontSize=48: sprite canvasTopY >= 0 (was -32 with old formula)', () => {
        const calls = renderCallsFor('<sprite=emoji>', (label) => {
            label.fontSize = 48;
        });
        expect(calls.length).toBeGreaterThan(0);
        for (const { canvasTopY } of calls) {
            expect(canvasTopY).toBeGreaterThanOrEqual(0);
        }
    });

    test('[BUG] fontSize=48: sprite bottom does not exceed canvas height', () => {
        const calls = renderCallsFor('<sprite=emoji>', (label) => {
            label.fontSize = 48;
        });
        expect(calls.length).toBeGreaterThan(0);
        for (const { canvasTopY, dh, canvasH } of calls) {
            expect(canvasTopY + dh).toBeLessThanOrEqual(canvasH);
        }
    });

    // ── sprite height equals expected sprH ────────────────────────────────────

    test('sprite dh equals fontSize (default spriteSize)', () => {
        const calls = renderCallsFor('<sprite=emoji>');
        expect(calls.length).toBeGreaterThan(0);
        for (const { dh } of calls) {
            expect(dh).toBeCloseTo(24, 0);
        }
    });

    // ── mixed text + sprite ───────────────────────────────────────────────────

    test('sprite canvasTopY >= 0 when mixed with text', () => {
        const calls = renderCallsFor('hello <sprite=emoji> world');
        expect(calls.length).toBeGreaterThan(0);
        for (const { canvasTopY } of calls) {
            expect(canvasTopY).toBeGreaterThanOrEqual(0);
        }
    });
});
