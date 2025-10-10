# Markdown Link Types - URL Encoding Requirements

## Test Results

### 1. Image Links - `![](path)`
**Syntax**: `![alt text](path/to/image.png)`

**With spaces (not encoded)**:
```markdown
![](folder with space/image.png)
```
**Result**: ❌ **BROKEN** - Markdown parser treats space as end of path

**With spaces (URL-encoded)**:
```markdown
![](folder%20with%20space/image.png)
```
**Result**: ✅ **WORKS** - Image displays correctly

**Conclusion**: ✅ **MUST URL-encode**

---

### 2. Regular Links - `[text](path)`
**Syntax**: `[link text](path/to/file.pdf)`

**With spaces (not encoded)**:
```markdown
[document](folder with space/file.pdf)
```
**Result**: ❌ **BROKEN** - Link target is incomplete

**With spaces (URL-encoded)**:
```markdown
[document](folder%20with%20space/file.pdf)
```
**Result**: ✅ **WORKS** - Link works correctly

**Conclusion**: ✅ **MUST URL-encode**

---

### 3. Wiki Links - `[[path]]`
**Syntax**: `[[path/to/file]]`

**With spaces (not encoded)**:
```markdown
[[folder with space/file.md]]
```
**Result**: ✅ **WORKS** - Wiki link syntax allows spaces

**With spaces (URL-encoded)**:
```markdown
[[folder%20with%20space/file.md]]
```
**Result**: ⚠️ **DEPENDS** - Some parsers treat `%20` literally, looking for a file with `%20` in the name

**Conclusion**: ❌ **Should NOT URL-encode** (spaces are part of wiki link spec)

---

### 4. Include Syntax - `!!!include(path)!!!`
**Syntax**: `!!!include(path/to/file.md)!!!`

**With spaces (not encoded)**:
```markdown
!!!include(folder with space/file.md)!!!
```
**Result**: ❌ **BROKEN** - File path resolution fails

**With spaces (URL-encoded)**:
```markdown
!!!include(folder%20with%20space/file.md)!!!
```
**Result**: ✅ **WORKS** - Path is decoded before file access

**Conclusion**: ✅ **MUST URL-encode** (treated like regular paths internally)

---

### 5. Autolinks - `<url>`
**Syntax**: `<https://example.com/path>`

**With spaces (not encoded)**:
```markdown
<https://example.com/folder with space/page>
```
**Result**: ❌ **INVALID** - URLs cannot contain unencoded spaces

**With spaces (URL-encoded)**:
```markdown
<https://example.com/folder%20with%20space/page>
```
**Result**: ✅ **WORKS** - Valid URL

**Conclusion**: ✅ **MUST URL-encode** (standard URL encoding rules)

---

## Summary Table

| Link Type | Syntax | URL Encode? | Why? |
|-----------|--------|-------------|------|
| **Image** | `![](path)` | ✅ **YES** | Markdown spec - spaces break parsing |
| **Regular Link** | `[text](path)` | ✅ **YES** | Markdown spec - spaces break parsing |
| **Wiki Link** | `[[path]]` | ❌ **NO** | Wiki link spec allows spaces |
| **Include Syntax** | `!!!include(path)!!!` | ✅ **YES** | Custom syntax - file path resolution |
| **Autolink** | `<url>` | ✅ **YES** | URL spec - no unencoded spaces |

---

## The Core Issue

### Markdown Parenthesis-Based Links

In standard markdown, links use parentheses: `[text](url)` and `![alt](url)`

The markdown parser uses **spaces** to separate the URL from optional title text:

```markdown
[link](path/to/file.pdf "Title text here")
       ↑                  ↑
       URL ends here      Title starts here
```

So when you write:
```markdown
![](folder with space/image.png)
```

The parser sees:
- URL: `folder` (everything before first space)
- Title: `with space/image.png"` (everything after first space)

This is **broken**.

