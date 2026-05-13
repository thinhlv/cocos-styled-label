import {
    _decorator, UIRenderer, SpriteFrame, SpriteAtlas, Texture2D, Font, BitmapFont,
    Color, Rect, Enum, RenderData, BitMask, Node, view,
} from 'cc';
import { EDITOR } from 'cc/env';
import {
    HAlign, VAlign, OverflowMode, TextTransform,
    HtmlTextParser, buildLayout, wordBaselineY,
} from './styled-label.layout';
import type { ITextSegment, ILayoutResult } from './styled-label.layout';
import {
    StyledLabelMargin, StyledLabelSpacing, StyledLabelAlign,
    _quadAssembler, _bmAssembler,
    _localVertUpdate, _uvUpdate, _colorUpdate, _bmApplyNodeColor,
} from './styled-label.assembler';
import type { IBMGlyph, IBMFntConfig, IBMQuadInfo } from './styled-label.assembler';
import { ISpriteRenderer, WebSpriteRenderer, NativeSpriteRenderer } from './styled-label.sprite-renderer';

export { StyledLabelMargin, StyledLabelSpacing, StyledLabelAlign };

const { ccclass, property, executeInEditMode } = _decorator;

Enum(HAlign);
Enum(VAlign);
Enum(OverflowMode);
Enum(TextTransform);

const WatchProp = BitMask({
    String:      1 << 0,
    Font:        1 << 1,
    FontSize:    1 << 2,
    LineHeight:  1 << 3,
    Color:       1 << 4,
    Align:       1 << 5,
    Margin:      1 << 6,
    Spacing:     1 << 7,
    Overflow:    1 << 8,
    WordWrap:    1 << 9,
    Transform:   1 << 10,
    SpriteAtlas: 1 << 11,
});

// ─── StyledLabel ──────────────────────────────────────────────────────────────

/**
 * Single-canvas rich text label for TTF/system fonts.
 * For BitmapFont, renders per-glyph GPU quads using the font atlas texture directly.
 *
 * Markup: <color=#hex>  <size=N>  <b>  <i>  <u>  <br/>  <sprite=name>  <sprite=name size=32>
 */
@ccclass('StyledLabel')
@executeInEditMode
export class StyledLabel extends UIRenderer {

    @property({ type: WatchProp, displayName: 'Watch Props' })
    public watchProps: number = WatchProp.String;

    @property({ type: Font, visible: false })
    private _font: Font | null = null;
    @property(Font)
    get font(): Font | null { return this._font; }
    set font(v: Font | null) {
        if (this._font === v) return;
        this._font = v;
        StyledLabel._measureCache.clear();
        if (!EDITOR) { this._cFontUuid = v?.uuid ?? ''; this._contentDirty = true; this._flushAssembler(); this.markForUpdateRenderData(true); }
    }

    @property({ visible: false })
    private _fontSize: number = 24;
    @property
    get fontSize(): number { return this._fontSize; }
    set fontSize(v: number) {
        if (this._fontSize === v) return;
        this._fontSize = v;
        if (!EDITOR) { this._cFontSize = v; this._contentDirty = true; this.markForUpdateRenderData(true); }
    }

    @property({ visible: false })
    private _lineHeightVal: number = 40;
    @property
    get lineHeight(): number { return this._lineHeightVal; }
    set lineHeight(v: number) {
        if (this._lineHeightVal === v) return;
        this._lineHeightVal = v;
        if (!EDITOR) { this._cLineHeight = v; this._contentDirty = true; this.markForUpdateRenderData(true); }
    }

    @property({ type: TextTransform, visible: false })
    private _textTransform: TextTransform = TextTransform.NONE;
    @property({ type: TextTransform })
    get textTransform(): TextTransform { return this._textTransform; }
    set textTransform(v: TextTransform) {
        if (this._textTransform === v) return;
        this._textTransform = v;
        if (!EDITOR) { this._cTransform = v; this._contentDirty = true; this.markForUpdateRenderData(true); }
    }

    @property({ type: OverflowMode, visible: false })
    private _overflow: OverflowMode = OverflowMode.NONE;
    @property({ type: OverflowMode })
    get overflow(): OverflowMode { return this._overflow; }
    set overflow(v: OverflowMode) {
        if (this._overflow === v) return;
        this._overflow = v;
        if (!EDITOR) { this._cOverflow = v; this._contentDirty = true; this.markForUpdateRenderData(true); }
    }

    @property({ visible: false })
    private _wordWrap: boolean = true;
    @property
    get wordWrap(): boolean { return this._wordWrap; }
    set wordWrap(v: boolean) {
        if (this._wordWrap === v) return;
        this._wordWrap = v;
        if (!EDITOR) { this._cWordWrap = v; this._contentDirty = true; this.markForUpdateRenderData(true); }
    }

    @property
    public defaultColor: Color = new Color(255, 255, 255, 255);

    @property({ type: SpriteAtlas, visible: false })
    private _spriteAtlas: SpriteAtlas | null = null;
    @property({ type: SpriteAtlas })
    get spriteAtlas(): SpriteAtlas | null { return this._spriteAtlas; }
    set spriteAtlas(v: SpriteAtlas | null) {
        if (this._spriteAtlas === v) return;
        this._spriteAtlas = v;
        this._cAtlasUuid = v?.uuid ?? '';
        this._contentDirty = true;
        this.markForUpdateRenderData(true);
    }

