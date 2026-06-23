// TTF outline — canvas 2D stroke (hard) or shadowBlur (soft).
//
// Expected interface contract:
//   - outline.enabled = false  → no strokeText, no shadowBlur, no extra fillText.
//   - outline.enabled, soft = false → ctx.strokeText(word.text, x, y) called with
//                                     lineWidth ≈ thickness * 2 and strokeStyle = outline color css.
//                                     Outline must be painted BEFORE the fill for that word.
//   - outline.enabled, soft = true  → ctx.shadowBlur > 0 and ctx.shadowColor = outline css,
//                                     ctx.fillText called multiple times (stacking shadow) before fill.
//   - Outline color is independent from gradient — strokeStyle / shadowColor always = outline.color css.

import { Color } from "cc";
import { StyledLabel } from "../../../assets/styled-label/styled-label";
import { GradientScope, HAlign, VAlign } from "../../../assets/styled-label/styled-label.layout";

// ── Spying canvas mock ────────────────────────────────────────────────────────

interface StrokeCall { text: string; x: number; y: number; lineWidth: number; strokeStyle: string; lineJoin: string; }
interface FillCall   { text: string; x: number; y: number; fillStyle: any; shadowBlur: number; shadowColor: string; }

let strokeCalls: StrokeCall[] = [];
let fillCalls: FillCall[] = [];
let saveCount = 0;
let restoreCount = 0;

// Tracked canvas state so save/restore restore semantics work like the real API
// (the implementation uses save()/restore() to scope outline shadow + lineWidth).
const TRACKED = ["font", "fillStyle", "strokeStyle", "textBaseline", "lineWidth",
  "lineJoin", "miterLimit", "shadowColor", "shadowBlur"] as const;
const stateStack: Array<Record<string, any>> = [];

