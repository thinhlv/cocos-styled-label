import {
    _decorator, UIRenderer, SpriteFrame, SpriteAtlas, Texture2D, Font, BitmapFont,
    Color, Rect, Enum, RenderData, BitMask, Node,
} from 'cc';
import { EDITOR } from 'cc/env';
import {
    HAlign, VAlign, OverflowMode, TextTransform,
    HtmlTextParser, buildLayout, wordBaselineY,
} from './styled-label.layout';
import type { ITextSegment, ILayoutResult } from './styled-label.layout';

const { ccclass, property, executeInEditMode } = _decorator;

// Register enums for the Cocos editor inspector.
Enum(HAlign);
Enum(VAlign);
Enum(OverflowMode);
Enum(TextTransform);

const WatchProp = BitMask({
    String:     1 << 0,
    Font:       1 << 1,
    FontSize:   1 << 2,
    LineHeight: 1 << 3,
    Color:      1 << 4,
    Align:      1 << 5,
    Margin:     1 << 6,
    Spacing:    1 << 7,
    Overflow:   1 << 8,
    WordWrap:   1 << 9,
    Transform:  1 << 10,
    SpriteAtlas: 1 << 11,
});

// ─── BitmapFont glyph types ───────────────────────────────────────────────────

interface IBMGlyph {
    rect: { x: number; y: number; width: number; height: number };
    xOffset: number;
    yOffset: number;
    xAdvance: number;
}
interface IBMFntConfig { commonHeight: number; fontSize: number; base?: number; fontDefDictionary: Record<number, IBMGlyph>; }

// ─── BM GPU quad type ─────────────────────────────────────────────────────────

