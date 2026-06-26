import { _decorator, UIRenderer, RenderData, Enum, Color, SpriteFrame } from 'cc';
import { GradientScope, HAlign, VAlign } from './styled-label.layout';
import type { StyledLabel } from './styled-label';

export type { IBMGlyph, IBMFntConfig, IBMQuadInfo, IBMLineBounds };
export { StyledLabelMargin, StyledLabelSpacing, StyledLabelAlign, StyledLabelGradient, StyledLabelOutline };
// export { GradientScope };
export { _quadAssembler, _bmAssembler };
export { _localVertUpdate, _uvUpdate, _colorUpdate, _bmApplyNodeColor, _bmComputeGlyphUV, _bmWriteQuadUVs, _bmRefreshQuadUVs };

const { ccclass, property } = _decorator;

// ─── Types ────────────────────────────────────────────────────────────────────

interface IBMGlyph {
    rect: { x: number; y: number; width: number; height: number };
    xOffset: number;
    yOffset: number;
    xAdvance: number;
}

interface IBMFntConfig {
    commonHeight: number;
    fontSize: number;
    base?: number;
    fontDefDictionary: Record<number, IBMGlyph>;
}

interface IBMQuadInfo {
    xl: number; xr: number; yb: number; yt: number;
    u0: number; v0: number; u1: number; v1: number;
    grX: number; grY: number; grW: number; grH: number;
    r: number;  g: number;  b: number;  a: number;
    lineIndex: number;
    isOutline?: boolean;
}

interface IBMLineBounds { left: number; right: number; top: number; bottom: number; }

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
    @property({ type: Enum(HAlign) }) public horizontal: HAlign = HAlign.CENTER;
    @property({ type: Enum(VAlign) }) public vertical: VAlign = VAlign.CENTER;
}

Enum(GradientScope);

@ccclass('StyledLabelGradient')
class StyledLabelGradient {
    @property public enabled: boolean = false;
    @property({ type: Enum(GradientScope) }) public scope: GradientScope = GradientScope.Glyph;
    @property public topLeft:     Color = new Color(255, 255, 255, 255);
    @property public topRight:    Color = new Color(255, 255, 255, 255);
    @property public bottomLeft:  Color = new Color(255, 255, 255, 255);
    @property public bottomRight: Color = new Color(255, 255, 255, 255);
}

@ccclass('StyledLabelOutline')
class StyledLabelOutline {
    @property public enabled: boolean = false;
    @property public thickness: number = 1;
    @property public color: Color = new Color(0, 0, 0, 255);
    @property public soft: boolean = false;
    @property public offsetX: number = 0;
    @property public offsetY: number = 0;
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

        // Commit overlay sprites via the batcher's commitComp (web only).
        const spr = self._spriteRenderer;
        if (spr?.overlayRenderData && spr.overlayFrame && renderer?.commitComp) {
            renderer.commitComp(self, spr.overlayRenderData, spr.overlayFrame, spr.overlayAssembler, null);
        }
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
        let rhw = m03 * x + m07 * y + m15; rhw = rhw ? 1 / rhw : 1;
        const o = i * stride;
        vb[o]     = (m00 * x + m04 * y + m12) * rhw;
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
    const d = rd.data;
    d[0].x = -ax;     d[0].y = -ay;
    d[1].x = w - ax;  d[1].y = -ay;
    d[2].x = -ax;     d[2].y = h - ay + topPad;
    d[3].x = w - ax;  d[3].y = h - ay + topPad;
    rd.vertDirty = true;
}

function _uvUpdate(comp: StyledLabel): void {
    const rd = comp.renderData as RenderData;
    if (!rd || !comp._offFrame) return;
    const vb = (rd as any).chunk.vb as Float32Array;
    const uv = comp._offFrame.uv;
    const stride = rd.floatStride;
    for (let i = 0, o = 3; i < 4; i++, o += stride) {
        vb[o] = uv[i * 2]; vb[o + 1] = uv[i * 2 + 1];
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
        vb[o] = r / 255; vb[o + 1] = g / 255; vb[o + 2] = b / 255; vb[o + 3] = a / 255;
    }
}

// ─── BM glyph UV (mirrors Cocos bmfontUtils.generateVertexData + _determineRect) ─

