// TTF gradient — per-glyph vertical gradient via ctx.createLinearGradient().
//
// Expectation: for each character in the rendered string, _drawContent must:
//   1. Call ctx.createLinearGradient() with (0, top, 0, bot) where top<bot.
//   2. Call addColorStop(0, ...) with topColor css.
//   3. Call addColorStop(1, ...) with bottomColor css.
//   4. Set ctx.fillStyle to the returned gradient object.
//   5. Call ctx.fillText() with single char + advance x by measureText width.

import { Color } from "cc";
import { StyledLabel } from "../../../assets/styled-label/styled-label";
import { GradientScope, HAlign, VAlign } from "../../../assets/styled-label/styled-label.layout";

// ── Spying canvas mock ────────────────────────────────────────────────────────

interface GradientStop { offset: number; color: string }
interface SpyGradient { id: number; stops: GradientStop[] }

let gradientsCreated: Array<{ x0: number; y0: number; x1: number; y1: number; spy: SpyGradient }> = [];
let fillStyleAtFillText: any[] = [];
let fillTextCalls: Array<{ text: string; x: number; y: number }> = [];
let nextGradId = 1;

const spyCtx: any = {
  clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {},
  drawImage() {}, fillRect() {},
  font: "",
  fillStyle: "" as any,
  textBaseline: "",
  createLinearGradient(x0: number, y0: number, x1: number, y1: number) {
    const spy: SpyGradient = { id: nextGradId++, stops: [] };
    const obj = {
      __spy: spy,
      addColorStop(offset: number, color: string) { spy.stops.push({ offset, color }); },
    };
    gradientsCreated.push({ x0, y0, x1, y1, spy });
    return obj;
  },
  fillText(text: string, x: number, y: number) {
    fillStyleAtFillText.push(spyCtx.fillStyle);
    fillTextCalls.push({ text, x, y });
  },
  measureText(_t: string) {
    const m = spyCtx.font.match(/(\d+(?:\.\d+)?)px/);
    const fs = m ? parseFloat(m[1]) : 16;
    return {
      width: fs * 0.6,
      actualBoundingBoxAscent:  fs * 0.8,
      actualBoundingBoxDescent: fs * 0.2,
      fontBoundingBoxAscent: fs * 0.85,
    } as any;
  },
};

(global as any).document = {
  createElement: (_tag: string) => ({ width: 1, height: 1, getContext: () => spyCtx }),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeNode() {
  const tf = { width: 300, height: 80, anchorX: 0.5, anchorY: 0.5 };
  return {
    on: () => {}, off: () => {}, emit: () => {},
    flagChangedVersion: 1,
    worldMatrix: { m00: 1, m01: 0, m02: 0, m03: 0, m04: 0, m05: 1, m06: 0, m07: 0, m12: 0, m13: 0, m14: 0, m15: 1 },
    _getUITransformComp() { return tf; },
  };
}

function freshLabel(text: string): StyledLabel {
  (StyledLabel as any)._mCtx = null;
  (StyledLabel as any)._measureCache?.clear();
  (StyledLabel as any)._inflatedMap = null;

  gradientsCreated = [];
  fillStyleAtFillText = [];
  fillTextCalls = [];

  const label = new StyledLabel();
  (label as any).node = makeNode();
  label.string = text;
  label.fontSize = 40;
  label.lineHeight = 40;
  label.wordWrap = false;
  label.align.horizontal = HAlign.LEFT;
  label.align.vertical = VAlign.TOP;
  label.onLoad();
  label.onEnable();
  return label;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("TTF gradient — per-glyph linearGradient", () => {
  test("creates one linearGradient per character (5 chars → 5 gradients)", () => {
    const label = freshLabel("Hello");
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Glyph;
    label.gradient.topLeft     = new Color(0, 255, 0, 255);
    label.gradient.topRight    = new Color(0, 255, 0, 255);
    label.gradient.bottomLeft  = new Color(255, 100, 50, 255);
    label.gradient.bottomRight = new Color(255, 100, 50, 255);
    label._doUpdate();

    expect(gradientsCreated.length).toBe(5);
    expect(fillTextCalls.length).toBe(5);
    // Each fillText draws a single char.
    expect(fillTextCalls.map(c => c.text).join("")).toBe("Hello");
  });

  test("each gradient: addColorStop(0,...) = topLeft css, addColorStop(1,...) = bottomLeft css", () => {
    const label = freshLabel("AB");
    label.gradient.enabled = true;
    label.gradient.topLeft     = new Color(0, 255, 0, 255);
    label.gradient.topRight    = new Color(0, 255, 0, 255);
    label.gradient.bottomLeft  = new Color(255, 100, 50, 255);
    label.gradient.bottomRight = new Color(255, 100, 50, 255);
    label._doUpdate();

    for (const g of gradientsCreated) {
      expect(g.spy.stops.length).toBe(2);
      expect(g.spy.stops[0].offset).toBe(0);
      expect(g.spy.stops[0].color).toBe("rgba(0,255,0,1)");
      expect(g.spy.stops[1].offset).toBe(1);
      expect(g.spy.stops[1].color).toBe("rgba(255,100,50,1)");
    }
  });

  test("gradient y0 < y1 (top above bottom in canvas coords)", () => {
    const label = freshLabel("X");
    label.gradient.enabled = true;
    label.gradient.topLeft     = new Color(0, 255, 0, 255);
    label.gradient.topRight    = new Color(0, 255, 0, 255);
    label.gradient.bottomLeft  = new Color(255, 100, 50, 255);
    label.gradient.bottomRight = new Color(255, 100, 50, 255);
    label._doUpdate();

    expect(gradientsCreated.length).toBe(1);
    const g = gradientsCreated[0];
    expect(g.x0).toBe(0);
    expect(g.x1).toBe(0);
    expect(g.y0).toBeLessThan(g.y1);
  });

  test("fillStyle at each fillText call is the gradient object (not a string)", () => {
    const label = freshLabel("ABC");
    label.gradient.enabled = true;
    label.gradient.topLeft     = new Color(0, 255, 0, 255);
    label.gradient.topRight    = new Color(0, 255, 0, 255);
    label.gradient.bottomLeft  = new Color(255, 100, 50, 255);
    label.gradient.bottomRight = new Color(255, 100, 50, 255);
    label._doUpdate();

    expect(fillStyleAtFillText.length).toBe(3);
    for (const fs of fillStyleAtFillText) {
      expect(typeof fs).toBe("object");
      expect(fs.__spy).toBeDefined();
    }
  });

  test("disabled gradient: no linearGradient, single fillText per word with string fillStyle", () => {
    const label = freshLabel("Hello");
    expect(label.gradient.enabled).toBe(false);
    label._doUpdate();

    expect(gradientsCreated.length).toBe(0);
    // Word-level fillText: "Hello" rendered as 1 fillText call.
    expect(fillTextCalls.length).toBe(1);
    expect(fillTextCalls[0].text).toBe("Hello");
    expect(typeof fillStyleAtFillText[0]).toBe("string");
  });
});
