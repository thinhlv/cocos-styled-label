// ── Canvas mock (global.document not available in Node.js) ───────────────────
// Must be set before StyledLabel is imported so _initCanvas() and _getMCtx() work.

const mockCtx = {
    clearRect(_x: number, _y: number, _w: number, _h: number) {},
    fillText(_t: string, _x: number, _y: number) {},
    fillRect(_x: number, _y: number, _w: number, _h: number) {},
    save() {}, restore() {}, translate() {}, rotate() {},
    drawImage(..._args: any[]) {},
    measureText(_t: string) {
        return {
            width: _t.length * 10,
            fontBoundingBoxAscent: 16,
            actualBoundingBoxAscent: 16,
        };
    },
    font: '', fillStyle: '', textBaseline: '',
};

function makeMockCanvas() {
    return { width: 1, height: 1, getContext: () => mockCtx };
}

(global as any).document = {
    createElement: (_tag: string) => makeMockCanvas(),
};

// ── Import StyledLabel after mocks are set up ─────────────────────────────────
import { StyledLabel } from '../../../assets/scripts/shared/cocos/components/styled-label/styled-label';
import { Texture2D } from 'cc';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockNode() {
    // Return the SAME UITransform object every call so that writes to tf.height/tf.width persist.
    // _doUpdate sets tf.height = reqH in overflow=NONE mode; if a new object is returned each
    // call, the update is lost and sizeChanged is incorrectly true on the next frame.
    const tf = { width: 100, height: 50, anchorX: 0.5, anchorY: 0.5 };
    return {
        on:  (_evt: string, _fn: any, _ctx: any) => {},
        off: (_evt: string, _fn: any, _ctx: any) => {},
        emit: (_evt: string) => {},
        flagChangedVersion: 1,
        worldMatrix: {
            m00:1,m01:0,m02:0,m03:0,
            m04:0,m05:1,m06:0,m07:0,
            m12:0,m13:0,m14:0,m15:1,
        },
        _getUITransformComp() { return tf; },
    };
}

function makeLabel(): StyledLabel {
    const label = new StyledLabel();
    (label as any).node = makeMockNode();
    return label;
}

// Helper: read private field without suppressing TS in test body.
const prv = (obj: any) => obj as Record<string, any>;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('StyledLabel — lifecycle: init', () => {
    let label: StyledLabel;

    beforeEach(() => {
        label = makeLabel();
        // Reset static measurement cache between tests.
        (StyledLabel as any)._mCtx = null;
        (StyledLabel as any)._measureCache?.clear();
    });

    test('onLoad creates canvas resources (_offCanvas, _offTex, _offFrame)', () => {
        label.onLoad();
        expect(prv(label)._offCanvas).not.toBeNull();
        expect(prv(label)._offTex).not.toBeNull();
        expect(prv(label)._offFrame).not.toBeNull();
    });

    test('onEnable creates renderData via _flushAssembler', () => {
        label.onLoad();
        label.onEnable();
        expect(prv(label)._renderData).not.toBeNull();
    });

    test('onEnable sets _contentDirty=true regardless of prior state', () => {
        label.onLoad();
        prv(label)._contentDirty = false;
        label.onEnable();
        expect(prv(label)._contentDirty).toBe(true);
    });
});

// ── Initial render ────────────────────────────────────────────────────────────

describe('StyledLabel — lifecycle: initial render', () => {
    let label: StyledLabel;

    beforeEach(() => {
        (StyledLabel as any)._mCtx = null;
        (StyledLabel as any)._measureCache?.clear();
        label = makeLabel();
        label.string = 'hello';
        label.onLoad();
        label.onEnable();
    });

    test('_doUpdate sets non-zero vertex positions in rd.data', () => {
        label._doUpdate();
        const rd = prv(label)._renderData;
        // With anchorX=0.5, width=100: l = -50, r = 50. Positions must be non-zero.
        expect(rd.data[0].x).not.toBe(0);
        expect(rd.data[1].x).not.toBe(0);
    });

    test('_doUpdate calls uploadData on the texture', () => {
        // _offTex is null after onEnable (fix: destroyed so _initCanvas creates fresh instance).
        // Spy on prototype to capture the call on whichever instance _doUpdate creates.
        const spy = jest.spyOn(Texture2D.prototype, 'uploadData');
        label._doUpdate();
        expect(spy).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });

    test('_doUpdate sets _contentDirty=false after draw', () => {
        label._doUpdate();
        expect(prv(label)._contentDirty).toBe(false);
    });

    test('_doUpdate does NOT upload again when content is not dirty', () => {
        label._doUpdate(); // first draw
        const tex = prv(label)._offTex;
        const spy = jest.spyOn(tex, 'uploadData');
        label._doUpdate(); // second — nothing changed
        expect(spy).not.toHaveBeenCalled();
    });
});

// ── onEnable resets _prevW/_prevH (the key fix) ───────────────────────────────

describe('StyledLabel — onEnable fix: _prevW/_prevH reset', () => {
    let label: StyledLabel;

    beforeEach(() => {
        (StyledLabel as any)._mCtx = null;
        (StyledLabel as any)._measureCache?.clear();
        label = makeLabel();
        label.string = 'hello';
        label.onLoad();
        label.onEnable();
        label._doUpdate(); // initial render → _prevW=100, _prevH=53
    });

    test('after initial _doUpdate, _prevW and _prevH are set to node size', () => {
        // canvasH = h(50) + diacriticPad(3) = 53 for default VAlign.TOP
        expect(prv(label)._prevW).toBe(100);
        expect(prv(label)._prevH).toBeGreaterThan(0);
    });

    test('[REGRESSION] onEnable resets _prevW and _prevH to 0', () => {
        // Simulate Cocos destroying renderData on disable
        prv(label)._renderData = null;

        label.onEnable();

        expect(prv(label)._prevW).toBe(0);
        expect(prv(label)._prevH).toBe(0);
    });
});

