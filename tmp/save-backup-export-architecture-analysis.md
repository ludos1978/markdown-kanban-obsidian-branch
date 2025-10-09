# Save, Backup, and Export Architecture Analysis

## Executive Summary

This codebase has a complex save/backup/export architecture with **significant code duplication** and **multiple conversion pathways**. The main issues are:
- **Duplicate conversion functions** for kanban ↔ presentation formats
- **Multiple file writing locations** with similar logic
- **Inconsistent path processing** across operations
- **Complex interdependencies** between conversion functions

---

## 1. Architecture Overview

### 1.1 Core Components

| Component | File | Purpose | Lines |
|-----------|------|---------|-------|
| **Main Save Logic** | `kanbanWebviewPanel.ts` | Primary document save, include file saves | ~4,000 |
| **Export Service** | `exportService.ts` | Export with assets, format conversion | ~1,500 |
| **Backup Manager** | `backupManager.ts` | Create/manage backups | ~462 |
| **Presentation Parser** | `presentationParser.ts` | Presentation ↔ task conversion | ~134 |
| **Markdown Parser** | `markdownParser.ts` | Kanban ↔ markdown conversion | ~420 |
| **Message Handler** | `messageHandler.ts` | Handle UI messages for save/export | ~2,400+ |

### 1.2 Data Flow Diagram

```
┌─────────────────────────────────────────────────────┐
│                   User Actions                       │
└─────────────────────────────────────────────────────┘
                         │
        ┌────────────────┴────────────────┐
        │                                  │
        ▼                                  ▼
  ┌──────────┐                      ┌──────────┐
  │   SAVE   │                      │  EXPORT  │
  └──────────┘                      └──────────┘
        │                                  │
        ▼                                  ▼
┌─────────────────┐              ┌──────────────────┐
│ saveToMarkdown  │              │  exportUnified   │
│  (webview)      │              │   (export svc)   │
└─────────────────┘              └──────────────────┘
        │                                  │
        ├──────────────┐          ┌───────┴────────┐
        │              │          │                │
        ▼              ▼          ▼                ▼
┌───────────┐  ┌──────────────┐ ┌────────┐  ┌────────────┐
│Save Column│  │Save Task     │ │Process │  │Convert     │
│Includes   │  │Includes      │ │Assets  │  │Format      │
└───────────┘  └──────────────┘ └────────┘  └────────────┘
        │              │          │                │
        ▼              ▼          ▼                ▼
┌─────────────────────────────────────────────────────┐
│           Conversion Functions Layer                 │
│  - tasksToPresentation                              │
│  - slidesToTasks                                    │
│  - generateMarkdown                                 │
│  - convertToPresentationFormat                      │
│  - convertPresentationToKanban                      │
└─────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────┐
│              File Writing Layer                      │
│  - fs.writeFileSync (multiple locations)            │
│  - BackupManager.createBackup                       │
│  - BackupManager.createFileBackup                   │
└─────────────────────────────────────────────────────┘
```

---

## 2. Conversion Functions Inventory

### 2.1 Primary Conversion Functions

#### **A. Kanban → Presentation Conversion**

| Function | Location | Input | Output | Used By |
|----------|----------|-------|--------|---------|
| `tasksToPresentation` | `presentationParser.ts:100` | `KanbanTask[]` | Presentation format string | - saveColumnIncludeChanges<br>- exportService (4 places) |
| `convertToPresentationFormat` | `exportService.ts:1233` | Kanban markdown string | Presentation format string | - exportUnified<br>- processMarkdownContent |

#### **B. Presentation → Kanban Conversion**

| Function | Location | Input | Output | Used By |
|----------|----------|-------|--------|---------|
| `slidesToTasks` | `presentationParser.ts:80` | `PresentationSlide[]` | `KanbanTask[]` | - parseMarkdownToTasks<br>- markdownParser (column includes) |
| `parseMarkdownToTasks` | `presentationParser.ts:130` | Presentation content string | `KanbanTask[]` | - markdownParser column includes |
| `convertPresentationToKanban` | `exportService.ts:1164` | Presentation content + marker | Kanban format string | - processIncludedFiles |

#### **C. Kanban Board ↔ Markdown**

