# Export Tags Migration Analysis

## Current Situation

### Two Places for Tag Visibility Control:
1. **Burger Menu** (File Info menu): "Export Tags" submenu
   - Sets global `currentExportTagVisibility` variable
   - Located in webview.html (lines 170-175) - NOW REMOVED

2. **Export Dialog** (Column Export modal): Tag Visibility dropdown
   - Located in webview.html (lines 371-377)
   - Hardcoded options: all, allexcludinglayout, customonly, mentionsonly, none
   - Value passed directly in export options (webview.js line 4308)

## The Problem
Having two places to control export tag visibility is confusing:
- Global setting in burger menu
- Per-export setting in export dialog
- Which one takes precedence?

## The Solution
**Use ONLY the export dialog** (per-export choice, more flexible)

## Changes Made

### ✅ Step 1: Remove Burger Menu Item
**File**: src/html/webview.html (lines 170-175)
- Removed "Export Tags" menu item
- Removed submenu container

### ⏳ Step 2: Clean Up JavaScript
**File**: src/html/webview.js
Need to remove:
- Line 225-231: `exportTagVisibility` from baseOptions
- Line 285: case in getCurrentSettingValue()
- Line 306: menu mapping entry
- Line 1428: `currentExportTagVisibility` variable declaration
- Lines related to setExportTagVisibility function (if exists)
- Lines 2363-2367: Message handler for exportTagVisibility

**Keep**:
- `filterTagsForExport()` function (line 1432) - BUT modify to accept parameter
- Window export (line 3705)

### ⏳ Step 3: Modify filterTagsForExport
Change from using global `currentExportTagVisibility` to accepting a parameter:
```javascript
// OLD:
function filterTagsForExport(text) {
    const setting = window.currentExportTagVisibility || 'allexcludinglayout';
    // ...
}

// NEW:
function filterTagsForExport(text, tagVisibility = 'allexcludinglayout') {
    const setting = tagVisibility;
    // ...
}
```

### ⏳ Step 4: Update Backend
The backend needs to use the `tagVisibility` from export options instead of a global config.
Check: src/exportService.ts - should already use options.tagVisibility

## Result
- ✅ Single source of truth: export dialog
- ✅ More intuitive: choose per export
- ✅ Less confusing UX
- ✅ Cleaner code

## Testing
- Verify export dialog tag visibility dropdown works
- Verify tags are filtered correctly based on selection
- Verify no console errors
