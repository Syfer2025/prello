# Canvas Editor book layout audit

Date: 2026-06-23
Package audited: `@hufe921/canvas-editor@0.9.136`

## Executive conclusion

Canvas Editor is viable as the new editing surface for the current Prelo MVP: paginated canvas editing, basic book presets, manual page breaks, save/reload, and raster PDF export.

It does not natively solve full book imposition/layout rules:

- no native mirrored inside/outside margins per page side
- no native per-page margin model
- no native "start chapter on next odd page" section rule
- no native section/master-page model equivalent to a book layout app

So the correct path is:

1. Keep Canvas Editor for the interactive editor.
2. Expose only the book controls that map honestly to Canvas today.
3. Build missing book rules in a separate Prelo adapter layer.
4. Fork Canvas Editor only if mirrored page preview must be visually exact inside the editor.

## Evidence

### Canvas margin API is global

Source:

- `canvas-editor-spike/src/editor/interface/Margin.ts:1`
- `canvas-editor-spike/src/editor/interface/Editor.ts:46-119`
- `node_modules/@hufe921/canvas-editor/dist/src/editor/interface/Margin.d.ts:1`
- `node_modules/@hufe921/canvas-editor/dist/src/editor/interface/Editor.d.ts:38-68`

The margin type is:

```ts
export type IMargin = [top: number, right: number, bottom: number, left: number]
```

`IEditorOption` exposes only:

```ts
margins?: IMargin
```

There is no public type for:

- `inside`
- `outside`
- left/right page side
- page parity
- page-specific margins
- margin callback/function

### Canvas layout reads one margin tuple

Source:

- `canvas-editor-spike/src/editor/core/draw/Draw.ts:452-456`
- `canvas-editor-spike/src/editor/core/draw/Draw.ts:469-500`
- `canvas-editor-spike/src/editor/core/draw/Draw.ts:1202-1208`
- `canvas-editor-spike/src/editor/core/draw/Draw.ts:1438-1447`
- `canvas-editor-spike/src/editor/core/draw/Draw.ts:2111-2123`
- `canvas-editor-spike/src/editor/core/draw/Draw.ts:2837-2845`

The layout engine calls `this.getMargins()`, which reads `this.options.margins`.

`setPaperMargin(payload)` just assigns:

```ts
this.options.margins = payload
this.render(...)
```

The margin tuple is used to calculate:

- main text height
- inner text width
- initial X/Y for row layout
- next-page Y after pagination

`getOriginalMargins()` only remaps the tuple for horizontal paper direction. It does not check page number, odd/even page, inside/outside margin, or left/right side.

### Canvas has some page-aware systems, but not margins

Source:

- `canvas-editor-spike/src/editor/interface/Header.ts:3-10`
- `canvas-editor-spike/src/editor/interface/Footer.ts:3-10`
- `canvas-editor-spike/src/editor/core/draw/frame/Header.ts`
- `canvas-editor-spike/src/editor/core/draw/frame/Footer.ts`

Header/footer have `disabledPages?: number[]` and their render/height methods receive `pageNo`.

This proves the engine can make page-aware decisions in some areas. Margins simply were not designed that way in the public API or in the core layout path.

### Manual page break is supported

Source:

- `canvas-editor-spike/src/editor/interface/PageBreak.ts:1-5`
- `canvas-editor-spike/src/editor/core/command/CommandAdapt.ts:1266-1277`
- `canvas-editor-spike/src/editor/core/draw/Draw.ts:2111-2123`
- `canvas-editor-spike/src/editor/core/draw/Draw.ts:2148-2200`

`executePageBreak()` inserts:

```ts
{ type: ElementType.PAGE_BREAK, value: WRAP }
```

The layout switches page when:

```ts
element.type === ElementType.PAGE_BREAK
```

and `_computePageList()` starts a new page after a row marked as page break.

This means "chapter starts on a new page" is supported.

### Chapter on next odd page is not native

Source:

- `canvas-editor-spike/src/editor/interface/Catalog.ts:3-11`
- `canvas-editor-spike/src/editor/core/worker/works/catalog.ts:69-111`
- `canvas-editor-spike/src/editor/core/worker/WorkerManager.ts:42-58`
- `canvas-editor-spike/src/editor/core/command/CommandAdapt.ts:2124-2126`

Canvas can compute a catalog where each title has `pageNo`.

That gives Prelo enough information to build an adapter algorithm:

