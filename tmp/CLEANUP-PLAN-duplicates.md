# Code Cleanup Plan - Duplicate & Similar Functions

## High-Priority Duplicates Found

### 1. Configuration Getters (14 functions) - EASY WIN 🎯

**Current Code** (lines 1093-1209):
```typescript
private async _getTagConfiguration(): Promise<any> {
    return configService.getConfig('tagColors', {});
}

private async _getWhitespaceConfiguration(): Promise<string> {
    return configService.getConfig('whitespace', '8px');
}

private async _getTaskMinHeightConfiguration(): Promise<string> {
    return configService.getConfig('taskMinHeight');
}

// ... 11 more identical patterns!
```

**Problem**: 14 nearly-identical wrapper functions (~100+ lines total)

**Solution**: Replace with a single generic method or use `configService.getConfig()` directly

**Estimated savings**: ~100 lines

**Risk**: LOW - Simple refactor, easy to test

---

### 2. File I/O Operations (20+ instances)

**Patterns found**:
- `fs.existsSync()`: 11 occurrences
- `fs.readFileSync()`: 9 occurrences
- Similar try-catch error handling around file operations

**Problem**: Duplicate file existence checks and read operations

**Possible Solution**:
- Create `FileReader` service (similar to `FileWriter`)
- Add `safeReadFile()` method with error handling
- Add `fileExists()` wrapper for consistency

**Estimated savings**: ~50-80 lines

**Risk**: MEDIUM - Need to ensure error handling is preserved

---

### 3. Try-Catch Blocks (39 instances)

**Pattern**:
```typescript
try {
    // operation
} catch (error) {
    console.error('[TAG] Error message:', error);
    // sometimes: vscode.window.showErrorMessage()
    // sometimes: return false/null
}
```

**Problem**: Similar error handling repeated everywhere

**Possible Solution**:
- Create error handling utility functions
- `withErrorHandling<T>(operation: () => T, context: string): T | null`
- `withAsyncErrorHandling<T>(operation: () => Promise<T>, context: string): Promise<T | null>`

**Estimated savings**: ~100-150 lines

**Risk**: MEDIUM-HIGH - Must preserve specific error behaviors

---

### 4. Include File Lookups (Partially Fixed) ✅

**Status**: Already improved with helper methods in recent refactor!
- `_normalizeIncludePath()`
- `_findIncludeFile()`
- `_isSameIncludePath()`

**Remaining**: Check if more locations can use these helpers

---

### 5. Similar Save/Load Functions

Looking at function names, possible duplicates:
- `saveColumnIncludeChanges()`
- `saveTaskIncludeChanges()`
- `saveAllColumnIncludeChanges()`
- `saveAllTaskIncludeChanges()`

**Need to investigate**: Are these doing similar operations that could share code?

---

## Proposed Implementation Order

### Phase 1: Configuration Getters (QUICK WIN)
- **Effort**: 30 minutes
- **Risk**: LOW
- **Impact**: Remove ~100 lines, improve maintainability

**Option A** - Direct replacement:
```typescript
// Replace all _get*Configuration() calls with direct configService.getConfig() calls
```

**Option B** - Single generic method:
```typescript
private _getConfig<T>(key: string, defaultValue?: T): T {
    return configService.getConfig(key, defaultValue);
}
```

### Phase 2: File I/O Service
- **Effort**: 1-2 hours
- **Risk**: MEDIUM
- **Impact**: Remove ~50-80 lines, consolidate file operations

Create `FileReader` service similar to `FileWriter`:
```typescript
export class FileReader {
    static async readFile(filePath: string): Promise<string | null> {
        // Unified read with error handling
    }

    static fileExists(filePath: string): boolean {
        // Wrapped fs.existsSync with error handling
    }
}
```

### Phase 3: Error Handling Utilities
- **Effort**: 2-3 hours
- **Risk**: MEDIUM-HIGH
- **Impact**: Remove ~100-150 lines, consistent error handling

**Only if needed** - analyze if error handling is consistent enough to abstract

---

## Questions Before Proceeding

1. **Configuration getters**: Should I remove them entirely and use `configService.getConfig()` directly, or create a single generic wrapper?

2. **File I/O**: Should I create a `FileReader` service to match `FileWriter`?

3. **Error handling**: Should we standardize error handling or leave it as-is (each try-catch might have specific needs)?

4. **Save functions**: Should I investigate the save/load functions for possible consolidation?

---

## Immediate Recommendation

**Start with Phase 1 (Configuration Getters)** because:
- ✅ Quick win (30 minutes)
- ✅ Low risk
- ✅ Clear improvement (~100 lines removed)
- ✅ Easy to test
- ✅ Sets good precedent for other cleanups

**Your approval needed** - Should I proceed with Phase 1?
