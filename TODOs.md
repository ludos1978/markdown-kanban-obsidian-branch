---
kanban-plugin: board
---

## Open Bugs

- [ ] cleanup the configuration and the functions that use it.  i think the """
        "markdown-kanban.showRowTags": {
          "type": "boolean",
          "default": false,
          "description": "Show row tags (#row2, #row3, #row4) in column headers"
        },
        "markdown-kanban.tagVisibility": {
          "type": "string",
          "default": "all",
          "description": "Control which types of tags are displayed on cards",
          "enum": [
            "all",
            "standard",
            "custom",
            "mentions",
            "none"
          ],
          "enumDescriptions": [
            "Show all tags including #span, #row, and @ tags",
            "Show all except #span and #row (includes @ tags)",
            "Show only custom tags (not configured ones) and @ tags",
            "Show only @ tags",
            "Hide all tags"
          ]
        },""" are doing the same thing, or rather showRowTags are obsolete.


- [x] in some situations it doesnt open a link i opened before. 
- [x] Failed to update stickyStackMode preference: CodeExpectedError: In Arbeitsbereichseinstellungen kann nicht geschrieben werden, weil markdown-kanban.stickyStackMode keine registrierte Konfiguration ist.
- [x] pressing alt on an image should open the file externally if it's found, othervise the replacement file search should be activated. but it currently doesnt. the code should be in the codebase already, but it currently doesnt seem to be active.
- [x] modifying a columntitle with a !!!columninclude()!!! does not set the title correctly according to the rule: link to filename that is clickable included with the rest of the title and tags
- [x] when restoring kanban views all views restore one kanban file. not individual files they contained before.
- [x] move the corner-badges-container into the column-header div verify that all css is corrected for the new location. ultrathink
- [x] a horizontally folded column with a tag header doesnt add the tag above outside above, but overlaying above the normal header. this is one of the broken examples : TO ADD AN EXMAPLE
- [x] after i moved away a card from a column i cant fold it anymore.
- [x] lets make columns vertical folding working again. a column that is alone in a stack should by default fold as vertical. if there are multiple columns in a stack the folding should be horizontal. by pressing alt+fold-button the column switches between horizontal and vertical folding. all the functions and styles should be available already.
- [x] if i delete a task recalculate the full stacks heights reuse the existing function for that
- [x] make sure that in columns the "column-header.header-bars-container" contains the "header-bar" and "column-footer.footer-bars-container" contains the "footer-bar" in all circumstances.
- [x] disable the vertical column folding mode
- [x] the title when inserting of a columninclude should only show thae filename included and he remainder of the contents. 
- [x] On start drag fix the tags of the source stack (where we took the column from). On end drag fix the tags of the destination stack (where we put the column)
- [x] Corrected Summary of Implementation:
CSS Changes:
- Grid overlay structure: All stacked columns overlay in single grid cell
- Full viewport height: Each column min-height: 100vh so sticky works across entire scroll
- Sticky headers: Position sticky at top with cumulative offsets (0px, 29px, 58px...)
- Sticky footers: Position sticky at bottom with cumulative offsets (58px, 29px, 0px...)
- Drag&drop compatible: All handlers preserved on original elements
JavaScript #stack Tag Logic:
- Drop between stacked columns or at the end → Adds #stack to dropped column
- Drop as first in stack → Removes #stack from dropped column, adds #stack to next column
- Drop outside stack → Removes #stack from dropped column
What the Implementation Does:
Stacked columns overlay in same grid position with full viewport height
Headers stick to top, footers stick to bottom
Content scrolls naturally as before
#stack tags automatically managed when dragging columns
- [x] When moving a task into a folded column while pressing alt, the column should not unfold as it usually does.
- [x] Columns that are in a "vertical stack" have a #stack tag or the next column has a #stack tag. Add a feature to make the columns fold horizontally, but keep the vertical folding function available. An column in a "vertical stack" stack should by default folds to horizontal folding state, a column in outside a stack should fold to vertical fold state. If <alt> is pressed while pressing the fold button again, the horizontal/vertical folding should switch. when pressing <alt> while it's unfolded, fold to the not-default-state. When <alt> is not pressed a folded column unfolds.

- [x] Export and pack of the kanban does not generate the default folder name it should export into (based on the filename of the main kanban file combined with the date-time like "YYYYMMDD-HHmm").

- [x] if multiple columns are in a vertical stack. can you make all the sticky headers to stick, eighter at the top or the bottom? so if 3 columns are above each other, allways show the headers of all columns. it's to be able to drop items into all rows at all the time.

- [x] vertically folded columns should allways be next to each other, even if they have the #stack tag.

- [x] it still converts this