    @property({ visible: false })
    private _htmlString: string = '';
    @property({ multiline: true, visible: true, displayName: 'String' })
    get string(): string { return this._htmlString; }
    set string(v: string) {
        this._htmlString = v;
        this._contentDirty = true;
        this.markForUpdateRenderData(true);
    }

    @property({ displayName: 'Reload', visible: true })
    get reload(): boolean { return false; }
    set reload(_: boolean) {
        (this as any)._assembler = null;
        if (this._renderData) {
            (this as any).destroyRenderData?.();
            (this as any)._renderData = null;
        }
        if (!(this.font instanceof BitmapFont)) {
            if (this._offTex) { this._offTex.destroy(); this._offTex = null; }
            this._offCanvas = null;
            this._offCtx = null;
            this._offFrame = null;
        }
        this._spriteRenderer = null;
        this._prevW = 0;
        this._prevH = 0;
        this._contentDirty = true;
        this._flushAssembler();
        this.markForUpdateRenderData(true);
    }

    @property(StyledLabelAlign)  public align: StyledLabelAlign = new StyledLabelAlign();
    @property(StyledLabelMargin) public margin: StyledLabelMargin = new StyledLabelMargin();
    @property(StyledLabelSpacing) public spacing: StyledLabelSpacing = new StyledLabelSpacing();

    // ── TTF canvas resources ──────────────────────────────────────────────────

    // Public — accessed by _uvUpdate in styled-label.assembler.ts.
    public _offFrame: SpriteFrame | null = null;
    private _offTex: Texture2D | null = null;
    private _offCanvas: HTMLCanvasElement | null = null;
    private _offCtx: CanvasRenderingContext2D | null = null;
    private _prevW = 0;
    private _prevH = 0;
    public _spriteRenderer: ISpriteRenderer | null = null;

    // ── BM GPU resources ──────────────────────────────────────────────────────

    // Public — accessed by _bmApplyNodeColor in styled-label.assembler.ts.
    public _bmQuads: IBMQuadInfo[] = [];
    private _bmSpriteFrame: SpriteFrame | null = null;

    // ── Shared state ──────────────────────────────────────────────────────────

    private _contentDirty  = true;
    private _adjustingSize = false;
    private _resizeHooked  = false;
    private _editorW = 0;
    private _editorH = 0;

    // ── Dirty-detection cache ─────────────────────────────────────────────────

    private _cFontUuid    = '';
    private _cFontSize    = 24;
    private _cLineHeight  = 40;
    private _cColorR = 255; private _cColorG = 255; private _cColorB = 255; private _cColorA = 255;
    private _cAlignH = HAlign.LEFT; private _cAlignV = VAlign.TOP;
    private _cMarginL = 0; private _cMarginR = 0; private _cMarginT = 0; private _cMarginB = 0;
    private _cSpacingLine = 0;
    private _cOverflow    = OverflowMode.NONE;
    private _cWordWrap    = true;
    private _cTransform   = TextTransform.NONE;
    private _cAtlasUuid   = '';

    private _parser = new HtmlTextParser();
    private _parsedHtml = '';
    private _parsedResult: ITextSegment[] = [];

    // ── Shared measurement canvas ─────────────────────────────────────────────

    private static _mCtx: CanvasRenderingContext2D | null = null;
    private static _getMCtx(): CanvasRenderingContext2D {
        if (!StyledLabel._mCtx) StyledLabel._mCtx = document.createElement('canvas').getContext('2d')!;
        return StyledLabel._mCtx;
    }
    private static _measureCache = new Map<string, number>();
    private static readonly _MEASURE_CACHE_MAX = 512;

    // ── Property accessors ────────────────────────────────────────────────────

    get marginLeft(): number  { return this.margin?.left   ?? 0; }
    get marginRight(): number { return this.margin?.right  ?? 0; }
    get marginTop(): number   { return this.margin?.top    ?? 0; }
    get marginBottom(): number{ return this.margin?.bottom ?? 0; }
    get lineSpacing(): number { return this.spacing?.line  ?? 0; }
    get hAlign(): HAlign      { return this.align?.horizontal ?? HAlign.LEFT; }
    get vAlign(): VAlign      { return this.align?.vertical   ?? VAlign.TOP;  }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    onLoad(): void {
        super.onLoad();
        this.node.on(Node.EventType.SIZE_CHANGED, this._onNodeSizeChanged, this);
        if (!(this.font instanceof BitmapFont)) this._initCanvas();
    }

    onEnable(): void {
        // Destroy canvas before super.onEnable so _doUpdate creates a fresh Texture2D.
        if (!(this.font instanceof BitmapFont)) {
            if (this._offTex) { this._offTex.destroy(); this._offTex = null; }
            this._offCanvas = null;
            this._offCtx = null;
            this._offFrame = null;
            this._spriteRenderer = null;
        } else {
            this._spriteRenderer?.reset();
        }
        if (!this._resizeHooked) {
            view.on('resize', this._onScreenResize, this);
            this._resizeHooked = true;
        }
        super.onEnable?.();
        this._contentDirty = true;
        this._prevW = 0;
        this._prevH = 0;
        this.markForUpdateRenderData(true);
    }

