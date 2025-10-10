# How to Inspect Drop Areas in the Browser

## Method 1: Browser DevTools Elements Inspector

### Step 1: Open DevTools
- Press `F12` or `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows/Linux)
- Or right-click → "Inspect Element"

### Step 2: Find the Row Container
In the Elements panel, look for:
```html
<div class="kanban-row">
  <div class="kanban-column-stack">
    <div class="kanban-full-height-column">Column content</div>
  </div>

  <div class="kanban-column-stack column-drop-zone-stack">
    <div class="column-drop-zone column-drop-zone-after"></div>
  </div>

  <button class="add-column-btn">+ Add Column</button>
</div>
```

### Step 3: Look for Drop Zone Elements
Search for these class names:
- `.column-drop-zone-stack` - The container for drop zones
- `.column-drop-zone` - The actual drop zone element
- `.column-drop-zone-before` - Drop zone before first stack
- `.column-drop-zone-between` - Drop zone between stacks
- `.column-drop-zone-after` - Drop zone after last stack

### Step 4: Inspect Element Dimensions
Click on a `.kanban-column-stack` element and look at the "Computed" tab:
- Check the `height` value
- Check `width` value
- Look at the bounding box visualization

## Method 2: Highlight Drop Zones with CSS (Temporary)

### In DevTools Console, paste this:
```javascript
// Add visible borders to drop zones
document.querySelectorAll('.column-drop-zone').forEach(zone => {
  zone.style.border = '3px solid red';
  zone.style.backgroundColor = 'rgba(255, 0, 0, 0.2)';
  zone.style.minHeight = '100px';
});

// Highlight all stacks
document.querySelectorAll('.kanban-column-stack').forEach(stack => {
  if (!stack.classList.contains('column-drop-zone-stack')) {
    stack.style.outline = '2px solid blue';
  }
});

// Show drop zone stacks
document.querySelectorAll('.column-drop-zone-stack').forEach(stack => {
  stack.style.outline = '3px solid green';
  stack.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
});
```

This will show you:
- **Red borders/background** = Drop zones (where you create new stacks)
- **Blue outline** = Regular column stacks (where you drop into existing stacks)
- **Green outline** = Drop zone stacks (containers for drop zones)

## Method 3: Check Element Under Mouse During Drag

### Add this to console while dragging:
```javascript
document.addEventListener('mousemove', function(e) {
  const element = document.elementFromPoint(e.clientX, e.clientY);
  console.log('Element under mouse:', {
    tagName: element.tagName,
    className: element.className,
    x: e.clientX,
    y: e.clientY,
    isStack: element.closest('.kanban-column-stack') !== null,
    isDropZone: element.classList.contains('column-drop-zone')
  });
}, {once: false});
```

This logs what element is under your mouse as you move it.

## Method 4: Check Stack Heights

### To see if stacks extend below their columns:
```javascript
document.querySelectorAll('.kanban-column-stack').forEach(stack => {
  if (stack.classList.contains('column-drop-zone-stack')) return;

  const columns = Array.from(stack.querySelectorAll('.kanban-full-height-column'));
  const stackRect = stack.getBoundingClientRect();

  if (columns.length > 0) {
    const lastColumn = columns[columns.length - 1];
    const lastRect = lastColumn.getBoundingClientRect();

    const emptySpace = stackRect.bottom - lastRect.bottom;

    console.log('Stack analysis:', {
      stackHeight: stackRect.height,
      lastColumnBottom: lastRect.bottom,
      stackBottom: stackRect.bottom,
      emptySpaceBelow: emptySpace,
      hasEmptySpace: emptySpace > 10
    });

    // Highlight if has no empty space
    if (emptySpace <= 10) {
      stack.style.outline = '5px solid orange';
      stack.title = 'WARNING: No empty space below column!';
    }
  }
});
```

This tells you which stacks have NO empty droppable space below their columns.

## Method 5: Test Drop Detection Live

### See what the drop handler detects:
```javascript
// Backup original handler
const originalDragOver = document.ondragover;

document.addEventListener('dragover', function(e) {
  if (!window.dragState?.draggedColumn) return;

  const stack = e.target.closest('.kanban-column-stack');
  const isDropZoneStack = stack?.classList.contains('column-drop-zone-stack');
  const isOverColumn = e.target.closest('.kanban-full-height-column');
  const isOverDropZone = e.target.classList.contains('column-drop-zone');

  console.log('Drag detection:', {
    target: e.target.className,
    foundStack: !!stack,
    isDropZoneStack: isDropZoneStack,
    isOverColumn: !!isOverColumn,
    isOverDropZone: isOverDropZone,
    wouldPass: stack && !isDropZoneStack && !isOverColumn && !isOverDropZone,
    clientY: e.clientY
  });
}, {capture: true});
```

This shows you in real-time whether the drop detection would pass or fail.

## What to Look For

### Problem Indicators:

1. **Stack has no empty space**:
   - Stack `height` = last column's `height`
   - No visual space below column
   - Orange outline in Method 4

2. **Drop zone overlapping stack space**:
   - Green outline (drop zone) appears where blue outline (stack) should be
   - Drop zones too wide

3. **e.target not the stack**:
   - In Method 3, when hovering below column, `isStack: false`
   - Target is row or body instead

4. **Stack ends at column bottom**:
   - In Method 4, `emptySpaceBelow: 0` or negative
   - Stack bottom Y ≈ Column bottom Y

## Quick Debug Command

Paste this all-in-one debugger:
```javascript
// Quick drop area debugger
(function() {
  console.clear();
  console.log('=== DROP AREA ANALYSIS ===\n');

  // Find all regular stacks
  const stacks = document.querySelectorAll('.kanban-column-stack:not(.column-drop-zone-stack)');

  stacks.forEach((stack, i) => {
    const columns = Array.from(stack.querySelectorAll('.kanban-full-height-column'));
    const stackRect = stack.getBoundingClientRect();

    if (columns.length > 0) {
      const lastColumn = columns[columns.length - 1];
      const lastRect = lastColumn.getBoundingClientRect();
      const emptySpace = stackRect.bottom - lastRect.bottom;

      console.log(`Stack ${i + 1}:`);
      console.log(`  Columns: ${columns.length}`);
      console.log(`  Stack height: ${stackRect.height}px`);
      console.log(`  Last column bottom: ${lastRect.bottom}px`);
      console.log(`  Stack bottom: ${stackRect.bottom}px`);
      console.log(`  Empty space: ${emptySpace}px ${emptySpace > 10 ? '✓' : '✗ PROBLEM'}`);
      console.log('');

      // Visual highlight
      if (emptySpace <= 10) {
        stack.style.outline = '5px solid red';
        stack.title = `Problem: Only ${emptySpace}px empty space`;
      } else {
        stack.style.outline = '3px solid green';
        stack.title = `OK: ${emptySpace}px droppable space`;
      }
    }
  });

  // Show drop zones
  document.querySelectorAll('.column-drop-zone').forEach(zone => {
    zone.style.border = '2px dashed orange';
    zone.style.backgroundColor = 'rgba(255, 165, 0, 0.2)';
  });

  console.log('Visual indicators added:');
  console.log('  Green outline = Has droppable space');
  console.log('  Red outline = NO droppable space (PROBLEM)');
  console.log('  Orange dashed = Drop zones');
})();
```

Copy-paste this into console and it will analyze and highlight everything!
