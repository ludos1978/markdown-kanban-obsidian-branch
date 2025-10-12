# Markdown Kanban Obsidian - AI Coding Agent Instructions

## Project Overview
VS Code extension that transforms markdown files into interactive Kanban boards, compatible with Obsidian's Kanban plugin format. The system uses a **cache-first architecture** with runtime-only UUID identification.

## Critical Architecture Principles

### Cache-First Data Flow
```
User Action → Update Cache → Mark Unsaved → Manual Save (Cmd+S) → Update Markdown
```
- **Frontend cache** (`window.cachedBoard`) is the single source of truth for UI
- **Backend board** (`this._board`) syncs with frontend on save operations
- **Never auto-save** - only save on explicit user action (Cmd+S, panel close with dialog)
- Changes marked via `_markUnsavedChanges(true)` - NOT direct saves

### UUID System (Session-Scoped)
- Column IDs: `col-{uuid}` - generated fresh each session
- Task IDs: `task-{uuid}` - runtime-only, never persisted to markdown
- UUIDs enable reliable drag-drop and menu targeting during session

### Three Include Systems (NO OTHERS)
1. **Regular includes** (`!!!include(file.md)!!!`) - Frontend markdown-it plugin, read-only
2. **Column includes** (`!!!columninclude(file.md)!!!`) - Backend parsing, creates columns from presentation files
3. **Task includes** (`!!!taskinclude(file.md)!!!`) - Backend parsing, individual task content

## Development Workflow

### Build & Watch
```bash
npm run watch          # Runs both TypeScript and esbuild watchers
npm run compile        # One-time build with type checking
```

### Testing
```bash
npm test               # Run test suite
npm run watch-tests    # Watch mode for tests
```

### Key Files & Patterns
- `src/messageHandler.ts` - Central message routing between frontend/backend
- `src/kanbanWebviewPanel.ts` - Main panel lifecycle and coordination
- `src/html/webview.js` - Frontend cache management and UI operations
- `src/fileStateManager.ts` - Unified file state tracking (singleton pattern)

## Project-Specific Conventions

### Logging
- Format: `[kanban.functionname.topic-debug-label]`
- Only log data modifications, minimize event-triggered logs
- Remove unnecessary logs except errors/warnings

### Path Handling
- **Relative paths** for main kanban file storage
- **Include files** use paths relative to their own location
- URL encode paths with spaces/special characters

### Save/Conflict Management
- Default action is "do nothing" (no auto-save/reload)
- Escape key re-shows dialogs
- Conflict backups: `{filename}-conflict-{timestamp}.md`

### Code Style Rules (STRICT)
- **KISS principle** - simplest implementation always
- **No mock/demo code** - only fully functional implementations
- **No alternative implementations** - one way to do things
- **No unsolicited features** - implement only what's requested
- **Single source of truth** - no data duplication within layers

### Git Workflow
1. Create branch for new features
2. Commit before/after cleanups
3. Merge to main when complete
4. Store working notes in `./tmp/` (gitignored)

## Common Pitfalls to Avoid
- Don't use `_onSaveToMarkdown()` for regular operations - use cache-first
- Don't persist UUIDs to markdown files
- Don't auto-save on every change
- Don't create new include mechanisms beyond the three existing ones
- Don't modify save data without user permission

## Testing Patterns
- Test files in `tests/` directory contain various kanban formats
- Use `kanban-plugin: board` YAML header for valid kanban files
- Column format: `## Column Title`
- Task format: `- [ ] Task title\n  Task content`

## Extension Points
- Tag system for styling (row tags, stack tags, custom tags)
- Drag & drop for files/images creates new cards
- Export functionality (presentation format, asset packing)
- Marp integration for presentations (optional dependency)