    onDisable(): void {
        if (this._resizeHooked) {
            view.off('resize', this._onScreenResize, this);
            this._resizeHooked = false;
        }
    }

    onDestroy(): void {
        this.node.off(Node.EventType.SIZE_CHANGED, this._onNodeSizeChanged, this);
        this._offCanvas = null;
        this._offCtx = null;
        if (this._offTex) { this._offTex.destroy(); this._offTex = null; }
        this._offFrame = null;
        this._spriteRenderer = null;
        this._bmQuads = [];
        this._bmSpriteFrame = null;
        super.onDestroy();
    }

    private _onNodeSizeChanged(): void {
        if (this._adjustingSize) return;
        this._contentDirty = true;
        this.markForUpdateRenderData(true);
    }

    private _onScreenResize(): void {
        if (!(this.font instanceof BitmapFont)) {
            if (this._offTex) { this._offTex.destroy(); this._offTex = null; }
            this._offCanvas = null;
            this._offCtx = null;
            this._offFrame = null;
            this._spriteRenderer = null;
        }
        this._contentDirty = true;
        this._prevW = 0;
        this._prevH = 0;
        this.markForUpdateRenderData(true);
    }

    update(_dt: number): void {
        const flags = EDITOR ? ~0 : this.watchProps;
        if (flags !== 0 && this._checkDirty(flags)) {
            this._updateCache(flags);
            this._contentDirty = true;
            if (EDITOR) { this.reload = true; } else { this.markForUpdateRenderData(true); }
        }
        if (EDITOR) {
            const tf = (this.node as any)._getUITransformComp?.();
            if (tf) {
                const w = Math.ceil(tf.width), h = Math.ceil(tf.height);
                if (w !== this._editorW || h !== this._editorH) {
                    this._editorW = w; this._editorH = h;
                    this._contentDirty = true;
                    this.reload = true;
                }
            }
        }
    }

    public markDirty(): void {
        this._contentDirty = true;
        if (EDITOR) { this.reload = true; } else { this.markForUpdateRenderData(true); }
    }

    // ── Renderer overrides ────────────────────────────────────────────────────

    protected _flushAssembler(): void {
        const isBM = this.font instanceof BitmapFont;
        const target = isBM ? _bmAssembler : _quadAssembler;
        if (this._assembler !== target) {
            this._assembler = target;
            if (this._renderData) {
                (this as any).destroyRenderData?.();
                (this as any)._renderData = null;
                this._prevW = 0;
                this._prevH = 0;
            }
        }
        if (!this._renderData) {
            target.createData(this);
            (this._renderData as RenderData).material = this.getRenderMaterial(0);
            if (!isBM) _colorUpdate(this);
            this.markForUpdateRenderData();
        }
    }

    protected _render(render: any): void {
        if (this.font instanceof BitmapFont) {
            render.commitComp(this, this._renderData, this._bmSpriteFrame, this._assembler, null);
            // Commit overlay sprites (inline sprites) — works in both editor scene view and web play mode.
            // On native JSB (_render is bypassed), NativeSpriteRenderer.endFrame() registers overlay via rd.updateRenderData().
            const spr = this._spriteRenderer;
            if (spr?.overlayRenderData && spr.overlayFrame && spr.overlayAssembler) {
                render.commitComp(this, spr.overlayRenderData, spr.overlayFrame, spr.overlayAssembler, null);
            }
        } else {
            render.commitComp(this, this._renderData, this._offFrame, this._assembler, null);
            // Overlay sprites are committed inside _quadAssembler.fillBuffers via the renderer param.
            // That path works on both web and native JSB (where _render overrides are bypassed).
        }
    }

    protected _canRender(): boolean {
        if (!super._canRender()) return false;
        if (this.font instanceof BitmapFont) {
            return !!(this._bmSpriteFrame?.texture?.getGFXTexture()) && this._bmQuads.length > 0;
        }
        return !!(this._offFrame?.texture?.getGFXTexture());
    }



