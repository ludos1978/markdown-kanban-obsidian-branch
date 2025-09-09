# Kanban Board Extension - Developer Documentation

## Program Architecture Overview

### Core System Design

The Kanban Board Extension transforms markdown files into interactive Kanban boards within VS Code. The system operates on a **cache-first architecture** with session-scoped runtime UUID identification.

### Key Components & Data Flow

#### 1. **Cache System (Frontend)**
- **`window.cachedBoard`**: Single source of truth for all UI operations
- **`window.savedBoardState`**: Reference copy for unsaved change detection
- **`window.hasUnsavedChanges`**: Boolean flag for save state tracking
- All user interactions update the cache immediately for responsive UI

#### 2. **UUID System (Runtime-Only)**
- **Column IDs**: `col-{uuid}` format, generated fresh each session
- **Task IDs**: `task-{uuid}` format, session-scoped unique identification
- **No persistence**: UUIDs never stored in markdown files
- **Automatic generation**: New IDs created on board load and content creation

#### 3. **Save Architecture**
```
User Action → Update Cache → Mark Unsaved → Manual Save (Cmd+S) → Update Markdown → Sync Backend
```

#### 4. **Menu System**
- **Donut Menus**: Burger-style menus for columns and tasks
- **Smart Positioning**: Dropdowns repositioned to body for viewport constraints
- **Proper Cleanup**: `closeAllMenus()` handles all menu types and moved elements

#### 5. **Drag & Drop System**
- **File Info Sources**: Empty cards and clipboard cards from header
- **Cache Integration**: Updates `window.cachedBoard` before backend sync
- **Position Detection**: Calculates insertion index from drop coordinates
- **Immediate Feedback**: DOM updates instantly, markdown saved separately

### User Interaction Flow

#### Normal Operation:
1. **Load**: Markdown parsed → Board generated with runtime UUIDs → Cache initialized
2. **Edit**: User interaction → Cache updated → UI reflects change → Unsaved indicator shown
3. **Save**: Cmd+S pressed → Cache compared to saved state → Changes sent to backend → Markdown written
4. **Close**: Panel disposal checks unsaved changes → Modal dialog if needed → Save options provided

#### Conflict Resolution:
1. **Detection**: Underlying markdown changed while unsaved changes exist
2. **Warning**: Modal shows with save options including conflict backup
3. **Backup**: Saves to `{filename}-conflict-{timestamp}.md` if requested
4. **User Choice**: Save normally, save with backup, or discard changes

### Technical Implementation Details

#### Cache-First Benefits:
- **Instant UI Response**: No waiting for backend operations
- **Conflict Detection**: Compare cache vs saved state for changes
- **Batch Operations**: Multiple changes accumulated before save
- **Undo/Redo Support**: Operations on cache enable full history

#### UUID System Benefits:
- **No Markdown Pollution**: Clean markdown files without technical IDs
- **Reliable References**: Consistent identification during session
- **Move Operations**: Drag/drop works reliably with stable IDs
- **Menu Targeting**: Precise element identification for operations

#### Save System Features:
- **Manual Control**: User explicitly saves with Cmd+S
- **Unsaved Tracking**: Visual indicators for pending changes
- **Error Handling**: Retry mechanism for failed saves
- **Conflict Resolution**: Backup options for data safety

### Error Handling & Data Safety

- **Disposal Protection**: Panel closing checks for unsaved changes
- **Backup System**: Conflict filenames with timestamps
- **Cache Validation**: Integrity checks prevent data corruption
- **Menu Cleanup**: Proper DOM cleanup prevents UI artifacts
- **Drag Validation**: Drop target validation prevents data loss

This architecture ensures reliable, performant Kanban board operations while maintaining clean markdown files and providing robust data safety mechanisms.

## Comprehensive Test Suite

### Available Test Suites
The codebase now includes comprehensive test coverage for all major functionality:

