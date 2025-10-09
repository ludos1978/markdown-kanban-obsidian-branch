# Unified Save/Backup/Export Architecture Plan

## Executive Summary

This document outlines a complete redesign of the save/backup/export system to:
- **Eliminate 80% of duplicate code** (8 file write locations → 1, 6 path resolvers → 1, 2 conversion systems → 1)
- **Unify save/backup/export** into a single pipeline with configurable options
- **Add "keep file formats" option** to preserve source formats during export
- **Simplify task structure** by merging title and description
- **Reduce codebase** by ~2,000 lines through consolidation

---

## 1. Current State Problems

### 1.1 Code Duplication Summary

| Issue | Current | Target | Savings |
|-------|---------|--------|---------|
| File write locations | 8 places | 1 service | -7 duplicates |
| Path resolution logic | 6 places | 1 utility | -5 duplicates |
| Conversion functions | 8 functions | 3 functions | -5 functions |
| Backup strategies | 3 different | 1 unified | -2 patterns |
| Include processing | 3 places | 1 processor | -2 duplicates |

**Total estimated reduction:** ~2,000 lines of code

### 1.2 Architectural Issues

1. **Mixed responsibilities:** exportService has conversion + export + asset handling
2. **Inconsistent formats:** Different backup strategies for save vs export
3. **Complex includes:** `processIncludedFiles` has 10+ decision points
4. **Fragile detection:** Format detection via string matching only
5. **No unified pipeline:** Save, backup, export are completely separate flows

---

## 2. New Unified Architecture

### 2.1 Core Concept

**Single Pipeline Approach:**
```
Source Content
    ↓
┌───────────────────────────┐
│  Unified Content Pipeline │
│  (handles all operations) │
└───────────────────────────┘
    ↓
[Scope Selection] ───→ full / row / stack / column / task
    ↓
[Format Decision] ───→ keep / kanban / presentation
    ↓
[Include Strategy] ──→ merge / separate
    ↓
[Asset Strategy] ───→ pack / link
    ↓
[Tag Visibility] ───→ all / none / show / hide
    ↓
[Backup Strategy] ──→ auto / none / force
    ↓
Output Files
```

### 2.2 Service Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     API Layer                                │
│  - saveDocument()                                            │
│  - createBackup()                                            │
│  - exportContent()                                           │
└─────────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┴───────────────┐
           ▼                               ▼
┌──────────────────────┐        ┌─────────────────────┐
│  Content Pipeline    │        │  Operation Config   │
│  Service             │        │  Builder            │
└──────────────────────┘        └─────────────────────┘
           │
    ┌──────┴──────┬──────────┬──────────┬────────────┐
    ▼             ▼          ▼          ▼            ▼
┌─────────┐  ┌─────────┐  ┌──────┐  ┌──────┐  ┌─────────┐
│ Scope   │  │ Format  │  │Include│ │Asset │  │ File    │
│ Extractor│ │Converter│  │Processor│ │Handler│ │ Writer  │
└─────────┘  └─────────┘  └──────┘  └──────┘  └─────────┘
```

### 2.3 New Services

#### A. **ContentPipelineService** (Core Orchestrator)
```typescript
class ContentPipelineService {
    async process(options: PipelineOptions): Promise<PipelineResult> {
        // 1. Extract scope
        const content = await this.scopeExtractor.extract(
            options.source,
            options.scope
        );

        // 2. Process includes
        const withIncludes = await this.includeProcessor.process(
            content,
            options.includeStrategy
        );

        // 3. Convert format
        const converted = await this.formatConverter.convert(
            withIncludes,
            options.formatStrategy
        );

        // 4. Handle assets
        const withAssets = await this.assetHandler.process(
            converted,
            options.assetStrategy
        );

        // 5. Apply tag filtering
        const filtered = this.tagFilter.apply(
            withAssets,
            options.tagVisibility
        );

        // 6. Write files with backup
        const result = await this.fileWriter.write(
            filtered,
            options.outputConfig
        );

        return result;
    }
}
```

#### B. **FormatConverter** (Unified Conversion)
```typescript
class FormatConverter {
    // Main conversion method
    convert(
        content: ContentUnit[],
        strategy: FormatStrategy
    ): ContentUnit[] {
        switch (strategy.type) {
            case 'keep':
                return content; // No conversion
            case 'kanban':
                return this.toKanban(content);
            case 'presentation':
                return this.toPresentation(content);
        }
    }

