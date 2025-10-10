# TaskInclude Merge Fix Plan

## Problem

When exporting with `mergeIncludes=true`, taskinclude files convert each slide (separated by `---`) into a separate task, instead of treating the entire presentation content as the description of a single task.

### Current Behavior

**Input (main file)**:
```markdown
## Column
- [ ] !!!taskinclude(./file.md)!!!
```

**Input (file.md)**:
```
First slide title

Content of first slide

---

Second slide title

Content of second slide
```

**Current Output (WRONG)**:
```markdown
## Column
- [ ] First slide title
  Content of first slide
- [ ] Second slide title
  Content of second slide
```

This creates **multiple tasks** from one taskinclude!

### Expected Behavior

**Expected Output**:
```markdown
## Column
- [ ] First slide title
  Content of first slide

  ---

  Second slide title

  Content of second slide
```

The taskinclude should become:
- **One task** with the first slide title as the task title
- **Entire presentation content** (including separators) as the task description

## Root Cause

In `convertPresentationToKanban()` line ~1290:
```typescript
const tasks = PresentationParser.slidesToTasks(slides);
for (const task of tasks) {
    kanbanContent += `- [ ] ${task.title}\n`;
    // ... description
}
```

This converts EACH slide to a separate task. For taskinclude, we should instead:
1. Use first slide title as THE task title
2. Use ALL content (preserving `---` separators) as THE task description

## Solution

### Option A: Don't Convert - Use Raw Content
For taskinclude, don't parse into slides at all:
```typescript
if (isTaskInclude) {
    // For taskinclude, use raw presentation content
    // Extract first line/title, rest becomes description
    const lines = presentationContent.split('\n');
    let title = '';
    let description = '';

    // Find first non-empty line for title
    let titleIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim()) {
            title = lines[i].trim();
            titleIndex = i;
            break;
        }
    }

    // Everything else (including ---) becomes description
    if (titleIndex >= 0) {
        description = lines.slice(titleIndex + 1).join('\n').trim();
    }

    let kanbanContent = `- [ ] ${title}\n`;
    if (description) {
        const descLines = description.split('\n');
        for (const line of descLines) {
            kanbanContent += `  ${line}\n`;
        }
    }

    return kanbanContent;
}
```

**Pros**:
- Simple
- Preserves all original formatting including `---`
- No parsing/reconstruction

**Cons**:
- Doesn't use PresentationParser at all
- First line becomes title even if not ideal

### Option B: Use First Slide Only
Convert only the first slide to a task, preserve rest as-is:
```typescript
if (isTaskInclude) {
    if (slides.length === 0) return '';

    // First slide becomes the task
    const firstSlide = slides[0];
    let kanbanContent = `- [ ] ${firstSlide.title || ''}\n`;

    // First slide content + all remaining slides (raw) become description
    let description = firstSlide.content;

    // If there are more slides, append them with separators
    if (slides.length > 1) {
        // Reconstruct remaining slides with --- separators
        for (let i = 1; i < slides.length; i++) {
            description += '\n\n---\n\n';
            if (slides[i].title) {
                description += slides[i].title + '\n\n';
            }
            description += slides[i].content;
        }
    }

    if (description && description.trim()) {
        const descLines = description.split('\n');
        for (const line of descLines) {
            kanbanContent += `  ${line}\n`;
        }
    }

    return kanbanContent;
}
```

**Pros**:
- Uses PresentationParser for title extraction
- Preserves structure
- Flexible for future enhancements

**Cons**:
- Slightly more complex
- Reconstructs `---` separators

## Recommendation

**Option A** is cleaner and simpler for taskinclude use case. The entire presentation file content should be the task content, with minimal processing.

## Implementation Steps

1. Update `convertPresentationToKanban()` for taskinclude case (line ~1290)
2. Use raw content approach: first non-empty line = title, rest = description
3. Preserve all formatting including `---` separators
4. Test with multi-slide presentation files