#### 1. Column Operations Tests (`src/test/suite/columnOperations.test.js`)
- **Column Creation**: Tests for generating column HTML elements with various configurations
- **Column Editing**: Tests for inline title editing and tag modification
- **Column Folding**: Tests for collapse/expand functionality and global fold states  
- **Column Movement**: Tests for left/right movement and position validation
- **Column Menu Operations**: Tests for menu generation, insertion, and clipboard operations
- **Column Validation**: Tests for data structure validation and error handling

#### 2. Task/Card Operations Tests (`src/test/suite/taskOperations.test.js`)
- **Task Creation**: Tests for task HTML generation, tag handling, empty descriptions
- **Task Editing**: Tests for title/description editing, Tab transitions, auto-save
- **Task Movement**: Tests for all movement operations (up, down, top, bottom, between columns)
- **Task Deletion**: Tests for safe task removal
- **Task Folding**: Tests for task collapse/expand and batch operations
- **Task Menu Operations**: Tests for menu generation and clipboard functionality
- **Task Drag & Drop**: Tests for drag start, drop index calculations, position restoration
- **Task Validation**: Tests for data structure validation, XSS prevention, content sanitization
- **Task Search/Filtering**: Tests for tag extraction, filtering, and search functionality

#### 3. Tag Operations Tests (`src/test/suite/tagOperations.test.js`)
- **Tag Extraction/Parsing**: Tests for tag detection, row tag exclusion, gather tag handling
- **Tag Toggle Operations**: Tests for adding/removing tags on columns and tasks
- **Tag Menu Generation**: Tests for dynamic menu creation with active state indicators
- **Tag Styling/CSS Generation**: Tests for dynamic CSS creation, theme switching, color interpolation
- **Tag Collection/Inventory**: Tests for tag discovery, custom tag detection, categorization
- **Tag Validation/Sanitization**: Tests for XSS prevention, malformed syntax handling
- **Tag Removal Operations**: Tests for bulk tag removal while preserving row tags
- **Tag State Management**: Tests for pending changes tracking, UI state updates
- **Tag Visual Updates**: Tests for immediate DOM updates and real-time feedback
- **Tag Configuration**: Tests for config retrieval, fallback handling, default styling

#### 4. Save Operations and State Management Tests (`src/test/suite/saveOperations.test.js`)
- **Pending Changes Management**: Tests for change accumulation and tracking
- **Flush Operations**: Tests for batch saving, change clearing, retry mechanisms
- **Apply Pending Changes Locally**: Tests for local board updates without backend saves
- **Refresh Button State Management**: Tests for visual feedback, auto-reset, error states
- **Manual Refresh Operations**: Tests for user-initiated saves and backend communication
- **Error Handling**: Tests for save failures, UI error states, retry functionality
- **Document State Persistence**: Tests for folding state saves, restoration, URI handling
- **Board State Validation**: Tests for data integrity, corruption handling, editing detection
- **Data Integrity**: Tests for consistency maintenance, task ordering, concurrent modifications
- **Performance/Memory Management**: Tests for cleanup, memory usage, large datasets
- **No Auto-Save on Drag**: Tests confirming drag operations don't save to original file

#### 5. UI Interactions Tests (`src/test/suite/uiInteractions.test.js`)
- **Menu System**: Tests for menu visibility, click outside, safe function execution, XSS prevention
- **Task Editor**: Tests for edit mode activation, keyboard shortcuts, Tab transitions, auto-resize
- **Drag and Drop**: Tests for drag start/end, drop calculations, external file drops, clipboard cards
- **Drag with Pending Changes**: Tests for local application without backend saves
- **Board Update Reapplication**: Tests for preserving pending changes after VS Code updates
- **Keyboard Navigation**: Tests for global shortcuts, focus management, accessibility
- **Responsive Interactions**: Tests for viewport resize, touch interactions
- **Accessibility**: Tests for focus handling, ARIA attributes, screen reader compatibility
- **Error Handling**: Tests for missing DOM elements, malformed events, drag operation recovery
- **Performance Considerations**: Tests for update throttling, event listener cleanup
- **Cross-browser Compatibility**: Tests for different event implementations, feature fallbacks

