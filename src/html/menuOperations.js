// Track menu hover state to prevent premature closing
let menuHoverTimeout = null;

// Track pending tag changes for batch updates
let pendingTagChanges = {
    columns: new Map(),
    tasks: new Map()
};
let activeTagMenu = null;

// Inline SubmenuGenerator since separate file isn't loading
class SubmenuGenerator {
    constructor() {
        this.activeSubmenu = null;
    }

    // Create submenu content dynamically when hovered
    createSubmenuContent(menuItem, id, type, columnId = null) {
        const submenuType = menuItem.dataset.submenuType;
        const group = menuItem.dataset.group;
        
        let content = '';
        
        switch (submenuType) {
            case 'tags':
                content = this.createTagGroupContent(group, id, type, columnId);
                break;
            case 'move':
                content = this.createMoveContent(id, columnId);
                break;
            case 'move-to-list':
                content = this.createMoveToListContent(id, columnId);
                break;
            case 'sort':
                content = this.createSortContent(menuItem.dataset.columnId || columnId);
                break;
        }
        
        return content;
    }

    // Create tag group content
    createTagGroupContent(group, id, type, columnId) {
        const tagConfig = window.tagColors || {};
        let tags = [];
        
        if (group === 'custom') {
            // Get user-added tags using the same function as the original
            if (window.getUserAddedTags) {
                tags = window.getUserAddedTags();
            }
        } else {
            // Get tags from the specific group in tagConfig
            const groupValue = tagConfig[group];
            if (groupValue && typeof groupValue === 'object') {
                // Check if this is a direct tag or a group
                if (groupValue.light || groupValue.dark) {
                    // This is a single tag
                    tags = [group];
                } else {
                    // This is a group, collect its tags
                    Object.keys(groupValue).forEach(tagKey => {
                        const tagValue = groupValue[tagKey];
                        if (tagValue && typeof tagValue === 'object' && (tagValue.light || tagValue.dark)) {
                            tags.push(tagKey);
                        }
                    });
                }
            }
        }
        
        // Generate the tag items HTML
        if (window.generateGroupTagItems) {
            return window.generateGroupTagItems(tags, id, type, columnId, group !== 'custom');
        }
        
        // Fallback if generateGroupTagItems is not available
        return '<div>Tags not available</div>';
    }

    // Create move content
    createMoveContent(taskId, columnId) {
        return `
            <button class="donut-menu-item" onclick="moveTaskToTop('${taskId}', '${columnId}')" type="button">Top</button>
            <button class="donut-menu-item" onclick="moveTaskUp('${taskId}', '${columnId}')" type="button">Up</button>
            <button class="donut-menu-item" onclick="moveTaskDown('${taskId}', '${columnId}')" type="button">Down</button>
            <button class="donut-menu-item" onclick="moveTaskToBottom('${taskId}', '${columnId}')" type="button">Bottom</button>
        `;
    }

    // Create move to list content
    createMoveToListContent(taskId, columnId) {
        const currentBoard = window.currentBoard;
        if (!currentBoard || !currentBoard.columns) return '';
        
        return currentBoard.columns.map(col => 
            col.id !== columnId ? 
            `<button class="donut-menu-item" onclick="moveTaskToColumn('${taskId}', '${columnId}', '${col.id}')" type="button">${window.escapeHtml ? window.escapeHtml(col.title || 'Untitled') : col.title || 'Untitled'}</button>` : ''
        ).join('');
    }

    // Create sort content
    createSortContent(columnId) {
        return `
            <button class="donut-menu-item" onclick="sortColumn('${columnId}', 'unsorted')" type="button">Unsorted</button>
            <button class="donut-menu-item" onclick="sortColumn('${columnId}', 'title')" type="button">Sort by title</button>
        `;
    }

    // Show submenu with dynamic content
    showSubmenu(menuItem, id, type, columnId = null) {
        // Remove any existing submenu first
        this.hideSubmenu();
        
        // Clear any pending timeouts to prevent conflicts
        this.clearAllTimeouts();

        // Create submenu element
        const submenu = document.createElement('div');
        submenu.className = 'donut-menu-submenu dynamic-submenu';
        
        // Special class for tag grids
        if (menuItem.dataset.submenuType === 'tags') {
            submenu.classList.add('donut-menu-tags-grid');
        }
        
        // Generate content
        submenu.innerHTML = this.createSubmenuContent(menuItem, id, type, columnId);
        
        // Set up proper styling and z-index immediately
        submenu.style.position = 'fixed';
        submenu.style.zIndex = '100000'; // Higher than CSS default
        submenu.style.pointerEvents = 'all';
        submenu.style.visibility = 'hidden'; // Hidden initially for positioning
        submenu.style.display = 'flex'; // Use flex for proper layout
        
        // Append to menu item BEFORE positioning
        menuItem.appendChild(submenu);
        
        // Set up click handlers for all interactive elements
        this.setupSubmenuEventHandlers(submenu);
        
        // Set up hover handlers to manage visibility
        this.setupSubmenuHoverHandlers(submenu, menuItem);
        
        // Store reference
        this.activeSubmenu = submenu;
        
        return submenu;
    }
    
