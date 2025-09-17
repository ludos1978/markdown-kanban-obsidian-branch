---
kanban-plugin: board
---

## Open Bugs

- [ ] folding a column after a new column has been added might fold the wrong column. are unique id correctly added and everything setup correctly?
- [ ] Whole column include mode: add an option in the column-burger menu that allows setting to include a file that is put in, instead of the columns content. the included content must be parsed before including. the parser should create a new card from all individual slides (separarted by a ---), if the first text line is a heading it should be put into the card's title, othervise everthing goes into the description of the cards. the column title should be the filename. the text read from the file should be put into the cards of the column. how complex is this to do? maybe the include in the headers is happening to late in the processing. different to the handling of !!!includes(..)!!! within a cards description. this likely must be handled earlier to be able to generate markdown card content from it. also if possible we should be able to save the modificaitons we do back into the origninal formatting, so convert it back to md-presentations and write it into the file. did you check that the include of a file within the header msut be processessed before the parsing/creation of individual cards? so maybe even in the data loading and data saving process. if needed we could use a different !!!column(includefile)!!! which uses diffrerent parsers? think of a more fundamential approach to solve this problem. i would actually like to be able to add mutliple includes in a header as well, which would work with the column title text include. but other approaches would be possible as well. i think a very approachable idea is to integrate that into the load and save system, the include modificaiton tracker, and the editing of the markdown. or add it as a special element that i can add within a column to include all content as cards.
	For this system to work we must implement the following:
	Modify the KanbanColumn to be an overloaded function, there is the classic version that works with the markdown data, and there is the version that generates the tasks from the imported presentation-markdown.
  '''KanbanColumn: {
      id: string,
      title: string,
      tasks: KanbanTask[],
      includeMode: true // the file path is in the title...
  }'''
	while parsing the base-markdown file: if a column title contains a !!!columninclude(...)!!! it should create a KanbanColumnImport object which:
	- create and handles the file modification listeners for the included files.
	- sends the modifications to the frontend.
	- parses and generates / provides the cards.

  important is that the include file handling should be considered as a separate file edit within the kanban editor. so if it's changed and unsaved it should ask to save or discard when closing (or removing the file). also if it's edited externally it should ask wether the data should be read from source or backed up and reread (the same as with the kanban file itself).

- [ ] add a tag, what makes a column not be moved on a new line, but stay below the column previous to it. 


- [ ] the file-path-parsing of filenames with special characters needs to use percentage encoding %20=space to make sure it can be loaded correctly. use this when converting paths to url's while creating links with [[path/to/markdown]] and [](path/to/image.png) or ![](path/to/image.png).
- [ ] Add an configuration option: It should define which tags are exported when copying as markdown (in the cards burger menus and the column burger menus). have the same options as when changing the displaying in the kaban board (all tags, standard tags, custom tags, @tags only, no tags). 
- [ ] i allways need to build before restarting the debugging to see the changes applied. can you modify the configuration that this happens automatically
- [ ] add the build version to the file info burger menu.
- [ ] the max height of cards is limited after switching back to auto mode from a height limiting (card-height) mode.

## Closed Bugs
- [x] can you make the shortcuts from vscode to add snipplets avaiable within the kanban board? i want to reuse vscodes default keyboard configuration, especially the ones defined for markdown. use all snipplet functionality that is already built into vscode. to not stop editing a field when using shortcuts, we should minimize the way a field edit is ended or aborted.
- [x] add an mutiple choice submenu in the main header (file-info-header). It should set a combination of layout styles using the individual styles that can be defined in the file-info-burger menu. make this available as configuration option. something like this: ["overview": {"column_width": "small", "card_height": "auto", "font_size": "0.5x"}, "normal": {"column_width": "normal", "card_height": "auto", "font_size": 1x"}, "3x3": {"column_width": "third screen", "font_size": "2x", "card_height": "1_3th_screen"}, "presentation": {"column_width": "full_width", "card_height": "full_screen", "font_size": "3x", "sticky_headers": "disabled", "tag_visibility": "none"}] . make sure that all options are available. the configuration of the layout styles should be available in the configuration settings.
- [x] equalize the naming of all options in the multiple selection menus in the file-info-burger menu. i mean those in column widht, card height, etc. they should be eighter pixel widths/heights (250px), or screen parts (1/3th of screen). also make sure the names in the backend (configuration names) are fixed so they are easy to use. in whitespace remove the 2px option and the 10px,20px,40px,60px, and add 24px, 36px, 48px. rename the whitespace configuration values to pixel values, make sure it's using strings with no special characters. rename the "standard tags" in "tag options" to "all excluding layout" for the config value of course use a string witout spaces. make sure to look at the selection of the options, the automatic update system to show whats selected, the configuration in the backend and how the values are used. show me what names you propose for each value considering the above input.
- [x] in the file info header's burger menu, make the currently selected mode visible in column width, card height and all other couceh submenus. make sure it's read from the saved values and has a single update function for all parameters. make sure to adjust the configuration and the configuration options work properly.
- [x] The clipboard should be read when focussing the kanban board, or when meta+c / ctrl+c is pressed. it should not be required to press the button to reload it.
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
