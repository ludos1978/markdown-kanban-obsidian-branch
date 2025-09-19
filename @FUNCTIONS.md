# Comprehensive Function Catalog - Markdown Kanban Obsidian Extension

## Feature Naming System

**Code Format**: `[FILE_TYPE][MODULE][FEATURE_TYPE][SPECIFIC_FUNCTION]`

### File Type Prefixes:
- **TS** = TypeScript files
- **JS** = JavaScript files
- **HTML** = HTML files
- **CSS** = CSS files

### Module Codes:
- **EXT** = Extension Core
- **FMG** = File Management
- **PMG** = Parser & Markdown
- **BMG** = Board Management
- **UMG** = UI Management
- **UTL** = Utilities
- **DRG** = Drag & Drop
- **VLD** = Validation
- **CFG** = Configuration
- **WV** = Webview Core

### Feature Type Codes:
- **INIT** = Initialization & Setup
- **CRUD** = Create/Read/Update/Delete
- **NAV** = Navigation & Links
- **RND** = Rendering & Display
- **EVT** = Event Handling
- **STY** = Styling & Themes
- **CHK** = Checks & Validation
- **TRK** = Tracking & Analytics
- **CNV** = Conversion & Parsing
- **MNU** = Menus & UI Controls
- **IO** = Input/Output Operations
- **SYS** = System Integration

---

## TypeScript Functions (152 total)

### TS_EXT_INIT Functions
- **TS_EXT_INIT_activate** (extension.ts:5-313) - Main extension activation with command registration and global state setup
- **TS_EXT_INIT_deactivate** (extension.ts:315-318) - Extension cleanup and context variable clearing

### TS_FMG_NAV Functions
- **TS_FMG_NAV_handleFileLink** (linkHandler.ts:27-203) - Enhanced file link resolution with workspace paths and broken link dialogs
- **TS_FMG_NAV_handleWikiLink** (linkHandler.ts:229-343) - Wiki link handler with extension detection and replacement picker
- **TS_FMG_NAV_handleExternalLink** (linkHandler.ts:345-347) - Simple external URL opener
- **TS_FMG_NAV_applyLinkReplacement** (linkHandler.ts:205-224) - Link replacement with relative path calculation

### TS_FMG_IO Functions
- **TS_FMG_IO_selectFile** (fileManager.ts:85-106) - File picker dialog for markdown files
- **TS_FMG_IO_handleFileDrop** (fileManager.ts:178-200) - File drop event handler with FileDropInfo creation
- **TS_FMG_IO_handleUriDrop** (fileManager.ts:205-246) - Enhanced drag & drop with workspace-relative paths
- **TS_FMG_IO_resolveFilePath** (fileManager.ts:251-344) - Enhanced file path resolution for workspace-relative paths
- **TS_FMG_IO_resolveImageForDisplay** (fileManager.ts:350-384) - Image path to webview URI conversion
- **TS_FMG_IO_generateImagePathMappings** (fileManager.ts:405-442) - Image path mappings for webview without content modification

### TS_FMG_CHK Functions
- **TS_FMG_CHK_isImageFile** (fileManager.ts:172-176) - Image extension validation
- **TS_FMG_CHK_isMediaFile** (fileManager.ts:389-399) - Media file type detection
- **TS_FMG_CHK_getRelativePath** (fileManager.ts:111-170) - Enhanced relative path generation using workspace folders

### TS_FMG_SYS Functions
- **TS_FMG_SYS_searchForFile** (fileSearchService.ts:10-86) - Workspace-wide file search with pattern matching
- **TS_FMG_SYS_showFileReplacementPicker** (fileSearchService.ts:88-171) - QuickPick dialog with live preview
- **TS_FMG_SYS_pickReplacementForBrokenLink** (fileSearchService.ts:177-479) - Real-time search with debouncing and filtering

### TS_UTL_CRUD Functions
- **TS_UTL_CRUD_generateUUID** (idGenerator.ts:13-19) - RFC4122-compliant UUID v4 generation
- **TS_UTL_CRUD_generateColumnId** (idGenerator.ts:25-27) - Column ID with "col-" prefix
- **TS_UTL_CRUD_generateTaskId** (idGenerator.ts:33-35) - Task ID with "task-" prefix
- **TS_UTL_CRUD_extractUUID** (idGenerator.ts:62-68) - UUID extraction from prefixed IDs
- **TS_UTL_CRUD_getShortId** (idGenerator.ts:73-76) - Short display ID for debugging

### TS_UTL_CHK Functions
- **TS_UTL_CHK_isValidUUID** (idGenerator.ts:40-43) - UUID format validation
- **TS_UTL_CHK_isValidColumnId** (idGenerator.ts:48-50) - Column ID format validation
- **TS_UTL_CHK_isValidTaskId** (idGenerator.ts:55-57) - Task ID format validation

### TS_PMG_CNV Functions
- **TS_PMG_CNV_parseMarkdown** (markdownParser.ts:34-264) - Core markdown to kanban board parsing with include file support
- **TS_PMG_CNV_generateMarkdown** (markdownParser.ts:279-335) - Kanban board to markdown conversion
- **TS_PMG_CNV_parsePresentation** (presentationParser.ts:15-57) - Presentation markdown to slides parsing
- **TS_PMG_CNV_slidesToTasks** (presentationParser.ts:62-76) - Slides to kanban tasks conversion
- **TS_PMG_CNV_tasksToPresentation** (presentationParser.ts:82-105) - Tasks back to presentation format conversion
- **TS_PMG_CNV_parseMarkdownToTasks** (presentationParser.ts:111-114) - Main entry point for column includes

### TS_BMG_CRUD Functions
- **TS_BMG_CRUD_moveTask** (boardOperations.ts:42-54) - Task movement between columns and positions
- **TS_BMG_CRUD_addTask** (boardOperations.ts:56-68) - New task addition to column
- **TS_BMG_CRUD_addTaskAtPosition** (boardOperations.ts:70-86) - Task addition at specific position
- **TS_BMG_CRUD_deleteTask** (boardOperations.ts:88-97) - Task deletion from column
- **TS_BMG_CRUD_editTask** (boardOperations.ts:99-115) - Task property editing
- **TS_BMG_CRUD_duplicateTask** (boardOperations.ts:117-129) - Task duplication
- **TS_BMG_CRUD_insertTaskBefore** (boardOperations.ts:131-143) - Empty task insertion before existing
- **TS_BMG_CRUD_insertTaskAfter** (boardOperations.ts:145-157) - Empty task insertion after existing
- **TS_BMG_CRUD_addColumn** (boardOperations.ts:212-222) - New column addition
- **TS_BMG_CRUD_moveColumn** (boardOperations.ts:224-231) - Column position movement
- **TS_BMG_CRUD_deleteColumn** (boardOperations.ts:233-240) - Column deletion
- **TS_BMG_CRUD_insertColumnBefore** (boardOperations.ts:242-255) - Column insertion before existing
- **TS_BMG_CRUD_insertColumnAfter** (boardOperations.ts:257-270) - Column insertion after existing
- **TS_BMG_CRUD_editColumnTitle** (boardOperations.ts:272-320) - Column title editing with include mode handling

