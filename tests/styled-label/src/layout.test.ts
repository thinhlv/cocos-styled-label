import {
    buildLayout, wordBaselineY,
    HAlign, VAlign, OverflowMode, TextTransform,
    ILayoutParams, ITextSegment, ITextStyle,
    HtmlTextParser,
} from '../../../assets/styled-label/styled-label.layout';

// Each char = 10px wide, line height = 20px at scale=1.
const measure = (text: string, _style: ITextStyle | undefined, scale: number) => ({
    w: text.length * 10 * scale,
    h: 20 * scale,
});

// Only 'icon' is a known sprite: 32×32 px.
const getSprite = (name: string) =>
    name === 'icon' ? { width: 32, height: 32 } : null;

function makeParams(overrides: Partial<ILayoutParams> & { segments: ITextSegment[] }): ILayoutParams {
    return {
        canvasW: 200, canvasH: 100,
        fontSize: 20, lineHeight: 0,
        marginLeft: 0, marginRight: 0, marginTop: 0, marginBottom: 0,
        lineSpacing: 0, wordWrap: true, overflow: OverflowMode.NONE,
        vAlign: VAlign.TOP, textTransform: TextTransform.NONE,
        fontScale: 1, measure, getSprite,
        ...overrides,
    };
}

function seg(text: string, style?: ITextStyle): ITextSegment {
    return { text, style };
}

// ── empty / trivial ───────────────────────────────────────────────────────────

describe('buildLayout — empty / trivial', () => {
    test('empty segments → 0 lines', () => {
        const result = buildLayout(makeParams({ segments: [] }));
        expect(result.lines).toHaveLength(0);
    });

    test('segment with empty text → 0 lines', () => {
        const result = buildLayout(makeParams({ segments: [seg('')] }));
        expect(result.lines).toHaveLength(0);
    });

    test('fontScale defaults to 1', () => {
        const result = buildLayout(makeParams({ segments: [] }));
        expect(result.fontScale).toBe(1);
    });
});

// ── line breaking ─────────────────────────────────────────────────────────────

describe('buildLayout — line breaking', () => {
    test('single word fits in one line', () => {
        // 'hello' → 5 chars → w=50, h=20. canvasW=200 → fits.
        const result = buildLayout(makeParams({ segments: [seg('hello')] }));
        expect(result.lines).toHaveLength(1);
        expect(result.lines[0].lineW).toBe(50);
    });

    test('two words that fit on one line stay together', () => {
        // 'ab cd': tokens ['ab '(3→30), 'cd'(2→20)], total=50 <= 200 → merged to one word.
        const result = buildLayout(makeParams({ segments: [seg('ab cd')] }));
        expect(result.lines).toHaveLength(1);
        expect(result.lines[0].lineW).toBe(50);
    });

    test('words that overflow canvasW wrap to next line', () => {
        // canvasW=50 → maxW=50.
        // Tokens: 'abc '(4→40), 'def '(4→40), 'ghi'(3→30).
        // 'abc ': lineW=0, push → lineW=40.
        // 'def ': 40+40=80>50 → pushLine; lineW=40.
        // 'ghi': 40+30=70>50 → pushLine; lineW=30.
        // End: pushLine → 3 lines total.
        const result = buildLayout(makeParams({
            segments: [seg('abc def ghi')],
            canvasW: 50,
        }));
        expect(result.lines).toHaveLength(3);
    });

    test('wordWrap=false keeps all words on one line', () => {
        const result = buildLayout(makeParams({
            segments: [seg('abc def ghi')],
            canvasW: 50,
            wordWrap: false,
        }));
        expect(result.lines).toHaveLength(1);
    });

    test('explicit <br/> creates a new line', () => {
        const segments: ITextSegment[] = [
            seg('a'),
            { text: '', style: { isNewLine: true } },
            seg('b'),
        ];
        const result = buildLayout(makeParams({ segments }));
        expect(result.lines).toHaveLength(2);
        expect(result.lines[0].words.some(w => w.text.includes('a'))).toBe(true);
        expect(result.lines[1].words.some(w => w.text.includes('b'))).toBe(true);
    });

    test('multiple <br/> in a row create multiple lines', () => {
        const segments: ITextSegment[] = [
            seg('a'),
            { text: '', style: { isNewLine: true } },
            { text: '', style: { isNewLine: true } },
            seg('b'),
        ];
        const result = buildLayout(makeParams({ segments }));
        expect(result.lines.length).toBeGreaterThanOrEqual(2);
    });
});