| Function | Location | Input | Output | Used By |
|----------|----------|-------|--------|---------|
| `generateMarkdown` | `markdownParser.ts:358` | `KanbanBoard` | Markdown string | - saveToMarkdown<br>- conflict checking |
| `parseMarkdown` | `markdownParser.ts:38` | Markdown string | `KanbanBoard` | - loadMarkdownFile |

### 2.2 Conversion Logic Comparison

#### **tasksToPresentation vs convertToPresentationFormat**

**Similarities:**
- Both convert kanban tasks to presentation format
- Both use slide separators (`---`)
- Both handle task titles and descriptions

**Differences:**

| Aspect | `tasksToPresentation` | `convertToPresentationFormat` |
|--------|----------------------|------------------------------|
| **Input** | Array of tasks | Full kanban markdown string |
| **Parsing** | Direct task array | Parses markdown first |
| **Column handling** | N/A (task-level) | Handles column titles as slides |
| **YAML** | No | Adds temp YAML if missing |
| **Complexity** | Simple (23 lines) | Complex (92 lines) |
| **Use case** | Include file saves | Full board export |

#### **slidesToTasks vs convertPresentationToKanban**

**Similarities:**
- Both convert presentation to kanban format
- Both parse slides

**Differences:**

| Aspect | `slidesToTasks` | `convertPresentationToKanban` |
|--------|----------------|------------------------------|
| **Input** | `PresentationSlide[]` | String content + include marker |
| **Output** | `KanbanTask[]` objects | Markdown string |
| **Include type handling** | No | Detects column/task/regular includes |
| **Column generation** | No | Yes (for columninclude) |
| **Format** | Object structure | Markdown text |

---

## 3. File Writing Operations

### 3.1 Main Document Save

**Location:** `kanbanWebviewPanel.ts:1626`

```typescript
private async saveToMarkdown(updateVersionTracking: boolean = true)
```

**Process:**
1. Save column includes → `saveAllColumnIncludeChanges()`
2. Save task includes → `saveAllTaskIncludeChanges()`
3. Generate markdown → `MarkdownKanbanParser.generateMarkdown(this._board)`
4. Check for external changes
5. Apply workspace edit
6. Save document
7. Cleanup cache files

**File writes:** Via `vscode.workspace.applyEdit()` + `document.save()`

### 3.2 Column Include Save

**Location:** `kanbanWebviewPanel.ts:2648`

```typescript
public async saveColumnIncludeChanges(column: KanbanColumn)
```

**Process:**
1. Validate column has include mode
2. Resolve file path
3. Check file exists and matches baseline (overlap validation)
4. **Convert tasks → presentation:** `PresentationParser.tasksToPresentation(column.tasks)`
5. Create backup
6. **Write file:** `fs.writeFileSync(absolutePath, presentationContent, 'utf8')`
7. Update unified include file tracking

**File writes:** Direct `fs.writeFileSync()`

### 3.3 Task Include Save

**Location:** `kanbanWebviewPanel.ts:2939`

```typescript
public async saveTaskIncludeChanges(task: KanbanTask)
```

**Process:**
1. Validate task has include mode
2. Resolve file path (create if missing)
3. Build content from displayTitle + description
4. Check if content differs from current file
5. Create backup
6. **Write file:** `fs.writeFileSync(absolutePath, fileContent, 'utf8')`
7. Update unified include file tracking

**File writes:** Direct `fs.writeFileSync()`

### 3.4 Export Operations

**Location:** `exportService.ts`

#### A. `exportWithAssets` (lines 97-198)
- Processes main file + assets
- Calls `processMarkdownFile`
- Writes: `fs.writeFileSync(targetMarkdownPath, exportedContent, 'utf8')`

#### B. `exportColumn` (lines 203-310)
- Extracts column content
- Processes via `processMarkdownContent`
- Writes: `fs.writeFileSync(targetMarkdownPath, exportedContent, 'utf8')`

#### C. `exportUnified` (lines 1331-1499)
- Unified export for all scopes
- Processes via `processMarkdownContent`
- **Converts format:** Uses `convertToPresentationFormat` if format === 'presentation'
- Writes: `fs.writeFileSync(targetMarkdownPath, result.exportedContent, 'utf8')`

### 3.5 Include File Processing in Exports

**Location:** `exportService.ts:376-516`

```typescript
private static async processIncludedFiles(...)
```

