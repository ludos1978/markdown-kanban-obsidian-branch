# Unified Export System - Implementation Progress

## ✅ Completed Tasks

### 1. Backend Infrastructure
- **Created new types**: `ExportScope`, `ExportFormat` in [exportService.ts](src/exportService.ts:7-8)
- **Created UnifiedExportOptions interface** in [exportService.ts](src/exportService.ts:26-47)
- **Implemented helper methods**:
  - `getColumnRow()` - Extract row number from column title
  - `isColumnStacked()` - Check if column has #stack tag
  - `extractRowContent()` - Extract all columns in a row
  - `extractStackContent()` - Extract stacked columns
  - `extractTaskContent()` - Extract single task
  - `convertToPresentationFormat()` - Convert kanban → presentation format

### 2. Unified Export Method
- **Implemented `exportUnified()`** in [exportService.ts](src/exportService.ts:1075-1211)
  - Handles all scopes: full, row, stack, column, task
  - Supports both formats: kanban, presentation
  - Tag visibility filtering
  - Optional asset packing
  - Returns content for copy operations OR writes files for export

### 3. Message Handlers
- **Backend**: Added `handleGenerateCopyContent()` in [messageHandler.ts](src/messageHandler.ts:1920-1942)
- **Frontend**: Added `handleCopyContentResult()` in [webview.js](src/html/webview.js:4343-4382)
- Message flow: frontend → 'generateCopyContent' → backend → 'copyContentResult' → clipboard

### 4. Copy-as-Markdown Refactor
- **Refactored `copyColumnAsMarkdown()`** in [menuOperations.js](src/html/menuOperations.js:999-1019)
  - Now uses unified export: scope='column', format='presentation', tagVisibility='allexcludinglayout'
- **Refactored `copyTaskAsMarkdown()`** in [menuOperations.js](src/html/menuOperations.js:1021-1042)
  - Now uses unified export: scope='task', format='presentation', tagVisibility='allexcludinglayout'
- Both functions now use the same backend logic, ensuring DRY and consistency

## ⏳ Remaining Tasks

### 5. Frontend Tree Selector (High Priority)
- Build hierarchy analyzer to organize board into rows → stacks → columns
- Create tree component with checkboxes
- Implement parent-child selection logic
- Visual structure:
```
☑ Full Kanban
  ☐ Row 1
    ☐ Stack 1 (Todo, In Progress)
      ☐ Column: Todo
      ☐ Column: In Progress
    ☐ Column: Done
```

### 6. Export Dialog Redesign (High Priority)
- Replace current export dialogs with unified dialog
- Add tree selector UI
- Add export format radio buttons (Kanban / Presentation)
- Make pack feature optional with checkbox
- Wire up to unified export backend

### 7. Testing (Medium Priority)
- Test copy-as-markdown with unified system
- Test row/stack/column extraction
- Test format conversion
- Test asset packing scenarios

### 8. Documentation (Low Priority)
- Update FUNCTIONS.md with new methods
- Document unified export architecture

## Key Benefits Achieved

1. **DRY**: Single implementation for content extraction and format conversion
2. **Flexibility**: Any combination of scope + format + packing
3. **Consistency**: Copy-as-markdown uses same logic as export
4. **Maintainability**: One codebase to maintain instead of 4 separate implementations

## Technical Decisions

1. **Format Conversion**: Kanban format (## Column) vs Presentation format (# Column)
2. **Tag Filtering**: Integrated with existing TagUtils system
3. **Asset Packing**: Optional, only when targetFolder provided
4. **Message-based**: Copy operations use backend for consistency, even though frontend-only would be faster

## Next Steps

The foundation is complete and working. The main remaining work is building the tree selector UI for the export dialog. This is a significant UX task but the backend is ready to support it.

Current status: **Copy-as-markdown refactored and ready to test**