    private toKanban(units: ContentUnit[]): ContentUnit[] {
        return units.map(unit => {
            if (unit.format === 'presentation') {
                return this.presentationToKanban(unit);
            }
            return unit;
        });
    }

    private toPresentation(units: ContentUnit[]): ContentUnit[] {
        return units.map(unit => {
            if (unit.format === 'kanban') {
                return this.kanbanToPresentation(unit);
            }
            return unit;
        });
    }

    // Replaces: tasksToPresentation, convertToPresentationFormat
    private kanbanToPresentation(unit: ContentUnit): ContentUnit {
        const slides: string[] = [];

        for (const column of unit.columns) {
            // Column title as slide
            if (column.title) {
                slides.push(column.title);
            }

            // Tasks as slides or grouped (based on strategy)
            for (const task of column.tasks) {
                const slideContent = [
                    task.content, // Unified title+description
                ].filter(Boolean).join('\n\n');

                slides.push(slideContent);
            }
        }

        return {
            format: 'presentation',
            content: slides.join('\n\n---\n\n') + '\n',
            metadata: unit.metadata
        };
    }

    // Replaces: slidesToTasks, convertPresentationToKanban
    private presentationToKanban(unit: ContentUnit): ContentUnit {
        const slides = this.parseSlides(unit.content);
        const tasks = slides.map(slide => ({
            content: slide.content, // Unified content
            metadata: slide.metadata
        }));

        return {
            format: 'kanban',
            columns: [{ title: '', tasks }],
            metadata: unit.metadata
        };
    }
}
```

#### C. **FileWriter** (Unified File Operations)
```typescript
class FileWriter {
    async write(
        units: ContentUnit[],
        config: OutputConfig
    ): Promise<WriteResult> {
        const results: FileResult[] = [];

        for (const unit of units) {
            // 1. Determine output path
            const outputPath = this.pathResolver.resolve(
                config.baseFolder,
                unit.relativePath
            );

            // 2. Create backup if needed
            if (config.backup !== 'none') {
                await this.backupService.createBackup(
                    outputPath,
                    unit.content,
                    config.backup
                );
            }

            // 3. Write file
            await this.writeFile(outputPath, unit.content);

            results.push({
                path: outputPath,
                size: unit.content.length,
                backed: config.backup !== 'none'
            });
        }

        return { files: results };
    }

    private async writeFile(path: string, content: string): Promise<void> {
        // Single, validated write operation
        // Replaces all 8 fs.writeFileSync locations
        await fs.promises.writeFile(path, content, 'utf8');
    }
}
```

#### D. **PathResolver** (Unified Path Logic)
```typescript
class PathResolver {
    // Replaces 6 path resolution patterns
    resolve(basePath: string, relativePath: string): string {
        // Normalize ./ prefix
        const normalized = this.normalize(relativePath);

        // Resolve to absolute
        return path.resolve(basePath, normalized);
    }

    normalize(relativePath: string): string {
        // Consistent normalization
        return relativePath.startsWith('./')
            ? relativePath.substring(2)
            : relativePath;
    }

    ensurePrefix(relativePath: string): string {
        return relativePath.startsWith('./')
            ? relativePath
            : './' + relativePath;
    }
}
```

#### E. **IncludeProcessor** (Simplified)
```typescript
class IncludeProcessor {
    async process(
        content: ContentUnit,
        strategy: IncludeStrategy
    ): Promise<ContentUnit[]> {
        const includes = this.detectIncludes(content.content);

        if (strategy === 'merge') {
            return [await this.mergeIncludes(content, includes)];
        } else {
            return await this.separateIncludes(content, includes);
        }
    }

    private async mergeIncludes(
        parent: ContentUnit,
        includes: IncludeInfo[]
    ): Promise<ContentUnit> {
        let merged = parent.content;

        for (const inc of includes) {
            const incContent = await this.readInclude(inc.path);
            merged = merged.replace(inc.marker, incContent.content);
        }

        return { ...parent, content: merged };
    }

