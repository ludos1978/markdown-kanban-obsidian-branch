// Unified Menu System - Simple and DRY
console.log('Unified menu system loading...');

// Global state
let activeTagMenu = null;
let pendingTagChanges = {
    columns: new Map(),
    tasks: new Map()
};

// Simple Menu Manager - handles all menu types
class SimpleMenuManager {
    constructor() {
        this.activeSubmenu = null;
        this.hideTimeout = null;
    }

    // Safe button click handler - works for all button types without eval
    handleButtonClick(button, shouldCloseMenu = true) {
        console.log('Button clicked:', button.textContent.trim());
        
        // Get onclick attribute and parse it safely
        const onclick = button.getAttribute('onclick');
        if (onclick) {
            try {
                // Parse and execute without eval for security
                const executed = this.executeSafeFunction(onclick, button);
                if (executed) {
                    console.log('✅ Executed:', onclick);
                } else {
                    console.warn('Could not execute:', onclick);
                }
            } catch (error) {
                console.error('Failed to execute:', onclick, error);
            }
        }
        
        // Close submenu if requested
        if (shouldCloseMenu) {
            setTimeout(() => this.hideSubmenu(), 100);
        }
    }

    // Safe function execution without eval
    executeSafeFunction(functionString, element) {
        // Handle console.log statements (just ignore them)
        if (functionString.includes('console.log')) {
            functionString = functionString.replace(/console\.log\([^)]*\);?\s*/g, '');
        }
        
        // Handle window.tagHandlers pattern
        const tagHandlerMatch = functionString.match(/window\.tagHandlers\['([^']+)'\]\(([^)]*)\)/);
        if (tagHandlerMatch) {
            const handlerKey = tagHandlerMatch[1];
            const params = tagHandlerMatch[2];
            
            if (window.tagHandlers && window.tagHandlers[handlerKey]) {
                // Create event object if needed
                const event = params.includes('event') ? new Event('click') : undefined;
                window.tagHandlers[handlerKey](event);
                return true;
            }
        }
        
        // Handle common function patterns
        const patterns = [
            // Pattern: functionName('param1', 'param2', etc.)
            /^(\w+)\((.*)\)$/,
            // Pattern: object.method('param1', 'param2')
            /^(\w+)\.(\w+)\((.*)\)$/
        ];
        
        for (const pattern of patterns) {
            const match = functionString.match(pattern);
            if (match) {
                if (match.length === 3) {
                    // Simple function call
                    const funcName = match[1];
                    const params = this.parseParameters(match[2]);
                    
                    if (window[funcName] && typeof window[funcName] === 'function') {
                        window[funcName].apply(window, params);
                        return true;
                    }
                } else if (match.length === 4) {
                    // Object method call
                    const objName = match[1];
                    const methodName = match[2]; 
                    const params = this.parseParameters(match[3]);
                    
                    if (window[objName] && window[objName][methodName] && 
                        typeof window[objName][methodName] === 'function') {
                        window[objName][methodName].apply(window[objName], params);
                        return true;
                    }
                }
            }
        }
        
        // Handle multiple statements separated by semicolons
        if (functionString.includes(';')) {
            const statements = functionString.split(';').filter(s => s.trim());
            let allExecuted = true;
            for (const statement of statements) {
                if (statement.trim() && statement.trim() !== 'return false') {
                    if (!this.executeSafeFunction(statement.trim(), element)) {
                        allExecuted = false;
                    }
                }
            }
            return allExecuted;
        }
        
