# IMPORTANT: Reload Instructions

## The scripts won't work until you reload VS Code properly!

### Step-by-Step Instructions

#### 1. Close VS Code Completely
- **Don't just reload the window!**
- Cmd+Q (Mac) or Close all windows (Windows/Linux)
- Make sure VS Code is fully quit

#### 2. Reopen VS Code
- Open VS Code fresh
- Open your workspace/folder
- Open a kanban file

#### 3. Test the Export Dialog

**Test 1: Main Menu Export**
- Click "Export" button in top file info bar
- You should see the new tree selector dialog
- Full kanban should be pre-selected

**Test 2: Column Menu Export**
- Right-click on a column header
- Click "Export" from dropdown
- You should see the **same** tree dialog
- **Only that specific column should be selected**

#### 4. Check Console for Debug Info

If it still shows "Export tree not available":

1. Press `Cmd+Shift+P`
2. Type "Developer: Toggle Developer Tools"
3. Look in Console tab
4. Check for these messages:
   ```
   [kanban.exportTreeBuilder] ExportTreeBuilder loaded successfully
   [kanban.exportTreeUI] ExportTreeUI loaded successfully
   ```

**If you see these messages** → Scripts loaded, but tree isn't initializing correctly
**If you DON'T see these** → Scripts aren't loading at all

#### 5. If Scripts Still Don't Load

Try this nuclear option:

1. Close VS Code
2. Find and delete VS Code cache:
   - **Mac**: `~/Library/Application Support/Code/Cache`
   - **Windows**: `%APPDATA%\Code\Cache`
   - **Linux**: `~/.config/Code/Cache`
3. Restart VS Code
4. Reload window (Cmd+Shift+P → "Developer: Reload Window")

## What Was Fixed

1. ✅ Column export now uses unified dialog with pre-selection
2. ✅ Added debug logging to scripts
3. ✅ Added safety checks for missing scripts
4. ✅ Deprecated old column export modal

## Expected Behavior

### Main Menu Export
- Opens dialog with full kanban selected
- Shows hierarchical tree of rows → stacks → columns
- Can select/deselect any items

### Column Menu Export
- Opens **same dialog**
- Only that column is pre-selected
- Can change selection if desired
- Much more powerful than old simple dialog!

## Files Built Successfully

All files are in `dist/src/html/`:
- ✅ webview.html (with script tags)
- ✅ webview.js (with unified export logic)
- ✅ webview.css (with tree styles)
- ✅ utils/exportTreeBuilder.js
- ✅ utils/exportTreeUI.js

The issue is **VS Code caching the old webview HTML**.

---

**TL;DR**: Quit VS Code completely (Cmd+Q), reopen, and it should work!
