// Unified Menu System - Simple and DRY
console.log('Unified menu system loading...');

// Declare window properties for TypeScript
if (typeof window !== 'undefined') {
    window._lastFlushedChanges = null;
    window.handleColumnTagClick = null;
    window.handleTaskTagClick = null;
}

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
        
        // Check if this is a tag chip button - these have their own click handlers
        // and should not be double-handled
        if (button.classList.contains('donut-menu-tag-chip')) {
            console.log('🏷️ Tag chip button - letting default handler manage it');
            // Still close the menu, but don't re-execute the onclick
            if (shouldCloseMenu) {
                setTimeout(() => this.hideSubmenu(), 100);
            }
            return;
        }
        
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
        
        // Handle window.tagHandlers pattern - but check if already handled
        const tagHandlerMatch = functionString.match(/window\.tagHandlers\['([^']+)'\]\(([^)]*)\)/);
        if (tagHandlerMatch) {
            const handlerKey = tagHandlerMatch[1];
            const params = tagHandlerMatch[2];
            
            // Check if this is a tag handler that we've already executed
            if (window.tagHandlers && window.tagHandlers[handlerKey]) {
                // Skip if this was already handled by the direct tag system
                const now = Date.now();
                const lastExecuted = element._lastTagExecution || 0;
                if (now - lastExecuted < 100) {
                    console.log('⏭️ Skipping duplicate tag handler execution');
                    return true;
                }
                element._lastTagExecution = now;
                
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
        
        // Style and position of tag submenus
        submenu.style.cssText = `
            position: fixed;
            z-index: 100000;
            pointer-events: all;
            visibility: hidden;
            display: flex;
						flex-wrap: wrap;
        `;
        
        // Append to body to escape any stacking contexts
        document.body.appendChild(submenu);
        
        // Store reference to the menu item for positioning
        submenu._menuItem = menuItem;
        
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

        // Hover management - track when we're in a submenu
        submenu.addEventListener('mouseenter', () => {
            this.clearTimeout();
            window._inSubmenu = true;
        });
        submenu.addEventListener('mouseleave', () => {
            window._inSubmenu = false;
            this.startHideTimer();
        });
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
        this.hideTimeout = setTimeout(() => {
            this.hideSubmenu();
            
            // Also close parent menu if we're not hovering over it
            setTimeout(() => {
                if (!window._inDropdown && !window._inSubmenu) {
                    document.querySelectorAll('.donut-menu.active').forEach(menu => {
                        menu.classList.remove('active');
                    });
                }
            }, 100);
        }, 300);
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
    dropdown.addEventListener('mouseenter', () => {
        window.menuManager.clearTimeout();
        window._inDropdown = true;
    });
    dropdown.addEventListener('mouseleave', () => {
        window._inDropdown = false;
        setTimeout(() => {
            // Don't close the menu if we're hovering over a submenu
            if (window._inSubmenu) {
                return;
            }
            
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
    
    // Flush pending tag changes before moving
    if ((window.pendingTaskChanges && window.pendingTaskChanges.size > 0) ||
        (window.pendingColumnChanges && window.pendingColumnChanges.size > 0)) {
        console.log('🔄 Flushing pending tag changes before moveColumnLeft');
        flushPendingTagChanges();
    }
    
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
    
    // Flush pending tag changes before moving
    if ((window.pendingTaskChanges && window.pendingTaskChanges.size > 0) ||
        (window.pendingColumnChanges && window.pendingColumnChanges.size > 0)) {
        console.log('🔄 Flushing pending tag changes before moveColumnRight');
        flushPendingTagChanges();
    }
    
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
    // Flush pending tag changes before moving
    if (window.pendingTaskChanges && window.pendingTaskChanges.size > 0) {
        console.log('🔄 Flushing pending tag changes before moveTaskToTop');
        flushPendingTagChanges();
    }
    vscode.postMessage({ type: 'moveTaskToTop', taskId, columnId });
}

function moveTaskUp(taskId, columnId) {
    // Flush pending tag changes before moving
    if (window.pendingTaskChanges && window.pendingTaskChanges.size > 0) {
        console.log('🔄 Flushing pending tag changes before moveTaskUp');
        flushPendingTagChanges();
    }
    vscode.postMessage({ type: 'moveTaskUp', taskId, columnId });
}

function moveTaskDown(taskId, columnId) {
    // Flush pending tag changes before moving
    if (window.pendingTaskChanges && window.pendingTaskChanges.size > 0) {
        console.log('🔄 Flushing pending tag changes before moveTaskDown');
        flushPendingTagChanges();
    }
    vscode.postMessage({ type: 'moveTaskDown', taskId, columnId });
}

function moveTaskToBottom(taskId, columnId) {
    // Flush pending tag changes before moving
    if (window.pendingTaskChanges && window.pendingTaskChanges.size > 0) {
        console.log('🔄 Flushing pending tag changes before moveTaskToBottom');
        flushPendingTagChanges();
    }
    vscode.postMessage({ type: 'moveTaskToBottom', taskId, columnId });
}

function moveTaskToColumn(taskId, fromColumnId, toColumnId) {
    // Flush pending tag changes before moving
    if (window.pendingTaskChanges && window.pendingTaskChanges.size > 0) {
        console.log('🔄 Flushing pending tag changes before moveTaskToColumn');
        flushPendingTagChanges();
    }
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
    console.log(`🔍 DEBUG: Column ID type: ${typeof columnId}, value: "${columnId}"`);
    
    // Enhanced duplicate prevention with stronger key and longer timeout
    const key = `column-${columnId}-${tagName}`;
    const now = Date.now();
    if (!window._lastTagExecution) {
        window._lastTagExecution = {};
    }
    
    if (window._lastTagExecution[key] && now - window._lastTagExecution[key] < 500) {
        console.log(`⏭️ Skipping duplicate column tag execution (${now - window._lastTagExecution[key]}ms ago)`);
        return;
    }
    window._lastTagExecution[key] = now;
    
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    
    if (!window.currentBoard?.columns) {
        console.warn('No currentBoard or columns available');
        return;
    }
    
    // Enhanced debugging for column finding
    console.log(`🔍 DEBUG: Looking for column with ID "${columnId}" (type: ${typeof columnId})`);
    console.log(`🔍 DEBUG: Available columns:`, window.currentBoard.columns.map(c => ({id: c.id, title: c.title, idType: typeof c.id})));
    
    const column = window.currentBoard.columns.find(c => c.id === columnId);
    if (!column) {
        console.warn(`❌ Column not found: ${columnId}`);
        console.warn(`Available column IDs: ${window.currentBoard.columns.map(c => c.id).join(', ')}`);
        return;
    }
    
    console.log(`✅ Found column: ${column.title} (ID: ${column.id})`);
    
    // Also check DOM element
    const domElement = document.querySelector(`[data-column-id="${columnId}"]`);
    if (!domElement) {
        console.warn(`❌ DOM element not found for column ID: ${columnId}`);
        // Try to find any elements with data-column-id
        const allColumnElements = document.querySelectorAll('[data-column-id]');
        console.warn(`Available DOM column elements:`, Array.from(allColumnElements).map(el => el.getAttribute('data-column-id')));
    } else {
        console.log(`✅ Found DOM element for column: ${domElement.querySelector('.column-title')?.textContent}`);
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
    const oldTitle = column.title;
    column.title = title;
    
    console.log(`🔄 Column data updated:`, {
        columnId,
        oldTitle,
        newTitle: title,
        wasActive,
        tagName,
        board: window.currentBoard ? 'available' : 'missing'
    });
    
    // Update DOM immediately using unique ID
    updateColumnDisplayImmediate(columnId, title, !wasActive, tagName);
    
    // Update tag button appearance immediately
    updateTagButtonAppearance(columnId, 'column', tagName, !wasActive);
    
    // Store pending changes locally instead of sending to backend immediately
    if (!window.pendingColumnChanges) {
        window.pendingColumnChanges = new Map();
    }
    
    // Store the change locally
    window.pendingColumnChanges.set(columnId, { title, columnId });
    
    // Show pending changes indicator with count
    const totalPending = (window.pendingColumnChanges?.size || 0) + (window.pendingTaskChanges?.size || 0);
    updateRefreshButtonState('pending', totalPending);
    
    console.log(`📝 Stored pending column change: ${columnId} -> ${title}`);
    console.log(`📊 Total pending changes: ${totalPending} (columns: ${window.pendingColumnChanges?.size || 0}, tasks: ${window.pendingTaskChanges?.size || 0})`);
    
    // Clear any existing timeout
    if (window.columnTagUpdateTimeout) {
        clearTimeout(window.columnTagUpdateTimeout);
    }
}

function toggleTaskTag(taskId, columnId, tagName, event) {
    console.log(`🏷️ Toggle task tag: ${taskId} -> ${tagName}`);
    console.log(`🔍 DEBUG: Task ID type: ${typeof taskId}, value: "${taskId}"`);
    console.log(`🔍 DEBUG: Column ID type: ${typeof columnId}, value: "${columnId}"`);
    
    // Enhanced duplicate prevention with stronger key and longer timeout
    const key = `task-${taskId}-${tagName}`;
    const now = Date.now();
    if (!window._lastTagExecution) {
        window._lastTagExecution = {};
    }
    
    if (window._lastTagExecution[key] && now - window._lastTagExecution[key] < 500) {
        console.log(`⏭️ Skipping duplicate task tag execution (${now - window._lastTagExecution[key]}ms ago)`);
        return;
    }
    window._lastTagExecution[key] = now;
    
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    
    if (!window.currentBoard?.columns) {
        console.warn('No currentBoard or columns available');
        return;
    }
    
    // Enhanced debugging for task finding
    console.log(`🔍 DEBUG: Looking for task with ID "${taskId}" in column "${columnId}"`);
    const column = window.currentBoard.columns.find(c => c.id === columnId);
    if (!column) {
        console.warn(`❌ Column not found: ${columnId}`);
        return;
    }
    
    console.log(`🔍 DEBUG: Found column: ${column.title}, tasks:`, column.tasks?.map(t => ({id: t.id, title: t.title, idType: typeof t.id})));
    const task = column?.tasks.find(t => t.id === taskId);
    if (!task) {
        console.warn(`❌ Task not found: ${taskId} in column ${columnId}`);
        console.warn(`Available task IDs in column: ${column.tasks?.map(t => t.id).join(', ') || 'none'}`);
        return;
    }
    
    console.log(`✅ Found task: ${task.title} (ID: ${task.id})`);
    
    // Also check DOM element
    const domElement = document.querySelector(`[data-task-id="${taskId}"]`);
    if (!domElement) {
        console.warn(`❌ DOM element not found for task ID: ${taskId}`);
        // Try to find any elements with data-task-id
        const allTaskElements = document.querySelectorAll('[data-task-id]');
        console.warn(`Available DOM task elements:`, Array.from(allTaskElements).map(el => el.getAttribute('data-task-id')));
    } else {
        console.log(`✅ Found DOM element for task: ${domElement.querySelector('.task-title-display')?.textContent}`);
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
    const oldTitle = task.title;
    task.title = title;
    
    console.log(`🔄 Task data updated:`, {
        taskId,
        columnId,
        oldTitle,
        newTitle: title,
        wasActive,
        tagName,
        board: window.currentBoard ? 'available' : 'missing'
    });
    
    // Update DOM immediately using unique ID
    updateTaskDisplayImmediate(taskId, title, !wasActive, tagName);
    
    // Update tag button appearance immediately
    updateTagButtonAppearance(taskId, 'task', tagName, !wasActive);
    
    // Store pending changes locally instead of sending to backend immediately
    if (!window.pendingTaskChanges) {
        window.pendingTaskChanges = new Map();
    }
    
    // Store the change locally
    window.pendingTaskChanges.set(taskId, { taskId, columnId, taskData: task });
    
    // Show pending changes indicator with count
    const totalPending = (window.pendingColumnChanges?.size || 0) + (window.pendingTaskChanges?.size || 0);
    updateRefreshButtonState('pending', totalPending);
    
    console.log(`📝 Stored pending task change: ${taskId} -> ${title}`);
    console.log(`📊 Total pending changes: ${totalPending} (columns: ${window.pendingColumnChanges?.size || 0}, tasks: ${window.pendingTaskChanges?.size || 0})`);
    
    // Clear any existing timeout
    if (window.taskTagUpdateTimeout) {
        clearTimeout(window.taskTagUpdateTimeout);
    }
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
    
    // Ensure the style for this specific tag exists without regenerating all styles
    if (isActive && window.ensureTagStyleExists) {
        window.ensureTagStyleExists(tagName);
    }
    
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
    
    // Ensure the style for this specific tag exists without regenerating all styles
    if (isActive && window.ensureTagStyleExists) {
        window.ensureTagStyleExists(tagName);
    }
    
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
    console.log('🔄 Flushing pending tag changes...');
    
    // Store changes temporarily in case we need to retry
    const columnChangesToFlush = new Map();
    const taskChangesToFlush = new Map();
    
    // Copy column changes
    if (window.pendingColumnChanges && window.pendingColumnChanges.size > 0) {
        console.log(`📤 Preparing to send ${window.pendingColumnChanges.size} column changes`);
        window.pendingColumnChanges.forEach((value, key) => {
            columnChangesToFlush.set(key, value);
        });
    }
    
    // Copy task changes  
    if (window.pendingTaskChanges && window.pendingTaskChanges.size > 0) {
        console.log(`📤 Preparing to send ${window.pendingTaskChanges.size} task changes`);
        window.pendingTaskChanges.forEach((value, key) => {
            taskChangesToFlush.set(key, value);
        });
    }
    
    // If no changes to flush, return early
    if (columnChangesToFlush.size === 0 && taskChangesToFlush.size === 0) {
        console.log('ℹ️ No pending changes to flush');
        return;
    }
    
    // Clear the pending changes optimistically
    if (window.pendingColumnChanges) window.pendingColumnChanges.clear();
    if (window.pendingTaskChanges) window.pendingTaskChanges.clear();
    
    // Send column changes
    columnChangesToFlush.forEach(({ title, columnId }) => {
        console.log(`📤 Column ${columnId}: ${title}`);
        vscode.postMessage({ 
            type: 'editColumnTitle', 
            columnId, 
            title,
            _flushId: Date.now() // Add ID for tracking
        });
    });
    
    // Send task changes
    taskChangesToFlush.forEach(({ taskId, columnId, taskData }) => {
        console.log(`📤 Task ${taskId}: ${taskData.title}`);
        vscode.postMessage({ 
            type: 'editTask', 
            taskId, 
            columnId, 
            taskData,
            _flushId: Date.now() // Add ID for tracking
        });
    });
    
    // Update refresh button state
    updateRefreshButtonState('pending', 0); // Show as saved
    
    // Store the changes in case we need to retry
    window._lastFlushedChanges = {
        columns: columnChangesToFlush,
        tasks: taskChangesToFlush,
        timestamp: Date.now()
    };
    
    console.log('✅ All pending tag changes sent to backend');
}

// Retry function for failed saves
function retryLastFlushedChanges() {
    if (!window._lastFlushedChanges) {
        console.warn('⚠️ No changes to retry');
        return false;
    }
    
    const { columns, tasks, timestamp } = window._lastFlushedChanges;
    const timeSinceFlush = Date.now() - timestamp;
    
    // Don't retry if too much time has passed (5 minutes)
    if (timeSinceFlush > 300000) {
        console.warn('⚠️ Last flush too old to retry safely');
        window._lastFlushedChanges = null;
        return false;
    }
    
    console.log('🔄 Retrying last flushed changes...');
    
    // Re-add changes to pending and flush again
    if (columns.size > 0) {
        if (!window.pendingColumnChanges) {
            window.pendingColumnChanges = new Map();
        }
        columns.forEach((value, key) => {
            window.pendingColumnChanges.set(key, value);
        });
    }
    
    if (tasks.size > 0) {
        if (!window.pendingTaskChanges) {
            window.pendingTaskChanges = new Map();
        }
        tasks.forEach((value, key) => {
            window.pendingTaskChanges.set(key, value);
        });
    }
    
    // Clear the retry data and flush again
    window._lastFlushedChanges = null;
    
    // Add a small delay before retrying
    setTimeout(() => {
        flushPendingTagChanges();
    }, 1000);
    
    return true;
}

// Function to handle save errors from the backend
function handleSaveError(errorMessage) {
    console.error('❌ Save error from backend:', errorMessage);
    
    // Update UI to show error state
    updateRefreshButtonState('error');
    
    // Show user-friendly error message
    if (errorMessage.includes('workspace edit')) {
        console.warn('💾 Workspace edit failed - this might be due to:');
        console.warn('  • File permissions');
        console.warn('  • File is open in another editor');
        console.warn('  • File was modified externally');
        console.warn('  • VS Code is busy with other operations');
        
        // Attempt to retry after a delay
        setTimeout(() => {
            console.log('🔄 Attempting automatic retry...');
            if (retryLastFlushedChanges()) {
                console.log('✅ Retry initiated');
            } else {
                console.warn('❌ Retry failed - manual refresh may be needed');
            }
        }, 2000);
    }
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
        if (e.key === 'Enter') {
            confirmAction();
        }
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
    console.log('🔄 Manual refresh requested');
    console.log('📊 Pending changes before refresh:', {
        columnChanges: window.pendingColumnChanges?.size || 0,
        taskChanges: window.pendingTaskChanges?.size || 0
    });
    
    // First flush any pending tag changes immediately
    flushPendingTagChanges();
    
    // Send all pending column changes
    if (window.pendingColumnChanges && window.pendingColumnChanges.size > 0) {
        console.log(`📤 Sending ${window.pendingColumnChanges.size} pending column changes`);
        window.pendingColumnChanges.forEach((change) => {
            console.log(`  📝 Column: ${change.columnId} -> "${change.title}"`);
            vscode.postMessage({
                type: 'editColumnTitle',
                columnId: change.columnId,
                title: change.title
            });
        });
        window.pendingColumnChanges.clear();
    } else {
        console.log('📤 No pending column changes to send');
    }
    
    // Send all pending task changes
    if (window.pendingTaskChanges && window.pendingTaskChanges.size > 0) {
        console.log(`📤 Sending ${window.pendingTaskChanges.size} pending task changes`);
        window.pendingTaskChanges.forEach((change) => {
            console.log(`  📝 Task: ${change.taskId} -> "${change.taskData.title}"`);
            vscode.postMessage({
                type: 'editTask',
                taskId: change.taskId,
                columnId: change.columnId,
                taskData: change.taskData
            });
        });
        window.pendingTaskChanges.clear();
    } else {
        console.log('📤 No pending task changes to send');
    }
    
    // Clear any pending timeouts
    if (window.columnTagUpdateTimeout) {
        clearTimeout(window.columnTagUpdateTimeout);
        window.columnTagUpdateTimeout = null;
    }
    if (window.taskTagUpdateTimeout) {
        clearTimeout(window.taskTagUpdateTimeout);
        window.taskTagUpdateTimeout = null;
    }
    
    // Update button state to saved
    updateRefreshButtonState('saved');
    
    // Small delay to let changes process, then force refresh from source
    setTimeout(() => {
        vscode.postMessage({ type: 'requestBoardUpdate', force: true });
        vscode.postMessage({ type: 'showMessage', text: 'Refreshing from source...' });
    }, 100);
}

// Function to update refresh button state
function updateRefreshButtonState(state, count = 0) {
    const refreshBtn = document.getElementById('refresh-btn');
    const refreshIcon = refreshBtn?.querySelector('.refresh-icon');
    const refreshText = refreshBtn?.querySelector('.refresh-text');
    
    if (!refreshBtn || !refreshIcon || !refreshText) {
        return;
    }
    
    switch (state) {
        case 'pending':
            refreshBtn.classList.add('pending');
            refreshBtn.classList.remove('saved');
            refreshIcon.textContent = count > 0 ? count.toString() : '●';
            refreshText.textContent = count > 0 ? `Pending (${count})` : 'Pending';
            refreshBtn.title = `${count} changes pending - click to save and refresh from source`;
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

// Update tag button appearance immediately when toggled
function updateTagButtonAppearance(id, type, tagName, isActive) {
    console.log(`🎨 Updating tag button appearance: ${id} ${type} ${tagName} active=${isActive}`);
    
    // Find the tag button using the same ID pattern as in generateGroupTagItems
    const buttonId = `tag-chip-${type}-${id}-${tagName}`.replace(/[^a-zA-Z0-9-]/g, '-');
    const button = document.getElementById(buttonId);
    
    if (!button) {
        console.log(`❌ Tag button not found: ${buttonId}`);
        return;
    }
    
    // Get tag configuration for colors (reuse logic from boardRenderer.js)
    const config = window.getTagConfig ? window.getTagConfig(tagName) : null;
    let bgColor = '#666';
    let textColor = '#fff';
    let bgDark = null;
    
    if (config) {
        const isDarkTheme = document.body.classList.contains('vscode-dark') || 
                           document.body.classList.contains('vscode-high-contrast');
        const themeKey = isDarkTheme ? 'dark' : 'light';
        
        // Use the appropriate color config based on type (card or column)
        let colorConfig = null;
        if (type === 'column' && config.column) {
            colorConfig = config.column[themeKey] || config.column.light || {};
            bgDark = colorConfig.backgroundDark || colorConfig.background;
        } else if (type === 'task' && config.card) {
            colorConfig = config.card[themeKey] || config.card.light || {};
            bgDark = colorConfig.backgroundDark || colorConfig.background;
        } else {
            // Fallback to basic theme colors if specific type not found
            colorConfig = config[themeKey] || config.light || {};
        }
        
        bgColor = colorConfig.background || '#666';
        textColor = colorConfig.text || '#fff';
        
        // If we have a backgroundDark, interpolate it for a subtle effect
        if (bgDark && window.interpolateColor) {
            const editorBg = getComputedStyle(document.documentElement).getPropertyValue('--vscode-editor-background') || '#ffffff';
            // Use a lighter interpolation for the button background when active
            bgColor = window.interpolateColor(editorBg, bgDark, isActive ? 0.25 : 0.1);
        }
    }
    
    // Update button class
    if (isActive) {
        button.classList.add('active');
    } else {
        button.classList.remove('active');
    }
    
    // Update button styling
    button.style.backgroundColor = isActive ? bgColor : 'transparent';
    button.style.color = isActive ? textColor : (bgDark ? bgDark : 'inherit');
    button.style.borderColor = bgDark || bgColor;
    
    if (!isActive && bgDark) {
        button.style.border = `2px solid ${bgDark}`;
    }
    
    // Update the checkmark
    const checkElement = button.querySelector('.tag-chip-check');
    if (checkElement) {
        checkElement.textContent = isActive ? '✓' : '';
    }
    
    // Update the tag name color for inactive buttons
    const nameElement = button.querySelector('.tag-chip-name');
    if (nameElement && !isActive && bgDark) {
        nameElement.style.color = bgDark;
    } else if (nameElement) {
        nameElement.style.color = '';
    }
    
    console.log(`✅ Updated tag button ${buttonId}: active=${isActive}, bgColor=${bgColor}, textColor=${textColor}`);
}

// Make functions globally available
window.toggleDonutMenu = toggleDonutMenu;
window.toggleFileBarMenu = toggleFileBarMenu;
window.handleColumnTagClick = (columnId, tagName, event) => toggleColumnTag(columnId, tagName, event);
window.handleTaskTagClick = (taskId, columnId, tagName, event) => toggleTaskTag(taskId, columnId, tagName, event);
window.updateTagChipStyle = updateTagChipStyle;
window.updateTagButtonAppearance = updateTagButtonAppearance;
window.columnTagUpdateTimeout = null;
window.taskTagUpdateTimeout = null;
window.toggleColumnTag = toggleColumnTag;
window.toggleTaskTag = toggleTaskTag;
window.submenuGenerator = window.menuManager; // Compatibility alias
window.manualRefresh = manualRefresh;

console.log('✅ Unified menu system loaded');