    // Set up event handlers for submenu content
    setupSubmenuEventHandlers(submenu) {
        // Handle regular menu items
        submenu.querySelectorAll('button.donut-menu-item').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                
                // Execute the onclick handler
                if (button.onclick) {
                    button.onclick(e);
                } else if (button.getAttribute('onclick')) {
                    try {
                        eval(button.getAttribute('onclick'));
                    } catch (error) {
                        console.error('Error executing onclick:', error);
                    }
                }
                
                // Close menu after action
                this.hideSubmenu();
            });
        });
        
        // Handle tag chips with special click handling
        submenu.querySelectorAll('button.donut-menu-tag-chip').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                
                // Execute click handler without closing menu
                if (button.onclick) {
                    button.onclick(e);
                } else if (button.getAttribute('onclick')) {
                    try {
                        eval(button.getAttribute('onclick'));
                    } catch (error) {
                        console.error('Error executing tag onclick:', error);
                    }
                }
            });
            
            // Ensure tag chips are fully interactive
            button.style.pointerEvents = 'all';
            button.style.zIndex = '100001';
        });
    }
    
    // Set up hover handlers for submenu visibility management
    setupSubmenuHoverHandlers(submenu, menuItem) {
        // Store timeout reference on the submenu element to avoid conflicts
        submenu._hideTimeout = null;
        
        // Clear timeout when hovering over submenu
        submenu.addEventListener('mouseenter', () => {
            this.clearSubmenuTimeout(submenu);
            // Also clear any global timeouts
            this.clearAllTimeouts();
        });
        
        // Start hide timer when leaving submenu
        submenu.addEventListener('mouseleave', (e) => {
            const relatedTarget = e.relatedTarget;
            
            // Don't hide if moving to any part of the menu system
            if (relatedTarget && (
                relatedTarget === menuItem || 
                menuItem.contains(relatedTarget) ||
                relatedTarget.closest('.donut-menu-dropdown') ||
                relatedTarget.closest('.donut-menu-submenu')
            )) {
                return;
            }
            
            this.setSubmenuTimeout(submenu, 300);
        });
        
        // Handle leaving the parent menu item - but don't add if already exists
        if (!menuItem._submenuLeaveHandler) {
            menuItem._submenuLeaveHandler = (e) => {
                const relatedTarget = e.relatedTarget;
                
                // Don't hide if moving to the submenu or staying in menu system
                if (relatedTarget && (
                    relatedTarget === submenu || 
                    submenu.contains(relatedTarget) ||
                    relatedTarget.closest('.donut-menu-dropdown') ||
                    relatedTarget.closest('.donut-menu-submenu')
                )) {
                    return;
                }
                
                this.setSubmenuTimeout(submenu, 300);
            };
            
            menuItem.addEventListener('mouseleave', menuItem._submenuLeaveHandler);
        }
    }
    
    // Helper methods for timeout management
    clearSubmenuTimeout(submenu) {
        if (submenu._hideTimeout) {
            clearTimeout(submenu._hideTimeout);
            submenu._hideTimeout = null;
        }
    }
    
    setSubmenuTimeout(submenu, delay) {
        this.clearSubmenuTimeout(submenu);
        submenu._hideTimeout = setTimeout(() => {
            this.hideSubmenu();
        }, delay);
    }
    
    // Clear all pending timeouts
    clearAllTimeouts() {
        if (window.submenuHideTimeout) {
            clearTimeout(window.submenuHideTimeout);
            window.submenuHideTimeout = null;
        }
    }

    // Hide active submenu
    hideSubmenu() {
        // Clear all timeouts first
        this.clearAllTimeouts();
        
        if (this.activeSubmenu) {
            // Clear submenu-specific timeout
            this.clearSubmenuTimeout(this.activeSubmenu);
            this.activeSubmenu.remove();
            this.activeSubmenu = null;
        }
        
        // Also remove any other dynamic submenus and clear their timeouts
        document.querySelectorAll('.dynamic-submenu').forEach(submenu => {
            this.clearSubmenuTimeout(submenu);
            submenu.remove();
        });
    }
}

// Global instance
window.submenuGenerator = new SubmenuGenerator();

// Function to prepare submenu for measurement (minimal JS, CSS handles styling)
function applySubmenuConstraints(submenu) {
    // CSS handles all styling, this is just for measurement preparation
}

// Improved submenu positioning with viewport bounds checking
function positionSubmenu(menuItem, submenuElement = null) {
    const submenu = submenuElement || menuItem.querySelector('.donut-menu-submenu, .file-bar-menu-submenu');
    if (!submenu) return;
    
    // Get menu item position relative to viewport
    const rect = menuItem.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Get submenu dimensions (temporarily show it to measure)
    const wasHidden = submenu.style.visibility === 'hidden';
    if (wasHidden) {
        submenu.style.visibility = 'hidden';
        submenu.style.display = 'flex';
    }
    
    const submenuRect = submenu.getBoundingClientRect();
    const submenuWidth = submenuRect.width || 250; // fallback width
    const submenuHeight = submenuRect.height || 300; // fallback height
    
    // Calculate initial position (to the right of menu item)
    let left = rect.right + 8;
    let top = rect.top;
    
    // Check if submenu would go off the right edge
    if (left + submenuWidth > viewportWidth - 10) {
        // Position to the left of the menu item instead
        left = rect.left - submenuWidth - 8;
    }
    
    // If still off screen, position at viewport edge
    if (left < 10) {
        left = 10;
    }
    if (left + submenuWidth > viewportWidth - 10) {
        left = viewportWidth - submenuWidth - 10;
    }
    
    // Check vertical positioning
    if (top + submenuHeight > viewportHeight - 10) {
        // Position above the menu item
        top = rect.bottom - submenuHeight;
    }
    
    // Final bounds check
    if (top < 10) {
        top = 10;
    }
    
    // Apply positioning with high z-index
    submenu.style.setProperty('position', 'fixed', 'important');
    submenu.style.setProperty('left', left + 'px', 'important');
    submenu.style.setProperty('top', top + 'px', 'important');
    submenu.style.setProperty('z-index', '100000', 'important');
    submenu.style.setProperty('pointer-events', 'all', 'important');
    
    // Show the submenu
    if (wasHidden) {
        submenu.style.setProperty('visibility', 'visible', 'important');
    }
}