    public _doUpdate(force?: boolean): void {
        const tf = (this.node as any)._getUITransformComp();
        if (!tf) return;

        let w = Math.ceil(tf.width) || 1;
        let h = Math.ceil(tf.height) || 1;
        let cachedLayout: ILayoutResult | null = null;

        if (this.overflow === OverflowMode.NONE && this._contentDirty) {
            cachedLayout = this._buildLayout(w, h);
            if (!this.wordWrap) {
                const contentW = cachedLayout.lines.reduce((mx, l) => Math.max(mx, l.lineW), 0);
                const reqW = Math.max(1, Math.ceil(contentW + this.marginLeft + this.marginRight));
                if (Math.ceil(tf.width) !== reqW) { this._adjustingSize = true; tf.width = reqW; this._adjustingSize = false; w = reqW; cachedLayout = null; }
            } else {
                const contentH = cachedLayout.lines.length > 0
                    ? cachedLayout.lines.reduce((s, l) => s + l.lineH + this.lineSpacing, 0) - this.lineSpacing
                    : 0;
                const minH = Math.ceil(this._lineHeight(this.fontSize));
                const reqH = Math.max(minH, Math.ceil(contentH + this.marginTop + this.marginBottom));
                if (Math.ceil(tf.height) !== reqH) { this._adjustingSize = true; tf.height = reqH; this._adjustingSize = false; h = reqH; cachedLayout = null; }
            }
        }

        if (this.font instanceof BitmapFont) { this._doBMUpdate(w, h, cachedLayout); return; }

        if (!this._offCanvas || !this._offCtx || !this._offTex || !this._offFrame) {
            this._initCanvas();
            if (!this._offCanvas || !this._offCtx || !this._offTex || !this._offFrame) return;
        }

        // Base text diacritic padding (only for TOP vAlign).
        const textPad = this.vAlign === VAlign.TOP
            ? Math.max(0, Math.ceil(this.fontSize * 0.15) - this.marginTop)
            : 0;
        // Extra canvas space needed so sprites whose height > fontAscent don't clip
        // above the canvas. For each sprite on the first line: required gap =
        // (sprH - lineAscent). Subtract vOffset since CENTER/BOTTOM alignment
        // already shifts the line down by that amount.
        let spritePad = 0;
        if (cachedLayout && this._spriteAtlas) {
            const firstLine = cachedLayout.lines[0];
            if (firstLine) {
                const maxSz = firstLine.words.reduce(
                    (mx, ww) => Math.max(mx, (ww.style?.size ?? this.fontSize) * cachedLayout!.fontScale),
                    this.fontSize * cachedLayout.fontScale,
                );
                const lAsc = this._fontAscent(maxSz);
                for (const word of firstLine.words) {
                    if (word.style?.spriteName) spritePad = Math.max(spritePad, word.h - lAsc);
                }
                spritePad = Math.max(0, spritePad - cachedLayout.vOffset);
            }
        }
        const diacriticPad = Math.max(textPad, spritePad);
        const canvasH = h + diacriticPad;

        const sizeChanged = w !== this._prevW || canvasH !== this._prevH;
        const needDraw = this._contentDirty || sizeChanged || !!force;

        if (sizeChanged || !this._offTex.getGFXTexture()) {
            this._prevW = w;
            this._prevH = canvasH;
            this._offCanvas.width = w;
            this._offCanvas.height = canvasH;
            // Destroy and create a new Texture2D instead of reset() on the same object.
            // Cocos batcher caches DescriptorSets by Texture2D object identity — calling
            // reset() swaps the internal GFX texture but the batcher keeps the old
            // DescriptorSet (bound to the now-destroyed GFX texture) → black quad.
            // A new object forces the batcher to build a fresh DescriptorSet.
            this._offTex.destroy();
            this._offTex = new Texture2D();
            this._offTex.reset({ width: w, height: canvasH, format: Texture2D.PixelFormat.RGBA8888 });
            this._offFrame = new SpriteFrame();
            this._offFrame.packable = false;
            this._offFrame.texture = this._offTex;
            this._offFrame.rect = new Rect(0, 0, w, canvasH);
            _localVertUpdate(this, diacriticPad);
            const rd = this._renderData as RenderData;
            if (rd) rd.textureDirty = true;
            cachedLayout = null;
        }

        if (!this._offTex.getGFXTexture()) {
            this.markForUpdateRenderData(true); return;
        }

        if (needDraw) {
            this._offCtx.clearRect(0, 0, w, canvasH);
            this._spriteRenderer?.beginFrame(tf.anchorX, tf.anchorY, w, canvasH);
            if (this._htmlString) this._drawContent(w, h, diacriticPad, cachedLayout);
            this._offTex.uploadData(this._offCanvas);
            _uvUpdate(this);
            _colorUpdate(this);
            this._spriteRenderer?.endFrame();
            this._contentDirty = false;
        }

        const rd = this._renderData as RenderData;
        if (rd) rd.updateRenderData(this, this._offFrame);
    }

    updateRenderData(force?: boolean): void {
        if (force) this._contentDirty = true;
        this._doUpdate(force);
    }

    public applyFont(font: Font): void {
        this.font = font;
        if (EDITOR) { this._contentDirty = true; this.reload = true; }
    }

    // ── Private: canvas init ──────────────────────────────────────────────────

    private _initCanvas(): void {
        this._offCanvas = document.createElement('canvas');
        this._offCanvas.width = 1;
        this._offCanvas.height = 1;
        this._offCtx = this._offCanvas.getContext('2d')!;

        const hasDrawImage = typeof (this._offCtx as any).drawImage === 'function';
        this._spriteRenderer = hasDrawImage
            ? new WebSpriteRenderer(this._offCtx)
            : new NativeSpriteRenderer(this, () => {
                // requestRenderData overwrites this._renderData — save and restore.
                const saved = this._renderData;
                const rd = this.requestRenderData() as RenderData;
                (this as any)._renderData = saved;
                return rd;
            });

        this._offTex = new Texture2D();
        this._offTex.reset({ width: 1, height: 1, format: Texture2D.PixelFormat.RGBA8888 });
        this._offFrame = new SpriteFrame();
        this._offFrame.packable = false;
        this._offFrame.texture = this._offTex;
        this._offFrame.rect = new Rect(0, 0, 1, 1);
    }