// ── vertical alignment ────────────────────────────────────────────────────────

describe('buildLayout — vAlign', () => {
    // 1 line (lineH=20), canvasH=100, no margins → areaH=100.
    // alignH = 20 (single line text).

    test('VAlign.TOP → vOffset=0', () => {
        const result = buildLayout(makeParams({
            segments: [seg('hello')],
            vAlign: VAlign.TOP,
            canvasH: 100,
        }));
        expect(result.vOffset).toBe(0);
    });

    test('VAlign.CENTER → vOffset = (areaH - alignH) / 2', () => {
        const result = buildLayout(makeParams({
            segments: [seg('hello')],
            vAlign: VAlign.CENTER,
            canvasH: 100,
        }));
        // alignH = lastLineTextH = max(style?.size ?? fontSize) * fontScale = 20.
        // vOffset = (100 - 20) / 2 = 40.
        expect(result.vOffset).toBe(40);
    });

    test('VAlign.BOTTOM → vOffset = areaH - alignH', () => {
        const result = buildLayout(makeParams({
            segments: [seg('hello')],
            vAlign: VAlign.BOTTOM,
            canvasH: 100,
        }));
        // vOffset = 100 - 20 = 80.
        expect(result.vOffset).toBe(80);
    });

    test('vAlign CENTER respects margin', () => {
        // marginTop=10, marginBottom=10 → areaH=80.
        const result = buildLayout(makeParams({
            segments: [seg('hello')],
            vAlign: VAlign.CENTER,
            canvasH: 100,
            marginTop: 10,
            marginBottom: 10,
        }));
        // vOffset = (80 - 20) / 2 = 30.
        expect(result.vOffset).toBe(30);
    });
});

// ── maxW (content area width) ────────────────────────────────────────────────

describe('buildLayout — maxW', () => {
    test('maxW = canvasW when no margins', () => {
        const result = buildLayout(makeParams({ segments: [], canvasW: 200 }));
        expect(result.maxW).toBe(200);
    });

    test('maxW = canvasW - marginLeft - marginRight', () => {
        const result = buildLayout(makeParams({
            segments: [],
            canvasW: 200,
            marginLeft: 20,
            marginRight: 30,
        }));
        expect(result.maxW).toBe(150);
    });

    test('margin reduces available width → triggers earlier wrap', () => {
        // canvasW=100, margins=20+20 → maxW=60. Each word 'abc '=4→40, 'def '=4→40.
        // 'abc ': lineW=40 <= 60. 'def ': 40+40=80>60 → wrap. 2 lines.
        const result = buildLayout(makeParams({
            segments: [seg('abc def')],
            canvasW: 100,
            marginLeft: 20,
            marginRight: 20,
        }));
        expect(result.lines).toHaveLength(2);
    });
});

// ── overflow ─────────────────────────────────────────────────────────────────