        return false; // Could not execute
    }

    // Helper method to parse function parameters safely
    parseParameters(paramString) {
        if (!paramString || !paramString.trim()) return [];
        
        const params = [];
        let current = '';
        let inQuotes = false;
        let quoteChar = '';
        
        for (let i = 0; i < paramString.length; i++) {
            const char = paramString[i];
            
            if (!inQuotes && (char === '"' || char === "'")) {
                inQuotes = true;
                quoteChar = char;
                current += char;
            } else if (inQuotes && char === quoteChar) {
                inQuotes = false;
                current += char;
            } else if (!inQuotes && char === ',') {
                params.push(this.parseValue(current.trim()));
                current = '';
            } else {
                current += char;
            }
        }
        
        if (current.trim()) {
            params.push(this.parseValue(current.trim()));
        }
        
        return params;
    }
    
    // Helper method to parse individual parameter values
    parseValue(value) {
        const trimmed = value.trim();
        
        // String values
        if ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
            (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
            return trimmed.slice(1, -1);
        }
        
        // Number values
        if (!isNaN(trimmed) && trimmed !== '') {
            return Number(trimmed);
        }
        
        // Boolean values
        if (trimmed === 'true') return true;
        if (trimmed === 'false') return false;
        if (trimmed === 'null') return null;
        if (trimmed === 'undefined') return undefined;
        
        // Return as string for everything else
        return trimmed;
    }

    // Show submenu - unified approach
    showSubmenu(menuItem, id, type, columnId = null) {
        this.hideSubmenu(); // Clear any existing

        const submenu = document.createElement('div');
        submenu.className = 'donut-menu-submenu dynamic-submenu';
        
        // Create content based on submenu type
        submenu.innerHTML = this.createSubmenuContent(menuItem, id, type, columnId);
        
        // Style and position
        submenu.style.cssText = `
            position: fixed;
            z-index: 100000;
            pointer-events: all;
            visibility: hidden;
            display: flex;
        `;
        
        menuItem.appendChild(submenu);
        this.setupSubmenuEvents(submenu);
        this.activeSubmenu = submenu;
        
        return submenu;
    }

    // Create submenu content - simplified
    createSubmenuContent(menuItem, id, type, columnId) {
        const submenuType = menuItem.dataset.submenuType;
        
        switch (submenuType) {
            case 'tags':
                return this.createTagContent(menuItem.dataset.group, id, type, columnId);
            case 'move':
                return `
                    <button class="donut-menu-item" onclick="moveTaskToTop('${id}', '${columnId}')">Top</button>
                    <button class="donut-menu-item" onclick="moveTaskUp('${id}', '${columnId}')">Up</button>
                    <button class="donut-menu-item" onclick="moveTaskDown('${id}', '${columnId}')">Down</button>
                    <button class="donut-menu-item" onclick="moveTaskToBottom('${id}', '${columnId}')">Bottom</button>
                `;
            case 'move-to-list':
                return this.createMoveToListContent(id, columnId);
            case 'sort':
                return `
                    <button class="donut-menu-item" onclick="sortColumn('${columnId}', 'unsorted')">Unsorted</button>
                    <button class="donut-menu-item" onclick="sortColumn('${columnId}', 'title')">Sort by title</button>
                `;
            default:
                return '';
        }
    }

    // Create tag content - simplified
    createTagContent(group, id, type, columnId) {
        if (window.generateGroupTagItems) {
            const tagConfig = window.tagColors || {};
            let tags = [];
            
            if (group === 'custom') {
                tags = window.getUserAddedTags ? window.getUserAddedTags() : [];
            } else {
                const groupValue = tagConfig[group];
                if (groupValue && typeof groupValue === 'object') {
                    if (groupValue.light || groupValue.dark) {
                        tags = [group];
                    } else {
                        tags = Object.keys(groupValue).filter(key => {
                            const val = groupValue[key];
                            return val && typeof val === 'object' && (val.light || val.dark);
                        });
                    }
                }
            }
            
            return window.generateGroupTagItems(tags, id, type, columnId, group !== 'custom');
        }
        return '<div>No tags available</div>';
    }

    // Create move to list content
    createMoveToListContent(taskId, columnId) {
        const currentBoard = window.currentBoard;
        if (!currentBoard?.columns) return '';
        
        return currentBoard.columns
            .filter(col => col.id !== columnId)
            .map(col => `<button class="donut-menu-item" onclick="moveTaskToColumn('${taskId}', '${columnId}', '${col.id}')">${window.escapeHtml ? window.escapeHtml(col.title || 'Untitled') : col.title || 'Untitled'}</button>`)
            .join('');
    }

    // Setup submenu events - unified approach
    setupSubmenuEvents(submenu) {
        // Add click handlers to all buttons
        submenu.querySelectorAll('button').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // Tag chips don't close menu, others do
                const shouldClose = !button.classList.contains('donut-menu-tag-chip');
                this.handleButtonClick(button, shouldClose);
            });
        });

        // Hover management
        submenu.addEventListener('mouseenter', () => this.clearTimeout());
        submenu.addEventListener('mouseleave', () => this.startHideTimer());
    }

    // Smart positioning that handles viewport boundaries
    positionSubmenu(menuItem, submenu) {
        const rect = menuItem.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Get submenu dimensions by temporarily showing it
        submenu.style.visibility = 'hidden';
        submenu.style.display = 'flex';
        const submenuRect = submenu.getBoundingClientRect();
        const submenuWidth = submenuRect.width || 250;
        const submenuHeight = submenuRect.height || 300;
        
        // Calculate horizontal position
        let left = rect.right - 1; // 1px overlap for easy mouse movement
        
        // If submenu goes off right edge, position to the left of menu item
        if (left + submenuWidth > viewportWidth - 10) {
            left = rect.left - submenuWidth + 1; // 1px overlap on left side
        }
        
        // Final horizontal boundary check
        if (left < 10) {
            left = 10;
        }
        if (left + submenuWidth > viewportWidth - 10) {
            left = viewportWidth - submenuWidth - 10;
        }
        
        // Calculate vertical position
        let top = rect.top; // Align with menu item top
        
        // If submenu goes off bottom edge, move it up
        if (top + submenuHeight > viewportHeight - 10) {
            top = viewportHeight - submenuHeight - 10;
        }
        
        // If still off top edge (very tall submenu), align with viewport top
        if (top < 10) {
            top = 10;
        }
        
        // Apply final positioning
        submenu.style.left = left + 'px';
        submenu.style.top = top + 'px';
        submenu.style.visibility = 'visible';
    }

    // Timeout management
    startHideTimer() {
        this.clearTimeout();
        this.hideTimeout = setTimeout(() => this.hideSubmenu(), 300);
    }

    clearTimeout() {
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }
    }

    // Hide submenu
    hideSubmenu() {
        this.clearTimeout();
        if (this.activeSubmenu) {
            this.activeSubmenu.remove();
            this.activeSubmenu = null;
        }
        document.querySelectorAll('.dynamic-submenu').forEach(s => s.remove());
    }
}

