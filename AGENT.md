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

add a burger menu in the file-info-bar. move the buttons undo, redo, lock and open file in there. leave the lock symbol (without the text) outside as well. the columns folding option and the title should stay outside. additionally add 2 items new burger menu: "column width" with an submenu with the options "small, medium, wide" as well as number of rows with the options 1, 2, 3, 4. the column width should modify an css variable named --column-width, which by with medium is 350px, small is 250px, wide is 450px. the rows are by default 1. if set to 2, 3, 4 it should add vertical rows that allow the columns to be ordered vertically. for columns that are moved to the second, 3th or 4th row, add a tag to the column header with #row2, #row3, #row4. when loading a file, detect the largest #rowNUMBER tag an set the number of rows to this value. explain your planned changes first without editing the sourcecode. keep the changes as minimal as possible.

-

please write the corresponding code. Always write out full functions and where they should be added to. dont change the way the markdown is saved, except for adding the tags for the columns.

---

the dropping of files from the explorer is broken. it shows the message "Drop files here to create links" and blocks then, it doesnt display a location to drop in multi-row layout. It does work in the single row layout. explain your planned changes first without editing the sourcecode. keep the changes as minimal as possible.

---

in multi row mode, show the "+ Add Column" on each row, add it to the respective row it's on (using the tags #row2, #row3, #row4). explain your planned changes first without editing the sourcecode. keep the changes as minimal as possible.

---

when alt+clicking on a link in the kanban board it should open the file instead of starting to edit the text.  explain your planned changes first without editing the sourcecode. keep the changes as minimal as possible.

---

it doesnt start editing now, but it also doesnt open the file. when it's a file extension known to vscode it should open in there, but if it's an unknown extension it should open in the externally (os) defined programm

---

when editing a markdown column title with the tag #row2, #row3, #row4 dont show these tags during editing. explain your planned changes first without editing the sourcecode. keep the changes as minimal as possible. dont change or add any addtional features. dont add failsaves or backup solutions. only describe your solution, dont implement it!!!

-

please write the corresponding code. Always write out full functions and where they should be added to.

---

Add all available tags to both buger menus (column & cards) as a submenu point "Tags". A submenu should show the name of the tag and a checkbox next to it wether the tag is currently active. Show the same function in the column and the cards burger menu. When editing the cards tags, only add them to the title. keep the changes as minimal as possible. dont change or add any addtional features. dont add failsaves or backup solutions. only describe your solution, dont implement it yet!!!

---

we will use the "Grouped Configuration Structure". also add border styles with the option to only have a left border or full borders around the card/column. add header & footer bars option as well as corner badges (without patterns). each tag should can have optionally have any of these styles. for the styling use the first occurrence from the tags in order of appearance on the column or card. summarize the change and give me an example configuration of one item. keep the changes as minimal as possible. reuse existing functions if possible. dont add failsaves or backup solutions. only describe your solution, dont implement it yet!!!

- solution proposed -

## Summary of Changes

### Configuration Structure Enhancement

Extend the grouped tag configuration in `package.json` to support additional optional styling properties for each tag:

-   **border**: Style borders (left-only or full)
-   **headerBar**: Top accent bar
-   **footerBar**: Bottom accent bar
-   **cornerBadge**: Corner badge with text

### Styling Priority

-   Use the **first tag** found in the title (order of appearance) for styling
-   The existing `extractFirstTag()` function already handles this
-   Columns and cards will get styled based on their first tag only

### CSS Generation Update

Enhance `generateTagStyles()` in `boardRenderer.js` to generate CSS for:

-   Border variants (left vs full)
-   Header/footer bars (absolutely positioned elements)
-   Corner badges (::before/::after pseudo-elements)

## Example Configuration

## Summary of Changes

### Configuration Structure Enhancement

Extend the grouped tag configuration in `package.json` to support additional optional styling properties for each tag:

-   **border**: Style borders (left-only or full)
-   **headerBar**: Top accent bar
-   **footerBar**: Bottom accent bar
-   **cornerBadge**: Corner badge with text

### Styling Priority

-   Use the **first tag** found in the title (order of appearance) for styling
-   The existing `extractFirstTag()` function already handles this
-   Columns and cards will get styled based on their first tag only

### CSS Generation Update

Enhance `generateTagStyles()` in `boardRenderer.js` to generate CSS for:

-   Border variants (left vs full)
-   Header/footer bars (absolutely positioned elements)
-   Corner badges (::before/::after pseudo-elements)

## Example Configuration