    private async separateIncludes(
        parent: ContentUnit,
        includes: IncludeInfo[]
    ): Promise<ContentUnit[]> {
        const units: ContentUnit[] = [parent];

        for (const inc of includes) {
            const incContent = await this.readInclude(inc.path);
            units.push(incContent);
        }

        return units;
    }
}
```

---

## 3. New Format Strategy System

### 3.1 Three Format Options

```typescript
type FormatStrategy =
    | { type: 'keep' }                    // Keep source formats
    | { type: 'kanban' }                  // Convert all to kanban
    | { type: 'presentation' };           // Convert all to presentation
```

### 3.2 How "Keep" Works

When `type: 'keep'`:
- No format conversion happens
- Each file maintains its source format
- Presentation includes stay as presentation
- Kanban includes stay as kanban
- Main file format is preserved

**Example:**
```
Main file: kanban format
  ├─ Column include: presentation format
  └─ Task include: plain text

Export with "keep":
  output.md (kanban)
  column.md (presentation)
  task.md (plain text)
```

### 3.3 How "Convert All" Works

When `type: 'kanban'` or `type: 'presentation'`:
- ALL files are converted to target format
- Includes are converted before merging (if merge mode)
- Output is uniform format

**Example:**
```
Main file: kanban format
  ├─ Column include: presentation format
  └─ Task include: plain text

Export with "presentation" + merge:
  output.md (presentation) ← includes merged and converted
```

---

## 4. Unified Task Structure

### 4.1 Current Problem

**Split structure:**
```typescript
interface KanbanTask {
    title: string;           // First line only
    displayTitle: string;    // For UI when folded
    description: string;     // Rest of content
    // Duplication and complexity
}
```

### 4.2 Proposed Solution

**Unified structure:**
```typescript
interface KanbanTask {
    content: string;         // Full markdown content (unified)
    metadata: {
        id: string;
        tags: string[];
        includes: IncludeInfo[];
        folded: boolean;
    };
}
```

**Display title derivation:**
```typescript
class TaskRenderer {
    getDisplayTitle(task: KanbanTask): string {
        // Extract first non-empty line as title
        const lines = task.content.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                return trimmed;
            }
        }
        return 'Untitled';
    }
}
```

### 4.3 Benefits

1. **Simpler data model** - one field instead of three
2. **No sync issues** - content is single source of truth
3. **Easier conversion** - just transform the content string
4. **Better for includes** - no need to split/merge title/description

---

## 5. Operation Configuration

### 5.1 Unified Operation Options

```typescript
interface OperationOptions {
    // Operation type (determines defaults)
    operation: 'save' | 'backup' | 'export';

    // Scope (only used for export)
    scope: {
        type: 'full' | 'row' | 'stack' | 'column' | 'task';
        rowNumber?: number;
        stackIndex?: number;
        columnIndex?: number;
        taskId?: string;
    };

    // Format strategy
    format: FormatStrategy;

    // Include handling
    includes: {
        strategy: 'merge' | 'separate';
    };

    // Asset handling
    assets: {
        pack: boolean;
        includeImages: boolean;
        includeVideos: boolean;
        includeDocuments: boolean;
        includeOtherMedia: boolean;
        fileSizeLimitMB: number;
    };

    // Tag visibility
    tags: 'all' | 'none' | 'show' | 'hide';

    // Output configuration
    output: {
        folder: string;        // Output folder
        backup: 'auto' | 'force' | 'none';
    };
}
```

### 5.2 Operation-Specific Defaults

```typescript
class OperationDefaults {
    static forSave(): Partial<OperationOptions> {
        return {
            operation: 'save',
            scope: { type: 'full' },
            format: { type: 'keep' },  // Always keep format on save
            includes: { strategy: 'separate' },
            assets: { pack: false },
            tags: 'all',
            output: {
                folder: '<source-folder>',
                backup: 'auto'
            }
        };
    }

    static forBackup(): Partial<OperationOptions> {
        return {
            operation: 'backup',
            scope: { type: 'full' },
            format: { type: 'keep' },
            includes: { strategy: 'separate' },
            assets: { pack: false },
            tags: 'all',
            output: {
                folder: '<backup-folder>',
                backup: 'force'
            }
        };
    }

