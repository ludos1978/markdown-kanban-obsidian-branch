# Issue: Dropping Below Last Column in Stack

## User's Observation
Hovering **below the last column** (vertically down in the empty space of the stack), sometimes the drop doesn't work.

## The Code Flow (Lines 2133-2176)

### Step 1: Check if over a stack (Line 2137-2138)
```javascript
const stack = e.target.closest('.kanban-column-stack');
if (!stack || stack.classList.contains('column-drop-zone-stack')) {return;}
```

**Requirement**: `e.target` or its parent must be a `.kanban-column-stack` element.

**Potential Issue**: When hovering in empty space below column:
- If `e.target` is the **row container** instead of the stack → Fails
- If `e.target` is the **body/document** → Fails
- If stack height doesn't extend below column → No element to target

### Step 2: Check not over column or drop zone (Line 2141-2144)
```javascript
if (e.target.classList.contains('kanban-full-height-column') ||
    e.target.closest('.kanban-full-height-column') ||
    e.target.classList.contains('column-drop-zone')) {
    return;
}
```

**Requirement**: Must NOT be over a column or drop zone.

**Potential Issue**: This should be fine in empty space, unless...
- The empty space itself is not part of the stack element
- Some other element is layered over the empty space

### Step 3: Get last column position (Line 2153-2154)
```javascript
const lastColumn = columns[columns.length - 1];
const lastRect = lastColumn.getBoundingClientRect();
```

Gets the bounding rectangle of the last column.

### Step 4: Check if mouse is below (Line 2157)
```javascript
if (e.clientY > lastRect.bottom) {
    // Drop logic here
}
```

**Requirement**: Mouse Y position must be GREATER than the bottom edge of the last column.

**This is where it likely fails!**

## The Real Problem: Element Height vs Visual Space

### What You See:
```
┌─────────────┐
│  Column E   │
│             │
│  (content)  │
└─────────────┘ ← lastRect.bottom is HERE (e.g., Y=400)
      ↓
   [SPACE]      ← You hover here (e.g., Y=500)
      ↓
──────────────── ← Stack visual boundary
```

### What the Browser Sees:
```
Stack element actual bounds:
┌─────────────┐
│  Column E   │
└─────────────┘ ← Stack might END here!
      ↓
   [NOTHING]    ← No DOM element here
      ↓          e.target = ROW or BODY
```

## The Issue: Stack Height

From CSS (line 1852):
```css
.kanban-column-stack {
    display: grid;
    grid-template: 1fr / 1fr;
    height: 100%;  /* Takes 100% of parent */
}

.kanban-column-stack .kanban-full-height-column {
    align-self: start;  /* Doesn't stretch to fill */
}
```

**Grid behavior**:
- The stack is `height: 100%` of its parent
- BUT columns have `align-self: start`
- Columns don't stretch, they only take their content height

**The critical question**: What is the stack's parent height?

### Scenario 1: Parent is Row Container
```html
<div class="kanban-row" style="height: 800px">
  <div class="kanban-column-stack" style="height: 100%"> ← 800px
    <div class="kanban-full-height-column"> ← 400px (content height)
```

Stack extends 800px, column only 400px. **Empty space exists and is clickable** ✓

### Scenario 2: Parent is Auto Height
```html
<div class="kanban-row" style="height: auto">
  <div class="kanban-column-stack" style="height: 100%"> ← ???
    <div class="kanban-full-height-column"> ← 400px (content height)
```

If parent is auto-height and has no other content, `100%` resolves to the column's height (400px). **No empty space exists!** ✗

### Scenario 3: Column Has Pointer-Events None

From CSS (line 1866-1876):
```css
.kanban-column-stack .kanban-full-height-column {
    pointer-events: none;
}
```

Columns don't receive pointer events, but the STACK should. However, if the stack's actual DOM height equals the column height, there's no stack element to target below the column.

## The Actual Failure Mode

When hovering below the column:

**Check 1**: `e.target.closest('.kanban-column-stack')`
- If stack height = column height → `e.target` is NOT the stack (maybe row/body)
- Result: Returns early at line 2138 ✗

**Check 2**: `e.clientY > lastRect.bottom`
- Even if you somehow pass Check 1
- If there's ANY element between mouse and stack, this might fail
- Result: Condition not met ✗

## Why "Sometimes" It Fails

**Works when**:
- Row has explicit minimum height
- Stack has other elements keeping it tall
- Multiple columns → More guaranteed height
- Browser's hit test finds the stack element

**Fails when**:
- Single short column → Minimal stack height
- Row height is auto → Stack collapses to content
- Last column in row → No other columns to extend height
- Different browser rendering → Element bounds calculation differs

## The Smoking Gun: Check What e.target Actually Is

When it fails, the `e.target` is probably:
1. `.kanban-row` (parent of stack)
2. `body` or `document`
3. Some other container element

And thus line 2137-2138 returns:
```javascript
const stack = e.target.closest('.kanban-column-stack');
if (!stack) {return;}  // ← Returns here!
```

## To Confirm This Issue

Add debug logging:
```javascript
const stack = e.target.closest('.kanban-column-stack');
if (!stack) {
    console.log('FAILED: e.target =', e.target.className,
                'clientY =', e.clientY,
                'lastRect.bottom =', lastColumn?.getBoundingClientRect().bottom);
    return;
}
```

This would show that when hovering in the empty space, `e.target` is NOT a child of the stack element.

## The Fix Would Involve

1. Ensuring stack has explicit minimum height beyond its content
2. Making the empty space explicitly targetable (add invisible div)
3. Falling back to row-level detection if stack not found
4. Using different method to detect "below last column" area

But no modifications - just analysis!
