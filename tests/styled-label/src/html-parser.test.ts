import { HtmlTextParser } from "../../../assets/styled-label/styled-label.layout";

describe("HtmlTextParser", () => {
  let parser: HtmlTextParser;

  beforeEach(() => {
    parser = new HtmlTextParser();
  });

  // ── basic ────────────────────────────────────────────────────────────────

  test("empty string → empty array", () => {
    expect(parser.parse("")).toEqual([]);
  });

  test("plain text → single segment, no style", () => {
    const result = parser.parse("hello");
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("hello");
    expect(result[0].style).toBeUndefined();
  });

  test("parser is reusable across calls", () => {
    parser.parse("first");
    const result = parser.parse("second");
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("second");
  });

  // ── inline style tags ────────────────────────────────────────────────────

  test("<color=#rrggbb> sets color on wrapped text", () => {
    const result = parser.parse("<color=#ff0000>red</color>");
    const textSeg = result.find((s) => s.text === "red");
    expect(textSeg).toBeDefined();
    expect(textSeg!.style?.color).toBe("#ff0000");
  });

  test("<size=32> sets numeric size on wrapped text", () => {
    const result = parser.parse("<size=32>big</size>");
    const textSeg = result.find((s) => s.text === "big");
    expect(textSeg!.style?.size).toBe(32);
  });

  test("<b> sets bold=true", () => {
    const result = parser.parse("<b>bold</b>");
    const textSeg = result.find((s) => s.text === "bold");
    expect(textSeg!.style?.bold).toBe(true);
  });

  test("<i> sets italic=true", () => {
    const result = parser.parse("<i>italic</i>");
    const textSeg = result.find((s) => s.text === "italic");
    expect(textSeg!.style?.italic).toBe(true);
  });

  test("<u> sets underline=true", () => {
    const result = parser.parse("<u>under</u>");
    const textSeg = result.find((s) => s.text === "under");
    expect(textSeg!.style?.underline).toBe(true);
  });

  // ── line break ───────────────────────────────────────────────────────────

  test("<br/> inserts a newline segment between text", () => {
    const result = parser.parse("line1<br/>line2");
    const newlineSeg = result.find((s) => s.style?.isNewLine === true);
    expect(newlineSeg).toBeDefined();
    const texts = result.filter((s) => s.text && !s.style?.isNewLine).map((s) => s.text);
    expect(texts).toContain("line1");
    expect(texts).toContain("line2");
  });

  test("multiple <br/> creates multiple newlines", () => {
    const result = parser.parse("a<br/>b<br/>c");
    const newlines = result.filter((s) => s.style?.isNewLine);
    expect(newlines).toHaveLength(2);
  });

  // ── \n escape (parity with native Label / shared lang files) ─────────────

  test('"\\n" alone produces exactly one newline segment and no text', () => {
    const result = parser.parse("\n");
    const newlines = result.filter((s) => s.style?.isNewLine);
    expect(newlines).toHaveLength(1);
    const texts = result.filter((s) => s.text && !s.style?.isNewLine);
    expect(texts).toHaveLength(0);
  });

  test('"line1\\nline2" → line1, newline, line2', () => {
    const result = parser.parse("line1\nline2");
    const newlines = result.filter((s) => s.style?.isNewLine);
    expect(newlines).toHaveLength(1);
    const texts = result.filter((s) => s.text && !s.style?.isNewLine).map((s) => s.text);
    expect(texts).toContain("line1");
    expect(texts).toContain("line2");
  });

  test('"\\r\\n" is normalized to a single newline', () => {
    const result = parser.parse("a\r\nb");
    const newlines = result.filter((s) => s.style?.isNewLine);
    expect(newlines).toHaveLength(1);
    const texts = result.filter((s) => s.text && !s.style?.isNewLine).map((s) => s.text);
    expect(texts).toContain("a");
    expect(texts).toContain("b");
  });

  test('"a\\n\\nb" produces two consecutive newline segments', () => {
    const result = parser.parse("a\n\nb");
    const newlines = result.filter((s) => s.style?.isNewLine);
    expect(newlines).toHaveLength(2);
  });

  test("style from surrounding tag is preserved across \\n", () => {
    const result = parser.parse("<b>a\nb</b>");
    const aSeg = result.find((s) => s.text === "a");
    const bSeg = result.find((s) => s.text === "b");
    expect(aSeg).toBeDefined();
    expect(bSeg).toBeDefined();
    expect(aSeg!.style?.bold).toBe(true);
    expect(bSeg!.style?.bold).toBe(true);
  });

  test('mixing "\\n" and "<br/>" both contribute newline segments', () => {
    const result = parser.parse("a\n<br/>b");
    const newlines = result.filter((s) => s.style?.isNewLine);
    expect(newlines).toHaveLength(2);
  });

  test('leading "\\n" produces a newline segment before text', () => {
    const result = parser.parse("\nabc");
    const newlineIdx = result.findIndex((s) => s.style?.isNewLine);
    const textIdx = result.findIndex((s) => s.text === "abc");
    expect(newlineIdx).toBeGreaterThanOrEqual(0);
    expect(textIdx).toBeGreaterThan(newlineIdx);
  });

  test('trailing "\\n" produces a newline segment after text', () => {
    const result = parser.parse("abc\n");
    const newlineIdx = result.findIndex((s) => s.style?.isNewLine);
    const textIdx = result.findIndex((s) => s.text === "abc");
    expect(textIdx).toBeGreaterThanOrEqual(0);
    expect(newlineIdx).toBeGreaterThan(textIdx);
  });

  // ── sprite ───────────────────────────────────────────────────────────────

  test("<sprite=name> emits sprite segment with spriteName", () => {
    const result = parser.parse("<sprite=icon>");
    const spriteSeg = result.find((s) => s.style?.spriteName);
    expect(spriteSeg).toBeDefined();
    expect(spriteSeg!.style!.spriteName).toBe("icon");
    expect(spriteSeg!.style!.spriteSize).toBeUndefined();
  });

  test("<sprite=name size=32> sets spriteSize", () => {
    const result = parser.parse("<sprite=coin size=32>");
    const spriteSeg = result.find((s) => s.style?.spriteName);
    expect(spriteSeg!.style!.spriteName).toBe("coin");
    expect(spriteSeg!.style!.spriteSize).toBe(32);
  });

  test("<sprite=name size=16.5> accepts decimal spriteSize", () => {
    const result = parser.parse("<sprite=icon size=16.5>");
    const spriteSeg = result.find((s) => s.style?.spriteName);
    expect(spriteSeg!.style!.spriteSize).toBeCloseTo(16.5);
  });

  test("<sprite=name offsetY=0.5> sets spriteOffsetY", () => {
    const result = parser.parse("<sprite=icon offsetY=0.5>");
    const spriteSeg = result.find((s) => s.style?.spriteName);
    expect(spriteSeg!.style!.spriteName).toBe("icon");
    expect(spriteSeg!.style!.spriteOffsetY).toBeCloseTo(0.5);
    expect(spriteSeg!.style!.spriteSize).toBeUndefined();
  });

  test("<sprite=name offsetY=-0.3> accepts negative offsetY", () => {
    const result = parser.parse("<sprite=icon offsetY=-0.3>");
    const spriteSeg = result.find((s) => s.style?.spriteName);
    expect(spriteSeg!.style!.spriteOffsetY).toBeCloseTo(-0.3);
  });

  test("<sprite=name size=32 offsetY=-0.3> sets both spriteSize and spriteOffsetY", () => {
    const result = parser.parse("<sprite=coin size=32 offsetY=-0.3>");
    const spriteSeg = result.find((s) => s.style?.spriteName);
    expect(spriteSeg!.style!.spriteName).toBe("coin");
    expect(spriteSeg!.style!.spriteSize).toBe(32);
    expect(spriteSeg!.style!.spriteOffsetY).toBeCloseTo(-0.3);
  });

  test("<sprite=name offsetY=-0.25 size=32> params in any order", () => {
    const result = parser.parse("<sprite=coin offsetY=-0.25 size=32>");
    const spriteSeg = result.find((s) => s.style?.spriteName);
    expect(spriteSeg!.style!.spriteName).toBe("coin");
    expect(spriteSeg!.style!.spriteSize).toBe(32);
    expect(spriteSeg!.style!.spriteOffsetY).toBeCloseTo(-0.25);
  });

  test("<sprite=name> without offsetY leaves spriteOffsetY undefined", () => {
    const result = parser.parse("<sprite=icon>");
    const spriteSeg = result.find((s) => s.style?.spriteName);
    expect(spriteSeg!.style!.spriteOffsetY).toBeUndefined();
  });

  // ── nested / inherited styles ────────────────────────────────────────────

  test("nested tags: inner inherits outer style", () => {
    const result = parser.parse("<color=#ffffff><b>text</b></color>");
    const textSeg = result.find((s) => s.text === "text");
    expect(textSeg!.style?.color).toBe("#ffffff");
    expect(textSeg!.style?.bold).toBe(true);
  });

  test("inner tag overrides outer for same property", () => {
    const result = parser.parse("<color=#ff0000><color=#00ff00>green</color></color>");
    const textSeg = result.find((s) => s.text === "green");
    expect(textSeg!.style?.color).toBe("#00ff00");
  });

  test("sibling tags do not leak styles", () => {
    const result = parser.parse("<b>bold</b>normal");
    const normalSeg = result.find((s) => s.text === "normal");
    expect(normalSeg!.style?.bold).toBeUndefined();
  });

  // ── HTML entities ────────────────────────────────────────────────────────

  test("&lt; → <", () => {
    const result = parser.parse("&lt;");
    expect(result.some((s) => s.text?.includes("<"))).toBe(true);
  });

  test("&gt; → >", () => {
    const result = parser.parse("&gt;");
    expect(result.some((s) => s.text?.includes(">"))).toBe(true);
  });

  test("&amp; → &", () => {
    const result = parser.parse("&amp;");
    expect(result.some((s) => s.text?.includes("&"))).toBe(true);
  });

  test('&quot; → "', () => {
    const result = parser.parse("&quot;");
    expect(result.some((s) => s.text?.includes('"'))).toBe(true);
  });

  test("&apos; → '", () => {
    const result = parser.parse("&apos;");
    expect(result.some((s) => s.text?.includes("'"))).toBe(true);
  });

  // ── mixed content ────────────────────────────────────────────────────────

  test("mixed: plain + bold + plain produces 3 distinct segments", () => {
    const result = parser.parse("hello <b>world</b> end");
    const textSegs = result.filter((s) => s.text && !s.style?.isNewLine && !s.style?.spriteName);
    // Texts should include 'hello ', 'world', ' end' (or similar after adjacent merging)
    const allText = textSegs.map((s) => s.text).join("");
    expect(allText).toContain("hello");
    expect(allText).toContain("world");
    expect(allText).toContain("end");
    // Bold segment should exist
    const boldSeg = result.find((s) => s.style?.bold && s.text === "world");
    expect(boldSeg).toBeDefined();
  });

  test("text + sprite + text", () => {
    const result = parser.parse("score<sprite=coin>bonus");
    expect(result.some((s) => s.text === "score")).toBe(true);
    expect(result.some((s) => s.style?.spriteName === "coin")).toBe(true);
    expect(result.some((s) => s.text === "bonus")).toBe(true);
  });
});

