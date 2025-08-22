# Kanban Markdown for Visual Studio Code & VSCodium

Compatible with the Kanban Obsidian Markdown format from https://github.com/mgmeyers/obsidian-kanban.

A VS Code extension that allows editing Markdown files as an interactive Kanban board.

It's mostly coded using Claude Code, based on the previous version if found online.

I use it myself and found no similar extension that fulfilled my needs. 

## Features

### Basic Features

- **Markdown Parsing**: Automatically parses task lists from Markdown files.
- **Kanban View**: Displays tasks in a Kanban board format with multi-column layout.
- **Drag & Drop**: Supports dragging and dropping tasks between different columns. Proper movement and displaying of card and column movements. however they seem to be placed on top/bottom incoherently.
- **Real-time Sync**: Ensures real-time, two-way synchronization between the Kanban board and the Markdown file.
- **Undo & Redo**
- **Image & File dropping** creates new cards
- **Tab** from Card Title switches to Description. From Description it ends editing.
- **Locking the file** so switching the md doesnt change the kaban view.

### Required Format

Requires a YAML header with 'kanban-plugin: board'
Add a H2 Title (Boards) and Tasks (Cards) below it.

```
---

kanban-plugin: board

---

## Title of Board
- [ ] Card
  Text of Card
- [ ] Next Card
  Content of Card
```

### Installation

1. Download the vsix and install

### How to Use

Press the "Kanban" button on the top right.

### Open Issues

Drag & Dropping Files from outside the editor doesnt create a correct path. Caused by https://github.com/microsoft/vscode-discussions/discussions/1663 
