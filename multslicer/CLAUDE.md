# multiSlicerDarwinbox — Claude Code Guide

## Project Overview

A **Power BI custom visual** built with `powerbi-visuals-tools` (pbiviz). It renders a multi-section slicer panel supporting list, dropdown, date range, relative date, numeric, and time slicer types.

- **Visual name:** multiSlicerDarwinbox
- **Version:** 2.5.0.0
- **API version:** 5.8.0
- **Author:** Shannon Pereira (shannon.pereira@datellers.com)
- **Remote:** Azure DevOps — `https://dev.azure.com/datellers/Datellers/_git/darwinbox-india`

---

## Dev Commands

```bash
# Start dev server (hot reload at https://localhost:8080)
npx pbiviz start

# Package visual for production (.pbiviz file)
npx pbiviz package

# Lint source
npm run eslint

# Type-check only (no emit)
npx tsc --noEmit

# Type-check with noImplicitAny (stricter, catches untyped params)
npx tsc --noEmit --noImplicitAny
```

> If port 8080 is already in use, find and kill the process:
> ```bash
> netstat -ano | grep ":8080" | grep LISTENING   # get PID
> taskkill /PID <PID> /F
> ```

---

## Branch Workflow

- **Main integration branch:** `multislicerDev`
- **Active dev branch:** `asgarMultislicerDev`

```bash
git fetch origin multislicerDev          # fetch latest from integration branch
git merge origin/multislicerDev          # merge into current branch
```

---

## Project Structure

```
src/
  visual.ts                              # Entry point — Visual class
  interfaces.ts                          # All shared TypeScript interfaces
  Functions/
    dateFunctions.ts                     # Relative date calculations (In Last/Next/This)
    designFunctions.ts                   # Label/font styling helpers
    visualTransform.ts                   # Data transform — PBI dataView → IViewModel
    hierarchyFunctions.ts                # Hierarchy slicer tree building
    timeFunction.ts                      # Time utilities
    Filter/
      applyFilter.ts                     # Filter collection & PBI tuple filter application
      defaultFiltering.ts                # Force-select default filtering logic
  RenderDesignElements/
    DateSlicer/
      renderDate.ts                      # Absolute & relative date slicer rendering
      renderRelativeDate.ts              # Relative date UI (In Last/Next/This/Before/After)
    renderList.ts                        # List/checkbox slicer
    renderNumber.ts                      # Numeric slicer with condition dropdown
    renderTimePicker.ts                  # Time slicer
    renderChip.ts                        # Chip/tag rendering for dropdown selections
    addFilter.ts                         # Add-filter button logic
  Settings/
    settings.ts                          # Visual settings class definitions
    createCustomSettings.ts              # Build ICustomSettings from PBI dataView
    createFormattingCard.ts              # Power BI formatting pane card builders
    formatCardFunctions.ts               # Formatting card helper functions
    objectEnumerationUtility.ts          # PBI object property getter utilities
style/
  visual.less                            # Visual stylesheet
capabilities.json                        # PBI capabilities declaration
pbiviz.json                              # Visual metadata
tsconfig.json                            # TypeScript config
eslint.config.js                         # ESLint flat config
```

---

## Key Architecture

### Data flow
```
PBI dataView → visualTransform() → IViewModel (sections[] + slicers[]) → render functions → DOM
```

### Filter flow
```
User interaction → collectListSelectedData / collectDateTimeSelectedData / collectNumericSelectedData
→ applyFilter() → ITupleFilter → host.applyJsonFilter()
```

### Cross-filter flow (2.5.0.0)
```
change / pointerup on the visual root  →  scheduleCrossFilter() [30ms debounce]
→ applyCrossFilter()
→ getSelectedDataFromUI({ silent: true })     // same collectors as Apply, no side effects
→ buildSlicerMasks()   // one Uint8Array per slicer: union of its selected rows
→ buildAllowedMasks()  // prefix/suffix intersections = "every slicer except mine"
→ toggle .crossFilteredOut on each .checkboxDiv
```

Power BI does **not** apply a visual's own JSON filter back to that visual's dataView, so
every field always receives the full row set and nothing narrows anything else on its own.
Cross-filtering therefore has to be computed inside the visual, from the row indexes
`visualTransform()` already records on each list value.

Key points:
- A slicer is never evaluated against its own mask, so the list you are clicking in never
  collapses to the value you just ticked.
- A ticked value stays visible even once it becomes unreachable — a selection never
  vanishes silently.
- Only `list` and `dropdown` slicers are narrowed. `dateRange`, `numeric` and `time`
  contribute their selection as a constraint but keep their own bounds.
- `.crossFilteredOut` is deliberately a **separate** class from `.hidden`, so the search
  box and cross-filtering don't overwrite each other's visibility decisions.