**Key logic:**
- Detects include types (regular/column/task)
- For **merge mode:** Replaces include markers with content
- For **separate files:** Writes separate files and updates markers
- **Conversion:** Uses `convertPresentationToKanban` when merging presentation includes into kanban

**File writes:** `fs.writeFileSync(targetIncludePath, exportedContent, 'utf8')`

---

## 4. Duplicate Code Identification

### 4.1 File Writing Duplication

**Pattern:** Direct `fs.writeFileSync` calls

| Location | Purpose | Pre-checks | Backup |
|----------|---------|------------|--------|
| `kanbanWebviewPanel.ts:2772` | Column include save | Content validation | Yes |
| `kanbanWebviewPanel.ts:3006` | Task include save | Content validation | Yes |
| `exportService.ts:165` | Main export file | Path validation | No |
| `exportService.ts:278` | Column export | Path validation | No |
| `exportService.ts:493` | Include file export | None | No |
| `exportService.ts:1477` | Unified export | Path validation | No |
| `backupManager.ts:90` | Backup creation | Hash check | N/A |
| `backupManager.ts:184` | Include backup | Hash check | N/A |

**Duplication issues:**
- 8 different locations with `fs.writeFileSync`
- Inconsistent validation logic
- Different backup strategies
- No unified error handling

### 4.2 Path Processing Duplication

**Pattern:** Resolve relative → absolute paths

```typescript
// Pattern appears in 6+ locations:
const basePath = path.dirname(document.uri.fsPath);
const absolutePath = path.resolve(basePath, relativePath);
```

**Locations:**
- `kanbanWebviewPanel.ts:2659` (column includes)
- `kanbanWebviewPanel.ts:2950` (task includes)
- `exportService.ts:424` (include processing)
- `markdownParser.ts:164` (column parsing)
- `markdownParser.ts:298` (task parsing)

### 4.3 Conversion Logic Duplication

#### **A. Presentation Format Generation**

**Duplicate patterns:**

1. **In `tasksToPresentation`** (presentationParser.ts:100):
```typescript
const slides = tasks.map(task => {
    let slideContent = '';
    if (task.title && task.title.trim()) {
        slideContent += `${task.title}\n\n`;
    }
    if (task.description && task.description.trim()) {
        slideContent += task.description;
    }
    return slideContent.trim();
});
return slides.filter(slide => slide).join('\n\n---\n\n') + '\n';
```

2. **In `convertToPresentationFormat`** (exportService.ts:1233):
```typescript
// Similar logic but parses board first, then builds slides
for (const column of board.columns) {
    slides.push(columnTitle);
    if (column.tasks && column.tasks.length > 0) {
        const columnSlides = PresentationParser.tasksToPresentation(column.tasks);
        // Process slides...
    }
}
return slides.join('\n\n---\n\n') + '\n';
```

**Issue:** Both generate presentation format with different approaches

#### **B. Include Content Processing**

**Pattern:** Read file → parse → convert

Appears in:
1. `markdownParser.ts:164-176` (column includes)
2. `markdownParser.ts:298-327` (task includes)
3. `exportService.ts:433-480` (export includes)

All three:
- Read file with `fs.readFileSync`
- Parse content
- Handle missing files similarly
- Convert format

### 4.4 Backup Creation Duplication

**Similar backup logic:**

1. `kanbanWebviewPanel.ts:2766-2769` (column includes):
```typescript
await this._backupManager.createFileBackup(absolutePath, presentationContent, {
    label: 'auto',
    forceCreate: false
});
```

2. `kanbanWebviewPanel.ts:3000-3003` (task includes):
```typescript
await this._backupManager.createFileBackup(absolutePath, fileContent, {
    label: 'auto',
    forceCreate: false
});
```

3. `kanbanWebviewPanel.ts:3598` (conflict backup):
```typescript
const backupPath = await this._backupManager.createFileBackup(filePath, presentationContent, {
    label: 'conflict',
    forceCreate: true
});
```

**Issue:** Same backup pattern repeated with minor variations

---

## 5. Format Conversion Architecture

### 5.1 Conversion Paths

