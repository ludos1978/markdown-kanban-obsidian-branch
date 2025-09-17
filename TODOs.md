---
kanban-plugin: board
---

## Open Bugs


- [ ] The clipboard should be read when focussing the kanban board, or when meta+c / ctrl+c is pressed. it should not be required to press the button to reload it.

## Closed Bugs

- [x] saving the outside file, ignoring the change in the dialogue, and saving it again does not trigger the "file has been modified externally" again.
- [x] if "save as backup and load external" or "discard kanban changes and reload" then included file change tracking doesnt work anymore. add what files are being tracked as hover element to the include file tracking button. show the button all the time. the button should not disappear if i press it now, if no include change is active show a checkmark, if there is changes show an exclamation mark. the values of files being tracked must be delivered and updated by the file tracking part. if the button is pressed and no changes are present, it must refresh what files are tracked, if there are changes in includes, refresh the included parts in the document. WHAT HAPPENS WHEN DATA IS REALODED FROM NEW DATA= BECAUSE INCLUDE TRACKING BREAKS FROM THAT POINT ON AND NEVER WORKS ANYMORE UNTIL I CLOSE THE KANBAN AND REOPEN!- [x] saving during editing a markdown content does not work correctly. it should already be implemented, but doesnt seem to work. if it's too complicated to do while staying in edit mode, it's acceptable to end editing and then save. make sure you handle the end-edit functions.
- [x] if i focus the markdown the the kanban is opened from it asks me if i want to discard kanban, save as backup, discard external, ignore. this should only come up when saving the markdown file, not when focussing it, is the event wrong?
- [x] if there is an image in the clipboard, and the user drags the clipboard-new-card it into the kanban board. can you create the image from the clipboard within an subfolder named "{basefilename}-MEDIA" and include in the board with this new filepath?
- [x] if there are multiple filenames/paths in the clipboard, can you make links out of all them automatically, there is already a conversion based on filetype happening, but only for single file-path-names. assume newlines to be eigher \r, \r\n or \n (all types). consider windows, linux and osx paths as paths to convert to link style (also consider c:\... paths, make sure to escape filepaths in %escape / url escaping if they have invalid characters in them such as brackets, curly, etc...)
  it's not required to resolve the paths. also in here it tries to make a absolute path by adding the local path to an already absolute path. can you verify on what os we are on and depending on that do different path handling.
- [x] when opening a new kanban the clipboard is correctly initialized, but shortly after the kanban board is loaded it gets overwritten by "Test Update"/"Testing clipboard update functionality". dont overwrite the 

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
- Eliminate ~200 lines of duplicate dwatcher code
- Better resource management (one watcher per file)
- Simplified debugging and error handling
- No functionality loss