describe('buildLayout — overflow', () => {
    test('CLAMP cuts off lines that exceed height', () => {
        // canvasW=50 → 3 lines of h=20 each → totalH=60. canvasH=45 → areaH=45.
        // Clamp keeps lines whose accH <= 45: line1(20), line2(40), line3 would be 60>45 → cut.
        const result = buildLayout(makeParams({
            segments: [seg('abc def ghi')],
            canvasW: 50, canvasH: 45,
            overflow: OverflowMode.CLAMP,
        }));
        expect(result.lines).toHaveLength(2);
    });

    test('TRUNCATE behaves like CLAMP (cuts vertically)', () => {
        const result = buildLayout(makeParams({
            segments: [seg('abc def ghi')],
            canvasW: 50, canvasH: 45,
            overflow: OverflowMode.TRUNCATE,
        }));
        expect(result.lines).toHaveLength(2);
    });

    test('ELLIPSIS appends ... to the last visible line', () => {
        // canvasW=50, wordWrap=true, 3 lines → fit 2 in height 45.
        // Last visible line gets '...' appended.
        const result = buildLayout(makeParams({
            segments: [seg('abc def ghi')],
            canvasW: 50, canvasH: 45,
            overflow: OverflowMode.ELLIPSIS,
        }));
        const lastLine = result.lines[result.lines.length - 1];
        const lastWord = lastLine.words[lastLine.words.length - 1];
        expect(lastWord.text).toBe('...');
    });

    test('SHRINK scales down fontScale when content is too tall', () => {
        // canvasW=200, wordWrap=true, text 'abc def ghi' → 1 line at scale=1 (all fit).
        // canvasH=5 → areaH=5, lineH=20 > 5 → shrink.
        const result = buildLayout(makeParams({
            segments: [seg('abc def ghi')],
            canvasW: 200, canvasH: 5,
            overflow: OverflowMode.SHRINK,
        }));
        expect(result.fontScale).toBeLessThan(1);
    });

    test('SHRINK (no wrap) scales down when single line is too wide', () => {
        // wordWrap=false, canvasW=20, text 'hello' → lineW=50>20 → shrink to 20/50=0.4.
        const result = buildLayout(makeParams({
            segments: [seg('hello')],
            canvasW: 20, wordWrap: false,
            overflow: OverflowMode.SHRINK,
        }));
        expect(result.fontScale).toBeCloseTo(0.4, 5);
    });

    test('ELLIPSIS (no wrap, single line too wide) appends ...', () => {
        // wordWrap=false, canvasW=70. Tokens: 'a '(20), 'bb '(30), 'ccc'(30) → lineW=80>70.
        // ellipsisW=30, targetW=40. Trim: pop 'ccc'(totalW=50), pop 'bb '(totalW=20).
        // 20<=40: keep 'a '. tail='a '→prefixW=0, measure('a ',...)=20<=40 → keep.
        // Result: ['a ', '...'] → last word is '...'.
        const result = buildLayout(makeParams({
            segments: [seg('a bb ccc')],
            canvasW: 70, wordWrap: false,
            overflow: OverflowMode.ELLIPSIS,
        }));
        expect(result.lines).toHaveLength(1);
        const lastWord = result.lines[0].words[result.lines[0].words.length - 1];
        expect(lastWord.text).toBe('...');
    });
});

// ── text transform ────────────────────────────────────────────────────────────

describe('buildLayout — TextTransform', () => {
    test('UPPERCASE transforms all word text to upper case', () => {
        const result = buildLayout(makeParams({
            segments: [seg('hello world')],
            textTransform: TextTransform.UPPERCASE,
        }));
        const allText = result.lines.flatMap(l => l.words).map(w => w.text).join('');
        expect(allText).toMatch(/^[A-Z\s]+$/);
        expect(allText.toUpperCase()).toBe(allText);
    });

    test('LOWERCASE transforms all word text to lower case', () => {
        const result = buildLayout(makeParams({
            segments: [seg('HELLO WORLD')],
            textTransform: TextTransform.LOWERCASE,
        }));
        const allText = result.lines.flatMap(l => l.words).map(w => w.text).join('');
        expect(allText.toLowerCase()).toBe(allText);
    });

    test('NONE leaves text unchanged', () => {
        const result = buildLayout(makeParams({
            segments: [seg('Hello World')],
            textTransform: TextTransform.NONE,
        }));
        const allText = result.lines.flatMap(l => l.words).map(w => w.text).join('');
        expect(allText).toContain('Hello');
    });
});

// ── fontScale ─────────────────────────────────────────────────────────────────

describe('buildLayout — fontScale', () => {
    test('fontScale=0.5 halves word width and height', () => {
        const scale1 = buildLayout(makeParams({ segments: [seg('hello')], fontScale: 1 }));
        const scale05 = buildLayout(makeParams({ segments: [seg('hello')], fontScale: 0.5 }));
        const w1 = scale1.lines[0].words[0].w;
        const w05 = scale05.lines[0].words[0].w;
        expect(w05).toBeCloseTo(w1 * 0.5, 5);

        const h1 = scale1.lines[0].words[0].h;
        const h05 = scale05.lines[0].words[0].h;
        expect(h05).toBeCloseTo(h1 * 0.5, 5);
    });

    test('fontScale affects wrap threshold', () => {
        // At scale=1, canvasW=50: 3 lines. At scale=0.5, words half width: 1 line.
        const scale1 = buildLayout(makeParams({
            segments: [seg('abc def ghi')], canvasW: 50, fontScale: 1,
        }));
        const scale05 = buildLayout(makeParams({
            segments: [seg('abc def ghi')], canvasW: 50, fontScale: 0.5,
        }));
        expect(scale1.lines.length).toBeGreaterThan(scale05.lines.length);
    });
});

