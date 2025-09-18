# Function Analysis Report - Markdown Kanban Obsidian

This document catalogs all functions found in the codebase with their purposes, locations, and potential duplicates. Functions are organized by feature category to identify refactoring opportunities.

## Feature Classification System

**Legend:**
- `CONF` - Configuration management
- `DOM` - DOM manipulation and element handling
- `EVENT` - Event handling and user interactions
- `MD` - Markdown processing and rendering
- `STATE` - State management and data handling
- `FILE` - File operations and I/O
- `VALID` - Validation and sanitization
- `UI` - User interface components and styling
- `DRAG` - Drag and drop functionality
- `MENU` - Menu systems and navigation
- `SEARCH` - Search and filtering functionality
- `CACHE` - Caching and performance optimization

## TypeScript/JavaScript Functions

### Extension Core (`src/extension.ts`)

**Function:** activate
**File:** src/extension.ts:11
**Type:** function-declaration
**Parameters:** (context: vscode.ExtensionContext)
**Purpose:** Initialize VS Code extension, register commands and providers
**Features:** `CONF-INIT`, `EVENT-REGISTER`, `STATE-INIT`

**Function:** deactivate
**File:** src/extension.ts:45
**Type:** function-declaration
**Parameters:** ()
**Purpose:** Clean up extension resources on deactivation
**Features:** `STATE-CLEANUP`

### Webview Panel Management (`src/kanbanWebviewPanel.ts`)

**Function:** KanbanWebviewPanel.createOrShow
**File:** src/kanbanWebviewPanel.ts:25
**Type:** class-method
**Parameters:** (extensionPath: string, filePath?: string)
**Purpose:** Create new webview panel or show existing one
**Features:** `DOM-CREATE`, `STATE-MANAGE`, `CONF-LOAD`

**Function:** KanbanWebviewPanel.getColumnOf
**File:** src/kanbanWebviewPanel.ts:89
**Type:** class-method
**Parameters:** (extensionPath: string)
**Purpose:** Get webview column placement
**Features:** `CONF-GET`, `UI-LAYOUT`

**Function:** KanbanWebviewPanel.getWebviewOptions
**File:** src/kanbanWebviewPanel.ts:98
**Type:** class-method
**Parameters:** (extensionPath: string)
**Purpose:** Configure webview security and resource options
**Features:** `CONF-SECURITY`, `FILE-ACCESS`

**Function:** KanbanWebviewPanel.constructor
**File:** src/kanbanWebviewPanel.ts:110
**Type:** class-method
**Parameters:** (panel: vscode.WebviewPanel, extensionPath: string)
**Purpose:** Initialize panel instance with event handlers
**Features:** `EVENT-INIT`, `STATE-INIT`, `DOM-SETUP`

**Function:** KanbanWebviewPanel.dispose
**File:** src/kanbanWebviewPanel.ts:127
**Type:** class-method
**Parameters:** ()
**Purpose:** Clean up panel resources and remove listeners
**Features:** `STATE-CLEANUP`, `EVENT-CLEANUP`

**Function:** KanbanWebviewPanel.getHtmlForWebview
**File:** src/kanbanWebviewPanel.ts:138
**Type:** class-method
**Parameters:** (webview: vscode.Webview)
**Purpose:** Generate HTML content for webview with security headers
**Features:** `DOM-GENERATE`, `FILE-READ`, `CONF-SECURITY`

**Function:** KanbanWebviewPanel.setWebviewMessageListener
**File:** src/kanbanWebviewPanel.ts:175
**Type:** class-method
**Parameters:** (webview: vscode.Webview)
**Purpose:** Set up message communication between webview and extension
**Features:** `EVENT-MESSAGE`, `STATE-COMMUNICATE`

### Markdown Processing (`src/markdownParser.ts`)

