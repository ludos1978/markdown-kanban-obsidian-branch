# Quick Start Guide: Phase 5

**Current Status:** ✅ Implementation complete, ready for Phase 5
**Branch:** unified-export
**Last Updated:** 2025-10-09

---

## What is Phase 5?

Phase 5 completes the unified architecture refactoring by:
1. Testing the new implementation
2. Migrating callers to use new methods
3. Deprecating old code
4. Removing deprecated code (~750 lines)

---

## Before You Start

### Check Current State
```bash
# Verify you're on the right branch
git branch
# Should show: * unified-export

# Check compilation status
npm run check-types
# Should show: No errors

# Review what's been done
git log --oneline -6
```

### Read Key Documents
1. **PROJECT-STATUS.md** - Overall project status
2. **unified-architecture-final-summary.md** - Complete summary
3. **phase5-testing-checklist.md** - Detailed test plan

---

## Phase 5 Quick Path

### Option A: Full Testing (Recommended)

**Time Required:** 4-6 hours

**Steps:**
1. Open `phase5-testing-checklist.md`
2. Execute Part 1: Phase 3 Testing (Save Operations)
3. Execute Part 2: Phase 4 Testing (Export Operations)
4. Execute Part 3: Comparison Testing
5. Document results
6. Fix any issues found
7. Proceed with migration

**Why?** Ensures everything works before removing old code

### Option B: Quick Validation

**Time Required:** 1-2 hours

**Steps:**
1. Test basic save operation with includes
2. Test basic export operation with exportUnifiedV2
3. Compare one old vs new export
4. If passes, proceed with migration

**Why?** Faster, but higher risk

### Option C: Migration First (Riskiest)

**Time Required:** 3-4 hours

**Steps:**
1. Find all exportUnified() callers
2. Switch to exportUnifiedV2()
3. Test as you go
4. Fix issues immediately
5. Complete migration

**Why?** Fastest total time if no issues, but no validation first

---

## Step-by-Step: Testing Path

### Step 1: Test Phase 3 (Save Operations)

**What to test:** Include file path resolution and writing

**Quick test:**
```bash
# 1. Open a kanban file with includes
# 2. Edit an include file content
# 3. Save (Cmd/Ctrl+S)
# 4. Check the include file was written correctly
# 5. Check console for errors
```

**Pass criteria:**
- ✅ File written successfully
- ✅ No errors in console
- ✅ Content matches what was edited

### Step 2: Test Phase 4 (Export Operations)

**What to test:** New export method

**Quick test:**
```bash
# 1. Open messageHandler.ts
# 2. Find where exportUnified is called
# 3. Temporarily change to exportUnifiedV2
# 4. Try export operation from UI
# 5. Verify files created
# 6. Compare with old export result
```

**Pass criteria:**
- ✅ Export completes successfully
- ✅ Files created correctly
- ✅ Content matches old export

### Step 3: Compare Results

**Quick comparison:**
```bash
# 1. Export using old method → save to folder A
# 2. Export using new method → save to folder B
# 3. Run: diff -r folderA folderB
# 4. Review differences (should be minimal/none)
```

### Step 4: Document Results

**Create:** `tmp/phase5-test-results.md`

```markdown
# Phase 5 Test Results

## Phase 3 Tests (Save)
- Include file writes: ✅/❌
- Path resolution: ✅/❌
- Issues found: ...

## Phase 4 Tests (Export)
- Full export: ✅/❌
- Row export: ✅/❌
- Format conversion: ✅/❌
- Include processing: ✅/❌
- Asset handling: ✅/❌
- Issues found: ...

## Comparison
- Old vs new match: ✅/❌
- Performance: Same/Better/Worse

## Conclusion
Ready for migration: YES/NO
```

---

## Step-by-Step: Migration Path

### Step 1: Find All Callers

```bash
# Find exportUnified calls
grep -rn "exportUnified[^V]" src/ --include="*.ts" --include="*.js"

# Common locations:
# - src/messageHandler.ts
# - src/html/webview.js
# - Any command handlers
```

**Document findings:**
```markdown
## Callers Found

1. File: src/messageHandler.ts
   Line: 123
   Context: Export command handler

2. File: src/html/webview.js
   Line: 456
   Context: Export button click
```

### Step 2: Migrate First Caller

**Example migration:**
```typescript
// OLD:
const result = await ExportService.exportUnified(document, options);

// NEW:
const result = await ExportService.exportUnifiedV2(document, options);
```

**Test migration:**
1. Make change
2. Compile: `npm run check-types`
3. Test functionality manually
4. Verify no regressions
5. Commit: `git commit -m "Migrate [caller] to exportUnifiedV2"`

### Step 3: Migrate Remaining Callers

Repeat Step 2 for each caller found.

**Strategy:**
- One caller at a time
- Test after each migration
- Commit after each success
- Easy to rollback if issues

### Step 4: Verify All Migrations

```bash
# Should find no results:
grep -rn "exportUnified[^V]" src/ --include="*.ts" --include="*.js"

# Except in exportService.ts itself
```

---

## Step-by-Step: Deprecation Path

### Step 1: Mark Methods as Deprecated