function _bmAdjustGlyphRect(
    glyphRect: { x: number; y: number; width: number; height: number },
    sf: SpriteFrame,
): { x: number; y: number; width: number; height: number; rotated: boolean } {
    const frameRect = sf.rect ?? { x: 0, y: 0, width: sf.width, height: sf.height };
    const offset = sf.offset ?? { x: 0, y: 0 };
    const originalSize = sf.getOriginalSize?.() ?? { width: frameRect.width, height: frameRect.height };
    const trimmedLeft = offset.x + (originalSize.width - frameRect.width) / 2;
    const trimmedTop = offset.y - (originalSize.height - frameRect.height) / 2;
    const rotated = sf.isRotated?.() ?? false;

    let x = glyphRect.x;
    let y = glyphRect.y;
    let width = glyphRect.width;
    let height = glyphRect.height;

    if (!rotated) {
        x += frameRect.x - trimmedLeft;
        y += frameRect.y + trimmedTop;
    } else {
        const originalX = x;
        x = frameRect.x + frameRect.height - y - height - trimmedTop;
        y = originalX + frameRect.y - trimmedLeft;
        if (y < 0) {
            height += trimmedTop;
        }
    }

    return { x, y, width, height, rotated };
}

function _bmComputeGlyphUV(
    glyphRect: { x: number; y: number; width: number; height: number },
    sf: SpriteFrame,
): { u0: number; v0: number; u1: number; v1: number } {
    const texW = sf.width || 1;
    const texH = sf.height || 1;
    const { x, y, width, height, rotated } = _bmAdjustGlyphRect(glyphRect, sf);

    if (!rotated) {
        const u0 = x / texW;
        const u1 = (x + width) / texW;
        const v0 = y / texH;
        const v1 = (y + height) / texH;
        return { u0, v0, u1, v1 };
    }

    const l = x / texW;
    const r = (x + height) / texW;
    const t = y / texH;
    const b = (y + width) / texH;
    return { u0: l, v0: t, u1: r, v1: b };
}

function _bmWriteQuadUVs(comp: StyledLabel): void {
    const rd = comp.renderData as RenderData;
    if (!rd || rd.vertexCount === 0) return;
    const vb = (rd as any).chunk.vb as Float32Array;
    const stride = rd.floatStride;
    const quads = comp._bmQuads;
    for (let q = 0; q < quads.length; q++) {
        const qi = quads[q];
        const base = q * 4;
        // UV: BL(u0,v1)  BR(u1,v1)  TL(u0,v0)  TR(u1,v0)
        vb[base * stride + 3] = qi.u0;     vb[base * stride + 4] = qi.v1;
        vb[(base + 1) * stride + 3] = qi.u1; vb[(base + 1) * stride + 4] = qi.v1;
        vb[(base + 2) * stride + 3] = qi.u0; vb[(base + 2) * stride + 4] = qi.v0;
        vb[(base + 3) * stride + 3] = qi.u1; vb[(base + 3) * stride + 4] = qi.v0;
    }
}

function _bmRefreshQuadUVs(comp: StyledLabel, sf: SpriteFrame): void {
    const quads = comp._bmQuads;
    for (let q = 0; q < quads.length; q++) {
        const qi = quads[q];
        const uv = _bmComputeGlyphUV({ x: qi.grX, y: qi.grY, width: qi.grW, height: qi.grH }, sf);
        qi.u0 = uv.u0;
        qi.v0 = uv.v0;
        qi.u1 = uv.u1;
        qi.v1 = uv.v1;
    }
    _bmWriteQuadUVs(comp);
}

// ─── BM glyph assembler (BitmapFont GPU path) ─────────────────────────────────

const _bmAssembler = {
    createData(comp: UIRenderer): RenderData {
        return comp.requestRenderData() as RenderData;
    },
    updateRenderData(comp: UIRenderer): void {
        (comp as StyledLabel)._doUpdate();
    },
    updateColor(comp: UIRenderer): void {
        _bmApplyNodeColor(comp as StyledLabel);
    },
    fillBuffers(comp: UIRenderer, _renderer: any): void {
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
        let rhw = m03 * x + m07 * y + m15; rhw = rhw ? 1 / rhw : 1;
        const o = i * stride;
        vb[o]     = (m00 * x + m04 * y + m12) * rhw;
        vb[o + 1] = (m01 * x + m05 * y + m13) * rhw;
        vb[o + 2] = (m02 * x + m06 * y + m14) * rhw;
    }
}