### TS_BMG_NAV Functions
- **TS_BMG_NAV_moveTaskToTop** (boardOperations.ts:159-166) - Move task to column top
- **TS_BMG_NAV_moveTaskUp** (boardOperations.ts:168-176) - Move task up one position
- **TS_BMG_NAV_moveTaskDown** (boardOperations.ts:178-186) - Move task down one position
- **TS_BMG_NAV_moveTaskToBottom** (boardOperations.ts:188-195) - Move task to column bottom
- **TS_BMG_NAV_moveTaskToColumn** (boardOperations.ts:197-209) - Move task to different column

### TS_BMG_SYS Functions
- **TS_BMG_SYS_sortColumn** (boardOperations.ts:322-352) - Column task sorting by title or original order
- **TS_BMG_SYS_reorderColumns** (boardOperations.ts:354-391) - Column reordering with row tag updates
- **TS_BMG_SYS_moveColumnWithRowUpdate** (boardOperations.ts:393-445) - Column movement with complex row tag handling
- **TS_BMG_SYS_cleanupRowTags** (boardOperations.ts:460-488) - Duplicate row tag cleanup
- **TS_BMG_SYS_performAutomaticSort** (boardOperations.ts:573-717) - Main automatic sorting with gather rules
- **TS_BMG_SYS_parseGatherExpression** (boardOperations.ts:722-779) - Gather expression parsing into evaluator functions
- **TS_BMG_SYS_createComparisonEvaluator** (boardOperations.ts:811-890) - Comparison evaluator for date and person properties
- **TS_BMG_SYS_gatherUntaggedToColumn** (boardOperations.ts:894-927) - Gather cards with no @ tags
- **TS_BMG_SYS_gatherUnsortedToColumn** (boardOperations.ts:930-953) - Gather remaining cards to column
- **TS_BMG_SYS_taskMatchesGatherTag** (boardOperations.ts:963-1019) - Task matching against gather tags
- **TS_BMG_SYS_parseGatherTag** (boardOperations.ts:1021-1040) - Gather tag parsing into components
- **TS_BMG_SYS_getDatePropertyValue** (boardOperations.ts:1043-1080) - Date property value calculation
- **TS_BMG_SYS_sortColumnByDate** (boardOperations.ts:1084-1096) - Date-based column sorting
- **TS_BMG_SYS_sortColumnByName** (boardOperations.ts:1099-1105) - Name-based column sorting

### TS_BMG_CHK Functions
- **TS_BMG_CHK_findColumn** (boardOperations.ts:23-25) - Column lookup by ID
- **TS_BMG_CHK_findTask** (boardOperations.ts:27-39) - Task lookup by ID in column
- **TS_BMG_CHK_getColumnRow** (boardOperations.ts:448-457) - Row number extraction from column title
- **TS_BMG_CHK_extractDate** (boardOperations.ts:490-521) - Date extraction from text in various formats
- **TS_BMG_CHK_hasSticky** (boardOperations.ts:523-526) - Sticky tag detection in text
- **TS_BMG_CHK_extractPersonNames** (boardOperations.ts:529-536) - Person name extraction from @ tags
- **TS_BMG_CHK_getTodayString** (boardOperations.ts:539-545) - Today's date in YYYY-MM-DD format
- **TS_BMG_CHK_isWithinDays** (boardOperations.ts:548-556) - Date within N days check
- **TS_BMG_CHK_isOverdue** (boardOperations.ts:559-566) - Overdue date detection

### TS_UMG_TRK Functions
- **TS_UMG_TRK_saveStateForUndo** (undoRedoManager.ts:26-40) - Undo state saving with stack management
- **TS_UMG_TRK_undo** (undoRedoManager.ts:42-63) - Undo operation with state restoration
- **TS_UMG_TRK_redo** (undoRedoManager.ts:65-86) - Redo operation with state restoration
- **TS_UMG_TRK_canUndo** (undoRedoManager.ts:88-90) - Undo availability check
- **TS_UMG_TRK_canRedo** (undoRedoManager.ts:92-94) - Redo availability check
- **TS_UMG_TRK_clear** (undoRedoManager.ts:96-100) - Undo/redo stack clearing
- **TS_UMG_TRK_sendUndoRedoStatus** (undoRedoManager.ts:102-110) - Status notification to webview
- **TS_UMG_TRK_disableFileListenerTemporarily** (undoRedoManager.ts:112-131) - Temporary file listener disable

### TS_UMG_SYS Functions
- **TS_UMG_SYS_registerFile** (externalFileWatcher.ts:97-128) - File registration for watching with panel management
- **TS_UMG_SYS_unregisterFile** (externalFileWatcher.ts:133-145) - File unregistration for specific panel
- **TS_UMG_SYS_unregisterPanel** (externalFileWatcher.ts:150-168) - Panel-specific file cleanup
- **TS_UMG_SYS_updateIncludeFiles** (externalFileWatcher.ts:174-198) - Include file list updates with comparison
- **TS_UMG_SYS_createWatcher** (externalFileWatcher.ts:203-233) - File system watcher creation
- **TS_UMG_SYS_handleFileChange** (externalFileWatcher.ts:238-250) - File change event handling with loop prevention
- **TS_UMG_SYS_setupDocumentSaveListener** (externalFileWatcher.ts:70-92) - Document save listener setup

### TS_UMG_IO Functions
- **TS_UMG_IO_createBackup** (backupManager.ts:44-100) - Document backup creation with timing and location options
- **TS_UMG_IO_createFileBackup** (backupManager.ts:136-188) - Arbitrary file backup for includes
- **TS_UMG_IO_generateBackupPath** (backupManager.ts:105-131) - Backup path generation with timestamp
- **TS_UMG_IO_generateFileBackupPath** (backupManager.ts:193-220) - File backup path generation
- **TS_UMG_IO_cleanupOldBackups** (backupManager.ts:252-306) - Old backup cleanup beyond maximum
- **TS_UMG_IO_getBackupList** (backupManager.ts:343-384) - Available backup list with pattern matching
- **TS_UMG_IO_restoreFromBackup** (backupManager.ts:389-412) - Document restoration from backup

### TS_UMG_CHK Functions
- **TS_UMG_CHK_shouldCreatePageHiddenBackup** (backupManager.ts:29-39) - Page hidden backup timing check
- **TS_UMG_CHK_hashContent** (backupManager.ts:239-247) - Content change detection via hashing

