# Stack Tag Indicator - Implementation Summary

## Objective
Add visual "Stack" indicator to columns with #stack tag, matching the style of "Row 2", "Row 3" indicators.

## Changes Made

### 1. BoardRenderer.js - Added Stack Indicator Logic
**File**: [src/html/boardRenderer.js](../src/html/boardRenderer.js)

**Lines 1725-1727**: Added stack detection and indicator creation
```javascript
// Show stack indicator if column has #stack tag and tagVisibility is 'all'
const isStacked = /#stack\b/i.test(column.title);
const stackIndicator = (window.currentTagVisibility === 'all' && isStacked) ? `<span class="column-stack-tag">Stack</span>` : '';
```

**Line 1742**: Inserted stack indicator into column title HTML
```javascript
<div class="column-title-text markdown-content" onclick="handleColumnTitleClick(event, '${column.id}')">${renderedTitle}${rowIndicator}${stackIndicator}</div>
```

### 2. CSS Styling - Added Visual Style for Stack Indicators
**File**: [src/html/webview.css](../src/html/webview.css)

#### Updated Layout Tag Styling (Lines 3020-3028)
Added #stack to existing layout tag styles:
```css
/* Special styling for span and row tags */
.kanban-tag[data-tag^="span"],
.kanban-tag[data-tag^="row"],
.kanban-tag[data-tag^="stack"] {
  color: #666;
  background-color: transparent;
  border: 1px dashed #999;
  opacity: 0.7;
}
```

#### Added Column Indicator Styling (Lines 3030-3044)
Created matching styles for .column-row-tag and .column-stack-tag:
```css
/* Layout tag indicators in column titles (Row 2, Row 3, Stack) */
.column-row-tag,
.column-stack-tag {
  color: #666;
  background-color: transparent;
  border: 1px dashed #999;
  opacity: 0.7;
  padding: 0px 4px;
  border-radius: 4px;
  font-size: 0.85em;
  font-weight: 500;
  white-space: nowrap;
  user-select: none;
  margin-left: 4px;
}
```

#### Updated Tag Visibility Rules (Lines 4011-4024)
Added #stack to visibility control rules:
```css
/* Standard Tags: Hide #span, #row, and #stack tags only */
.tag-visibility-allexcludinglayout .kanban-tag[data-tag^="span"],
.tag-visibility-allexcludinglayout .kanban-tag[data-tag^="row"],
.tag-visibility-allexcludinglayout .kanban-tag[data-tag^="stack"] {
    display: none !important;
}

/* Custom Tags Only: Hide #span, #row, #stack, and all configured tags */
.tag-visibility-customonly .kanban-tag[data-tag^="span"],
.tag-visibility-customonly .kanban-tag[data-tag^="row"],
.tag-visibility-customonly .kanban-tag[data-tag^="stack"],
.tag-visibility-customonly .kanban-tag:not([data-tag^="@"]):not(.custom-tag) {
    display: none !important;
}
```

## Visual Result

Columns with #stack tag now display a "Stack" indicator next to the title:
- Appears as a subtle badge with dashed border
- Same visual style as "Row 2", "Row 3" indicators
- Only visible when `tagVisibility === 'all'`
- Hidden for all other tagVisibility settings

## Consistency

All layout tags now have matching behavior:
- #row tags → "Row 2", "Row 3", "Row 4" indicators
- #stack tag → "Stack" indicator
- #span tags → (no indicator, but tag hidden properly)

## Testing
- ✅ TypeScript compilation: No errors
- ✅ Build process: Successful
- ✅ ESLint: Only pre-existing warnings

## Files Modified
1. [src/html/boardRenderer.js](../src/html/boardRenderer.js) - Added stack indicator logic
2. [src/html/webview.css](../src/html/webview.css) - Added CSS styling for stack indicators
