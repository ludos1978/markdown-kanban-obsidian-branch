---
kanban-plugin: board
---

## Open Bugs

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