### Test Configuration

#### Jest Configuration (`jest.config.js`)
- **Environment**: jsdom for DOM simulation
- **Coverage**: 70% branch, 80% function/line/statement thresholds
- **Setup**: Global mocks for VS Code API, DOM APIs, clipboard, drag/drop
- **Timeout**: 10 second test timeout for complex operations

#### Test Setup Files
- **`src/test/setup.js`**: Global mocks and utilities for all tests
- **`src/test/globalSetup.js`**: One-time test environment initialization
- **`src/test/globalTeardown.js`**: Cleanup after all tests complete
- **`src/test/suite/index.js`**: Mocha-based test runner for VS Code extension testing

### Running Tests

```bash
# Run all tests with Jest
npm test

# Run tests with coverage
npm run test:coverage

# Run VS Code extension tests
npm run pretest && npm run test

# Run specific test suite
npm test -- columnOperations.test.js

# Debug tests
npm test -- --verbose
```

## Comprehensive Function Documentation

All major JavaScript files now include comprehensive JSDoc-style documentation:

### 1. Board Renderer (`src/html/boardRenderer.js`)
**27+ documented functions** including:
- `renderBoard()`: Main board rendering engine that converts data to interactive HTML
- `createColumnElement()` / `createTaskElement()`: HTML generation for columns and tasks
- `extractFirstTag()`: Extracts primary tag for styling (skips row/gather tags)
- `generateTagStyles()`: Creates dynamic CSS for all tag-based theming
- `toggleColumnCollapse()` / `toggleTaskCollapse()`: Folding state management
- `calculateAndApplyRowHeights()`: Multi-row layout height calculations
- `applyTagStyles()`: Injects dynamic CSS into document head
- `getAllTagsInUse()` / `getUserAddedTags()`: Tag inventory and discovery

### 2. Menu Operations (`src/html/menuOperations.js`) 
**25+ documented functions** including:
- `SimpleMenuManager` class: Centralized menu interaction system with hover delays
- `toggleDonutMenu()`: Burger menu activation with dropdown positioning
- `toggleColumnTag()` / `toggleTaskTag()`: Tag addition/removal with pending state
- `flushPendingTagChanges()`: Batch save operations (now manual-save only)
- `applyPendingChangesLocally()`: Updates local board state without saving to backend
- `updateRefreshButtonState()`: Visual feedback for pending/saved/error states
- `handleSaveError()`: Error handling with retry capability
- `closeAllMenus()`: Complete cleanup including repositioned dropdowns
- `setupMenuHoverHandlers()`: Smooth menu navigation with delay tolerance

### 3. Task Editor (`src/html/taskEditor.js`)
**9 documented functions** including:
- `TaskEditor` class: Comprehensive inline editing system
- `startEdit()`: Edit mode activation with focus management
- `transitionToDescription()`: Smooth Tab navigation between title/description
- `save()` / `cancel()`: Edit completion with pending changes integration
- `autoResize()`: Dynamic textarea height adjustment
- `editTitle()` / `editDescription()` / `editColumnTitle()`: Public editing APIs

### 4. Webview Controller (`src/html/webview.js`)
**15+ documented functions** including:
- Clipboard card functionality for drag-to-create workflows
- Document folding state persistence across file switches
- Layout and column width controls with CSS variable management
- Undo/redo operations with VS Code integration
- File information management and display
- Row detection from column tags and automatic layout

### 5. Drag & Drop System (`src/html/dragDrop.js`)
**25+ documented functions** including:
- `setupDragAndDrop()`: Main initialization for all drag/drop functionality
- `setupTaskDragAndDrop()` / `setupColumnDragAndDrop()`: Component-specific setup
- External file drop handling with position indicators
- Clipboard card drops with content formatting
- Drop indicator management with smart positioning
- Position calculation utilities for precise insertions
- **No auto-save during drag**: Applies pending changes locally without saving to file
- **Preserves unsaved state**: Maintains pending changes through drag operations