### Wiki Link Syntax

Wiki links use **double brackets**: `[[path]]`

There's no space-based separation, so spaces are allowed:

```markdown
[[folder with space/file.md]]
```

The parser treats everything between `[[` and `]]` as the path.

This **works correctly**.

---

## Current Code Behavior (WRONG for .md files)

**File**: `src/html/webview.js:757-766`

```javascript
} else if (markdownExtensions.includes(extension)) {
    // Markdown: [[filename]] - wiki links don't use URL encoding
    const wikiPath = ValidationUtils.escapeWikiLinkPath(filePath);  // ❌ Only escapes ] and |
    return `[[${wikiPath}]]`;  // Wiki link format
}
```

**Problem**: This assumes you want wiki links for markdown files.

But **wiki links only work in environments that support them** (Obsidian, some other tools).

In standard markdown renderers (GitHub, VS Code preview, etc.), wiki links are **not recognized**.

---

## What Should Happen

### For Image Files
Always use `![](url-encoded-path)`:

```javascript
if (imageExtensions.includes(extension)) {
    const safePath = escapeFilePath(filePath);
    return `![](${safePath})`;
}
```

✅ **Already correct!**

### For Markdown Files - Two Options

#### Option A: Standard Markdown Links (RECOMMENDED)
Use regular links with URL encoding for **maximum compatibility**:

```javascript
} else if (markdownExtensions.includes(extension)) {
    // Use standard markdown links for compatibility
    const safePath = escapeFilePath(filePath);
    const baseName = fileName.replace(/\.[^/.]+$/, "");
    return `[${baseName}](${safePath})`;
}
```

Result: `[include-1](folder%20with%20space/include-1.md)`

**Pros**:
- ✅ Works in all markdown renderers
- ✅ Spaces properly encoded
- ✅ Consistent with image links

**Cons**:
- ❌ Loses wiki link support (if you use Obsidian)

#### Option B: Detect Context
Use wiki links for navigation, regular links for includes:

```javascript
} else if (markdownExtensions.includes(extension)) {
    // Check if this looks like an include path
    if (filePath.startsWith('./') || filePath.startsWith('../') || filePath.includes('/')) {
        // Likely an include - use regular link with encoding
        const safePath = escapeFilePath(filePath);
        const baseName = fileName.replace(/\.[^/.]+$/, "");
        return `[${baseName}](${safePath})`;
    } else {
        // Simple filename - use wiki link
        const wikiPath = ValidationUtils.escapeWikiLinkPath(filePath);
        return `[[${wikiPath}]]`;
    }
}
```

### For Other Files
Always use `[text](url-encoded-path)`:

```javascript
} else {
    const safePath = escapeFilePath(filePath);
    const baseName = fileName.replace(/\.[^/.]+$/, "");
    return `[${baseName}](${safePath})`;
}
```

✅ **Already correct!**

### For Include Syntax
Always URL-encode the path inside:

```javascript
// Add this check BEFORE the isFilePath check in processClipboardText
const includeRegex = /^!!!(include|columninclude|taskinclude)\(([^)]+)\)!!!$/;
const includeMatch = text.match(includeRegex);
if (includeMatch) {
    const type = includeMatch[1];
    const path = includeMatch[2].trim();
    const encodedPath = escapeFilePath(path);
    return {
        title: 'Include File',
        content: `!!!${type}(${encodedPath})!!!`,
        isLink: false
    };
}
```

---

## Recommendation

**Change markdown files to use standard links instead of wiki links.**

This gives you:
1. ✅ URL-encoded paths (spaces work)
2. ✅ Works in all markdown renderers
3. ✅ Consistent behavior with images and other files
4. ✅ Works correctly for include syntax

**Trade-off**: Lose wiki link support (if you use Obsidian)

Do you use Obsidian or another tool that requires wiki links? If not, we should switch to standard markdown links for `.md` files.