## Summary of Changes

### Configuration Structure Enhancement

Extend the grouped tag configuration in `package.json` to support additional optional styling properties for each tag:

-   **border**: Style borders (left-only or full)
-   **headerBar**: Top accent bar
-   **footerBar**: Bottom accent bar
-   **cornerBadge**: Corner badge with text

### Styling Priority

-   Use the **first tag** found in the title (order of appearance) for styling
-   The existing `extractFirstTag()` function already handles this
-   Columns and cards will get styled based on their first tag only

### CSS Generation Update

Enhance `generateTagStyles()` in `boardRenderer.js` to generate CSS for:

-   Border variants (left vs full)
-   Header/footer bars (absolutely positioned elements)
-   Corner badges (::before/::after pseudo-elements)

## Example Configuration

## Summary of Changes

### Configuration Structure Enhancement

Extend the grouped tag configuration in `package.json` to support additional optional styling properties for each tag:

-   **border**: Style borders (left-only or full)
-   **headerBar**: Top accent bar
-   **footerBar**: Bottom accent bar
-   **cornerBadge**: Corner badge with text

### Styling Priority

-   Use the **first tag** found in the title (order of appearance) for styling
-   The existing `extractFirstTag()` function already handles this
-   Columns and cards will get styled based on their first tag only

### CSS Generation Update

Enhance `generateTagStyles()` in `boardRenderer.js` to generate CSS for:

-   Border variants (left vs full)
-   Header/footer bars (absolutely positioned elements)
-   Corner badges (::before/::after pseudo-elements)

## Example Configuration

```
"markdown-kanban.tagColors": {
  "type": "object",
  "default": {
    "status": {
      "urgent": {
        "light": {
          "text": "#ffffff",
          "background": "#dc3545"
        },
        "dark": {
          "text": "#000000",
          "background": "#ff7b89"
        },
        "border": {
          "style": "dashed",      // solid, dashed, dotted, double
          "width": "3px",
          "position": "left",      // left, full
          "color": "#ff0000"       // optional, defaults to background color
        },
        "headerBar": {
          "height": "4px",
          "color": "#ff0000",      // optional, defaults to background color
          "style": "solid"         // solid, gradient
        },
        "footerBar": {
          "height": "3px",
          "color": "#ff0000",
          "text": "URGENT",         // optional text overlay
          "textColor": "#ffffff"
        },
        "cornerBadge": {
          "text": "!",
          "position": "top-right",  // top-left, top-right, bottom-left, bottom-right
          "style": "circle",        // circle, square, ribbon
          "color": "#ff0000",       // background color
          "textColor": "#ffffff"
        }
      }
    }
  }
}
```

## Implementation Approach

### 1\. **Enhanced CSS Generation**

Modify `generateTagStyles()` to check for additional properties and generate corresponding CSS:

```
// For each tag with additional styles:
// - Generate border CSS based on position (left vs full)
// - Add ::before pseudo-element for headerBar
// - Add ::after pseudo-element for footerBar  
// - Add positioned div for cornerBadge (using data attribute for text)
```

### 2\. **Menu Generation**

Update `generateTagMenuItems()` to handle grouped structure:

-   Iterate through groups (status, type, priority, etc.)
-   Create nested submenus for each group
-   Keep the same checkbox toggle functionality

### 3\. **Tag Application**

No changes needed - existing functions already:

-   Apply `data-column-tag` and `data-task-tag` attributes
-   Use `extractFirstTag()` to get the first tag for styling
-   Toggle tags via `toggleColumnTag()` and `toggleTaskTag()`

### 4\. **CSS Classes Generated**

```
/* Border - left only */
.kanban-column[data-column-tag="urgent"] {
  border-left: 3px dashed #ff0000 !important;
}

/* Border - full */
.task-item[data-task-tag="urgent"] {
  border: 3px dashed #ff0000 !important;
}

/* Header bar */
.kanban-column[data-column-tag="urgent"]::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: #ff0000;
}

/* Footer bar with text */
.task-item[data-task-tag="urgent"]::after {
  content: 'URGENT';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 20px;
  background: #ff0000;
  color: #ffffff;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Corner badge */
.task-item[data-task-tag="urgent"] .corner-badge {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #ff0000;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 12px;
}
```

The implementation reuses existing tag detection and only extends the CSS generation to include these new style properties.


---

can you modify the code so it doesnt inject the tag headers, footers and badges, but renders them directly with the rest of the content? explain your planned changes first without editing the sourcecode. keep the changes as minimal as possible. dont change or add any addtional features. dont add failsaves or backup solutions. keep the changes as minimal as possible.