// Global menu manager instance
window.menuManager = new SimpleMenuManager();

// Simplified donut menu toggle
function toggleDonutMenu(event, button) {
    event.stopPropagation();
    const menu = button.parentElement;
    const wasActive = menu.classList.contains('active');
    
    // Close all menus
    document.querySelectorAll('.donut-menu, .file-bar-menu').forEach(m => {
        m.classList.remove('active');
    });
    
    if (!wasActive) {
        menu.classList.add('active');
        activeTagMenu = menu;
        
        const dropdown = menu.querySelector('.donut-menu-dropdown');
        if (dropdown) {
            positionDropdown(button, dropdown);
            setupMenuHoverHandlers(menu, dropdown);
        }
    }
}

// Setup hover handlers for menu items
function setupMenuHoverHandlers(menu, dropdown) {
    dropdown.querySelectorAll('.donut-menu-item.has-submenu').forEach(menuItem => {
        menuItem.addEventListener('mouseenter', () => {
            window.menuManager.clearTimeout();
            
            const submenu = window.menuManager.showSubmenu(
                menuItem, 
                menuItem.dataset.id, 
                menuItem.dataset.type, 
                menuItem.dataset.columnId
            );
            
            if (submenu) {
                window.menuManager.positionSubmenu(menuItem, submenu);
            }
        });
        
        menuItem.addEventListener('mouseleave', () => {
            window.menuManager.startHideTimer();
        });
    });
    
    // Menu-level hover handlers
    dropdown.addEventListener('mouseenter', () => window.menuManager.clearTimeout());
    dropdown.addEventListener('mouseleave', () => {
        setTimeout(() => {
            if (pendingTagChanges.columns.size + pendingTagChanges.tasks.size > 0) {
                flushPendingTagChanges();
            }
            menu.classList.remove('active');
            activeTagMenu = null;
        }, 400);
    });
}

