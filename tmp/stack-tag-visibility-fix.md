# #stack Tag Visibility Fix

## Problem
#stack tags were not being properly hidden when `tagVisibility` was set to "allexcludinglayout" or other non-"all" values.

## Root Cause
The `filterTagsFromText()` function in [src/html/webview.js](../src/html/webview.js) was using hardcoded regex patterns that only removed #row and #span tags, but not #stack tags.

## Solution

### 1. Updated TagUtils to support alias values
**File**: [src/html/utils/tagUtils.js](../src/html/utils/tagUtils.js)

Added support for the configuration values used in package.json:
- `'allexcludinglayout'` → treated same as `'standard'`
- `'customonly'` → treated same as `'custom'`
- `'mentionsonly'` → treated same as `'mentions'`

The `filterTagsFromText()` method in TagUtils already properly removes #stack tags along with #row and #span tags for all non-"all" visibility settings.

### 2. Updated webview.js to use TagUtils
**File**: [src/html/webview.js](../src/html/webview.js)

Changed `filterTagsFromText()` function to:
1. Use `window.tagUtils.filterTagsFromText()` when available (primary path)
2. Fallback to updated regex patterns that include #stack tag removal

## Changes Made

### src/html/utils/tagUtils.js
- Line 468: Added `case 'allexcludinglayout':` for standard filtering
- Line 476: Added `case 'customonly':` for custom filtering
- Line 484: Added `case 'mentionsonly':` for mentions filtering

### src/html/webview.js
- Line 1408: Changed to call `window.tagUtils.filterTagsFromText()` instead of inline regex
- Lines 1418-1434: Updated fallback regex patterns to include `.replace(/#stack\b/gi, '')`

## Tag Visibility Behavior

Now all layout tags (#row, #span, #stack) are treated consistently:

| Setting | #row | #span | #stack | Other # tags | @ tags |
|---------|------|-------|--------|--------------|--------|
| all | ✅ | ✅ | ✅ | ✅ | ✅ |
| allexcludinglayout | ❌ | ❌ | ❌ | ✅ | ✅ |
| customonly | ❌ | ❌ | ❌ | ✅ (non-configured) | ✅ |
| mentionsonly | ❌ | ❌ | ❌ | ❌ | ✅ |
| none | ❌ | ❌ | ❌ | ❌ | ❌ |

## Testing
- ✅ TypeScript compilation successful
- ✅ Build process successful
- ✅ No new ESLint errors

## Related Changes
This fix complements the earlier `showRowTags` cleanup where row indicators in column headers were integrated into tagVisibility.