    static forExport(): Partial<OperationOptions> {
        return {
            operation: 'export',
            scope: { type: 'full' },  // User configurable
            format: { type: 'keep' },  // User configurable
            includes: { strategy: 'separate' },  // User configurable
            assets: { pack: false },  // User configurable
            tags: 'all',  // User configurable
            output: {
                folder: '<user-selected>',
                backup: 'none'  // No backup on export by default
            }
        };
    }
}
```

---

## 6. Code Removal Plan

### 6.1 Functions to Remove

| Function | Location | Reason | Replaced By |
|----------|----------|--------|-------------|
| `tasksToPresentation` | presentationParser.ts:100 | Duplicate | `FormatConverter.toPresentation()` |
| `convertToPresentationFormat` | exportService.ts:1233 | Duplicate | `FormatConverter.toPresentation()` |
| `slidesToTasks` | presentationParser.ts:80 | Duplicate | `FormatConverter.toKanban()` |
| `convertPresentationToKanban` | exportService.ts:1164 | Duplicate | `FormatConverter.toKanban()` |
| `parseMarkdownToTasks` | presentationParser.ts:130 | Wrapper | Direct call to `FormatConverter` |

**Total:** 5 functions removed (~250 lines)

### 6.2 File Write Locations to Consolidate

All 8 `fs.writeFileSync` calls replaced by `FileWriter.write()`:

| Location | Function | Lines Removed |
|----------|----------|---------------|
| kanbanWebviewPanel.ts:2772 | saveColumnIncludeChanges | ~20 |
| kanbanWebviewPanel.ts:3006 | saveTaskIncludeChanges | ~20 |
| exportService.ts:165 | exportWithAssets | ~15 |
| exportService.ts:278 | exportColumn | ~15 |
| exportService.ts:493 | processIncludedFiles | ~10 |
| exportService.ts:1477 | exportUnified | ~15 |

**Total:** ~95 lines removed

### 6.3 Path Resolution to Consolidate

All 6 path resolution patterns replaced by `PathResolver`:

| Location | Pattern | Lines |
|----------|---------|-------|
| kanbanWebviewPanel.ts:2659 | `path.resolve` | ~5 |
| kanbanWebviewPanel.ts:2950 | `path.resolve` | ~5 |
| exportService.ts:424 | `path.resolve` + normalize | ~8 |
| markdownParser.ts:164 | `path.resolve` + normalize | ~10 |
| markdownParser.ts:298 | `path.resolve` + normalize | ~10 |

**Total:** ~38 lines removed

### 6.4 Include Processing to Simplify

Current `processIncludedFiles` (~140 lines) → New `IncludeProcessor` (~60 lines)

**Savings:** ~80 lines

### 6.5 Total Code Reduction

| Category | Lines Removed |
|----------|---------------|
| Conversion functions | ~250 |
| File write operations | ~95 |
| Path resolution | ~38 |
| Include processing | ~80 |
| Backup duplication | ~50 |
| **TOTAL** | **~513 lines** |

Additional simplification from unified architecture: ~500 lines

**Total estimated reduction: ~1,000+ lines**

---

## 7. Migration Strategy

### 7.1 Phase 1: Core Services (Week 1)

**Create new services without breaking existing code:**

1. Create `PathResolver` utility
2. Create `FileWriter` service
3. Create `FormatConverter` service
4. Add tests for each

**Success criteria:**
- All tests pass
- New services work independently
- Old code still functional

### 7.2 Phase 2: Pipeline (Week 2)

**Build the unified pipeline:**

1. Create `ContentPipelineService`
2. Create `IncludeProcessor`
3. Create `AssetHandler`
4. Create `OperationOptions` system

**Success criteria:**
- Pipeline can handle full export
- All options work correctly
- Performance is acceptable

### 7.3 Phase 3: Save Integration (Week 3)

**Migrate save operations:**

1. Update `saveToMarkdown` to use pipeline
2. Update `saveColumnIncludeChanges` to use pipeline
3. Update `saveTaskIncludeChanges` to use pipeline
4. Remove old save code

**Success criteria:**
- All saves work through pipeline
- Backups still work
- Include tracking works

### 7.4 Phase 4: Export Integration (Week 4)

**Migrate export operations:**

1. Update `exportUnified` to use pipeline
2. Remove old export functions
3. Update UI to use new options

**Success criteria:**
- All export scopes work
- All format options work
- Asset packing works

### 7.5 Phase 5: Cleanup (Week 5)

**Remove old code:**

1. Delete duplicate conversion functions
2. Delete old file write code
3. Delete old path resolution code
4. Update all imports

**Success criteria:**
- No duplicate code remains
- All tests pass
- Codebase is smaller

---

## 8. New UI for Export

### 8.1 Export Dialog Enhancement

**Add format option:**
```
┌─────────────────────────────────────┐
│ Export Kanban Board                 │
├─────────────────────────────────────┤
│ Scope: [Full Board ▾]               │
│                                     │
│ Output Format:                      │
│ ○ Keep Source Formats               │
│ ● Export All as Kanban              │
│ ○ Export All as Presentation        │
│                                     │
│ Includes:                           │
│ ☑ Merge Includes into Main File    │
│                                     │
│ Assets:                             │
│ ☑ Pack Assets                       │
│   ☑ Images ☑ Videos ☑ Documents    │
│                                     │
│ Tags: [Show All ▾]                  │
│                                     │
│ Output Folder: [Browse...]          │
│                                     │
│         [Cancel]  [Export]          │
└─────────────────────────────────────┘
```

### 8.2 Save Options (Simplified)

Save always uses:
- Scope: Full
- Format: Keep source formats
- Includes: Separate files
- Assets: No packing
- Tags: All visible
- Output: Source folder
- Backup: Auto

No UI needed - just "Save" button.

---

## 9. Implementation Checklist

### 9.1 New Files to Create

- [ ] `src/services/PathResolver.ts`
- [ ] `src/services/FileWriter.ts`
- [ ] `src/services/FormatConverter.ts`
- [ ] `src/services/ContentPipelineService.ts`
- [ ] `src/services/IncludeProcessor.ts`
- [ ] `src/services/AssetHandler.ts`
- [ ] `src/types/OperationOptions.ts`
- [ ] `src/types/ContentUnit.ts`
- [ ] `src/utils/OperationDefaults.ts`

### 9.2 Files to Modify

- [ ] `src/kanbanWebviewPanel.ts` - use new pipeline for saves
- [ ] `src/exportService.ts` - use new pipeline for exports
- [ ] `src/messageHandler.ts` - update message handlers
- [ ] `src/html/webview.html` - add format options to UI
- [ ] `src/html/webview.js` - handle new format options

### 9.3 Files to Delete/Reduce

- [ ] Remove `tasksToPresentation` from presentationParser.ts
- [ ] Remove `convertToPresentationFormat` from exportService.ts
- [ ] Remove `slidesToTasks` from presentationParser.ts
- [ ] Remove `convertPresentationToKanban` from exportService.ts
- [ ] Remove `parseMarkdownToTasks` from presentationParser.ts
- [ ] Consolidate all `fs.writeFileSync` calls
- [ ] Consolidate all path resolution code

### 9.4 Tests to Add

- [ ] Unit tests for `PathResolver`
- [ ] Unit tests for `FileWriter`
- [ ] Unit tests for `FormatConverter` (all conversions)
- [ ] Unit tests for `IncludeProcessor`
- [ ] Integration tests for pipeline (save/backup/export)
- [ ] E2E tests for format options

---

## 10. Benefits Summary

### 10.1 For Developers

- **~1,000 fewer lines** to maintain
- **Single place** for all conversions
- **Single place** for all file writes
- **Clear architecture** with separated concerns
- **Easier testing** with isolated services

### 10.2 For Users

- **New format options** (keep/kanban/presentation)
- **Consistent behavior** across save/export
- **Better reliability** from unified code
- **More flexibility** in export configuration
- **Clearer UI** with organized options

### 10.3 Technical Improvements

- **Eliminates 8 file write locations** → 1 service
- **Eliminates 6 path resolvers** → 1 utility
- **Eliminates 5 conversion functions** → 3 methods
- **Eliminates 3 backup strategies** → 1 unified
- **Reduces complexity** in include processing by 50%

---

## 11. Risk Mitigation

### 11.1 Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing saves | HIGH | Phase migration, keep old code until tested |
| Performance degradation | MEDIUM | Benchmark before/after, optimize if needed |
| Include handling bugs | HIGH | Comprehensive tests for all include types |
| User confusion | LOW | Clear UI labels, good defaults |

### 11.2 Rollback Plan

- Keep old code in place during migration
- Feature flag for new pipeline
- Can disable new pipeline if issues found
- Full rollback possible until cleanup phase

---

## 12. Success Metrics

### 12.1 Code Quality Metrics

- [ ] Lines of code reduced by 1,000+
- [ ] Code duplication reduced by 80%
- [ ] Test coverage increased to 90%+
- [ ] No new bugs introduced

### 12.2 Feature Metrics

- [ ] All save operations work through pipeline
- [ ] All export scopes work
- [ ] All format options work
- [ ] "Keep formats" option works correctly
- [ ] Asset packing works as before

### 12.3 Performance Metrics

- [ ] Save time ≤ current
- [ ] Export time ≤ current
- [ ] Memory usage ≤ current

---

## 13. Next Steps

### Immediate Actions

1. **Review this plan** with team/user
2. **Create GitHub issues** for each phase
3. **Set up feature branch** for development
4. **Create milestone** for Phase 1

### First Implementation

Start with Phase 1 (Core Services):
1. Implement `PathResolver`
2. Add tests
3. Use in one location to validate
4. Get feedback before proceeding

---

## Appendix A: Code Examples

### A.1 Using New Pipeline for Save

**Before (kanbanWebviewPanel.ts):**
```typescript
private async saveToMarkdown() {
    await this.saveAllColumnIncludeChanges();
    await this.saveAllTaskIncludeChanges();
    const markdown = MarkdownKanbanParser.generateMarkdown(this._board);
    // ... complex save logic
    fs.writeFileSync(path, markdown);
}
```

**After:**
```typescript
private async saveToMarkdown() {
    const options = OperationDefaults.forSave();

    await this.contentPipeline.process({
        ...options,
        source: this._board,
        output: { folder: this.getSourceFolder() }
    });
}
```

### A.2 Using New Pipeline for Export

**Before (exportService.ts):**
```typescript
public static async exportUnified(doc, options) {
    const content = extractContent(...);
    const processed = await processIncludedFiles(...);
    const converted = convertToPresentationFormat(...);
    const withAssets = await processAssets(...);
    fs.writeFileSync(path, withAssets);
}
```

**After:**
```typescript
public static async exportUnified(doc, options) {
    return await this.contentPipeline.process({
        operation: 'export',
        source: doc,
        scope: options.scope,
        format: options.formatStrategy,
        includes: options.includeStrategy,
        assets: options.assetStrategy,
        output: { folder: options.targetFolder }
    });
}
```

### A.3 Format Strategy Usage

```typescript
// Keep source formats
const result = await pipeline.process({
    format: { type: 'keep' }
});