"""
~~![image](https://file%2B.vscode-resource.vscode-cdn.net/Users/rspoerri/_REPOSITORIES/_TINKERING_REPOs/markdown-kanban-obsidian/tests/foldeapace/image-512x512.png)~~
middle
~~![image](https://file%2B.vscode-resource.vscode-cdn.net/Users/rspoerri/_REPOSITORIES/_TINKERING_REPOs/markdown-kanban-obsidian/tests/foldeapace/image-512x512.png)~~
third
~~![image](https://file%2B.vscode-resource.vscode-cdn.net/Users/rspoerri/_REPOSITORIES/_TINKERING_REPOs/markdown-kanban-obsidian/tests/foldeapace/image-512x512.png)~~
  ![image](/Users/rspoerri/_REPOSITORIES/_TINKERING_REPOs/markdown-kanban-obsidian/tests/folder%20with%20space/image-512x512.png)
"""

to this

"""
~~~~![image](https://file%2B.vscode-resource.vscode-cdn.net/Users/rspoerri/_REPOSITORIES/_TINKERING_REPOs/markdown-kanban-obsidian/tests/foldeapace/image-512x512.png)~~ ![image](/Users/rspoerri/_REPOSITORIES/_TINKERING_REPOs/markdown-kanban-obsidian/tests/folder%20with%20space/image-512x512.png)~~
middle
~~~~![image](https://file%2B.vscode-resource.vscode-cdn.net/Users/rspoerri/_REPOSITORIES/_TINKERING_REPOs/markdown-kanban-obsidian/tests/foldeapace/image-512x512.png)~~ ![image](/Users/rspoerri/_REPOSITORIES/_TINKERING_REPOs/markdown-kanban-obsidian/tests/folder%20with%20space/image-512x512.png)~~
third
~~~~![image](https://file%2B.vscode-resource.vscode-cdn.net/Users/rspoerri/_REPOSITORIES/_TINKERING_REPOs/markdown-kanban-obsidian/tests/foldeapace/image-512x512.png)~~ ![image](/Users/rspoerri/_REPOSITORIES/_TINKERING_REPOs/markdown-kanban-obsidian/tests/folder%20with%20space/image-512x512.png)~~
  ![image](/Users/rspoerri/_REPOSITORIES/_TINKERING_REPOs/markdown-kanban-obsidian/tests/folder%20with%20space/image-512x512.png)
"""

when i try to fix the first broken link. it should only modify the first link when i search for the corrected file and replace the original (already striked trough) link to

"""
~~~~![image](https://file%2B.vscode-resource.vscode-cdn.net/Users/rspoerri/_REPOSITORIES/_TINKERING_REPOs/markdown-kanban-obsidian/tests/foldeapace/image-512x512.png)~~~~
"""

but!

this breaks the rendering. so even better would be to have an already striked trough link remain striked trough. add the corrected link after without strike-trough. and add a style to the strike-trough so a broken image or media is also striked trough in the rendered content. Is this possible? ULTRATHINK ULTRATHINK

- [ ] when searching and replacing replacement text, the striketrough is not
  properly placed. there are multiple types of links that must be properly
  striked-trough and the alternative path must be added in the same
  style. the types of links may be: ![]() -> ~~![]()~~ , []() -> ~~[]()~~
  , <> -> ~~<>~~ or [[]] -> ~~[[]]~~ maybe there is others i dont know of.
  currently i think the stiketrough does not take the minimum sized item
  according to the above rules, but sometimes takes a larger area that is
  striked trough.ß

- [ ] add an option to the export as in which style to export. it can be eigher kanbanstyle (does not modify the style, copies the markdown as in the original markdown) or it can be presentation style (which uses the same method as when copying the columns and cards as markdown.)
- the copy as markdown will allways use presentation mode
- the export functionality of tasks and columns gets a dropdown selection with "presentation" and "kanbanstyle"