**In exportService.ts:**
```typescript
/**
 * @deprecated Use exportUnifiedV2() instead. Will be removed in v0.16.0
 *
 * This method will be removed in a future version. Please migrate to
 * exportUnifiedV2() which uses the new ContentPipelineService architecture.
 *
 * Migration guide: See tmp/phase5-migration-guide.md
 */
public static async exportUnified(...) {
    // existing code
}
```

### Step 2: Add Console Warnings

```typescript
public static async exportUnified(...) {
    console.warn('[DEPRECATED] exportUnified() is deprecated. Use exportUnifiedV2() instead.');
    // existing code
}
```

### Step 3: Update Documentation

Create `tmp/phase5-migration-guide.md`:
```markdown
# Migration Guide: exportUnified → exportUnifiedV2

## What Changed
- New method uses ContentPipelineService
- Same API signature
- Better error handling
- More consistent results

## How to Migrate
Simply replace:
  ExportService.exportUnified(document, options)
With:
  ExportService.exportUnifiedV2(document, options)

## Breaking Changes
None - API is identical
```

### Step 4: Plan Removal Timeline

**Suggested:**
- Version 0.15.0: Mark deprecated (Phase 5)
- Version 0.15.x: Keep both methods
- Version 0.16.0: Remove old methods

---

## Step-by-Step: Cleanup Path

### Step 1: Remove Old Methods

**In exportService.ts, remove:**
- `processMarkdownContent()` (~200 lines)
- `processIncludedFiles()` (~150 lines)
- `findAssets()` (~100 lines)
- `copyAssetsToExportFolder()` (~150 lines)
- `convertToPresentationFormat()` (~100 lines)
- Old `exportUnified()` (~170 lines)
- Other unused helper methods

**Expected removal:** ~750-900 lines

### Step 2: Clean Up Imports

Remove any imports that are no longer needed after deletions.

### Step 3: Final Compilation Check

```bash
npm run check-types
# Should still compile with no errors
```

### Step 4: Final Testing

Run full test suite again to verify nothing broke.

---

## Quick Commands Reference

### Testing
```bash
# Type checking
npm run check-types

# Run tests (if Jest configured)
npm test

# Manual testing
# Open VS Code extension, test features
```

### Git Operations
```bash
# Check status
git status

# View changes
git diff

# Commit changes
git add [files]
git commit -m "Phase 5: [description]"

# View history
git log --oneline

# Compare with main
git diff main...unified-export
```

### Search Operations
```bash
# Find exportUnified calls
grep -rn "exportUnified" src/

# Find PathResolver usage
grep -rn "PathResolver" src/

# Find FileWriter usage
grep -rn "FileWriter" src/
```

---

## Troubleshooting

### Issue: Tests Fail

**Solution:**
1. Check console for errors
2. Review phase5-testing-checklist.md
3. Compare old vs new results
4. Fix issues before proceeding

### Issue: Compilation Errors

**Solution:**
1. Run `npm run check-types`
2. Read error messages
3. Fix type issues
4. Re-compile

### Issue: Export Produces Different Results

**Solution:**
1. Use `diff` to compare outputs
2. Check if differences are acceptable
3. Debug ContentPipelineService
4. May need to adjust options mapping

### Issue: Performance Regression

**Solution:**
1. Profile old vs new methods
2. Identify bottleneck
3. Optimize services if needed
4. Consider caching

---

## Rollback Plan

If issues arise during Phase 5:

### Quick Rollback
```bash
# Undo uncommitted changes
git restore [file]

# Undo last commit
git reset --soft HEAD~1

# Return to specific commit
git reset --hard [commit-hash]
```

### Full Rollback to Phase 4
```bash
# Return to Phase 4 state
git reset --hard 4545169

# Keep all Phase 1-4 work
# Discard Phase 5 attempts
```

### Complete Rollback
```bash
# Abandon unified-export branch
git checkout main

# Branch remains for future attempts
```

---

## Success Criteria

Phase 5 is complete when:

- ✅ All tests pass
- ✅ All callers migrated
- ✅ Old code removed
- ✅ Documentation updated
- ✅ No regressions
- ✅ Performance acceptable
- ✅ Ready to merge to main

---

## Final Checklist

Before merging to main:

- [ ] All tests completed successfully
- [ ] All exportUnified() callers migrated
- [ ] Old export methods removed (~750 lines)
- [ ] Compilation successful
- [ ] No TypeScript errors
- [ ] Documentation updated
- [ ] Migration guide created
- [ ] CHANGELOG.md updated
- [ ] README.md updated (if needed)
- [ ] Team/users notified of changes
- [ ] Ready for merge

---

## Get Help

**Documentation:**
- PROJECT-STATUS.md - Project overview
- unified-architecture-final-summary.md - Complete details
- phase5-testing-checklist.md - Full test plan

**Code:**
- src/services/ - All new services
- src/exportService.ts - New export method (line 1514)
- src/kanbanWebviewPanel.ts - Phase 3 changes

---

**Ready to start?** Begin with the testing checklist!

**Questions?** Review PROJECT-STATUS.md for answers.

**Stuck?** Rollback plan is available above.

---

**Good luck with Phase 5! 🚀**
