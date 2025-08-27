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

add a button to apply coloring to the cards, the colors 

#red

#blue