// Function to position fixed dropdowns to avoid clipping
function positionDropdown(triggerButton, dropdown) {
    const rect = triggerButton.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const dropdownWidth = 180; // Approximate dropdown width
    const dropdownHeight = 300; // Approximate dropdown height
    const margin = 10; // Margin from viewport edges
    
    // Check if button is in a collapsed column
    const isCollapsedColumn = triggerButton.closest('.kanban-column.collapsed');
    
    let left, top;
    
    if (isCollapsedColumn) {
        // For collapsed columns, position to the right of the button
        left = rect.right + 5;
        top = rect.top;
        
        // If no space on the right, position to the left
        if (left + dropdownWidth > viewportWidth - margin) {
            left = rect.left - dropdownWidth - 5;
        }
    } else {
        // For normal columns, try different positioning strategies
        
        // Strategy 1: Below and right-aligned with button
        left = rect.right - dropdownWidth;
        top = rect.bottom + 5;
        
        // Strategy 2: If goes off right edge, try left-aligned
        if (left < margin) {
            left = rect.left;
        }
        
        // Strategy 3: If still goes off right edge, position at right edge
        if (left + dropdownWidth > viewportWidth - margin) {
            left = viewportWidth - dropdownWidth - margin;
        }
        
        // Strategy 4: If goes off bottom, position above button
        if (top + dropdownHeight > viewportHeight - margin) {
            top = rect.top - dropdownHeight - 5;
        }
    }
    
    // Final boundary checks to ensure dropdown is always visible
    if (left < margin) left = margin;
    if (left + dropdownWidth > viewportWidth - margin) left = viewportWidth - dropdownWidth - margin;
    if (top < margin) top = margin;
    if (top + dropdownHeight > viewportHeight - margin) top = viewportHeight - dropdownHeight - margin;
    
    // Apply the calculated position
    dropdown.style.left = left + 'px';
    dropdown.style.top = top + 'px';
    dropdown.style.right = 'auto';
    dropdown.style.bottom = 'auto';
}

// donut menu toggle that respects tag interactions
function toggleDonutMenu(event, button) {
    event.stopPropagation();
    const menu = button.parentElement;
    const wasActive = menu.classList.contains('active');
    
    // If closing a menu with pending tag changes, flush them
    if (wasActive && pendingTagChanges.columns.size + pendingTagChanges.tasks.size > 0) {
        flushPendingTagChanges();
    }
    
    // Clear any pending close timeout
    if (menuHoverTimeout) {
        clearTimeout(menuHoverTimeout);
        menuHoverTimeout = null;
    }
    
    // Close all other menus (and flush their changes if any)
    document.querySelectorAll('.donut-menu').forEach(m => {
        if (m !== menu && m.classList.contains('active')) {
            if (activeTagMenu === m && pendingTagChanges.columns.size + pendingTagChanges.tasks.size > 0) {
                flushPendingTagChanges();
            }
            m.classList.remove('active');
        }
    });
    
    // Toggle this menu
    if (!wasActive) {
        menu.classList.add('active');
        activeTagMenu = menu;
        
        // Initialize all EXISTING (static) submenus as hidden
        // Dynamic submenus will be created hidden already
        menu.querySelectorAll('.donut-menu-submenu:not(.dynamic-submenu), .file-bar-menu-submenu:not(.dynamic-submenu)').forEach(submenu => {
            submenu.style.setProperty('display', 'none', 'important');
        });
        
        // Add hover listeners to keep menu open
        const dropdown = menu.querySelector('.donut-menu-dropdown');
        if (dropdown) {
            // Position the fixed dropdown correctly
            positionDropdown(button, dropdown);
            
            // Set up submenu positioning for items with submenus
            dropdown.querySelectorAll('.donut-menu-item.has-submenu').forEach(menuItem => {
                // Remove any existing listeners to prevent duplicates
                if (menuItem._submenuPositionHandler) {
                    menuItem.removeEventListener('mouseenter', menuItem._submenuPositionHandler);
                }
                if (menuItem._submenuHideHandler) {
                    menuItem.removeEventListener('mouseleave', menuItem._submenuHideHandler);
                }
                
                // Improved hover handlers with immediate show and better cleanup
                menuItem.addEventListener('mouseenter', () => {
                    // Clear any existing timeouts immediately
                    if (window.submenuHideTimeout) {
                        clearTimeout(window.submenuHideTimeout);
                        window.submenuHideTimeout = null;
                    }
                    
                    // Clear any submenu-specific timeouts
                    const existingSubmenu = menuItem.querySelector('.donut-menu-submenu, .file-bar-menu-submenu');
                    if (existingSubmenu && window.submenuGenerator) {
                        window.submenuGenerator.clearSubmenuTimeout(existingSubmenu);
                    }
                    
                    // Show submenu immediately - no delay to prevent flickering
                    let submenu = null;
                    
                    if (menuItem.dataset.submenuType) {
                        // Dynamic submenu
                        const id = menuItem.dataset.id;
                        const type = menuItem.dataset.type;
                        const columnId = menuItem.dataset.columnId;
                        
                        if (window.submenuGenerator) {
                            submenu = window.submenuGenerator.showSubmenu(menuItem, id, type, columnId);
                        }
                    } else {
                        // Static submenu
                        submenu = menuItem.querySelector('.donut-menu-submenu, .file-bar-menu-submenu');
                    }
                    
                    if (submenu) {
                        // Position and show submenu
                        positionSubmenu(menuItem, submenu);
                        submenu.style.setProperty('display', 'flex', 'important');
                        submenu.style.setProperty('visibility', 'visible', 'important');
                        submenu.style.setProperty('pointer-events', 'all', 'important');
                    }
                });
                
                // Note: mouseleave handling is now done in the submenu generator
                // for dynamic submenus to avoid conflicts
                
                // Note: Submenu hover handlers will be added dynamically when submenus are created
            });
            
            dropdown.onmouseenter = () => {
                if (menuHoverTimeout) {
                    clearTimeout(menuHoverTimeout);
                    menuHoverTimeout = null;
                }
            };
            
            dropdown.onmouseleave = (e) => {
                // Don't close if moving to a submenu or staying within dropdown
                const toElement = e.relatedTarget;
                if (toElement && (
                    toElement.closest('.donut-menu-dropdown') === dropdown ||
                    toElement.closest('.donut-menu-submenu') ||
                    toElement.closest('.file-bar-menu-submenu')
                )) {
                    return;
                }
                
                // Clear any existing menu timeout first
                if (menuHoverTimeout) {
                    clearTimeout(menuHoverTimeout);
                    menuHoverTimeout = null;
                }
                
                // Delay closing to allow for submenu navigation
                menuHoverTimeout = setTimeout(() => {
                    if (pendingTagChanges.columns.size + pendingTagChanges.tasks.size > 0) {
                        flushPendingTagChanges();
                    }
                    // Also clear any submenu timeouts when closing the menu
                    if (window.submenuGenerator) {
                        window.submenuGenerator.hideSubmenu();
                    }
                    menu.classList.remove('active');
                    activeTagMenu = null;
                }, 400); // Slightly longer delay to prevent conflicts
            };
        }
    } else {
        menu.classList.remove('active');
        activeTagMenu = null;
    }
}