### Documentation Features

Each function includes:
- **Purpose**: Clear description of what the function does
- **Used by**: Which components/events call this function  
- **Parameters**: Input parameters with types and descriptions
- **Returns**: Return values and types where applicable
- **Side effects**: DOM changes, state updates, API calls
- **Notes**: Special considerations, limitations, performance notes

## Architecture Overview

### Component Structure
- **boardRenderer.js**: Core rendering engine and HTML generation
- **menuOperations.js**: User interactions, menus, and tag operations
- **taskEditor.js**: Inline editing functionality
- **dragDrop.js**: Drag and drop interactions
- **webview.js**: Main controller and VS Code integration

### Data Flow
1. **User Action** → Menu/Editor/Drag system
2. **State Update** → Pending changes accumulation  
3. **Visual Feedback** → Immediate DOM updates
4. **Batch Save** → Manual flush to VS Code API
5. **Re-render** → Board refresh with preserved state

### State Management
- **Pending Changes**: `window.pendingColumnChanges` / `window.pendingTaskChanges` Maps
- **Folding State**: `window.collapsedColumns` / `window.collapsedTasks` Sets
- **Document State**: Persistent across file switches via VS Code state API
- **Drag State**: `window.dragState` object for drag/drop coordination

### Security Features
- **XSS Prevention**: Safe function execution without eval
- **Content Sanitization**: HTML escaping for user-generated content
- **Input Validation**: Tag name validation and malformed syntax handling

## Development Guidelines

### Testing
- All new features must include comprehensive tests
- Tests should cover happy path, edge cases, and error conditions
- Mock VS Code API interactions appropriately
- Maintain coverage thresholds (80% functions/lines, 70% branches)

### Documentation
- All functions must include JSDoc-style comments
- Document purpose, usage, parameters, returns, and side effects
- Update AGENT.md when adding new features or architectural changes
- Include examples for complex functionality

### Code Quality  
- Follow existing patterns for consistency
- Use TypeScript-style JSDoc for better IDE support
- Implement proper error handling and graceful degradation
- Optimize for performance with debouncing and efficient DOM updates

## Recent Changes

### Drag & Drop Save Behavior Fix (2025-09-07)
**Problem**: When dragging cards/columns with pending changes, the system was auto-saving to the original file.

**Solution**: 
- Created `applyPendingChangesLocally()` function that updates local board state without backend saves
- Modified drag operations to use local application instead of flushing to VS Code
- Added automatic reapplication of pending changes after board updates from VS Code
- **CRITICAL FIX**: Modified `applyPendingChangesLocally()` to search ALL columns for tasks, not just the stored columnId
- Result: Drag operations no longer auto-save; pending changes are preserved even after task moves

**Root Cause of Task Tag Loss**:
- When a task with pending changes (like new tags) was dragged to another column
- `applyPendingChangesLocally()` looked for the task in the OLD column (stored in `pendingTaskChanges`)
- But the task was now in the NEW column, so pending changes were never applied
- **Fix**: Search for tasks by ID across ALL columns, regardless of stored columnId

**Files Modified**:
- `src/html/menuOperations.js`: Added `applyPendingChangesLocally()` function with global task search
- `src/html/dragDrop.js`: Replaced flush operations with local application
- `src/html/webview.js`: Added reapplication after board updates
- Tests updated to verify no auto-save behavior and cross-column task finding

## Runtime-Only UUID ID System

### Overview
The kanban board extension now implements a **runtime-only UUID-based identification system** for columns and tasks. This system provides unique identification during editing sessions without polluting the markdown files with persistent ID storage.

### How It Works

#### 1. UUID Generation on Load
Every time a markdown file is opened as a kanban board:
- **Fresh UUIDs Generated**: Each column and task receives a new UUID
- **Format**: 
  - Columns: `col-a1b2c3d4-e5f6-4789-a012-b3c4d5e6f789`
  - Tasks: `task-f1e2d3c4-b5a6-4987-e210-f3a4b5c6d7e8`
