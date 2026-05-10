// Pure layout logic — no engine dependencies.
// All rendering-specific concerns (canvas, SpriteFrame, BitmapFont) are injected via callbacks.

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum HAlign { LEFT = 0, CENTER = 1, RIGHT = 2 }
export enum VAlign { TOP = 0, CENTER = 1, BOTTOM = 2 }
export enum OverflowMode { NONE = 0, CLAMP = 1, SHRINK = 2, TRUNCATE = 3, ELLIPSIS = 4 }
export enum TextTransform { NONE = 0, UPPERCASE = 1, LOWERCASE = 2 }

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ITextStyle {
    color?: string;
    size?: number;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    isNewLine?: boolean;
    event?: Record<string, string>;
    spriteName?: string;
    spriteSize?: number;
    /** Vertical alignment of this word within the line box. */
    vAlign?: 'top' | 'bottom' | 'baseline';
}

export interface ITextSegment { text?: string; style?: ITextStyle; }

export interface IWordEntry {
    text: string;
    style?: ITextStyle;
    w: number;
    h: number;
}

export interface ILine { words: IWordEntry[]; lineW: number; lineH: number; }

export interface ILayoutResult { lines: ILine[]; vOffset: number; maxW: number; fontScale: number; }

export interface ILayoutParams {
    segments: ITextSegment[];
    canvasW: number;
    canvasH: number;
    fontSize: number;
    lineHeight: number;
    marginLeft: number;
    marginRight: number;
    marginTop: number;
    marginBottom: number;
    lineSpacing: number;
    wordWrap: boolean;
    overflow: OverflowMode;
    vAlign: VAlign;
    textTransform: TextTransform;
    fontScale: number;
    /** Return {w, h} for a text word at the given fontScale. */
    measure: (text: string, style: ITextStyle | undefined, fontScale: number) => { w: number; h: number };
    /** Return sprite pixel dimensions, or null if not found. */
    getSprite: (name: string) => { width: number; height: number } | null;
}

// ─── HTML Parser ──────────────────────────────────────────────────────────────

const _eventRegx = /^(click)(\s)*=|(param)(\s)*=/;

export class HtmlTextParser {
    private readonly _specialSymbols: Array<[RegExp, string]> = [
        [/&lt;/g, '<'], [/&gt;/g, '>'], [/&amp;/g, '&'],
        [/&quot;/g, '"'], [/&apos;/g, "'"],
    ];
    private _stack: ITextStyle[] = [];
    private _result: ITextSegment[] = [];

    parse(html: string): ITextSegment[] {
        this._result = [];
        this._stack = [];
        let start = 0;
        const len = html.length;
        while (start < len) {
            let tagEnd = html.indexOf('>', start);
            let tagBegin = -1;
            if (tagEnd >= 0) {
                tagBegin = html.lastIndexOf('<', tagEnd);
                if (tagBegin < start - 1) {
                    tagBegin = html.indexOf('<', tagEnd + 1);
                    tagEnd = html.indexOf('>', tagBegin + 1);
                }
            }
            if (tagBegin < 0) {
                this._stack.pop();
                this._pushText(html.substring(start));
                start = len;
            } else {
                const raw = html.substring(start, tagBegin);
                const tag = html.substring(tagBegin + 1, tagEnd);
                if (tag === '') this._pushText(html.substring(start, tagEnd + 1));
                else this._pushText(raw);
                if (tagEnd === -1) tagEnd = tagBegin;
                else if (html.charAt(tagBegin + 1) === '/') this._stack.pop();
                else this._addToStack(tag);
                start = tagEnd + 1;
            }
        }
        return this._result;
    }

    private _addToStack(attr: string) {
        const obj = this._parseAttr(attr);
        if (obj.isNewLine || obj.spriteName) return;
        if (this._stack.length > 0) {
            const parent = this._stack[this._stack.length - 1];
            for (const key in parent) if ((obj as any)[key] == null) (obj as any)[key] = (parent as any)[key];
        }
        this._stack.push(obj);
    }

