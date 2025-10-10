# Visual Kanban-Style Export Selector

## Changes Made

Completely redesigned the export selector to visually match the kanban board layout!

### Visual Layout

**OLD**: Tree with checkboxes (hierarchical list)
```
☑ Full Kanban
  ☐ Row 1
    ☐ Stack 1 (Todo, In Progress)
      ☐ Column: Todo
      ☐ Column: In Progress
```

**NEW**: Visual grid matching kanban layout
```
┌─────────────────────────────────────┐
│         Full Kanban                 │  ← Click to select all
└─────────────────────────────────────┘

┌───────────────────────────────────────────────────────┐
│ Row 1                                                 │  ← Click label to select row
│ ┌──────────┐  ┌────────┐  ┌────────────┐             │
│ │  Stack   │  │ Column │  │  Column 2  │             │
│ │ ────────┼  │        │  │            │             │  ← Horizontal layout
│ │ Column A │  └────────┘  └────────────┘             │
│ │ Column B │                                          │
│ └──────────┘                                          │  ← Stack is vertical
└───────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────┐
│ Row 2                                                 │
│ ┌────────────┐  ┌────────────┐                       │
│ │  Archive   │  │  Done      │                       │
│ └────────────┘  └────────────┘                       │
└───────────────────────────────────────────────────────┘
```

### Key Features

1. **Rows are horizontal sections** - Each row is its own container
2. **Stacks are vertical boxes** - Dashed border, columns stack vertically inside
3. **Regular columns are horizontal buttons** - Stand-alone columns in the row
4. **Stacked columns are horizontal lines** - Inside the vertical stack container
5. **Border highlights show selection** - No checkboxes, just visual feedback
6. **Tight, compact layout** - Efficient use of space
7. **Click anywhere to toggle** - Whole element is clickable

### Selection Visual Feedback

- **Not selected**: Gray border, subtle background
- **Hovered**: Blue border (focus color), lighter background
- **Selected**: Blue border with glow (box-shadow), highlighted background, bold text

### Implementation

**File**: [exportTreeUI.js](../src/html/utils/exportTreeUI.js)
- Completely rewritten render logic
- No more checkboxes
- Visual grid with click handlers
- Parent-child selection still works

**File**: [webview.css](../src/html/webview.css:2291-2461)
- New CSS classes for visual layout
- `.export-selector-row` - Horizontal row container
- `.export-selector-stack` - Vertical stack with dashed border
- `.export-selector-column` - Regular column button
- `.export-selector-stacked-column` - Column inside stack (horizontal line)
- Smooth transitions on hover/select

## Visual Design Details

### Colors & Borders
- Normal: `var(--vscode-panel-border)` gray border
- Selected: `var(--vscode-focusBorder)` blue border + box-shadow glow
- Hover: Blue border, lighter background

### Spacing
- Main gap: 6px between rows
- Column gap: 4px between columns in row
- Stack gap: 2px between columns in stack
- Tight padding: 4-8px

### Typography
- Row labels: 0.9em, font-weight 500
- Stack label: 0.75em, italic, gray
- Regular columns: 0.9em
- Stacked columns: 0.85em

## Build Status

✅ **Build successful** - Ready to test!

## Testing

Reload VS Code window, then:

1. Click "Export" from main menu
2. See the new visual selector
3. Click "Full Kanban" to select all
4. Click individual rows, stacks, or columns
5. Notice the border highlights (no checkboxes!)
6. Export dialog should still work the same way

## Summary

The export selector now **visually represents your kanban board structure**:
- Rows flow horizontally
- Stacks are vertical containers
- Columns are positioned as they appear in the board
- Selection is shown with border highlights, not checkboxes
- Compact, efficient layout

Much more intuitive and matches the actual kanban view! 🎨
