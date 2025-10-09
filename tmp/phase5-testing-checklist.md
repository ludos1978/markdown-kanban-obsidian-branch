# Phase 5: Testing & Migration Checklist

## Overview

This checklist guides the testing and migration of the unified architecture before deprecating old code.

---

## Part 1: Phase 3 Testing (Save Operations)

### PathResolver Integration Testing

**Test: Include File Path Resolution**
- [ ] Load a kanban file with `!!!include(./path/file.md)!!!`
- [ ] Load a kanban file with `!!!include(path/file.md)!!!` (no ./)
- [ ] Load a kanban file with URL-encoded paths
- [ ] Verify all paths resolve correctly
- [ ] Check that files are loaded properly

**Test: Column Include Paths**
- [ ] Create column with `!!!columninclude(./slides.md)!!!`
- [ ] Edit column content
- [ ] Save changes
- [ ] Verify file is written correctly
- [ ] Check path resolution in logs

**Test: Task Include Paths**
- [ ] Create task with `!!!taskinclude(./content.md)!!!`
- [ ] Edit task content
- [ ] Save changes
- [ ] Verify file is written correctly
- [ ] Check path resolution in logs

### FileWriter Integration Testing

**Test: Column Include File Write**
- [ ] Modify a column with columninclude
- [ ] Trigger save (Cmd/Ctrl+S or auto-save)
- [ ] Verify file is written correctly
- [ ] Check file contents match
- [ ] Verify no error notifications
- [ ] Check console for errors

**Test: Task Include File Write**
- [ ] Modify a task with taskinclude
- [ ] Trigger save
- [ ] Verify file is written correctly
- [ ] Check file contents match
- [ ] Verify no error notifications

**Test: Generic File Write**
- [ ] Trigger generic file content write operation
- [ ] Verify async/await works correctly
- [ ] Check error handling

### Edge Cases

**Test: Missing Directories**
- [ ] Create include with path that needs directory creation
- [ ] Verify FileWriter creates directories
- [ ] Check file is written successfully

**Test: Special Characters in Paths**
- [ ] Test paths with spaces
- [ ] Test paths with special characters
- [ ] Test URL-encoded paths
- [ ] Verify PathResolver handles all cases

**Test: Backup Integration**
- [ ] Verify backups still work with new FileWriter
- [ ] Check backup files are created
- [ ] Verify BackupManager integration intact

---

## Part 2: Phase 4 Testing (Export Operations)

### Export Scopes Testing

**Test: Full Board Export**
- [ ] Open a kanban board
- [ ] Export full board (packAssets: false)
- [ ] Export full board (packAssets: true)
- [ ] Compare old vs new export results
- [ ] Verify content matches

**Test: Row Export**
- [ ] Select a row
- [ ] Export row (old method)
- [ ] Export row (new method with exportUnifiedV2)
- [ ] Compare results
- [ ] Verify row number in filename

**Test: Stack Export**
- [ ] Select a stacked column
- [ ] Export stack (old method)
- [ ] Export stack (new method)
- [ ] Compare results
- [ ] Verify includes all columns in stack

**Test: Column Export**
- [ ] Select a single column
- [ ] Export column (old method)
- [ ] Export column (new method)
- [ ] Compare results
- [ ] Verify column content

**Test: Task Export**
- [ ] Select a single task
- [ ] Export task (old method)
- [ ] Export task (new method)
- [ ] Compare results
- [ ] Verify task content

### Format Conversion Testing

**Test: Keep Format (No Conversion)**
- [ ] Export kanban board as kanban
- [ ] Verify format unchanged
- [ ] Check YAML frontmatter preserved

**Test: Kanban to Presentation**
- [ ] Export kanban board as presentation
- [ ] Verify slide separators (---)
- [ ] Check column titles as slides
- [ ] Verify tasks converted to slides
- [ ] Compare with old export