**Function:** parseMarkdownToKanban
**File:** src/markdownParser.ts:15
**Type:** function-declaration
**Parameters:** (content: string)
**Purpose:** Parse markdown content into kanban board structure
**Features:** `MD-PARSE`, `STATE-TRANSFORM`, `VALID-STRUCTURE`

**Function:** convertKanbanToMarkdown
**File:** src/markdownParser.ts:85
**Type:** function-declaration
**Parameters:** (kanban: KanbanBoard)
**Purpose:** Convert kanban structure back to markdown format
**Features:** `MD-GENERATE`, `STATE-SERIALIZE`

**Function:** extractTasksFromColumn
**File:** src/markdownParser.ts:125
**Type:** function-declaration
**Parameters:** (content: string, columnTitle: string)
**Purpose:** Extract tasks from specific column section
**Features:** `MD-PARSE`, `VALID-EXTRACT`

**Function:** parseTaskContent
**File:** src/markdownParser.ts:155
**Type:** function-declaration
**Parameters:** (content: string)
**Purpose:** Parse individual task content and metadata
**Features:** `MD-PARSE`, `VALID-CONTENT`

### Message Handling (`src/messageHandler.ts`)

**Function:** handleMessage
**File:** src/messageHandler.ts:12
**Type:** function-declaration
**Parameters:** (message: any, webview: vscode.Webview, panel: KanbanWebviewPanel)
**Purpose:** Route and handle messages from webview
**Features:** `EVENT-ROUTE`, `STATE-DISPATCH`

**Function:** handleFileSelection
**File:** src/messageHandler.ts:45
**Type:** function-declaration
**Parameters:** (webview: vscode.Webview)
**Purpose:** Handle file picker dialog and selection
**Features:** `FILE-SELECT`, `UI-DIALOG`

**Function:** handleSaveContent
**File:** src/messageHandler.ts:78
**Type:** function-declaration
**Parameters:** (content: string, filePath: string)
**Purpose:** Save kanban content to markdown file
**Features:** `FILE-WRITE`, `STATE-PERSIST`

**Function:** handleRefreshContent
**File:** src/messageHandler.ts:95
**Type:** function-declaration
**Parameters:** (filePath: string, webview: vscode.Webview)
**Purpose:** Reload content from source file
**Features:** `FILE-READ`, `STATE-REFRESH`

### File Management (`src/fileManager.ts`)

**Function:** readFileContent
**File:** src/fileManager.ts:8
**Type:** function-declaration
**Parameters:** (filePath: string)
**Purpose:** Read file content with error handling
**Features:** `FILE-READ`, `VALID-PATH`

**Function:** writeFileContent
**File:** src/fileManager.ts:22
**Type:** function-declaration
**Parameters:** (filePath: string, content: string)
**Purpose:** Write content to file with backup
**Features:** `FILE-WRITE`, `STATE-BACKUP`

**Function:** createBackup
**File:** src/fileManager.ts:38
**Type:** function-declaration
**Parameters:** (filePath: string)
**Purpose:** Create backup copy of file before modification
**Features:** `FILE-BACKUP`, `STATE-SAFE`

**Function:** validateFilePath
**File:** src/fileManager.ts:52
**Type:** function-declaration
**Parameters:** (filePath: string)
**Purpose:** Validate file path accessibility and permissions
**Features:** `VALID-PATH`, `FILE-ACCESS`

### Webview Core (`src/html/webview.js`)

**Function:** initializeBoard
**File:** src/html/webview.js:15
**Type:** function-declaration
**Parameters:** ()
**Purpose:** Initialize kanban board display and interactions
**Features:** `DOM-INIT`, `EVENT-INIT`, `STATE-INIT`

**Function:** updateBoard
**File:** src/html/webview.js:45
**Type:** function-declaration
**Parameters:** (kanbanData)
**Purpose:** Update board display with new data
**Features:** `DOM-UPDATE`, `STATE-SYNC`

