# Configuration Cleanup Analysis: showRowTags vs tagVisibility

## Current Situation

### showRowTags Configuration
- **Type**: boolean (true/false)
- **Default**: false
- **Description**: "Show row tags (#row2, #row3, #row4) in column headers"
- **Purpose**: Controls whether "Row 2", "Row 3", "Row 4" indicators appear in column headers

### tagVisibility Configuration
- **Type**: string enum
- **Default**: "all"
- **Options**:
  - "all" - Show all tags including #span, #row, and @ tags
  - "standard" (aka "allexcludinglayout") - Show all except #span and #row (includes @ tags)
  - "custom" (aka "customonly") - Show only custom tags (not configured ones) and @ tags
  - "mentions" (aka "mentionsonly") - Show only @ tags
  - "none" - Hide all tags
- **Purpose**: Controls which types of tags are displayed on CARDS

## Key Differences

### Different Purposes
1. **showRowTags**: Controls display of row INDICATORS in COLUMN HEADERS (e.g., "Row 2", "Row 3")
2. **tagVisibility**: Controls which tags are visible on CARDS (e.g., #todo, #urgent, #row2)

### Different Locations
- **showRowTags**: Affects column headers only (adds visual indicator like "Row 2")
- **tagVisibility**: Affects tags displayed on task cards throughout the board

### Implementation Locations
#### showRowTags uses:
- `src/html/boardRenderer.js:1723` - Adds row indicator to column header
- `src/html/webview.js:1722` - Updates row indicator when columns change
- `src/html/taskEditor.js:794` - Shows row indicator in task editor
- `src/html/menuOperations.js:872, 2265` - Shows row indicator when renaming columns
- `src/html/dragDrop.js:2030` - Updates row indicator after drag/drop

#### tagVisibility uses:
- Used throughout the codebase for filtering which tags appear on cards
- Part of layout presets
- Used in export functionality
- Controls tag display on task cards

## Conclusion

**These are NOT doing the same thing.** They serve different purposes:

- **showRowTags** = Show/hide "Row X" label in column headers
- **tagVisibility** = Control which tags (#row2, #todo, etc.) appear on cards

However, there IS some overlap in that `tagVisibility` can hide #row tags on cards, but this doesn't affect the "Row X" indicator that `showRowTags` controls.

## Recommendation

**Do NOT remove showRowTags** - it serves a distinct purpose. However, you could consider:

1. Renaming `showRowTags` to `showRowIndicators` or `showColumnRowLabels` for clarity
2. Making the settings work together more coherently (e.g., if tagVisibility hides row tags, maybe also hide row indicators?)
3. Adding documentation to clarify the difference between these two settings