---


please write the corresponding code. Always write out full functions and where they should be added to. dont change the way the markdown is saved, except for adding the tags for the columns. explicitly mention functions that can be removed or simplified.

---

can you modify the code so it doesnt inject the tag headers, footers and badges, but renders them directly with the rest of the content? explain your planned changes first without editing the sourcecode. keep the changes as minimal as possible. dont change or add any addtional features. dont add failsaves or backup solutions.

---

can you add a configuration option to limit the row size. a setting of 0 means that it's the full cards height, other values limit the height. keep the changes as minimal as possible. dont change or add any addtional features. dont add failsaves or backup solutions. dont change any styles apart from the maximum row height.

---

is it possible to check if a (internal / relative file) link could be successfully opened? if so, i'd like a system that tries to fix the link by searching for the filename (similar to the meta+p keypress). afterwards use the found file to fix the link. explain the changes that would be needed without implementing it. use the dry programming methods. keep changes as minimal as possible.

-

add a ui if the file is not found, let the user choose a replacement file (already start searching), when hovering the found file - if possible - show a preview of the file. if escape is pressed, abort leave everything as it was. if a file is selected add the new link in the same style as the original, mark the original link with old link to strike it trough. dont extend or modify the current file resolution mechanisms apart from adding the search and replacement discussed. use dry programming. keep changes as minimal as possible. dont change any existing features apart from what is absolutely necessary. dont modify the markdown in any other way. dont add any fallbacks or failsaves. allways write out full functions if they are modfied and where to make a change, especially if the change is not very obvious.

-

the interface looks good, also the message, however the fixed link is not added to the markdown. keep changes as minimal as possible. dont change any existing features apart from what is absolutely necessary. dont modify the markdown in any other way. dont add any fallbacks or failsaves. allways write out full functions if they are modfied and where to make a change, especially if the change is not very obvious.

---

there are multiple bugs in the code:

in the column burger menu:

insert list before doesnt work anymore (it should just add an empty list, left of the current list)

insert list after is not correctly working (it should not show a overlay, but just add an empty list right of the current list)

copy as markdown should close the menu after pressing it (it currently stays open)

Sort by "Title" doesnt work if a title is empty

if a file is put into background (by opening another view) or selecting another view in split view screen. the folding of the board is reset (all are open).

keep changes as minimal as possible. dont change any existing features apart from what is absolutely necessary. dont modify the markdown in any other way. dont add any fallbacks or failsaves. allways write out full functions if they are modfied and where to make a change, especially if the change is not very obvious.

---

can you add a feature similar to the tags, but using dates such as (European date style) @2024-09-04 . also add a sorting feature that works using tags #sort-bydate in column headers, #sort-byname which is stored in the markdown file and automatically sorts on pressing a "sort" button in the file-header. also add #sort-today (gathering all cards with dates with todays date) #gather-next3days (gather all cards with dates in the next 3 days) #sort-next7days, #gather-overdue . #gather-xxx gathers all cards which have @xxx in it. @xxx should be person names. the tags might be combined. they are handled in reverse order of appearance.

keep changes as minimal as possible. dont change any existing features apart from what is absolutely necessary. dont modify the markdown in any other way. dont add any fallbacks or failsafes. when implementing code always write out full functions if they are modified and where to make a change, especially if the change is not very obvious. use DRY programming .. add only comments in the code to explain the code, not the mention whats new. ont add any fallbacks or failsaves. allways write out full functions if they are modfied and where to make a change, especially if the change is not very obvious.

 explain your planned changes first without editing the sourcecode!

 -

also add an #unsorted and an #ungathered tag that can be added to columns to gather cards which could not be applied to any other column. when executing the sorting handle all cards that have at least an @DATE or an @NAME , try to match it to eighter #gather tags. update the plan

- 

if a card cannot be sorted to any column, let it stay where it is

-


please write the corresponding code. Always write out full functions and where they should be added to. dont change the way the markdown is saved, except for adding the tags for the columns or the dates added by the user. explicitly mention functions that can be removed or simplified.

keep changes as minimal as possible. dont change any existing features apart from what is absolutely necessary. dont modify the markdown in any other way. dont add any fallbacks or failsaves. allways write out full functions if they are modfied and where to make a change, especially if the change is not very obvious.


---

make the #gather function to include equal and larger smaller then funtions as well as or and "and". for example #gather_day=1 (tomorrow) #gather_day=-1 (yesterday) #gather_day=mon (mondays), #gather_1

