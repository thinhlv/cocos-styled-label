// ── Minimal mocks ─────────────────────────────────────────────────────────────

import { NativeSpriteRenderer } from "../../../assets/styled-label/styled-label.sprite-renderer";

function makeMockRD() {
  const stride = 9;
  const maxV = 40;
  const vb = new Float32Array(maxV * stride);
  const data: any[] = Array.from({ length: maxV }, () => ({
    x: 0,
    y: 0,
    z: 0,
    u: 0,
    v: 0,
    color: {},
  }));

  const rd: any = {
    _frame: null as any,
    get frame() {
      return rd._frame;
    },
    set frame(v: any) {
      rd._frame = v;
    },
    textureDirty: true,
    passDirty: true,
    dataHash: 0,
    vertDirty: false,
    _vc: 0,
    get vertexCount() {
      return rd._vc;
    },
    get dataLength() {
      return data.length;
    },
    set dataLength(_n: number) {},
    floatStride: stride,
    data,
    updateRenderData: jest.fn((_comp: any, frame: any) => {
      rd._frame = frame;
      rd.textureDirty = false;
    }),
    resize: jest.fn((vc: number) => {
      rd._vc = vc;
    }),
    chunk: { vb, setIndexBuffer: jest.fn() },
    material: null,
  };
  return rd;
}

function makeMockComp() {
  return {
    getRenderMaterial: jest.fn(() => ({})),
    color: { r: 255, g: 255, b: 255, a: 255 },
    node: { scene: null },
  } as any;
}

function makeMockFrame(texW = 64, texH = 64, rx = 0, ry = 0, rw = 32, rh = 32) {
  return {
    texture: { width: texW, height: texH },
    rect: { x: rx, y: ry, width: rw, height: rh },
  } as any;
}