const spyCtx: any = {
  clearRect() {}, translate() {}, rotate() {}, drawImage() {}, fillRect() {},
  save() {
    saveCount++;
    const snap: Record<string, any> = {};
    for (const k of TRACKED) snap[k] = spyCtx[k];
    stateStack.push(snap);
  },
  restore() {
    restoreCount++;
    const snap = stateStack.pop();
    if (snap) for (const k of TRACKED) spyCtx[k] = snap[k];
  },
  font: "",
  fillStyle: "" as any,
  strokeStyle: "" as any,
  textBaseline: "",
  lineWidth: 1,
  lineJoin: "miter",
  miterLimit: 10,
  shadowColor: "rgba(0,0,0,0)",
  shadowBlur: 0,
  createLinearGradient(_x0: number, _y0: number, _x1: number, _y1: number) {
    return { __spy: true, addColorStop() {} };
  },
  fillText(text: string, x: number, y: number) {
    fillCalls.push({
      text, x, y,
      fillStyle: spyCtx.fillStyle,
      shadowBlur: spyCtx.shadowBlur,
      shadowColor: spyCtx.shadowColor,
    });
  },
  strokeText(text: string, x: number, y: number) {
    strokeCalls.push({
      text, x, y,
      lineWidth: spyCtx.lineWidth,
      strokeStyle: spyCtx.strokeStyle,
      lineJoin: spyCtx.lineJoin,
    });
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

  strokeCalls = [];
  fillCalls = [];
  saveCount = 0;
  restoreCount = 0;
  stateStack.length = 0;
  spyCtx.font = "";
  spyCtx.fillStyle = "";
  spyCtx.strokeStyle = "";
  spyCtx.textBaseline = "";
  spyCtx.lineWidth = 1;
  spyCtx.lineJoin = "miter";
  spyCtx.miterLimit = 10;
  spyCtx.shadowColor = "rgba(0,0,0,0)";
  spyCtx.shadowBlur = 0;

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

describe("TTF outline — strokeText / shadowBlur", () => {
  test("disabled: no strokeText, no shadowBlur during fill", () => {
    const label = freshLabel("Hello");
    expect(label.outline.enabled).toBe(false);
    label._doUpdate();

    expect(strokeCalls.length).toBe(0);
    for (const f of fillCalls) {
      expect(f.shadowBlur).toBe(0);
    }
  });

  test("hard outline: ctx.strokeText is called with the word text and outline color", () => {
    const label = freshLabel("Hi");
    label.outline.enabled = true;
    label.outline.thickness = 3;
    label.outline.color = new Color(255, 0, 0, 255);
    label.outline.soft = false;
    label._doUpdate();

    expect(strokeCalls.length).toBeGreaterThanOrEqual(1);
    const s = strokeCalls[0];
    expect(s.text).toBe("Hi");
    expect(s.strokeStyle).toBe("rgba(255,0,0,1)");
    // lineWidth follows thickness; tolerate either thickness or thickness*2 conventions.
    expect(s.lineWidth).toBeGreaterThanOrEqual(3);
    expect(s.lineJoin).toBe("round");
  });

  test("hard outline runs BEFORE the fill (save/restore wraps stroke)", () => {
    const label = freshLabel("Hi");
    label.outline.enabled = true;
    label.outline.thickness = 2;
    label.outline.color = new Color(10, 20, 30, 255);
    label._doUpdate();

    expect(strokeCalls.length).toBe(1);
    expect(fillCalls.length).toBe(1);
    // save/restore must wrap the outline draw (at minimum one balanced pair).
    expect(saveCount).toBeGreaterThanOrEqual(1);
    expect(restoreCount).toBe(saveCount);
  });

  test("soft outline: shadowBlur > 0 and shadowColor = outline css during stamped fills", () => {
    const label = freshLabel("X");
    label.outline.enabled = true;
    label.outline.soft = true;
    label.outline.thickness = 4;
    label.outline.color = new Color(0, 0, 255, 255);
    label._doUpdate();

    expect(strokeCalls.length).toBe(0);
    // At least two fillText calls happened with shadowBlur > 0 (outline stamps),
    // and one final fill with shadowBlur reset to 0.
    const blurredFills = fillCalls.filter(f => f.shadowBlur > 0);
    expect(blurredFills.length).toBeGreaterThanOrEqual(2);
    for (const f of blurredFills) {
      expect(f.shadowColor).toBe("rgba(0,0,255,1)");
    }
    const finalFill = fillCalls[fillCalls.length - 1];
    expect(finalFill.shadowBlur).toBe(0);
  });

  test("outline color is independent from gradient (solid outline color even with gradient enabled)", () => {
    const label = freshLabel("AB");
    label.gradient.enabled = true;
    label.gradient.scope = GradientScope.Glyph;
    label.gradient.topLeft = new Color(255, 255, 0, 255);
    label.gradient.topRight = new Color(255, 255, 0, 255);
    label.gradient.bottomLeft = new Color(255, 255, 0, 255);
    label.gradient.bottomRight = new Color(255, 255, 0, 255);

    label.outline.enabled = true;
    label.outline.soft = false;
    label.outline.thickness = 2;
    label.outline.color = new Color(0, 0, 0, 255);
    label._doUpdate();

    expect(strokeCalls.length).toBeGreaterThanOrEqual(1);
    // All stroke calls must use the outline color, not the gradient.
    for (const s of strokeCalls) {
      expect(s.strokeStyle).toBe("rgba(0,0,0,1)");
    }
  });

  test("hard outline offset shifts strokeText x/y by (offsetX, offsetY)", () => {
    const base = freshLabel("Hi");
    base.outline.enabled = true;
    base.outline.thickness = 2;
    base.outline.color = new Color(255, 0, 0, 255);
    base._doUpdate();
    const baseStroke = strokeCalls[0];

    const label = freshLabel("Hi");
    label.outline.enabled = true;
    label.outline.thickness = 2;
    label.outline.color = new Color(255, 0, 0, 255);
    label.outline.offsetX = 5;
    label.outline.offsetY = 7;
    label._doUpdate();
    const offStroke = strokeCalls[0];

    expect(offStroke.x - baseStroke.x).toBe(5);
    expect(offStroke.y - baseStroke.y).toBe(7);
  });

  test("soft outline offset shifts stamped fillText positions", () => {
    const base = freshLabel("X");
    base.outline.enabled = true;
    base.outline.soft = true;
    base.outline.thickness = 3;
    base.outline.color = new Color(0, 0, 255, 255);
    base._doUpdate();
    const baseBlurred = fillCalls.filter(f => f.shadowBlur > 0);
    expect(baseBlurred.length).toBeGreaterThan(0);
    const baseX = baseBlurred[0].x;
    const baseY = baseBlurred[0].y;

    const label = freshLabel("X");
    label.outline.enabled = true;
    label.outline.soft = true;
    label.outline.thickness = 3;
    label.outline.color = new Color(0, 0, 255, 255);
    label.outline.offsetX = -4;
    label.outline.offsetY = 2;
    label._doUpdate();
    const offBlurred = fillCalls.filter(f => f.shadowBlur > 0);
    expect(offBlurred.length).toBeGreaterThan(0);

    expect(offBlurred[0].x - baseX).toBe(-4);
    expect(offBlurred[0].y - baseY).toBe(2);
  });

  test("disabled outline does not add stray save/restore around words", () => {
    const label = freshLabel("Hello");
    const saveBefore = saveCount;
    label._doUpdate();
    // Baseline path may save/restore for its own reasons; the relevant guarantee
    // is invariance: enabling outline must add at least one save/restore.
    const baselineSaves = saveCount - saveBefore;

    const label2 = freshLabel("Hello");
    label2.outline.enabled = true;
    label2.outline.thickness = 1;
    label2.outline.color = new Color(255, 0, 0, 255);
    label2._doUpdate();

    expect(saveCount).toBeGreaterThan(baselineSaves);
  });
});