- 

make the #gather function to include equal and larger smaller then funtions as well as or and "and". for example #gather_dayoffset=1 (tomorrow) #gather_dayoffset=-1 (yesterday) #gather_weekday=mon (mondays), #gather_1<dayoffset&dayoffset<3 (and), #gather_dayoffset=2|dayoffset=3 (or) , also include month, weekdaynum (1 to 7, starting monday), weekday (mon, tue,wed). include the and and or also in the person handling #gather_reto&anita where both tags are requred, or #gather_karl|bruno where either one is enough. give me examples what might also be useful to include, but dont expand to complex methods. "and", "or", "equal", "larger", "smaller" is the basic requirement.

keep changes as minimal as possible. dont change any existing features apart from what is absolutely necessary. dont modify the markdown in any other way. dont add any fallbacks or failsafes. when implementing code always write out full functions if they are modified and where to make a change, especially if the change is not very obvious. use DRY programming .. add only comments in the code to explain the code, not the mention whats new. ont add any fallbacks or failsaves. allways write out full functions if they are modfied and where to make a change, especially if the change is not very obvious.

explain your planned changes first without editing the sourcecode!

 ---

verify the #gather functionality. only allow #gather (not #gather-) also everything until the next space is part of the gather tag (including & | < > !). currently all @DATE @PERSON end up in the #ungathered column. analyze the problem carefully and find a solution to the problems. consider that a card might have multiple @PERSON tags (but generally should only have one @DATE tag). so #gather_reto&anita should work or #gather_karl|bruno (or). the same for #gather_3<dayoffset&dayoffset<5 or #gather_dayoffset=1|dayoffset=2 (tomorrow and the next day)

---

@TAGS
- everything until a space is part of the @TAG 
- there are @DUEDATE tags @2025-03-27 or @due=2025-03-27
- - there might be other @DATE tags such as done, modified, start and end added in the future.
- - only the first @DATE tag of each type is handled. 
- - a DATE tag must start with @datetype: followed by the date format (european), it might be shortened to @2025-1-17
- there are @PERSON tags @Reto , a card might have multiple of these tags
- - Person tags are those which dont follow the date tag structure (@xxx:dateformat)
- - - dateformat might change in the future or might be extended
- @sticky is a special tag which makes a card stick to it's column and position.

#gather_ TAGS
- gather tags allways exaclty start with #gather_
- the gather is a tag that only works in a column header.
- the gather tag ends with a space and nothing else (include any special characters)
- gather tags gather @TAGS under the column.
- the part following the gather tag is the rules of the tag
- gather tags can have multiple parameters
- - PERSON
- - DUEDATE (a date without specification is a DUEDATE)
- - - A duedate can be handled in different ways. such as:
- - - - dayoffset or day : offset of the day from today (system local time)
- - - - weekdaynum : number of day of week from 1 (monday) to 7 (sunday)
- - - - weekday : mon, tue, wed, ...
- - - - month : jan, feb
- - - - monthnum : 1 .. 12
- - - - others might be added here in the future
- there is a #ungathered tag which is a fallback
- gather tags have functions
- - AND &
- - OR | (if there are multiple gather tags in a column header combine them by OR)
- - LARGERTHEN >
- - SMALLERTHEN <
- - NOT !
- - EQUAL =
- - UNEQUAL !=
- the combination of parameters and functions can be like this
- - #gather_Reto : gathers all @PERSON tags where the name is Reto
- - #gather_Reto|Anita : gathers all @PERSON tags where the name is Reto or Anita
- - #gather_day=0 : all dates which are todays date
- - #gather_0<day&day<3 : tomorrow and the next day, but nothing before or after
- - #gather_weekday=1 | all mondays
- - #gather_reto&weekday=1 | @PERSON is Reto and @DUEDATE is monday
- - #gather_1<day&day<6&weekday!=2 : in 2 days up until in 5 days but not tuesdays
- - if there is anything unclear ask first before implementing it!

the gather sorting mechanism must work like this. The sorting is activated by pressing the sort button:
- all cards are gathered in a list, storing the source column with them.
- all @TAGS are extracted (can be done before, but at least we now need them)
- all columns are gathered in a list
- all columns rules are stored in a ordered list
- all cards are matched against the rules of the columns
- - the card is put into the column with the first exact match where all rules of the column apply. any further rules are ignored
- - if a card cannot be matched against any rules:
- - - it first goes into the #ungathered column if it exists
- - - it stays in it's original column