### TS_WV_EVT Functions
- **TS_WV_EVT_handleMessage** (messageHandler.ts:66-395) - Main message handling dispatch with extensive switch statement
- **TS_WV_EVT_handleUndo** (messageHandler.ts:397-430) - Undo operations with focus detection
- **TS_WV_EVT_handleRedo** (messageHandler.ts:541-574) - Redo operations with focus detection
- **TS_WV_EVT_handleSelectFile** (messageHandler.ts:576-581) - File selection request handling
- **TS_WV_EVT_handleSaveBoardState** (messageHandler.ts:605-625) - Complete board state saving
- **TS_WV_EVT_handlePageHiddenWithUnsavedChanges** (messageHandler.ts:661-689) - Page hidden events with backup
- **TS_WV_EVT_handleSetPreference** (messageHandler.ts:691-699) - VS Code preference updates
- **TS_WV_EVT_handleSetContext** (messageHandler.ts:701-707) - VS Code context variable updates
- **TS_WV_EVT_handleVSCodeSnippet** (messageHandler.ts:709-743) - VS Code snippet insertion
- **TS_WV_EVT_handleRefreshIncludes** (messageHandler.ts:1002-1014) - Include file refresh requests
- **TS_WV_EVT_handleRequestIncludeFile** (messageHandler.ts:1016-1077) - Include file content requests
- **TS_WV_EVT_handleRuntimeTrackingReport** (messageHandler.ts:1079-1110) - Runtime tracking reports
- **TS_WV_EVT_handleSaveClipboardImage** (messageHandler.ts:1112-1171) - Clipboard image saving
- **TS_WV_EVT_handleSaveClipboardImageWithPath** (messageHandler.ts:1173-1269) - Clipboard image with auto path
- **TS_WV_EVT_handleUpdateBoard** (messageHandler.ts:1271-1299) - Board updates from webview
- **TS_WV_EVT_handleConfirmDisableIncludeMode** (messageHandler.ts:1301-1325) - Include mode disable confirmation
- **TS_WV_EVT_handleRequestIncludeFileName** (messageHandler.ts:1327-1359) - Include file name input requests
- **TS_WV_EVT_handleRequestEditIncludeFileName** (messageHandler.ts:1361-1397) - Include file name editing

### TS_WV_SYS Functions
- **TS_WV_SYS_detectBoardChanges** (messageHandler.ts:432-496) - Board state change detection for focus targeting
- **TS_WV_SYS_unfoldColumnsForFocusTargets** (messageHandler.ts:498-527) - Column unfolding before updates
- **TS_WV_SYS_sendFocusTargets** (messageHandler.ts:529-539) - Focus target notification to webview
- **TS_WV_SYS_updateTaskInBackend** (messageHandler.ts:583-603) - Backend task property updates
- **TS_WV_SYS_performBoardAction** (messageHandler.ts:627-642) - Board action with undo state and updates
- **TS_WV_SYS_performBoardActionSilent** (messageHandler.ts:644-659) - Silent board action without triggers
- **TS_WV_SYS_getSnippetNameForShortcut** (messageHandler.ts:745-768) - Snippet name resolution for shortcuts
- **TS_WV_SYS_loadVSCodeKeybindings** (messageHandler.ts:770-804) - VS Code keybinding configuration loading
- **TS_WV_SYS_getUserKeybindingsPath** (messageHandler.ts:806-817) - User keybindings path resolution
- **TS_WV_SYS_getWorkspaceKeybindingsPath** (messageHandler.ts:819-830) - Workspace keybindings path resolution
- **TS_WV_SYS_matchesShortcut** (messageHandler.ts:832-846) - Keybinding shortcut matching
- **TS_WV_SYS_resolveSnippetContent** (messageHandler.ts:848-878) - Snippet content resolution from configuration
- **TS_WV_SYS_loadMarkdownSnippets** (messageHandler.ts:880-909) - Markdown snippet loading from sources
- **TS_WV_SYS_getUserSnippetsPath** (messageHandler.ts:911-923) - User snippets directory path
- **TS_WV_SYS_getWorkspaceSnippetsPath** (messageHandler.ts:925-936) - Workspace snippets directory path
- **TS_WV_SYS_getVSCodeUserDataDir** (messageHandler.ts:938-952) - VS Code user data directory for platform
- **TS_WV_SYS_loadSnippetsFromFile** (messageHandler.ts:954-964) - JSON snippet file loading with comments
- **TS_WV_SYS_loadExtensionSnippets** (messageHandler.ts:966-970) - Built-in extension snippet loading
- **TS_WV_SYS_processSnippetBody** (messageHandler.ts:972-1000) - VS Code snippet variable processing

### TS_WV_INIT Functions
- **TS_WV_INIT_createOrShow** (kanbanWebviewPanel.ts:95-159) - Panel creation or show existing with workspace permissions
- **TS_WV_INIT_revive** (kanbanWebviewPanel.ts:161-180) - Panel revival from serialized state
- **TS_WV_INIT_refreshWebviewContent** (kanbanWebviewPanel.ts:69-93) - Force webview content refresh for development

### TS_WV_CHK Functions
- **TS_WV_CHK_getPanelForDocument** (kanbanWebviewPanel.ts:183-185) - Panel lookup by document URI
- **TS_WV_CHK_getAllPanels** (kanbanWebviewPanel.ts:188-190) - All active panel retrieval

### TS_UMG_SYS_CONFLICT Functions
- **TS_UMG_SYS_resolveConflict** (conflictResolver.ts:49-73) - Conflict resolution with deduplication
- **TS_UMG_SYS_showConflictDialog** (conflictResolver.ts:86-99) - Context-appropriate conflict dialogs
- **TS_UMG_SYS_showPanelCloseDialog** (conflictResolver.ts:104-177) - Panel close dialog for unsaved changes
- **TS_UMG_SYS_showExternalMainFileDialog** (conflictResolver.ts:182-290) - External main file change dialog
- **TS_UMG_SYS_showExternalIncludeFileDialog** (conflictResolver.ts:295-394) - External include file change dialog
- **TS_UMG_SYS_showPresaveCheckDialog** (conflictResolver.ts:399-437) - Pre-save check dialog for external changes
- **TS_UMG_SYS_generateDialogKey** (conflictResolver.ts:78-81) - Unique dialog key generation
- **TS_UMG_SYS_clearActiveDialogs** (conflictResolver.ts:442-445) - Active dialog cleanup

---

## JavaScript Functions (305+ total)

