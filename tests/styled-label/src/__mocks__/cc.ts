// Minimal Cocos Creator mock — enough for StyledLabel to instantiate and run _doUpdate.

export class RenderData {
    data = Array.from({ length: 4 }, () => ({ x: 0, y: 0 }));
    floatStride = 9;
    vertDirty  = false;
    textureDirty = false;
    vertexCount = 4;
    dataLength  = 4;
    material: any = null;
    chunk = {
        vb: new Float32Array(4 * 9),
        setIndexBuffer(_buf: any) {},
    };
    resize(vCount: number, _iCount: number) {
        while (this.data.length < vCount) this.data.push({ x: 0, y: 0 });
        this.vertexCount = vCount;
        const needFloats = vCount * this.floatStride;
        if (this.chunk.vb.length < needFloats) {
            this.chunk.vb = new Float32Array(needFloats);
        }
    }
    updateRenderData(_comp: any, _sf: any) {}
}

export class Texture2D {
    static PixelFormat = { RGBA8888: 'rgba8888' };
    private _gfx: object | null = {};
    reset(_opts: any) { this._gfx = {}; }
    getGFXTexture() { return this._gfx; }
    uploadData(_canvas: any) {}
    destroy() { this._gfx = null; }
}

export class SpriteFrame {
    packable = true;
    texture: any = null;
    rect: any = null;
    uv = new Array(8).fill(0.5);
}

export class Rect {
    constructor(public x = 0, public y = 0, public width = 1, public height = 1) {}
}

export class Color {
    constructor(public r = 255, public g = 255, public b = 255, public a = 255) {}
}

export class Font { name = 'mock'; uuid = 'font-uuid'; }
export class BitmapFont extends Font {}
export class SpriteAtlas {
    private _frames: Map<string, SpriteFrame> = new Map();
    addFrame(name: string, frame: SpriteFrame): void { this._frames.set(name, frame); }
    getSpriteFrame(name: string): SpriteFrame | null { return this._frames.get(name) ?? null; }
    uuid = 'atlas-mock-uuid';
}

export class Node {
    static EventType = { SIZE_CHANGED: 'size-changed' };
}

// UIRenderer base — onEnable calls _flushAssembler (same as real Cocos).
export class UIRenderer {
    _renderData: any = null;
    _assembler: any = null;
    color = { r: 255, g: 255, b: 255, a: 255 };
    node: any = null;

    get renderData() { return this._renderData; }

    requestRenderData() {
        const rd = new RenderData();
        this._renderData = rd;
        return rd;
    }
    destroyRenderData() { this._renderData = null; }
    markForUpdateRenderData(_force?: boolean) {}
    getRenderMaterial(_idx: number) { return {}; }
    onEnable()  { (this as any)._flushAssembler?.(); }
    onLoad()    {}
    onDestroy() {}
    _canRender() { return true; }
}

export const _decorator = {
    ccclass:          (_name?: string) => (cls: any) => cls,
    executeInEditMode: (cls: any)     => cls,

    // property is used two ways:
    //   @property          → compiled to property(target, key, descriptor) by __decorate (2-3 args)
    //   @property({...})   → compiled to property(opts) → returns (target, key) => void (1 arg)
    // Returning a non-undefined value from a property decorator causes __decorate to call
    // Object.defineProperty with it, which sets writable=false. Return undefined to avoid that.
    property: function (...args: any[]) {
        if (args.length >= 2) return undefined; // direct decorator — no-op
        return () => {};                        // factory mode — return no-op decorator
    },
};

export const Enum    = (v: any) => v;
export const BitMask = (v: any) => v;

export const view = {
    on(_event: string, _cb: () => void, _target?: any) {},
    off(_event: string, _cb: () => void, _target?: any) {},
};