// ── sup / sub (inline vertical align) ────────────────────────────────────────

describe("HtmlTextParser — sup/sub", () => {
  let parser: HtmlTextParser;
  beforeEach(() => {
    parser = new HtmlTextParser();
  });

  test('<sup>text</sup> → vAlign: "top"', () => {
    const result = parser.parse("<sup>$</sup>");
    const textSeg = result.find((s) => s.text === "$");
    expect(textSeg).toBeDefined();
    expect(textSeg!.style?.vAlign).toBe("top");
  });

  test('<sub>text</sub> → vAlign: "bottom"', () => {
    const result = parser.parse("<sub>x</sub>");
    const textSeg = result.find((s) => s.text === "x");
    expect(textSeg).toBeDefined();
    expect(textSeg!.style?.vAlign).toBe("bottom");
  });

  test("<sup><size=20>$</size></sup>2,000 — $ has size=20 and vAlign=top", () => {
    const result = parser.parse("<sup><size=20>$</size></sup>2,000");
    const dollarSeg = result.find((s) => s.text === "$");
    expect(dollarSeg).toBeDefined();
    expect(dollarSeg!.style?.size).toBe(20);
    expect(dollarSeg!.style?.vAlign).toBe("top");
  });

  test("<sup><size=20>$</size></sup>2,000 — 2,000 has no vAlign", () => {
    const result = parser.parse("<sup><size=20>$</size></sup>2,000");
    const moneySeg = result.find((s) => s.text === "2,000");
    expect(moneySeg).toBeDefined();
    expect(moneySeg!.style?.vAlign).toBeUndefined();
  });

  test("<sup> inherits parent color", () => {
    const result = parser.parse("<color=#ff0000><sup>X</sup></color>");
    const textSeg = result.find((s) => s.text === "X");
    expect(textSeg!.style?.color).toBe("#ff0000");
    expect(textSeg!.style?.vAlign).toBe("top");
  });

  test("after </sup>, text has no vAlign", () => {
    const result = parser.parse("<sup>A</sup>B");
    const bSeg = result.find((s) => s.text === "B");
    expect(bSeg).toBeDefined();
    expect(bSeg!.style?.vAlign).toBeUndefined();
  });

  test("<sup> and <sub> siblings do not leak vAlign to each other", () => {
    const result = parser.parse("<sup>A</sup><sub>B</sub>");
    const aSeg = result.find((s) => s.text === "A");
    const bSeg = result.find((s) => s.text === "B");
    expect(aSeg!.style?.vAlign).toBe("top");
    expect(bSeg!.style?.vAlign).toBe("bottom");
  });
});
