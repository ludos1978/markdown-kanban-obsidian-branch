# Duplicate Function Analysis

## Summary
Found multiple instances of duplicate or near-duplicate functionality that can be refactored for better maintainability.

---

## Category 1: Duplicate Check Functions (Backend)

### Location: src/kanbanWebviewPanel.ts

**Pattern**: Two functions doing identical checks for task vs column include files

### Functions:
1. `checkTaskIncludeUnsavedChanges(task)` - Lines 2865-2875
2. `checkColumnIncludeUnsavedChanges(column)` - Lines 2880-2890

### Code Comparison:

```typescript
// checkTaskIncludeUnsavedChanges
public async checkTaskIncludeUnsavedChanges(task: KanbanTask): Promise<boolean> {
    if (!task.includeMode || !task.includeFiles || task.includeFiles.length === 0) {
        return false;
    }
    const includeFile = task.includeFiles[0];
    const unifiedIncludeFile = this._findIncludeFile(includeFile);
    return unifiedIncludeFile?.hasUnsavedChanges === true;
}

// checkColumnIncludeUnsavedChanges
public async checkColumnIncludeUnsavedChanges(column: KanbanColumn): Promise<boolean> {
    if (!column.includeMode || !column.includeFiles || column.includeFiles.length === 0) {
        return false;
    }
    const includeFile = column.includeFiles[0];
    const unifiedIncludeFile = this._findIncludeFile(includeFile);
    return unifiedIncludeFile?.hasUnsavedChanges === true;
}
```

### Analysis:
- **Duplication**: 99% identical logic
- **Only difference**: Parameter type (task vs column)
- **Lines saved**: ~10 lines

### Refactoring Options:

**Option A: Generic helper with type parameter**
```typescript
private _checkIncludeUnsavedChanges(entity: KanbanTask | KanbanColumn): boolean {
    if (!entity.includeMode || !entity.includeFiles || entity.includeFiles.length === 0) {
        return false;
    }
    const includeFile = entity.includeFiles[0];
    const unifiedIncludeFile = this._findIncludeFile(includeFile);
    return unifiedIncludeFile?.hasUnsavedChanges === true;
}

public async checkTaskIncludeUnsavedChanges(task: KanbanTask): Promise<boolean> {
    return this._checkIncludeUnsavedChanges(task);
}

public async checkColumnIncludeUnsavedChanges(column: KanbanColumn): Promise<boolean> {
    return this._checkIncludeUnsavedChanges(column);
}
```

**Option B: Direct path-based check**
```typescript
public async checkIncludeUnsavedChanges(relativePath: string): Promise<boolean> {
    const unifiedIncludeFile = this._findIncludeFile(relativePath);
    return unifiedIncludeFile?.hasUnsavedChanges === true;
}

public async checkTaskIncludeUnsavedChanges(task: KanbanTask): Promise<boolean> {
    if (!task.includeMode || !task.includeFiles || task.includeFiles.length === 0) {
        return false;
    }
    return this.checkIncludeUnsavedChanges(task.includeFiles[0]);
}

public async checkColumnIncludeUnsavedChanges(column: KanbanColumn): Promise<boolean> {
    if (!column.includeMode || !column.includeFiles || column.includeFiles.length === 0) {
        return false;
    }
    return this.checkIncludeUnsavedChanges(column.includeFiles[0]);
}
```

### Recommendation: **Option B** - More explicit and flexible

---

## Category 2: Duplicate SaveAll Functions (Backend)

### Location: src/kanbanWebviewPanel.ts

**Pattern**: Two functions doing nearly identical save operations with recently-reloaded file filtering

### Functions:
1. `saveAllColumnIncludeChanges()` - Lines 3233-3262
2. `saveAllTaskIncludeChanges()` - Lines 3267-3303

### Code Comparison:

```typescript
// saveAllColumnIncludeChanges
public async saveAllColumnIncludeChanges(): Promise<void> {
    if (!this._board) return;

    const includeColumns = this._board.columns.filter(col => col.includeMode);

    const columnsToSave = includeColumns.filter(col => {
        if (!col.includeFiles || col.includeFiles.length === 0) return true;
        return !col.includeFiles.some(file => {
            return Array.from(this._recentlyReloadedFiles).some(reloadedPath =>
                this._isSameIncludePath(file, reloadedPath)
            );
        });
    });

    const savePromises = columnsToSave.map(col => this.saveColumnIncludeChanges(col));

    try {
        await Promise.all(savePromises);
    } catch (error) {
        console.error('[Column Include] Error saving column include changes:', error);
    }
}

// saveAllTaskIncludeChanges
public async saveAllTaskIncludeChanges(): Promise<void> {
    if (!this._board) return;

    const includeTasks: KanbanTask[] = [];
    for (const column of this._board.columns) {
        for (const task of column.tasks) {
            if (task.includeMode) {
                const shouldSkip = task.includeFiles?.some(file => {
                    return Array.from(this._recentlyReloadedFiles).some(reloadedPath =>
                        this._isSameIncludePath(file, reloadedPath)
                    );
                });
                if (!shouldSkip) {
                    includeTasks.push(task);
                }
            }
        }
    }

    if (includeTasks.length === 0) return;

    const savePromises = includeTasks.map(task => this.saveTaskIncludeChanges(task));

    try {
        await Promise.all(savePromises);
    } catch (error) {
        console.error('[Task Include] Error saving task include changes:', error);
    }
}
```

### Analysis:
- **Duplication**: ~70% identical logic
- **Differences**:
  - Column extraction vs nested loop for tasks
  - Different save function called
  - Different error message
- **Lines saved**: ~25 lines

### Refactoring Options:

**Option A: Generic helper with callbacks**
```typescript
private async _saveAllIncludeChanges<T extends KanbanTask | KanbanColumn>(
    entities: T[],
    saveFunction: (entity: T) => Promise<boolean>,
    errorContext: string
): Promise<void> {
    const entitiesToSave = entities.filter(entity => {
        if (!entity.includeMode || !entity.includeFiles || entity.includeFiles.length === 0) {
            return false;
        }
        return !entity.includeFiles.some(file => {
            return Array.from(this._recentlyReloadedFiles).some(reloadedPath =>
                this._isSameIncludePath(file, reloadedPath)
            );
        });
    });

    if (entitiesToSave.length === 0) return;

    const savePromises = entitiesToSave.map(entity => saveFunction(entity));

    try {
        await Promise.all(savePromises);
    } catch (error) {
        console.error(`[${errorContext}] Error saving include changes:`, error);
    }
}

public async saveAllColumnIncludeChanges(): Promise<void> {
    if (!this._board) return;
    const includeColumns = this._board.columns.filter(col => col.includeMode);
    await this._saveAllIncludeChanges(
        includeColumns,
        col => this.saveColumnIncludeChanges(col),
        'Column Include'
    );
}

public async saveAllTaskIncludeChanges(): Promise<void> {
    if (!this._board) return;
    const includeTasks: KanbanTask[] = [];
    for (const column of this._board.columns) {
        for (const task of column.tasks) {
            if (task.includeMode) {
                includeTasks.push(task);
            }
        }
    }
    await this._saveAllIncludeChanges(
        includeTasks,
        task => this.saveTaskIncludeChanges(task),
        'Task Include'
    );
}
```

**Option B: Keep separate** (complexity not worth the abstraction)

### Recommendation: **Option A** - The recently-reloaded filtering logic is identical and error-prone

---

## Category 3: Apply/Set Function Pairs (Frontend)

### Location: src/html/webview.js

**Pattern**: Multiple pairs of `apply*` and `set*` functions where `set*` is just a wrapper that:
1. Calls `apply*`
2. Sends postMessage to backend
3. Updates menu indicators
4. Closes menus

### Function Pairs:

1. **Column Width** (Lines 1096-1135)
   - `applyColumnWidth(size, skipRender)`
   - `setColumnWidth(size)`

2. **Layout Rows** (Lines 1148-1179)
   - `applyLayoutRows(rows)`
   - `setLayoutRows(rows)`

3. **Row Height** (Lines 1183-1299)
   - `applyRowHeight(height)`
   - `setRowHeight(height)`

4. **Whitespace** (Lines 1448-1480)
   - `applyWhitespace(spacing)`
   - `setWhitespace(spacing)`

5. **Task Min Height** (Lines 1483-1510)
   - `applyTaskMinHeight(height)`
   - `setTaskMinHeight(height)`