- Select All (list, dropdown and "select all search results") skips cross-filtered rows,
  so it can't reintroduce combinations that have no data.
- Controlled by the **Filtering → Filter other fields** toggle (`filtering.crossFilter`,
  default `true`). Turning it off restores the pre-2.5 behaviour exactly.
- Pure maths lives in `Functions/Filter/crossFilterMath.ts` with no d3/PBI/DOM imports so
  it can be unit tested standalone.

### Slicer types (`SlicerType` enum)
| Type | Renderer |
|------|----------|
| `list` | `renderListSlicer` |
| `dropdown` | `Visual.renderDropdownSlicer` |
| `dateRange` | `renderDateSlicer` |
| `numeric` | `renderNumberSlicer` |
| `time` | `renderTimeSlicer` |

---

## Known Bugs & Fixes Applied

### Date +1 day bug
- **Root cause:** `new Date("YYYY-MM-DD")` parses date-only ISO strings as UTC midnight, causing timezone drift.
- **Fix:** Use `moment("YYYY-MM-DD").toDate()` everywhere dates are parsed from string attributes or data values — this always parses in local time.
- **Affected files:** `applyFilter.ts:collectDateTimeSelectedData`, `renderDate.ts:getInitialDateRange`

### Numeric "greater than X includes X" bug
- **Root cause:** Dummy boundary values (`5.000001`) were pushed into the PBI tuple filter. PBI rounds them for integer fields, so `5.000001` matched rows with value `5`.
- **Fix:** Removed the dummy min/max boundary pushes from `collectNumericSelectedData`. Actual data values filtered by `>= minValue` (with the 0.000001 offset) are sufficient.
- **Affected file:** `applyFilter.ts:collectNumericSelectedData`

### Fields did not narrow each other (2.5.0.0)
- **Root cause:** Power BI excludes a visual from the filter that visual applies, so the
  dataView is never self-filtered and no field constrained any other.
- **Fix:** In-visual cross-filtering over row indexes — see the Cross-filter flow above.
- **Affected files:** new `Functions/Filter/crossFilter.ts` + `crossFilterMath.ts`;
  hooks in `visual.ts` and `renderList.ts`; `slicerQuery` added to `ISelectedData`.

### Style tag and document listener leaks (2.5.0.0)
- **Root cause:** `applyInjectedCSS()` appended a new `<style>` to `document.head` on every
  `update()`, and `bindOutsideClickHandler()` added a new `document` click listener on
  every `update()` without removing the previous one.
- **Fix:** One style element created in the constructor and rewritten in place; the
  outside-click handler bound once in the constructor and removed in `destroy()`.

---

## Known issues not yet fixed

- `renderList.ts` binds `checkboxDivs` with the key `` `${slicer.displayName}-${d.value}}` ``.
  In a hierarchy slicer, two nodes under different parents can share a label (two teams
  both called "Ops"), which collides the key and silently drops one of them from the
  `.enter()` selection. The key should include `d.uid`, which is already unique per path.
- `getSelectedDataFromUI()` uses document-wide `selectAll`. Power BI sandboxes each visual
  in its own iframe so this is safe today, but it would break if sandboxing were ever off
  and two instances shared a page.
- `pbiviz.json` still has `"supportUrl": "darwinbox"` and an empty `gitHubUrl`. Both must
  be real URLs before submission.

---

## TypeScript Notes

- `tsconfig.json` has `skipLibCheck: true` — suppresses type errors in `node_modules` (needed due to conflicting `powerbi-visuals-api` declarations across packages).
- `@types/d3-dispatch` is pinned to `3.0.6` via `package.json` overrides — pbiviz tools ship with TypeScript 4.9.5 internally, and `3.0.7` uses `const` type parameters that require TypeScript 5.0+.
- When casting PBI SDK types that lack index signatures (e.g., `ISQExpr`, `Selector`, `DesignSettings`), use `(obj as any)['key']` rather than direct bracket access.
- Prefer `moment(value).toDate()` over `new Date(value)` when parsing date strings to avoid UTC vs local time issues.

---

## Dependencies of Note

| Package | Purpose |
|---------|---------|
| `powerbi-visuals-tools` | pbiviz CLI (dev server + packager) |
| `powerbi-visuals-api ~5.8.0` | PBI visual API types |
| `d3 ^7.9.0` | DOM manipulation & data utilities |
| `moment ^2.30.1` | Date parsing & formatting (always parses in local time) |
| `nouislider ^15.7.2` | Date range slider |
| `antd ^5.26.6` | UI components |
| `lodash ^4.17.21` | Utility functions |
| `@types/lodash ^4.17.24` | Lodash type definitions |
