---
kanban-plugin: board
---

## Open Bugs

- [ ] i dont see any reason, but after some time the kanban just closes. maybe this has something to do with it? """console.ts:137 [Extension Host] deleteChain called from files/closed (at console.<anonymous> (file:///Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/workbench/api/node/extensionHostProcess.js:175:30205))"""

- [ ] bug that closes the kanban: "runtime-tracker.js:360 Failed to save runtime report to localStorage: QuotaExceededError: Failed to execute 'setItem' on 'Storage': Setting the value of 'runtimeReport_session_1758956943015_6drhykryu' exceeded the quota.
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
- [ ] EditTask message is send when the view looses focus afaik. but it should be sent when the edit of a task ends. can you verify and fix that?
- [ ] if a broken file link search has a url encoding (it contains a %) try decoding using url encoding before searching for it. only if it's a valid decoding search for it.


## General work order

Create a file FUNCTIONS.md that keeps track of all functions in files in front and backend. Each functions is described as: 
- path_to_filename-classname_functionname or -functionname when it's not in a class.
- a description of the functionality in 1 or 2 lines of keywords or sentences.

Implmement the requested features according to the request. Keep changes small. Suggest DRY cleanups if you find functions get similar functionality. Before creating a new functionality or creating larger code parts allways consult the FUNCTIONS.md. Never modify the save data without the users permission. After modifying the code update the FUNCTIONS.md according to the rules:
Each functions is described as: 
- path_to_filename-classname_functionname or -functionname when it's not in a class.
- a description of the functionality in 1 or 2 lines of keywords or sentences.