- **RFC4122 UUID v4**: Ensures maximum uniqueness across all sessions

#### 2. Runtime-Only Storage
- **Session Scoped**: UUIDs exist only while the kanban board is active
- **No Markdown Pollution**: Zero traces in saved markdown files
- **Clean Files**: Markdown remains pure and readable
- **Fresh Start**: Each board opening generates completely new IDs

#### 3. Precise Identification During Operations
- **Tag Operations**: Adding/removing tags targets exact cards by UUID
- **Drag & Drop**: Move operations use UUIDs for precise source/target identification
- **Menu Actions**: All menu operations reference specific items by UUID
- **Cache System**: Frontend cache uses UUIDs for reliable state management

### Implementation Components

#### IdGenerator (`src/utils/idGenerator.ts`)
```typescript
class IdGenerator {
  static generateColumnId(): string    // → "col-{uuid}"
  static generateTaskId(): string      // → "task-{uuid}"
  static isValidColumnId(id): boolean  // Validation
  static isValidTaskId(id): boolean    // Validation
  static getShortId(id): string        // Debug helper
}
```

#### Markdown Parser (`src/markdownParser.ts`)
```typescript
// Column parsing - fresh UUID every load
currentColumn = {
  id: IdGenerator.generateColumnId(),  // Runtime-only
  title: columnTitle,
  tasks: []
};

// Task parsing - fresh UUID every load  
currentTask = {
  id: IdGenerator.generateTaskId(),    // Runtime-only
  title: taskTitle,
  description: ''
};
```

#### Board Operations (`src/boardOperations.ts`)
```typescript
// New content creation uses same UUID system
private generateId(type: 'column' | 'task'): string {
  if (type === 'column') {
    return IdGenerator.generateColumnId();
  } else {
    return IdGenerator.generateTaskId();
  }
}
```

### Workflow Example

1. **User opens `project.md`**:
   ```markdown
   ## TODO
   - [ ] Fix bug #high
   - [ ] Add feature
   
   ## DONE  
   - [ ] Review code
   ```

2. **Parser generates runtime UUIDs**:
   ```javascript
   board = {
     columns: [
       { id: "col-abc123...", title: "TODO", tasks: [...] },
       { id: "col-def456...", title: "DONE", tasks: [...] }
     ]
   }
   ```

3. **User adds tag to "Fix bug" card**:
   - System uses `task-xyz789...` to identify exact card
   - No confusion with other cards containing "Fix bug"
   - Tag applied to correct card every time

4. **User saves with Cmd+S**:
   ```markdown
   ## TODO
   - [ ] Fix bug #high #urgent
   - [ ] Add feature
   
   ## DONE
   - [ ] Review code
   ```
   *Note: Only user changes saved, no UUIDs in markdown*

5. **User closes and reopens file**:
   - Fresh UUIDs generated: `col-ghi999...`, `task-mno888...`
   - Clean session with new unique identifiers
   - Previous session's UUIDs are gone

### Benefits

#### ✅ Eliminates Original Problem
- **Before**: *"changing a tag to a card might change the first tag with the same name"*
- **After**: Each card has guaranteed unique UUID during session
- **Result**: Tag operations target exactly intended cards

#### ✅ Clean Architecture  
- **No Markdown Pollution**: Files stay readable and version-control friendly
- **Session Isolation**: No cross-session ID conflicts
- **Simple Workflow**: Fresh start every time

#### ✅ Robust Identification
- **Content Independent**: IDs don't break when titles change
- **Position Independent**: IDs persist through drag operations
- **Collision Proof**: UUID format eliminates duplicate IDs
- **Frontend/Backend Sync**: Both use identical UUID system

### Technical Details

- **UUID Format**: RFC4122 v4 with cryptographically secure randomness
- **Memory Only**: IDs stored in JavaScript variables during session
- **No Persistence**: Markdown writing completely ignores IDs
- **Cache Reliable**: Consistent identification for cache operations
- **Performance**: UUID generation is fast and lightweight

