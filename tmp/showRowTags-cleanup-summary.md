# showRowTags Configuration Cleanup - Summary

## Objective
Integrate `showRowTags` functionality into `tagVisibility` setting to eliminate redundant configuration.

## Changes Made

### 1. Backend Changes

#### package.json
- **Removed**: `markdown-kanban.showRowTags` configuration (lines 264-268)
- Row indicators now controlled by `tagVisibility` setting

#### src/configurationService.ts
- **Removed**: `showRowTags: boolean` from `Configuration` interface (line 16)
- **Removed**: `showRowTags: boolean` from `ConfigurationDefaults` interface (line 44)
- **Removed**: `showRowTags: true` from defaults object (line 74)
- **Removed**: `showRowTags` from `getTagConfiguration()` method (line 195)

#### src/extension.ts
- **Removed**: `e.affectsConfiguration('markdown-kanban.showRowTags')` from config change listener (line 284)

#### src/kanbanWebviewPanel.ts
- **Removed**: `showRowTags: this._getShowRowTagsConfiguration()` from config message (line 106)
- **Removed**: `const showRowTags = await this._getShowRowTagsConfiguration()` (line 1538)
- **Removed**: `showRowTags: showRowTags` from postMessage (line 1568)
- **Removed**: `_getShowRowTagsConfiguration()` method entirely (lines 2191-2195)

### 2. Frontend Changes

#### src/html/webview.js
- **Removed**: `window.showRowTags = false` declaration (line 24)
- **Removed**: showRowTags assignment from updateBoard message handler (lines 2498-2500)

#### src/html/boardRenderer.js
- **Changed**: Row indicator logic from `window.showRowTags && columnRow > 1` to `window.currentTagVisibility === 'all' && columnRow > 1` (line 1723)

#### src/html/webview.js (column update)
- **Changed**: Row indicator logic from `window.showRowTags && newRow > 1` to `window.currentTagVisibility === 'all' && newRow > 1` (line 1721)

#### src/html/taskEditor.js
- **Changed**: Always show row indicator during editing, removed showRowTags check (line 794)
- Now shows row indicators unconditionally when editing (matches behavior for #stack tags)

#### src/html/menuOperations.js (2 locations)
- **Changed**: Row indicator logic from `window.showRowTags && currentRow > 1` to `window.currentTagVisibility === 'all' && currentRow > 1` (lines 872, 2265)

#### src/html/dragDrop.js
- **Changed**: Row indicator logic from `window.showRowTags && newRow > 1` to `window.currentTagVisibility === 'all' && newRow > 1` (line 2030)

#### src/html/utils/configManager.js
- **Removed**: `showRowTags: true` from defaults (line 24)
- **Removed**: `showRowTags` from `getTagConfiguration()` method (line 132)

## New Behavior

### Row Tag Indicators ("Row 2", "Row 3", etc.)
- **Only shown** when `tagVisibility = "all"`
- **Hidden** for all other tagVisibility values:
  - "allexcludinglayout" - hides row indicators
  - "customonly" - hides row indicators
  - "mentionsonly" - hides row indicators
  - "none" - hides row indicators

### Special Case: Editing Mode
- Row indicators **always visible** when editing column titles (in taskEditor.js)
- This matches the behavior of #stack tags during editing
- Ensures users can see what row a column is in while editing

## Benefits
1. **Single source of truth**: tagVisibility controls all layout tag visibility
2. **Consistency**: Row tags treated the same as #span tags (layout tags)
3. **Simpler configuration**: One less setting for users to manage
4. **Better UX**: Row indicators visible when needed (editing), hidden based on user's tag preferences

## Testing
- TypeScript compilation: ✅ No errors
- Build process: ✅ Successful
- ESLint: ✅ Only pre-existing warnings, no new issues

## Migration Note
Users who previously had `showRowTags: true` will need to set `tagVisibility: "all"` to see row indicators.
Users who had `showRowTags: false` (default) won't notice any change.
