# Rendering Systems Documentation

This document outlines the responsibilities of different rendering systems in the markdown-kanban extension to prevent conflicts and guide future development.

## Overview

The extension uses a **two-stage rendering pipeline**:
1. **Backend (Server-Side)** - VSCode Extension Host
2. **Frontend (Browser-Side)** - Webview

---

## 🔧 Backend Rendering System (Server-Side)

**Location**: VSCode Extension Host
**Primary Files**:
- `src/markdownParser.ts`
- `engine.js` (for Marp export only)

### Responsibilities:

#### ✅ **File System Operations**
- **Include Processing** (`!!!include(file.md)!!!`)
  - Reads files from disk with `fs.readFileSync()`
  - Expands include statements with actual file content
  - Adds proper 2-space indentation for card content
  - Tracks included files for file watching
- **File Change Detection** - Monitors included files for changes

#### ✅ **Board Structure Parsing**
- **Markdown Structure Analysis**
  - YAML front matter parsing (`---`)
  - Column parsing (`## Column Name`)
  - Task parsing (`- [ ] Task Title`)
  - Description collection (indented content)
- **ID Generation** - Runtime UUIDs for board elements
- **Task Data Management**
  - `rawDescription` - Original content with include statements (for editing)
  - `description` - Processed content with includes expanded (for display)

#### ✅ **Data Persistence**
- **Markdown Generation** - Converts board back to markdown
- **Save Operations** - Writes changes back to `.md` files
- **Backup Management** - Handles file backup/restore

#### ❌ **NOT Handled by Backend**
- **Visual Styling** (CSS, borders, colors)
- **Interactive Features** (drag-drop, editing UI)
- **Real-time Rendering** (markdown-to-HTML conversion)

---

## 🎨 Frontend Rendering System (Browser-Side)

**Location**: Webview (Browser Context)
**Primary Files**:
- `src/html/markdownRenderer.js`
- `src/html/boardRenderer.js`
- `src/html/*.js` (UI logic)
- `src/html/webview.css` (styling)

### Responsibilities:

#### ✅ **Visual Rendering**
- **HTML Generation** - Converts markdown to HTML for display
- **CSS Styling** - All visual appearance (borders, colors, spacing)
- **Responsive Design** - Layout adaptation for different screen sizes
- **Theme Integration** - VSCode theme variables and colors

#### ✅ **Markdown Processing (Display Only)**
- **Core Markdown** - Headings, lists, emphasis, code blocks
- **Extended Markdown Plugins**:
  - `markdown-it-mark` - ==highlighting==
  - `markdown-it-sub` - H~2~O subscript
  - `markdown-it-sup` - 29^th^ superscript
  - `markdown-it-ins` - ++inserted++ text
  - `markdown-it-strikethrough-alt` - --strikethrough--
  - `markdown-it-underline` - _underline_
  - `markdown-it-abbr` - abbreviations
  - `markdown-it-container` - custom containers
  - `markdown-it-multicolumn` - multi-column layouts
  - `markdown-it-emoji` - :smile: → 😊
  - `markdown-it-footnote` - footnote support

#### ✅ **Interactive Features**
- **Task Editing** - Inline editing UI
- **Drag & Drop** - Card/column reordering
- **Search & Filter** - Board content filtering
- **Menu Operations** - Context menus and toolbar actions

#### ✅ **Real-time Updates**
- **Live Preview** - Immediate markdown rendering during editing
- **Board State Management** - Maintains current board state
- **Event Handling** - User interactions and state changes

#### ❌ **NOT Handled by Frontend**
- **File System Access** (CSP restrictions)
- **Include File Processing** (no disk access)
- **Persistent Data Storage** (only temporary state)

---

## 🔄 Data Flow Pipeline

### Initial Load:
```
1. Backend: Parse .md file structure → KanbanBoard object
2. Backend: Process !!!include() statements → Expand content
3. Backend: Send board data to webview
4. Frontend: Render board as HTML/CSS
5. Frontend: Apply markdown processing to task descriptions
6. Frontend: Display interactive UI
```

### User Editing:
```
1. Frontend: User edits task description
2. Frontend: Update local board state
3. Frontend: Send changes to backend
4. Backend: Update board data
5. Backend: Save to .md file (using rawDescription)
```

### Include Refresh:
```
1. Backend: File watcher detects include file change
2. Backend: Show refresh button in UI
3. User: Clicks refresh button
4. Backend: Re-parse .md with fresh include content
5. Backend: Send updated board to webview
6. Frontend: Re-render with new content
```

---

## 🚨 Current Architecture Decisions

### ✅ **Single Responsibility Principle**
- **Backend**: File operations, data parsing, persistence
- **Frontend**: Visual rendering, user interaction, styling

### ✅ **Include Processing: Server-Side Only**
- **Rationale**: Only backend has file system access
- **Implementation**: `src/markdownParser.ts` processIncludes()
- **Browser Plugin Status**: Removed to prevent conflicts

### ✅ **Dual Description Storage**
- **`rawDescription`**: Original content with include statements (editing)
- **`description`**: Processed content with includes expanded (display)
- **Rationale**: Preserves editability while showing expanded content

---

## 🛠️ Future Development Guidelines

### When Adding New Features:

#### **Add to Backend If:**
- Requires file system access
- Needs to persist data
- Involves parsing markdown structure
- Requires processing external files

#### **Add to Frontend If:**
- Visual styling or layout
- User interaction features
- Real-time preview functionality
- Markdown-to-HTML rendering enhancements

### **Border/Styling Example:**
- ❌ **Don't**: Add border logic to backend (no CSS capability)
- ✅ **Do**: Add border CSS classes in `webview.css`
- ✅ **Do**: Add border logic in `boardRenderer.js` or `markdownRenderer.js`

---

## 🔍 Plugin Status Reference

| Plugin | Backend (engine.js) | Frontend (webview) | Status |
|--------|--------------------|--------------------|--------|
| markdown-it-include | ❌ Not used | ❌ Removed | Server-side only |
| markdown-it-mark | ✅ Available | ✅ Active | Dual support |
| markdown-it-sub | ✅ Available | ✅ Active | Dual support |
| markdown-it-sup | ✅ Available | ✅ Active | Dual support |
| markdown-it-ins | ✅ Available | ✅ Active | Dual support |
| markdown-it-strikethrough-alt | ✅ Available | ✅ Active | Dual support |
| markdown-it-underline | ✅ Available | ✅ Active | Dual support |
| markdown-it-abbr | ✅ Available | ✅ Active | Dual support |
| markdown-it-container | ✅ Available | ✅ Active | Dual support |
| markdown-it-multicolumn | ❌ Not available | ✅ Active | Frontend only |
| markdown-it-emoji | ❌ Not available | ✅ Active | Frontend only |
| markdown-it-footnote | ❌ Not available | ✅ Active | Frontend only |

---

## 📝 Quick Reference

### **Backend Capabilities:**
- ✅ File I/O, parsing, persistence, include processing
- ❌ Visual styling, CSS, interactive UI

### **Frontend Capabilities:**
- ✅ HTML rendering, CSS styling, user interaction, markdown display
- ❌ File system access, persistent storage, include file reading

### **Border/Styling Answer:**
**Borders and visual styling must be handled by the frontend rendering system** (`webview.css`, `boardRenderer.js`, `markdownRenderer.js`). The backend cannot add CSS or visual styling - it only handles data processing and file operations.