### JS_PMG_CNV Functions (Markdown-it Plugins)
- **JS_PMG_CNV_markPlugin** (markdown-it-mark-browser.js:7) - Main plugin for `==text==` highlighting
- **JS_PMG_CNV_markTokenize** (markdown-it-mark-browser.js:9-51) - Mark syntax tokenization with delimiter scanning
- **JS_PMG_CNV_markPostProcess** (markdown-it-mark-browser.js:52-91) - Mark token post-processing to HTML
- **JS_PMG_CNV_subscriptPlugin** (markdown-it-sub-browser.js:56) - Subscript `~text~` support
- **JS_PMG_CNV_subscriptTokenize** (markdown-it-sub-browser.js:10-55) - Subscript tokenization with validation
- **JS_PMG_CNV_superscriptPlugin** (markdown-it-sup-browser.js:56) - Superscript `^text^` support
- **JS_PMG_CNV_superscriptTokenize** (markdown-it-sup-browser.js:10-55) - Superscript tokenization with validation
- **JS_PMG_CNV_insertPlugin** (markdown-it-ins-browser.js:7) - Insert `++text++` syntax plugin
- **JS_PMG_CNV_insertTokenize** (markdown-it-ins-browser.js:9-51) - Insert syntax tokenization
- **JS_PMG_CNV_insertPostProcess** (markdown-it-ins-browser.js:52-91) - Insert token post-processing
- **JS_PMG_CNV_underlinePlugin** (markdown-it-underline-browser.js:10) - Underline emphasis conversion
- **JS_PMG_CNV_underlineRender** (markdown-it-underline-browser.js:11-26) - Custom underscore to underline renderer
- **JS_PMG_CNV_abbrPlugin** (markdown-it-abbr-browser.js:9) - Abbreviation `*[abbr]: definition` support
- **JS_PMG_CNV_abbrDef** (markdown-it-abbr-browser.js:18-66) - Abbreviation definition parsing
- **JS_PMG_CNV_abbrReplace** (markdown-it-abbr-browser.js:67-138) - Text replacement with abbreviation markup
- **JS_PMG_CNV_containerPlugin** (markdown-it-container-browser.js:5-24) - Custom container support
- **JS_PMG_CNV_containerValidateDefault** (markdown-it-container-browser.js:8) - Default container validation
- **JS_PMG_CNV_containerRenderDefault** (markdown-it-container-browser.js:11) - Default container rendering
- **JS_PMG_CNV_containerTokenize** (markdown-it-container-browser.js:25-86) - Container block parsing
- **JS_PMG_CNV_strikethroughAltPlugin** (markdown-it-strikethrough-alt-browser.js:7) - Alternative `--text--` strikethrough
- **JS_PMG_CNV_strikethroughScanDelims** (markdown-it-strikethrough-alt-browser.js:9-23) - Delimiter sequence scanning
- **JS_PMG_CNV_strikethroughTokenize** (markdown-it-strikethrough-alt-browser.js:24-56) - Strikethrough tokenization
- **JS_PMG_CNV_strikethroughPostProcess** (markdown-it-strikethrough-alt-browser.js:57-79) - Strikethrough post-processing
- **JS_PMG_CNV_multicolumnRender** (markdown-it-multicolumn-browser.js:3-16) - Multicolumn token rendering to HTML
- **JS_PMG_CNV_multicolumnRuler** (markdown-it-multicolumn-browser.js:17-92) - Multicolumn syntax parsing
- **JS_PMG_CNV_multicolumnPlugin** (markdown-it-multicolumn-browser.js:93-105) - Main multicolumn plugin
- **JS_PMG_CNV_includePlugin** (markdown-it-include-browser.js:18-57) - Include `!!!include(filepath)!!!` plugin
- **JS_PMG_CNV_includeGetFileContent** (markdown-it-include-browser.js:112-138) - File content retrieval with caching
- **JS_PMG_CNV_includeUpdateFileCache** (markdown-it-include-browser.js:139-155) - Cache updates with re-render
- **JS_PMG_CNV_includeEscapeHtml** (markdown-it-include-browser.js:156-160) - HTML escaping helper

### JS_UMG_MNU Functions (Menu & UI Management)
- **JS_UMG_MNU_generateTagSubmenu** (submenuGenerator.js:11-40) - Tag submenu HTML generation with grouping
- **JS_UMG_MNU_generateMoveSubmenu** (submenuGenerator.js:41-52) - Move operation submenu creation
- **JS_UMG_MNU_generateSortSubmenu** (submenuGenerator.js:53-61) - Sort operation submenu creation
- **JS_UMG_MNU_createSubmenuContent** (submenuGenerator.js:62-86) - Dynamic submenu content based on type
- **JS_UMG_MNU_createTagGroupContent** (submenuGenerator.js:87-125) - Tag group content creation
- **JS_UMG_MNU_createMoveContent** (submenuGenerator.js:126-135) - Move operation HTML creation
- **JS_UMG_MNU_createMoveToListContent** (submenuGenerator.js:136-146) - Move between columns content
- **JS_UMG_MNU_createSortContent** (submenuGenerator.js:147-154) - Sort operation HTML creation
- **JS_UMG_MNU_groupTagsByType** (submenuGenerator.js:155-169) - Tag categorization by type
- **JS_UMG_MNU_showSubmenu** (submenuGenerator.js:170-199) - Submenu display with positioning
- **JS_UMG_MNU_hideSubmenu** (submenuGenerator.js:200-205) - Submenu cleanup and hiding

### JS_UMG_TRK Functions (Runtime Tracking)
- **JS_UMG_TRK_runtimeTrackerInit** (runtime-tracker.js:32-63) - Runtime tracker initialization
- **JS_UMG_TRK_runtimeTrackerStart** (runtime-tracker.js:64-96) - Function tracking startup
- **JS_UMG_TRK_runtimeTrackerStop** (runtime-tracker.js:97-111) - Tracking shutdown and final report
- **JS_UMG_TRK_runtimeTrackerClear** (runtime-tracker.js:112-119) - Tracking data reset
- **JS_UMG_TRK_wrapGlobalFunctions** (runtime-tracker.js:120-131) - Global function wrapping for tracking
- **JS_UMG_TRK_wrapWindowFunctions** (runtime-tracker.js:132-151) - Specific window function wrapping
- **JS_UMG_TRK_findGlobalFunctions** (runtime-tracker.js:152-171) - Application function discovery
- **JS_UMG_TRK_isApplicationFunction** (runtime-tracker.js:172-200) - Application function validation
- **JS_UMG_TRK_wrapFunction** (runtime-tracker.js:201-227) - Individual function wrapping for tracking
- **JS_UMG_TRK_recordFunctionCall** (runtime-tracker.js:228-262) - Function call recording with context
- **JS_UMG_TRK_getStackTrace** (runtime-tracker.js:263-273) - Call stack capture for debugging
- **JS_UMG_TRK_generateReport** (runtime-tracker.js:274-319) - Comprehensive usage report generation
- **JS_UMG_TRK_getMostCalledFunctions** (runtime-tracker.js:320-329) - Most called functions sorted
- **JS_UMG_TRK_getLeastCalledFunctions** (runtime-tracker.js:330-339) - Least called functions sorted
- **JS_UMG_TRK_getRecentlyCalledFunctions** (runtime-tracker.js:340-349) - Recently called functions sorted
- **JS_UMG_TRK_saveReport** (runtime-tracker.js:350-375) - Report persistence to localStorage and backend
- **JS_UMG_TRK_generateSessionId** (runtime-tracker.js:376-383) - Unique session ID generation