function insertColumnBefore(columnId) {
    // Close any open menus first
    document.querySelectorAll('.donut-menu').forEach(menu => {
        menu.classList.remove('active');
    });
    
    // Send message to insert empty column
    vscode.postMessage({
        type: 'insertColumnBefore',
        columnId: columnId,
        title: ''  // Empty title for new column
    });
}

function insertColumnAfter(columnId) {
    // Close any open menus first
    document.querySelectorAll('.donut-menu').forEach(menu => {
        menu.classList.remove('active');
    });
    
    // Send message to insert empty column
    vscode.postMessage({
        type: 'insertColumnAfter',
        columnId: columnId,
        title: ''  // Empty title for new column
    });
}

function moveColumnLeft(columnId) {
    
    if (!currentBoard || !currentBoard.columns) return;
    const index = currentBoard.columns.findIndex(c => c.id === columnId);
    if (index > 0) {
        // Get current row
        const column = currentBoard.columns[index];
        const currentRow = getColumnRow(column.title);
        
        console.log(`moveColumnLeft ${columnId}`);
        vscode.postMessage({
            type: 'moveColumnWithRowUpdate',
            columnId: columnId,
            newPosition: index - 1,
            newRow: currentRow // Keep same row when using menu
        });
    }
}

function moveColumnRight(columnId) {
    if (!currentBoard || !currentBoard.columns) return;
    const index = currentBoard.columns.findIndex(c => c.id === columnId);
    if (index < currentBoard.columns.length - 1) {
        // Get current row
        const column = currentBoard.columns[index];
        const currentRow = getColumnRow(column.title);
        
        console.log(`moveColumnRight ${columnId}`);
        vscode.postMessage({
            type: 'moveColumnWithRowUpdate',
            columnId: columnId,
            newPosition: index + 1,
            newRow: currentRow // Keep same row when using menu
        });
    }
}

function deleteColumn(columnId) {
    vscode.postMessage({
        type: 'deleteColumn',
        columnId: columnId
    });
}

function sortColumn(columnId, sortType) {
    vscode.postMessage({
        type: 'sortColumn',
        columnId: columnId,
        sortType: sortType
    });
}

// Copy as markdown functions
function copyColumnAsMarkdown(columnId) {
    if (!currentBoard || !currentBoard.columns) return;
    
    const column = currentBoard.columns.find(c => c.id === columnId);
    if (!column) return;
    
    let markdown = `# ${column.title}\n`;
    
    column.tasks.forEach(task => {
        if (task.title.startsWith('#')) {
            markdown += `\n---\n\n${task.title || ''}\n`;
        }
        else {
            markdown += `\n---\n\n## ${task.title || ''}\n`;
        }
        if (task.description && task.description.trim()) {
            markdown += `\n${task.description}\n`;
        }
    });
    
    copyToClipboard(markdown);
    
    // Close all menus after copying
    document.querySelectorAll('.donut-menu').forEach(menu => {
        menu.classList.remove('active');
    });
}

