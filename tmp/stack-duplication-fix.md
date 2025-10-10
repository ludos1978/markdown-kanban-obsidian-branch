# Stack Tag Duplication Fix

## Problem
When `tagVisibility === 'all'`, both the `#stack` tag AND the "Stack" indicator were showing up, resulting in duplicate displays of the same information in different formats.

## Root Cause
The layout tags (#row, #stack) were being displayed twice:
1. As rendered markdown tags (e.g., `#stack`)
2. As visual indicators (e.g., "Stack" label)

This happened because:
- When `tagVisibility === 'all'`, the `filterTagsFromText()` function doesn't filter anything
- So the `#stack` tag remained in the markdown content
- Then we also added a separate "Stack" indicator

## Solution
Always remove #row and #stack tags from the displayed column title before rendering, regardless of `tagVisibility` setting. Then add back the visual indicators separately.

This matches how the code already handled #row tags in some places (like webview.js).

## Files Modified

### 1. src/html/boardRenderer.js (Line 1715)
```javascript
// Always remove #row and #stack from display, indicators added separately
displayTitle = displayTitle.replace(/#row\d+/gi, '').replace(/#stack\b/gi, '').trim();
```

### 2. src/html/webview.js (Lines 1727-1732)
```javascript
const displayTitle = column.title.replace(/#row\d+/gi, '').replace(/#stack\b/gi, '').trim();
const renderedTitle = displayTitle ? renderMarkdown(displayTitle) : '';
const rowIndicator = (window.currentTagVisibility === 'all' && newRow > 1) ? `<span class="column-row-tag">Row ${newRow}</span>` : '';
const isStacked = /#stack\b/i.test(column.title);
const stackIndicator = (window.currentTagVisibility === 'all' && isStacked) ? `<span class="column-stack-tag">Stack</span>` : '';
titleElement.innerHTML = renderedTitle + rowIndicator + stackIndicator;
```

### 3. src/html/dragDrop.js (Lines 2028-2033)
```javascript
const displayTitle = columnData.title.replace(/#row\d+/gi, '').replace(/#stack\b/gi, '').trim();
const renderedTitle = window.renderMarkdown ? window.renderMarkdown(displayTitle) : displayTitle;
const rowIndicator = (window.currentTagVisibility === 'all' && newRow > 1) ? `<span class="column-row-tag">Row ${newRow}</span>` : '';
const isStacked = /#stack\b/i.test(columnData.title);
const stackIndicator = (window.currentTagVisibility === 'all' && isStacked) ? `<span class="column-stack-tag">Stack</span>` : '';
titleElement.innerHTML = renderedTitle + rowIndicator + stackIndicator;
```

### 4. src/html/menuOperations.js (2 locations)

**Lines 2260-2268:**
```javascript
const displayTitle = newTitle.replace(/#row\d+/gi, '').replace(/#stack\b/gi, '').trim();
const renderedTitle = displayTitle ? (window.renderMarkdown ? window.renderMarkdown(displayTitle) : displayTitle) : '';
const columnRow = window.getColumnRow ? window.getColumnRow(newTitle) : 1;
const rowIndicator = (window.currentTagVisibility === 'all' && columnRow > 1) ? `<span class="column-row-tag">Row ${columnRow}</span>` : '';
const isStacked = /#stack\b/i.test(newTitle);
const stackIndicator = (window.currentTagVisibility === 'all' && isStacked) ? `<span class="column-stack-tag">Stack</span>` : '';
titleElement.innerHTML = renderedTitle + rowIndicator + stackIndicator;
```

**Lines 876-880:**
```javascript
// Add stack indicator if needed
const isStacked = /#stack\b/i.test(newTitle);
if (window.currentTagVisibility === 'all' && isStacked) {
    titleElement.innerHTML += `<span class="column-stack-tag">Stack</span>`;
}
```

## Result
Now when `tagVisibility === 'all'`:
- ✅ Shows clean "Stack" indicator label
- ❌ No longer shows duplicate `#stack` tag
- Column title is clean without layout tags cluttering it
- Visual indicators are consistent and styled uniformly

## Testing
- ✅ TypeScript compilation: No errors
- ✅ Build process: Successful
- ✅ ESLint: Only pre-existing warnings
