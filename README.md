# StyledLabel

A Cocos Creator 3.x component that renders styled text on a single canvas — like `Label`, but with HTML-like markup and inline sprites.

**Why not `RichText`?** `RichText` creates one `Label` node per segment, which is expensive. `StyledLabel` draws everything onto one off-screen canvas (TTF/system fonts) or emits GPU quads directly (BitmapFont), making it significantly cheaper for frequently-updated text.

## Files

| File | Description |
|------|-------------|
| `styled-label.ts` | The `StyledLabel` component (attach to any node) |
| `styled-label.layout.ts` | Pure layout engine — no engine dependency, fully unit-tested |

## Features

- HTML-like markup: `<color>`, `<size>`, `<b>`, `<i>`, `<u>`, `<br/>`, `<sprite>`, `<sup>`, `<sub>`
- Inline sprites from a `SpriteAtlas` (auto-sized, mixed with text on the same line)
- TTF / system font via off-screen canvas
- BitmapFont via GPU quads (no canvas, works in WebGL)
- Overflow modes: `NONE` (auto-resize), `CLAMP`, `TRUNCATE`, `SHRINK`, `ELLIPSIS`
- Horizontal / vertical alignment, margins, line spacing
- Text transform: `UPPERCASE`, `LOWERCASE`
- `<sup>` / `<sub>` for superscript / subscript alignment
- Live preview in the Cocos editor (`@executeInEditMode`)

## Supported Tags

```
<color=#rrggbb>text</color>          — hex color
<color=#rrggbbaa>text</color>        — hex color with alpha
<size=32>text</size>                 — font size override
<b>text</b>                          — bold
<i>text</i>                          — italic
<u>text</u>                          — underline
<br/>                                — line break
<sprite=frameName>                   — inline sprite (sized to fontSize)
<sprite=frameName size=32>           — inline sprite with explicit pixel height
<sup>text</sup>                      — superscript (top-aligned in line box)
<sub>text</sub>                      — subscript (bottom-aligned in line box)
```

Tags can be nested:

```
<color=#ff0000><b>bold red</b></color>
<sup><size=20>$</size></sup>2,000
```

## Usage

1. Copy `styled-label.ts` and `styled-label.layout.ts` into your project.
2. Add `StyledLabel` as a component on any node.
3. Set the `String` property with markup.

```ts
import { StyledLabel } from './styled-label';

// Get a reference to the component
const label = this.node.getComponent(StyledLabel)!;

// Plain text
label.string = 'Hello World';

// Styled text
label.string = 'Score: <color=#ffe000><b>9,800</b></color>';

// Mixed sizes — dollar sign as superscript
label.string = '<sup><size=20>$</size></sup>2,000';

// Inline sprite (requires spriteAtlas set on the component)
label.string = 'You earned <sprite=coin size=24> × 10!';

// Multi-style, multi-line
label.string = '<b>Player</b> <color=#00ff88>connected</color><br/>Level: <size=32>99</size>';

// Force a redraw after changing other properties at runtime
label.markDirty();
```

### Inspector properties

| Property | Description |
|----------|-------------|
| `String` | The text / markup to display |
| `Font` | TTF or BitmapFont asset (leave empty for system font) |
| `Font Size` | Base font size in pixels |
| `Line Height` | Fixed line height (0 = auto from font metrics) |
| `Default Color` | Color applied when no `<color>` tag is present |
| `Sprite Atlas` | Atlas used to look up `<sprite=name>` frames |
| `Align` | Horizontal (LEFT / CENTER / RIGHT) and vertical (TOP / CENTER / BOTTOM) |
| `Margin` | Left / right / top / bottom padding inside the node bounds |
| `Spacing.Line` | Extra pixels between lines |
| `Overflow` | NONE · CLAMP · TRUNCATE · SHRINK · ELLIPSIS |
| `Word Wrap` | Enable / disable automatic line wrapping |
| `Text Transform` | NONE · UPPERCASE · LOWERCASE |
| `Reload` | Click in editor to force a full rebuild |

### Overflow modes

| Mode | Behaviour |
|------|-----------|
| `NONE` | Node resizes to fit the content |
| `CLAMP` | Extra lines are hidden |
| `TRUNCATE` | Same as CLAMP |
| `SHRINK` | Font scaled down until content fits |
| `ELLIPSIS` | Last visible line is trimmed and `…` is appended |

## Tests

Tests run in Node.js with [Jest](https://jestjs.io/) — no Cocos runtime required.

```bash
cd tests/styled-label
npm install
npx jest
```

Three test suites:

| File | What it covers |
|------|----------------|
| `html-parser.test.ts` | Tag parsing, nesting, entities, `<sprite>`, `<sup>`/`<sub>` |
| `layout.test.ts` | Line breaking, overflow, alignment, fontScale, sprites, `wordBaselineY` |
| `styled-label-render.test.ts` | Component lifecycle, canvas resource creation, GFX rebind regression |

## Requirements

- Cocos Creator **3.x**
- TypeScript
