# Debug: Shift+Meta+V Paste Path Issue

## Flow Analysis

When you paste with Shift+Meta+V:

1. **taskEditor.js:238** - Gets text from clipboard
2. **taskEditor.js:245** - Calls `processClipboardText(text)`
3. **webview.js:822** - Checks `if (isFilePath(text.trim()))`
4. **validationUtils.js:309** - `isFilePath()` checks if it looks like a file path
5. **webview.js:825** - If true, calls `createFileMarkdownLink(filePath)`
6. **webview.js:755** - Calls `escapeFilePath(filePath)`
7. **validationUtils.js:28** - URL-encodes the path
8. **taskEditor.js:246** - Gets `processed.content` (should be encoded)
9. **taskEditor.js:262** - Inserts into field

## Potential Issues

### Issue 1: Path doesn't match `isFilePath()` criteria

The `isFilePath()` function requires **a file extension**:

```javascript
// Has file extension
if (/\.[a-zA-Z0-9]{1,10}$/.test(text)) return true;
```

**Test Cases**:
- ✅ `/folder with space/file.md` - has `.md` extension
- ✅ `./image with space.png` - has `.png` extension
- ❌ `/folder with space` - NO extension → returns false
- ❌ `/folder with space/` - NO extension → returns false

**If no file extension detected**: `processClipboardText()` returns the path as plain text (not processed), so it's NOT URL-encoded!

### Issue 2: Wrong path format

What exact path format are you pasting?

Examples:
- Absolute path: `/Users/name/folder with space/file.md`
- Relative path: `./folder with space/file.md`
- Windows path: `C:\folder with space\file.md`
- Folder path (no file): `/folder with space/`
- Include marker: `!!!include(./folder with space/file.md)!!!`

## Debugging Steps

### Add Console Logging

1. Check if `isFilePath()` returns true:
```javascript
// In processClipboardText, line 822
console.log('[DEBUG] isFilePath check:', text.trim(), '→', isFilePath(text.trim()));
```

2. Check if `escapeFilePath()` is called:
```javascript
// In createFileMarkdownLink, line 755
console.log('[DEBUG] escapeFilePath input:', filePath);
console.log('[DEBUG] escapeFilePath output:', safePath);
```

3. Check what's being inserted:
```javascript
// In taskEditor.js, line 246
console.log('[DEBUG] Processed content:', cleanText);
```

### Manual Test

Try pasting these exact strings and see what gets inserted:

1. `/Users/test/folder with space/file.md`
2. `./folder with space/image.png`
3. `/folder with space/` (no file)
4. `file with space.md` (just filename)

## Expected Behavior

### Path with extension
Input: `/folder with space/file.md`

Flow:
1. `isFilePath()` → `true` (has `.md`)
2. `createFileMarkdownLink()` → called
3. `escapeFilePath()` → `folder%20with%20space/file.md`
4. Result: `[[folder%20with%20space/file.md]]` (wiki link for .md)

### Path without extension
Input: `/folder with space/`

Flow:
1. `isFilePath()` → `false` (no extension)
2. `createFileMarkdownLink()` → **NOT called**
3. Result: `/folder with space/` (plain text, not encoded!)

## Likely Root Cause

**You're probably pasting a path without a file extension, or the extension doesn't match the regex.**

The `isFilePath()` function is too restrictive - it requires a file extension, so:
- Folder paths don't get encoded
- Files without extensions don't get encoded
- Unusual extensions might not match

## Solution Options

### Option A: Make isFilePath() less strict
Allow paths with directory separators even without extensions.

### Option B: Always try to encode paths
Even if not recognized as file path, try URL-encoding if it contains spaces.

### Option C: Add specific path patterns
Detect common path patterns like:
- Starts with `/`
- Contains `./`
- Has directory separators

Which option would you prefer? Or can you share the exact path you're pasting that's not getting encoded?