// Writes per-glyph style colors multiplied by node color into the vertex buffer.
// When comp.gradient.enabled, also multiplies in per-corner color (4-corner gradient).
// Vert order per quad: 0=BL, 1=BR, 2=TL, 3=TR.
function _bmApplyNodeColor(comp: StyledLabel): void {
    const rd = comp.renderData as RenderData;
    if (!rd || rd.vertexCount === 0) return;
    const vb = (rd as any).chunk?.vb as Float32Array | undefined;
    if (!vb) return;
    const stride = rd.floatStride;
    const nc = comp.color;
    const nr = nc.r / 255, ng = nc.g / 255, nb = nc.b / 255, na = nc.a / 255;
    const quads = comp._bmQuads;

    const grad = comp.gradient;
    const gradOn = !!grad?.enabled;

    const writeSolid = (q: number, qi: IBMQuadInfo) => {
        const r = (qi.r / 255) * nr, g = (qi.g / 255) * ng;
        const b = (qi.b / 255) * nb, a = (qi.a / 255) * na;
        const base = q * 4;
        for (let v = 0; v < 4; v++) {
            const o = (base + v) * stride + 5;
            vb[o] = r; vb[o + 1] = g; vb[o + 2] = b; vb[o + 3] = a;
        }
    };

    if (!gradOn) {
        for (let q = 0; q < quads.length; q++) {
            const qi = quads[q];
            if (!qi) continue;
            writeSolid(q, qi);
        }
        return;
    }

    const g = grad!;
    if (g.scope === GradientScope.Line) {
        const lines = comp._bmLines;
        const TL = g.topLeft, TR = g.topRight, BL = g.bottomLeft, BR = g.bottomRight;
        for (let q = 0; q < quads.length; q++) {
            const qi = quads[q];
            if (!qi) continue;
            if (qi.isOutline) { writeSolid(q, qi); continue; }
            const line = lines[qi.lineIndex];
            const sR = (qi.r / 255) * nr, sG = (qi.g / 255) * ng;
            const sB = (qi.b / 255) * nb, sA = (qi.a / 255) * na;
            const lineW = line ? line.right - line.left : 0;
            const lineH = line ? line.top - line.bottom : 0;
            const base = q * 4;
            for (let v = 0; v < 4; v++) {
                const vx = (v === 1 || v === 3) ? qi.xr : qi.xl;
                const vy = (v === 2 || v === 3) ? qi.yt : qi.yb;
                const u = lineW > 0 ? (vx - line.left) / lineW : 0;
                const vv = lineH > 0 ? (line.top - vy) / lineH : 0;
                const tr = TL.r + (TR.r - TL.r) * u;
                const tg = TL.g + (TR.g - TL.g) * u;
                const tb = TL.b + (TR.b - TL.b) * u;
                const ta = TL.a + (TR.a - TL.a) * u;
                const br = BL.r + (BR.r - BL.r) * u;
                const bg = BL.g + (BR.g - BL.g) * u;
                const bb = BL.b + (BR.b - BL.b) * u;
                const ba = BL.a + (BR.a - BL.a) * u;
                const fr = tr + (br - tr) * vv;
                const fg = tg + (bg - tg) * vv;
                const fb = tb + (bb - tb) * vv;
                const fa = ta + (ba - ta) * vv;
                const o = (base + v) * stride + 5;
                vb[o]     = sR * (fr / 255);
                vb[o + 1] = sG * (fg / 255);
                vb[o + 2] = sB * (fb / 255);
                vb[o + 3] = sA * (fa / 255);
            }
        }
        return;
    }

    const corners: Color[] = [g.bottomLeft, g.bottomRight, g.topLeft, g.topRight];
    for (let q = 0; q < quads.length; q++) {
        const qi = quads[q];
        if (!qi) continue;
        if (qi.isOutline) { writeSolid(q, qi); continue; }
        const sR = (qi.r / 255) * nr, sG = (qi.g / 255) * ng;
        const sB = (qi.b / 255) * nb, sA = (qi.a / 255) * na;
        const base = q * 4;
        for (let v = 0; v < 4; v++) {
            const c = corners[v];
            const o = (base + v) * stride + 5;
            vb[o]     = sR * (c.r / 255);
            vb[o + 1] = sG * (c.g / 255);
            vb[o + 2] = sB * (c.b / 255);
            vb[o + 3] = sA * (c.a / 255);
        }
    }
}