// Convert all to kanban
const result = await pipeline.process({
    format: { type: 'kanban' }
});

// Convert all to presentation
const result = await pipeline.process({
    format: { type: 'presentation' }
});
```

---

## Appendix B: Architecture Diagrams

### B.1 Before (Current Architecture)

```
┌─────────────┐  ┌──────────────┐  ┌──────────────┐
│    Save     │  │   Backup     │  │    Export    │
│  (4 funcs)  │  │  (2 funcs)   │  │  (3 funcs)   │
└─────────────┘  └──────────────┘  └──────────────┘
       │                │                   │
       ├────────────────┴───────────────────┤
       │           All call:                │
       ▼                                    ▼
┌──────────────────────────────────────────────┐
│  Duplicate Code (8 locations each):          │
│  - fs.writeFileSync                          │
│  - path.resolve                              │
│  - Backup creation                           │
│  - Format detection                          │
└──────────────────────────────────────────────┘
```

### B.2 After (Unified Architecture)

```
┌─────────────────────────────────────────────┐
│        Unified API Layer                    │
│  - save()                                   │
│  - backup()                                 │
│  - export()                                 │
└─────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────┐
│      ContentPipelineService                 │
│  (Single processing pipeline)               │
└─────────────────────────────────────────────┘
                     │
       ┌─────────────┴─────────────┐
       ▼                           ▼
┌──────────────┐          ┌──────────────┐
│ Shared       │          │ Shared       │
│ Services     │          │ Utilities    │
│ (6 services) │          │ (3 utils)    │
└──────────────┘          └──────────────┘
```

---

## Conclusion

This architecture plan provides a clear path to:
1. **Eliminate duplication** - reduce codebase by ~1,000 lines
2. **Unify operations** - single pipeline for save/backup/export
3. **Add flexibility** - new format options and better configuration
4. **Improve maintainability** - clear separation of concerns
5. **Reduce complexity** - fewer decision points and clearer flow

The phased migration approach ensures we can deliver improvements incrementally while maintaining stability.