// ── sprites ───────────────────────────────────────────────────────────────────

describe('buildLayout — sprites', () => {
    test('sprite segment produces a word with spriteName and correct dimensions', () => {
        // icon: 32×32. spriteSize=20, fontScale=1 → sprH=20, sprW=32*(20/32)=20.
        const segments: ITextSegment[] = [
            { text: '￼', style: { spriteName: 'icon', spriteSize: 20 } },
        ];
        const result = buildLayout(makeParams({ segments }));
        expect(result.lines).toHaveLength(1);
        const word = result.lines[0].words[0];
        expect(word.style?.spriteName).toBe('icon');
        expect(word.w).toBeCloseTo(20, 5);
        expect(word.h).toBeCloseTo(20, 5);
    });

    test('unknown sprite is ignored (not added to line)', () => {
        const segments: ITextSegment[] = [
            { text: '￼', style: { spriteName: 'missing' } },
        ];
        const result = buildLayout(makeParams({ segments }));
        expect(result.lines).toHaveLength(0);
    });

    test('sprite falls back to fontSize when spriteSize is undefined', () => {
        // fontSize=20, icon=32×32 → sprH=20, sprW=20.
        const segments: ITextSegment[] = [
            { text: '￼', style: { spriteName: 'icon' } },
        ];
        const result = buildLayout(makeParams({ segments, fontSize: 20 }));
        const word = result.lines[0].words[0];
        expect(word.h).toBeCloseTo(20, 5);
    });

    test('sprite mixes with text on the same line', () => {
        const segments: ITextSegment[] = [
            seg('hi'),
            { text: '￼', style: { spriteName: 'icon', spriteSize: 20 } },
        ];
        const result = buildLayout(makeParams({ segments, canvasW: 200 }));
        expect(result.lines).toHaveLength(1);
        expect(result.lines[0].words.length).toBeGreaterThanOrEqual(2);
    });
});

// ── style inheritance / merging ───────────────────────────────────────────────

describe('buildLayout — word merging', () => {
    test('adjacent same-style words are merged into one word', () => {
        // 'hello world' → two tokens with same style (undefined) → merged.
        const result = buildLayout(makeParams({ segments: [seg('hello world')] }));
        expect(result.lines).toHaveLength(1);
        expect(result.lines[0].words).toHaveLength(1);
    });

    test('adjacent different-style words are NOT merged', () => {
        const segments: ITextSegment[] = [
            seg('hello', { color: '#ff0000' }),
            seg('world'),
        ];
        const result = buildLayout(makeParams({ segments }));
        expect(result.lines).toHaveLength(1);
        // Different styles → 2 distinct words.
        expect(result.lines[0].words).toHaveLength(2);
    });
});

// ── sup / sub (inline vertical align) ────────────────────────────────────────

