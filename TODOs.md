---
kanban-plugin: board
---

## Open Bugs

if i modify the kanban by dragging the card, it should send and update to the backend cache. if the source markdown file is then saved it should see a change between the backend cache and the markdown source which then should be handled equally to a modified external file.

## File Watcher Consolidation

### Create ExternalFileWatcher System

- [ ] Create `src/externalFileWatcher.ts` with centralized file monitoring
- [ ] Design event system for file changes (`main-file-changed`, `include-file-changed`, `include-file-deleted`)
- [ ] Implement file registration/unregistration methods
- [ ] Add loop prevention logic (`_isUpdatingFromPanel` check)
- [ ] Support `fileListenerEnabled` flag integration

### Remove Duplicate Systems

- [ ] Remove `setupMainFileWatcher()` function from `extension.ts:214-240`
- [ ] Remove `documentSaveListener` from `extension.ts:243-256`
- [ ] Remove `externalFileWatchers` Map from `extension.ts:212`
- [ ] Remove cleanup code from `extension.ts:322-323`
- [ ] Remove 3 calls to `setupMainFileWatcher()` (lines 81, 169, 201)

### Update KanbanWebviewPanel

- [ ] Remove `_includeFileWatchers` array and related methods
- [ ] Remove `_setupIncludeFileWatchers()` method (`lines 1272-1304`)
- [ ] Remove `_cleanupIncludeFileWatchers()` method (`lines 1306-1311`)
- [ ] Keep `_sendIncludeFileChangeNotification()` and `refreshIncludes()` methods
- [ ] Add registration with ExternalFileWatcher on panel creation
- [ ] Add unregistration on panel disposal
- [ ] Update `loadMarkdownFile()` to re-register files when switching

### Preserve Critical Functionality

- [ ] Maintain include file state management (`_includeFileContents`, `_changedIncludeFiles`, `_includeFilesChanged`)
- [ ] Preserve `refreshIncludes()` message handler functionality
- [ ] Keep loop prevention via `_isUpdatingFromPanel` checks
- [ ] Maintain `fileListenerEnabled` toggle behavior

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