// ── Re-enable render (the actual bug scenario) ────────────────────────────────

describe('StyledLabel — disable → re-enable render', () => {
    let label: StyledLabel;

    function simulateDisable() {
        // Cocos destroys renderData during disable.
        prv(label)._renderData = null;
    }

    beforeEach(() => {
        (StyledLabel as any)._mCtx = null;
        (StyledLabel as any)._measureCache?.clear();
        label = makeLabel();
        label.string = 'hello';
        label.onLoad();
        label.onEnable();
        label._doUpdate(); // initial render
    });

    test('[REGRESSION] after re-enable, rd.data has non-zero vertex positions', () => {
        simulateDisable();
        label.onEnable(); // super.onEnable → new renderData; our code → _prevW=0, _prevH=0

        const rdNew = prv(label)._renderData;
        expect(rdNew).not.toBeNull();

        // Without fix: _prevW/_prevH not reset → sizeChanged=false → _localVertUpdate not called → rd.data[0].x === 0
        // With fix:    _prevW=0, _prevH=0  → sizeChanged=true  → _localVertUpdate called    → rd.data[0].x !== 0
        label._doUpdate();
        expect(rdNew.data[0].x).not.toBe(0);
        expect(rdNew.data[2].x).not.toBe(0);
    });

    test('[REGRESSION] after re-enable, vertex positions match expected (anchor 0.5)', () => {
        // With width=100, height=50, anchorX=0.5, anchorY=0.5:
        //   l = -50, b = -25, r = 50, t = 25 + diacriticPad
        simulateDisable();
        label.onEnable();
        label._doUpdate();

        const rd = prv(label)._renderData;
        expect(rd.data[0].x).toBe(-50);  // BL.x
        expect(rd.data[1].x).toBe(50);   // BR.x
        expect(rd.data[2].x).toBe(-50);  // TL.x
        expect(rd.data[3].x).toBe(50);   // TR.x
    });

    test('[REGRESSION] after re-enable, uploadData is called (canvas re-drawn)', () => {
        simulateDisable();
        label.onEnable();

        // _offTex is null here (destroyed by onEnable fix); spy prototype to catch new instance.
        const spy = jest.spyOn(Texture2D.prototype, 'uploadData');
        label._doUpdate();
        expect(spy).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });

    test('multiple disable → re-enable cycles remain correct', () => {
        for (let i = 0; i < 3; i++) {
            simulateDisable();
            label.onEnable();
            label._doUpdate();

            const rd = prv(label)._renderData;
            expect(rd.data[0].x).toBe(-50);
            expect(rd.data[1].x).toBe(50);
        }
    });
});

// ── GFX rebind fix: canvas resources destroyed on onEnable ────────────────────
// Root cause: _offTex.reset() changes the GPU handle in-place but Cocos may cache
// the old sampler binding → blank label. Fix: destroy canvas resources in onEnable
// so _initCanvas() creates a brand-new Texture2D + SpriteFrame, forcing a full rebind.

describe('StyledLabel — onEnable canvas resource recreation (GFX rebind fix)', () => {
    let label: StyledLabel;

    function simulateDisable() {
        prv(label)._renderData = null;
    }

    beforeEach(() => {
        (StyledLabel as any)._mCtx = null;
        (StyledLabel as any)._measureCache?.clear();
        label = makeLabel();
        label.string = 'hello';
        label.onLoad();
        label.onEnable();
        label._doUpdate();
    });

    test('[GFX-REBIND] onEnable nulls _offTex, _offCanvas, _offCtx, _offFrame', () => {
        expect(prv(label)._offTex).not.toBeNull();
        expect(prv(label)._offCanvas).not.toBeNull();

        simulateDisable();
        label.onEnable();

        expect(prv(label)._offTex).toBeNull();
        expect(prv(label)._offCanvas).toBeNull();
        expect(prv(label)._offCtx).toBeNull();
        expect(prv(label)._offFrame).toBeNull();
    });

    test('[GFX-REBIND] after re-enable _doUpdate creates a new Texture2D instance', () => {
        const texBefore = prv(label)._offTex;

        simulateDisable();
        label.onEnable();
        label._doUpdate();

        const texAfter = prv(label)._offTex;
        expect(texAfter).not.toBeNull();
        expect(texAfter).not.toBe(texBefore);
    });

    test('[GFX-REBIND] after re-enable _doUpdate creates a new SpriteFrame instance', () => {
        const frameBefore = prv(label)._offFrame;

        simulateDisable();
        label.onEnable();
        label._doUpdate();

        const frameAfter = prv(label)._offFrame;
        expect(frameAfter).not.toBeNull();
        expect(frameAfter).not.toBe(frameBefore);
    });

    test('[GFX-REBIND] uploadData called on the new texture after re-enable', () => {
        simulateDisable();
        label.onEnable();

        // _offTex is null here; spy on prototype to catch the call on the new instance
        const spy = jest.spyOn(Texture2D.prototype, 'uploadData');
        label._doUpdate();
        expect(spy).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });

    test('[GFX-REBIND] each re-enable cycle creates a unique Texture2D instance', () => {
        const seen = new Set<object>();
        seen.add(prv(label)._offTex);

        for (let i = 0; i < 3; i++) {
            simulateDisable();
            label.onEnable();
            label._doUpdate();
            seen.add(prv(label)._offTex);
        }

        expect(seen.size).toBe(4); // 1 initial + 3 re-enables, all unique
    });
});