**Function:** handleMessage
**File:** src/html/webview.js:78
**Type:** function-declaration
**Parameters:** (event)
**Purpose:** Handle messages from extension host
**Features:** `EVENT-MESSAGE`, `STATE-RECEIVE`

**Function:** sendMessage
**File:** src/html/webview.js:95
**Type:** function-declaration
**Parameters:** (type, data)
**Purpose:** Send messages to extension host
**Features:** `EVENT-MESSAGE`, `STATE-SEND`

**Function:** getVSCodeConfig
**File:** src/html/webview.js:115
**Type:** function-declaration
**Parameters:** (key)
**Purpose:** Retrieve VS Code configuration value
**Features:** `CONF-GET`

**Function:** applyColumnWidthCSS
**File:** src/html/webview.js:125
**Type:** function-declaration
**Parameters:** (width)
**Purpose:** Apply dynamic column width styling
**Features:** `UI-STYLE`, `CONF-APPLY`

**Function:** applyCardHeightCSS
**File:** src/html/webview.js:135
**Type:** function-declaration
**Parameters:** (height)
**Purpose:** Apply dynamic card height styling
**Features:** `UI-STYLE`, `CONF-APPLY`

**Function:** applyWhitespaceCSS
**File:** src/html/webview.js:145
**Type:** function-declaration
**Parameters:** (spacing)
**Purpose:** Apply dynamic whitespace styling
**Features:** `UI-STYLE`, `CONF-APPLY`

**Function:** applyFontSizeCSS
**File:** src/html/webview.js:155
**Type:** function-declaration
**Parameters:** (size)
**Purpose:** Apply dynamic font size styling
**Features:** `UI-STYLE`, `CONF-APPLY`

**Function:** applyFontFamilyCSS
**File:** src/html/webview.js:165
**Type:** function-declaration
**Parameters:** (family)
**Purpose:** Apply dynamic font family styling
**Features:** `UI-STYLE`, `CONF-APPLY`

**Function:** applyLayoutRowsCSS
**File:** src/html/webview.js:175
**Type:** function-declaration
**Parameters:** (rows)
**Purpose:** Apply dynamic layout rows styling
**Features:** `UI-STYLE`, `CONF-APPLY`

**Function:** applyRowHeightCSS
**File:** src/html/webview.js:185
**Type:** function-declaration
**Parameters:** (height)
**Purpose:** Apply dynamic row height styling
**Features:** `UI-STYLE`, `CONF-APPLY`

**Function:** hexToRgb
**File:** src/html/webview.js:195
**Type:** function-declaration
**Parameters:** (hex)
**Purpose:** Convert hex color to RGB format
**Features:** `VALID-COLOR`

**Function:** rgbToHex
**File:** src/html/webview.js:205
**Type:** function-declaration
**Parameters:** (r, g, b)
**Purpose:** Convert RGB color to hex format
**Features:** `VALID-COLOR`

**Function:** isValidHexColor
**File:** src/html/webview.js:215
**Type:** function-declaration
**Parameters:** (color)
**Purpose:** Validate hex color format
**Features:** `VALID-COLOR`

### Board Rendering (`src/html/boardRenderer.js`)

**Function:** renderBoard
**File:** src/html/boardRenderer.js:8
**Type:** function-declaration
**Parameters:** (kanbanData)
**Purpose:** Render complete kanban board structure
**Features:** `DOM-RENDER`, `STATE-DISPLAY`

**Function:** renderColumn
**File:** src/html/boardRenderer.js:25
**Type:** function-declaration
**Parameters:** (column, index)
**Purpose:** Render individual column with header and tasks
**Features:** `DOM-RENDER`, `UI-COLUMN`

**Function:** renderTask
**File:** src/html/boardRenderer.js:55
**Type:** function-declaration
**Parameters:** (task, columnIndex, taskIndex)
**Purpose:** Render individual task card with content
**Features:** `DOM-RENDER`, `UI-TASK`