1. render layout
2. call `getCatalog()`
3. find chapter titles
4. convert Canvas index to physical page number with `pageNo + 1`
5. if a chapter is on an even physical page, insert a blank page before it
6. render again
7. stop when stable or fail with a loop guard

But this is a Prelo algorithm, not a native Canvas feature. It needs its own tests and manual QA because inserting blank pages changes pagination downstream.

## Current Prelo integration

Source:

- `src/canvas-editor/book-layout-settings.ts`
- `src/canvas-editor/prelo-canvas-data.ts`
- `src/canvas-editor/prelo-canvas-units.ts`
- `src/canvas-editor/CanvasEditorHost.tsx`
- `src/product/CanvasEditorShell.tsx`

Prelo currently maps presets into Canvas as:

```ts
[top, right, bottom, left]
```

Chapters matching:

```ts
/^cap[i\u00ed]tulo\s+\d+/i
```

receive a `PAGE_BREAK` before the title.

The wrapper exposes:

```ts
setPaperMargins(margins: [number, number, number, number])
```

This is honest for global Canvas margins. It is not enough for mirrored margins.

## Current Prelo book settings remain richer than Canvas

Source:

- `src/canvas-editor/book-layout-settings.ts`
- `src/canvas-editor/prelo-canvas-types.ts`
- `src/canvas-editor/prelo-canvas-units.ts`

Prelo currently stores:

- trim id (`a5`, `6x9`, `custom`)
- physical width/height in millimeters
- margins as `top`, `bottom`, `inside`, `outside`
- document-level `facingPages`
- chapter start rule (`nextPage`, `nextOddPage`)

Canvas receives only one global margin tuple, so Prelo must preserve the book settings separately and adapt them to Canvas where possible.

## What we can safely implement now

### Book settings panel

The current Prelo-side `BookLayoutSettings` object is:

```ts
interface BookLayoutSettings {
  trimId: 'a5' | '6x9' | 'custom'
  label: string
  widthMm: number
  heightMm: number
  marginsMm: {
    top: number
    bottom: number
    inside: number
    outside: number
  }
  facingPages: boolean
  chapterStart: 'nextPage' | 'nextOddPage'
}
```

### Initial Canvas mapping

For non-facing/single page preview:

```ts
[top, outside, bottom, inside]
```

This treats the Canvas page as a right-hand page:

- left = inside
- right = outside

For facing pages:

- keep storing `inside/outside` in Prelo settings
- still send one global tuple to Canvas
- show a clear UI warning: "Canvas preview uses one global margin set; mirrored page margins are not exact yet."

Do not silently pretend the preview is mirrored.

### Chapter behavior

Phase 1:

- keep current `PAGE_BREAK` before chapters
- label it as "chapter starts on next page"

Phase 2:

- implement `chapterStart: 'nextOddPage'`
- use `getCatalog()` after layout
- insert an explicit blank page before chapters that landed on an even physical page
- cap the adjustment loop, for example max 3 passes
- test with 3, 10, 50, and 200 page manuscripts

This needs a separate spike before becoming default.

## What requires a fork or deeper engine work

### True mirrored margins inside the editor

Canvas would need a page-aware margin model, for example:

```ts
margins?: IMargin | ((pageNo: number) => IMargin)
```

Likely touch points:

- `getMargins()`
- `getOriginalMargins()`
- `getInnerWidth()`
- `getMainOuterHeight(pageNo)`
- row layout start positions
- page recomputation
- cursor positioning / hit testing
- selection range drawing
- margin indicator drawing
- export image / print mode

This is not a small toolbar feature. It changes pagination and cursor math.

### Exact PDF with mirrored margins while editor preview is global

Possible but dangerous:

- editor preview would show one layout
- exported PDF would use another layout

That breaks the core promise of WYSIWYG. Avoid this unless the UI explicitly says the PDF export is generated by a different layout engine and requires preflight preview.

## Recommendation

Use Canvas Editor, but draw the product boundary correctly:

1. Ship the Canvas editor MVP with global margins, real page sizes, manual/new-page chapters, persistence, and PDF export.
2. Add Prelo book settings with `inside/outside` as the source of truth.
3. Map those settings into Canvas honestly for now.
4. Add a visible limitation for mirrored margins in the editor preview.
5. Spike `nextOddPage` using `getCatalog()` before making it default.
6. Only fork Canvas after the MVP proves valuable and exact mirrored preview becomes the blocking requirement.

The hard truth: Canvas Editor solves the "usable paginated editor" problem. It does not fully solve "professional book layout engine" by itself.