### JS_UMG_EVT Functions (Task Editor)
- **JS_UMG_EVT_taskEditorInit** (taskEditor.js:8-20) - Task editor initialization
- **JS_UMG_EVT_getCurrentEditState** (taskEditor.js:21-40) - Current editing state retrieval
- **JS_UMG_EVT_applyCurrentEditToBoard** (taskEditor.js:41-75) - Edit state application to board data
- **JS_UMG_EVT_handlePostSaveUpdate** (taskEditor.js:76-93) - Post-save editor synchronization
- **JS_UMG_EVT_setupGlobalHandlers** (taskEditor.js:94-259) - Global keyboard and mouse handlers
- **JS_UMG_EVT_startEdit** (taskEditor.js:260-399) - Edit mode initialization for elements
- **JS_UMG_EVT_transitionToDescription** (taskEditor.js:400-452) - Title to description editing transition
- **JS_UMG_EVT_saveTaskEditor** (taskEditor.js:453-473) - Current edit saving and exit
- **JS_UMG_EVT_saveCurrentField** (taskEditor.js:474-780) - Field saving with tag reconstruction
- **JS_UMG_EVT_closeEditor** (taskEditor.js:781-821) - Editor cleanup and state restoration
- **JS_UMG_EVT_saveUndoStateImmediately** (taskEditor.js:822-882) - Immediate undo state saving
- **JS_UMG_EVT_reconstructColumnTitle** (taskEditor.js:883-958) - Column title reconstruction with tags
- **JS_UMG_EVT_hasLayoutChanged** (taskEditor.js:959-983) - Layout change detection
- **JS_UMG_EVT_editTitle** (taskEditor.js:984-1002) - Public task title editing API
- **JS_UMG_EVT_editDescription** (taskEditor.js:1003-1021) - Public task description editing API
- **JS_UMG_EVT_editColumnTitle** (taskEditor.js:1022-1040) - Public column title editing API

### JS_UTL_STY Functions (Color & Style Utilities)
- **JS_UTL_STY_hexToRgb** (colorUtils.js:12-39) - Hex color to RGB conversion with validation
- **JS_UTL_STY_rgbToHex** (colorUtils.js:40-58) - RGB values to hex conversion with clamping
- **JS_UTL_STY_rgbObjectToHex** (colorUtils.js:59-67) - RGB object to hex string conversion
- **JS_UTL_STY_isValidHexColor** (colorUtils.js:68-76) - Hex color format validation
- **JS_UTL_STY_parseToRgb** (colorUtils.js:77-101) - Any color format to RGB parsing
- **JS_UTL_STY_lighten** (colorUtils.js:102-119) - Color lightening by percentage
- **JS_UTL_STY_darken** (colorUtils.js:120-136) - Color darkening by percentage
- **JS_UTL_STY_getContrastTextColor** (colorUtils.js:137-151) - Contrasting text color calculation
- **JS_UTL_STY_withAlpha** (colorUtils.js:152-169) - Color with transparency generation

### JS_UTL_CFG Functions (Configuration Management)
- **JS_UTL_CFG_configManagerInit** (configManager.js:7-20) - Configuration system initialization
- **JS_UTL_CFG_getConfig** (configManager.js:21-42) - Generic configuration getter with caching
- **JS_UTL_CFG_getNestedProperty** (configManager.js:43-49) - Nested property traversal using dot notation
- **JS_UTL_CFG_clearCache** (configManager.js:50-57) - Configuration cache clearing
- **JS_UTL_CFG_updateConfig** (configManager.js:58-75) - Configuration updates to VS Code with caching

### JS_UTL_STY_MANAGER Functions (Dynamic Style Management)
- **JS_UTL_STY_styleManagerInit** (styleManager.js:7-15) - Style management initialization
- **JS_UTL_STY_initStyleElement** (styleManager.js:16-39) - Dynamic style element creation
- **JS_UTL_STY_applyStyle** (styleManager.js:40-57) - Generic style property application
- **JS_UTL_STY_applyStyles** (styleManager.js:58-68) - Multiple style application
- **JS_UTL_STY_setCSSVariable** (styleManager.js:69-75) - CSS custom property setting
- **JS_UTL_STY_updateStylesheet** (styleManager.js:76-103) - Stylesheet rebuilding with stored styles
- **JS_UTL_STY_clearStyles** (styleManager.js:104-113) - Dynamic style clearing
- **JS_UTL_STY_removeStyle** (styleManager.js:114-124) - Specific style property removal
- **JS_UTL_STY_applyColumnWidth** (styleManager.js:125-128) - Column width CSS application
- **JS_UTL_STY_applyCardHeight** (styleManager.js:129-132) - Card height CSS application
- **JS_UTL_STY_applyWhitespace** (styleManager.js:133-136) - Whitespace CSS application
- **JS_UTL_STY_applyFontSize** (styleManager.js:137-140) - Font size CSS application
- **JS_UTL_STY_applyFontFamily** (styleManager.js:141-144) - Font family CSS application
- **JS_UTL_STY_applyLayoutRows** (styleManager.js:145-148) - Layout rows CSS application
- **JS_UTL_STY_applyRowHeight** (styleManager.js:149-152) - Row height CSS application

### JS_UTL_MNU Functions (Menu Management)
- **JS_UTL_MNU_menuManagerInit** (menuManager.js:7-19) - Menu system initialization
- **JS_UTL_MNU_registerMenu** (menuManager.js:20-29) - Menu configuration registration
- **JS_UTL_MNU_generateMenuHTML** (menuManager.js:30-60) - Menu HTML generation with current values
- **JS_UTL_MNU_isItemSelected** (menuManager.js:61-83) - Menu item selection state checking
- **JS_UTL_MNU_generateMenuItem** (menuManager.js:84-104) - Individual menu item HTML generation
- **JS_UTL_MNU_generateIcon** (menuManager.js:105-116) - Menu item icon HTML generation
- **JS_UTL_MNU_handleMenuClick** (menuManager.js:117-129) - Menu item click handling
- **JS_UTL_MNU_updateMenu** (menuManager.js:130-141) - Specific menu HTML updating
- **JS_UTL_MNU_updateAllMenus** (menuManager.js:142-153) - All menu HTML updating
- **JS_UTL_MNU_generateSubmenu** (menuManager.js:154-161) - Submenu HTML generation
- **JS_UTL_MNU_initializeMenus** (menuManager.js:162-179) - Menu system event delegation setup
- **JS_UTL_MNU_clearMenus** (menuManager.js:180-187) - Menu configuration clearing