```
┌─────────────────────────────────────────────────────────┐
│                   KANBAN FORMAT                          │
│  (columns with tasks, YAML header, markdown structure)  │
└─────────────────────────────────────────────────────────┘
                         │
                         │ generateMarkdown()
                         ▼
┌─────────────────────────────────────────────────────────┐
│              KANBAN MARKDOWN STRING                      │
│       (## headers, - [ ] tasks, YAML front matter)      │
└─────────────────────────────────────────────────────────┘
                         │
          ┌──────────────┴───────────────┐
          │                              │
          │ convertToPresentationFormat  │ parseMarkdown
          ▼                              ▼
┌──────────────────────┐        ┌──────────────────┐
│  PRESENTATION STRING │        │   KANBAN BOARD   │
│  (slides with ---)   │        │    (object)      │
└──────────────────────┘        └──────────────────┘
          │                              │
          │                              │
          ▼                              ▼
┌──────────────────────┐        ┌──────────────────┐
│   SLIDES (array)     │        │   COLUMNS/TASKS  │
│                      │        │    (arrays)      │
└──────────────────────┘        └──────────────────┘
          │                              │
          │ slidesToTasks                │ tasksToPresentation
          ▼                              ▼
┌──────────────────────────────────────────────────────────┐
│                    KANBAN TASKS (array)                   │
│              (used for includes)                          │
└──────────────────────────────────────────────────────────┘
```

### 5.2 Conversion Matrix

| From | To | Function | Location | Notes |
|------|-----|----------|----------|-------|
| KanbanBoard | Markdown | `generateMarkdown` | markdownParser.ts:358 | Main save |
| Markdown | KanbanBoard | `parseMarkdown` | markdownParser.ts:38 | Main load |
| KanbanTask[] | Presentation | `tasksToPresentation` | presentationParser.ts:100 | Include saves |
| Presentation | Slides | `parsePresentation` | presentationParser.ts:15 | Parse helper |
| Slides | KanbanTask[] | `slidesToTasks` | presentationParser.ts:80 | Include loads |
| Markdown (kanban) | Presentation | `convertToPresentationFormat` | exportService.ts:1233 | Export |
| Presentation | Markdown (kanban) | `convertPresentationToKanban` | exportService.ts:1164 | Export merge |

### 5.3 Include Type Handling

| Include Type | Marker | Parse Function | Save Function | Format |
|--------------|--------|---------------|---------------|--------|
| **Regular** | `!!!include(file)!!!` | N/A (direct insert) | N/A | Same as source |
| **Column** | `!!!columninclude(file)!!!` | `parseMarkdownToTasks` | `tasksToPresentation` | Presentation |
| **Task** | `!!!taskinclude(file)!!!` | Direct text parse | Title + description | Plain text |

---

## 6. Current Problems & Issues

### 6.1 Code Duplication

1. **8 file write locations** with inconsistent validation
2. **3 path resolution patterns** for include files
3. **2 presentation conversion functions** with overlapping logic
4. **Multiple backup creation patterns**

### 6.2 Architectural Issues

#### **A. Unclear Responsibilities**
- `exportService.ts` has both export AND conversion logic
- Conversion functions split across 3 files
- Save logic in both webview panel and message handler

#### **B. Inconsistent Conversion**
- `tasksToPresentation` handles tasks only
- `convertToPresentationFormat` handles full boards
- Both produce similar output but can't be unified easily

#### **C. Complex Include Processing**
```
processIncludedFiles (export)
  ├── Detects format (kanban/presentation)
  ├── Decides: convert or not convert
  ├── Decides: merge or separate files
  ├── Uses convertPresentationToKanban (if merging)
  └── Uses processMarkdownFile recursively
```

**Issue:** Too many decision points, hard to test

### 6.3 Path Handling Inconsistencies

**Found patterns:**
- `./file.md` vs `file.md` normalization
- With/without prefix handling
- Absolute vs relative resolution

**Example from code:**
```typescript
// Pattern 1:
const normalizedPath = includeFile.startsWith('./') ? includeFile : './' + includeFile;

// Pattern 2:
const normalizedRelativePathWithoutPrefix = normalizedRelativePath.startsWith('./')
    ? normalizedRelativePath.substring(2)
    : normalizedRelativePath;
```

Appears in 6+ locations with slight variations.

### 6.4 Format Detection Issues

**Heuristic used:**
```typescript
const isKanbanFormat = includeContent.includes('kanban-plugin: board');
```

**Problems:**
- Fragile detection (relies on YAML marker)
- No validation of actual structure
- Fails for partial kanban content

### 6.5 Backup Strategy Inconsistencies

