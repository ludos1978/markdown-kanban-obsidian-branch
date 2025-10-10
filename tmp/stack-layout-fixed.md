# Fixed Stack Layout & Vertical Row Labels

## Changes Made

### 1. Fixed Stack Width
**File**: [webview.css](../src/html/webview.css:2385-2396)

Stacks now have a fixed width of 200px:
```css
.export-selector-stack {
  width: 200px;
  flex-shrink: 0;  /* Prevents shrinking */
}
```

This ensures stacks maintain their vertical layout properly.

### 2. Vertical Row Labels
**File**: [webview.css](../src/html/webview.css:2356-2369)

Row labels now display vertically on the left:
```css
.export-selector-row-label {
  writing-mode: vertical-rl;  /* Vertical text */
  transform: rotate(180deg);   /* Reads top-to-bottom */
  padding: 8px 4px;
  flex-shrink: 0;
}
```

### 3. Updated Row Layout
**File**: [webview.css](../src/html/webview.css:2340-2348)

Row container now uses flexbox properly:
```css
.export-selector-row {
  display: flex;
  gap: 8px;
  /* Label on left, columns on right */
}
```

## Visual Result

```
┌─────────────────────────────────────────────────────┐
│ R │ ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│ o │ │  Stack   │  │ Column 1 │  │ Column 2 │       │
│ w │ │ ──────── │  │          │  │          │       │
│   │ │ Column A │  └──────────┘  └──────────┘       │
│ 1 │ │ Column B │                                    │
│   │ │ Column C │  ← Stack is 200px wide             │
│   │ └──────────┘     and properly vertical          │
└─────────────────────────────────────────────────────┘
     ↑
   Vertical
   row label
```

## Key Improvements

1. **Stacks maintain 200px width** - No more collapsing or weird layouts
2. **Row labels are vertical** - Saves horizontal space, looks cleaner
3. **Better alignment** - Columns container uses flex properly
4. **Flex-shrink: 0** - Prevents stacks from being squished

## Build Status

✅ **Build successful**

## Test Now

Reload VS Code window and check the export dialog:
- Row labels should be vertical on the left
- Stacks should be exactly 200px wide
- Stacked columns should line up vertically inside

The layout should now properly match a kanban board view!