### JS_UTL_DRG Functions (Drag State Management)
- **JS_UTL_DRG_dragStateManagerInit** (dragStateManager.js:7-14) - Drag state initialization
- **JS_UTL_DRG_resetDragState** (dragStateManager.js:15-33) - Drag state reset to initial values
- **JS_UTL_DRG_startDrag** (dragStateManager.js:34-77) - Drag operation initiation with feedback
- **JS_UTL_DRG_updateDragOver** (dragStateManager.js:78-106) - Drag over state updates with highlighting
- **JS_UTL_DRG_endDrag** (dragStateManager.js:107-133) - Drag operation completion
- **JS_UTL_DRG_getDragData** (dragStateManager.js:134-152) - Current drag state data retrieval
- **JS_UTL_DRG_isDraggingType** (dragStateManager.js:153-163) - Specific drag type checking
- **JS_UTL_DRG_setDataTransfer** (dragStateManager.js:164-174) - HTML5 data transfer setting
- **JS_UTL_DRG_parseDataTransfer** (dragStateManager.js:175-213) - Data transfer parsing from events
- **JS_UTL_DRG_addListener** (dragStateManager.js:214-225) - Drag event listener addition
- **JS_UTL_DRG_removeListener** (dragStateManager.js:226-240) - Drag event listener removal
- **JS_UTL_DRG_notifyListeners** (dragStateManager.js:241-258) - Drag event listener notification
- **JS_UTL_DRG_canAcceptDrop** (dragStateManager.js:259-280) - Drop acceptance validation

### JS_PMG_RND Functions (Markdown Rendering)
- **JS_PMG_RND_wikiLinksPlugin** (markdownRenderer.js:2-93) - Wiki-style `[[document|title]]` link plugin
- **JS_PMG_RND_parseWikiLink** (markdownRenderer.js:10-82) - Individual wiki link syntax parsing
- **JS_PMG_RND_tagPlugin** (markdownRenderer.js:94-174) - Hashtag `#tag` syntax plugin
- **JS_PMG_RND_parseTag** (markdownRenderer.js:97-150) - Hashtag syntax parsing with gather tags
- **JS_PMG_RND_datePersonTagPlugin** (markdownRenderer.js:175-248) - `@date` and `@person` tag plugin
- **JS_PMG_RND_parseDatePersonTag** (markdownRenderer.js:176-219) - Date/person tag syntax parsing
- **JS_PMG_RND_extractFirstTag** (markdownRenderer.js:249-255) - First hashtag extraction from text
- **JS_PMG_RND_extractAllTags** (markdownRenderer.js:256-261) - All hashtag extraction from text
- **JS_PMG_RND_renderMarkdown** (markdownRenderer.js:262-330) - Main markdown rendering with plugins

### JS_VLD_CHK Functions (Validation Utilities)
- **JS_VLD_CHK_escapeHtml** (validationUtils.js:12-26) - HTML character escaping for XSS prevention
- **JS_VLD_CHK_escapeFilePath** (validationUtils.js:27-45) - File path escaping for markdown safety
- **JS_VLD_CHK_escapeRegex** (validationUtils.js:46-55) - Special regex character escaping
- **JS_VLD_CHK_isValidHexColor** (validationUtils.js:56-68) - Hex color format validation
- **JS_VLD_CHK_isValidEmail** (validationUtils.js:69-79) - Basic email format validation
- **JS_VLD_CHK_isValidUrl** (validationUtils.js:80-94) - URL format validation using constructor
- **JS_VLD_CHK_sanitizeFilename** (validationUtils.js:95-109) - Filename sanitization removing invalid chars
- **JS_VLD_CHK_validateUserInput** (validationUtils.js:110-151) - Comprehensive user input validation
- **JS_VLD_CHK_isSafeForMarkdown** (validationUtils.js:152-170) - Markdown safety validation
- **JS_VLD_CHK_truncateText** (validationUtils.js:171-178) - Text truncation with ellipsis

### JS_UMG_NAV Functions (Search Functionality)
- **JS_UMG_NAV_searchInit** (search.js:3-15) - Search functionality initialization
- **JS_UMG_NAV_initializeSearch** (search.js:16-19) - DOM-ready search initialization
- **JS_UMG_NAV_openSearch** (search.js:20-31) - Search panel opening with focus
- **JS_UMG_NAV_closeSearch** (search.js:32-42) - Search panel closing and cleanup
- **JS_UMG_NAV_toggleCaseSensitive** (search.js:43-49) - Case sensitive search toggling
- **JS_UMG_NAV_toggleWholeWords** (search.js:50-56) - Whole word search toggling
- **JS_UMG_NAV_toggleRegex** (search.js:57-63) - Regex search toggling
- **JS_UMG_NAV_performSearch** (search.js:64-90) - Search execution with term processing
- **JS_UMG_NAV_findAllMatches** (search.js:91-159) - All search matches finding in board content
- **JS_UMG_NAV_navigateToResult** (search.js:160-195) - Specific search result navigation
- **JS_UMG_NAV_nextResult** (search.js:196-202) - Next search result navigation
- **JS_UMG_NAV_previousResult** (search.js:203-211) - Previous search result navigation
- **JS_UMG_NAV_highlightAllResults** (search.js:212-238) - All search results highlighting
- **JS_UMG_NAV_highlightCurrentResult** (search.js:239-270) - Current search result highlighting
- **JS_UMG_NAV_highlightElement** (search.js:271-278) - Element highlight class application
- **JS_UMG_NAV_clearHighlights** (search.js:279-285) - Search highlight removal
- **JS_UMG_NAV_updateResultCounter** (search.js:286-296) - Search result counter display update
- **JS_UMG_NAV_handleSearchInput** (search.js:297-305) - Search input handling with debouncing