    // ── Private: dirty detection ──────────────────────────────────────────────

    private _checkDirty(flags: number): boolean {
        if (flags & WatchProp.Font       && (this._font?.uuid ?? '') !== this._cFontUuid)  return true;
        if (flags & WatchProp.FontSize   && this._fontSize           !== this._cFontSize)  return true;
        if (flags & WatchProp.LineHeight && this._lineHeightVal      !== this._cLineHeight) return true;
        if (flags & WatchProp.Color) {
            const c = this.defaultColor;
            if (c.r !== this._cColorR || c.g !== this._cColorG || c.b !== this._cColorB || c.a !== this._cColorA) return true;
        }
        if (flags & WatchProp.Align) {
            if ((this.align?.horizontal ?? 0) !== this._cAlignH || (this.align?.vertical ?? 0) !== this._cAlignV) return true;
        }
        if (flags & WatchProp.Margin) {
            if (this.marginLeft !== this._cMarginL || this.marginRight !== this._cMarginR ||
                this.marginTop  !== this._cMarginT || this.marginBottom !== this._cMarginB) return true;
        }
        if (flags & WatchProp.Spacing    && this.lineSpacing          !== this._cSpacingLine) return true;
        if (flags & WatchProp.Overflow   && this._overflow            !== this._cOverflow)    return true;
        if (flags & WatchProp.WordWrap   && this._wordWrap            !== this._cWordWrap)    return true;
        if (flags & WatchProp.Transform  && this._textTransform       !== this._cTransform)   return true;
        if (flags & WatchProp.SpriteAtlas && (this._spriteAtlas?.uuid ?? '') !== this._cAtlasUuid) return true;
        return false;
    }

    private _updateCache(flags: number): void {
        if (flags & WatchProp.Font)       this._cFontUuid   = this._font?.uuid ?? '';
        if (flags & WatchProp.FontSize)   this._cFontSize   = this._fontSize;
        if (flags & WatchProp.LineHeight) this._cLineHeight = this._lineHeightVal;
        if (flags & WatchProp.Color) {
            const c = this.defaultColor;
            this._cColorR = c.r; this._cColorG = c.g; this._cColorB = c.b; this._cColorA = c.a;
        }
        if (flags & WatchProp.Align) {
            this._cAlignH = this.align?.horizontal ?? 0;
            this._cAlignV = this.align?.vertical   ?? 0;
        }
        if (flags & WatchProp.Margin) {
            this._cMarginL = this.marginLeft;  this._cMarginR = this.marginRight;
            this._cMarginT = this.marginTop;   this._cMarginB = this.marginBottom;
        }
        if (flags & WatchProp.Spacing)    this._cSpacingLine = this.lineSpacing;
        if (flags & WatchProp.Overflow)   this._cOverflow    = this._overflow;
        if (flags & WatchProp.WordWrap)   this._cWordWrap    = this._wordWrap;
        if (flags & WatchProp.Transform)  this._cTransform   = this._textTransform;
        if (flags & WatchProp.SpriteAtlas) this._cAtlasUuid  = this._spriteAtlas?.uuid ?? '';
    }

    // ── Private: measurement ──────────────────────────────────────────────────

    private _getFontFamily(): string {
        return (this.font && !(this.font instanceof BitmapFont)) ? `${this.font.name}_LABEL` : 'Arial';
    }

    private _measureTTF(text: string, size: number, bold: boolean, italic: boolean): number {
        const family = this._getFontFamily();
        const key = `${family}\0${bold ? 1 : 0}${italic ? 1 : 0}${size}\0${text}`;
        const cached = StyledLabel._measureCache.get(key);
        if (cached !== undefined) return cached;
        const ctx = StyledLabel._getMCtx();
        ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px "${family}"`;
        const w = ctx.measureText(text).width;
        if (StyledLabel._measureCache.size >= StyledLabel._MEASURE_CACHE_MAX)
            StyledLabel._measureCache.delete(StyledLabel._measureCache.keys().next().value!);
        StyledLabel._measureCache.set(key, w);
        return w;
    }

    private _measureBitmap(text: string, font: BitmapFont, size: number): number {
        const cfg = (font as any).fntConfig as IBMFntConfig | undefined;
        if (!cfg?.fontDefDictionary) return 0;
        const native = cfg.commonHeight || cfg.fontSize || size;
        const scale = native > 0 ? size / native : 1;
        let w = 0;
        for (let i = 0; i < text.length; i++) {
            const g = cfg.fontDefDictionary[text.charCodeAt(i)];
            if (g) w += g.xAdvance * scale;
        }
        return w;
    }

    private _fontAscent(size: number, bold = false, italic = false): number {
        const family = this._getFontFamily();
        const key = `fa\0${family}\0${bold ? 1 : 0}${italic ? 1 : 0}${size}`;
        const hit = StyledLabel._measureCache.get(key);
        if (hit !== undefined) return hit;
        const ctx = StyledLabel._getMCtx();
        ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px "${family}"`;
        ctx.textBaseline = 'alphabetic';
        const m = ctx.measureText('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789');
        const fba = (m as any).fontBoundingBoxAscent as number | undefined;
        // Use fontBoundingBoxAscent when it is within the em-square (system fonts, fba ≤ size).
        // Some TTF fonts declare fba > fontSize (inflated); fall back to actualBoundingBoxAscent.
        const v = (fba !== undefined && fba <= size) ? fba : (m.actualBoundingBoxAscent ?? size * 0.8);
        if (StyledLabel._measureCache.size >= StyledLabel._MEASURE_CACHE_MAX)
            StyledLabel._measureCache.delete(StyledLabel._measureCache.keys().next().value!);
        StyledLabel._measureCache.set(key, v);
        return v;
    }

