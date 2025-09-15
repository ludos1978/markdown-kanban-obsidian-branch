---
kanban-plugin: board
---

## Open Bugs

if i modify the kanban by dragging the card, it should send and update the change into the backend cache. if the source markdown of the kanban file is then saved (unmodified), then the backend should see a difference the backend cache and the markdown source, this should be handled as if there is an external change (because internal the file has changed). but right now the kanban gets reset to the state from the external file, the card i moved is put back into it's original position. why does this happen, find the source of the problem first by tracing the path the events&functions are called BEFORE DOING ANY CHANGE!!!

## File Watcher Consolidation ✅

### Create ExternalFileWatcher System

- [x] Create `src/externalFileWatcher.ts` with centralized file monitoring
- [x] Design event system for file changes (`main-file-changed`, `include-file-changed`, `include-file-deleted`)
- [x] Implement file registration/unregistration methods
- [x] Add loop prevention logic (`_isUpdatingFromPanel` check)
- [x] Support `fileListenerEnabled` flag integration

### Remove Duplicate Systems

- [x] Remove `setupMainFileWatcher()` function from `extension.ts:214-240`
- [x] Remove `documentSaveListener` from `extension.ts:243-256`
- [x] Remove `externalFileWatchers` Map from `extension.ts:212`
- [x] Remove cleanup code from `extension.ts:322-323`
- [x] Remove 3 calls to `setupMainFileWatcher()` (lines 81, 169, 201)

### Update KanbanWebviewPanel

- [x] Remove `_includeFileWatchers` array and related methods
- [x] Remove `_setupIncludeFileWatchers()` method (`lines 1272-1304`)
- [x] Remove `_cleanupIncludeFileWatchers()` method (`lines 1306-1311`)
- [x] Keep `_sendIncludeFileChangeNotification()` and `refreshIncludes()` methods
- [x] Add registration with ExternalFileWatcher on panel creation
- [x] Add unregistration on panel disposal
- [x] Update `loadMarkdownFile()` to re-register files when switching

### Preserve Critical Functionality

- [x] Maintain include file state management (`_includeFileContents`, `_changedIncludeFiles`, `_includeFilesChanged`)
- [x] Preserve `refreshIncludes()` message handler functionality
- [x] Keep loop prevention via `_isUpdatingFromPanel` checks
- [x] Maintain `fileListenerEnabled` toggle behavior

### Update Tests

- [ ] Remove `onDidSaveTextDocument` mock from `src/test/setup.js:14`
- [ ] Add ExternalFileWatcher mocks for testing
- [ ] Verify all file change scenarios still work

### Benefits

- Single source of truth for external file changes
- Eliminate ~200 lines of duplicate watcher code
- Better resource management (one watcher per file)
- Simplified debugging and error handling
- No functionality loss
