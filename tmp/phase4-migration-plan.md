# Phase 4: Export Operations Migration Plan

## Current Export Architecture

### Main Entry Point
`ExportService.exportUnified()` (line 1331)

**Flow:**
1. Read source file
2. Extract content by scope (full/row/stack/column/task)
3. Apply tag filtering
4. Convert format (kanban ↔ presentation)
5. Process includes (merge or separate)
6. Process assets (pack if requested)
7. Write files

### Key Methods
- `exportUnified()` - Main export orchestrator
- `processMarkdownContent()` - Process content with includes/assets
- `processIncludedFiles()` - Handle include files
- `findAssets()` - Detect assets in markdown
- `copyAssetsToExportFolder()` - Copy assets
- `convertToPresentationFormat()` - Format conversion
- Various extraction methods (extractRowContent, extractStackContent, etc.)

## Migration Strategy

### Option 1: Full Replacement (Aggressive)
Replace `ExportService` entirely with `ContentPipelineService`

**Pros:**
- Complete unification
- Maximum code reduction
- Clean architecture

**Cons:**
- High risk
- Need to reimplement extraction methods
- Breaking changes to callers

### Option 2: Wrapper Approach (Recommended) ✅
Create new methods that use `ContentPipelineService`, keep old methods temporarily

**Pros:**
- Low risk (parallel implementation)
- Easy rollback
- Gradual migration
- Can test thoroughly

**Cons:**
- Temporary code duplication
- Two code paths

### Option 3: Hybrid (Selected Strategy) ✅
Keep extraction methods, replace processing pipeline

**Pros:**
- Preserves working extraction logic
- Uses ContentPipelineService for pipeline
- Reduces duplicate processing code
- Lower risk than full replacement

**Cons:**
- Still some code duplication

## Implementation Plan

### Step 1: Create Adapter Functions ✅

Create new methods in `ExportService`:
- `exportUnifiedV2()` - New export using ContentPipelineService
- Map old options to `OperationOptions`
- Call `ContentPipelineService.execute()`

### Step 2: Keep Extraction Logic ✅

**Preserve these methods** (they work well):
- `extractRowContent()`
- `extractStackContent()`
- `extractColumnContent()`
- `extractTaskContent()`

**Why?** These are scope-specific logic, not duplicates.

### Step 3: Replace Processing Pipeline ✅

**Replace:**
- `processMarkdownContent()` → Use ContentPipelineService
- `processIncludedFiles()` → Already in IncludeProcessor
- `findAssets()` → Already in AssetHandler
- `copyAssetsToExportFolder()` → Use AssetHandler + FileWriter
- `convertToPresentationFormat()` → Already in FormatConverter

### Step 4: Update Callers

**Find and update:**
- Message handlers calling `exportUnified()`
- UI event handlers
- Any other export triggers

### Step 5: Testing

Test all combinations:
- Scopes: full, row, stack, column, task
- Formats: kanban, presentation
- Include modes: merge, separate
- Asset strategies: pack, no-pack
- Tag visibility options

### Step 6: Deprecation

Once v2 is tested:
1. Mark old methods as `@deprecated`
2. Add migration guide
3. Keep for 1-2 releases
4. Remove in cleanup phase

## Code Mapping

### Old Options → New Options

```typescript
// OLD: UnifiedExportOptions
{
    targetFolder?: string;
    scope: ExportScope;
    format: ExportFormat;
    tagVisibility: TagVisibility;
    packAssets: boolean;
    mergeIncludes?: boolean;
    packOptions?: {...};
    selection: {...};
}

// NEW: OperationOptions
{
    operation: 'export',
    sourcePath: string,
    targetDir: string,
    targetFilename: string,
    formatStrategy: 'keep' | 'kanban' | 'presentation',
    scope: 'full' | 'row' | 'stack' | 'column' | 'task',
    includeMode: {
        strategy: 'merge' | 'separate' | 'ignore',
        processTypes: ['include', 'columninclude', 'taskinclude'],
        resolveNested: true,
        maxDepth: 10
    },
    exportOptions: {
        includeAssets: boolean,
        assetStrategy: 'embed' | 'copy' | 'reference' | 'ignore',
        preserveYaml: boolean,
        selectedItems: [...]
    }
}
```

### Conversion Helper

```typescript
function convertExportOptions(
    oldOptions: UnifiedExportOptions,
    sourcePath: string,
    extractedContent: string
): OperationOptions {
    return new OperationOptionsBuilder()
        .operation('export')
        .source(sourcePath)
        .targetDir(oldOptions.targetFolder || generateDefaultFolder(sourcePath))
        .format(oldOptions.format === 'presentation' ? 'presentation' : 'keep')
        .scope(oldOptions.scope)
        .includes({
            strategy: oldOptions.mergeIncludes ? 'merge' : 'separate',
            processTypes: ['include', 'columninclude', 'taskinclude'],
            resolveNested: true,
            maxDepth: 10
        })
        .exportOptions({
            includeAssets: oldOptions.packAssets,
            assetStrategy: oldOptions.packAssets ? 'copy' : 'ignore',
            preserveYaml: true
        })
        .build();
}
```

## Expected Impact

### Lines Removed
- `processMarkdownContent()` - ~200 lines
- `processIncludedFiles()` - ~150 lines
- `findAssets()` - ~100 lines
- `copyAssetsToExportFolder()` - ~150 lines
- `convertToPresentationFormat()` - ~100 lines
- Duplicate path/file operations - ~50 lines
- **Total: ~750 lines**

### Lines Added
- `exportUnifiedV2()` - ~100 lines (wrapper + options conversion)
- Options conversion helpers - ~50 lines
- **Total: ~150 lines**

### Net Reduction
**~600 lines eliminated**

## Risk Assessment

### Low Risk ✅
- Extraction methods unchanged (proven logic)
- Old code path kept temporarily
- Can switch back easily
- Thorough testing before deprecation

### Medium Risk ⚠️
- Options mapping complexity
- Edge cases in format conversion
- Asset handling differences

### Mitigation
- Comprehensive test cases
- Parallel implementation (both paths work)
- Gradual caller migration
- Document differences

## Timeline

- **Step 1-2:** Create wrapper + preserve extraction (~2 hours)
- **Step 3:** Implement pipeline replacement (~2 hours)
- **Step 4:** Update callers (~1 hour)
- **Step 5:** Testing (~2 hours)
- **Step 6:** Documentation (~1 hour)

**Total: ~8 hours**

## Success Criteria

✅ All export scopes work correctly
✅ Format conversion matches old behavior
✅ Include processing works (merge + separate)
✅ Asset handling works (pack + no-pack)
✅ Tag filtering works
✅ No regressions in existing functionality
✅ TypeScript compiles without errors
✅ Reduced code duplication

---

**Strategy:** Hybrid approach with wrapper pattern
**Risk Level:** Low-Medium (gradual migration)
**Estimated Impact:** ~600 lines eliminated
**Recommended:** Proceed with hybrid strategy ✅