    private _parseAttr(attr: string): ITextStyle {
        attr = attr.trim();
        const obj: ITextStyle = {};
        let h = /^(color|size)(\s)*=/.exec(attr);
        if (h) {
            const tagName = h[0];
            attr = attr.substring(tagName.length).trim();
            const sp = attr.indexOf(' ');
            const val = sp > -1 ? attr.substring(0, sp) : attr;
            if (tagName[0] === 'c') obj.color = val;
            else obj.size = parseInt(val);
            if (sp > -1) obj.event = this._parseEvents(attr.substring(sp + 1).trim());
            return obj;
        }
        h = /^(br(\s)*\/)/.exec(attr);
        if (h && h[0].trim().endsWith('/')) {
            obj.isNewLine = true;
            this._result.push({ text: '', style: { isNewLine: true } });
            return obj;
        }
        h = /^sprite\s*=\s*/.exec(attr);
        if (h) {
            const rest = attr.substring(h[0].length).trim();
            const sizeMatch = /\s+size\s*=\s*(\d+(\.\d+)?)\s*$/.exec(rest);
            obj.spriteName = sizeMatch ? rest.substring(0, sizeMatch.index).trim() : rest;
            if (sizeMatch) obj.spriteSize = parseFloat(sizeMatch[1]);
            this._result.push({ text: '￼', style: obj });
            return obj;
        }
        h = /^(sup|sub)(\s)*$/.exec(attr);
        if (h) {
            obj.vAlign = h[1] === 'sup' ? 'top' : 'bottom';
            return obj;
        }
        h = /^(on|u|b|i)(\s)*/.exec(attr);
        if (h) {
            const tag = h[0].trim();
            attr = attr.substring(h[0].length).trim();
            if (tag === 'b') obj.bold = true;
            else if (tag === 'i') obj.italic = true;
            else if (tag === 'u') obj.underline = true;
            if (attr) obj.event = this._parseEvents(attr);
            return obj;
        }
        return obj;
    }

    private _parseEvents(ev: string): Record<string, string> {
        const obj: Record<string, string> = {};
        let match = _eventRegx.exec(ev);
        while (match) {
            let name = match[0];
            ev = ev.substring(name.length).trim();
            let value = '';
            let idx = 0;
            const q = ev.charAt(0);
            if (q === '"' || q === "'") {
                idx = ev.indexOf(q, 1);
                if (idx > -1) value = ev.substring(1, idx);
                idx++;
            } else {
                const m2 = /(\S)+/.exec(ev);
                value = m2 ? m2[0] : '';
                idx = value.length;
            }
            name = name.substring(0, name.length - 1).trim();
            obj[name] = value;
            ev = ev.substring(idx).trim();
            match = _eventRegx.exec(ev);
        }
        return obj;
    }

    private _pushText(text: string) {
        if (!text) return;
        for (const [rx, rep] of this._specialSymbols) text = text.replace(rx, rep);
        const style = this._stack.length > 0 ? this._stack[this._stack.length - 1] : undefined;
        this._result.push({ text, style });
    }
}

// ─── Layout ───────────────────────────────────────────────────────────────────

function applyTransform(text: string, transform: TextTransform): string {
    if (transform === TextTransform.UPPERCASE) return text.toUpperCase();
    if (transform === TextTransform.LOWERCASE) return text.toLowerCase();
    return text;
}

function trimLineHorizontal(
    line: ILine,
    maxW: number,
    addEllipsis: boolean,
    measure: ILayoutParams['measure'],
    fontScale: number,
): void {
    const { w: ellipsisW, h: ellipsisH } = addEllipsis ? measure('...', undefined, fontScale) : { w: 0, h: 0 };
    const targetW = maxW - ellipsisW;

    const words = [...line.words];
    let totalW = words.reduce((s, ww) => s + ww.w, 0);
    while (words.length > 0 && totalW > targetW) {
        totalW -= words[words.length - 1].w;
        words.pop();
    }
    if (words.length > 0) {
        const tail = { ...words[words.length - 1] };
        words[words.length - 1] = tail;
        const prefixW = totalW - tail.w;
        let txt = tail.text;
        while (txt.length > 0 && prefixW + measure(txt, tail.style, fontScale).w > targetW) {
            txt = txt.slice(0, -1);
        }
        if (txt) {
            const { w: tw, h: th } = measure(txt, tail.style, fontScale);
            tail.text = txt; tail.w = tw; tail.h = th;
        } else {
            words.pop();
        }
    }
    if (addEllipsis) words.push({ text: '...', style: undefined, w: ellipsisW, h: ellipsisH });
    line.words = words;
    line.lineW = words.reduce((s, ww) => s + ww.w, 0);
    line.lineH = words.reduce((mx, ww) => Math.max(mx, ww.h), 0);
}