function copyTaskAsMarkdown(taskId, columnId) {
    if (!currentBoard || !currentBoard.columns) return;
    
    const column = currentBoard.columns.find(c => c.id === columnId);
    if (!column) return;
    
    const task = column.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    let markdown = ``;
    if (task.title.startsWith('#')) {
        markdown += `${task.title || ''}\n`;
    }
    else {
        markdown += `## ${task.title || ''}\n`;
    }
    if (task.description && task.description.trim()) {
        markdown += `\n${task.description}\n`;
    }
    
    copyToClipboard(markdown);
    
    // Close all menus after copying
    document.querySelectorAll('.donut-menu').forEach(menu => {
        menu.classList.remove('active');
    });
}

function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            vscode.postMessage({ type: 'showMessage', text: 'Copied to clipboard!' });
        }).catch(err => {
            console.error('Failed to copy:', err);
        });
    }
}

// Task operations
function duplicateTask(taskId, columnId) {
    vscode.postMessage({
        type: 'duplicateTask',
        taskId: taskId,
        columnId: columnId
    });
}

function insertTaskBefore(taskId, columnId) {
    vscode.postMessage({
        type: 'insertTaskBefore',
        taskId: taskId,
        columnId: columnId
    });
}

function insertTaskAfter(taskId, columnId) {
    vscode.postMessage({
        type: 'insertTaskAfter',
        taskId: taskId,
        columnId: columnId
    });
}

function moveTaskToTop(taskId, columnId) {
    vscode.postMessage({
        type: 'moveTaskToTop',
        taskId: taskId,
        columnId: columnId
    });
}

function moveTaskUp(taskId, columnId) {
    vscode.postMessage({
        type: 'moveTaskUp',
        taskId: taskId,
        columnId: columnId
    });
}

function moveTaskDown(taskId, columnId) {
    vscode.postMessage({
        type: 'moveTaskDown',
        taskId: taskId,
        columnId: columnId
    });
}

function moveTaskToBottom(taskId, columnId) {
    vscode.postMessage({
        type: 'moveTaskToBottom',
        taskId: taskId,
        columnId: columnId
    });
}

function moveTaskToColumn(taskId, fromColumnId, toColumnId) {
    vscode.postMessage({
        type: 'moveTaskToColumn',
        taskId: taskId,
        fromColumnId: fromColumnId,
        toColumnId: toColumnId
    });
}

function deleteTask(taskId, columnId) {
    vscode.postMessage({
        type: 'deleteTask',
        taskId: taskId,
        columnId: columnId
    });
}

function addTask(columnId) {
    const taskData = {
        title: '',
        description: ''
    };

    vscode.postMessage({
        type: 'addTask',
        columnId: columnId,
        taskData: taskData
    });
}

function addTaskAndUnfold(columnId) {
    // First, unfold the column if it's collapsed
    const column = document.querySelector(`[data-column-id="${columnId}"]`);
    if (column && column.classList.contains('collapsed')) {
        toggleColumnCollapse(columnId);
    }
    
    // Then add the task
    addTask(columnId);
}

function addColumn(rowNumber) {
    // Default to row 1 if not specified
    const targetRow = rowNumber || 1;
    
    // Add row tag if not row 1
    let title = '';
    if (targetRow > 1) {
        title = `#row${targetRow}`;
    }
    
    vscode.postMessage({
        type: 'addColumn',
        title: title
    });
}

