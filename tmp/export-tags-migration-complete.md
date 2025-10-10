# Export Tags Migration - Complete

## Summary
Successfully moved "Export Tags" configuration from the global burger menu to the per-export dialog, providing more flexibility and clearer UX.

## Problem
Previously had TWO places to control tag visibility during export:
1. **Global setting** in File Info burger menu (confusing, set once for all exports)
2. **Per-export setting** in Export Column dialog (flexible, but redundant)

## Solution
**Removed global setting**, kept only the per-export dialog option.

## Why This Is Better
- ✅ **More flexible**: Choose tag visibility individually for each export
- ✅ **Clearer UX**: Setting is where you use it (in export dialog)
- ✅ **Less confusing**: No conflicting settings
- ✅ **Simpler code**: No global state management

## Changes Made

### 1. [src/html/webview.html](../src/html/webview.html)
**Removed (5 lines):**
- "Export Tags" menu item from burger menu (lines 170-175)
- Submenu container with `data-menu="exportTagVisibility"`

**Kept:**
- Export Column dialog already has tag visibility dropdown (lines 371-377) with options:
  - All Tags
  - All Excluding Layout
  - Custom Tags Only
  - @ Tags Only
  - No Tags

### 2. [src/html/webview.js](../src/html/webview.js)
**Removed (~20 lines):**
- `exportTagVisibility` array from baseOptions (lines 225-231)
- `case 'exportTagVisibility'` from getCurrentSettingValue() (lines 284-285)
- exportTagVisibility from menuMappings (line 306)
- `currentExportTagVisibility` variable declaration (line 1428)
- Message handler for exportTagVisibility (lines 2363-2367)

**Modified:**
- `filterTagsForExport()` function signature:
  - **Before**: `function filterTagsForExport(text)`
  - **After**: `function filterTagsForExport(text, tagVisibility = 'allexcludinglayout')`
  - Now accepts tag visibility as parameter instead of using global state

**Kept:**
- `filterTagsForExport()` function logic (still filters tags based on setting)
- `window.filterTagsForExport` export (used by backend)
- Export dialog passes tagVisibility directly (line 4308)

## How It Works Now

### User Flow:
1. User clicks column menu → "Export Column"
2. Export dialog opens
3. User chooses tag visibility from dropdown in the dialog
4. Clicks "Export"
5. Export uses the chosen tag visibility for that specific export

### Technical Flow:
```javascript
// Export dialog collects options including tag visibility
const options = {
    columnIndex: selectedColumnIndex,
    tagVisibility: document.getElementById('column-export-tag-visibility')?.value || 'all'
    // ... other options
};

// Backend calls filterTagsForExport with the specific tag visibility
filterTagsForExport(text, options.tagVisibility)
```

## Migration for Users
No migration needed! The export dialog already had the tag visibility dropdown - users just won't see the redundant global setting anymore.

## Files Modified (2 files)
1. **src/html/webview.html** - Removed burger menu item (5 lines)
2. **src/html/webview.js** - Removed global config + modified function (~20 lines)

## Testing
- ✅ TypeScript compilation: No errors
- ✅ Build process: Successful
- ✅ ESLint: Only pre-existing warnings
- ✅ Export dialog has tag visibility dropdown
- ✅ filterTagsForExport accepts parameter

## Result
Cleaner, more intuitive UX with tag visibility controlled per-export in the export dialog where it belongs.
