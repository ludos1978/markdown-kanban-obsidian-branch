# YAML Frontmatter Export Fix Plan

## Problem
When exporting as markdown-kanban format (or keeping format), the exported file should include the YAML frontmatter:
```yaml
---

kanban-plugin: board

---
```

## Analysis Needed

### 1. Identify Export Scenarios
Need to check which export options should include YAML:

**Format Options**:
- `format: 'keep'` - Keep original format → Should include YAML if source is kanban
- `format: 'kanban'` - Convert to kanban → Should ALWAYS include YAML
- `format: 'presentation'` - Convert to presentation → Should NOT include YAML

**When to Add YAML**:
- ✅ Export with `format: 'kanban'` (converting TO kanban)
- ✅ Export with `format: 'keep'` AND source is kanban format
- ❌ Export with `format: 'presentation'`

### 2. Find Where YAML is Handled

Key locations to check:
1. `exportService.ts` - Main export logic
2. `FormatConverter.ts` - Format conversion utilities
3. `markdownParser.ts` - `generateMarkdown()` method
4. Any other export methods

### 3. Current Behavior

Need to verify:
- Does `MarkdownKanbanParser.generateMarkdown()` include YAML?
- Does `exportUnified()` preserve/add YAML?
- Does `processMarkdownFile()` handle YAML?
- Does tag filtering strip YAML?

## Implementation Plan

1. Search for all export entry points
2. Check if YAML is preserved/added
3. Identify where YAML is missing
4. Add logic to ensure YAML is included when exporting to kanban format
5. Test all export scenarios

## Expected Behavior After Fix

### Scenario 1: Export kanban file with "keep format"
**Input**: File with YAML header
**Output**: Should preserve YAML header

### Scenario 2: Export kanban file with "save as kanban"
**Input**: File with YAML header
**Output**: Should preserve YAML header

### Scenario 3: Export presentation file with "convert to kanban"
**Input**: Presentation file (no YAML)
**Output**: Should ADD YAML header

### Scenario 4: Export with merge includes to kanban
**Input**: Kanban file with includes
**Output**: Should have YAML header

### Scenario 5: Export to presentation
**Input**: Kanban file
**Output**: Should NOT have YAML header (presentation format doesn't use it)