**Function:** renderTaskContent
**File:** src/html/boardRenderer.js:85
**Type:** function-declaration
**Parameters:** (task)
**Purpose:** Render task content with markdown processing
**Features:** `MD-RENDER`, `DOM-CONTENT`

**Function:** updateColumnCount
**File:** src/html/boardRenderer.js:115
**Type:** function-declaration
**Parameters:** (column, element)
**Purpose:** Update column task counter display
**Features:** `DOM-UPDATE`, `UI-COUNTER`

### Drag and Drop (`src/html/dragDrop.js`)

**Function:** initializeDragDrop
**File:** src/html/dragDrop.js:5
**Type:** function-declaration
**Parameters:** ()
**Purpose:** Initialize drag and drop event handlers
**Features:** `DRAG-INIT`, `EVENT-INIT`

**Function:** handleDragStart
**File:** src/html/dragDrop.js:15
**Type:** function-declaration
**Parameters:** (event)
**Purpose:** Handle start of drag operation
**Features:** `DRAG-START`, `STATE-TRACK`

**Function:** handleDragOver
**File:** src/html/dragDrop.js:35
**Type:** function-declaration
**Parameters:** (event)
**Purpose:** Handle drag over drop zones
**Features:** `DRAG-OVER`, `UI-FEEDBACK`

**Function:** handleDrop
**File:** src/html/dragDrop.js:55
**Type:** function-declaration
**Parameters:** (event)
**Purpose:** Handle task drop operation
**Features:** `DRAG-DROP`, `STATE-UPDATE`

**Function:** handleDragEnd
**File:** src/html/dragDrop.js:85
**Type:** function-declaration
**Parameters:** (event)
**Purpose:** Clean up after drag operation
**Features:** `DRAG-END`, `STATE-CLEAN`

**Function:** updateDragState
**File:** src/html/dragDrop.js:95
**Type:** function-declaration
**Parameters:** (isDragging)
**Purpose:** Update UI drag state indicators
**Features:** `DRAG-STATE`, `UI-UPDATE`

**Function:** findDropTarget
**File:** src/html/dragDrop.js:105
**Type:** function-declaration
**Parameters:** (element)
**Purpose:** Find valid drop target for dragged item
**Features:** `DRAG-TARGET`, `DOM-SEARCH`

**Function:** highlightDropZone
**File:** src/html/dragDrop.js:125
**Type:** function-declaration
**Parameters:** (element, highlight)
**Purpose:** Visual feedback for drop zones
**Features:** `DRAG-VISUAL`, `UI-HIGHLIGHT`

### Task Editor (`src/html/taskEditor.js`)

**Function:** openTaskEditor
**File:** src/html/taskEditor.js:8
**Type:** function-declaration
**Parameters:** (taskElement)
**Purpose:** Open inline task editor for content modification
**Features:** `UI-EDITOR`, `EVENT-EDIT`

**Function:** closeTaskEditor
**File:** src/html/taskEditor.js:45
**Type:** function-declaration
**Parameters:** (save)
**Purpose:** Close task editor and optionally save changes
**Features:** `UI-EDITOR`, `STATE-SAVE`

**Function:** saveTaskChanges
**File:** src/html/taskEditor.js:65
**Type:** function-declaration
**Parameters:** (taskElement, content)
**Purpose:** Save task content modifications
**Features:** `STATE-UPDATE`, `DOM-UPDATE`

**Function:** cancelTaskEdit
**File:** src/html/taskEditor.js:85
**Type:** function-declaration
**Parameters:** (taskElement)
**Purpose:** Cancel task editing without saving
**Features:** `UI-CANCEL`, `STATE-REVERT`

**Function:** autoResizeTextarea
**File:** src/html/taskEditor.js:95
**Type:** function-declaration
**Parameters:** (textarea)
**Purpose:** Auto-resize textarea to fit content
**Features:** `UI-RESIZE`, `DOM-ADJUST`

### Menu Operations (`src/html/menuOperations.js`)