// Tag toggle operations - uses configured tags from VSCode settings
function toggleColumnTag(columnId, tagName, event) {
    // Prevent event from bubbling up
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    
    if (!currentBoard || !currentBoard.columns) return;
    
    const column = currentBoard.columns.find(c => c.id === columnId);
    if (!column) return;
    
    const tagWithHash = `#${tagName}`;
    let title = column.title || '';
    
    // Check if this specific tag exists in the title (case-insensitive)
    const tagRegex = new RegExp(`#${tagName}\\b`, 'gi');
    const wasActive = tagRegex.test(title);
    
    if (wasActive) {
        // Remove the tag
        title = title.replace(tagRegex, '').replace(/\s+/g, ' ').trim();
    } else {
        // Add the tag (preserve row tags at the end)
        const rowMatch = title.match(/(#row\d+)$/i);
        if (rowMatch) {
            // Insert before row tag
            const beforeRow = title.substring(0, title.length - rowMatch[0].length).trim();
            title = `${beforeRow} ${tagWithHash} ${rowMatch[0]}`;
        } else {
            // Append at end
            title = `${title} ${tagWithHash}`.trim();
        }
    }
    
    // Update local state immediately
    column.title = title;
    
    // Update visual display without re-render
    updateColumnDisplayImmediate(columnId, title, !wasActive, tagName);
    
    // Send update to backend with a delay to batch multiple toggles
    clearTimeout(window.columnTagUpdateTimeout);
    window.columnTagUpdateTimeout = setTimeout(() => {
        vscode.postMessage({
            type: 'editColumnTitle',
            columnId: columnId,
            title: title
        });
    }, 500); // Wait 500ms before sending update
}

// Simplified toggleTaskTag that works immediately
function toggleTaskTag(taskId, columnId, tagName, event) {
    // Prevent event from bubbling up
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    
    if (!currentBoard || !currentBoard.columns) return;
    
    const column = currentBoard.columns.find(c => c.id === columnId);
    if (!column) return;
    
    const task = column.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const tagWithHash = `#${tagName}`;
    let title = task.title || '';
    
    // Check if this specific tag exists in the title (case-insensitive)
    const tagRegex = new RegExp(`#${tagName}\\b`, 'gi');
    const wasActive = tagRegex.test(title);
    
    if (wasActive) {
        // Remove the tag
        title = title.replace(tagRegex, '').replace(/\s+/g, ' ').trim();
    } else {
        // Add the tag at the end
        title = `${title} ${tagWithHash}`.trim();
    }
    
    // Update local state immediately
    task.title = title;
    
    // Update visual display without re-render
    updateTaskDisplayImmediate(taskId, title, !wasActive, tagName);
    
    // Send update to backend with a delay to batch multiple toggles
    clearTimeout(window.taskTagUpdateTimeout);
    window.taskTagUpdateTimeout = setTimeout(() => {
        vscode.postMessage({
            type: 'editTask',
            taskId: taskId,
            columnId: columnId,
            taskData: task
        });
    }, 500); // Wait 500ms before sending update
}

// Update column display immediately with visual feedback
function updateColumnDisplayImmediate(columnId, newTitle, isActive, tagName) {
    const columnElement = document.querySelector(`[data-column-id="${columnId}"]`);
    if (!columnElement) return;
    
    // Update title display
    const titleElement = columnElement.querySelector('.column-title');
    if (titleElement) {
        const displayTitle = newTitle.replace(/#row\d+/gi, '').trim();
        const renderedTitle = displayTitle ? renderMarkdown(displayTitle) : '<span class="task-title-placeholder">Add title...</span>';
        const columnRow = getColumnRow(newTitle);
        const rowIndicator = (window.showRowTags && columnRow > 1) ? `<span class="column-row-tag">Row ${columnRow}</span>` : '';
        titleElement.innerHTML = renderedTitle + rowIndicator;
    }
    
    // Update data attributes
    const firstTag = extractFirstTag(newTitle);
    if (firstTag) {
        columnElement.setAttribute('data-column-tag', firstTag);
    } else {
        columnElement.removeAttribute('data-column-tag');
    }
    
    const allTags = getActiveTagsInTitle(newTitle);
    if (allTags.length > 0) {
        columnElement.setAttribute('data-all-tags', allTags.join(' '));
    } else {
        columnElement.removeAttribute('data-all-tags');
    }
    
    // Update the button visual state
    const button = document.querySelector(`.donut-menu-tag-chip[data-element-id="${columnId}"][data-tag-name="${tagName}"]`);
    if (button) {
        button.classList.toggle('active', isActive);
        const checkbox = button.querySelector('.tag-chip-check');
        if (checkbox) {
            checkbox.textContent = isActive ? '✓' : '';
        }
        updateTagChipStyle(button, tagName, isActive);
    }
}

// Update task display immediately with visual feedback
function updateTaskDisplayImmediate(taskId, newTitle, isActive, tagName) {
    const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
    if (!taskElement) return;
    
    // Update title display
    const titleElement = taskElement.querySelector('.task-title-display');
    if (titleElement) {
        const renderedTitle = newTitle ? renderMarkdown(newTitle) : '<span class="task-title-placeholder">Add title...</span>';
        titleElement.innerHTML = renderedTitle;
    }
    
    // Update data attributes
    const firstTag = extractFirstTag(newTitle);
    if (firstTag) {
        taskElement.setAttribute('data-task-tag', firstTag);
    } else {
        taskElement.removeAttribute('data-task-tag');
    }
    
    const allTags = getActiveTagsInTitle(newTitle);
    if (allTags.length > 0) {
        taskElement.setAttribute('data-all-tags', allTags.join(' '));
    } else {
        taskElement.removeAttribute('data-all-tags');
    }
    
    // Update the button visual state
    const button = document.querySelector(`.donut-menu-tag-chip[data-element-id="${taskId}"][data-tag-name="${tagName}"]`);
    if (button) {
        button.classList.toggle('active', isActive);
        const checkbox = button.querySelector('.tag-chip-check');
        if (checkbox) {
            checkbox.textContent = isActive ? '✓' : '';
        }
        updateTagChipStyle(button, tagName, isActive);
    }
}

// Helper function to update tag chip styling
function updateTagChipStyle(button, tagName, isActive) {
    const config = getTagConfig(tagName);
    const isDarkTheme = document.body.classList.contains('vscode-dark') || 
                       document.body.classList.contains('vscode-high-contrast');
    
    let bgColor = '#666';
    let textColor = '#fff';
    
    if (config) {
        const themeKey = isDarkTheme ? 'dark' : 'light';
        const themeColors = config[themeKey] || config.light || {};
        bgColor = themeColors.background || '#666';
        textColor = themeColors.text || '#fff';
    } else {
        // Default colors for user-added tags
        if (isDarkTheme) {
            bgColor = '#555';
            textColor = '#ddd';
        } else {
            bgColor = '#999';
            textColor = '#fff';
        }
    }
    
    if (isActive) {
        button.style.backgroundColor = bgColor;
        button.style.color = textColor;
    } else {
        button.style.backgroundColor = 'transparent';
        button.style.color = 'inherit';
    }
}


// Update column display without re-rendering
function updateColumnDisplay(columnId, newTitle) {
    const columnElement = document.querySelector(`[data-column-id="${columnId}"]`);
    if (!columnElement) return;
    
    const titleElement = columnElement.querySelector('.column-title');
    if (titleElement) {
        // Filter out row tags for display
        const displayTitle = newTitle.replace(/#row\d+/gi, '').trim();
        const renderedTitle = displayTitle ? renderMarkdown(displayTitle) : '<span class="task-title-placeholder">Add title...</span>';
        
        // Add row indicator if needed
        const columnRow = getColumnRow(newTitle);
        const rowIndicator = (window.showRowTags && columnRow > 1) ? `<span class="column-row-tag">Row ${columnRow}</span>` : '';
        
        titleElement.innerHTML = renderedTitle + rowIndicator;
    }
    
    // Update data attributes for styling
    const firstTag = extractFirstTag(newTitle);
    if (firstTag) {
        columnElement.setAttribute('data-column-tag', firstTag);
    } else {
        columnElement.removeAttribute('data-column-tag');
    }
    
    // Update all tags attribute
    const allTags = getActiveTagsInTitle(newTitle);
    if (allTags.length > 0) {
        columnElement.setAttribute('data-all-tags', allTags.join(' '));
    } else {
        columnElement.removeAttribute('data-all-tags');
    }
}

// Update task display without re-rendering
function updateTaskDisplay(taskId, columnId, taskData) {
    const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
    if (!taskElement) return;
    
    const titleElement = taskElement.querySelector('.task-title-display');
    if (titleElement) {
        const renderedTitle = taskData.title ? renderMarkdown(taskData.title) : '<span class="task-title-placeholder">Add title...</span>';
        titleElement.innerHTML = renderedTitle;
    }
    
    // Update data attributes for styling
    const firstTag = extractFirstTag(taskData.title);
    if (firstTag) {
        taskElement.setAttribute('data-task-tag', firstTag);
    } else {
        taskElement.removeAttribute('data-task-tag');
    }
    
    // Update all tags attribute
    const allTags = getActiveTagsInTitle(taskData.title);
    if (allTags.length > 0) {
        taskElement.setAttribute('data-all-tags', allTags.join(' '));
    } else {
        taskElement.removeAttribute('data-all-tags');
    }
}

// Send all pending tag changes to backend
function flushPendingTagChanges() {
    // Send column changes
    pendingTagChanges.columns.forEach((title, columnId) => {
        vscode.postMessage({
            type: 'editColumnTitle',
            columnId: columnId,
            title: title
        });
    });
    
    // Send task changes
    pendingTagChanges.tasks.forEach(({ columnId, taskData }, taskId) => {
        vscode.postMessage({
            type: 'editTask',
            taskId: taskId,
            columnId: columnId,
            taskData: taskData
        });
    });
    
    // Clear pending changes
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

    const confirmBtn = document.getElementById('input-ok-btn');
    confirmBtn.onclick = confirmAction;

    inputField.onkeydown = e => {
        if (e.key === 'Enter') {
            confirmAction();
        }
    };
}

function closeInputModal() {
    document.getElementById('input-modal').style.display = 'none';
}

// Auto-resize helper
function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}


// Direct handlers for tag clicks that don't trigger re-render
function handleColumnTagClick(columnId, tagName, event) {
    if (!currentBoard || !currentBoard.columns) return;
    
    const column = currentBoard.columns.find(c => c.id === columnId);
    if (!column) return;
    
    const tagWithHash = `#${tagName}`;
    let title = column.title || '';
    
    // Check if this specific tag exists in the title (case-insensitive)
    const tagRegex = new RegExp(`#${tagName}\\b`, 'gi');
    const wasActive = tagRegex.test(title);
    
    if (wasActive) {
        // Remove the tag
        title = title.replace(tagRegex, '').replace(/\s+/g, ' ').trim();
    } else {
        // Add the tag (preserve row tags at the end)
        const rowMatch = title.match(/(#row\d+)$/i);
        if (rowMatch) {
            const beforeRow = title.substring(0, title.length - rowMatch[0].length).trim();
            title = `${beforeRow} ${tagWithHash} ${rowMatch[0]}`;
        } else {
            title = `${title} ${tagWithHash}`.trim();
        }
    }
    
    // Update local state
    column.title = title;
    
    // Update button visual immediately
    const button = event.currentTarget || event.target.closest('.donut-menu-tag-chip');
    if (button) {
        const isNowActive = !wasActive;
        button.classList.toggle('active', isNowActive);
        
        const checkbox = button.querySelector('.tag-chip-check');
        if (checkbox) {
            checkbox.textContent = isNowActive ? '✓' : '';
        }
        
        // Update colors
        const config = getTagConfig(tagName);
        const isDarkTheme = document.body.classList.contains('vscode-dark') || 
                           document.body.classList.contains('vscode-high-contrast');
        
        let bgColor = '#666';
        let textColor = '#fff';
        
        if (config) {
            const themeKey = isDarkTheme ? 'dark' : 'light';
            const themeColors = config[themeKey] || config.light || {};
            bgColor = themeColors.background || '#666';
            textColor = themeColors.text || '#fff';
        } else {
            if (isDarkTheme) {
                bgColor = '#555';
                textColor = '#ddd';
            } else {
                bgColor = '#999';
                textColor = '#fff';
            }
        }
        
        if (isNowActive) {
            button.style.backgroundColor = bgColor;
            button.style.color = textColor;
        } else {
            button.style.backgroundColor = 'transparent';
            button.style.color = 'inherit';
        }
    }
    
    // Update column display
    const columnElement = document.querySelector(`[data-column-id="${columnId}"]`);
    if (columnElement) {
        const titleElement = columnElement.querySelector('.column-title');
        if (titleElement) {
            const displayTitle = title.replace(/#row\d+/gi, '').trim();
            const renderedTitle = displayTitle ? renderMarkdown(displayTitle) : '<span class="task-title-placeholder">Add title...</span>';
            const columnRow = getColumnRow(title);
            const rowIndicator = (window.showRowTags && columnRow > 1) ? `<span class="column-row-tag">Row ${columnRow}</span>` : '';
            titleElement.innerHTML = renderedTitle + rowIndicator;
        }
        
        // Update data attributes
        const firstTag = extractFirstTag(title);
        if (firstTag) {
            columnElement.setAttribute('data-column-tag', firstTag);
        } else {
            columnElement.removeAttribute('data-column-tag');
        }
        
        const allTags = getActiveTagsInTitle(title);
        if (allTags.length > 0) {
            columnElement.setAttribute('data-all-tags', allTags.join(' '));
        } else {
            columnElement.removeAttribute('data-all-tags');
        }
    }
    
    // Delay sending to backend
    clearTimeout(window.columnTagTimeout);
    window.columnTagTimeout = setTimeout(() => {
        vscode.postMessage({
            type: 'editColumnTitle',
            columnId: columnId,
            title: title
        });
    }, 1000);
}

function handleTaskTagClick(taskId, columnId, tagName, event) {
    if (!currentBoard || !currentBoard.columns) return;
    
    const column = currentBoard.columns.find(c => c.id === columnId);
    if (!column) return;
    
    const task = column.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const tagWithHash = `#${tagName}`;
    let title = task.title || '';
    
    // Check if this specific tag exists in the title (case-insensitive)
    const tagRegex = new RegExp(`#${tagName}\\b`, 'gi');
    const wasActive = tagRegex.test(title);
    
    if (wasActive) {
        // Remove the tag
        title = title.replace(tagRegex, '').replace(/\s+/g, ' ').trim();
    } else {
        // Add the tag at the end
        title = `${title} ${tagWithHash}`.trim();
    }
    
    // Update local state
    task.title = title;
    
    // Update button visual immediately
    const button = event.currentTarget || event.target.closest('.donut-menu-tag-chip');
    if (button) {
        const isNowActive = !wasActive;
        button.classList.toggle('active', isNowActive);
        
        const checkbox = button.querySelector('.tag-chip-check');
        if (checkbox) {
            checkbox.textContent = isNowActive ? '✓' : '';
        }
        
        // Update colors
        const config = getTagConfig(tagName);
        const isDarkTheme = document.body.classList.contains('vscode-dark') || 
                           document.body.classList.contains('vscode-high-contrast');
        
        let bgColor = '#666';
        let textColor = '#fff';
        
        if (config) {
            const themeKey = isDarkTheme ? 'dark' : 'light';
            const themeColors = config[themeKey] || config.light || {};
            bgColor = themeColors.background || '#666';
            textColor = themeColors.text || '#fff';
        } else {
            if (isDarkTheme) {
                bgColor = '#555';
                textColor = '#ddd';
            } else {
                bgColor = '#999';
                textColor = '#fff';
            }
        }
        
        if (isNowActive) {
            button.style.backgroundColor = bgColor;
            button.style.color = textColor;
        } else {
            button.style.backgroundColor = 'transparent';
            button.style.color = 'inherit';
        }
    }
    
    // Update task display
    const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
    if (taskElement) {
        const titleElement = taskElement.querySelector('.task-title-display');
        if (titleElement) {
            const renderedTitle = title ? renderMarkdown(title) : '<span class="task-title-placeholder">Add title...</span>';
            titleElement.innerHTML = renderedTitle;
        }
        
        // Update data attributes
        const firstTag = extractFirstTag(title);
        if (firstTag) {
            taskElement.setAttribute('data-task-tag', firstTag);
        } else {
            taskElement.removeAttribute('data-task-tag');
        }
        
        const allTags = getActiveTagsInTitle(title);
        if (allTags.length > 0) {
            taskElement.setAttribute('data-all-tags', allTags.join(' '));
        } else {
            taskElement.removeAttribute('data-all-tags');
        }
    }
    
    // Delay sending to backend
    clearTimeout(window.taskTagTimeout);
    window.taskTagTimeout = setTimeout(() => {
        vscode.postMessage({
            type: 'editTask',
            taskId: taskId,
            columnId: columnId,
            taskData: task
        });
    }, 1000);
}

// Removed redundant global mouseenter listener - menu items already have their own handlers

function performSort() {
    vscode.postMessage({
        type: 'performSort'
    });
}

// Make handlers globally available
window.handleColumnTagClick = handleColumnTagClick;
window.handleTaskTagClick = handleTaskTagClick;
window.positionSubmenu = positionSubmenu;
window.toggleDonutMenu = toggleDonutMenu;
window.columnTagTimeout = null;
window.taskTagTimeout = null;
window.tagHandlers = window.tagHandlers || {};


window.toggleColumnTag = toggleColumnTag;
window.toggleTaskTag = toggleTaskTag;
window.updateTagChipStyle = updateTagChipStyle;
window.columnTagUpdateTimeout = null;
window.taskTagUpdateTimeout = null;