# Single Points of Knowledge Analysis

## Executive Summary
This document maps all data storage points in the markdown-kanban extension frontend and identifies duplications.

---

## 🔴 CRITICAL DUPLICATIONS (Must Fix)

### 1. Board Data: `window.currentBoard` vs `window.cachedBoard`
**Location**: webview.js, boardRenderer.js, menuOperations.js, taskEditor.js, dragDrop.js, submenuGenerator.js
**Occurrences**: 241 total references
**Problem**: Same board data stored in two places
**Current State**:
- `window.cachedBoard` = Primary source of truth (updated directly by user edits)
- `window.currentBoard` = Compatibility alias that points to cachedBoard
- Line 2083 in webview.js: `window.currentBoard = window.cachedBoard;`
- Line 1238 in boardRenderer.js: Sync check to ensure they match

**Solution**: Eliminate `window.currentBoard` entirely, use only `window.cachedBoard`

**Impact**:
- Reduces memory usage
- Eliminates potential desync bugs
- Requires updating ~120 references (half are assignments that can be removed)

---

## 🟢 VALID STORAGE (Single Point of Knowledge)

### Board State
| Data | Location | Purpose | Type |
|------|----------|---------|------|
| `window.cachedBoard` | webview.js:2082 | Board content (columns, tasks) | Object |
| `window.savedBoardState` | webview.js:2084 | Last saved version for dirty detection | Object (clone) |
| `window.hasUnsavedChanges` | webview.js:2085 | Dirty flag | Boolean |

### UI State (Collapse/Fold)
| Data | Location | Purpose | Type |
|------|----------|---------|------|
| `window.collapsedColumns` | boardRenderer.js:4 | Which columns are collapsed | Set<columnId> |
| `window.collapsedTasks` | boardRenderer.js:5 | Which tasks are collapsed | Set<taskId> |
| `window.columnFoldStates` | boardRenderer.js:6 | Last manual fold state per column | Map<columnId, state> |
| `window.globalColumnFoldState` | boardRenderer.js:7 | Global fold state (mixed/collapsed/expanded) | String |
| `documentFoldingStates` | webview.js:30 | Fold states per document | Map<uri, {collapsedColumns, collapsedTasks, columnFoldStates}> |

**Note**: `documentFoldingStates` stores historical states for multiple documents. Current document state is in the window.* variables above.

### View Configuration
| Data | Location | Purpose | Type |
|------|----------|---------|------|
| `currentColumnWidth` | webview.js:34 | Column width setting | String |
| `currentWhitespace` | webview.js:35 | Spacing setting | String |
| `currentTaskMinHeight` | webview.js:36 | Min task height | String |
| `currentLayoutRows` | webview.js:37 | Number of rows | Number |
| `currentRowHeight` | webview.js:1188 | Row height | String |
| `currentStickyStackMode` | webview.js:1299 | Sticky stack mode | String |
| `currentTagVisibility` | webview.js:1324 | Tag visibility mode | String |
| `currentArrowKeyFocusScroll` | webview.js:1420 | Arrow key scroll behavior | String |

### Document Context
| Data | Location | Purpose | Type |
|------|----------|---------|------|
| `currentFileInfo` | webview.js:5 | Current file metadata | Object |
| `currentDocumentUri` | webview.js:31 | Current document URI | String |
| `window.currentImageMappings` | webview.js:23 | Image path mappings | Object |

### Editor State
| Data | Location | Purpose | Type |
|------|----------|---------|------|
| `window.taskEditor.currentEditor` | taskEditor.js:1360 | Currently editing field | Object |

### Undo/Redo
| Data | Location | Purpose | Type |
|------|----------|---------|------|
| `canUndo` | webview.js:21 | Can undo flag | Boolean |
| `canRedo` | webview.js:22 | Can redo flag | Boolean |

### Clipboard
| Data | Location | Purpose | Type |
|------|----------|---------|------|
| `clipboardCardData` | webview.js:341 | Card in clipboard | Object |
| `lastClipboardCheck` | webview.js:342 | Throttle clipboard checks | Number |

### Focus/Navigation
| Data | Location | Purpose | Type |
|------|----------|---------|------|
| `currentFocusedCard` | webview.js:26 | Currently focused card | Element |
| `allCards` | webview.js:27 | All card elements | Array |

### Performance Caches
| Data | Location | Purpose | Type |
|------|----------|---------|------|
| `scrollPositions` | boardRenderer.js:1 | Scroll positions per column | Map |
| `cachedBoardElement` | boardRenderer.js:14 | Cached board DOM element | Element |
| `cachedEditorBg` | boardRenderer.js:23 | Cached CSS variable | String |
| `renderTimeout` | boardRenderer.js:11 | Debounce render | Number |
| `recalculateStackHeightsTimer` | boardRenderer.js:2283 | Debounce stack recalc | Number |
| `pendingStackElement` | boardRenderer.js:2284 | Pending stack element | Element |

### Configuration
| Data | Location | Purpose | Type |
|------|----------|---------|------|
| `baseOptions` | webview.js:88 | Base markdown-it options | Object |
| `menuConfig` | webview.js:197 | Menu configuration | Object |
| `layoutPresets` | webview.js:251 | Layout presets | Object |
| `fontSizeMultipliers` | webview.js:41 | Font size multipliers | Array |

### Modals/Dialogs
| Data | Location | Purpose | Type |
|------|----------|---------|------|
| `closePromptActive` | webview.js:3299 | Close prompt state | Boolean |

---

## ✅ ALREADY FIXED

### 1. Task Element Attributes
**Before**: `data-column-id` stored on task-item, task-title-display, task-title-edit, task-description-display, task-description-edit
**After**: Only on parent `.kanban-full-height-column`
**Access**: `window.getColumnIdFromElement(element)`

### 2. Task ID Attributes
**Before**: `data-task-id` stored on task-item, task-title-display, task-title-edit, task-description-display, task-description-edit
**After**: Only on parent `.task-item`
**Access**: `window.getTaskIdFromElement(element)`

---

## 📋 ACTION ITEMS

### Priority 1: Eliminate window.currentBoard
1. Search and replace all `window.currentBoard` → `window.cachedBoard`
2. Remove sync logic in boardRenderer.js:1238
3. Remove assignment in webview.js:2083
4. Test all operations

### Priority 2: Documentation
1. Update CLAUDE.md with data storage rules
2. Add JSDoc comments to all storage points
3. Create helper functions for accessing nested data

---

## 🎯 DESIGN PRINCIPLES

### Single Point of Knowledge Rules
1. **Board Data**: Always use `window.cachedBoard`
2. **UI State**: Store in window.* for current document, documentFoldingStates for historical
3. **DOM Queries**: Never cache data that can be derived from DOM traversal
4. **IDs**: Store only on root element, use helper functions to traverse up
5. **Config**: Store only in one place, expose via window.* if needed by multiple files

### Access Patterns
- **Column ID from element**: `window.getColumnIdFromElement(element)`
- **Task ID from element**: `window.getTaskIdFromElement(element)`
- **Board data**: `window.cachedBoard.columns[i].tasks[j]`
- **UI state**: `window.collapsedColumns.has(columnId)`
- **Config**: `currentColumnWidth`, `currentTagVisibility`, etc.