**Test: Presentation to Kanban** (if applicable)
- [ ] Export presentation as kanban
- [ ] Verify task checkboxes
- [ ] Check column headers (##)
- [ ] Compare with old export

### Include Processing Testing

**Test: Merge Includes**
- [ ] Export with mergeIncludes: true
- [ ] Verify single output file
- [ ] Check include content embedded
- [ ] Verify no separate include files created

**Test: Separate Includes**
- [ ] Export with mergeIncludes: false
- [ ] Verify separate include files created
- [ ] Check include markers preserved
- [ ] Verify main file references includes

**Test: Include Types**
- [ ] Export with `!!!include()!!!` markers
- [ ] Export with `!!!columninclude()!!!` markers
- [ ] Export with `!!!taskinclude()!!!` markers
- [ ] Verify all types processed correctly

**Test: Nested Includes**
- [ ] Create nested include structure
- [ ] Export with resolveNested: true
- [ ] Verify nested includes processed
- [ ] Check depth limit respected (maxDepth: 10)

**Test: Circular Includes**
- [ ] Create circular include reference
- [ ] Export
- [ ] Verify circular reference detected
- [ ] Check error handling

### Asset Handling Testing

**Test: No Asset Packing**
- [ ] Export with packAssets: false
- [ ] Verify no assets copied
- [ ] Check asset references unchanged

**Test: Asset Copying**
- [ ] Export with packAssets: true
- [ ] Verify images copied to export folder
- [ ] Verify videos copied (if enabled)
- [ ] Check asset references updated
- [ ] Verify MD5 deduplication works

**Test: Asset Types**
- [ ] Test image assets (.png, .jpg, .gif)
- [ ] Test video assets (.mp4, .webm)
- [ ] Test audio assets (.mp3, .wav)
- [ ] Test document assets (.pdf)
- [ ] Verify each type handled correctly

**Test: Missing Assets**
- [ ] Export with missing asset reference
- [ ] Verify error handling
- [ ] Check warning messages
- [ ] Verify export continues

**Test: Large Assets**
- [ ] Export with asset over size limit
- [ ] Verify size limit respected
- [ ] Check exclusion notification

### Tag Visibility Testing

**Test: All Tags Visible**
- [ ] Export with tagVisibility: 'all'
- [ ] Verify all tags present in output
- [ ] Compare with old export

**Test: Hidden Tags**
- [ ] Export with some tags hidden
- [ ] Verify hidden tags removed
- [ ] Check visible tags retained

**Test: All Tags Hidden**
- [ ] Export with all tags hidden
- [ ] Verify no tags in output
- [ ] Check content otherwise intact

### Filename Generation Testing

**Test: Scope Suffixes**
- [ ] Export row → verify `filename-row0.md`
- [ ] Export stack → verify `filename-row0-stack1.md`
- [ ] Export column → verify `filename-col2.md`
- [ ] Check index numbering correct

**Test: Special Characters**
- [ ] Export file with special chars in name
- [ ] Verify filename sanitization
- [ ] Check file can be opened

### Error Handling Testing

**Test: Missing Source File**
- [ ] Attempt export of non-existent file
- [ ] Verify error message
- [ ] Check graceful failure

**Test: Read-Only Target Folder**
- [ ] Export to read-only folder
- [ ] Verify error handling
- [ ] Check error notification

**Test: Disk Space**
- [ ] Simulate low disk space (if possible)
- [ ] Verify error handling
- [ ] Check partial writes cleaned up

**Test: Invalid Options**
- [ ] Test with missing required options
- [ ] Test with invalid scope
- [ ] Verify validation errors

---

## Part 3: Comparison Testing (Old vs New)

### Side-by-Side Export Comparison

For each test case, compare results:

**Content Comparison:**
- [ ] Main file content identical
- [ ] Include file content identical
- [ ] Asset files identical
- [ ] Line endings consistent
- [ ] Whitespace consistent

**File Structure:**
- [ ] Same number of files created
- [ ] Same file names (or expected differences)
- [ ] Same directory structure

**Metadata:**
- [ ] YAML frontmatter preserved
- [ ] Timestamps reasonable
- [ ] File sizes comparable

**Performance:**
- [ ] Export time comparable
- [ ] Memory usage acceptable
- [ ] No performance regressions

### Regression Testing

**Test: Existing Features**
- [ ] All old export features still work
- [ ] No functionality lost
- [ ] No new bugs introduced

**Test: Edge Cases**
- [ ] Empty boards
- [ ] Very large boards
- [ ] Unicode content
- [ ] Special markdown syntax

---

## Part 4: Integration Testing

### VS Code Integration

**Test: Extension Commands**
- [ ] Verify export commands still work
- [ ] Check command palette entries
- [ ] Test keyboard shortcuts

**Test: Notifications**
- [ ] Success notifications appear
- [ ] Error notifications appear
- [ ] Progress indicators work (if any)

**Test: File System**
- [ ] Files appear in VS Code explorer
- [ ] Can open exported files in VS Code
- [ ] File watchers work correctly

### Message Handler Integration

**Test: Webview Communication**
- [ ] Export triggered from webview works
- [ ] Results sent back to webview
- [ ] Error messages displayed in UI

---

## Part 5: Migration Preparation

### Find All Callers

**Search for:**
```bash
# Find all calls to old export method
grep -r "exportUnified" src/ --include="*.ts" --include="*.js"

# Exclude the new method
grep -r "exportUnified[^V]" src/ --include="*.ts" --include="*.js"
```

**Document:**
- [ ] List all files calling exportUnified()
- [ ] Note context of each call
- [ ] Plan migration order

### Create Migration Script

**Prepare:**
- [ ] Document API differences
- [ ] Create migration examples
- [ ] Write helper functions if needed

---

## Part 6: Performance Testing

### Benchmarks

**Test: Small Export**
- [ ] Export small board (<10 tasks)
- [ ] Measure time (old method)
- [ ] Measure time (new method)
- [ ] Compare performance

**Test: Medium Export**
- [ ] Export medium board (10-100 tasks)
- [ ] Measure time (old method)
- [ ] Measure time (new method)
- [ ] Compare performance

**Test: Large Export**
- [ ] Export large board (100+ tasks)
- [ ] Measure time (old method)
- [ ] Measure time (new method)
- [ ] Compare performance

**Test: With Assets**
- [ ] Export with many assets
- [ ] Measure time and memory
- [ ] Check for memory leaks

---

## Part 7: Documentation Testing

### Verify Documentation

**Check:**
- [ ] All service methods documented
- [ ] Examples are accurate
- [ ] Migration guide clear
- [ ] No broken links

---

## Test Results Template

```markdown
## Test Results: [Test Name]

**Date:** YYYY-MM-DD
**Tester:** [Name]

### Old Export (exportUnified)
- Result: ✅/❌
- Time: XX ms
- Files created: X
- Notes: ...

### New Export (exportUnifiedV2)
- Result: ✅/✅
- Time: XX ms
- Files created: X
- Notes: ...

### Comparison
- Content match: ✅/❌
- Performance: Better/Same/Worse
- Issues found: ...

### Conclusion
[Pass/Fail/Needs work]
```

---

## Sign-Off Checklist

Before proceeding to deprecation:

- [ ] All Phase 3 tests pass
- [ ] All Phase 4 tests pass
- [ ] No regressions found
- [ ] Performance acceptable
- [ ] Documentation complete
- [ ] Migration plan ready
- [ ] Rollback plan documented
- [ ] Team/user approval obtained

---

## Notes

- Test in development environment first
- Keep detailed logs of all tests
- Document any differences between old/new
- If tests fail, fix issues before proceeding
- Consider beta testing with users

---

**Status:** ⏸️ Not Started
**Priority:** High
**Estimated Time:** 4-6 hours
**Required Before:** Phase 5 deprecation