- [x] Failed to create backup: TypeError: Cannot read properties of undefined (reading 'getText')
	at BackupManager.createBackup (/Users/rspoerri/_REPOSITORIES/_TINKERING_REPOs/markdown-kanban-obsidian/dist/extension.js:8513:32)
	at MessageHandler.handlePageHiddenWithUnsavedChanges (/Users/rspoerri/_REPOSITORIES/_TINKERING_REPOs/markdown-kanban-obsidian/dist/extension.js:7344:42)
	at MessageHandler.handleMessage (/Users/rspoerri/_REPOSITORIES/_TINKERING_REPOs/markdown-kanban-obsidian/dist/extension.js:6782:20)
	at Ah.value (/Users/rspoerri/_REPOSITORIES/_TINKERING_REPOs/markdown-kanban-obsidian/dist/extension.js:9935:38)
	at D.B (file:///Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/workbench/api/node/extensionHostProcess.js:27:2375)
	at D.fire (file:///Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/workbench/api/node/extensionHostProcess.js:27:2593)
	at wB.$onMessage (file:///Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/workbench/api/node/extensionHostProcess.js:135:95573)
	at i4.S (file:///Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/workbench/api/node/extensionHostProcess.js:29:115936)
	at i4.Q (file:///Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/workbench/api/node/extensionHostProcess.js:29:115716)
	at i4.M (file:///Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/workbench/api/node/extensionHostProcess.js:29:114805)
	at i4.L (file:///Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/workbench/api/node/extensionHostProcess.js:29:114043)
	at Ah.value (file:///Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/workbench/api/node/extensionHostProcess.js:29:112707)
	at D.B (file:///Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/workbench/api/node/extensionHostProcess.js:27:2375)
	at D.fire (file:///Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/workbench/api/node/extensionHostProcess.js:27:2593)
	at Jn.fire (file:///Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/workbench/api/node/extensionHostProcess.js:29:9459)
	at Ah.value (file:///Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/workbench/api/node/extensionHostProcess.js:197:3917)
	at D.B (file:///Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/workbench/api/node/extensionHostProcess.js:27:2375)
	at D.fire (file:///Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/workbench/api/node/extensionHostProcess.js:27:2593)
	at Jn.fire (file:///Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/workbench/api/node/extensionHostProcess.js:29:9459)
	at MessagePortMain.<anonymous> (file:///Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/workbench/api/node/extensionHostProcess.js:197:2209)
	at MessagePortMain.emit (node:events:518:28)
	at MessagePortMain._internalPort.emit (node:electron/js2c/utility_init:2:2949)
	at Object.callbackTrampoline (node:internal/async_hooks:130:17) (at console.<anonymous> (file:///Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/workbench/api/node/extensionHostProcess.js:175:30205))

- [x] the addon that delets a text which is strike-trough (between two ~~) converts the remaining contents to html, instead of leaving it as markdown. this is very wrong 
ultrathink
- [x] the plugin that generates class multicolumn by adding "---:", ":--:", ":---" sometimes generates the same content twice. can you find a reason why? ultrathink ultrathink ultrathink ultrathink 

- [x] i dont see any reason, but after some time the kanban just closes. maybe this has something to do with it? """console.ts:137 [Extension Host] deleteChain called from files/closed (at console.<anonymous> (file:///Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/workbench/api/node/extensionHostProcess.js:175:30205))"""

- [x] bug that closes the kanban: "runtime-tracker.js:360 Failed to save runtime report to localStorage: QuotaExceededError: Failed to execute 'setItem' on 'Storage': Setting the value of 'runtimeReport_session_1758956943015_6drhykryu' exceeded the quota.
    at RuntimeTracker.saveReport (runtime-tracker.js:358:26)
    at runtime-tracker.js:84:22"

- [x] conflict tracking behaviour:
- if the external file is modified and saved (a file modification is detected) and the kanban has saved or unsaved changes or is in edit mode:
	- the conflict manager must ask the user wether he wants to (default) ignore the external changes (nothing happens, remember we still have unsaved changes in the kanban)
	- overwrite the external file with the kanban contents (the kanban is then in an unedited state)
	- save the kanban as a backup file and reload the kanban from the external changes (original kanban is stored in a backup file, the external changes of the markdown are loaded into the kanban)
	- discard the changes in the kanban and reload from the external edit.
- if the external file is modified and saved and the kanban has no saved or unsaved changes and is not in edit mode. the kanban can reload the modified data immediately.
- if the kanban is modified and saved and the external file has unsaved changes and is later saved. we rely on the default change detection of vscode.
do this for the kanban and each column and task included files individually. the include files should automatically update on a modification externally, they cannot be modified internally.


- [ ] add an option to the export as in which style to export. it can be eigher kanbanstyle (does not modify the style) or it can be presentation style (which uses the same method as when copying the columns and cards as markdown.
- [x] OBSOLETE, WRONG ASSUMPTION. 1. Clicking on the task description to edit it: 2. Changing the text from !!!include(./markdown-include-2.md)!!! to something like   !!!include(. markdown-include-1.md)!!! 3. stop editing the field. - should result in an modfied included content. but does not. Instead it shows Loading: newfilename.md forever. i think the backend is missing an editTaskDescription that handles the contents similar to the editTaskTitle which checks for includes and handles it there. or where does that happen?
- ok, i did an error. the !!!include()!!! must be run in the frontend only, as it's genearted with the markdown-ti. i undid all changes. try to get it running again with in this style.
- [x] EditTask message is send when the view looses focus afaik. but it should be sent when the edit of a task ends. can you verify and fix that?
- [x] if a broken file link search has a url encoding (it contains a %) try decoding using url encoding before searching for it. only if it's a valid decoding search for it.


## General work order

Create a file FUNCTIONS.md that keeps track of all functions in files in front and backend. Each functions is described as: 
- path_to_filename-classname_functionname or -functionname when it's not in a class.
- a description of the functionality in 1 or 2 lines of keywords or sentences.

Implmement the requested features according to the request. Keep changes small. Suggest DRY cleanups if you find functions get similar functionality. Before creating a new functionality or creating larger code parts allways consult the FUNCTIONS.md. Never modify the save data without the users permission. After modifying the code update the FUNCTIONS.md according to the rules:
Each functions is described as: 
- path_to_filename-classname_functionname or -functionname when it's not in a class.
- a description of the functionality in 1 or 2 lines of keywords or sentences.