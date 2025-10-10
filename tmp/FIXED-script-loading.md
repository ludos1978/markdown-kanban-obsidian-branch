# FIXED: Script Loading Issue

## The Problem

The export tree scripts (`exportTreeBuilder.js` and `exportTreeUI.js`) weren't loading because they weren't in the backend's hardcoded list of JavaScript files!

## Root Cause

**File**: [kanbanWebviewPanel.ts](../src/kanbanWebviewPanel.ts:1909-1941)

The backend code that converts webview HTML has a hardcoded `jsFiles` array that lists every script to load. Our new export tree files were NOT in this list, so they never got properly loaded by VS Code's webview.

```typescript
const jsFiles = [
    'utils/colorUtils.js',
    'utils/fileTypeUtils.js',
    'utils/tagUtils.js',
    // ... other files ...
    // ❌ exportTreeBuilder.js and exportTreeUI.js were MISSING!
];
```

## The Fix

Added both export tree files to the `jsFiles` array:

```typescript
const jsFiles = [
    'utils/colorUtils.js',
    'utils/fileTypeUtils.js',
    'utils/tagUtils.js',
    'utils/configManager.js',
    'utils/styleManager.js',
    'utils/menuManager.js',
    'utils/dragStateManager.js',
    'utils/validationUtils.js',
    'utils/modalUtils.js',
    'utils/activityIndicator.js',
    'utils/exportTreeBuilder.js',    // ✅ ADDED
    'utils/exportTreeUI.js',          // ✅ ADDED
    'runtime-tracker.js',
    // ... rest of files ...
];
```

## Why This Happened

The backend dynamically rewrites script `src` attributes to use proper VS Code webview URIs with cache-busting timestamps. Any script NOT in this list won't get rewritten and won't load properly in the webview.

## Testing Now

After reloading VS Code (Cmd+Shift+P → "Developer: Reload Window"):

1. **Main Menu Export** - Click "Export" → Should see tree selector
2. **Column Menu Export** - Right-click column → "Export" → Should see tree with that column selected

You should also see these console messages:
```
[kanban.exportTreeBuilder] ExportTreeBuilder loaded successfully
[kanban.exportTreeUI] ExportTreeUI loaded successfully
```

## Files Modified

- ✅ [kanbanWebviewPanel.ts](../src/kanbanWebviewPanel.ts:1920-1921) - Added export tree files to jsFiles array
- ✅ Build successful

## Summary

**Problem**: Scripts weren't in backend's file list → never loaded
**Solution**: Added to jsFiles array → now loads properly
**Status**: ✅ FIXED - Ready to test!

---

**Just reload VS Code window and it should work now!**