| Operation | Backup Location | Backup Type | Strategy |
|-----------|----------------|-------------|----------|
| Main save | Main file | Auto backup | Time-based |
| Column include save | Include file | Auto backup | Content hash |
| Task include save | Include file | Auto backup | Content hash |
| Export | N/A | None | N/A |
| Conflict | Both files | Conflict backup | Force create |

**Issue:** No backup for exports, different strategies for saves

---

## 7. Data Flow Examples

### 7.1 Save Main Kanban File

```
User clicks Save
    ↓
saveToMarkdown() [kanbanWebviewPanel.ts:1626]
    ↓
saveAllColumnIncludeChanges()
    ├→ For each column include:
    │   ├→ tasksToPresentation(column.tasks) [presentationParser.ts:100]
    │   └→ fs.writeFileSync(presentationContent)
    ↓
saveAllTaskIncludeChanges()
    ├→ For each task include:
    │   ├→ Build content from displayTitle + description
    │   └→ fs.writeFileSync(fileContent)
    ↓
generateMarkdown(board) [markdownParser.ts:358]
    ↓
vscode.workspace.applyEdit(edit)
    ↓
document.save()
```

### 7.2 Export as Presentation

```
User clicks Export → Presentation
    ↓
exportUnified(options) [exportService.ts:1331]
    ├→ Extract content by scope
    ↓
processMarkdownContent(content, ..., convertToPresentation=true, mergeIncludes=?)
    ├→ processIncludedFiles(...)
    │   ├→ Detect include type & format
    │   ├→ If merging presentation to kanban:
    │   │   └→ convertPresentationToKanban() [exportService.ts:1164]
    │   ├→ If separate files:
    │   │   └→ fs.writeFileSync(targetIncludePath)
    │   └→ Return processed content
    ├→ processAssets(...)
    ├→ applyTagFiltering(...)
    ├→ If convertToPresentation:
    │   └→ convertToPresentationFormat(content) [exportService.ts:1233]
    │       ├→ parseMarkdown(content)
    │       ├→ Build slides from columns/tasks
    │       └→ tasksToPresentation(tasks) [presentationParser.ts:100]
    ↓
fs.writeFileSync(targetMarkdownPath, result.exportedContent)
```

### 7.3 Column Include Change

```
User edits column include content
    ↓
Frontend marks unsaved changes
    ↓
saveColumnIncludeChanges(column) [kanbanWebviewPanel.ts:2648]
    ├→ Validate include mode
    ├→ Resolve path: path.resolve(basePath, includeFile)
    ├→ Check baseline overlap (prevent wrong file overwrite)
    ├→ tasksToPresentation(column.tasks) [presentationParser.ts:100]
    ├→ createFileBackup(absolutePath, presentationContent)
    ├→ fs.writeFileSync(absolutePath, presentationContent)
    └→ Update unified include tracking
```

---

## 8. Function Call Graph

### 8.1 Conversion Function Dependencies

```
generateMarkdown [markdownParser.ts]
    (no conversion dependencies)

parseMarkdown [markdownParser.ts]
    ├→ parseMarkdownToTasks [presentationParser.ts]
    │   ├→ parsePresentation [presentationParser.ts]
    │   └→ slidesToTasks [presentationParser.ts]

tasksToPresentation [presentationParser.ts]
    (no dependencies)

convertToPresentationFormat [exportService.ts]
    ├→ parseMarkdown [markdownParser.ts]
    └→ tasksToPresentation [presentationParser.ts]

convertPresentationToKanban [exportService.ts]
    ├→ parsePresentation [presentationParser.ts]
    └→ slidesToTasks [presentationParser.ts]
```

### 8.2 Save Function Dependencies

```
saveToMarkdown [kanbanWebviewPanel.ts]
    ├→ saveAllColumnIncludeChanges
    │   └→ saveColumnIncludeChanges
    │       ├→ tasksToPresentation [presentationParser.ts]
    │       ├→ createFileBackup [backupManager.ts]
    │       └→ fs.writeFileSync
    ├→ saveAllTaskIncludeChanges
    │   └→ saveTaskIncludeChanges
    │       ├→ createFileBackup [backupManager.ts]
    │       └→ fs.writeFileSync
    ├→ generateMarkdown [markdownParser.ts]
    └→ vscode.workspace.applyEdit
```

