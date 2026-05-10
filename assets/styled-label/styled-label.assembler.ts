import { _decorator, UIRenderer, RenderData, Enum } from 'cc';
import { HAlign, VAlign } from './styled-label.layout';
import type { StyledLabel } from './styled-label';

export type { IBMGlyph, IBMFntConfig, IBMQuadInfo };
export { StyledLabelMargin, StyledLabelSpacing, StyledLabelAlign };
export { _quadAssembler, _bmAssembler };
export { _localVertUpdate, _uvUpdate, _colorUpdate, _bmApplyNodeColor };

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
    r: number;  g: number;  b: number;  a: number;
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
    @property({ type: Enum(HAlign) }) public horizontal: HAlign = HAlign.CENTER;
    @property({ type: Enum(VAlign) }) public vertical: VAlign = VAlign.CENTER;
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

        // Commit overlay sprites via the batcher's commitComp.
        const spr = self._spriteRenderer;
        console.log(`[SL] fillBuffers: spr=${!!spr} overlayRD=${!!spr?.overlayRenderData} overlayFrame=${!!spr?.overlayFrame} renderer=${!!renderer} hasCommit=${typeof renderer?.commitComp}`);
        if (spr?.overlayRenderData && spr.overlayFrame && renderer?.commitComp) {
            console.log(`[SL] fillBuffers: calling commitComp for overlay vCount=${spr.overlayRenderData.vertexCount}`);
            renderer.commitComp(self, spr.overlayRenderData, spr.overlayFrame, spr.overlayAssembler, null);
            console.log(`[SL] fillBuffers: commitComp done`);
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
function _bmApplyNodeColor(comp: StyledLabel): void {
    const rd = comp.renderData as RenderData;
    if (!rd || rd.vertexCount === 0) return;
    const vb = (rd as any).chunk?.vb as Float32Array | undefined;
    if (!vb) return;
    const stride = rd.floatStride;
    const nc = comp.color;
    const nr = nc.r / 255, ng = nc.g / 255, nb = nc.b / 255, na = nc.a / 255;
    const quads = comp._bmQuads;
    for (let q = 0; q < quads.length; q++) {
        const qi = quads[q];
        if (!qi) continue;
        const r = (qi.r / 255) * nr, g = (qi.g / 255) * ng;
        const b = (qi.b / 255) * nb, a = (qi.a / 255) * na;
        const base = q * 4;
        for (let v = 0; v < 4; v++) {
            const o = (base + v) * stride + 5;
            vb[o] = r; vb[o + 1] = g; vb[o + 2] = b; vb[o + 3] = a;
        }
    }
}