**Function:** initializeMenuSystem
**File:** src/html/menuOperations.js:5
**Type:** function-declaration
**Parameters:** ()
**Purpose:** Initialize menu system and context menus
**Features:** `MENU-INIT`, `EVENT-INIT`

**Function:** toggleFileBarMenu
**File:** src/html/menuOperations.js:15
**Type:** function-declaration
**Parameters:** (event, button)
**Purpose:** Toggle file bar dropdown menu visibility
**Features:** `MENU-TOGGLE`, `UI-DROPDOWN`

**Function:** updateColumnWidthMenu
**File:** src/html/menuOperations.js:35
**Type:** function-declaration
**Parameters:** ()
**Purpose:** Update column width menu options and indicators
**Features:** `MENU-UPDATE`, `CONF-SYNC`

**Function:** updateCardHeightMenu
**File:** src/html/menuOperations.js:55
**Type:** function-declaration
**Parameters:** ()
**Purpose:** Update card height menu options and indicators
**Features:** `MENU-UPDATE`, `CONF-SYNC`

**Function:** updateWhitespaceMenu
**File:** src/html/menuOperations.js:75
**Type:** function-declaration
**Parameters:** ()
**Purpose:** Update whitespace menu options and indicators
**Features:** `MENU-UPDATE`, `CONF-SYNC`

**Function:** updateFontSizeMenu
**File:** src/html/menuOperations.js:95
**Type:** function-declaration
**Parameters:** ()
**Purpose:** Update font size menu options and indicators
**Features:** `MENU-UPDATE`, `CONF-SYNC`

**Function:** updateFontFamilyMenu
**File:** src/html/menuOperations.js:115
**Type:** function-declaration
**Parameters:** ()
**Purpose:** Update font family menu options and indicators
**Features:** `MENU-UPDATE`, `CONF-SYNC`

**Function:** updateLayoutRowsMenu
**File:** src/html/menuOperations.js:135
**Type:** function-declaration
**Parameters:** ()
**Purpose:** Update layout rows menu options and indicators
**Features:** `MENU-UPDATE`, `CONF-SYNC`

**Function:** updateRowHeightMenu
**File:** src/html/menuOperations.js:155
**Type:** function-declaration
**Parameters:** ()
**Purpose:** Update row height menu options and indicators
**Features:** `MENU-UPDATE`, `CONF-SYNC`

**Function:** updateStickyHeadersMenu
**File:** src/html/menuOperations.js:175
**Type:** function-declaration
**Parameters:** ()
**Purpose:** Update sticky headers menu options and indicators
**Features:** `MENU-UPDATE`, `CONF-SYNC`

**Function:** updateTagVisibilityMenu
**File:** src/html/menuOperations.js:195
**Type:** function-declaration
**Parameters:** ()
**Purpose:** Update tag visibility menu options and indicators
**Features:** `MENU-UPDATE`, `CONF-SYNC`

**Function:** updateExportTagVisibilityMenu
**File:** src/html/menuOperations.js:215
**Type:** function-declaration
**Parameters:** ()
**Purpose:** Update export tag visibility menu options and indicators
**Features:** `MENU-UPDATE`, `CONF-SYNC`

**Function:** updateImageFillMenu
**File:** src/html/menuOperations.js:235
**Type:** function-declaration
**Parameters:** ()
**Purpose:** Update image fill menu options and indicators
**Features:** `MENU-UPDATE`, `CONF-SYNC`

### Search (`src/html/search.js`)

**Function:** kanbanSearch.initializeSearch
**File:** src/html/search.js:5
**Type:** object-method
**Parameters:** ()
**Purpose:** Initialize search functionality and key bindings
**Features:** `SEARCH-INIT`, `EVENT-INIT`

**Function:** kanbanSearch.openSearch
**File:** src/html/search.js:25
**Type:** object-method
**Parameters:** ()
**Purpose:** Open search panel and focus input
**Features:** `SEARCH-OPEN`, `UI-FOCUS`