### 8.3 Export Function Dependencies

```
exportUnified [exportService.ts]
    ├→ extractRowContent / extractStackContent / etc.
    ├→ processMarkdownContent
    │   ├→ processIncludedFiles
    │   │   ├→ processMarkdownFile (recursive)
    │   │   │   └→ (same as processMarkdownContent)
    │   │   ├→ convertPresentationToKanban
    │   │   └→ fs.writeFileSync (for separate files)
    │   ├→ processAssets
    │   ├→ applyTagFiltering
    │   └→ convertToPresentationFormat (if format=presentation)
    │       ├→ parseMarkdown
    │       └→ tasksToPresentation
    └→ fs.writeFileSync
```

---

## 9. Recommendations

### 9.1 Immediate Refactoring Priorities

#### **Priority 1: Unify File Writing**
Create a single `FileWriter` service:
```typescript
class FileWriter {
    async writeFile(path: string, content: string, options?: {
        backup?: boolean;
        validate?: boolean;
    }): Promise<void>
}
```

#### **Priority 2: Consolidate Conversion**
Create a unified `FormatConverter` service:
```typescript
class FormatConverter {
    // Kanban ↔ Presentation
    kanbanToPresentation(board: KanbanBoard): string
    presentationToKanban(content: string): KanbanBoard

    // Tasks ↔ Presentation (for includes)
    tasksToPresentation(tasks: KanbanTask[]): string
    presentationToTasks(content: string): KanbanTask[]
}
```

#### **Priority 3: Standardize Path Processing**
Create a `PathResolver` utility:
```typescript
class PathResolver {
    resolveIncludePath(basePath: string, relativePath: string): string
    normalizeIncludePath(path: string): string
    isAbsolute(path: string): boolean
}
```

### 9.2 Architectural Improvements

#### **A. Separate Concerns**

Current mixing:
- `exportService.ts` has conversion + export + asset processing
- `kanbanWebviewPanel.ts` has save + include saves + conversion

Proposed:
```
src/
  services/
    FileWriter.ts         # All file writes
    FormatConverter.ts    # All conversions
    PathResolver.ts       # All path logic
    BackupService.ts      # Unified backup
  export/
    ExportService.ts      # Orchestration only
    AssetProcessor.ts     # Asset handling
  save/
    SaveService.ts        # Main save logic
    IncludeSaver.ts       # Include saves
```

#### **B. Remove Duplicate Conversions**

**Current:**
- `tasksToPresentation` (simple)
- `convertToPresentationFormat` (complex)

**Proposed:**
```typescript
// Single conversion with options
class FormatConverter {
    toPresentation(input: KanbanBoard | KanbanTask[], options?: {
        includeColumns?: boolean;
        mergeIncludes?: boolean;
    }): string {
        // Unified logic
    }
}
```

#### **C. Improve Include Processing**

**Current:** Complex nested logic in `processIncludedFiles`

**Proposed:**
```typescript
class IncludeProcessor {
    processInclude(
        marker: string,
        basePath: string,
        mode: 'merge' | 'separate',
        targetFormat: 'kanban' | 'presentation'
    ): ProcessedInclude {
        // Single responsibility
    }
}
```

### 9.3 Testing Strategy

**Priority test areas:**
1. Format conversion (kanban ↔ presentation)
2. Include file saves (column/task)
3. Export with different scopes
4. Path resolution edge cases
5. Backup creation

**Test structure:**
```
tests/
  unit/
    FormatConverter.test.ts
    PathResolver.test.ts
    FileWriter.test.ts
  integration/
    save-with-includes.test.ts
    export-with-conversion.test.ts
    backup-workflow.test.ts
```

---

## 10. Summary Tables

### 10.1 All Conversion Functions

