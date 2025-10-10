# Fix: Export Dialog Script Loading Issue

## Problem
Error: `Cannot read properties of undefined (reading 'buildExportTree')`

This happens because `window.ExportTreeBuilder` is undefined when the export dialog opens.

## Root Cause
The webview HTML is cached in VS Code. Even though the new script tags are in the HTML file:
```html
<script src="utils/exportTreeBuilder.js"></script>
<script src="utils/exportTreeUI.js"></script>
```

The browser is loading the OLD cached HTML without these script tags.

## Solution: Force VS Code to Reload

**You need to reload the VS Code window to get the new webview:**

### Method 1: Reload Window (Recommended)
1. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
2. Type "Developer: Reload Window"
3. Press Enter

### Method 2: Close and Reopen the File
1. Close the kanban file
2. Close VS Code completely
3. Reopen VS Code
4. Open the kanban file again

### Method 3: Clear Webview Cache (if above doesn't work)
1. Close VS Code
2. Delete the cache folder:
   - Mac: `~/Library/Application Support/Code/Cache`
   - Windows: `%APPDATA%\Code\Cache`
   - Linux: `~/.config/Code/Cache`
3. Restart VS Code

## Verification

After reloading, open the browser console (if using VS Code webview dev tools) and check:

```javascript
console.log(window.ExportTreeBuilder); // Should NOT be undefined
console.log(window.ExportTreeUI); // Should NOT be undefined
```

## Changes Made

I added a safety check to show a better error message:

```javascript
if (!window.ExportTreeBuilder) {
    console.error('[kanban.webview.initializeExportTree] ExportTreeBuilder not loaded');
    container.innerHTML = '<div class="export-tree-empty">Export tree not available. Please reload the page.</div>';
    return;
}
```

Now if the scripts aren't loaded, you'll see a friendly message instead of a crash.

## About "Wrong Export View" for Column Export

The column export still uses the old simple dialog. This is intentional - it's a quick export from the column menu.

If you want to use the new unified export dialog with tree selector for column exports too, let me know and I can update it.

## Files Modified
- [webview.js](../src/html/webview.js:4146-4160) - Added safety check
- Built files are up to date in `dist/`

## Next Steps
1. **Reload VS Code window** (Cmd+Shift+P → "Developer: Reload Window")
2. Open a kanban file
3. Click "Export" from the main menu
4. You should see the new tree selector dialog!