export function buildLayout(p: ILayoutParams): ILayoutResult {
    const { segments, canvasW, canvasH, fontSize, lineHeight, lineSpacing,
            marginLeft: ml, marginRight: mr, marginTop: mt, marginBottom: mb,
            wordWrap, overflow, vAlign, textTransform, fontScale,
            measure, getSprite } = p;

    // 1. Flatten segments → tokens (split by word, handle sprites + newlines)
    const tokens: ITextSegment[] = [];
    for (const seg of segments) {
        if (seg.style?.isNewLine) { tokens.push(seg); continue; }
        if (seg.style?.spriteName) { tokens.push(seg); continue; }
        if (!seg.text) continue;

        const words = seg.text.match(/\s*\S+\s*/g);
        if (!words) {
            for (let i = tokens.length - 1; i >= 0; i--) {
                const prev = tokens[i];
                if (prev.text && !prev.style?.isNewLine) { prev.text = prev.text.replace(/\s+$/, '') + seg.text; break; }
            }
            continue;
        }
        if (words[0].charAt(0) === ' ') {
            let transferred = false;
            for (let i = tokens.length - 1; i >= 0; i--) {
                const prev = tokens[i];
                if (prev.style?.spriteName) break; // sprites ignore token.text; space cannot be absorbed
                if (prev.text && !prev.style?.isNewLine) { prev.text = prev.text.replace(/\s+$/, '') + ' '; transferred = true; break; }
            }
            if (transferred) words[0] = words[0].replace(/^\s+/, '');
        }
        for (const word of words) { if (word) tokens.push({ text: applyTransform(word, textTransform), style: seg.style }); }
    }

    // 2. Measure + line-break
    const maxW = canvasW - ml - mr;
    const areaH = canvasH - mt - mb;

    const lines: ILine[] = [];
    let cur: ILine = { words: [], lineW: 0, lineH: 0 };
    const pushLine = () => { if (cur.words.length > 0 || lines.length > 0) { lines.push(cur); cur = { words: [], lineW: 0, lineH: 0 }; } };

    for (const token of tokens) {
        if (token.style?.isNewLine) { pushLine(); continue; }

        if (token.style?.spriteName) {
            const dim = getSprite(token.style.spriteName);
            if (dim) {
                const sprH = (token.style.spriteSize ?? fontSize) * fontScale;
                const sprW = dim.height > 0 ? dim.width * sprH / dim.height : sprH;
                if (wordWrap && cur.lineW > 0 && cur.lineW + sprW > maxW) pushLine();
                cur.words.push({ text: '￼', style: token.style, w: sprW, h: sprH });
                cur.lineW += sprW;
                cur.lineH = Math.max(cur.lineH, sprH);
            }
            continue;
        }

        if (!token.text) continue;

        let text = token.text;
        const { w, h } = measure(text, token.style, fontScale);

        if (wordWrap && cur.lineW > 0 && cur.lineW + w > maxW) {
            pushLine();
            if (text.charAt(0) === ' ' && text.charAt(1) !== ' ') text = text.substring(1);
        }

        const finalW = text !== token.text ? measure(text, token.style, fontScale).w : w;
        cur.words.push({ text, style: token.style, w: finalW, h });
        cur.lineW += finalW;
        cur.lineH = Math.max(cur.lineH, h);
    }
    if (cur.words.length > 0) pushLine();

    // 3. Merge consecutive same-style words per line
    for (const line of lines) {
        const merged: IWordEntry[] = [];
        for (const word of line.words) {
            const prev = merged[merged.length - 1];
            if (prev && prev.style === word.style && !word.style?.spriteName) {
                prev.text += word.text;
                prev.w += word.w;
                if (word.h > prev.h) prev.h = word.h;
            } else {
                merged.push({ ...word });
            }
        }
        line.words = merged;
        line.lineW = merged.reduce((s, w) => s + w.w, 0);
    }

    // 4. Overflow handling
    if (overflow !== OverflowMode.NONE) {
        if (!wordWrap) {
            const maxLineW = lines.reduce((mx, l) => Math.max(mx, l.lineW), 0);
            if (maxLineW > maxW) {
                if (overflow === OverflowMode.SHRINK && fontScale === 1) {
                    return buildLayout({ ...p, fontScale: maxW / maxLineW });
                }
                if (overflow === OverflowMode.CLAMP || overflow === OverflowMode.TRUNCATE || overflow === OverflowMode.ELLIPSIS) {
                    for (const line of lines) {
                        if (line.lineW <= maxW) continue;
                        trimLineHorizontal(line, maxW, overflow === OverflowMode.ELLIPSIS, measure, fontScale);
                    }
                }
            }
        } else {
            const totalH = lines.length > 0
                ? lines.reduce((s, l) => s + l.lineH + lineSpacing, 0) - lineSpacing
                : 0;
            if (totalH > areaH && areaH > 0) {
                if (overflow === OverflowMode.SHRINK && fontScale === 1) {
                    const n = lines.length;
                    const totalLineH = lines.reduce((s, l) => s + l.lineH, 0);
                    const fixedSpacing = Math.max(0, n - 1) * lineSpacing;
                    const scale = totalLineH > 0 ? Math.max(0.01, (areaH - fixedSpacing) / totalLineH) : 0.01;
                    return buildLayout({ ...p, fontScale: scale });
                }
                if (overflow === OverflowMode.CLAMP || overflow === OverflowMode.TRUNCATE || overflow === OverflowMode.ELLIPSIS) {
                    const visible: ILine[] = [];
                    let accH = 0;
                    for (const line of lines) {
                        const nextH = accH + (visible.length > 0 ? lineSpacing : 0) + line.lineH;
                        if (nextH > areaH && visible.length > 0) break;
                        visible.push(line);
                        accH = nextH;
                    }
                    if (overflow === OverflowMode.ELLIPSIS && visible.length > 0) {
                        trimLineHorizontal(visible[visible.length - 1], maxW, true, measure, fontScale);
                    }
                    lines.length = 0;
                    for (const l of visible) lines.push(l);
                }
            }
        }
    }

    // 5. Vertical alignment offset
    const clampedTotalH = lines.length > 0
        ? lines.reduce((s, l) => s + l.lineH + lineSpacing, 0) - lineSpacing
        : 0;
    const lastLine = lines.length > 0 ? lines[lines.length - 1] : null;
    const lastLineTextH = lastLine && lastLine.words.length > 0
        ? lastLine.words.reduce((mx, w) => Math.max(mx, (w.style?.size ?? fontSize) * fontScale), 0)
        : (lastLine?.lineH ?? 0);
    const alignH = lastLine ? clampedTotalH - lastLine.lineH + lastLineTextH : 0;
    let vOffset = 0;
    if (vAlign === VAlign.CENTER) vOffset = (areaH - alignH) / 2;
    else if (vAlign === VAlign.BOTTOM) vOffset = areaH - alignH;

    return { lines, vOffset, maxW, fontScale };
}

// ─── Per-word baseline Y ──────────────────────────────────────────────────────

/**
 * Compute the canvas Y (alphabetic baseline) for drawing a word inside a line box.
 * @param lineTop   top edge of the line box (canvas Y, top-down)
 * @param lineH     height of the line box
 * @param wordAscent  fontAscent(wordSize) – distance from line-top to baseline for THIS word
 * @param lineAscent  fontAscent(maxSizeOnLine) – shared baseline ascent for the line
 * @param vAlign    vertical alignment from ITextStyle.vAlign
 */
export function wordBaselineY(
    lineTop: number,
    lineH: number,
    wordAscent: number,
    lineAscent: number,
    wordH: number,
    vAlign: ITextStyle['vAlign'],
): number {
    if (vAlign === 'top')    return lineTop + wordAscent;
    if (vAlign === 'bottom') return lineTop + lineH + wordAscent - wordH / 2;
    return lineTop + lineAscent;
}
