import { UIRenderer, SpriteFrame, Texture2D, RenderData } from 'cc';
import type { IBMQuadInfo } from './styled-label.assembler';

export interface ISpriteRenderer {
    /** Called once at the start of a redraw with the current canvas dimensions and node anchor. */
    beginFrame(anchorX: number, anchorY: number, canvasW: number, actualCanvasH: number): void;
    /** Draw or collect one inline sprite. canvasTopY = canvas Y of the sprite's top edge. */
    render(frame: SpriteFrame, canvasX: number, canvasTopY: number, dw: number, dh: number): void;
    /** Called after all sprites for the frame. Syncs GPU data on native; no-op on web. */
    endFrame(): void;
    /** Render data for the overlay draw call — null on web. */
    readonly overlayRenderData: RenderData | null;
    /** Texture frame for the overlay draw call — null on web or when no sprites. */
    readonly overlayFrame: SpriteFrame | null;
    /** Assembler for the overlay draw call — null on web. */
    readonly overlayAssembler: any | null;
    /** Reset state on re-enable. */
    reset(): void;
}

// ─── Web implementation ───────────────────────────────────────────────────────

export class WebSpriteRenderer implements ISpriteRenderer {
    constructor(private readonly _ctx: CanvasRenderingContext2D) {}

    beginFrame(_ax: number, _ay: number, _w: number, _h: number): void {}

    render(frame: SpriteFrame, dx: number, dy: number, dw: number, dh: number): void {
        const img = (frame.texture as Texture2D).image?.data;
        if (!img) return;
        const r = frame.rect;
        if ((frame as any).rotated) {
            this._ctx.save();
            this._ctx.translate(dx + dw / 2, dy + dh / 2);
            this._ctx.rotate(-Math.PI / 2);
            this._ctx.drawImage(img as any, r.x, r.y, r.height, r.width, -dh / 2, -dw / 2, dh, dw);
            this._ctx.restore();
        } else {
            this._ctx.drawImage(img as any, r.x, r.y, r.width, r.height, dx, dy, dw, dh);
        }
    }

    endFrame(): void {}

    readonly overlayRenderData = null;
    readonly overlayFrame = null;
    readonly overlayAssembler = null;

    reset(): void {}
}

// ─── Native implementation ────────────────────────────────────────────────────

export class NativeSpriteRenderer implements ISpriteRenderer {
    private _quads: IBMQuadInfo[] = [];
    private _renderData: RenderData | null = null;
    private _atlasFrame: SpriteFrame | null = null;
    private _anchorX = 0;
    private _anchorY = 0;
    private _canvasW = 0;
    private _actualCanvasH = 0;
    private _flagVersion = -1;

    readonly overlayAssembler: any;

    constructor(
        private readonly _comp: UIRenderer,
        private readonly _createRD: () => RenderData,
    ) {
        const self = this;
        this.overlayAssembler = {
            createData: () => self._renderData,
            updateRenderData: () => {},
            updateColor: () => { self._applyNodeColor(); },
            fillBuffers: (comp: UIRenderer) => { self._fillBuffers(comp); },
        };
    }

    beginFrame(anchorX: number, anchorY: number, canvasW: number, actualCanvasH: number): void {
        this._quads = [];
        this._atlasFrame = null;
        this._anchorX = anchorX;
        this._anchorY = anchorY;
        this._canvasW = canvasW;
        this._actualCanvasH = actualCanvasH;
    }

    render(frame: SpriteFrame, canvasX: number, canvasTopY: number, dw: number, dh: number): void {
        const tex = frame.texture as Texture2D;
        const texW = tex.width || 1, texH = tex.height || 1;
        const r = frame.rect;

        const xl = canvasX - this._anchorX * this._canvasW;
        const xr = canvasX + dw - this._anchorX * this._canvasW;
        const yt = (1 - this._anchorY) * this._actualCanvasH - canvasTopY;
        const yb = (1 - this._anchorY) * this._actualCanvasH - (canvasTopY + dh);

        const u0 = r.x / texW, u1 = (r.x + r.width) / texW;
        const v0 = r.y / texH, v1 = (r.y + r.height) / texH;

        this._quads.push({ xl, xr, yb, yt, u0, v0, u1, v1, r: 255, g: 255, b: 255, a: 255 });
        if (!this._atlasFrame) this._atlasFrame = frame;
    }

