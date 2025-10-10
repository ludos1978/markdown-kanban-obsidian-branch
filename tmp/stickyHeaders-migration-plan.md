# stickyHeaders Migration Plan

## Current Situation

We have two overlapping configurations:

### stickyHeaders
- Values: "enabled" | "disabled"
- Function: Adds/removes CSS class `sticky-headers-disabled`
- Simple on/off switch for sticky positioning

### stickyStackMode
- Values: "full" | "titleonly" | "none"
- Function: More granular control of sticky behavior in stacks
- "full" = everything sticky (header, title, footer, margin)
- "titleonly" = only title sticky (default)
- "none" = nothing sticky

## Problem
`stickyStackMode: "none"` already provides the functionality of `stickyHeaders: "disabled"`, making stickyHeaders redundant.

## Migration Strategy

### Mapping
- `stickyHeaders: "enabled"` → Use existing `stickyStackMode` setting (titleonly by default)
- `stickyHeaders: "disabled"` → `stickyStackMode: "none"`

### Implementation Steps

1. **Remove stickyHeaders from package.json**
2. **Remove from backend**:
   - src/configurationService.ts (interfaces, defaults, getters)
   - src/kanbanWebviewPanel.ts (configuration messages)

3. **Remove from frontend**:
   - src/html/webview.js (functions, menu config, message handlers)
   - src/html/utils/configManager.js (defaults, getters)

4. **Update CSS**: Verify `sticky-headers-disabled` class is no longer needed
   - The stickyStackMode already controls stickiness through its own classes

5. **Update documentation**: AGENT.md references

## Files to Modify

### Backend (3 files)
1. package.json - Remove configuration
2. src/configurationService.ts - Remove from interfaces/defaults/getters
3. src/kanbanWebviewPanel.ts - Remove from messages

### Frontend (3 files)
4. src/html/webview.js - Remove functions, menu items, handlers
5. src/html/utils/configManager.js - Remove from defaults/getters
6. src/html/webview.css - Check if sticky-headers-disabled class is used

### Documentation (2 files)
7. AGENT.md - Remove from preset examples
8. TODOs.md - Mark as complete

## Testing
After removal, test that:
- `stickyStackMode: "none"` disables all sticky behavior
- `stickyStackMode: "titleonly"` enables title stickiness (default)
- `stickyStackMode: "full"` enables full stickiness
- No errors in console
- Build succeeds
