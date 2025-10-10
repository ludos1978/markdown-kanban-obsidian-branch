# Debug: Export Scripts Not Loading

## Steps to Debug

### 1. Reload VS Code Window
First, make sure you've reloaded:
- Press `Cmd+Shift+P` → "Developer: Reload Window"

### 2. Open Browser Console
- Open a kanban file
- Press `Cmd+Shift+P` → "Developer: Toggle Developer Tools"
- Look in the Console tab

### 3. Check for Log Messages
You should see these messages when the page loads:
```
[kanban.exportTreeBuilder] ExportTreeBuilder loaded successfully
[kanban.exportTreeUI] ExportTreeUI loaded successfully
```

If you DON'T see these messages, the scripts aren't loading at all.

### 4. Check for Script Errors
Look for any errors in the console like:
- `Failed to load resource` for exportTreeBuilder.js or exportTreeUI.js
- `Syntax error` in either file
- CSP (Content Security Policy) violations

### 5. Verify Script Tags in DOM
In the console, run:
```javascript
document.querySelectorAll('script[src*="exportTree"]')
```

This should show 2 script elements. If it shows 0, the HTML wasn't reloaded.

### 6. Check if Window Objects Exist
In the console, run:
```javascript
console.log(window.ExportTreeBuilder);
console.log(window.ExportTreeUI);
```

Both should show `class ExportTreeBuilder` and `class ExportTreeUI`.
If they show `undefined`, the scripts didn't execute.

## Common Issues

### Issue 1: HTML Not Reloaded
**Symptom**: No script tags found in DOM
**Fix**: Close VS Code completely, reopen, then reload window

### Issue 2: Script Loading Error
**Symptom**: Script tags exist but classes are undefined
**Fix**: Check console for errors, might be a syntax error

### Issue 3: Wrong Modal Opening
**Symptom**: Column export opens old simple dialog
**This is expected!** There are TWO export dialogs:
- Main menu "Export" → New unified dialog with tree selector
- Column menu "Export" → Old simple dialog (quick single-column export)

If you want the column menu to also use the new unified dialog, let me know!

## What to Report

Please check the console and tell me:
1. Do you see the "loaded successfully" messages?
2. Are there any error messages?
3. What does `window.ExportTreeBuilder` show in the console?
4. Which export button are you clicking (main menu or column menu)?
