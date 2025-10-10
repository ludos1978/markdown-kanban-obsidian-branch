# Configuration Cleanup - Complete Summary

## Overview
Cleaned up and consolidated tag visibility configuration to use a single `tagVisibility` setting instead of multiple overlapping settings.

## Changes Made

### 1. Removed `showRowTags` Configuration

#### Backend Changes
- **package.json**: Removed `markdown-kanban.showRowTags` config (boolean)
- **src/configurationService.ts**:
  - Removed from `Configuration` interface
  - Removed from `ConfigurationDefaults` interface
  - Removed from defaults object
  - Removed from `getTagConfiguration()` method
- **src/extension.ts**: Removed from config change listener
- **src/kanbanWebviewPanel.ts**:
  - Removed from initial config message
  - Removed from updateBoard message
  - Removed `_getShowRowTagsConfiguration()` method

#### Frontend Changes
- **src/html/webview.js**:
  - Removed `window.showRowTags` variable
  - Removed from message handler
- **src/html/boardRenderer.js**: Changed to check `window.currentTagVisibility === 'all'`
- **src/html/taskEditor.js**: Always show row indicators during editing
- **src/html/menuOperations.js** (2 locations): Changed to check `window.currentTagVisibility === 'all'`
- **src/html/dragDrop.js**: Changed to check `window.currentTagVisibility === 'all'`
- **src/html/utils/configManager.js**: Removed from defaults and `getTagConfiguration()`

**New Behavior**: Row indicators ("Row 2", "Row 3", etc.) now only show when `tagVisibility = "all"`, except during editing where they always show.

### 2. Fixed #stack Tag Visibility

#### Problem
#stack tags were not being hidden with "allexcludinglayout" setting.

#### Solution
- **src/html/utils/tagUtils.js**: Added support for config aliases:
  - `'allexcludinglayout'` → same as `'standard'`
  - `'customonly'` → same as `'custom'`
  - `'mentionsonly'` → same as `'mentions'`
- **src/html/webview.js**: Updated `filterTagsFromText()` to:
  - Use `window.tagUtils.filterTagsFromText()` (primary)
  - Include `#stack` in fallback regex patterns

## Tag Visibility Matrix

All layout tags (#row, #span, #stack) now behave consistently:

| Setting | #row | #span | #stack | Other # | @ | Row Indicators |
|---------|------|-------|--------|---------|---|----------------|
| **all** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Show |
| **allexcludinglayout** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ Hide |
| **customonly** | ❌ | ❌ | ❌ | ✅* | ✅ | ❌ Hide |
| **mentionsonly** | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ Hide |
| **none** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ Hide |

*customonly shows only non-configured tags

## Special Cases

### Editing Mode
When editing column titles or tasks:
- Row indicators **always visible** (like #stack tags during editing)
- Ensures users can see layout context while editing

## Files Modified

### Backend (6 files)
1. package.json
2. src/configurationService.ts
3. src/extension.ts
4. src/kanbanWebviewPanel.ts

### Frontend (7 files)
1. src/html/webview.js
2. src/html/boardRenderer.js
3. src/html/taskEditor.js
4. src/html/menuOperations.js
5. src/html/dragDrop.js
6. src/html/utils/configManager.js
7. src/html/utils/tagUtils.js

## Benefits
1. **Simpler configuration**: One setting controls all tag visibility
2. **Consistency**: Layout tags (#row, #span, #stack) treated uniformly
3. **Better UX**: Tags show/hide based on user preference
4. **Cleaner code**: Removed duplicate logic and configuration

## Testing
- ✅ TypeScript compilation: No errors
- ✅ Build process: Successful
- ✅ ESLint: Only pre-existing warnings

## Migration
Users with `showRowTags: true` should set `tagVisibility: "all"` to continue seeing row indicators.
