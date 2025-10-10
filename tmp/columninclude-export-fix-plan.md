# ColumnInclude Export Fix Plan

## Problem
When exporting a kanban with `columninclude` markers, the export doesn't handle the column title correctly.

### Current Behavior
Input:
```markdown
## My Custom Title !!!columninclude(./path/to/file.md)!!! #stack #tag
```

Current export replaces only the marker, resulting in:
```markdown
## My Custom Title ## File First Slide Title #stack #tag
- [ ] task1
- [ ] task2
```
**Issue**: Two column headers (`##`), incorrect title structure.

### Expected Behavior
Input:
```markdown
## My Custom Title !!!columninclude(./path/to/file.md)!!! #stack #tag
```

Expected export:
```markdown
## My Custom Title file.md #stack #tag
- [ ] task1
- [ ] task2
```

**Requirements**:
1. Keep the prefix title ("My Custom Title")
2. Strip the `!!!columninclude(...)!!!` marker
3. Add the filename without path ("file.md")
4. Preserve tags after the marker ("#stack #tag")
5. Content comes from the included file (tasks only, no column header)

## Root Cause Analysis

### Current Code Flow
1. `COLUMN_INCLUDE_PATTERN = /!!!columninclude\s*\(([^)]+)\)\s*!!!/g` - matches ONLY the marker
2. `processIncludedFiles()` replaces the marker with converted content
3. `convertPresentationToKanban()` for columninclude generates:
   ```
   ## {FirstSlideTitle}
   - [ ] task1
   - [ ] task2
   ```
4. Replacement puts this where the marker was, leaving original `##` prefix

### The Fix

#### Step 1: Update COLUMN_INCLUDE_PATTERN
Change from:
```typescript
/!!!columninclude\s*\(([^)]+)\)\s*!!!/g
```

To match the entire column header line:
```typescript
/^##\s+(.*?)!!!columninclude\s*\(([^)]+)\)\s*!!!(.*?)$/gm
```

Captures:
- Group 1: prefix title (everything before the marker)
- Group 2: file path
- Group 3: suffix (tags and other content after marker)

#### Step 2: Update processIncludedFiles Logic
For columninclude pattern:
1. Extract prefix title, file path, and suffix from match groups
2. Get filename without path: `path.basename(filePath)`
3. Process the included file to get content
4. When replacing, construct the new column header:
   ```
   ## {prefixTitle.trim()} {filename} {suffix.trim()}
   {content-without-column-header}
   ```

#### Step 3: Update convertPresentationToKanban
For columninclude conversion:
- **Do NOT include the column header** in the output
- Return ONLY the tasks:
  ```
  - [ ] task1
  - [ ] task2
  ```
- The column header will be reconstructed in `processIncludedFiles`

#### Step 4: Handle Edge Cases
1. Empty prefix title: `## !!!columninclude(file.md)!!!`
   - Result: `## file.md`
2. No suffix: `## Title !!!columninclude(file.md)!!!`
   - Result: `## Title file.md`
3. Multiple tags: `## Title !!!columninclude(file.md)!!! #stack #row2 #other`
   - Result: `## Title file.md #stack #row2 #other`

## Implementation Steps

1. Update `COLUMN_INCLUDE_PATTERN` regex (line ~82)
2. Update pattern config in `includePatterns` array (line ~414)
3. Update `processIncludedFiles` to extract column header parts (line ~440)
4. Update replacement logic to reconstruct column header (line ~561, 577)
5. Update `convertPresentationToKanban` to NOT include column header for columninclude (line ~1243)
6. Test with various edge cases

## Test Cases

1. **Basic case**: `## Title !!!columninclude(./file.md)!!!`
2. **With tags**: `## Title !!!columninclude(./file.md)!!! #stack`
3. **No prefix**: `## !!!columninclude(./file.md)!!!`
4. **Complex path**: `## Title !!!columninclude(./path/to/file.md)!!! #stack #row2`
5. **URL encoded**: `## Title !!!columninclude(./folder%20with%20space/file.md)!!!`