**Function:** kanbanSearch.closeSearch
**File:** src/html/search.js:35
**Type:** object-method
**Parameters:** ()
**Purpose:** Close search panel and clear results
**Features:** `SEARCH-CLOSE`, `STATE-CLEAR`

**Function:** kanbanSearch.handleSearchInput
**File:** src/html/search.js:45
**Type:** object-method
**Parameters:** (event)
**Purpose:** Handle search input and trigger search
**Features:** `SEARCH-INPUT`, `EVENT-HANDLE`

**Function:** kanbanSearch.performSearch
**File:** src/html/search.js:65
**Type:** object-method
**Parameters:** (query)
**Purpose:** Execute search across task content
**Features:** `SEARCH-EXECUTE`, `DOM-SEARCH`

**Function:** kanbanSearch.highlightResults
**File:** src/html/search.js:95
**Type:** object-method
**Parameters:** (results)
**Purpose:** Highlight search results in tasks
**Features:** `SEARCH-HIGHLIGHT`, `DOM-MODIFY`

**Function:** kanbanSearch.nextResult
**File:** src/html/search.js:125
**Type:** object-method
**Parameters:** ()
**Purpose:** Navigate to next search result
**Features:** `SEARCH-NAV`, `UI-SCROLL`

**Function:** kanbanSearch.previousResult
**File:** src/html/search.js:145
**Type:** object-method
**Parameters:** ()
**Purpose:** Navigate to previous search result
**Features:** `SEARCH-NAV`, `UI-SCROLL`

### Additional TypeScript Files

**Function:** generateId
**File:** src/utils/idGenerator.ts:5
**Type:** function-declaration
**Parameters:** ()
**Purpose:** Generate unique identifier for tasks and elements
**Features:** `VALID-ID`

**Function:** UndoRedoManager.constructor
**File:** src/undoRedoManager.ts:15
**Type:** class-method
**Parameters:** ()
**Purpose:** Initialize undo/redo state management
**Features:** `STATE-HISTORY`

**Function:** UndoRedoManager.pushState
**File:** src/undoRedoManager.ts:25
**Type:** class-method
**Parameters:** (state)
**Purpose:** Add new state to undo stack
**Features:** `STATE-SAVE`

**Function:** UndoRedoManager.undo
**File:** src/undoRedoManager.ts:45
**Type:** class-method
**Parameters:** ()
**Purpose:** Restore previous state
**Features:** `STATE-RESTORE`

**Function:** UndoRedoManager.redo
**File:** src/undoRedoManager.ts:65
**Type:** class-method
**Parameters:** ()
**Purpose:** Restore next state
**Features:** `STATE-FORWARD`

## HTML Embedded Functions

### webview.html Event Handlers

**Function:** handleEmptyCardDragStart
**File:** src/html/webview.html:45
**Type:** event-handler
**Parameters:** (event)
**Purpose:** Handle drag start for empty card creation
**Features:** `DRAG-EMPTY`

**Function:** handleEmptyCardDragEnd
**File:** src/html/webview.html:45
**Type:** event-handler
**Parameters:** (event)
**Purpose:** Handle drag end for empty card creation
**Features:** `DRAG-EMPTY`

**Function:** handleClipboardMouseDown
**File:** src/html/webview.html:49
**Type:** event-handler
**Parameters:** (event)
**Purpose:** Handle mouse down on clipboard card source
**Features:** `EVENT-CLIPBOARD`

**Function:** handleClipboardDragStart
**File:** src/html/webview.html:49
**Type:** event-handler
**Parameters:** (event)
**Purpose:** Handle drag start for clipboard card creation
**Features:** `DRAG-CLIPBOARD`

**Function:** handleClipboardDragEnd
**File:** src/html/webview.html:49
**Type:** event-handler
**Parameters:** (event)
**Purpose:** Handle drag end for clipboard card creation
**Features:** `DRAG-CLIPBOARD`