### JS_UMG_IO Functions (Modal Utilities)
- **JS_UMG_IO_modalUtilsInit** (modalUtils.js:7-15) - Modal management initialization
- **JS_UMG_IO_setupGlobalKeyHandler** (modalUtils.js:16-30) - Global Escape key handling for modals
- **JS_UMG_IO_showInputModal** (modalUtils.js:31-96) - Input modal display using existing HTML
- **JS_UMG_IO_closeInputModal** (modalUtils.js:97-111) - Input modal closing and cleanup
- **JS_UMG_IO_showConfirmModal** (modalUtils.js:112-236) - Custom confirmation modal creation
- **JS_UMG_IO_showAlert** (modalUtils.js:237-253) - Simple alert modal display
- **JS_UMG_IO_showConfirm** (modalUtils.js:254-271) - Simple confirm modal display
- **JS_UMG_IO_closeModal** (modalUtils.js:272-282) - Specific modal element closing
- **JS_UMG_IO_closeTopModal** (modalUtils.js:283-299) - Topmost modal closing
- **JS_UMG_IO_closeAllModals** (modalUtils.js:300-311) - All modal closing
- **JS_UMG_IO_hasOpenModals** (modalUtils.js:312-319) - Open modal status checking
- **JS_UMG_IO_showLoading** (modalUtils.js:320-354) - Loading modal with spinner display

### JS_DRG_EVT Functions (Drag & Drop Operations)
- **JS_DRG_EVT_generateMD5Hash** (dragDrop.js:8-32) - Hash generation using Web Crypto API
- **JS_DRG_EVT_createExternalDropIndicator** (dragDrop.js:82-98) - Visual drop indicator creation
- **JS_DRG_EVT_showExternalDropIndicator** (dragDrop.js:99-150) - Drop indicator positioning and display
- **JS_DRG_EVT_hideExternalDropIndicator** (dragDrop.js:151-182) - Drop indicator hiding and cleanup
- **JS_DRG_EVT_setupGlobalDragAndDrop** (dragDrop.js:183-350+) - Global drag and drop event listeners
- **JS_DRG_EVT_handleClipboardCardDrop** - Clipboard content drop processing
- **JS_DRG_EVT_handleEmptyCardDrop** - Empty card creation handling
- **JS_DRG_EVT_handleMultipleFilesDrop** - Multiple file drop processing
- **JS_DRG_EVT_handleClipboardImageDrop** - Clipboard image drop handling
- **JS_DRG_EVT_createNewTaskWithContent** - Task creation from dropped content
- **JS_DRG_EVT_setupTaskDragAndDrop** - Task drag/drop functionality setup
- **JS_DRG_EVT_setupColumnDragAndDrop** - Column reordering setup
- **JS_DRG_EVT_setupRowDragAndDrop** - Multi-row drag operation setup

### JS_UMG_RND Functions (Board Rendering)
- **JS_UMG_RND_extractFirstTag** (boardRenderer.js:21) - First tag extraction from text
- **JS_UMG_RND_hexToRgba** (boardRenderer.js:43) - Hex to RGBA conversion
- **JS_UMG_RND_hexToRgb** (boardRenderer.js:51) - Hex to RGB conversion
- **JS_UMG_RND_interpolateColor** (boardRenderer.js:64) - Color interpolation calculation
- **JS_UMG_RND_applyTagStyles** (boardRenderer.js:89) - Tag-based styling application
- **JS_UMG_RND_ensureTagStyleExists** (boardRenderer.js:118) - Tag style existence ensuring
- **JS_UMG_RND_renderBoard** (boardRenderer.js:1095) - Main board rendering function
- **JS_UMG_RND_createColumnElement** (boardRenderer.js:1470) - Column DOM element creation
- **JS_UMG_RND_createTaskElement** (boardRenderer.js:1646) - Task DOM element creation
- **JS_UMG_RND_toggleColumnCollapse** (boardRenderer.js:1780) - Column folding handling
- **JS_UMG_RND_toggleTaskCollapse** (boardRenderer.js:1831) - Task folding handling
- **JS_UMG_RND_generateTagStyles** (boardRenderer.js:1999) - CSS generation for tags
- **JS_UMG_RND_injectStackableBars** (boardRenderer.js:2326) - Visual tag bar injection

### JS_WV_CORE Functions (Webview Core - 100+ functions)
- **JS_WV_CFG_generateFontSizeCSS** (webview.js:45) - Dynamic font CSS generation
- **JS_WV_CFG_getCurrentSettingValue** (webview.js:189) - Current setting value retrieval
- **JS_WV_CFG_updateAllMenuIndicators** (webview.js:219) - Menu indicator updates
- **JS_WV_CFG_populateDynamicMenus** (webview.js:265) - Dynamic menu population
- **JS_WV_IO_isFilePath** (webview.js:677) - File path detection in text
- **JS_WV_IO_createFileMarkdownLink** (webview.js:693) - File link creation for markdown
- **JS_WV_IO_isImageFile** (webview.js:806) - Image file type checking
- **JS_WV_IO_extractDomainFromUrl** (webview.js:817) - Domain extraction from URLs
- **JS_WV_STY_applyColumnWidth** (webview.js:1099) - Column width application
- **JS_WV_STY_setColumnWidth** (webview.js:1135) - Column width setting
- **JS_WV_STY_applyLayoutRows** (webview.js:1168) - Row layout application
- **JS_WV_STY_setLayoutRows** (webview.js:1181) - Layout rows setting
- **JS_WV_STY_applyRowHeight** (webview.js:1203) - Row height application
- **JS_WV_CNV_filterTagsFromText** (webview.js:1371) - Tag filtering from text
- **JS_WV_CFG_applyTagVisibility** (webview.js:1399) - Tag visibility setting application
- **JS_WV_CFG_setTagVisibility** (webview.js:1423) - Tag visibility configuration
- **JS_WV_NAV_focusCard** (webview.js:2736) - Card focusing functionality
- **JS_WV_NAV_navigateToCard** (webview.js:2843) - Card navigation between cards
- **JS_WV_EVT_undo** (webview.js:3131) - Undo operation handling
- **JS_WV_EVT_redo** (webview.js:3150) - Redo operation handling
- **JS_WV_IO_updateFileInfoBar** (webview.js:3301) - File information display updates
- **JS_WV_IO_selectFile** (webview.js:3315) - File selection opening
- **JS_WV_IO_insertFileLink** (webview.js:3219) - File link insertion

---

## HTML Structure Analysis

### HTML_LAYOUT_STRUCTURE
- **File**: webview.html (282 lines)
- **Primary Structure**: Single-page application with fixed header and scrollable content
- **Main Sections**:
  - **File Info Bar** (lines 38-181) - Fixed header with file info, drag sources, and controls
  - **Search Panel** (lines 184-220) - Collapsible search interface
  - **Kanban Container** (lines 227-231) - Main board content area
  - **Input Modal** (lines 234-249) - Reusable modal dialog

### HTML_UI_COMPONENTS
- **Drag Sources** (lines 45-58) - Empty card and clipboard card draggable elements
- **Control Buttons** (lines 61-88) - Refresh, fold, sort, layout presets
- **Dropdown Menus** (lines 90-177) - File bar menu with dynamic submenus
- **Search Controls** (lines 192-218) - Search toggles, navigation, and counter
- **Context Menu** (lines 277-280) - Path context menu for file operations