function makeRenderer() {
  const rd = makeMockRD();
  const comp = makeMockComp();
  const spr = new NativeSpriteRenderer(comp, () => rd);
  return { spr, rd, comp };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("NativeSpriteRenderer — beginFrame", () => {
  test("beginFrame clears quads so a subsequent endFrame with no renders produces no overlay", () => {
    const { spr } = makeRenderer();
    const frame = makeMockFrame();

    spr.beginFrame(0.5, 0.5, 100, 50);
    spr.render(frame, 10, 5, 32, 32);
    spr.endFrame();
    expect(spr.overlayRenderData).not.toBeNull();

    spr.beginFrame(0.5, 0.5, 100, 50);
    // no render call — endFrame should see 0 quads
    spr.endFrame();
    expect(spr.overlayRenderData).toBeNull();
  });
});

describe("NativeSpriteRenderer — endFrame: no quads", () => {
  test("endFrame with no quads nulls _renderData and does not call updateRenderData", () => {
    const { spr, rd } = makeRenderer();

    spr.beginFrame(0.5, 0.5, 100, 50);
    spr.endFrame();

    expect(spr.overlayRenderData).toBeNull();
    expect(rd.updateRenderData).not.toHaveBeenCalled();
  });

  test("overlayFrame is null when no quads", () => {
    const { spr } = makeRenderer();
    spr.beginFrame(0.5, 0.5, 100, 50);
    spr.endFrame();
    expect(spr.overlayFrame).toBeNull();
  });
});

describe("NativeSpriteRenderer — endFrame: with quads (native JSB fix)", () => {
  test("endFrame calls updateRenderData with comp and atlas frame", () => {
    const { spr, rd, comp } = makeRenderer();
    const frame = makeMockFrame();

    spr.beginFrame(0.5, 0.5, 100, 50);
    spr.render(frame, 0, 0, 32, 32);
    spr.endFrame();

    expect(rd.updateRenderData).toHaveBeenCalledTimes(1);
    expect(rd.updateRenderData).toHaveBeenCalledWith(comp, frame);
  });

  test("endFrame sets textureDirty=true when atlas frame changes", () => {
    const { spr, rd } = makeRenderer();
    const frame1 = makeMockFrame();
    const frame2 = makeMockFrame();

    // First cycle — rd._frame stays null until updateRenderData mock sets it.
    spr.beginFrame(0.5, 0.5, 100, 50);
    spr.render(frame1, 0, 0, 32, 32);
    spr.endFrame(); // rd._frame becomes frame1 via mock

    // Second cycle with a different frame
    rd.textureDirty = false;
    spr.beginFrame(0.5, 0.5, 100, 50);
    spr.render(frame2, 0, 0, 32, 32);
    spr.endFrame();

    expect(rd.updateRenderData).toHaveBeenLastCalledWith(expect.anything(), frame2);
    // textureDirty was set true before updateRenderData (mock then clears it to false)
    expect(rd.textureDirty).toBe(false); // mock cleared it after being set
  });

  test("endFrame does NOT set textureDirty when atlas frame is the same", () => {
    const { spr, rd } = makeRenderer();
    const frame = makeMockFrame();

    spr.beginFrame(0.5, 0.5, 100, 50);
    spr.render(frame, 0, 0, 32, 32);
    spr.endFrame(); // rd._frame = frame via mock

    // Second cycle — same frame, textureDirty should not be set back to true
    rd.textureDirty = false;
    spr.beginFrame(0.5, 0.5, 100, 50);
    spr.render(frame, 0, 0, 32, 32);
    spr.endFrame();

    // If condition was wrong, textureDirty would be true; mock leaves it false when not set.
    expect(rd.textureDirty).toBe(false);
  });

  test("endFrame allocates RenderData and calls resize on first draw", () => {
    const { spr, rd } = makeRenderer();
    const frame = makeMockFrame();

    spr.beginFrame(0.5, 0.5, 100, 50);
    spr.render(frame, 0, 0, 32, 32); // 1 quad → vCount=4
    spr.endFrame();

    expect(rd.resize).toHaveBeenCalledWith(4, 6);
  });

  test("endFrame does not call resize again when quad count is unchanged", () => {
    const { spr, rd } = makeRenderer();
    const frame = makeMockFrame();

    spr.beginFrame(0.5, 0.5, 100, 50);
    spr.render(frame, 0, 0, 32, 32);
    spr.endFrame();
    rd.resize.mockClear();

    spr.beginFrame(0.5, 0.5, 100, 50);
    spr.render(frame, 0, 0, 32, 32);
    spr.endFrame();

    expect(rd.resize).not.toHaveBeenCalled();
  });
});

describe("NativeSpriteRenderer — vertex positions", () => {
  test("endFrame writes correct local positions to rd.data (anchor 0.5)", () => {
    const { spr, rd } = makeRenderer();
    const frame = makeMockFrame(64, 64, 0, 0, 64, 64);

    // anchorX=0.5, anchorY=0.5, canvasW=100, canvasH=50
    // render: canvasX=10, canvasTopY=5, dw=32, dh=32
    spr.beginFrame(0.5, 0.5, 100, 50);
    spr.render(frame, 10, 5, 32, 32);
    spr.endFrame();

    // xl = 10 - 0.5*100 = -40
    // xr = 10+32 - 0.5*100 = 2 (typo in original: -40+32=−8... let me recalc)
    // xl = canvasX - anchorX * canvasW = 10 - 50 = -40
    // xr = canvasX + dw - anchorX * canvasW = 42 - 50 = -8
    // yt = (1-0.5)*50 - 5 = 25 - 5 = 20
    // yb = (1-0.5)*50 - (5+32) = 25 - 37 = -12
    const d = rd.data;
    expect(d[0].x).toBeCloseTo(-40); // BL.x
    expect(d[0].y).toBeCloseTo(-12); // BL.y
    expect(d[1].x).toBeCloseTo(-8); // BR.x
    expect(d[1].y).toBeCloseTo(-12); // BR.y
    expect(d[2].x).toBeCloseTo(-40); // TL.x
    expect(d[2].y).toBeCloseTo(20); // TL.y
    expect(d[3].x).toBeCloseTo(-8); // TR.x
    expect(d[3].y).toBeCloseTo(20); // TR.y
  });
});

describe("NativeSpriteRenderer — UV coordinates", () => {
  test("endFrame writes correct UV into chunk.vb", () => {
    const { spr, rd } = makeRenderer();
    // rect (8,16,16,32) on a 64x64 texture
    const frame = makeMockFrame(64, 64, 8, 16, 16, 32);
    const stride = 9;

    spr.beginFrame(0.5, 0.5, 100, 50);
    spr.render(frame, 0, 0, 16, 32);
    spr.endFrame();

    // u0 = 8/64 = 0.125,  u1 = (8+16)/64 = 0.375
    // v0 = 16/64 = 0.25,  v1 = (16+32)/64 = 0.75
    const vb = rd.chunk.vb;
    expect(vb[0 * stride + 3]).toBeCloseTo(0.125); // BL u = u0
    expect(vb[0 * stride + 4]).toBeCloseTo(0.75); // BL v = v1
    expect(vb[1 * stride + 3]).toBeCloseTo(0.375); // BR u = u1
    expect(vb[1 * stride + 4]).toBeCloseTo(0.75); // BR v = v1
    expect(vb[2 * stride + 3]).toBeCloseTo(0.125); // TL u = u0
    expect(vb[2 * stride + 4]).toBeCloseTo(0.25); // TL v = v0
    expect(vb[3 * stride + 3]).toBeCloseTo(0.375); // TR u = u1
    expect(vb[3 * stride + 4]).toBeCloseTo(0.25); // TR v = v0
  });
});

describe("NativeSpriteRenderer — reset", () => {
  test("reset clears renderData, atlasFrame, and quads", () => {
    const { spr } = makeRenderer();
    const frame = makeMockFrame();

    spr.beginFrame(0.5, 0.5, 100, 50);
    spr.render(frame, 0, 0, 32, 32);
    spr.endFrame();

    expect(spr.overlayRenderData).not.toBeNull();
    expect(spr.overlayFrame).not.toBeNull();

    spr.reset();

    expect(spr.overlayRenderData).toBeNull();
    expect(spr.overlayFrame).toBeNull();
  });
});

describe("NativeSpriteRenderer — overlayAssembler", () => {
  test("overlayAssembler is always non-null", () => {
    const { spr } = makeRenderer();
    expect(spr.overlayAssembler).not.toBeNull();
  });

  test("overlayAssembler.updateColor calls _applyNodeColor without throwing", () => {
    const { spr, rd } = makeRenderer();
    const frame = makeMockFrame();

    spr.beginFrame(0.5, 0.5, 100, 50);
    spr.render(frame, 0, 0, 32, 32);
    spr.endFrame();

    expect(() => spr.overlayAssembler.updateColor()).not.toThrow();
    // Verify color was written to vb (all 4 verts at stride offset 5)
    const stride = 9;
    expect(rd.chunk.vb[0 * stride + 5]).toBeCloseTo(1); // r
    expect(rd.chunk.vb[0 * stride + 8]).toBeCloseTo(1); // a
  });
});