| # | Function | File | Lines | Input | Output | Called By |
|---|----------|------|-------|-------|--------|-----------|
| 1 | `generateMarkdown` | markdownParser.ts | 358-419 | KanbanBoard | Markdown string | saveToMarkdown (2x) |
| 2 | `parseMarkdown` | markdownParser.ts | 38-276 | Markdown string | KanbanBoard | loadMarkdownFile, exports |
| 3 | `tasksToPresentation` | presentationParser.ts | 100-124 | KanbanTask[] | Presentation string | saveColumnInclude (1x), export (4x) |
| 4 | `slidesToTasks` | presentationParser.ts | 80-94 | Slides[] | KanbanTask[] | parseMarkdownToTasks, parser |
| 5 | `parsePresentation` | presentationParser.ts | 15-75 | Presentation string | Slides[] | parseMarkdownToTasks, export |
| 6 | `parseMarkdownToTasks` | presentationParser.ts | 130-133 | Presentation string | KanbanTask[] | Column includes |
| 7 | `convertToPresentationFormat` | exportService.ts | 1233-1326 | Kanban string | Presentation string | exportUnified, processContent |
| 8 | `convertPresentationToKanban` | exportService.ts | 1164-1222 | Presentation string | Kanban string | processIncludedFiles |

### 10.2 All File Write Locations

| # | Location | Function | Target | Backup | Validation |
|---|----------|----------|--------|--------|------------|
| 1 | kanbanWebviewPanel.ts:2772 | saveColumnIncludeChanges | Include file | Yes | Content + overlap |
| 2 | kanbanWebviewPanel.ts:3006 | saveTaskIncludeChanges | Include file | Yes | Content |
| 3 | exportService.ts:165 | exportWithAssets | Main export | No | Path exists |
| 4 | exportService.ts:278 | exportColumn | Column export | No | Path exists |
| 5 | exportService.ts:493 | processIncludedFiles | Include export | No | None |
| 6 | exportService.ts:1477 | exportUnified | Unified export | No | Path exists |
| 7 | backupManager.ts:90 | createBackup | Backup file | N/A | Hash + time |
| 8 | backupManager.ts:184 | createFileBackup | Backup file | N/A | Hash |

### 10.3 Duplicate Code Hotspots

| Pattern | Occurrences | Files | Issue Severity |
|---------|-------------|-------|----------------|
| `fs.writeFileSync` | 8 | 3 files | HIGH |
| Path resolution | 6 | 3 files | MEDIUM |
| Backup creation | 4 | 2 files | MEDIUM |
| Include processing | 3 | 2 files | HIGH |
| Presentation generation | 2 | 2 files | HIGH |
| Format detection | 3 | 2 files | MEDIUM |

---

## 11. Files Referenced

### Source Files Analyzed
- `/Users/rspoerri/_REPOSITORIES/_TINKERING_REPOs/markdown-kanban-obsidian/src/messageHandler.ts` (~2,400 lines)
- `/Users/rspoerri/_REPOSITORIES/_TINKERING_REPOs/markdown-kanban-obsidian/src/backupManager.ts` (462 lines)
- `/Users/rspoerri/_REPOSITORIES/_TINKERING_REPOs/markdown-kanban-obsidian/src/exportService.ts` (1,500 lines)
- `/Users/rspoerri/_REPOSITORIES/_TINKERING_REPOs/markdown-kanban-obsidian/src/presentationParser.ts` (134 lines)
- `/Users/rspoerri/_REPOSITORIES/_TINKERING_REPOs/markdown-kanban-obsidian/src/kanbanWebviewPanel.ts` (~4,000 lines)
- `/Users/rspoerri/_REPOSITORIES/_TINKERING_REPOs/markdown-kanban-obsidian/src/markdownParser.ts` (420 lines)

### Key Functions Inventory
- **Save:** saveToMarkdown, saveColumnIncludeChanges, saveTaskIncludeChanges
- **Export:** exportWithAssets, exportColumn, exportUnified
- **Conversion:** generateMarkdown, parseMarkdown, tasksToPresentation, slidesToTasks, convertToPresentationFormat, convertPresentationToKanban
- **Backup:** createBackup, createFileBackup
- **Processing:** processMarkdownFile, processMarkdownContent, processIncludedFiles

---

## Conclusion

The codebase has a functional but overly complex save/backup/export architecture with significant opportunities for consolidation. The main issues are:

1. **8 file write locations** with no unified interface
2. **Duplicate conversion logic** between presentation formats
3. **Complex include processing** with multiple decision points
4. **Inconsistent path handling** across operations

**Recommended next steps:**
1. Create unified `FileWriter` service (eliminate 8 duplications)
2. Consolidate conversion functions into `FormatConverter` (eliminate 2 duplications)
3. Extract `PathResolver` utility (eliminate 6 duplications)
4. Refactor `processIncludedFiles` to reduce complexity
5. Add comprehensive tests for all conversion paths
