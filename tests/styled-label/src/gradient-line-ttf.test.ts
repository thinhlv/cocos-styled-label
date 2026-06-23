// TTF gradient — scope=Line. Per-line linearGradient shared by all glyphs in
// the line; multi-line text creates one gradient per line.
//
// Contract for vertical line gradient (TL=TR, BL=BR):
//   1. Exactly one ctx.createLinearGradient() per line (not per character).
//   2. The gradient spans the line's vertical extent (y0 < y1, x0 = x1 = 0).
//   3. addColorStop(0,...) = topLeft css, addColorStop(1,...) = bottomLeft css.
//   4. ctx.fillText() is called per word (not broken up per character) with the
//      shared gradient as fillStyle.

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
  const tf = { width: 300, height: 200, anchorX: 0.5, anchorY: 0.5 };
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

describe("TTF gradient — scope=Line (per-line linearGradient)", () => {
  test("single-line word: ONE linearGradient created (not one-per-char)", () => {
    const label = freshLabel("Hello");
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Line;
    label.gradient.topLeft     = new Color(0, 255, 0, 255);
    label.gradient.topRight    = new Color(0, 255, 0, 255);
    label.gradient.bottomLeft  = new Color(255, 100, 50, 255);
    label.gradient.bottomRight = new Color(255, 100, 50, 255);
    label._doUpdate();

    expect(gradientsCreated.length).toBe(1);
    // fillText is invoked word-level (not per-character) since gradient is shared.
    expect(fillTextCalls.length).toBe(1);
    expect(fillTextCalls[0].text).toBe("Hello");
  });

  test("gradient stops: addColorStop(0,...) = topLeft css, addColorStop(1,...) = bottomLeft css", () => {
    const label = freshLabel("Hello");
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Line;
    label.gradient.topLeft     = new Color(0, 255, 0, 255);
    label.gradient.topRight    = new Color(0, 255, 0, 255);
    label.gradient.bottomLeft  = new Color(255, 100, 50, 255);
    label.gradient.bottomRight = new Color(255, 100, 50, 255);
    label._doUpdate();

    const g = gradientsCreated[0];
    expect(g.spy.stops.length).toBe(2);
    expect(g.spy.stops[0].offset).toBe(0);
    expect(g.spy.stops[0].color).toBe("rgba(0,255,0,1)");
    expect(g.spy.stops[1].offset).toBe(1);
    expect(g.spy.stops[1].color).toBe("rgba(255,100,50,1)");
  });

  test("gradient is vertical (x0=x1=0) and y0 < y1", () => {
    const label = freshLabel("X");
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Line;
    label.gradient.topLeft     = new Color(0, 255, 0, 255);
    label.gradient.topRight    = new Color(0, 255, 0, 255);
    label.gradient.bottomLeft  = new Color(255, 100, 50, 255);
    label.gradient.bottomRight = new Color(255, 100, 50, 255);
    label._doUpdate();

    const g = gradientsCreated[0];
    expect(g.x0).toBe(0);
    expect(g.x1).toBe(0);
    expect(g.y0).toBeLessThan(g.y1);
  });

  test("fillStyle at every fillText is the gradient object (shared)", () => {
    const label = freshLabel("Hello");
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Line;
    label.gradient.topLeft     = new Color(0, 255, 0, 255);
    label.gradient.topRight    = new Color(0, 255, 0, 255);
    label.gradient.bottomLeft  = new Color(255, 100, 50, 255);
    label.gradient.bottomRight = new Color(255, 100, 50, 255);
    label._doUpdate();

    expect(fillStyleAtFillText.length).toBeGreaterThan(0);
    const sharedId = gradientsCreated[0].spy.id;
    for (const fs of fillStyleAtFillText) {
      expect(typeof fs).toBe("object");
      expect(fs.__spy?.id).toBe(sharedId);
    }
  });

  test("multi-line ('Hi<br/>Bye'): exactly one linearGradient per line, with distinct y ranges", () => {
    const label = freshLabel("Hi<br/>Bye");
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Line;
    label.gradient.topLeft     = new Color(0, 255, 0, 255);
    label.gradient.topRight    = new Color(0, 255, 0, 255);
    label.gradient.bottomLeft  = new Color(255, 100, 50, 255);
    label.gradient.bottomRight = new Color(255, 100, 50, 255);
    label._doUpdate();

    expect(gradientsCreated.length).toBe(2);
    const [g0, g1] = gradientsCreated;
    // Each gradient still vertical with proper orientation.
    expect(g0.x0).toBe(0); expect(g0.x1).toBe(0); expect(g0.y0).toBeLessThan(g0.y1);
    expect(g1.x0).toBe(0); expect(g1.x1).toBe(0); expect(g1.y0).toBeLessThan(g1.y1);
    // Distinct y ranges: second line is below the first.
    expect(g1.y0).toBeGreaterThan(g0.y0);
    expect(g1.y1).toBeGreaterThan(g0.y1);
  });

  test("disabled gradient with scope=Line: no linearGradient created (regression)", () => {
    const label = freshLabel("Hello");
    label.gradient.enabled = false;
    label.gradient.scope = GradientScope.Line;
    label._doUpdate();

    expect(gradientsCreated.length).toBe(0);
    expect(fillTextCalls.length).toBe(1);
    expect(fillTextCalls[0].text).toBe("Hello");
    expect(typeof fillStyleAtFillText[0]).toBe("string");
  });
});
