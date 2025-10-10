# Testing Include Path Resolution

## Test Cases

Given test files exist at:
- `tests/folder with space/include-1.md`
- `tests/folder with space/include-2.md`

## Path Resolution Analysis

### Format 1: `!!!include(./folder%20with%20space/include-1.md)!!!`
**Input to PathResolver**: `./folder%20with%20space/include-1.md`

**PathResolver.resolve() flow**:
1. Check if contains `%` → YES
2. Try `decodeURIComponent('./folder%20with%20space/include-1.md')`
3. Result: `./folder with space/include-1.md` ✅
4. Call `path.resolve(basePath, './folder with space/include-1.md')`
5. Result: `/absolute/path/to/tests/folder with space/include-1.md` ✅
6. Check `fs.existsSync()` → **Should be TRUE** ✅

**Expected**: ✅ Should work

---

### Format 2: `!!!include(folder%20with%20space/include-2.md)!!!`
**Input to PathResolver**: `folder%20with%20space/include-2.md`

**PathResolver.resolve() flow**:
1. Check if contains `%` → YES
2. Try `decodeURIComponent('folder%20with%20space/include-2.md')`
3. Result: `folder with space/include-2.md` ✅
4. Call `path.resolve(basePath, 'folder with space/include-2.md')`
5. Result: `/absolute/path/to/tests/folder with space/include-2.md` ✅
6. Check `fs.existsSync()` → **Should be TRUE** ✅

**Expected**: ✅ Should work

---

### Format 3: `!!!include(./folder with space/include-1.md)!!!`
**Input to PathResolver**: `./folder with space/include-1.md`

**PathResolver.resolve() flow**:
1. Check if contains `%` → NO
2. Skip decoding (already decoded)
3. Use as-is: `./folder with space/include-1.md` ✅
4. Call `path.resolve(basePath, './folder with space/include-1.md')`
5. Result: `/absolute/path/to/tests/folder with space/include-1.md` ✅
6. Check `fs.existsSync()` → **Should be TRUE** ✅

**Expected**: ✅ Should work

---

### Format 4: `!!!include(folder with space/include-2.md)!!!`
**Input to PathResolver**: `folder with space/include-2.md`

**PathResolver.resolve() flow**:
1. Check if contains `%` → NO
2. Skip decoding (already decoded)
3. Use as-is: `folder with space/include-2.md` ✅
4. Call `path.resolve(basePath, 'folder with space/include-2.md')`
5. Result: `/absolute/path/to/tests/folder with space/include-2.md` ✅
6. Check `fs.existsSync()` → **Should be TRUE** ✅

**Expected**: ✅ Should work

---

## Conclusion

**All 4 formats should work** with the current PathResolver implementation!

If they're not working, the issue is likely:

1. **Frontend display issue** - Files load but don't display
2. **Path normalization issue** - Include file map lookup fails
3. **Cache issue** - Old state cached
4. **Different basePath** - Files exist but basePath is wrong

## Next Steps

1. Check browser console for errors
2. Check VS Code output panel for backend errors
3. Verify basePath is correct (should be `tests/` folder)
4. Check if `_normalizeIncludePath()` in kanbanWebviewPanel is working

## Debugging Commands

In browser console:
```javascript
// Check if include files are in the map
console.log(window._includeFiles); // If this exists

// Check PathResolver
PathResolver.resolve('/path/to/tests', './folder%20with%20space/include-1.md');
PathResolver.resolve('/path/to/tests', './folder with space/include-1.md');
```

In VS Code, check Output panel → "Kanban" channel for:
```
[kanban.IncludeProcessor] Processing include: ./folder with space/include-1.md
[kanban.IncludeProcessor] Resolved path: /absolute/path/...
[kanban.IncludeProcessor] File exists: true/false
```