    endFrame(): void {
        const quads = this._quads;
        const vCount = quads.length * 4;
        const iCount = quads.length * 6;
        if (vCount === 0) { this._renderData = null; return; }

        if (!this._renderData) this._renderData = this._createRD();

        const rd = this._renderData;

        if (rd.vertexCount !== vCount) {
            rd.dataLength = vCount;
            rd.resize(vCount, iCount);
            const indices = new Uint16Array(iCount);
            let o = 0;
            for (let q = 0; q < quads.length; q++) {
                indices[o++] = q * 4;     indices[o++] = q * 4 + 1; indices[o++] = q * 4 + 2;
                indices[o++] = q * 4 + 1; indices[o++] = q * 4 + 3; indices[o++] = q * 4 + 2;
            }
            (rd as any).chunk.setIndexBuffer(indices);
        }

        const data = rd.data;
        const vb = (rd as any).chunk.vb as Float32Array;
        const stride = rd.floatStride;

        for (let q = 0; q < quads.length; q++) {
            const qi = quads[q];
            const base = q * 4;
            // BL, BR, TL, TR — local coords; C++ applies world transform via _render2dBuffer
            data[base].x = qi.xl;         data[base].y = qi.yb;
            data[base + 1].x = qi.xr;     data[base + 1].y = qi.yb;
            data[base + 2].x = qi.xl;     data[base + 2].y = qi.yt;
            data[base + 3].x = qi.xr;     data[base + 3].y = qi.yt;
            // UV into chunk.vb (read by C++ for UV/color, separate from _render2dBuffer)
            vb[base * stride + 3]           = qi.u0; vb[base * stride + 4]           = qi.v1;
            vb[(base + 1) * stride + 3]     = qi.u1; vb[(base + 1) * stride + 4]     = qi.v1;
            vb[(base + 2) * stride + 3]     = qi.u0; vb[(base + 2) * stride + 4]     = qi.v0;
            vb[(base + 3) * stride + 3]     = qi.u1; vb[(base + 3) * stride + 4]     = qi.v0;
        }

        this._applyNodeColor();
        rd.vertDirty = true;
        this._flagVersion = -1;

        // Sync texture/sampler and local positions to native draw info.
        // updateRenderData sets material/texture on NativeRenderDrawInfo and calls
        // fillRender2dBuffer(data), which pushes local x/y/z to _render2dBuffer so
        // the C++ batcher can apply world transform. Without this, JSB renders nothing.
        if (rd.frame !== this._atlasFrame) rd.textureDirty = true;
        rd.updateRenderData(this._comp, this._atlasFrame!);
    }

    get overlayRenderData(): RenderData | null { return this._renderData; }
    get overlayFrame(): SpriteFrame | null { return this._atlasFrame; }

    reset(): void { this._renderData = null; this._atlasFrame = null; this._quads = []; }

    private _fillBuffers(comp: UIRenderer): void {
        const rd = this._renderData;
        if (!rd || rd.vertexCount === 0) return;
        const chunk = (rd as any).chunk;
        const nodeAny = comp.node as any;
        if (this._flagVersion !== nodeAny.flagChangedVersion || rd.vertDirty) {
            this._worldVertUpdate(chunk);
            rd.vertDirty = false;
            this._flagVersion = nodeAny.flagChangedVersion;
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
    }

    private _worldVertUpdate(chunk: any): void {
        const rd = this._renderData!;
        const vb = chunk.vb as Float32Array;
        const data = rd.data;
        const { m00, m01, m02, m03, m04, m05, m06, m07, m12, m13, m14, m15 } = this._comp.node.worldMatrix;
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

    private _applyNodeColor(): void {
        const rd = this._renderData;
        if (!rd || rd.vertexCount === 0) return;
        const vb = (rd as any).chunk?.vb as Float32Array | undefined;
        if (!vb) return;
        const stride = rd.floatStride;
        const nc = this._comp.color;
        const nr = nc.r / 255, ng = nc.g / 255, nb = nc.b / 255, na = nc.a / 255;
        for (let q = 0; q < this._quads.length; q++) {
            const qi = this._quads[q];
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
}