describe('buildLayout — sup/sub word vAlign', () => {
    // Custom measure that respects style.size so we can create mixed-height lines.
    const measureBySize = (text: string, style: ITextStyle | undefined, scale: number) => ({
        w: text.length * 10 * scale,
        h: (style?.size ?? 20) * scale,
    });

    test('sup word entry preserves vAlign:"top" in style', () => {
        const segments: ITextSegment[] = [
            { text: '$', style: { vAlign: 'top', size: 20 } },
            { text: '2,000' },
        ];
        const result = buildLayout(makeParams({ segments, measure: measureBySize, wordWrap: false }));
        const words = result.lines.flatMap(l => l.words);
        const supWord = words.find(w => w.style?.vAlign === 'top');
        expect(supWord).toBeDefined();
    });

    test('sub word entry preserves vAlign:"bottom" in style', () => {
        const segments: ITextSegment[] = [
            { text: 'x', style: { vAlign: 'bottom', size: 20 } },
        ];
        const result = buildLayout(makeParams({ segments, measure: measureBySize }));
        const word = result.lines[0].words[0];
        expect(word.style?.vAlign).toBe('bottom');
    });

    test('lineH = max word height — small sup does not reduce lineH', () => {
        // $ is sup with size=10 (h=10), 2000 is normal with size=40 (h=40).
        // lineH must be 40, not 10.
        const segments: ITextSegment[] = [
            { text: '$',    style: { vAlign: 'top', size: 10 } },
            { text: '2000', style: { size: 40 } },
        ];
        const result = buildLayout(makeParams({
            segments, measure: measureBySize, wordWrap: false,
        }));
        expect(result.lines).toHaveLength(1);
        expect(result.lines[0].lineH).toBe(40);
    });

    test('lineH = max word height — small sub does not reduce lineH', () => {
        const segments: ITextSegment[] = [
            { text: '$',    style: { vAlign: 'bottom', size: 10 } },
            { text: '2000', style: { size: 40 } },
        ];
        const result = buildLayout(makeParams({
            segments, measure: measureBySize, wordWrap: false,
        }));
        expect(result.lines[0].lineH).toBe(40);
    });

    test('word without vAlign has undefined vAlign in style', () => {
        const result = buildLayout(makeParams({ segments: [{ text: 'hello' }] }));
        const word = result.lines[0].words[0];
        expect(word.style?.vAlign).toBeUndefined();
    });
});

// ── wordBaselineY ─────────────────────────────────────────────────────────────

describe('wordBaselineY', () => {
    // Invariants (visual geometry, independent of formula):
    //   sup : TOP of word box = lineTop   → drawY - wordAscent = lineTop
    //   sub : CENTER of word  = lineTop+lineH → drawY - wordAscent + wordH/2 = lineTop+lineH
    //   base: drawY = lineTop + lineAscent (shared alphabetic baseline)

    const lineTop = 100, lineH = 40, wordAscent = 16, lineAscent = 30, wordH = 24;

    test('vAlign="top": top of word box at lineTop', () => {
        const drawY = wordBaselineY(lineTop, lineH, wordAscent, lineAscent, wordH, 'top');
        expect(drawY - wordAscent).toBe(lineTop);
    });

    test('vAlign="bottom": center of word at lineTop+lineH', () => {
        const drawY = wordBaselineY(lineTop, lineH, wordAscent, lineAscent, wordH, 'bottom');
        expect(drawY - wordAscent + wordH / 2).toBe(lineTop + lineH);
    });

    test('vAlign="baseline": drawY = lineTop + lineAscent', () => {
        const drawY = wordBaselineY(lineTop, lineH, wordAscent, lineAscent, wordH, 'baseline');
        expect(drawY).toBe(lineTop + lineAscent);
    });

    test('vAlign=undefined: same as baseline', () => {
        expect(wordBaselineY(lineTop, lineH, wordAscent, lineAscent, wordH, undefined))
            .toBe(wordBaselineY(lineTop, lineH, wordAscent, lineAscent, wordH, 'baseline'));
    });

    test('sup drawY < baseline drawY (word sits higher)', () => {
        const sup  = wordBaselineY(lineTop, lineH, wordAscent, lineAscent, wordH, 'top');
        const base = wordBaselineY(lineTop, lineH, wordAscent, lineAscent, wordH, 'baseline');
        expect(sup).toBeLessThan(base);
    });

    test('sub drawY > baseline drawY (word sits lower)', () => {
        const sub  = wordBaselineY(lineTop, lineH, wordAscent, lineAscent, wordH, 'bottom');
        const base = wordBaselineY(lineTop, lineH, wordAscent, lineAscent, wordH, 'baseline');
        expect(sub).toBeGreaterThan(base);
    });
});

// ── lineSpacing ───────────────────────────────────────────────────────────────

describe('buildLayout — lineSpacing', () => {
    test('lineSpacing adds extra space to totalH for overflow computation', () => {
        // canvasW=50 → 3 lines (h=20 each). lineSpacing=5 → totalH=20+5+20+5+20-5=65.
        // canvasH=45 → areaH=45 < 65 → CLAMP keeps fewer lines than without spacing.
        const noSpacing = buildLayout(makeParams({
            segments: [seg('abc def ghi')],
            canvasW: 50, canvasH: 45,
            overflow: OverflowMode.CLAMP, lineSpacing: 0,
        }));
        const withSpacing = buildLayout(makeParams({
            segments: [seg('abc def ghi')],
            canvasW: 50, canvasH: 45,
            overflow: OverflowMode.CLAMP, lineSpacing: 10,
        }));
        // With extra spacing, fewer lines fit.
        expect(withSpacing.lines.length).toBeLessThanOrEqual(noSpacing.lines.length);
    });
});