    private _lineHeight(size: number, scale = 1): number {
        if (this.lineHeight > 0) return this.lineHeight * scale;
        if (this.font instanceof BitmapFont) {
            const cfg = (this.font as any).fntConfig as IBMFntConfig | undefined;
            if (cfg?.commonHeight) {
                const native = cfg.commonHeight || cfg.fontSize || size;
                return cfg.commonHeight * (size / native);
            }
        }
        return size * 1.2;
    }

    // ── Private: layout ───────────────────────────────────────────────────────

    private _buildLayout(canvasW: number, canvasH: number, fontScale = 1): ILayoutResult {
        let segments: ITextSegment[];
        if (!this._htmlString.includes('<')) {
            segments = this._htmlString ? [{ text: this._htmlString }] : [];
        } else {
            if (this._htmlString !== this._parsedHtml) {
                this._parsedResult = this._parser.parse(this._htmlString);
                this._parsedHtml   = this._htmlString;
            }
            segments = this._parsedResult;
        }
        return buildLayout({
            segments, canvasW, canvasH,
            fontSize: this.fontSize, lineHeight: this._lineHeightVal,
            marginLeft: this.marginLeft, marginRight: this.marginRight,
            marginTop: this.marginTop, marginBottom: this.marginBottom,
            lineSpacing: this.lineSpacing,
            wordWrap: this._wordWrap, overflow: this._overflow,
            vAlign: this.vAlign, textTransform: this._textTransform, fontScale,
            measure: (text, style, fs) => {
                const size = (style?.size ?? this.fontSize) * fs;
                const w = this.font instanceof BitmapFont
                    ? this._measureBitmap(text, this.font, size)
                    : this._measureTTF(text, size, style?.bold ?? false, style?.italic ?? false);
                return { w, h: this._lineHeight(size, fs) };
            },
            getSprite: (name) => {
                const frame = this._spriteAtlas?.getSpriteFrame(name);
                return frame ? { width: frame.rect.width, height: frame.rect.height } : null;
            },
        });
    }

    // ── Private: BitmapFont GPU path ──────────────────────────────────────────

    private _doBMUpdate(w: number, h: number, layout: ILayoutResult | null): void {
        const font = this.font as BitmapFont;
        const sf = font.spriteFrame;
        if (!sf) return;

        this._bmSpriteFrame = sf;
        const tf = (this.node as any)._getUITransformComp()!;
        const ax = tf.anchorX, ay = tf.anchorY;

        const sizeChanged = w !== this._prevW || h !== this._prevH;
        if (!this._contentDirty && !sizeChanged) {
            const rd = this._renderData as RenderData;
            if (rd) rd.updateRenderData(this, sf);
            return;
        }
        this._prevW = w;
        this._prevH = h;
        if (!this._spriteRenderer) {
            this._spriteRenderer = new NativeSpriteRenderer(this, () => {
                const saved = this._renderData;
                const rd = this.requestRenderData() as RenderData;
                (this as any)._renderData = saved;
                return rd;
            });
        }
        this._spriteRenderer.beginFrame(ax, ay, w, h);
        this._bmQuads = this._htmlString ? this._buildBMQuads(w, h, ax, ay, layout) : [];
        this._spriteRenderer.endFrame();
        console.log(`[StyledLabel BM] endFrame overlay=${this._spriteRenderer.overlayRenderData ? 'yes' : 'no'}`);
        this._contentDirty = false;

        const vCount = this._bmQuads.length * 4;
        const iCount = this._bmQuads.length * 6;
        let rd = this._renderData as RenderData;
        if (!rd) {
            rd = _bmAssembler.createData(this);
            (rd as any).material = this.getRenderMaterial(0);
            this._renderData = rd;
        }

        if (rd.vertexCount !== vCount) {
            rd.dataLength = vCount;
            rd.resize(vCount, iCount);
            if (vCount > 0) {
                const indices = new Uint16Array(iCount);
                let o = 0;
                for (let q = 0; q < this._bmQuads.length; q++) {
                    indices[o++] = q * 4; indices[o++] = q * 4 + 1; indices[o++] = q * 4 + 2;
                    indices[o++] = q * 4 + 1; indices[o++] = q * 4 + 3; indices[o++] = q * 4 + 2;
                }
                (rd as any).chunk.setIndexBuffer(indices);
            }
        }

        if (vCount > 0) {
            const data = rd.data;
            const vb = (rd as any).chunk.vb as Float32Array;
            const stride = rd.floatStride;
            for (let q = 0; q < this._bmQuads.length; q++) {
                const qi = this._bmQuads[q];
                const base = q * 4;
                data[base].x = qi.xl;     data[base].y = qi.yb;
                data[base+1].x = qi.xr;   data[base+1].y = qi.yb;
                data[base+2].x = qi.xl;   data[base+2].y = qi.yt;
                data[base+3].x = qi.xr;   data[base+3].y = qi.yt;
                // UV: BL(u0,v1)  BR(u1,v1)  TL(u0,v0)  TR(u1,v0)
                vb[base*stride+3] = qi.u0;     vb[base*stride+4] = qi.v1;
                vb[(base+1)*stride+3] = qi.u1; vb[(base+1)*stride+4] = qi.v1;
                vb[(base+2)*stride+3] = qi.u0; vb[(base+2)*stride+4] = qi.v0;
                vb[(base+3)*stride+3] = qi.u1; vb[(base+3)*stride+4] = qi.v0;
            }
            _bmApplyNodeColor(this);
            rd.vertDirty = true;
        }
        rd.updateRenderData(this, sf);
    }