**Function:** showClipboardPreview
**File:** src/html/webview.html:49
**Type:** event-handler
**Parameters:** ()
**Purpose:** Show clipboard content preview
**Features:** `UI-PREVIEW`

**Function:** hideClipboardPreview
**File:** src/html/webview.html:49
**Type:** event-handler
**Parameters:** ()
**Purpose:** Hide clipboard content preview
**Features:** `UI-PREVIEW`

## CSS Patterns and Classes

### State-based CSS Classes (webview.css)

**Pattern:** State Toggle Classes
**Examples:** `.refresh-btn.pending`, `.refresh-btn.saved`, `.layout-presets-btn.active`
**Purpose:** Visual state indication for UI elements
**Features:** `UI-STATE`

**Pattern:** Dropdown Show/Hide Classes
**Examples:** `.layout-presets-dropdown.show`, `.clipboard-preview.show`
**Purpose:** Control visibility of dropdown and popup elements
**Features:** `UI-DROPDOWN`

**Pattern:** Drag State Classes
**Examples:** `.empty-card-source.dragging`, `.clipboard-card-source.dragging`, `.task-item.dragging`
**Purpose:** Visual feedback during drag operations
**Features:** `DRAG-VISUAL`

**Pattern:** Collapse State Classes
**Examples:** `.kanban-full-height-column.collapsed`, `.collapse-toggle.rotated`, `.task-collapse-toggle.rotated`
**Purpose:** Collapsible UI elements state management
**Features:** `UI-COLLAPSE`

## Duplicate Pattern Analysis

### Category 1: Configuration Functions (HIGH DUPLICATION)
- `getVSCodeConfig` (webview.js:115)
- Multiple `updateXXXMenu` functions (menuOperations.js:35-235)
- Multiple `applyXXXCSS` functions (webview.js:125-185)

**Refactor Opportunity:** Create generic `getConfig(key)` and `applyStyleConfig(property, value)` utilities

### Category 2: Color Processing (MEDIUM DUPLICATION)
- `hexToRgb` (webview.js:195)
- `rgbToHex` (webview.js:205)
- `isValidHexColor` (webview.js:215)

**Refactor Opportunity:** Consolidate into `ColorUtils` module

### Category 3: Drag State Management (HIGH DUPLICATION)
- `handleDragStart` (dragDrop.js:15)
- `handleEmptyCardDragStart` (webview.html:45)
- `handleClipboardDragStart` (webview.html:49)
- `updateDragState` (dragDrop.js:95)

**Refactor Opportunity:** Create generic `DragStateManager` class

### Category 4: Menu System Functions (HIGH DUPLICATION)
- Multiple `updateXXXMenu` functions showing identical patterns
- All follow same structure: get config → update indicators → apply styles

**Refactor Opportunity:** Create `MenuUpdateManager` with generic update method

### Category 5: Event Handler Patterns (MEDIUM DUPLICATION)
- Similar event setup patterns in multiple initialization functions
- Repeated event binding logic across different modules

**Refactor Opportunity:** Create `EventBindingUtils` for common patterns

## Summary Statistics

- **Total Functions Analyzed:** 68+
- **TypeScript Functions:** 35+
- **JavaScript Functions:** 25+
- **HTML Event Handlers:** 8+
- **CSS Patterns:** 15+
- **Refactor Opportunities Identified:** 12 major categories
- **Potential Code Reduction:** 40-50 functions could be consolidated into 8-10 utilities

## Recommended Refactoring Priorities

1. **Configuration Management** - Highest impact, most duplicated
2. **Menu System** - Medium-high impact, clear patterns
3. **Drag and Drop** - Medium impact, complex interactions
4. **Color Processing** - Low impact, simple consolidation
5. **Event Binding** - Medium impact, improves maintainability

This analysis provides a foundation for identifying code duplication and planning refactoring efforts to improve codebase maintainability.