This system ensures that the original issue ("changing a tag to a card might change the first tag with the same name") can never occur again, while maintaining clean, readable markdown files without any ID-related pollution.

# Markdown Kanban Board Architecture - Cache-First Analysis

## Cache-First Architecture Verification

### Current State (Issues Found)

**Problem**: The architecture is **inconsistent** between cache-first and direct-save patterns.

**Mixed Implementation**:
1. **Undo/Redo**: ✅ Uses cache-first architecture via `_markUnsavedChanges(true)`
2. **Regular Operations**: ❌ Uses direct-save via `_onSaveToMarkdown()` in `performBoardAction()`
3. **Frontend Operations**: ✅ Many operations use cache-first via `window.cachedBoard`

### How It Should Work (Intended Architecture)

#### 1. **Cache-First Board Modifications**

All board modifications should follow this pattern:
```typescript
// 1. Save undo state BEFORE changes
this._undoRedoManager.saveStateForUndo(currentBoard);

// 2. Modify the in-memory board state (cache)
this._board = modifiedBoard;

// 3. Mark as unsaved (enables save indicators, auto-save prompts)
this._markUnsavedChanges(true);

// 4. Update webview with new board state
await this._onBoardUpdate();

// NOTE: Do NOT call this._onSaveToMarkdown() immediately
```

#### 2. **Webview Cache Management**

The webview maintains `window.cachedBoard` for immediate UI updates:
- All UI operations modify `window.cachedBoard` first
- Visual changes are immediate (no server round-trip)
- Save state is tracked via `window.currentBoard !== window.cachedBoard`

#### 3. **Save Triggers**

Only these actions should write to the markdown file:
- **Manual Save**: User presses Cmd+S (calls `saveCachedBoardToFile()`)
- **Auto-save**: When webview becomes hidden with unsaved changes
- **Document close**: When kanban document is closed with unsaved changes
- **Conflict resolution**: When external changes are detected

#### 4. **Backup System**

The system already has backup functionality in `backupManager.ts`:
- Creates `.{filename}-backup-{timestamp}.md` files
- Automatically cleans old backups
- Used during save conflicts

### Missing Feature: Crash Recovery Cache

**Proposed Enhancement**: Add temporary cache files for crash recovery:

```
.{filename}-cache-{dateTime}.md     # Current visual state
.{filename}-undo-{dateTime}.json    # Undo history (if performance allows)
```

**Implementation Strategy**:
1. **Cache File**: Update on significant changes (debounced)
2. **Undo Cache**: Store undo history as JSON (if not too slow)
3. **Recovery**: On startup, check for newer cache files than markdown
4. **Cleanup**: Remove cache files on successful save

### Current Issues to Fix

#### 1. **Inconsistent Save Behavior**
```typescript
// WRONG (current in performBoardAction):
await this._onSaveToMarkdown();

// RIGHT (should be):
this._markUnsavedChanges(true);
```

#### 2. **Undo/Redo is Correct**
The undo/redo system correctly uses cache-first:
```typescript
this._markUnsavedChanges(true);  // ✅ Correct
await this._onBoardUpdate();     // ✅ Updates UI
```

#### 3. **Frontend Operations**
Many frontend operations correctly use `window.cachedBoard` and call `markUnsavedChanges()`.

### Summary

**Cache-First Flow**:
1. **Modifications** → In-memory cache (`this._board`, `window.cachedBoard`)
2. **Undo States** → Memory-based undo stack
3. **Visual Updates** → Immediate UI updates
4. **Save Indicators** → Show unsaved state
5. **Persist to File** → Only on explicit save triggers

**Benefits**:
- Immediate UI responsiveness
- Safe undo/redo operations
- No data loss on crashes (with cache files)
- Clear separation between working state and saved state
- Better performance (no file I/O on every operation)

**Next Steps**:
1. Fix `performBoardAction()` to use `_markUnsavedChanges()` instead of `_onSaveToMarkdown()`
2. Implement crash recovery cache files (optional enhancement)
3. Ensure all operations follow cache-first pattern consistently

