# Consolidated Tag Rendering - Code Cleanup

## Problem
We had duplicate logic for handling layout tags:
1. Manual text indicators ("Row 2", "Stack") - wrong approach
2. Natural markdown tag rendering (`<span class="kanban-tag">`) - correct approach

This caused:
- Tags appearing as "Stack" instead of "#stack"
- Inconsistent display between initial render and after editing
- Duplicate code across multiple files

## Solution
Removed all manual indicator logic and consolidated to use the natural markdown tag rendering system exclusively.

## Changes Made

### Removed Manual Indicator Code

#### 1. src/html/boardRenderer.js
**Before:**
```javascript
displayTitle = displayTitle.replace(/#row\d+/gi, '').replace(/#stack\b/gi, '').trim();
const rowIndicator = (window.currentTagVisibility === 'all' && columnRow > 1) ? `<span class="column-row-tag">Row ${columnRow}</span>` : '';
const stackIndicator = (window.currentTagVisibility === 'all' && isStacked) ? `<span class="column-stack-tag">Stack</span>` : '';
titleElement.innerHTML = renderedTitle + rowIndicator + stackIndicator;
```

**After:**
```javascript
displayTitle = column.displayTitle || (column.title ? window.filterTagsFromText(column.title) : '');
renderedTitle = displayTitle ? renderMarkdown(displayTitle) : '';
titleElement.innerHTML = renderedTitle;
```

#### 2. src/html/webview.js
**Before:**
```javascript
const displayTitle = column.title.replace(/#row\d+/gi, '').replace(/#stack\b/gi, '').trim();
const rowIndicator = ...;
const stackIndicator = ...;
titleElement.innerHTML = renderedTitle + rowIndicator + stackIndicator;
```

**After:**
```javascript
const displayTitle = window.filterTagsFromText(column.title);
const renderedTitle = displayTitle ? renderMarkdown(displayTitle) : '';
titleElement.innerHTML = renderedTitle;
```

#### 3. src/html/dragDrop.js
Simplified from 7 lines to 3 lines, same pattern as above.

#### 4. src/html/menuOperations.js (2 locations)
Removed all manual indicator logic, simplified to use filterTagsFromText + renderMarkdown.

### Removed Obsolete CSS

#### 5. src/html/webview.css
Removed unused CSS classes:
```css
/* REMOVED */
.column-row-tag,
.column-stack-tag {
  /* ... styling ... */
}
```

## How It Works Now

1. **Tag Filtering**: `window.filterTagsFromText()` respects `tagVisibility` setting:
   - `'all'` → Shows all tags including #row, #stack
   - `'allexcludinglayout'` → Hides #row, #stack (but they're still in the markdown)
   - Other settings → Hide accordingly

2. **Tag Rendering**: `renderMarkdown()` converts tags to:
   ```html
   <span class="kanban-tag" data-tag="stack">#stack</span>
   <span class="kanban-tag" data-tag="row2">#row2</span>
   ```

3. **Tag Styling**: CSS rules in webview.css style layout tags:
   ```css
   .kanban-tag[data-tag^="span"],
   .kanban-tag[data-tag^="row"],
   .kanban-tag[data-tag^="stack"] {
     color: #666;
     background-color: transparent;
     border: 1px dashed #999;
     opacity: 0.7;
   }
   ```

4. **Tag Visibility**: CSS rules hide/show based on `tagVisibility`:
   ```css
   .tag-visibility-allexcludinglayout .kanban-tag[data-tag^="stack"] {
     display: none !important;
   }
   ```

## Benefits

1. **Single Source of Truth**: One rendering path for all tags
2. **Consistent Display**: Tags look the same initially and after editing
3. **Less Code**: Removed ~80 lines of duplicate logic
4. **Maintainable**: Changes to tag rendering only need to happen in one place
5. **Correct Display**: Shows "#stack" instead of "Stack", "#row2" instead of "Row 2"

## Files Modified
1. [src/html/boardRenderer.js](../src/html/boardRenderer.js) - Removed indicator logic
2. [src/html/webview.js](../src/html/webview.js) - Simplified to use filterTagsFromText
3. [src/html/dragDrop.js](../src/html/dragDrop.js) - Simplified to use filterTagsFromText
4. [src/html/menuOperations.js](../src/html/menuOperations.js) - Removed indicators (2 locations)
5. [src/html/webview.css](../src/html/webview.css) - Removed obsolete CSS classes

## Testing
- ✅ TypeScript compilation: No errors
- ✅ Build process: Successful
- ✅ ESLint: Only pre-existing warnings

## Result
Layout tags (#row, #stack, #span) now render consistently as styled tag pills, respecting the tagVisibility setting through the existing CSS visibility rules.
