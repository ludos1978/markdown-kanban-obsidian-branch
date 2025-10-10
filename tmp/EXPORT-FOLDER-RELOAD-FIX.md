# Export Default Folder - Reload Fix

## Problem
Export default folder path was only generated after reloading the webview. Before reload, the export dialog's folder input would be empty.

## Root Cause

**File**: [src/messageHandler.ts:1796-1815](src/messageHandler.ts#L1796)

The `handleGetExportDefaultFolder()` function only tried one way to get the document:

```typescript
const document = this._fileManager.getDocument();
if (!document) {
    console.error('No document available for export');
    return;  // ❌ Gave up immediately
}
```

### Why This Failed Before Reload

When the webview first loads, the FileManager might not have the document cached yet in its internal state. The document is only guaranteed to be in FileManager after certain operations (like loading the markdown file into the webview).

However, the document **is available** through other means:
1. `_fileManager.getFilePath()` - returns the file path even if document isn't cached
2. `vscode.window.activeTextEditor` - the editor that's currently open

### Inconsistency

The `handleUnifiedExport()` function (lines 1960-1995) already had proper fallback logic that tried all three methods:

```typescript
let document = this._fileManager.getDocument();

// Fallback 1: Try file path
if (!document) {
    const filePath = this._fileManager.getFilePath();
    if (filePath) {
        document = await vscode.workspace.openTextDocument(filePath);
    }
}

// Fallback 2: Try active editor
if (!document) {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && activeEditor.document.fileName.endsWith('.md')) {
        document = activeEditor.document;
    }
}
```

But `handleGetExportDefaultFolder()` didn't have these fallbacks, causing it to fail before reload.

## Solution

Applied the same fallback logic from `handleUnifiedExport()` to `handleGetExportDefaultFolder()`.

### Changes Made

**File**: [src/messageHandler.ts:1796-1843](src/messageHandler.ts#L1796)

```typescript
private async handleGetExportDefaultFolder(): Promise<void> {
    try {
        let document = this._fileManager.getDocument();
        console.log('[kanban.messageHandler.getExportDefaultFolder] FileManager document:', document ? document.uri.fsPath : 'null');

        // If document not available from FileManager, try to get the file path and open it
        if (!document) {
            const filePath = this._fileManager.getFilePath();
            console.log('[kanban.messageHandler.getExportDefaultFolder] FileManager filePath:', filePath || 'null');

            if (filePath) {
                // Open the document using the file path
                try {
                    document = await vscode.workspace.openTextDocument(filePath);
                    console.log('[kanban.messageHandler.getExportDefaultFolder] Opened document from file path');
                } catch (error) {
                    console.error('[kanban.messageHandler.getExportDefaultFolder] Failed to open document from file path:', error);
                }
            }

            // If still no document, try active editor as last resort
            if (!document) {
                const activeEditor = vscode.window.activeTextEditor;
                console.log('[kanban.messageHandler.getExportDefaultFolder] Active editor:', activeEditor ? activeEditor.document.fileName : 'null');
                if (activeEditor && activeEditor.document.fileName.endsWith('.md')) {
                    document = activeEditor.document;
                    console.log('[kanban.messageHandler.getExportDefaultFolder] Using active editor document as fallback');
                }
            }
        }

        if (!document) {
            console.error('[kanban.messageHandler.getExportDefaultFolder] No document available for export');
            return;
        }

        const defaultFolder = ExportService.generateDefaultExportFolder(document.uri.fsPath);
        const panel = this._getWebviewPanel();
        if (panel && panel._panel) {
            panel._panel.webview.postMessage({
                type: 'exportDefaultFolder',
                folderPath: defaultFolder
            });
        }
    } catch (error) {
        console.error('[kanban.messageHandler.getExportDefaultFolder] Error:', error);
    }
}
```

## How It Works Now

### Document Retrieval Strategy

1. **Try FileManager cache** (fastest)
   - Returns immediately if document is cached

2. **Try file path** (if FileManager has it)
   - Gets file path from FileManager
   - Opens document from file system
   - Works even if document not cached

3. **Try active editor** (last resort)
   - Gets currently active editor in VS Code
   - Uses its document if it's a markdown file
   - Always available when user has a file open

### Result

Now the export default folder path is generated successfully **even on first open**, without requiring a reload.

## Logging Added

Added comprehensive logging to trace document retrieval:

```
[kanban.messageHandler.getExportDefaultFolder] FileManager document: /path/to/file.md
[kanban.messageHandler.getExportDefaultFolder] FileManager filePath: /path/to/file.md
[kanban.messageHandler.getExportDefaultFolder] Opened document from file path
[kanban.messageHandler.getExportDefaultFolder] Active editor: /path/to/file.md
```

This helps debug future issues with document availability.

## Impact

### Before Fix
- ❌ Export dialog opens with empty folder path
- ❌ User must manually select folder or reload
- ❌ Poor user experience

### After Fix
- ✅ Export dialog opens with auto-generated folder path
- ✅ Path format: `{filename}-{timestamp}` (e.g., `kanban-20251009-1530`)
- ✅ Works immediately without reload
- ✅ Consistent with export behavior

## Testing

To verify the fix:

1. Open a markdown kanban file in VS Code
2. Open the kanban webview (should be automatic)
3. **Immediately** click Export (without reload)
4. Verify the "Export Folder" field shows a path like: `/path/to/kanban-20251009-1530`

Expected: Folder path is populated on first try ✅

## Related Code

This same fallback pattern is used in:
- `handleUnifiedExport()` - lines 1960-1995
- `handleGetExportDefaultFolder()` - lines 1796-1843 (now fixed)

Both now have consistent document retrieval logic.

## Compilation

✅ **No errors** - Compiles successfully