    private _buildBMQuads(canvasW: number, canvasH: number, anchorX: number, anchorY: number, layout: ILayoutResult | null): IBMQuadInfo[] {
        const font = this.font as BitmapFont;
        const cfg = (font as any).fntConfig as IBMFntConfig | undefined;
        if (!cfg?.fontDefDictionary) return [];
        const sf = font.spriteFrame;
        if (!sf) return [];

        const texW = (sf.texture as Texture2D)?.width || sf.width || 1;
        const texH = (sf.texture as Texture2D)?.height || sf.height || 1;
        const nativeSize = cfg.commonHeight || cfg.fontSize || this.fontSize;
        const nativeBase = cfg.base ?? nativeSize;

        const { lines, maxW, fontScale } = layout ?? this._buildLayout(canvasW, canvasH);
        const quads: IBMQuadInfo[] = [];
        const ml = this.marginLeft, mt = this.marginTop;

        // Compute visual bounding box of all glyphs at native scale.
        // vOffset from buildLayout() assumes visual height = fontSize, which is wrong for
        // BitmapFont where glyph height can differ significantly from lineHeight.
        let nativeVisTop = Infinity, nativeVisBtm = -Infinity;
        for (const code in cfg.fontDefDictionary) {
            const g = cfg.fontDefDictionary[+code] as IBMGlyph;
            if (g.rect.height === 0) continue;
            if (g.yOffset < nativeVisTop) nativeVisTop = g.yOffset;
            const b = g.yOffset + g.rect.height;
            if (b > nativeVisBtm) nativeVisBtm = b;
        }
        if (!isFinite(nativeVisTop)) { nativeVisTop = 0; nativeVisBtm = nativeSize; }
        const defaultScale = this.fontSize * fontScale / (nativeSize || 1);
        const visTop = nativeVisTop * defaultScale;
        const visBtm = nativeVisBtm * defaultScale;
        const areaH = canvasH - mt - this.marginBottom;
        // leadingLogH: total line-box height of all lines except the last (incl. spacing).
        const leadingLogH = lines.slice(0, -1).reduce((s, l) => s + l.lineH + this.lineSpacing, 0);
        let lineY: number;
        if (this.vAlign === VAlign.TOP) {
            lineY = mt - visTop;
        } else if (this.vAlign === VAlign.BOTTOM) {
            lineY = mt + areaH - leadingLogH - visBtm;
        } else {
            lineY = mt + (areaH - visTop - leadingLogH - visBtm) / 2;
        }

        for (let li = 0; li < lines.length; li++) {
            const line = lines[li];
            let lineMaxScale = 0;
            for (let i = 0; i < line.words.length; i++) {
                const ws = ((line.words[i].style?.size ?? this.fontSize) * fontScale) / (nativeSize || 1);
                if (ws > lineMaxScale) lineMaxScale = ws;
            }

            let startX = ml;
            if (this.hAlign === HAlign.CENTER) startX = ml + (maxW - line.lineW) / 2;
            else if (this.hAlign === HAlign.RIGHT) startX = ml + maxW - line.lineW;

            let curX = startX;
            for (let i = 0; i < line.words.length; i++) {
                const word = line.words[i];
                if (word.style?.spriteName) {
                    const frame = this._spriteAtlas?.getSpriteFrame(word.style.spriteName);
                    console.log(`[StyledLabel BM] sprite "${word.style.spriteName}" frame=${!!frame} renderer=${!!this._spriteRenderer}`);
                    if (frame && this._spriteRenderer) {
                        const wordScale = nativeSize > 0
                            ? ((word.style?.size ?? this.fontSize) * fontScale) / nativeSize
                            : 1;
                        const drawY = wordBaselineY(
                            lineY, line.lineH,
                            nativeBase * wordScale,
                            nativeBase * lineMaxScale,
                            word.h, word.style.vAlign,
                        );
                        const offsetPx = (word.style.spriteOffsetY ?? 0) * word.h;
                        this._spriteRenderer.render(frame, curX, drawY - word.h - offsetPx, word.w, word.h);
                    }
                    curX += word.w;
                    continue;
                }

                const size = (word.style?.size ?? this.fontSize) * fontScale;
                const scale = nativeSize > 0 ? size / nativeSize : 1;
                let cr: number, cg: number, cb: number, ca: number;
                const rawColor = word.style?.color;
                if (rawColor) {
                    const hex = rawColor.startsWith('#') ? rawColor.slice(1) : rawColor;
                    cr = parseInt(hex.slice(0, 2), 16) || 0;
                    cg = parseInt(hex.slice(2, 4), 16) || 0;
                    cb = parseInt(hex.slice(4, 6), 16) || 0;
                    ca = hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) : 255;
                } else {
                    cr = this.defaultColor.r; cg = this.defaultColor.g;
                    cb = this.defaultColor.b; ca = this.defaultColor.a;
                }

                let glyphX = curX;
                for (let ci = 0; ci < word.text.length; ci++) {
                    const g = cfg.fontDefDictionary[word.text.charCodeAt(ci)] as IBMGlyph | undefined;
                    if (!g) { glyphX += size * 0.5; continue; }
                    const gCanvasX = glyphX + g.xOffset * scale;
                    let baselineOffset: number;
                    if (word.style?.vAlign === 'top')         baselineOffset = 0;
                    else if (word.style?.vAlign === 'bottom') baselineOffset = line.lineH - word.h / 2;
                    else                                      baselineOffset = nativeBase * (lineMaxScale - scale);
                    const gCanvasY = lineY + baselineOffset + g.yOffset * scale;
                    const gW = g.rect.width * scale, gH = g.rect.height * scale;
                    const xl = gCanvasX - anchorX * canvasW;
                    const xr = gCanvasX + gW - anchorX * canvasW;
                    const yt = (1 - anchorY) * canvasH - gCanvasY;
                    const yb = (1 - anchorY) * canvasH - gCanvasY - gH;
                    const u0 = g.rect.x / texW, u1 = (g.rect.x + g.rect.width) / texW;
                    const v0 = g.rect.y / texH, v1 = (g.rect.y + g.rect.height) / texH;
                    quads.push({ xl, xr, yb, yt, u0, v0, u1, v1, r: cr, g: cg, b: cb, a: ca });
                    glyphX += g.xAdvance * scale;
                }
                curX += word.w;
            }
            lineY += line.lineH + this.lineSpacing;
        }
        return quads;
    }

    // ── Private: TTF canvas draw ──────────────────────────────────────────────

    private _drawContent(canvasW: number, canvasH: number, topPad = 0, layout: ILayoutResult | null = null): void {
        const { lines, vOffset, maxW, fontScale } = layout ?? this._buildLayout(canvasW, canvasH);
        const ctx = this._offCtx!;
        ctx.textBaseline = 'alphabetic';
        const family = this._getFontFamily();
        const ml = this.marginLeft, mt = this.marginTop;
        let lineY = mt + vOffset + topPad;

        for (let li = 0; li < lines.length; li++) {
            const line = lines[li];
            let maxSize = this.fontSize * fontScale;
            for (let i = 0; i < line.words.length; i++) {
                const s = (line.words[i].style?.size ?? this.fontSize) * fontScale;
                if (s > maxSize) maxSize = s;
            }

            let startX = ml;
            if (this.hAlign === HAlign.CENTER) startX = ml + (maxW - line.lineW) / 2;
            else if (this.hAlign === HAlign.RIGHT) startX = ml + maxW - line.lineW;

            let curX = startX;
            for (let i = 0; i < line.words.length; i++) {
                const word = line.words[i];
                const size = (word.style?.size ?? this.fontSize) * fontScale;
                const wordAscent = this._fontAscent(size, word.style?.bold, word.style?.italic);
                const drawY = wordBaselineY(lineY, line.lineH, wordAscent, this._fontAscent(maxSize), word.h, word.style?.vAlign);

                if (word.style?.spriteName) {
                    const frame = this._spriteAtlas?.getSpriteFrame(word.style.spriteName);
                    if (frame) {
                        const offsetPx = (word.style.spriteOffsetY ?? 0) * word.h;
                        this._spriteRenderer?.render(frame, curX, drawY - word.h - offsetPx, word.w, word.h);
                    }
                    curX += word.w;
                    continue;
                }

                const bold = word.style?.bold ?? false;
                const italic = word.style?.italic ?? false;
                const rawColor = word.style?.color;
                const colorStr = rawColor
                    ? (rawColor.startsWith('#') ? rawColor : `#${rawColor}`)
                    : `rgba(${this.defaultColor.r},${this.defaultColor.g},${this.defaultColor.b},${this.defaultColor.a / 255})`;

                ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px "${family}"`;
                ctx.fillStyle = colorStr;
                ctx.fillText(word.text, curX, drawY);
                if (word.style?.underline)
                    ctx.fillRect(curX, drawY + Math.max(1, size * 0.05), ctx.measureText(word.text.replace(/\s+$/, '')).width, Math.max(1, size / 14));

                curX += word.w;
            }
            lineY += line.lineH + this.lineSpacing;
        }
    }
}
