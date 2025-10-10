# Test Instructions: Include Path Normalization

## Test File

Open: `tests/kanban-includes.md`

This file contains all 4 test cases for include path normalization.

## Test Setup

The file has a task in the "standard include" column (line 35-43) with 4 include statements:

```markdown
## standard include #stack
- [ ] root/include.md
  !!!include(./root/include-1.md)!!!

  !!!include(root/include-2.md)!!!

  !!!include(./folder%20with%20space/include-1.md)!!!

  !!!include(folder%20with%20space/include-1.md)!!!
```

## Test Cases

### Test Case 1: With ./ Prefix
**Include:** `!!!include(./root/include-1.md)!!!`

**Expected Behavior:**
- ✅ Include file loads and displays content in task
- ✅ Content updates when file changes externally
- ✅ Unsaved changes tracked correctly
- ✅ Auto-reload works when file modified outside VS Code

**How to Test:**
1. Open kanban-includes.md in kanban view
2. Verify task shows content from `./root/include-1.md`
3. Open `tests/root/include-1.md` in another editor
4. Modify the content and save
5. Verify kanban view updates automatically

### Test Case 2: Without ./ Prefix (BUG FIX)
**Include:** `!!!include(root/include-2.md)!!!`

**Expected Behavior:**
- ✅ Include file loads (normalized to `./root/include-2.md`)
- ✅ Content updates when file changes externally (THIS WAS BROKEN)
- ✅ Unsaved changes tracked correctly
- ✅ Auto-reload works when file modified outside VS Code (THIS WAS BROKEN)

**How to Test:**
1. Open kanban-includes.md in kanban view
2. Verify task shows content from `root/include-2.md`
3. Open `tests/root/include-2.md` in another editor
4. Modify the content and save
5. **CRITICAL TEST:** Verify kanban view updates automatically (this was the bug!)

### Test Case 3: URL-Encoded with ./ Prefix
**Include:** `!!!include(./folder%20with%20space/include-1.md)!!!`

**Expected Behavior:**
- ✅ Include file loads (decodes to `./folder with space/include-1.md`)
- ✅ Content updates when file changes externally
- ✅ Unsaved changes tracked correctly
- ✅ Auto-reload works

**How to Test:**
1. Open kanban-includes.md in kanban view
2. Verify task shows content from `folder with space/include-1.md`
3. Open `tests/folder with space/include-1.md` in another editor
4. Modify the content and save
5. Verify kanban view updates automatically

### Test Case 4: URL-Encoded without ./ Prefix (BUG FIX)
**Include:** `!!!include(folder%20with%20space/include-1.md)!!!`

**Expected Behavior:**
- ✅ Include file loads (decodes and normalizes to `./folder with space/include-1.md`)
- ✅ Content updates when file changes externally (THIS WAS BROKEN)
- ✅ Unsaved changes tracked correctly
- ✅ Auto-reload works (THIS WAS BROKEN)

**How to Test:**
1. Open kanban-includes.md in kanban view
2. Verify task shows content from `folder with space/include-1.md`
3. Open `tests/folder with space/include-1.md` in another editor
4. Modify the content and save
5. **CRITICAL TEST:** Verify kanban view updates automatically (this was the bug!)

## Additional Tests

### Test 5: Column Include (line 33)
**Include:** `!!!columninclude(markdown-presentation-b.md)!!!`

**How to Test:**
1. Verify column loads content from presentation file
2. Modify tasks in the column
3. Save the kanban board
4. Verify changes written back to presentation file

### Test 6: Task Include (line 14)
**Include:** `!!!taskinclude(markdown-include-2.md)!!!`

**How to Test:**
1. Verify task loads content from include file
2. Modify task title or description
3. Save the kanban board
4. Verify changes written back to include file

## Success Criteria

### All Test Cases Must Pass:
- [ ] Test Case 1: Include with ./ prefix works
- [ ] Test Case 2: Include without ./ prefix works (BUG FIX)
- [ ] Test Case 3: URL-encoded with ./ prefix works
- [ ] Test Case 4: URL-encoded without ./ prefix works (BUG FIX)
- [ ] Test Case 5: Column include works
- [ ] Test Case 6: Task include works

### Specific Bug Fixes to Verify:
- [ ] Files without ./ prefix auto-reload when changed externally
- [ ] Files with URL encoding load correctly
- [ ] Files with URL encoding AND no ./ prefix work correctly
- [ ] All paths normalize consistently to same format

## Current Include File Contents

**tests/root/include-1.md:**
```
This is include-1 from root folder.

Testing with ./ prefix.
```

**tests/root/include-2.md:**
```
This is include-2 from root folder.

Testing without ./ prefix.
```

**tests/folder with space/include-1.md:**
```
This is include-1 from folder with space.

Testing URL encoding with %20.
```

**tests/folder with space/include-2.md:**
```
This is include-2 from folder with space.

Also testing URL encoding.
```

## Debugging

If tests fail, check:

1. **Browser Console Logs:**
   - Open VS Code Developer Tools (Help > Toggle Developer Tools)
   - Look for `[kanban.*]` tagged log messages
   - Check for path normalization messages

2. **File Watcher:**
   - Verify file watcher is registered for include files
   - Check that file paths in watcher match normalized paths

3. **Map Lookups:**
   - Verify `_includeFiles` Map has correct keys
   - All keys should be normalized with ./ prefix
   - No duplicate entries with different path formats

4. **PathResolver:**
   - Check that PathResolver.normalize() adds ./ prefix
   - Check that decodeURIComponent() decodes %20 to space

## Notes

- The test file already has all 4 include statements set up
- All required include files exist in the test directories
- This tests the exact scenarios that were broken before the fix
- Focus on testing auto-reload for cases 2 and 4 (these were the bugs)

---

**Test File:** tests/kanban-includes.md
**Include Files:**
- tests/root/include-1.md
- tests/root/include-2.md
- tests/folder with space/include-1.md
- tests/folder with space/include-2.md

**Created:** 2025-10-09
**Related:** tmp/include-path-normalization-complete.md