// Simple dropdown positioning
function positionDropdown(triggerButton, dropdown) {
    const rect = triggerButton.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let left = rect.right - 180;
    let top = rect.bottom + 5;
    
    if (left < 10) left = 10;
    if (left + 180 > viewportWidth - 10) left = viewportWidth - 190;
    if (top + 300 > viewportHeight - 10) top = rect.top - 300;
    if (top < 10) top = 10;
    
    dropdown.style.left = left + 'px';
    dropdown.style.top = top + 'px';
}

// File bar menu toggle (similar pattern)
function toggleFileBarMenu(event, button) {
    event.stopPropagation();
    const menu = button.parentElement;
    const wasActive = menu.classList.contains('active');
    
    document.querySelectorAll('.file-bar-menu, .donut-menu').forEach(m => {
        m.classList.remove('active');
    });
    
    if (!wasActive) {
        menu.classList.add('active');
        const dropdown = menu.querySelector('.file-bar-menu-dropdown');
        if (dropdown) {
            positionFileBarDropdown(button, dropdown);
        }
    }
}

function positionFileBarDropdown(triggerButton, dropdown) {
    const rect = triggerButton.getBoundingClientRect();
    const left = Math.max(10, rect.right - 200);
    const top = rect.bottom + 4;
    
    dropdown.style.left = left + 'px';
    dropdown.style.top = top + 'px';
}

// Column operations - keep existing functions
function insertColumnBefore(columnId) {
    document.querySelectorAll('.donut-menu').forEach(menu => menu.classList.remove('active'));
    vscode.postMessage({ type: 'insertColumnBefore', columnId, title: '' });
}

function insertColumnAfter(columnId) {
    document.querySelectorAll('.donut-menu').forEach(menu => menu.classList.remove('active'));
    vscode.postMessage({ type: 'insertColumnAfter', columnId, title: '' });
}

function moveColumnLeft(columnId) {
    if (!currentBoard?.columns) return;
    const index = currentBoard.columns.findIndex(c => c.id === columnId);
    if (index > 0) {
        const column = currentBoard.columns[index];
        const currentRow = getColumnRow(column.title);
        vscode.postMessage({
            type: 'moveColumnWithRowUpdate',
            columnId,
            newPosition: index - 1,
            newRow: currentRow
        });
    }
}

function moveColumnRight(columnId) {
    if (!currentBoard?.columns) return;
    const index = currentBoard.columns.findIndex(c => c.id === columnId);
    if (index < currentBoard.columns.length - 1) {
        const column = currentBoard.columns[index];
        const currentRow = getColumnRow(column.title);
        vscode.postMessage({
            type: 'moveColumnWithRowUpdate',
            columnId,
            newPosition: index + 1,
            newRow: currentRow
        });
    }
}

function deleteColumn(columnId) {
    vscode.postMessage({ type: 'deleteColumn', columnId });
}

function sortColumn(columnId, sortType) {
    vscode.postMessage({ type: 'sortColumn', columnId, sortType });
}

// Copy operations
function copyColumnAsMarkdown(columnId) {
    if (!currentBoard?.columns) return;
    const column = currentBoard.columns.find(c => c.id === columnId);
    if (!column) return;
    
    let markdown = `# ${column.title}\n`;
    column.tasks.forEach(task => {
        markdown += task.title.startsWith('#') ? 
            `\n---\n\n${task.title || ''}\n` : 
            `\n---\n\n## ${task.title || ''}\n`;
        if (task.description?.trim()) {
            markdown += `\n${task.description}\n`;
        }
    });
    
    copyToClipboard(markdown);
    document.querySelectorAll('.donut-menu').forEach(menu => menu.classList.remove('active'));
}

function copyTaskAsMarkdown(taskId, columnId) {
    if (!currentBoard?.columns) return;
    const column = currentBoard.columns.find(c => c.id === columnId);
    const task = column?.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    let markdown = task.title.startsWith('#') ? 
        `${task.title || ''}\n` : 
        `## ${task.title || ''}\n`;
    if (task.description?.trim()) {
        markdown += `\n${task.description}\n`;
    }
    
    copyToClipboard(markdown);
    document.querySelectorAll('.donut-menu').forEach(menu => menu.classList.remove('active'));
}

