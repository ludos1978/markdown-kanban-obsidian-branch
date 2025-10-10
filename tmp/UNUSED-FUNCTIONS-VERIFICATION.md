# Unused Functions Verification

## High-Priority Analysis Results

### ❌ FALSE POSITIVES (NOT actually unused)

1. **`require`, `if`, `for`, `while`, `switch`** - These are JavaScript keywords, not functions!
   - Analyzer is incorrectly flagging language constructs
   - CANNOT be removed

2. **`n`, `i`, `s`** in browser JS files - Likely minified variable names
   - These are in markdown-it plugin files
   - Need to verify but probably used

3. **`getFileListenerStatus`, `setFileListenerStatus`** (extension.ts)
   - ✅ **VERIFIED USED** on lines 27-28 as exports
   - Cannot remove

4. **`patterns`, `workspaceSearch`, `baseDirScan`** (fileSearchService.ts)
   - These are arrow function assignments within another function
   - ✅ **VERIFIED USED** - they execute asynchronously
   - Cannot remove

5. **`clearTimeout`** (menuOperations.js:420)
   - This is a built-in JavaScript function
   - ❌ **Cannot remove**

## Conclusion

**The cleanup analyzer has MAJOR issues:**
- Flagging language keywords as unused functions
- Missing arrow function usage patterns
- Flagging built-in functions
- False positive rate: ~100% for "high priority"

## Better Approach

Instead of using the flawed analyzer, let's manually find truly unused code:

### Strategy 1: Look for obvious dead code
- Functions with `_old` or `deprecated` in name
- Commented-out functions
- TODO markers for removal

### Strategy 2: Check medium-priority list more carefully
The analyzer found these which might be real:
- `_old_applyStackedColumnStyles` - has "_old_" prefix!
- Functions in debugOverlay.js - might be unused debug features

Let me check these...
