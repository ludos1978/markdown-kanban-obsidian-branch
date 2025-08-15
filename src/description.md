# app description

the app is a visual studio code plugin. it's a kanban board editor that saves it's data in markdown compatible format.

the format is like this:"""
---

kanban-plugin: board

---

## Column Title

- [ ] Kanban Card 1
  Description
  in Markdown Format
- [ ] Kanban Card 2

## Column 2 Title

- [ ] Something

## Column 3 Title

## Column 4 Title

%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,null,false]}
```
%%
"""end of format example

The interface is structured as this:

The columns should have the following items in the first line (Title line):
- a handle (to change the order of columns by dragging)
- an collapse toggle, which changes the column to be labelelled vertically, and all cards are hidden.
- a one line Title in Markdown Format
- a integer with the number of cards 
- a donut menu with the items:
  - "insert list before"
  - "insert list after"
  - an empty space with a line (no functionality)
  - "move list"
  - an empty space with a line (no functionality)
  - "sort by" (with submenu items)
    - unsorted
    - "sort by title"
  - an empty space with a line (no functionality)
  - "delete list"

Each card is a subitem to this list. 

Each Cards first line is structured like this:
- A handle to change order of the cards
The Second line contains:
- A collapse toggle, which hides the description of the card.
- Title of the card formatted as markdown
- right aligned is a donut menu with the items:
  - insert card before
  - insert card after
  - duplicate card
  - an empty space with a line (no functionality)
  - move (with submenu items)
    - top
    - up
    - down
    - bottom
  - move to list (with submenu items)
    - a list of all columns
  - an empty space with a line (no functionality)
  - delete card

After that follows:
- the Description (if it has any) on any number of lines necessary is markdown format.

Notes:
- [ ] the scrolled position should be kept stable when starting to edit or stopping to edit.
- [ ] the card menu item "move to list" should open a separate submenu with all available columns (with the titles)
- [ ] the "sort by" menu should open a separate submenu, listing the sort options.
- [ ] the burger menu should be an overlay. not limited by the width of the div it's displayed in. 
- [x] the column title, card title, and card description must be editable directly by pressing on the corresponding text.
- [ ] move the "delete list" button to the column burger menu
- [ ] move the "delete card" button to the card burger menu
- [ ] the column handle should move the order of the columns
