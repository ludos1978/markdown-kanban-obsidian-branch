# URL Decoding Analysis - Can We Unify?

## Current Situation

**11 places** use `decodeURIComponent()` across the codebase.

## Breakdown by Pattern

### Pattern 1: Path Normalization Before Resolution (7 occurrences)

These all follow the same pattern: decode → resolve → use

1. **PathResolver.ts:27** - `PathResolver.resolve()`
   ```typescript
   const decoded = decodeURIComponent(relativePath);
   // Then resolves the path
   ```

2. **IncludeProcessor.ts:106** - Loading includes
   ```typescript
   const decodedPath = decodeURIComponent(m.filename);
   const resolvedPath = PathResolver.resolve(basePath, decodedPath);
   ```

3. **IncludeProcessor.ts:246** - Collecting includes
   ```typescript
   const decodedPath = decodeURIComponent(filename);
   const resolvedPath = PathResolver.resolve(basePath, decodedPath);
   ```

4. **AssetHandler.ts:76** - Processing assets
   ```typescript
   const decodedPath = decodeURIComponent(cleanPath);
   const resolvedPath = PathResolver.resolve(basePath, decodedPath);
   ```

5. **exportService.ts:425** - Export includes
   ```typescript
   const decodedIncludePath = decodeURIComponent(includePath);
   const resolvedPath = path.isAbsolute(decodedIncludePath) ? ...
   ```

6. **exportService.ts:635** - Export assets
   ```typescript
   const decodedPath = decodeURIComponent(rawPath);
   const resolvedPath = path.isAbsolute(decodedPath) ? ...
   ```

7. **kanbanWebviewPanel.ts:605** - Normalize include paths
   ```typescript
   const decoded = decodeURIComponent(relativePath);
   return PathResolver.normalize(decoded);
   ```

### Pattern 2: Optional Decoding with Validation (2 occurrences)

These check if decoding is needed and handle errors:

8. **fileSearchService.ts:15** - Search by filename
   ```typescript
   if (fileName.includes('%')) {
       try {
           const decoded = decodeURIComponent(fileName);
           if (decoded !== fileName) {
               // Use decoded
           }
       } catch (error) { }
   }
   ```

9. **fileSearchService.ts:197** - Search by path
   ```typescript
   if (originalPath.includes('%')) {
       try {
           const decoded = decodeURIComponent(originalPath);
           if (decoded !== originalPath) {
               // Use decoded
           }
       } catch (error) { }
   }
   ```

### Pattern 3: Safe Decoding with Fallback (1 occurrence)

10. **fileManager.ts:290** - File manager
    ```typescript
    try {
        decodedHref = decodeURIComponent(href);
    } catch (error) {
        // If decoding fails, use the original href
    }
    ```

### Pattern 4: Test Code (1 occurrence)

11. **PathResolver.test.ts:246** - Unit test
    ```typescript
    const decoded = decodeURIComponent(decodedIncludePath);
    ```

## Analysis

### Can We Unify?

**YES, partially!** Here's the strategy:

#### Option A: Move Decoding Inside PathResolver (RECOMMENDED)

**Rationale**:
- 7 out of 11 usages decode before calling `PathResolver.resolve()`
- PathResolver already decodes on line 27
- **Redundant decoding happening!**

**Change**:
```typescript
// PathResolver.resolve() already does:
const decoded = decodeURIComponent(relativePath);

// So all callers can just do:
PathResolver.resolve(basePath, encodedPath); // No manual decoding needed!
```

**Impact**:
- Remove 6 manual `decodeURIComponent()` calls
- PathResolver handles it internally (already does!)
- Callers don't need to think about encoding

**Files to update**:
- ✅ PathResolver.ts - already decodes internally
- ❌ IncludeProcessor.ts:106 - remove manual decode
- ❌ IncludeProcessor.ts:246 - remove manual decode
- ❌ AssetHandler.ts:76 - remove manual decode
- ❌ exportService.ts:425 - remove manual decode
- ❌ exportService.ts:635 - remove manual decode
- ❌ kanbanWebviewPanel.ts:605 - already uses PathResolver.normalize (which calls resolve)

#### Option B: Create Utility Function for Safe Decoding

For the optional/safe decoding pattern:

```typescript
// In PathResolver or new utility
public static safeDecode(path: string): string {
    if (!path || !path.includes('%')) {
        return path;
    }
    try {
        const decoded = decodeURIComponent(path);
        return decoded !== path ? decoded : path;
    } catch (error) {
        return path; // Fallback to original
    }
}
```

**Impact**:
- Replace 3 manual try/catch blocks
- Consistent error handling

**Files to update**:
- fileSearchService.ts:15
- fileSearchService.ts:197
- fileManager.ts:290

## Current Issue Analysis

### Why `!!!include(./folder%20with%20space/include-1.md)!!!` Doesn't Work

Let me trace the flow:

1. **Markdown contains**: `!!!include(./folder%20with%20space/include-1.md)!!!`
2. **Parser extracts**: `./folder%20with%20space/include-1.md`
3. **PathResolver.normalize()** called (line 605 in kanbanWebviewPanel)
4. **Decodes to**: `./folder with space/include-1.md`
5. **Normalizes to**: `./folder with space/include-1.md`

This **should work** if PathResolver is working correctly. Let me check...

### Potential Issues

1. **PathResolver.normalize() might not decode**
   - It calls `PathResolver.resolve()` which decodes
   - But does it?

2. **Include file registration might use encoded path**
   - When files are discovered, they might be stored with encoded paths
   - Then lookup fails because we're searching with decoded path

3. **File system access might need encoded/decoded path**
   - Windows vs Unix path handling
   - Node.js `fs` expects decoded paths

## Recommendation

### Phase 1: Verify PathResolver Always Decodes

Check that `PathResolver.resolve()` and `PathResolver.normalize()` always decode.

### Phase 2: Remove Redundant Decoding

Remove the 6 manual `decodeURIComponent()` calls that happen before `PathResolver.resolve()`.

### Phase 3: Add Safe Decode Utility

Create `PathResolver.safeDecode()` for the 3 cases that need error handling.

### Phase 4: Test URL-Encoded Paths

Ensure all file operations work with:
- `folder%20with%20space/file.md`
- `./folder%20with%20space/file.md`
- `folder with space/file.md`

## Investigation Needed

Let me check if the issue is:
1. PathResolver not decoding properly?
2. Include file storage using encoded keys?
3. File system access failing with decoded paths?
