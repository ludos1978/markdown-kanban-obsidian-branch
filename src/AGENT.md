## Current Request



## Previous Requests

add a button to folder all columns at once next to the filename. when pressed it folds all columns in the board, when pressed again it unfolds all columns. if all columns are folded the fold button should fold as well, if all columns are unfolded it should show unfolded, if mixed, keep the last state. make sure the folded state is kept even when the interface is completely redrawn.

---

The button in the column header to toggle the cards folding should be hidden when the column is folded.

---

Add a single + button at the bottom of the column label when folded to add a card, which then also unfolds the column. 

---

The kanban board should store the folded state in memory, do not modify the markdown to store the data, only during the edit session. currently when i switch to a different document and back the folding state is reset.

an column that has no cards should be folded by default on document load.

---

the folding state of the columns and the cards are sometimes retained, but sometimes lost during work with different files. also sometimes during editing i loose focus of the field i am editing. might this be related to webcanvas redraws? can you make sure they are allways immediately applied. the only moment i would expect a external redraw is when i am editing the markdown-data the table is based upon. explain your planned changes first without editing the sourcecode. keep the changes as minimal as possible.

---

add a search function where i can enter a search term, similar to the vscode search. add a text field, 3 toggle buttons: "case sensitive", "only complete words", "regular expression search", an index of the currently found entry (1 of X), the number of found results, a arrow up (previous result) arrow down (next result). a button to close the search. by searching the screen should jump to the card with the found result. explain your planned changes first without editing the sourcecode. keep the changes as minimal as possible.

---

add the functionality to add check for tags in different parts of the markdown. tags are #words_without_spaces . if a tags is in the column header, it influences the column coloring (but not the cards). if a tag is in the card header, it influences the card color. if a tag is within the description it only sets the color of the tag-word. the tag itself should allways be enclosed in a rounded border.

also add a configuration which allows adding tags with a corresponding color for text and background, as well as the same colors (text & background) for dark mode (in total 4 colors).

explain your planned changes first without editing the sourcecode. keep the changes as minimal as possible.

-

please write the corresponding code. Always write out full functions and where they should be added to. dont change the way the markdown is saved, except for what the user enters manually. 

-

the functionality to modify the css appears to be missing. the cards and columns get the tags. but something that writes a css similar to """
.task-item[data-task-tag="bug"] {
  background-color: #440000;
  color: #900;
}
""" is missing.

---

add a search function where i can enter a search term, similar to the vscode search. add a text field, 3 toggle buttons: "case sensitive", "only complete words", "regular expression search", an index of the currently found entry (1 of X), the number of found results, a arrow up (previous result) arrow down (next result). a button to close the search. by searching the screen should jump to the card with the found result. explain your planned changes first without editing the sourcecode. keep the changes as minimal as possible.

---

the updateWhitespace function is defined in webview.js, but it's never called with the right parameters. the value is defined in the configuration of vscode. explain your planned changes first without editing the sourcecode. keep the changes as minimal as possible. never modify the markdown.

---

when drag&dropping columns and rows it's currently displaying the drop location only. is it possible to move the whole object and interactively display the outcome in realtime? explain your planned changes first without editing the sourcecode. keep the changes as minimal as possible.

---

add a burger menu in the file-info-bar. move the buttons undo, redo, lock and open file in there. leave the lock symbol (without the text) outside as well. the columns folding option and the title should stay outside.

additionally add 2 items new burger menu: "column width" with an submenu with the options "small, medium, wide" as well as number of rows with the options 1, 2, 3, 4. the column width should modify an css variable named --column-width, which by with medium is 350px, small is 250px, wide is 450px. the rows are by default 1. if set to 2, 3, 4 it should add vertical rows that allow the columns to be ordered vertically. for columns that are moved to the second, 3th or 4th row, add a tag to the column header with #row2, #row3, #row4. when loading a file, detect the largest #rowNUMBER tag an set the number of rows to this value. explain your planned changes first without editing the sourcecode. keep the changes as minimal as possible.

---

adda a new function: "column width" with an submenu with the options "small, medium, wide". the column width should modify an css variable named --column-width, which by with medium is 350px, small is 250px, wide is 450px.

---

add an option called "rows" to the kanban burger menu with the options 1, 2, 3, 4. the rows are by default 1. if set to 2, 3, 4 it should add vertical rows that allow the columns to be ordered vertically. for columns that are moved to the second, 3th or 4th row, add a tag to the column header with #row2, #row3, #row4. when loading a file, detect the largest #rowNUMBER tag an set the number of rows to this value. explain your planned changes first without editing the sourcecode. keep the changes as minimal as possible.

---

there is a new function called "rows" in the kanban burger menu with the options 1, 2, 3, 4. the rows are by default 1. if set to 2, 3, 4 it should add vertical rows that allow the columns to be ordered vertically. for columns that are moved to the second, 3th or 4th row, add a tag to the column header with #row2, #row3, #row4. when loading a file, detect the largest #rowNUMBER tag an set the number of rows to this value. verify the function and fix all remaining problems. explain your planned changes first without editing the sourcecode. keep the changes as minimal as possible.