6. **Section Max Height** (Lines 1513-1540)
   - `applySectionMaxHeight(height)`
   - `setSectionMaxHeight(height)`

7. **Sticky Stack Mode** (Lines 1305-1333)
   - `applyStickyStackMode(mode)`
   - `setStickyStackMode(mode)`

8. **Tag Visibility** (Lines 1372-1415)
   - `applyTagVisibility(setting)`
   - `setTagVisibility(setting)`

### Code Pattern Example:

```javascript
function applyColumnWidth(size, skipRender = false) {
    currentColumnWidth = size;
    window.currentColumnWidth = size;
    styleManager.applyColumnWidth(size);
    // ... specific logic
}

function setColumnWidth(size) {
    applyColumnWidth(size);
    configManager.setPreference('columnWidth', size);
    updateAllMenuIndicators();
    document.querySelectorAll('.file-bar-menu').forEach(m => {
        m.classList.remove('active');
    });
    vscode.postMessage({ type: 'showMessage', text: `Column width set to ${size}` });
}
```

### Analysis:
- **Duplication**: 8 pairs with nearly identical wrapper pattern
- **Lines of duplicate code**: ~80 lines (8 pairs × ~10 lines each)
- **Only differences**:
  - Config key name
  - Apply function called
  - Success message text

### Refactoring Options:

**Option A: Generic setter wrapper**
```javascript
function applyAndSaveSetting(configKey, value, applyFunction, successMessage) {
    // Apply the setting
    applyFunction(value);

    // Store preference
    configManager.setPreference(configKey, value);

    // Update menu indicators
    updateAllMenuIndicators();

    // Close menus
    document.querySelectorAll('.file-bar-menu').forEach(m => {
        m.classList.remove('active');
    });

    // Show success message if provided
    if (successMessage) {
        vscode.postMessage({ type: 'showMessage', text: successMessage });
    }
}

// Then replace all set* functions:
function setColumnWidth(size) {
    applyAndSaveSetting(
        'columnWidth',
        size,
        applyColumnWidth,
        `Column width set to ${size}`
    );
}

function setWhitespace(spacing) {
    applyAndSaveSetting(
        'whitespace',
        spacing,
        applyWhitespace,
        null // No message needed
    );
}
// ... etc
```

**Option B: Class-based settings manager**
```javascript
class SettingsManager {
    applySetting(configKey, value, applyFn, options = {}) {
        applyFn(value);

        if (options.savePreference !== false) {
            configManager.setPreference(configKey, value);
        }

        if (options.updateMenus !== false) {
            updateAllMenuIndicators();
        }

        if (options.closeMenus !== false) {
            document.querySelectorAll('.file-bar-menu').forEach(m => {
                m.classList.remove('active');
            });
        }

        if (options.message) {
            vscode.postMessage({ type: 'showMessage', text: options.message });
        }
    }
}

const settingsManager = new SettingsManager();

function setColumnWidth(size) {
    settingsManager.applySetting('columnWidth', size, applyColumnWidth, {
        message: `Column width set to ${size}`
    });
}
```

**Option C: Keep as-is** (clarity over DRY)

### Recommendation: **Option A** - Simple and saves ~60 lines without over-engineering

---

## Summary of Potential Savings

| Category | Functions | Lines Saved | Complexity |
|----------|-----------|-------------|------------|
| Check Include Unsaved | 2 | ~10 | Low |
| SaveAll Include | 2 | ~25 | Medium |
| Apply/Set Pairs | 8 pairs (16 funcs) | ~60 | Low |
| **TOTAL** | **20 functions** | **~95 lines** | |

---

## Recommendations Priority

1. **HIGH**: Apply/Set function pairs (Category 3)
   - Most duplication (8 instances)
   - Low complexity refactor
   - Clear pattern
   - Saves 60+ lines

2. **MEDIUM**: Check include unsaved functions (Category 1)
   - Simple refactor
   - Clear duplication
   - Saves 10 lines

3. **LOW**: SaveAll functions (Category 2)
   - More complex
   - Saves 25 lines
   - But adds abstraction complexity
   - Consider if worth it

---

## Next Steps

Should I proceed with refactoring? Which categories should I prioritize?