### HTML_SCRIPT_LOADING
- **External CDN Scripts** (lines 8-12) - markdown-it and essential plugins
- **Local Browser Plugins** (lines 18-28) - Custom markdown-it extensions
- **Module Loading Order** (lines 259-276) - Dependency-ordered JavaScript modules

---

## CSS Structure Analysis

### CSS_VARIABLE_SYSTEM
- **File**: webview.css (34,000+ characters)
- **CSS Custom Properties** (lines 1-11):
  - `--whitespace: 4px` - Base spacing unit
  - `--task-height: auto` - Dynamic task height
  - `--column-width: 350px` - Default column width
  - `--collapsed-column-width: 40px` - Collapsed column width

### CSS_LAYOUT_SYSTEM
- **File Info Bar Styling** (lines 28-180+) - Fixed header layout with flexbox
- **Column Layout** - Grid-based responsive kanban columns
- **Card Styling** - Flexible card heights with overflow handling
- **Drag & Drop Visual Feedback** - Highlighting and indicator styles

### CSS_THEME_INTEGRATION
- **VS Code Variables** - Integration with `--vscode-*` CSS variables
- **Dynamic Styling** - CSS custom properties for runtime style changes
- **Component Theming** - Consistent styling across modal, menu, and board components

---

## Feature Duplication Analysis

### Potential Duplicates Identified:

#### 1. **Color Conversion Functions**
- **JS_UTL_STY_hexToRgb** (colorUtils.js:12-39)
- **JS_UMG_RND_hexToRgb** (boardRenderer.js:51)
- **JS_UMG_RND_hexToRgba** (boardRenderer.js:43)
- **Recommendation**: Consolidate to single utility in colorUtils.js

#### 2. **HTML Escaping Functions**
- **JS_VLD_CHK_escapeHtml** (validationUtils.js:12-26)
- **JS_PMG_CNV_includeEscapeHtml** (markdown-it-include-browser.js:156-160)
- **Recommendation**: Use single ValidationUtils.escapeHtml everywhere

#### 3. **Tag Extraction Functions**
- **JS_PMG_RND_extractFirstTag** (markdownRenderer.js:249-255)
- **JS_PMG_RND_extractAllTags** (markdownRenderer.js:256-261)
- **JS_UMG_RND_extractFirstTag** (boardRenderer.js:21)
- **Recommendation**: Centralize tag extraction utilities

#### 4. **File Path Validation**
- **JS_WV_IO_isFilePath** (webview.js:677)
- **JS_WV_IO_isImageFile** (webview.js:806)
- **TS_FMG_CHK_isImageFile** (fileManager.ts:172-176)
- **TS_FMG_CHK_isMediaFile** (fileManager.ts:389-399)
- **Recommendation**: Consolidate file type checking utilities

#### 5. **UUID Generation & Validation**
- Multiple ID generation functions in idGenerator.ts could be simplified
- **Recommendation**: Reduce to single generation function with type parameter

#### 6. **Modal Management**
- Input modal handling appears in both modalUtils.js and webview.js
- **Recommendation**: Centralize all modal operations in modalUtils.js

#### 7. **Menu Generation**
- Similar menu generation logic in submenuGenerator.js and menuManager.js
- **Recommendation**: Unify menu generation approaches

#### 8. **Search/Navigation Functions**
- **JS_UMG_NAV_navigateToResult** (search.js:160-195)
- **JS_WV_NAV_navigateToCard** (webview.js:2843)
- **JS_WV_NAV_focusCard** (webview.js:2736)
- **Recommendation**: Consolidate navigation utilities

#### 9. **Configuration Management**
- Multiple style application functions following same pattern:
  - **JS_UTL_STY_applyColumnWidth** (styleManager.js:125-128)
  - **JS_WV_STY_applyColumnWidth** (webview.js:1099)
  - **JS_WV_STY_setColumnWidth** (webview.js:1135)
- **Recommendation**: Create unified configuration application system

#### 10. **Drag State Management**
- **JS_UTL_DRG_startDrag** (dragStateManager.js:34-77)
- **JS_DRG_EVT_setupGlobalDragAndDrop** (dragDrop.js:183-350+)
- Multiple drag handling functions across dragDrop.js
- **Recommendation**: Consolidate drag operation management

#### 11. **Markdown Processing**
- Multiple similar tokenization patterns in markdown-it plugins:
  - **JS_PMG_CNV_markTokenize** (markdown-it-mark-browser.js:9-51)
  - **JS_PMG_CNV_insertTokenize** (markdown-it-ins-browser.js:9-51)
  - **JS_PMG_CNV_strikethroughTokenize** (markdown-it-strikethrough-alt-browser.js:24-56)
- **Recommendation**: Create generic tokenization helper for delimiter-based syntax

#### 12. **Event Handler Patterns**
- Similar initialization patterns across multiple files:
  - **JS_UMG_TRK_runtimeTrackerInit** (runtime-tracker.js:32-63)
  - **JS_UMG_EVT_taskEditorInit** (taskEditor.js:8-20)
  - **JS_UMG_NAV_searchInit** (search.js:3-15)
- **Recommendation**: Create standard initialization utility

---

## Summary Statistics

- **Total Functions Cataloged**: 457+
- **TypeScript Functions**: 152
- **JavaScript Functions**: 305+
- **Large Functions (>10 lines)**: ~280
- **Potential Duplicate Sets**: 12 major areas
- **Main Functional Categories**: 12 (INIT, CRUD, NAV, RND, EVT, STY, CHK, TRK, CNV, MNU, IO, SYS)
- **Files Analyzed**: 43 (15 TS, 26 JS, 1 HTML, 1 CSS)

## Recommended Refactoring Priorities

### High Priority (Major Code Reduction Potential)
1. **Color Utilities Consolidation** - 6+ duplicate functions → 1 utility module
2. **File Type Validation** - 4+ duplicate functions → 1 utility module
3. **Configuration Management** - 15+ duplicate functions → Generic configuration system
4. **Modal Management** - Centralize all modal operations

### Medium Priority (Moderate Improvement)
5. **Tag Processing** - Centralize tag extraction and processing
6. **Menu System** - Unify menu generation approaches
7. **Drag & Drop** - Consolidate drag state management
8. **Markdown Tokenization** - Generic delimiter-based tokenization helper

### Low Priority (Code Quality Improvement)
9. **UUID Management** - Simplify ID generation system
10. **Event Initialization** - Standard initialization patterns
11. **Navigation Functions** - Consolidate navigation utilities
12. **Search Operations** - Unify search and highlighting logic

This comprehensive catalog provides a structured foundation for identifying code duplicates and planning refactoring efforts to improve codebase maintainability and reduce technical debt.