interface IBMQuadInfo {
    xl: number; xr: number; yb: number; yt: number; // node-local position (Y-up)
    u0: number; v0: number; u1: number; v1: number; // UV (normalized, v0=top v1=bottom)
    r: number; g: number; b: number; a: number;      // style color (0-255)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

@ccclass('StyledLabelMargin')
class StyledLabelMargin {
    @property public left: number = 0;
    @property public right: number = 0;
    @property public top: number = 0;
    @property public bottom: number = 0;
}

@ccclass('StyledLabelSpacing')
class StyledLabelSpacing {
    @property public line: number = 0;
    @property public segment: number = 0;
}

@ccclass('StyledLabelAlign')
class StyledLabelAlign {
    @property({ type: HAlign }) public horizontal: HAlign = HAlign.CENTER;
    @property({ type: VAlign }) public vertical: VAlign = VAlign.CENTER;
}


// ─── Canvas quad assembler (TTF / system font) ────────────────────────────────

const _QUAD_INDICES = Uint16Array.from([0, 1, 2, 1, 3, 2]);

const _quadAssembler = {
    createData(comp: UIRenderer): RenderData {
        const rd = comp.requestRenderData() as RenderData;
        rd.dataLength = 4;
        rd.resize(4, 6);
        (rd as any).chunk.setIndexBuffer(_QUAD_INDICES);
        return rd;
    },

    updateRenderData(comp: UIRenderer): void {
        (comp as StyledLabel)._doUpdate();
    },

    updateColor(comp: UIRenderer): void {
        _colorUpdate(comp as StyledLabel);
    },

    fillBuffers(comp: UIRenderer, renderer: any): void {
        const rd = comp.renderData as RenderData;
        if (!rd) return;
        const chunk = (rd as any).chunk;
        const self = comp as StyledLabel;

        const nodeAny = comp.node as any;
        if ((self as any)._flagChangedVersion !== nodeAny.flagChangedVersion || rd.vertDirty) {
            _worldVertUpdate(self, chunk);
            rd.vertDirty = false;
            (self as any)._flagChangedVersion = nodeAny.flagChangedVersion;
        }

        const vid = chunk.vertexOffset;
        const mb = chunk.meshBuffer;
        const ib = mb.iData;
        let io = mb.indexOffset;
        ib[io++] = vid; ib[io++] = vid + 1; ib[io++] = vid + 2;
        ib[io++] = vid + 1; ib[io++] = vid + 3; ib[io++] = vid + 2;
        mb.indexOffset += 6;
    },
};

function _worldVertUpdate(comp: StyledLabel, chunk: any): void {
    const rd = comp.renderData as RenderData;
    const vb = chunk.vb as Float32Array;
    const data = rd.data;
    const { m00, m01, m02, m03, m04, m05, m06, m07, m12, m13, m14, m15 } = comp.node.worldMatrix;
    const stride = rd.floatStride;
    for (let i = 0; i < 4; i++) {
        const { x, y } = data[i];
        let rhw = m03 * x + m07 * y + m15;
        rhw = rhw ? 1 / rhw : 1;
        const o = i * stride;
        vb[o] = (m00 * x + m04 * y + m12) * rhw;
        vb[o + 1] = (m01 * x + m05 * y + m13) * rhw;
        vb[o + 2] = (m02 * x + m06 * y + m14) * rhw;
    }
}

function _localVertUpdate(comp: StyledLabel, topPad = 0): void {
    const rd = comp.renderData as RenderData;
    if (!rd) return;
    const tf = (comp.node as any)._getUITransformComp()!;
    const w = tf.width, h = tf.height;
    const ax = tf.anchorX * w, ay = tf.anchorY * h;
    const l = -ax, b = -ay, r = w - ax, t = h - ay + topPad;
    const d = rd.data;
    d[0].x = l; d[0].y = b;
    d[1].x = r; d[1].y = b;
    d[2].x = l; d[2].y = t;
    d[3].x = r; d[3].y = t;
    rd.vertDirty = true;
}

function _uvUpdate(comp: StyledLabel): void {
    const rd = comp.renderData as RenderData;
    if (!rd || !comp._offFrame) return;
    const vb = (rd as any).chunk.vb as Float32Array;
    const uv = comp._offFrame.uv;
    const stride = rd.floatStride;
    for (let i = 0, o = 3; i < 4; i++, o += stride) {
        vb[o] = uv[i * 2];
        vb[o + 1] = uv[i * 2 + 1];
    }
}

function _colorUpdate(comp: StyledLabel): void {
    const rd = comp.renderData as RenderData;
    if (!rd) return;
    const vb = (rd as any).chunk?.vb as Float32Array | undefined;
    if (!vb) return;
    const stride = rd.floatStride;
    const { r, g, b, a } = comp.color;
    for (let i = 0, o = 5; i < 4; i++, o += stride) {
        vb[o] = r / 255; vb[o + 1] = g / 255;
        vb[o + 2] = b / 255; vb[o + 3] = a / 255;
    }
}

// ─── BM glyph assembler (BitmapFont GPU path) ─────────────────────────────────

const _bmAssembler = {
    createData(comp: UIRenderer): RenderData {
        return comp.requestRenderData() as RenderData;
    },

    updateRenderData(comp: UIRenderer): void {
        (comp as StyledLabel)._doUpdate();
    },

    // Node-level color change: re-apply node color multiplied onto per-glyph style colors.
    updateColor(comp: UIRenderer): void {
        _bmApplyNodeColor(comp as StyledLabel);
    },

    fillBuffers(comp: UIRenderer, renderer: any): void {
        const rd = comp.renderData as RenderData;
        if (!rd || rd.vertexCount === 0) return;
        const chunk = (rd as any).chunk;
        const self = comp as StyledLabel;
        const nodeAny = comp.node as any;
        if ((self as any)._flagChangedVersion !== nodeAny.flagChangedVersion || rd.vertDirty) {
            _bmWorldVertUpdate(self, chunk);
            rd.vertDirty = false;
            (self as any)._flagChangedVersion = nodeAny.flagChangedVersion;
        }
        const quadCount = rd.vertexCount / 4;
        const vid = chunk.vertexOffset;
        const mb = chunk.meshBuffer;
        const ib = mb.iData;
        let io = mb.indexOffset;
        for (let q = 0; q < quadCount; q++) {
            const base = vid + q * 4;
            ib[io++] = base; ib[io++] = base + 1; ib[io++] = base + 2;
            ib[io++] = base + 1; ib[io++] = base + 3; ib[io++] = base + 2;
        }
        mb.indexOffset += quadCount * 6;
    },
};

function _bmWorldVertUpdate(comp: StyledLabel, chunk: any): void {
    const rd = comp.renderData as RenderData;
    const vb = chunk.vb as Float32Array;
    const data = rd.data;
    const { m00, m01, m02, m03, m04, m05, m06, m07, m12, m13, m14, m15 } = comp.node.worldMatrix;
    const stride = rd.floatStride;
    const vCount = rd.vertexCount;
    for (let i = 0; i < vCount; i++) {
        const { x, y } = data[i];
        let rhw = m03 * x + m07 * y + m15;
        rhw = rhw ? 1 / rhw : 1;
        const o = i * stride;
        vb[o] = (m00 * x + m04 * y + m12) * rhw;
        vb[o + 1] = (m01 * x + m05 * y + m13) * rhw;
        vb[o + 2] = (m02 * x + m06 * y + m14) * rhw;
    }
}

// Writes per-glyph style colors multiplied by the node color into the vertex buffer.
// Call after building quads AND when the node color changes.
function _bmApplyNodeColor(comp: StyledLabel): void {
    const rd = comp.renderData as RenderData;
    if (!rd || rd.vertexCount === 0) return;
    const vb = (rd as any).chunk?.vb as Float32Array | undefined;
    if (!vb) return;
    const stride = rd.floatStride;
    const nc = comp.color;
    const nr = nc.r / 255, ng = nc.g / 255, nb = nc.b / 255, na = nc.a / 255;
    const quads = comp._bmQuads;
    const quadCount = quads.length;
    for (let q = 0; q < quadCount; q++) {
        const qi = quads[q];
        if (!qi) continue;
        const r = (qi.r / 255) * nr;
        const g = (qi.g / 255) * ng;
        const b = (qi.b / 255) * nb;
        const a = (qi.a / 255) * na;
        const base = q * 4;
        for (let v = 0; v < 4; v++) {
            const o = (base + v) * stride + 5;
            vb[o] = r; vb[o + 1] = g; vb[o + 2] = b; vb[o + 3] = a;
        }
    }
}

// ─── StyledLabel ─────────────────────────────────────────────────────────────

/**
 * Single-canvas rich text label for TTF/system fonts.
 * For BitmapFont, renders per-glyph GPU quads using the font atlas texture directly,
 * which avoids CPU-side canvas drawImage that fails in WebGL environments.
 *
 * Markup support: <color=#hex>  <size=N>  <b>  <i>  <u>  <br/>  <sprite=frameName>  <sprite=frameName size=32>
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
        // Full reset — same effect as reopening the scene.
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
        this._prevW = 0;
        this._prevH = 0;
        this._contentDirty = true;
        this._flushAssembler();
        this.markForUpdateRenderData(true);
    }

    @property(StyledLabelAlign)
    public align: StyledLabelAlign = new StyledLabelAlign();

    @property(StyledLabelMargin)
    public margin: StyledLabelMargin = new StyledLabelMargin();

    @property(StyledLabelSpacing)
    public spacing: StyledLabelSpacing = new StyledLabelSpacing();

    // ── TTF canvas resources (runtime only) ───────────────────────────────────

    public _offFrame: SpriteFrame | null = null;
    private _offTex: Texture2D | null = null;
    private _offCanvas: HTMLCanvasElement | null = null;
    private _offCtx: CanvasRenderingContext2D | null = null;
    private _prevW = 0;
    private _prevH = 0;

    // ── BM GPU resources ──────────────────────────────────────────────────────

    // Public so _bmApplyNodeColor (module-level function) can access it.
    public _bmQuads: IBMQuadInfo[] = [];
    private _bmSpriteFrame: SpriteFrame | null = null;

    // ── Shared state ──────────────────────────────────────────────────────────

    private _contentDirty  = true;
    private _adjustingSize = false; // true while we set tf.width/height ourselves
    private _editorW = 0;
    private _editorH = 0;

    // ── Dirty-detection cache (field comparisons, no string allocation) ────────
    private _cFontUuid    = '';
    private _cFontSize    = 24;
    private _cLineHeight  = 40;
    private _cColorR      = 255; private _cColorG = 255; private _cColorB = 255; private _cColorA = 255;
    private _cAlignH      = HAlign.LEFT; private _cAlignV = VAlign.TOP;
    private _cMarginL     = 0; private _cMarginR = 0; private _cMarginT = 0; private _cMarginB = 0;
    private _cSpacingLine = 0;
    private _cOverflow    = OverflowMode.NONE;
    private _cWordWrap    = true;
    private _cTransform   = TextTransform.NONE;
    private _cAtlasUuid   = '';

    private _parser = new HtmlTextParser();

    // ── Parse result cache (avoids re-parsing unchanged HTML) ─────────────────
    private _parsedHtml   = '';
    private _parsedResult: ITextSegment[] = [];

    // ── Shared measurement canvas ─────────────────────────────────────────────

    private static _mCtx: CanvasRenderingContext2D | null = null;
    private static _getMCtx(): CanvasRenderingContext2D {
        if (!StyledLabel._mCtx) {
            StyledLabel._mCtx = document.createElement('canvas').getContext('2d')!;
        }
        return StyledLabel._mCtx;
    }

    // ── measureText LRU-lite cache (avoids repeated canvas font layout calls) ──
    private static _measureCache = new Map<string, number>();
    private static readonly _MEASURE_CACHE_MAX = 512;

    // ── Property accessors ────────────────────────────────────────────────────

    get marginLeft(): number { return this.margin?.left ?? 0; }
    get marginRight(): number { return this.margin?.right ?? 0; }
    get marginTop(): number { return this.margin?.top ?? 0; }
    get marginBottom(): number { return this.margin?.bottom ?? 0; }
    get lineSpacing(): number { return this.spacing?.line ?? 0; }
    get hAlign(): HAlign { return this.align?.horizontal ?? HAlign.LEFT; }
    get vAlign(): VAlign { return this.align?.vertical ?? VAlign.TOP; }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    onLoad(): void {
        super.onLoad();
        this.node.on(Node.EventType.SIZE_CHANGED, this._onNodeSizeChanged, this);
        if (!(this.font instanceof BitmapFont)) {
            this._initCanvas();
        }
    }

    onEnable(): void {
        // Destroy canvas resources before super.onEnable so the next _doUpdate creates a
        // brand-new Texture2D object. _offTex.reset() changes the GPU handle in-place but
        // Cocos may not rebind it to the material sampler — a new object forces a full rebind.
        if (!(this.font instanceof BitmapFont)) {
            if (this._offTex) { this._offTex.destroy(); this._offTex = null; }
            this._offCanvas = null;
            this._offCtx = null;
            this._offFrame = null;
        }
        super.onEnable?.();
        this._contentDirty = true;
        this._prevW = 0;
        this._prevH = 0;
        this.markForUpdateRenderData(true);
    }

    onDestroy(): void {
        this.node.off(Node.EventType.SIZE_CHANGED, this._onNodeSizeChanged, this);
        this._offCanvas = null;
        this._offCtx = null;
        if (this._offTex) { this._offTex.destroy(); this._offTex = null; }
        this._offFrame = null;
        this._bmQuads = [];
        this._bmSpriteFrame = null;
        super.onDestroy();
    }

    private _onNodeSizeChanged(): void {
        // Ignore events fired by our own tf.width/height writes in NONE mode.
        if (this._adjustingSize) return;
        this._contentDirty = true;
        this.markForUpdateRenderData(true);
    }

    update(_dt: number): void {
        // Editor: poll ALL properties (no GC — pure field comparisons).
        // Runtime: poll only watchProps; setter-backed props are already reactive.
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
                    this._editorW = w;
                    this._editorH = h;
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
                // destroyRenderData may not null _renderData in all Cocos versions,
                // so force null to ensure createData below always runs for the new assembler.
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
        const sf = (this.font instanceof BitmapFont) ? this._bmSpriteFrame : this._offFrame;
        render.commitComp(this, this._renderData, sf, this._assembler, null);
    }

    protected _canRender(): boolean {
        if (!super._canRender()) return false;
        if (this.font instanceof BitmapFont) {
            return !!(this._bmSpriteFrame?.texture?.getGFXTexture()) && this._bmQuads.length > 0;
        }
        return !!(this._offFrame?.texture?.getGFXTexture());
    }

    // Called by the assembler (render-pipeline entry point) AND by external force calls.
    public _doUpdate(force?: boolean): void {
        const tf = (this.node as any)._getUITransformComp();
        if (!tf) return;

        let w = Math.ceil(tf.width) || 1;
        let h = Math.ceil(tf.height) || 1;

        // Build layout for NONE overflow only when content is dirty.
        // If nothing changed, node size is already correct from the previous render.
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

        if (this.font instanceof BitmapFont) {
            this._doBMUpdate(w, h, cachedLayout);
            return;
        }

        // ── TTF / system font path (canvas) ───────────────────────────────────

        if (!this._offCanvas || !this._offCtx || !this._offTex || !this._offFrame) {
            this._initCanvas();
            if (!this._offCanvas || !this._offCtx || !this._offTex || !this._offFrame) return;
        }

        // Extra canvas space above the node so Vietnamese diacritics above the
        // em-square top are visible without displacing the text body downward.
        const diacriticPad = this.vAlign === VAlign.TOP
            ? Math.max(0, Math.ceil(this.fontSize * 0.15) - this.marginTop)
            : 0;
        const canvasH = h + diacriticPad;

        const sizeChanged = w !== this._prevW || canvasH !== this._prevH;
        const needDraw = this._contentDirty || sizeChanged || !!force;

        if (sizeChanged || !this._offTex.getGFXTexture()) {
            this._prevW = w;
            this._prevH = canvasH;
            this._offCanvas.width = w;
            this._offCanvas.height = canvasH;
            this._offTex.reset({ width: w, height: canvasH, format: Texture2D.PixelFormat.RGBA8888 });
            this._offFrame.rect = new Rect(0, 0, w, canvasH);
            _localVertUpdate(this, diacriticPad);
            const rd = this._renderData as RenderData;
            if (rd) rd.textureDirty = true;
            // w or h changed → layout (computed before resize) is stale
            cachedLayout = null;
        }

        if (!this._offTex.getGFXTexture()) {
            this.markForUpdateRenderData(true);
            return;
        }

        if (needDraw) {
            this._offCtx.clearRect(0, 0, w, canvasH);
            if (this._htmlString) this._drawContent(w, h, diacriticPad, cachedLayout);
            this._offTex.uploadData(this._offCanvas);
            _uvUpdate(this);
            _colorUpdate(this);
            this._contentDirty = false;
        }

        const rd = this._renderData as RenderData;
        if (rd) rd.updateRenderData(this, this._offFrame);
    }

    // External API — force a redraw (e.g. from code after font load).
    updateRenderData(force?: boolean): void {
        if (force) this._contentDirty = true;
        this._doUpdate(force);
    }

    // ── Public API ────────────────────────────────────────────────────────────

    public applyFont(font: Font): void {
        this.font = font; // setter handles flush + markForUpdateRenderData in runtime
        if (EDITOR) { this._contentDirty = true; this.reload = true; }
    }

    // ── Private: canvas init ──────────────────────────────────────────────────

    private _initCanvas(): void {
        this._offCanvas = document.createElement('canvas');
        this._offCanvas.width = 1;
        this._offCanvas.height = 1;
        this._offCtx = this._offCanvas.getContext('2d')!;

        this._offTex = new Texture2D();
        this._offTex.reset({ width: 1, height: 1, format: Texture2D.PixelFormat.RGBA8888 });

        this._offFrame = new SpriteFrame();
        this._offFrame.packable = false;
        this._offFrame.texture = this._offTex;
        this._offFrame.rect = new Rect(0, 0, 1, 1);
    }

    // ── Private: dirty detection (zero-allocation field comparisons) ─────────

    private _checkDirty(flags: number): boolean {
        // String changes are caught by the setter (_contentDirty=true); no poll needed.
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
        if (flags & WatchProp.Spacing   && this.lineSpacing    !== this._cSpacingLine) return true;
        if (flags & WatchProp.Overflow  && this._overflow      !== this._cOverflow)    return true;
        if (flags & WatchProp.WordWrap  && this._wordWrap      !== this._cWordWrap)    return true;
        if (flags & WatchProp.Transform    && this._textTransform        !== this._cTransform)  return true;
        if (flags & WatchProp.SpriteAtlas  && (this._spriteAtlas?.uuid ?? '') !== this._cAtlasUuid) return true;
        return false;
    }

    private _updateCache(flags: number): void {
        if (flags & WatchProp.Font)       this._cFontUuid    = this._font?.uuid ?? '';
        if (flags & WatchProp.FontSize)   this._cFontSize    = this._fontSize;
        if (flags & WatchProp.LineHeight) this._cLineHeight  = this._lineHeightVal;
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
        if (flags & WatchProp.Spacing)   this._cSpacingLine = this.lineSpacing;
        if (flags & WatchProp.Overflow)  this._cOverflow    = this._overflow;
        if (flags & WatchProp.WordWrap)  this._cWordWrap    = this._wordWrap;
        if (flags & WatchProp.Transform)    this._cTransform   = this._textTransform;
        if (flags & WatchProp.SpriteAtlas)  this._cAtlasUuid   = this._spriteAtlas?.uuid ?? '';
    }

    // ── Private: measurement ──────────────────────────────────────────────────

    private _getFontFamily(): string {
        if (this.font && !(this.font instanceof BitmapFont)) {
            return `${this.font.name}_LABEL`;
        }
        return 'Arial';
    }

    private _measureTTF(text: string, size: number, bold: boolean, italic: boolean): number {
        const family = this._getFontFamily();
        const key = `${family}\0${bold ? 1 : 0}${italic ? 1 : 0}${size}\0${text}`;
        const cached = StyledLabel._measureCache.get(key);
        if (cached !== undefined) return cached;
        const ctx = StyledLabel._getMCtx();
        ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px "${family}"`;
        const w = ctx.measureText(text).width;
        if (StyledLabel._measureCache.size >= StyledLabel._MEASURE_CACHE_MAX) {
            StyledLabel._measureCache.delete(StyledLabel._measureCache.keys().next().value!);
        }
        StyledLabel._measureCache.set(key, w);
        return w;
    }

    private _measureBitmap(text: string, font: BitmapFont, size: number): number {
        const cfg = (font as any).fntConfig as IBMFntConfig | undefined;
        if (!cfg?.fontDefDictionary) return 0;
        const native = cfg.commonHeight || cfg.fontSize || size;
        const scale = native > 0 ? size / native : 1;
        let w = 0;
        for (let i = 0, len = text.length; i < len; i++) {
            const g = cfg.fontDefDictionary[text.charCodeAt(i)];
            if (g) w += g.xAdvance * scale;
        }
        return w;
    }

    // Distance from textBaseline='top' drawing origin down to the alphabetic baseline,
    // measured via actual font metrics. Used to align mixed-size text and sprites to a shared baseline.
    private _fontAscent(size: number, bold = false, italic = false): number {
        const family = this._getFontFamily();
        const key = `fa\0${family}\0${bold ? 1 : 0}${italic ? 1 : 0}${size}`;
        const hit = StyledLabel._measureCache.get(key);
        if (hit !== undefined) return hit;
        const ctx = StyledLabel._getMCtx();
        ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px "${family}"`;
        ctx.textBaseline = 'alphabetic';
        const m = ctx.measureText('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789');
        const v = (m as any).fontBoundingBoxAscent ?? m.actualBoundingBoxAscent ?? size * 0.8;
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


    // ── Private: shared layout ────────────────────────────────────────────────

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
            segments,
            canvasW, canvasH,
            fontSize:    this.fontSize,
            lineHeight:  this._lineHeightVal,
            marginLeft:  this.marginLeft,
            marginRight: this.marginRight,
            marginTop:   this.marginTop,
            marginBottom: this.marginBottom,
            lineSpacing: this.lineSpacing,
            wordWrap:    this._wordWrap,
            overflow:    this._overflow,
            vAlign:      this.vAlign,
            textTransform: this._textTransform,
            fontScale,
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
        const ax = tf.anchorX;
        const ay = tf.anchorY;

        const sizeChanged = w !== this._prevW || h !== this._prevH;
        if (!this._contentDirty && !sizeChanged) {
            const rd = this._renderData as RenderData;
            if (rd) rd.updateRenderData(this, sf);
            return;
        }
        this._prevW = w;
        this._prevH = h;

        this._bmQuads = this._htmlString ? this._buildBMQuads(w, h, ax, ay, layout) : [];
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
                let offset = 0;
                for (let q = 0; q < this._bmQuads.length; q++) {
                    indices[offset++] = q * 4;
                    indices[offset++] = q * 4 + 1;
                    indices[offset++] = q * 4 + 2;
                    indices[offset++] = q * 4 + 1;
                    indices[offset++] = q * 4 + 3;
                    indices[offset++] = q * 4 + 2;
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

                // Local positions in rd.data (world transform applied later in fillBuffers)
                // BL, BR, TL, TR
                data[base].x = qi.xl; data[base].y = qi.yb;
                data[base + 1].x = qi.xr; data[base + 1].y = qi.yb;
                data[base + 2].x = qi.xl; data[base + 2].y = qi.yt;
                data[base + 3].x = qi.xr; data[base + 3].y = qi.yt;

                // UV written directly to VBO (not overwritten by world transform):
                // BL(u0,v1)  BR(u1,v1)  TL(u0,v0)  TR(u1,v0)
                // v0=top-of-glyph-in-image, v1=bottom (matches Cocos BMFont convention)
                vb[base * stride + 3] = qi.u0; vb[base * stride + 4] = qi.v1;
                vb[(base + 1) * stride + 3] = qi.u1; vb[(base + 1) * stride + 4] = qi.v1;
                vb[(base + 2) * stride + 3] = qi.u0; vb[(base + 2) * stride + 4] = qi.v0;
                vb[(base + 3) * stride + 3] = qi.u1; vb[(base + 3) * stride + 4] = qi.v0;
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

        // Use texture dimensions for UV normalization (same as Cocos BMFont assembler).
        const texW = (sf.texture as Texture2D)?.width || sf.width || 1;
        const texH = (sf.texture as Texture2D)?.height || sf.height || 1;

        const nativeSize = cfg.commonHeight || cfg.fontSize || this.fontSize;
        // Base = distance from top of native line box to the alphabetic baseline.
        // Used to align glyphs of different sizes to a shared baseline (same as CSS/browser).
        const nativeBase = cfg.base ?? nativeSize;

        const { lines, vOffset, maxW, fontScale } = layout ?? this._buildLayout(canvasW, canvasH);
        const quads: IBMQuadInfo[] = [];

        const ml = this.marginLeft, mt = this.marginTop;
        let lineY = mt + vOffset; // canvas Y (top-down)

        for (let li = 0, llen = lines.length; li < llen; li++) {
            const line = lines[li];

            // Shared baseline scale for this line — same logic as TTF path.
            let lineMaxScale = fontScale;
            for (let i = 0, wlen = line.words.length; i < wlen; i++) {
                const ws = ((line.words[i].style?.size ?? this.fontSize) * fontScale) / (nativeSize || 1);
                if (ws > lineMaxScale) lineMaxScale = ws;
            }

            let startX = ml;
            if (this.hAlign === HAlign.CENTER) startX = ml + (maxW - line.lineW) / 2;
            else if (this.hAlign === HAlign.RIGHT) startX = ml + maxW - line.lineW;

            let curX = startX;

            for (let i = 0, wlen = line.words.length; i < wlen; i++) {
                const word = line.words[i];

                if (word.style?.spriteName) { curX += word.w; continue; } // sprites not rendered on BM path

                const size = (word.style?.size ?? this.fontSize) * fontScale;
                const scale = nativeSize > 0 ? size / nativeSize : 1;

                // Resolve segment color (0-255)
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

                // Build one quad per character
                let glyphX = curX;
                for (let ci = 0, clen = word.text.length; ci < clen; ci++) {
                    const g = cfg.fontDefDictionary[word.text.charCodeAt(ci)];
                    if (!g) { glyphX += size * 0.5; continue; }

                    const gCanvasX = glyphX + g.xOffset * scale;
                    // Shift smaller glyphs down so all sizes share the same baseline.
                    // nativeBase * (lineMaxScale - scale) = the vertical correction needed.
                    const gCanvasY = lineY + nativeBase * (lineMaxScale - scale) + g.yOffset * scale;
                    const gW = g.rect.width * scale;
                    const gH = g.rect.height * scale;

                    const xl = gCanvasX - anchorX * canvasW;
                    const xr = gCanvasX + gW - anchorX * canvasW;
                    const yt = (1 - anchorY) * canvasH - gCanvasY;
                    const yb = (1 - anchorY) * canvasH - gCanvasY - gH;

                    const u0 = g.rect.x / texW;
                    const u1 = (g.rect.x + g.rect.width) / texW;
                    const v0 = g.rect.y / texH;
                    const v1 = (g.rect.y + g.rect.height) / texH;

                    quads.push({ xl, xr, yb, yt, u0, v0, u1, v1, r: cr, g: cg, b: cb, a: ca });
                    glyphX += g.xAdvance * scale;
                }

                curX += word.w;
            }

            lineY += line.lineH + this.lineSpacing;
        }

        return quads;
    }

    // ── Private: sprite blit ─────────────────────────────────────────────────

    private _drawSprite(ctx: CanvasRenderingContext2D, frame: SpriteFrame, dx: number, dy: number, dw: number, dh: number): void {
        const img = (frame.texture as Texture2D).image?.data;
        if (!img) return;
        const r = frame.rect;
        if ((frame as any).rotated) {
            // Sprite stored CW-rotated in atlas — un-rotate CCW before blitting
            ctx.save();
            ctx.translate(dx + dw / 2, dy + dh / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.drawImage(img as any, r.x, r.y, r.height, r.width, -dh / 2, -dw / 2, dh, dw);
            ctx.restore();
        } else {
            ctx.drawImage(img as any, r.x, r.y, r.width, r.height, dx, dy, dw, dh);
        }
    }

    // ── Private: TTF canvas draw ──────────────────────────────────────────────

    private _drawContent(canvasW: number, canvasH: number, topPad = 0, layout: ILayoutResult | null = null): void {
        const { lines, vOffset, maxW, fontScale } = layout ?? this._buildLayout(canvasW, canvasH);

        const ctx = this._offCtx!;
        ctx.textBaseline = 'alphabetic';
        const family = this._getFontFamily();

        const ml = this.marginLeft, mt = this.marginTop;
        let lineY = mt + vOffset + topPad;

        for (let li = 0, llen = lines.length; li < llen; li++) {
            const line = lines[li];

            // Find the largest font size on this line to determine the shared baseline.
            let maxSize = this.fontSize * fontScale;
            for (let i = 0; i < line.words.length; i++) {
                const s = (line.words[i].style?.size ?? this.fontSize) * fontScale;
                if (s > maxSize) maxSize = s;
            }
            // baselineY = top of line box + ascent of the tallest text.
            // With textBaseline='alphabetic', every element draws/sits at this Y.
            const baselineY = lineY + this._fontAscent(maxSize);

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
                    if (frame) this._drawSprite(ctx, frame, curX, drawY - word.h, word.w, word.h);
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

                if (word.style?.underline) {
                    ctx.fillRect(curX, drawY + Math.max(1, size * 0.05), word.w, Math.max(1, size / 14));
                }

                curX += word.w;
            }

            lineY += line.lineH + this.lineSpacing;
        }
    }
}