// ── [BUG] space after <sprite> tag ───────────────────────────────────────────
//
// Root cause (buildLayout, tokenization step):
//   When a text segment starts with ' ' (e.g. ' hello' after a sprite tag),
//   the code tries to transfer that leading space to the *previous token*.
//   For sprite tokens the condition `prev.text && !prev.style?.isNewLine` is
//   TRUE (sprite text is '￼', not a newline), so the space is appended there.
//   But the layout loop for sprites (line ~291) always pushes `text:'￼'` and
//   ignores token.text entirely → the space is silently discarded and the
//   following word renders flush against the sprite.
//
// Fix: in the backward scan, bail out when a sprite token is encountered so
//   the space is NOT transferred, and only strip the leading space from
//   words[0] when the transfer actually succeeded.

describe('[BUG] space after <sprite> tag — text must not touch sprite', () => {
    const parser = new HtmlTextParser();

    // getSprite that knows both 'icon' and '0'
    const getSpr = (name: string) =>
        (name === 'icon' || name === '0') ? { width: 32, height: 32 } : null;

    function layoutOf(html: string) {
        const segments = parser.parse(html);
        return buildLayout(makeParams({ segments, getSprite: getSpr }));
    }

    // sprite '0' / 'icon': 32×32, fontSize=20, fontScale=1 → sprH=20, sprW=20
    // space measured by mock: 1 char × 10 = 10
    // 'hello': 5 chars × 10 = 50

    test('<sprite=0> hello — text word starts with space (space preserved)', () => {
        const result = layoutOf('<sprite=0> hello');
        const words = result.lines.flatMap(l => l.words);
        const textWord = words.find(w => !w.style?.spriteName);
        // Space must be preserved as a leading space on the text word.
        expect(textWord?.text).toMatch(/^ /);
    });

    test('<sprite=0> hello — line width includes space between sprite and text', () => {
        const result = layoutOf('<sprite=0> hello');
        // sprW=20, space=10, helloW=50 → total=80
        // Without fix: sprW=20 + helloW=50 = 70 (space missing)
        expect(result.lines[0].lineW).toBeGreaterThan(70);
    });

    test('multiple spaces after sprite are all preserved', () => {
        const result = layoutOf('<sprite=0>   hi');
        const words = result.lines.flatMap(l => l.words);
        const textWord = words.find(w => !w.style?.spriteName);
        // All leading spaces must stay, not be collapsed to one.
        expect(textWord?.text.match(/^ +/)![0].length).toBeGreaterThanOrEqual(2);
    });

    test('text before sprite still transfers its trailing space normally', () => {
        // 'hi <sprite=0>': space after 'hi' should stay as trailing on 'hi' token.
        // After merge, word text should end with space.
        const result = layoutOf('hi <sprite=icon>');
        const words = result.lines.flatMap(l => l.words);
        const textWord = words.find(w => !w.style?.spriteName);
        // 'hi ' = 3 chars × 10 = 30; sprite = 20 → total line = 50
        expect(result.lines[0].lineW).toBeCloseTo(50, 0);
        expect(textWord?.w).toBeCloseTo(30, 0);
    });

    test('text + sprite + space + text — space between sprite and second text is preserved', () => {
        // 'hi <sprite=icon> bye': 'hi '=30, sprite=20, ' bye'=40 → total=90
        const result = layoutOf('hi <sprite=icon> bye');
        expect(result.lines[0].lineW).toBeGreaterThan(70); // must exceed hi+sprite alone
    });

    test('no space after sprite — text still renders immediately after', () => {
        // '<sprite=0>hello' → no leading space on 'hello'
        const result = layoutOf('<sprite=0>hello');
        const words = result.lines.flatMap(l => l.words);
        const textWord = words.find(w => !w.style?.spriteName);
        expect(textWord?.text).not.toMatch(/^ /);
        // sprW=20 + helloW=50 = 70
        expect(result.lines[0].lineW).toBeCloseTo(70, 0);
    });
});
