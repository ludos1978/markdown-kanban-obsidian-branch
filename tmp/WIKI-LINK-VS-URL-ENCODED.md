# Wiki Links vs URL-Encoded Links for .md Files

## Current Behavior

When you paste `folder with space/include-1.md` with shift+meta+v:

**Result**: `[[folder with space/include-1.md]]`

This is a **wiki link** (Obsidian-style) which:
- ✅ Keeps spaces as-is
- ✅ Works in Obsidian and similar tools
- ❌ Spaces are NOT URL-encoded
- ❌ Won't work in include syntax

## Why This Happens

**File**: `src/html/webview.js:757-766`

```javascript
} else if (markdownExtensions.includes(extension)) {
    // Markdown: [[filename]] - wiki links don't use URL encoding, just escape special chars
    if (filePath.includes('/') || filePath.includes('\\')) {
        const wikiPath = ValidationUtils.escapeWikiLinkPath(filePath);  // Only escapes ] and |
        return `[[${wikiPath}]]`;  // Wiki link format
    }
}
```

Markdown extensions: `['md', 'markdown', 'mdown', 'mkd', 'mdx']`

## The Problem

### Wiki Links vs Include Syntax

**Wiki links** (Obsidian):
```markdown
[[folder with space/file.md]]  ← Spaces OK in wiki links
```

**Include syntax** (this extension):
```markdown
!!!include(folder%20with%20space/file.md)!!!  ← Spaces must be URL-encoded
```

**They're different!**

## Use Cases

### Use Case 1: Creating a Link to Another .md File
**What you want**: Clickable link to navigate to another markdown file
**Current behavior**: `[[folder with space/file.md]]` (wiki link)
**Works**: Yes, if your markdown renderer supports wiki links

### Use Case 2: Creating an Include Marker
**What you want**: `!!!include(folder%20with%20space/file.md)!!!`
**Current behavior**: Shift+meta+v gives you `[[folder with space/file.md]]`
**Problem**: You have to manually:
1. Replace `[[` with `!!!include(`
2. Replace `]]` with `)!!!`
3. URL-encode the path

## Solutions

### Option A: Add Include Syntax Detection (RECOMMENDED)

If the pasted text is already in include format, preserve and encode it:

```javascript
// In processClipboardText, before other checks:
const includeRegex = /^!!!(?:include|columninclude|taskinclude)\(([^)]+)\)!!!$/;
const includeMatch = text.match(includeRegex);
if (includeMatch) {
    const path = includeMatch[1].trim();
    const encodedPath = escapeFilePath(path);
    return {
        title: 'Include File',
        content: text.replace(path, encodedPath),  // Replace path with encoded version
        isLink: false
    };
}
```

Then you can paste: `!!!include(folder with space/file.md)!!!`
And get: `!!!include(folder%20with%20space/file.md)!!!`

### Option B: Change .md Files to Use Regular Links

Change markdown files from wiki links to regular markdown links:

```javascript
} else if (markdownExtensions.includes(extension)) {
    // Markdown: [filename](path) - use URL encoding for compatibility
    const safePath = escapeFilePath(filePath);
    const baseName = fileName.replace(/\.[^/.]+$/, "");
    return `[${baseName}](${safePath})`;
}
```

Then pasting `folder with space/file.md` gives:
`[file](folder%20with%20space/file.md)`

**Downside**: Loses wiki link support

### Option C: Add a Preference/Setting

Let users choose:
- Wiki links for .md files (current)
- Regular links for .md files (URL-encoded)

### Option D: Keep Both Formats

Use **context** to decide:
- If path looks like it's for an include → URL-encode
- If path looks like it's for navigation → wiki link

How to detect?
- Starts with `./` or `../` → likely include
- No directory separator → likely wiki link to file in same folder

## My Recommendation

**Option A** - Add include syntax detection

This way:
- Pasting a plain path → `[[folder with space/file.md]]` (wiki link, current behavior preserved)
- Pasting include syntax → `!!!include(folder%20with%20space/file.md)!!!` (auto-encoded)

Best of both worlds!

## Question for You

What are you trying to do?

1. **Create an include marker**: Paste `!!!include(folder with space/file.md)!!!` and have it auto-encode
2. **Create a navigation link**: Paste `folder with space/file.md` and get a clickable link
3. **Both**: Sometimes one, sometimes the other

If (1), I'll implement Option A.
If (2) and you want URL encoding, I'll implement Option B.
If (3), we need a smarter solution.
