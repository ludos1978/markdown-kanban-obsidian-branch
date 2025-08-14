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
- a one line Title in Markdown Format
- a handle to change the order of columns by dragging
- a integer with the number of cards 
- a donut menu with the items:
    - "insert list before"
    - "insert list after"
    - "delete list"
    - "sort by" with an item as a selectable list item 
        - unsorted
        - "sort by title"

Each card is a subitem to this list. 

Each Cards first line is structured like this:
- Title of the card formatted as markdown
- A handle to change order of the cards
The Second line contains:
- the Description (if it has any) on any number of lines necessary is markdown format.
- right aligned is a donut menu with the items:
    - duplicate card
    - insert card before
    - insert card after
    - move to top
    - move up
    - move down
    - move to bottom
    - delete card
    - move to list
        - a list of all columns

Notes:
- the scrolled position should be kept stable when starting to edit or stopping to edit. Also