function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            vscode.postMessage({ type: 'showMessage', text: 'Copied to clipboard!' });
        }).catch(err => console.error('Failed to copy:', err));
    }
}

// Task operations
function duplicateTask(taskId, columnId) {
    vscode.postMessage({ type: 'duplicateTask', taskId, columnId });
}

function insertTaskBefore(taskId, columnId) {
    vscode.postMessage({ type: 'insertTaskBefore', taskId, columnId });
}

function insertTaskAfter(taskId, columnId) {
    vscode.postMessage({ type: 'insertTaskAfter', taskId, columnId });
}

function moveTaskToTop(taskId, columnId) {
    vscode.postMessage({ type: 'moveTaskToTop', taskId, columnId });
}

function moveTaskUp(taskId, columnId) {
    vscode.postMessage({ type: 'moveTaskUp', taskId, columnId });
}

function moveTaskDown(taskId, columnId) {
    vscode.postMessage({ type: 'moveTaskDown', taskId, columnId });
}

function moveTaskToBottom(taskId, columnId) {
    vscode.postMessage({ type: 'moveTaskToBottom', taskId, columnId });
}

function moveTaskToColumn(taskId, fromColumnId, toColumnId) {
    vscode.postMessage({ type: 'moveTaskToColumn', taskId, fromColumnId, toColumnId });
}

function deleteTask(taskId, columnId) {
    vscode.postMessage({ type: 'deleteTask', taskId, columnId });
}

function addTask(columnId) {
    vscode.postMessage({
        type: 'addTask',
        columnId,
        taskData: { title: '', description: '' }
    });
}

function addTaskAndUnfold(columnId) {
    const column = document.querySelector(`[data-column-id="${columnId}"]`);
    if (column?.classList.contains('collapsed')) {
        toggleColumnCollapse(columnId);
    }
    addTask(columnId);
}

function addColumn(rowNumber) {
    const title = (rowNumber && rowNumber > 1) ? `#row${rowNumber}` : '';
    vscode.postMessage({ type: 'addColumn', title });
}