## Current Request



## Previous Requests

@TAGS
- everything until a space is part of the @TAG 
- there are @DUEDATE tags @2025-03-27 or @due=2025-03-27
- - there might be other @DATE tags such as done, modified, start and end added in the future.
- - only the first @DATE tag of each type is handled. 
- - a DATE tag must start with @datetype: followed by the date format (european), it might be shortened to @2025-1-17
- there are @PERSON tags @Reto , a card might have multiple of these tags
- - Person tags are those which dont follow the date tag structure (@xxx:dateformat)
- - - dateformat might change in the future or might be extended
- @sticky is a special tag which makes a card stick to it's column and position.

#gather_ TAGS
- gather tags allways exaclty start with #gather_
- the gather is a tag that only works in a column header.
- the gather tag ends with a space and nothing else (include any special characters)
- gather tags gather @TAGS under the column.
- the part following the gather tag is the rules of the tag
- gather tags can have multiple parameters
- - PERSON
- - DUEDATE (a date without specification is a DUEDATE)
- - - A duedate can be handled in different ways. such as:
- - - - dayoffset or day : offset of the day from today (system local time)
- - - - weekdaynum : number of day of week from 1 (monday) to 7 (sunday)
- - - - weekday : mon, tue, wed, ...
- - - - month : jan, feb
- - - - monthnum : 1 .. 12
- - - - others might be added here in the future
- there is a #ungathered tag which is a fallback
- gather tags have functions
- - AND &
- - OR | (if there are multiple gather tags in a column header combine them by OR)
- - LARGERTHEN >
- - SMALLERTHEN <
- - NOT !
- - EQUAL =
- - UNEQUAL !=
- the combination of parameters and functions can be like this
- - #gather_Reto : gathers all @PERSON tags where the name is Reto
- - #gather_Reto|Anita : gathers all @PERSON tags where the name is Reto or Anita
- - #gather_day=0 : all dates which are todays date
- - #gather_0<day&day<3 : tomorrow and the next day, but nothing before or after
- - #gather_weekday=1 | all mondays
- - #gather_reto&weekday=1 | @PERSON is Reto and @DUEDATE is monday
- - #gather_1<day&day<6&weekday!=2 : in 2 days up until in 5 days but not tuesdays
- - if there is anything unclear ask first before implementing it!

the gather sorting mechanism must work like this. The sorting is activated by pressing the sort button:
- all cards are gathered in a list, storing the source column with them.
- all @TAGS are extracted (can be done before, but at least we now need them)
- all columns are gathered in a list
- all columns rules are stored in a ordered list
- all cards are matched against the rules of the columns
- - the card is put into the column with the first exact match where all rules of the column apply. any further rules are ignored
- - if a card cannot be matched against any rules:
- - - it first goes into the #ungathered column if it exists
- - - it stays in it's original column

---

explain your planned changes first without editing the sourcecode. keep the changes as minimal as possible. dont change or add any addtional features. dont add failsaves or backup solutions. keep the changes as minimal as possible.

---

please write the corresponding code. Always write out full functions and where they should be added to. dont change the way the markdown is saved, except for adding the tags for the columns. explicitly mention functions that can be removed or simplified.

---

### General initial request!

think carefully how to solve each of the problems. when thinking about a solution, also think about reasons why it could be prevented to work correctly. and think of aspects influencing the way you solve it. when implementing new functions, evaluate wether there is a similar function that might well be changed. then consider how complex fixing the other usage os the function would be. allways explain your planned changes first. keep the changes as minimal as possible, but DRY programming should allways be considered first. tell me if you see something that might be reused, or if you see something not being used anymore. also cleaning up and removing is equally important if it does not sacrifice existing functionality. for this allways document the changes, so obsolete functions can easily be detected. 

if a task i give is ambigious, ask me before starting to work on it. for example storing or saving might refer to the filesystem or to the cache.

commit each change with a short description what we worked on into git. 