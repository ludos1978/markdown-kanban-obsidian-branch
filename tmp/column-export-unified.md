# Column Export Now Uses Unified Dialog

## Changes Made

### 1. Updated Column Export Function
**File**: [webview.js](../src/html/webview.js:4298-4321)

Changed from opening old simple dialog to opening unified dialog with column pre-selected:

```javascript
// BEFORE: Opened old column export modal
showColumnExportDialog(columnIndex, column.title);

// AFTER: Opens unified export dialog with column pre-selected
showExportDialogWithSelection('column', columnIndex, columnId);
```

### 2. New Pre-Selection Function
**File**: [webview.js](../src/html/webview.js:4082-4108)

Created `showExportDialogWithSelection()` to support pre-selecting specific nodes in the tree:
- Main menu "Export" → calls with `(null, null, null)` → selects full kanban
- Column menu "Export" → calls with `('column', index, id)` → selects that column

### 3. Enhanced Tree Initialization
**File**: [webview.js](../src/html/webview.js:4168-4202)

Updated `initializeExportTree()` to accept optional `preSelectNodeId`:
- If provided: selects that specific node
- If not: selects full kanban (default behavior)

### 4. Deprecated Old Column Export Modal
**File**: [webview.html](../src/html/webview.html:338-405)

Commented out the old `column-export-modal` - no longer needed.

## How It Works Now

### Main Menu Export
1. Click "Export" from file info bar
2. Opens unified dialog
3. Full kanban is pre-selected
4. User can change selection in tree

### Column Menu Export
1. Right-click column → "Export"
2. Opens **same unified dialog**
3. **That specific column is pre-selected** in the tree
4. User can change selection if desired (e.g., select parent row instead)

## Benefits

1. **Consistency**: Both export methods use same dialog
2. **Flexibility**: User can change selection even when starting from column menu
3. **Less Code**: Removed ~70 lines of duplicate column export modal HTML
4. **Better UX**: Single, powerful export interface

## Testing

After reloading VS Code:

1. **Test Main Menu Export**:
   - Click "Export" in top bar
   - Should see tree with full kanban selected

2. **Test Column Menu Export**:
   - Right-click a column
   - Click "Export"
   - Should see tree with ONLY that column selected
   - Can change selection before exporting

## Debug Info

The scripts include debug logging. After completely closing and reopening VS Code, check the console for:
```
[kanban.exportTreeBuilder] ExportTreeBuilder loaded successfully
[kanban.exportTreeUI] ExportTreeUI loaded successfully
```

If you don't see these, the scripts aren't loading.

## Files Modified

- `src/html/webview.js` - Updated column export to use unified dialog
- `src/html/webview.html` - Commented out old column export modal
- `src/html/utils/exportTreeBuilder.js` - Added debug logging
- `src/html/utils/exportTreeUI.js` - Added debug logging

## Build Status

✅ Build successful - ready to test!

**Next**: Close VS Code completely, reopen, and test both export methods.