// Tag operations - simplified
function toggleColumnTag(columnId, tagName, event) {
    console.log(`🏷️ Toggle column tag: ${columnId} -> ${tagName}`);
    
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    
    if (!window.currentBoard?.columns) {
        console.warn('No currentBoard or columns available');
        return;
    }
    const column = window.currentBoard.columns.find(c => c.id === columnId);
    if (!column) {
        console.warn(`Column not found: ${columnId}`);
        return;
    }
    
    const tagWithHash = `#${tagName}`;
    let title = column.title || '';
    const wasActive = new RegExp(`#${tagName}\\b`, 'gi').test(title);
    
    if (wasActive) {
        title = title.replace(new RegExp(`#${tagName}\\b`, 'gi'), '').replace(/\s+/g, ' ').trim();
    } else {
        const rowMatch = title.match(/(#row\d+)$/i);
        if (rowMatch) {
            const beforeRow = title.substring(0, title.length - rowMatch[0].length).trim();
            title = `${beforeRow} ${tagWithHash} ${rowMatch[0]}`;
        } else {
            title = `${title} ${tagWithHash}`.trim();
        }
    }
    
    // Update data model but don't trigger re-render
    column.title = title;
    
    // Update DOM immediately using unique ID
    updateColumnDisplayImmediate(columnId, title, !wasActive, tagName);
    
    // Batch save to backend with longer delay to prevent auto-regeneration
    clearTimeout(window.columnTagUpdateTimeout);
    
    // Show pending changes indicator
    updateRefreshButtonState('pending');
    
    window.columnTagUpdateTimeout = setTimeout(() => {
        // Send update with flag to prevent board refresh
        vscode.postMessage({ 
            type: 'editColumnTitle', 
            columnId, 
            title, 
            skipRender: true 
        });
        
        // Update button state to saved after a brief delay
        setTimeout(() => updateRefreshButtonState('saved'), 100);
    }, 2000); // Increased delay to 2 seconds
}

function toggleTaskTag(taskId, columnId, tagName, event) {
    console.log(`🏷️ Toggle task tag: ${taskId} -> ${tagName}`);
    
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    
    if (!window.currentBoard?.columns) {
        console.warn('No currentBoard or columns available');
        return;
    }
    const column = window.currentBoard.columns.find(c => c.id === columnId);
    const task = column?.tasks.find(t => t.id === taskId);
    if (!task) {
        console.warn(`Task not found: ${taskId} in column ${columnId}`);
        return;
    }
    
    const tagWithHash = `#${tagName}`;
    let title = task.title || '';
    const wasActive = new RegExp(`#${tagName}\\b`, 'gi').test(title);
    
    if (wasActive) {
        title = title.replace(new RegExp(`#${tagName}\\b`, 'gi'), '').replace(/\s+/g, ' ').trim();
    } else {
        title = `${title} ${tagWithHash}`.trim();
    }
    
    // Update data model but don't trigger re-render
    task.title = title;
    
    // Update DOM immediately using unique ID
    updateTaskDisplayImmediate(taskId, title, !wasActive, tagName);
    
    // Batch save to backend with longer delay to prevent auto-regeneration
    clearTimeout(window.taskTagUpdateTimeout);
    
    // Show pending changes indicator
    updateRefreshButtonState('pending');
    
    window.taskTagUpdateTimeout = setTimeout(() => {
        // Send update with flag to prevent board refresh
        vscode.postMessage({ 
            type: 'editTask', 
            taskId, 
            columnId, 
            taskData: task,
            skipRender: true 
        });
        
        // Update button state to saved after a brief delay
        setTimeout(() => updateRefreshButtonState('saved'), 100);
    }, 2000); // Increased delay to 2 seconds
}

// Enhanced DOM update functions using unique IDs
function updateColumnDisplayImmediate(columnId, newTitle, isActive, tagName) {
    // Use unique ID to find column element
    const columnElement = document.querySelector(`[data-column-id="${columnId}"]`);
    if (!columnElement) {
        console.warn(`Column element not found for ID: ${columnId}`);
        return;
    }
    
    // Update title display
    const titleElement = columnElement.querySelector('.column-title');
    if (titleElement) {
        const displayTitle = newTitle.replace(/#row\d+/gi, '').trim();
        const renderedTitle = displayTitle ? 
            (window.renderMarkdown ? window.renderMarkdown(displayTitle) : displayTitle) : 
            '<span class="task-title-placeholder">Add title...</span>';
        const columnRow = window.getColumnRow ? window.getColumnRow(newTitle) : 1;
        const rowIndicator = (window.showRowTags && columnRow > 1) ? `<span class="column-row-tag">Row ${columnRow}</span>` : '';
        titleElement.innerHTML = renderedTitle + rowIndicator;
    }
    
    // Update edit field if it exists
    const editElement = columnElement.querySelector('.column-title-edit');
    if (editElement) {
        editElement.value = newTitle;
    }
    
    // Update data attributes for styling
    const firstTag = window.extractFirstTag ? window.extractFirstTag(newTitle) : null;
    if (firstTag) {
        columnElement.setAttribute('data-column-tag', firstTag);
    } else {
        columnElement.removeAttribute('data-column-tag');
    }
    
    const allTags = window.getActiveTagsInTitle ? window.getActiveTagsInTitle(newTitle) : [];
    if (allTags.length > 0) {
        columnElement.setAttribute('data-all-tags', allTags.join(' '));
    } else {
        columnElement.removeAttribute('data-all-tags');
    }
    
    // Update tag chip button state using unique identifiers
    const button = document.querySelector(`.donut-menu-tag-chip[data-element-id="${columnId}"][data-tag-name="${tagName}"]`);
    if (button) {
        button.classList.toggle('active', isActive);
        const checkbox = button.querySelector('.tag-chip-check');
        if (checkbox) {
            checkbox.textContent = isActive ? '✓' : '';
        }
        updateTagChipStyle(button, tagName, isActive);
    }
    
    // Skip style regeneration - styles should already be applied
    // Only reapply styles if doing a full refresh
    // if (typeof applyTagStyles === 'function') {
    //     applyTagStyles();
    // }
    
    // Visual confirmation that tag was applied
    if (isActive) {
        // Add temporary visual flash to show tag was applied
        columnElement.style.boxShadow = '0 0 8px rgba(0, 255, 0, 0.5)';
        setTimeout(() => {
            columnElement.style.boxShadow = '';
        }, 300);
    }
    
    console.log(`✅ Updated column ${columnId} DOM directly (tag: ${tagName}, active: ${isActive})`);
}

function updateTaskDisplayImmediate(taskId, newTitle, isActive, tagName) {
    // Use unique ID to find task element
    const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
    if (!taskElement) {
        console.warn(`Task element not found for ID: ${taskId}`);
        return;
    }
    
    // Update title display
    const titleElement = taskElement.querySelector('.task-title-display');
    if (titleElement) {
        const renderedTitle = newTitle ? 
            (window.renderMarkdown ? window.renderMarkdown(newTitle) : newTitle) :
            '<span class="task-title-placeholder">Add title...</span>';
        titleElement.innerHTML = renderedTitle;
    }
    
    // Update edit field if it exists
    const editElement = taskElement.querySelector('.task-title-edit');
    if (editElement) {
        editElement.value = newTitle;
    }
    
    // Update data attributes for styling
    const firstTag = window.extractFirstTag ? window.extractFirstTag(newTitle) : null;
    if (firstTag) {
        taskElement.setAttribute('data-task-tag', firstTag);
    } else {
        taskElement.removeAttribute('data-task-tag');
    }
    
    const allTags = window.getActiveTagsInTitle ? window.getActiveTagsInTitle(newTitle) : [];
    if (allTags.length > 0) {
        taskElement.setAttribute('data-all-tags', allTags.join(' '));
    } else {
        taskElement.removeAttribute('data-all-tags');
    }
    
    // Update tag chip button state using unique identifiers
    const button = document.querySelector(`.donut-menu-tag-chip[data-element-id="${taskId}"][data-tag-name="${tagName}"]`);
    if (button) {
        button.classList.toggle('active', isActive);
        const checkbox = button.querySelector('.tag-chip-check');
        if (checkbox) {
            checkbox.textContent = isActive ? '✓' : '';
        }
        updateTagChipStyle(button, tagName, isActive);
    }
    
    // Skip style regeneration - styles should already be applied
    // Only reapply styles if doing a full refresh
    // if (typeof applyTagStyles === 'function') {
    //     applyTagStyles();
    // }
    
    // Visual confirmation that tag was applied
    if (isActive) {
        // Add temporary visual flash to show tag was applied
        taskElement.style.boxShadow = '0 0 8px rgba(0, 255, 0, 0.5)';
        setTimeout(() => {
            taskElement.style.boxShadow = '';
        }, 300);
    }
    
    console.log(`✅ Updated task ${taskId} DOM directly (tag: ${tagName}, active: ${isActive})`);
}

function updateTagChipStyle(button, tagName, isActive) {
    const config = window.getTagConfig ? window.getTagConfig(tagName) : null;
    const isDarkTheme = document.body.classList.contains('vscode-dark') || 
                       document.body.classList.contains('vscode-high-contrast');
    
    let bgColor = '#666';
    let textColor = '#fff';
    
    if (config) {
        const themeKey = isDarkTheme ? 'dark' : 'light';
        const themeColors = config[themeKey] || config.light || {};
        bgColor = themeColors.background || '#666';
        textColor = themeColors.text || '#fff';
    } else if (isDarkTheme) {
        bgColor = '#555';
        textColor = '#ddd';
    } else {
        bgColor = '#999';
        textColor = '#fff';
    }
    
    if (isActive) {
        button.style.backgroundColor = bgColor;
        button.style.color = textColor;
    } else {
        button.style.backgroundColor = 'transparent';
        button.style.color = 'inherit';
    }
}

function flushPendingTagChanges() {
    pendingTagChanges.columns.forEach((title, columnId) => {
        vscode.postMessage({ type: 'editColumnTitle', columnId, title });
    });
    
    pendingTagChanges.tasks.forEach(({ columnId, taskData }, taskId) => {
        vscode.postMessage({ type: 'editTask', taskId, columnId, taskData });
    });
    
    pendingTagChanges.columns.clear();
    pendingTagChanges.tasks.clear();
    activeTagMenu = null;
}

// Modal functions
function showInputModal(title, message, placeholder, onConfirm) {
    document.getElementById('input-modal-title').textContent = title;
    document.getElementById('input-modal-message').textContent = message;
    const inputField = document.getElementById('input-modal-field');
    inputField.placeholder = placeholder;
    inputField.value = '';
    document.getElementById('input-modal').style.display = 'block';
    setTimeout(() => inputField.focus(), 100);

    const confirmAction = () => {
        const value = inputField.value.trim();
        if (value) {
            closeInputModal();
            onConfirm(value);
        }
    };

    document.getElementById('input-ok-btn').onclick = confirmAction;
    inputField.onkeydown = e => {
        if (e.key === 'Enter') confirmAction();
    };
}

function closeInputModal() {
    document.getElementById('input-modal').style.display = 'none';
}

function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}

function performSort() {
    vscode.postMessage({ type: 'performSort' });
}

// Manual refresh function
function manualRefresh() {
    console.log('Manual refresh requested');
    
    // First flush any pending tag changes immediately
    flushPendingTagChanges();
    
    // Clear any pending timeouts
    if (window.columnTagUpdateTimeout) {
        clearTimeout(window.columnTagUpdateTimeout);
        window.columnTagUpdateTimeout = null;
    }
    if (window.taskTagUpdateTimeout) {
        clearTimeout(window.taskTagUpdateTimeout);
        window.taskTagUpdateTimeout = null;
    }
    
    // Force refresh from source
    vscode.postMessage({ type: 'requestBoardUpdate', force: true });
    vscode.postMessage({ type: 'showMessage', text: 'Refreshing from source...' });
}

// Function to update refresh button state
function updateRefreshButtonState(state) {
    const refreshBtn = document.getElementById('refresh-btn');
    const refreshIcon = refreshBtn?.querySelector('.refresh-icon');
    const refreshText = refreshBtn?.querySelector('.refresh-text');
    
    if (!refreshBtn || !refreshIcon || !refreshText) return;
    
    switch (state) {
        case 'pending':
            refreshBtn.classList.add('pending');
            refreshBtn.classList.remove('saved');
            refreshIcon.textContent = '●';
            refreshText.textContent = 'Pending';
            refreshBtn.title = 'Changes pending - click to refresh from source';
            break;
        case 'saved':
            refreshBtn.classList.remove('pending');
            refreshBtn.classList.add('saved');
            refreshIcon.textContent = '✓';
            refreshText.textContent = 'Saved';
            refreshBtn.title = 'Changes saved - click to refresh from source';
            // Reset to normal state after 2 seconds
            setTimeout(() => {
                refreshBtn.classList.remove('saved');
                refreshIcon.textContent = '↻';
                refreshText.textContent = 'Refresh';
                refreshBtn.title = 'Refresh from source markdown';
            }, 2000);
            break;
        default:
            refreshBtn.classList.remove('pending', 'saved');
            refreshIcon.textContent = '↻';
            refreshText.textContent = 'Refresh';
            refreshBtn.title = 'Refresh from source markdown';
            break;
    }
}

// Make functions globally available
window.toggleDonutMenu = toggleDonutMenu;
window.toggleFileBarMenu = toggleFileBarMenu;
window.handleColumnTagClick = (columnId, tagName, event) => toggleColumnTag(columnId, tagName, event);
window.handleTaskTagClick = (taskId, columnId, tagName, event) => toggleTaskTag(taskId, columnId, tagName, event);
window.updateTagChipStyle = updateTagChipStyle;
window.columnTagUpdateTimeout = null;
window.taskTagUpdateTimeout = null;
window.toggleColumnTag = toggleColumnTag;
window.toggleTaskTag = toggleTaskTag;
window.submenuGenerator = window.menuManager; // Compatibility alias
window.manualRefresh = manualRefresh;

console.log('✅ Unified menu system loaded');