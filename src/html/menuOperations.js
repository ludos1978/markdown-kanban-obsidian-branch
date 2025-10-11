// Unified Menu System - Simple and DRY

// Declare window properties for TypeScript
if (typeof window !== 'undefined') {
    window._lastFlushedChanges = null;
    window.handleColumnTagClick = null;
    window.handleTaskTagClick = null;
}

// Global state
let activeTagMenu = null;

/**
 * Scrolls an element into view only if it's outside the viewport
 * @param {HTMLElement} element - Element to check and potentially scroll
 * @param {string} type - 'task' or 'column' for logging purposes
 */
function scrollToElementIfNeeded(element, type = 'element') {
    if (!element) return;

    const rect = element.getBoundingClientRect();

    // For columns, check horizontal visibility
    // For tasks, check vertical visibility
    let isVisible;
    if (type === 'column') {
        isVisible = rect.left >= 0 && rect.right <= window.innerWidth;
    } else {
        isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
    }

    console.log(`[scrollToElementIfNeeded] ${type} visibility check:`, {
        isVisible,
        rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        willScroll: !isVisible
    });

    if (!isVisible) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// Simple Menu Manager - handles all menu types
class SimpleMenuManager {
    constructor() {
        this.activeSubmenu = null;
        this.hideTimeout = null;
    }

    // Safe button click handler - works for all button types without eval
    handleButtonClick(button, shouldCloseMenu = true) {
        
        // Check if this is a tag chip button - these have their own click handlers
        // and should not be double-handled
        if (button.classList.contains('donut-menu-tag-chip')) {
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

    /**
     * Parses function parameters from string safely
     * Purpose: Extract arguments without eval
     * Used by: executeSafeFunction() for parameter extraction
     * @param {string} paramString - Comma-separated parameters
     * @returns {Array} Parsed parameter values
     */
    parseParameters(paramString) {
        if (!paramString || !paramString.trim()) {return [];}
        
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
        if (trimmed === 'true') {return true;}
        if (trimmed === 'false') {return false;}
        if (trimmed === 'null') {return null;}
        if (trimmed === 'undefined') {return undefined;}
        
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
            z-index: 2147483647;
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

            // Get current element's active tags to ensure they're always shown
            const currentBoard = window.cachedBoard;
            let currentTitle = '';
            if (type === 'column') {
                const column = currentBoard?.columns?.find(c => c.id === id);
                currentTitle = column?.title || '';
            } else if (type === 'task' && columnId) {
                const column = currentBoard?.columns?.find(c => c.id === columnId);
                const task = column?.tasks?.find(t => t.id === id);
                currentTitle = task?.title || '';
            }
            const activeTags = window.getActiveTagsInTitle ? window.getActiveTagsInTitle(currentTitle) : [];

            if (group === 'custom') {
                tags = window.getUserAddedTags ? window.getUserAddedTags() : [];
            } else {
                const groupValue = tagConfig[group];

                if (groupValue && typeof groupValue === 'object') {
                    // Check if this is a direct tag (has any styling properties)
                    const isDirectTag = groupValue.light || groupValue.dark || groupValue.headerBar ||
                                       groupValue.border || groupValue.footerBar || groupValue.cornerBadge;

                    if (isDirectTag) {
                        tags = [group];
                    } else {
                        // It's a group, collect its tags that have styling OR are currently active
                        tags = Object.keys(groupValue).filter(key => {
                            const val = groupValue[key];
                            // Include if has styling properties OR if currently active on this element
                            const hasTagProperties = val && typeof val === 'object' &&
                                                    (val.light || val.dark || val.headerBar ||
                                                     val.border || val.footerBar || val.cornerBadge);
                            const isActive = activeTags.includes(key.toLowerCase());
                            return hasTagProperties || isActive;
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
        const currentBoard = window.cachedBoard;
        if (!currentBoard?.columns) {return '';}
        
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
                
                // Check if this is a move operation button
                const onclick = button.getAttribute('onclick');
                const isMoveOperation = onclick && onclick.includes('moveTask');
                
                // Tag chips don't close menu, move operations force close
                const shouldClose = !button.classList.contains('donut-menu-tag-chip');
                
                // For move operations, ensure menu closes immediately
                if (isMoveOperation) {
                    this.handleButtonClick(button, true);
                    // Force immediate menu closure for move operations
                    setTimeout(() => {
                        closeAllMenus();
                        this.hideSubmenu();
                    }, 10);
                } else {
                    this.handleButtonClick(button, shouldClose);
                }
            });
        });

        // Hover management - track when we're in a submenu
        submenu.addEventListener('mouseenter', () => {
            this.clearTimeout();
            window._inSubmenu = true;
            // Also set dropdown state to prevent closing during transition
            window._inDropdown = true;
        });
        submenu.addEventListener('mouseleave', () => {
            window._inSubmenu = false;
            // Clear dropdown state when leaving submenu
            window._inDropdown = false;
            this.startHideTimer();
        });
    }

    // Smart positioning that handles viewport boundaries
    positionSubmenu(menuItem, submenu) {
        const rect = menuItem.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Store original display state
        const originalDisplay = submenu.style.display;
        const originalVisibility = submenu.style.visibility;
        
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
        
        // Restore visibility (but keep display as flex)
        submenu.style.visibility = 'visible';
        // Note: We keep display as 'flex' since that's what the submenu should be when shown
    }

    // Timeout management
    startHideTimer() {
        this.clearTimeout();
        this.hideTimeout = setTimeout(() => {
            this.hideSubmenu();
            
            // Also close parent menu if we're not hovering over it
            setTimeout(() => {
                if (!window._inDropdown && !window._inSubmenu) {
                    // CRITICAL: Don't close menu if a button inside a moved dropdown has focus
                    // This prevents scroll issues when clicking tag buttons
                    const activeElement = document.activeElement;
                    const isInMovedDropdown = activeElement?.closest('.donut-menu-dropdown.moved-to-body, .file-bar-menu-dropdown.moved-to-body');

                    if (isInMovedDropdown) {
                        return; // Don't close the menu
                    }

                    document.querySelectorAll('.donut-menu.active').forEach(menu => {
                        menu.classList.remove('active');

                        // Clean up any moved dropdowns - check both in menu and moved to body
                        let dropdown = menu.querySelector('.donut-menu-dropdown, .file-bar-menu-dropdown');
                        if (!dropdown) {
                            // Look for moved dropdowns in body that belong to this menu
                            const movedDropdowns = document.body.querySelectorAll('.donut-menu-dropdown.moved-to-body, .file-bar-menu-dropdown.moved-to-body');
                            dropdown = Array.from(movedDropdowns).find(d => d._originalParent === menu);
                        }

                        if (dropdown) {
                            cleanupDropdown(dropdown);
                        }
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

/**
 * Cleans up dropdowns that were moved to document.body
 * Purpose: Restore dropdowns to original position when closing
 * Used by: closeAllMenus(), menu close operations
 * @param {HTMLElement} dropdown - Dropdown element to clean up
 * Side effects: Restores DOM position, clears positioning styles
 */
function cleanupDropdown(dropdown) {
    if (dropdown._originalParent && dropdown.parentElement === document.body) {
        // Restore to original position
        if (dropdown._originalNextSibling) {
            dropdown._originalParent.insertBefore(dropdown, dropdown._originalNextSibling);
        } else {
            dropdown._originalParent.appendChild(dropdown);
        }

        // Clean up tracking properties and CSS classes
        delete dropdown._originalParent;
        delete dropdown._originalNextSibling;
        dropdown.classList.remove('moved-to-body');

        // Reset styles
        dropdown.style.position = '';
        dropdown.style.left = '';
        dropdown.style.top = '';
        dropdown.style.zIndex = '';
    }
}

/**
 * Closes all open menus and cleans up moved dropdowns
 * Purpose: Complete menu cleanup including repositioned elements
 * Used by: Click outside, task moves, saves
 * Side effects: Removes active classes, restores dropdown positions
 */
function closeAllMenus() {
    // Close donut menus and only clean up dropdowns that were actually moved to body
    document.querySelectorAll('.donut-menu, .file-bar-menu').forEach(m => {
        m.classList.remove('active');
    });
    
    // Only clean up dropdowns that were actually moved to body
    document.querySelectorAll('.donut-menu-dropdown.moved-to-body, .file-bar-menu-dropdown.moved-to-body').forEach(dropdown => {
        cleanupDropdown(dropdown);
    });
}

/**
 * Toggles burger/donut menu open/closed state
 * Purpose: Main menu activation for columns and tasks
 * Used by: Burger button clicks on columns and tasks
 * @param {Event} event - Click event
 * @param {HTMLElement} button - Menu button element
 */
function toggleDonutMenu(event, button) {
    event.stopPropagation();
    const menu = button.parentElement;
    const wasActive = menu.classList.contains('active');
    
    // Close all menus and clean up their dropdowns (only needed here for moved dropdowns)
    closeAllMenus();
    
    if (!wasActive) {
        menu.classList.add('active');
        activeTagMenu = menu;
        
        const dropdown = menu.querySelector('.donut-menu-dropdown');
        if (dropdown) {
            positionDropdown(button, dropdown);
            setupMenuHoverHandlers(menu, dropdown);
            
            // Update tag category counts (including "Remove all tags" button) when menu opens
            // Use data-group selector to find tag menu items specifically (not Move/Move-to-list items)
            const firstTagMenuItem = dropdown.querySelector('[data-group][data-id][data-type]');
            if (firstTagMenuItem) {
                const id = firstTagMenuItem.getAttribute('data-id');
                const type = firstTagMenuItem.getAttribute('data-type');
                const columnId = firstTagMenuItem.getAttribute('data-column-id');
                updateTagCategoryCounts(id, type, columnId || null);
            }
        }
    }
}

/**
 * Sets up hover interactions for menu and submenus
 * Purpose: Enable smooth menu navigation with hover delays
 * Used by: toggleDonutMenu() after menu opens
 * @param {HTMLElement} menu - Menu container
 * @param {HTMLElement} dropdown - Dropdown container
 */
function setupMenuHoverHandlers(menu, dropdown) {
    // Add hover handlers to the menu button itself to maintain hover state
    const menuButton = menu.querySelector('.donut-menu-btn');
    if (menuButton) {
        menuButton.addEventListener('mouseenter', () => {
            window.menuManager.clearTimeout();
            window._inDropdown = true;
        });
        menuButton.addEventListener('mouseleave', () => {
            window._inDropdown = false;
            window.menuManager.startHideTimer();
        });
    }
    
    // Add hover handlers to the dropdown itself (including padding border area)
    dropdown.addEventListener('mouseenter', () => {
        window.menuManager.clearTimeout();
        window._inDropdown = true;
    });
    dropdown.addEventListener('mouseleave', () => {
        window._inDropdown = false;
        window.menuManager.startHideTimer();
    });
    
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
}

// Simple dropdown positioning - move to body to escape stacking contexts
function positionDropdown(triggerButton, dropdown) {
    const rect = triggerButton.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Move dropdown to body first to get accurate measurements
    if (dropdown.parentElement !== document.body) {
        // Store original parent for cleanup later
        dropdown._originalParent = dropdown.parentElement;
        dropdown._originalNextSibling = dropdown.nextSibling;
        document.body.appendChild(dropdown);
        dropdown.classList.add('moved-to-body');
    }
    
    // Ensure fixed positioning and correct z-index
    dropdown.style.position = 'fixed';
    dropdown.style.zIndex = '2147483640';
    
    // Get actual dropdown dimensions by temporarily showing it
    const originalDisplay = dropdown.style.display;
    const originalVisibility = dropdown.style.visibility;
    dropdown.style.visibility = 'hidden';
    dropdown.style.display = 'block';
    
    const dropdownRect = dropdown.getBoundingClientRect();
    const dropdownWidth = dropdownRect.width || 180;
    const dropdownHeight = dropdownRect.height || 300;
    
    // Calculate horizontal position (prefer right side of trigger)
    let left = rect.right - dropdownWidth;
    
    // Check boundaries and adjust
    if (left < 10) {left = 10;}
    if (left + dropdownWidth > viewportWidth - 10) {
        left = viewportWidth - dropdownWidth - 10;
    }
    
    // Calculate vertical position (prefer below trigger)
    let top = rect.bottom + 5;
    
    // If dropdown goes off bottom, position above trigger
    if (top + dropdownHeight > viewportHeight - 10) {
        top = rect.top - dropdownHeight - 5;
    }
    
    // Final boundary check
    if (top < 10) {top = 10;}
    if (top + dropdownHeight > viewportHeight - 10) {
        top = viewportHeight - dropdownHeight - 10;
    }
    
    // Apply positioning
    dropdown.style.left = left + 'px';
    dropdown.style.top = top + 'px';
    
    // Restore original visibility
    dropdown.style.visibility = originalVisibility;
    dropdown.style.display = originalDisplay;
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
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Get actual dropdown dimensions by temporarily showing it
    const originalDisplay = dropdown.style.display;
    const originalVisibility = dropdown.style.visibility;
    dropdown.style.visibility = 'hidden';
    dropdown.style.display = 'block';
    
    const dropdownRect = dropdown.getBoundingClientRect();
    const dropdownWidth = dropdownRect.width || 200;
    const dropdownHeight = dropdownRect.height || 150;
    
    // Calculate horizontal position (prefer aligned with right edge of trigger)
    let left = rect.right - dropdownWidth;
    
    // Check horizontal boundaries
    if (left < 10) {left = 10;}
    if (left + dropdownWidth > viewportWidth - 10) {
        left = viewportWidth - dropdownWidth - 10;
    }
    
    // Calculate vertical position (prefer below trigger)
    let top = rect.bottom + 4;
    
    // If dropdown goes off bottom, position above trigger
    if (top + dropdownHeight > viewportHeight - 10) {
        top = rect.top - dropdownHeight - 4;
    }
    
    // Final vertical boundary check
    if (top < 10) {top = 10;}
    if (top + dropdownHeight > viewportHeight - 10) {
        top = viewportHeight - dropdownHeight - 10;
    }
    
    // Apply positioning
    dropdown.style.left = left + 'px';
    dropdown.style.top = top + 'px';
    
    // Restore original visibility
    dropdown.style.visibility = originalVisibility;
    dropdown.style.display = originalDisplay;
}

// Column operations - keep existing functions
function insertColumnBefore(columnId) {
    // Close all menus properly
    closeAllMenus();

    // Get reference column and its row
    const referenceIndex = window.cachedBoard?.columns.findIndex(col => col.id === columnId) || 0;
    const referenceColumn = window.cachedBoard?.columns[referenceIndex];

    // Extract row tag from reference column (e.g., #row2)
    let tags = '';
    if (referenceColumn && referenceColumn.title) {
        const rowMatch = referenceColumn.title.match(/#row(\d+)\b/i);
        if (rowMatch) {
            tags = ` ${rowMatch[0]}`;
        }

        // If reference column has #stack tag:
        // 1. New column should also have #stack tag
        // 2. Reference column must keep its #stack tag (ensure it's there)
        const hasStackTag = /#stack\b/i.test(referenceColumn.title);
        if (hasStackTag) {
            tags += ' #stack';

            // Ensure reference column has #stack tag (it should already, but make sure)
            if (!/#stack\b/i.test(referenceColumn.title)) {
                // Add #stack to reference column if somehow missing
                const trimmedTitle = referenceColumn.title.trim();
                // Ensure space before #stack if title is not empty
                referenceColumn.title = trimmedTitle ? `${trimmedTitle} #stack` : ' #stack';
            }
        }
    }

    // Cache-first: Create new column and insert before reference column
    const newColumn = {
        id: `temp-column-before-${Date.now()}`,
        title: tags.trim(), // Include row tag and #stack tag if needed
        tasks: []
    };

    updateCacheForNewColumn(newColumn, referenceIndex, columnId);

    // No VS Code message - cache-first system requires explicit save via Cmd+S
}

function insertColumnAfter(columnId) {
    // Close all menus properly
    closeAllMenus();

    // Get reference column and its row
    const referenceIndex = window.cachedBoard?.columns.findIndex(col => col.id === columnId) || 0;
    const referenceColumn = window.cachedBoard?.columns[referenceIndex];

    // Extract row tag from reference column (e.g., #row2)
    let tags = '';
    if (referenceColumn && referenceColumn.title) {
        const rowMatch = referenceColumn.title.match(/#row(\d+)\b/i);
        if (rowMatch) {
            tags = ` ${rowMatch[0]}`;
        }

        // If reference column has #stack tag, new column should also have #stack tag
        const hasStackTag = /#stack\b/i.test(referenceColumn.title);
        if (hasStackTag) {
            tags += ' #stack';
        }
    }

    // Cache-first: Create new column and insert after reference column
    const newColumn = {
        id: `temp-column-after-${Date.now()}`,
        title: tags.trim(), // Include row tag and #stack tag if needed
        tasks: []
    };

    updateCacheForNewColumn(newColumn, referenceIndex + 1, columnId);

    // No VS Code message - cache-first system requires explicit save via Cmd+S
}

function moveColumnLeft(columnId) {
    if (!currentBoard?.columns) {return;}

    // Flush pending tag changes before moving
    if ((window.pendingTaskChanges && window.pendingTaskChanges.size > 0) ||
        (window.pendingColumnChanges && window.pendingColumnChanges.size > 0)) {
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

        // Close all menus
        document.querySelectorAll('.donut-menu').forEach(menu => menu.classList.remove('active'));

        // Update button state to show unsaved changes
        updateRefreshButtonState('unsaved', 1);

        // Recalculate stack positions after column move
        if (typeof window.applyStackedColumnStyles === 'function') {
            requestAnimationFrame(() => window.applyStackedColumnStyles());
        }
    }
}

function moveColumnRight(columnId) {
    if (!currentBoard?.columns) {return;}

    // Flush pending tag changes before moving
    if ((window.pendingTaskChanges && window.pendingTaskChanges.size > 0) ||
        (window.pendingColumnChanges && window.pendingColumnChanges.size > 0)) {
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

        // Close all menus
        document.querySelectorAll('.donut-menu').forEach(menu => menu.classList.remove('active'));

        // Update button state to show unsaved changes
        updateRefreshButtonState('unsaved', 1);

        // Recalculate stack positions after column move
        if (typeof window.applyStackedColumnStyles === 'function') {
            requestAnimationFrame(() => window.applyStackedColumnStyles());
        }
    }
}

function changeColumnSpan(columnId, delta) {
    if (!currentBoard?.columns) {return;}

    const column = currentBoard.columns.find(c => c.id === columnId);
    if (!column) {return;}

    // Extract current span value
    const spanMatch = column.title.match(/#span(\d+)\b/i);
    let currentSpan = spanMatch ? parseInt(spanMatch[1]) : 1;

    // Calculate new span value (1-4 range)
    let newSpan = currentSpan + delta;
    newSpan = Math.max(1, Math.min(4, newSpan));

    // If no change needed, return early
    if (newSpan === currentSpan) {return;}

    // Flush pending tag changes first
    if ((window.pendingTaskChanges && window.pendingTaskChanges.size > 0) ||
        (window.pendingColumnChanges && window.pendingColumnChanges.size > 0)) {
        flushPendingTagChanges();
    }

    // Update the column title
    let newTitle = column.title;

    if (newSpan === 1) {
        // Remove span tag entirely
        newTitle = newTitle.replace(/#span\d+\b\s*/gi, '').replace(/\s+/g, ' ').trim();
    } else {
        if (spanMatch) {
            // Replace existing span tag
            newTitle = newTitle.replace(/#span\d+\b/gi, `#span${newSpan}`);
        } else {
            // Add new span tag
            newTitle += ` #span${newSpan}`;
        }
    }

    // Update the column in currentBoard and cachedBoard
    column.title = newTitle;

    if (typeof cachedBoard !== 'undefined' && cachedBoard?.columns) {
        const cachedColumn = cachedBoard.columns.find(c => c.id === columnId);
        if (cachedColumn) {
            cachedColumn.title = newTitle;
        }
    }

    // Update the column element immediately
    const columnElement = document.querySelector(`.kanban-full-height-column[data-column-id="${columnId}"]`);
    if (columnElement) {
        // Update CSS classes (only blocked by viewport-based widths, not pixel widths)
        columnElement.classList.remove('column-span-2', 'column-span-3', 'column-span-4');
        const hasViewportWidth = window.currentColumnWidth && (window.currentColumnWidth === '33percent' || window.currentColumnWidth === '50percent' || window.currentColumnWidth === '100percent');
        if (newSpan >= 2 && !hasViewportWidth) {
            columnElement.classList.add(`column-span-${newSpan}`);
        }

        // Update the title display using shared function (fixed selector)
        const titleElement = columnElement.querySelector('.column-title-text');
        if (titleElement && window.cachedBoard) {
            const columnData = window.cachedBoard.columns.find(c => c.id === columnId);
            if (columnData) {
                const renderedTitle = window.tagUtils ? window.tagUtils.getColumnDisplayTitle(columnData, window.filterTagsFromText) : (columnData.title || '');
                titleElement.innerHTML = renderedTitle;
            }
        }

        // Update the span value display in the menu
        const spanValueElement = document.querySelector(`[data-column-id="${columnId}"].span-width-value`);
        if (spanValueElement) {
            spanValueElement.textContent = newSpan.toString();
        }
    }

    // Mark as unsaved
    if (typeof markUnsavedChanges === 'function') {
        markUnsavedChanges();
    }

    // Update button state to show unsaved changes
    updateRefreshButtonState('unsaved', 1);
}

function toggleColumnStack(columnId) {
    if (!currentBoard?.columns) {return;}

    const column = currentBoard.columns.find(c => c.id === columnId);
    if (!column) {return;}

    // Flush pending tag changes first
    if ((window.pendingTaskChanges && window.pendingTaskChanges.size > 0) ||
        (window.pendingColumnChanges && window.pendingColumnChanges.size > 0)) {
        flushPendingTagChanges();
    }

    // Check current stack state
    const hasStack = /#stack\b/i.test(column.title);
    let newTitle = column.title;

    if (hasStack) {
        // Remove stack tag
        newTitle = newTitle.replace(/#stack\b\s*/gi, '').replace(/\s+/g, ' ').trim();
    } else {
        // Add stack tag
        newTitle += ' #stack';
    }

    // Update the column in currentBoard and cachedBoard
    column.title = newTitle;

    if (typeof cachedBoard !== 'undefined' && cachedBoard?.columns) {
        const cachedColumn = cachedBoard.columns.find(c => c.id === columnId);
        if (cachedColumn) {
            cachedColumn.title = newTitle;
        }
    }

    // Update the column element immediately
    const columnElement = document.querySelector(`.kanban-full-height-column[data-column-id="${columnId}"]`);
    if (columnElement) {
        // Update the title display using shared function (fixed selector)
        const titleElement = columnElement.querySelector('.column-title-text');
        if (titleElement && window.cachedBoard) {
            const columnData = window.cachedBoard.columns.find(c => c.id === columnId);
            if (columnData) {
                const renderedTitle = window.tagUtils ? window.tagUtils.getColumnDisplayTitle(columnData, window.filterTagsFromText) : (columnData.title || '');
                titleElement.innerHTML = renderedTitle;
            }
        }

        // Update the stack toggle button
        const stackToggleBtn = document.querySelector(`button.stack-toggle-btn[onclick*="${columnId}"]`);
        if (stackToggleBtn) {
            const newHasStack = /#stack\b/i.test(newTitle);
            stackToggleBtn.textContent = newHasStack ? 'On' : 'Off';
            if (newHasStack) {
                stackToggleBtn.classList.add('active');
            } else {
                stackToggleBtn.classList.remove('active');
            }
        }
    }

    // Trigger board refresh for layout changes
    setTimeout(() => {
        if (typeof window.renderBoard === 'function' && window.cachedBoard) {
            window.renderBoard(window.cachedBoard);
        }
    }, 50);

    // Mark as unsaved
    if (typeof markUnsavedChanges === 'function') {
        markUnsavedChanges();
    }

    // Update button state to show unsaved changes
    updateRefreshButtonState('unsaved', 1);
}

function deleteColumn(columnId) {
    // Close all menus properly
    closeAllMenus();

    // NEW CACHE SYSTEM: Remove column from cached board first
    if (window.cachedBoard) {
        const columnIndex = window.cachedBoard.columns.findIndex(col => col.id === columnId);
        if (columnIndex >= 0) {
            const deletedColumn = window.cachedBoard.columns.splice(columnIndex, 1)[0];

            // Also update currentBoard for compatibility
            if (window.cachedBoard !== window.cachedBoard) {
                const currentColumnIndex = window.cachedBoard.columns.findIndex(col => col.id === columnId);
                if (currentColumnIndex >= 0) {
                    window.cachedBoard.columns.splice(currentColumnIndex, 1);
                }
            }

            // Remove column from DOM immediately - use specific selector to avoid removing tasks
            const columnElement = document.querySelector(`.kanban-full-height-column[data-column-id="${columnId}"]`);
            if (columnElement) {
                columnElement.remove();
            }

            // Mark board as having unsaved changes
            markUnsavedChanges();

            // Send message to VS Code for undo tracking
            vscode.postMessage({ type: 'deleteColumn', columnId });

        }
    }
}

function sortColumn(columnId, sortType) {
    vscode.postMessage({ type: 'sortColumn', columnId, sortType });
}

// Copy operations - using unified export system
async function copyColumnAsMarkdown(columnId) {
    if (!currentBoard?.columns) {return;}
    const columnIndex = currentBoard.columns.findIndex(c => c.id === columnId);
    if (columnIndex === -1) {return;}

    // Use unified export system with presentation format
    vscode.postMessage({
        type: 'generateCopyContent',
        options: {
            scope: 'column',
            format: 'presentation',
            tagVisibility: 'allexcludinglayout',
            packAssets: false,
            selection: {
                columnIndex: columnIndex
            }
        }
    });

    document.querySelectorAll('.donut-menu').forEach(menu => menu.classList.remove('active'));
}

async function copyTaskAsMarkdown(taskId, columnId) {
    if (!currentBoard?.columns) {return;}
    const columnIndex = currentBoard.columns.findIndex(c => c.id === columnId);
    if (columnIndex === -1) {return;}

    // Use unified export system with presentation format
    vscode.postMessage({
        type: 'generateCopyContent',
        options: {
            scope: 'task',
            format: 'presentation',
            tagVisibility: 'allexcludinglayout',
            packAssets: false,
            selection: {
                columnIndex: columnIndex,
                taskId: taskId
            }
        }
    });

    document.querySelectorAll('.donut-menu').forEach(menu => menu.classList.remove('active'));
}

function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            vscode.postMessage({ type: 'showMessage', text: 'Copied to clipboard!' });
        }).catch(err => console.error('Failed to copy:', err));
    }
}

// Column include mode operations
function toggleColumnIncludeMode(columnId) {
    // Close all menus properly
    closeAllMenus();

    if (!window.cachedBoard) {
        console.error('No cached board available');
        return;
    }

    const column = window.cachedBoard.columns.find(col => col.id === columnId);
    if (!column) {
        console.error('Column not found:', columnId);
        return;
    }

    if (column.includeMode) {
        // Disable include mode - convert included tasks to regular tasks
        // Send confirmation request to VS Code since webview is sandboxed
        vscode.postMessage({
            type: 'confirmDisableIncludeMode',
            columnId: columnId,
            message: 'Disable include mode? This will convert all included slides to regular cards. The original presentation file will not be modified.'
        });
        return; // Exit here, the backend will handle the confirmation and response
    } else {
        // Enable include mode - request file path via VS Code dialog
        vscode.postMessage({
            type: 'requestIncludeFileName',
            columnId: columnId
        });
        return; // Exit here, the backend will handle the input and response
    }
}

// Function called from backend after user provides include file name
function enableColumnIncludeMode(columnId, fileName) {
    if (!window.cachedBoard) {
        console.error('No cached board available');
        return;
    }

    const column = window.cachedBoard.columns.find(col => col.id === columnId);
    if (!column) {
        console.error('Column not found:', columnId);
        return;
    }

		// Update column title to include the syntax
		const currentTitle = column.title || '';
		const newTitle = `${currentTitle} !!!columninclude(${fileName.trim()})!!!`.trim();

		// Update the cached board
		column.originalTitle = currentTitle;
		column.title = newTitle;

		// Also update currentBoard for compatibility
		if (window.cachedBoard !== window.cachedBoard) {
				const currentColumn = window.cachedBoard.columns.find(col => col.id === columnId);
				if (currentColumn) {
						currentColumn.originalTitle = currentTitle;
						currentColumn.title = newTitle;
				}
		}

		// Send update to backend
		vscode.postMessage({
				type: 'updateBoard',
				board: window.cachedBoard
		});

		// Update button state to show unsaved changes
		updateRefreshButtonState('unsaved', 1);
}

// Edit column include file
function editColumnIncludeFile(columnId) {
    // Close all menus properly
    closeAllMenus();

    if (!window.cachedBoard) {
        console.error('No cached board available');
        return;
    }

    const column = window.cachedBoard.columns.find(col => col.id === columnId);
    if (!column) {
        console.error('Column not found:', columnId);
        return;
    }

    if (!column.includeMode || !column.includeFiles || column.includeFiles.length === 0) {
        vscode.postMessage({
            type: 'showMessage',
            text: 'This column is not in include mode or has no include files.'
        });
        return;
    }

    // Get current include file path
    const currentFile = column.includeFiles[0]; // For now, handle single file includes

    // Request new file path via VS Code dialog
    vscode.postMessage({
        type: 'requestEditIncludeFileName',
        columnId: columnId,
        currentFile: currentFile
    });
    return; // Exit here, the backend will handle the input and response
}

// Function called from backend after user provides edited include file name
function updateColumnIncludeFile(columnId, newFileName, currentFile) {
    if (!window.cachedBoard) {
        console.error('No cached board available');
        return;
    }

    const column = window.cachedBoard.columns.find(col => col.id === columnId);
    if (!column) {
        console.error('Column not found:', columnId);
        return;
    }

    if (newFileName && newFileName.trim() && newFileName.trim() !== currentFile) {
        // Extract the clean title (without include syntax)
        let cleanTitle = column.title || '';

        // Remove all existing columninclude patterns
        cleanTitle = cleanTitle.replace(/!!!columninclude\([^)]+\)!!!/g, '').trim();

        // Create new title with updated include syntax
        const newTitle = `${cleanTitle} !!!columninclude(${newFileName.trim()})!!!`.trim();

        // Update the cached board
        column.title = newTitle;
        column.includeFiles = [newFileName.trim()];
        column.originalTitle = newTitle;

        // Also update currentBoard for compatibility
        if (window.cachedBoard !== window.cachedBoard) {
            const currentColumn = window.cachedBoard.columns.find(col => col.id === columnId);
            if (currentColumn) {
                currentColumn.title = newTitle;
                currentColumn.includeFiles = [newFileName.trim()];
                currentColumn.originalTitle = newTitle;
            }
        }

        // Send update to backend
        vscode.postMessage({
            type: 'updateBoard',
            board: window.cachedBoard
        });

        // Update button state to show unsaved changes
        updateRefreshButtonState('unsaved', 1);

        vscode.postMessage({
            type: 'showMessage',
            text: `Column include file updated to: ${newFileName.trim()}`
        });
    }
}

// Function called from backend after user confirms disable include mode
function disableColumnIncludeMode(columnId) {
    if (!window.cachedBoard) {
        console.error('No cached board available');
        return;
    }

    const column = window.cachedBoard.columns.find(col => col.id === columnId);
    if (!column) {
        console.error('Column not found:', columnId);
        return;
    }

    // Extract the clean title (without include syntax)
    let cleanTitle = column.title || '';
    cleanTitle = cleanTitle.replace(/!!!columninclude\([^)]+\)!!!/g, '').trim();

    // If no clean title remains, use the filename
    if (!cleanTitle && column.includeFiles && column.includeFiles.length > 0) {
        const fileName = column.includeFiles[0].split('/').pop().replace(/\.[^/.]+$/, '');
        cleanTitle = fileName;
    }

    // Update the column to regular mode
    column.title = cleanTitle || 'Untitled Column';
    column.includeMode = false;
    delete column.includeFiles;
    delete column.originalTitle;

    // Also update currentBoard for compatibility
    if (window.cachedBoard !== window.cachedBoard) {
        const currentColumn = window.cachedBoard.columns.find(col => col.id === columnId);
        if (currentColumn) {
            currentColumn.title = cleanTitle || 'Untitled Column';
            currentColumn.includeMode = false;
            delete currentColumn.includeFiles;
            delete currentColumn.originalTitle;
        }
    }

    // Send update to backend
    vscode.postMessage({
        type: 'updateBoard',
        board: window.cachedBoard
    });

    // Update button state to show unsaved changes
    updateRefreshButtonState('unsaved', 1);

    vscode.postMessage({
        type: 'showMessage',
        text: 'Include mode disabled. Tasks converted to regular cards.'
    });
}

// Task include operations
function enableTaskIncludeMode(taskId, columnId, fileName) {
    if (!window.cachedBoard) {
        console.error('No cached board available');
        return;
    }

    const column = window.cachedBoard.columns.find(col => col.id === columnId);
    if (!column) {
        console.error('Column not found:', columnId);
        return;
    }

    const task = column.tasks.find(t => t.id === taskId);
    if (!task) {
        console.error('Task not found:', taskId);
        return;
    }

    // Update task title to include the syntax
    const currentTitle = task.title || '';
    const newTitle = `${currentTitle} !!!taskinclude(${fileName.trim()})!!!`.trim();

    // Update the cached board
    task.originalTitle = currentTitle;
    task.title = newTitle;

    // Also update currentBoard for compatibility
    if (window.cachedBoard !== window.cachedBoard) {
        const currentColumn = window.cachedBoard.columns.find(col => col.id === columnId);
        if (currentColumn) {
            const currentTask = currentColumn.tasks.find(t => t.id === taskId);
            if (currentTask) {
                currentTask.originalTitle = currentTitle;
                currentTask.title = newTitle;
            }
        }
    }

    // Send update to backend
    vscode.postMessage({
        type: 'updateBoard',
        board: window.cachedBoard
    });

    // Update button state to show unsaved changes
    updateRefreshButtonState('unsaved', 1);
}

// Edit task include file
function editTaskIncludeFile(taskId, columnId) {
    // Close all menus properly
    closeAllMenus();

    if (!window.cachedBoard) {
        console.error('No cached board available');
        return;
    }

    const column = window.cachedBoard.columns.find(col => col.id === columnId);
    if (!column) {
        console.error('Column not found:', columnId);
        return;
    }

    const task = column.tasks.find(t => t.id === taskId);
    if (!task) {
        console.error('Task not found:', taskId);
        return;
    }

    if (!task.includeMode || !task.includeFiles || task.includeFiles.length === 0) {
        vscode.postMessage({
            type: 'showMessage',
            text: 'This task is not in include mode or has no include files.'
        });
        return;
    }

    // Get current include file path
    const currentFile = task.includeFiles[0]; // For now, handle single file includes

    // Request new filename from backend
    vscode.postMessage({
        type: 'requestInput',
        prompt: 'Enter the new include file name:',
        value: currentFile,
        callback: 'updateTaskIncludeFile',
        params: { taskId: taskId, columnId: columnId }
    });
}

// Function called from backend after user provides new include file name
function updateTaskIncludeFile(taskId, columnId, newFileName) {
    if (!window.cachedBoard) {
        console.error('No cached board available');
        return;
    }

    const column = window.cachedBoard.columns.find(col => col.id === columnId);
    if (!column) {
        console.error('Column not found:', columnId);
        return;
    }

    const task = column.tasks.find(t => t.id === taskId);
    if (!task) {
        console.error('Task not found:', taskId);
        return;
    }

    // Update task title with new include file
    let cleanTitle = task.title || '';

    // Remove all existing taskinclude patterns
    cleanTitle = cleanTitle.replace(/!!!taskinclude\([^)]+\)!!!/g, '').trim();

    // Add new include pattern
    const newTitle = `${cleanTitle} !!!taskinclude(${newFileName.trim()})!!!`.trim();

    // Update cached board
    task.title = newTitle;
    task.originalTitle = cleanTitle;

    // Also update currentBoard for compatibility
    if (window.cachedBoard !== window.cachedBoard) {
        const currentColumn = window.cachedBoard.columns.find(col => col.id === columnId);
        if (currentColumn) {
            const currentTask = currentColumn.tasks.find(t => t.id === taskId);
            if (currentTask) {
                currentTask.title = newTitle;
                currentTask.originalTitle = cleanTitle;
            }
        }
    }

    // Send update to backend
    vscode.postMessage({
        type: 'updateBoard',
        board: window.cachedBoard
    });

    // Update button state to show unsaved changes
    updateRefreshButtonState('unsaved', 1);
}

// Disable task include mode
function disableTaskIncludeMode(taskId, columnId) {
    // Close all menus properly
    closeAllMenus();

    if (!window.cachedBoard) {
        console.error('No cached board available');
        return;
    }

    const column = window.cachedBoard.columns.find(col => col.id === columnId);
    if (!column) {
        console.error('Column not found:', columnId);
        return;
    }

    const task = column.tasks.find(t => t.id === taskId);
    if (!task) {
        console.error('Task not found:', taskId);
        return;
    }

    // Clean title to remove include syntax
    let cleanTitle = task.title || '';
    cleanTitle = cleanTitle.replace(/!!!taskinclude\([^)]+\)!!!/g, '').trim();

    // Update cached board
    task.title = cleanTitle;
    task.includeMode = false;
    task.includeFiles = undefined;
    task.originalTitle = undefined;
    task.displayTitle = undefined;

    // Also update currentBoard for compatibility
    if (window.cachedBoard !== window.cachedBoard) {
        const currentColumn = window.cachedBoard.columns.find(col => col.id === columnId);
        if (currentColumn) {
            const currentTask = currentColumn.tasks.find(t => t.id === taskId);
            if (currentTask) {
                currentTask.title = cleanTitle;
                currentTask.includeMode = false;
                delete currentTask.includeFiles;
                delete currentTask.originalTitle;
                delete currentTask.displayTitle;
            }
        }
    }

    // Send update to backend
    vscode.postMessage({
        type: 'updateBoard',
        board: window.cachedBoard
    });

    // Update button state to show unsaved changes
    updateRefreshButtonState('unsaved', 1);

    vscode.postMessage({
        type: 'showMessage',
        text: 'Task include mode disabled. Content converted to regular description.'
    });
}

// Main toggle function for task include mode
function toggleTaskIncludeMode(taskId, columnId) {
    if (!window.cachedBoard) {
        console.error('No cached board available');
        return;
    }

    const column = window.cachedBoard.columns.find(col => col.id === columnId);
    if (!column) {
        console.error('Column not found:', columnId);
        return;
    }

    const task = column.tasks.find(t => t.id === taskId);
    if (!task) {
        console.error('Task not found:', taskId);
        return;
    }

    if (task.includeMode) {
        // Disable include mode
        disableTaskIncludeMode(taskId, columnId);
    } else {
        // Enable include mode - request filename from backend
        vscode.postMessage({
            type: 'requestTaskIncludeFileName',
            taskId: taskId,
            columnId: columnId
        });
    }
}

// Task operations
/**
 * Helper function to find a task in the board, handling stale column IDs
 * Searches the expected column first, then all columns if not found
 * @param {string} taskId - Task ID to find
 * @param {string} expectedColumnId - Column ID from DOM (may be stale)
 * @returns {{task: object, column: object, columnId: string} | null}
 */
function findTaskInBoard(taskId, expectedColumnId) {
    if (!window.cachedBoard) return null;

    // Try expected column first
    let column = window.cachedBoard.columns.find(c => c.id === expectedColumnId);
    let task = column?.tasks.find(t => t.id === taskId);

    // If not found, search all columns (task may have been moved)
    if (!task) {
        for (const col of window.cachedBoard.columns) {
            task = col.tasks.find(t => t.id === taskId);
            if (task) {
                column = col;
                break;
            }
        }
    }

    return task && column ? { task, column, columnId: column.id } : null;
}

function duplicateTask(taskId, columnId) {
    // Close all menus properly
    closeAllMenus();

    // Cache-first: Only update cached board, no automatic save
    if (window.cachedBoard) {
        const found = findTaskInBoard(taskId, columnId);
        if (found) {
            const { task: originalTask, column: targetColumn, columnId: actualColumnId } = found;
            const duplicatedTask = {
                id: `temp-duplicate-${Date.now()}`,
                title: originalTask.title,
                description: originalTask.description
            };

            // Insert after the original task
            const originalIndex = targetColumn.tasks.findIndex(task => task.id === taskId);
            updateCacheForNewTask(actualColumnId, duplicatedTask, originalIndex + 1);
        }
    }

    // No VS Code message - cache-first system requires explicit save via Cmd+S
}

function insertTaskBefore(taskId, columnId) {
    // Close all menus properly
    closeAllMenus();

    // Cache-first: Only update cached board, no automatic save
    if (window.cachedBoard) {
        const found = findTaskInBoard(taskId, columnId);
        if (found) {
            const { column: targetColumn, columnId: actualColumnId } = found;
            const targetIndex = targetColumn.tasks.findIndex(task => task.id === taskId);
            if (targetIndex >= 0) {
                const newTask = {
                    id: `temp-insert-before-${Date.now()}`,
                    title: '',
                    description: ''
                };

                updateCacheForNewTask(actualColumnId, newTask, targetIndex);
            }
        }
    }

    // No VS Code message - cache-first system requires explicit save via Cmd+S
}

function insertTaskAfter(taskId, columnId) {
    // Close all menus properly
    closeAllMenus();

    // Cache-first: Only update cached board, no automatic save
    if (window.cachedBoard) {
        const found = findTaskInBoard(taskId, columnId);
        if (found) {
            const { column: targetColumn, columnId: actualColumnId } = found;
            const targetIndex = targetColumn.tasks.findIndex(task => task.id === taskId);
            if (targetIndex >= 0) {
                const newTask = {
                    id: `temp-insert-after-${Date.now()}`,
                    title: '',
                    description: ''
                };

                updateCacheForNewTask(actualColumnId, newTask, targetIndex + 1);
            }
        }
    }

    // No VS Code message - cache-first system requires explicit save via Cmd+S
}

function moveTaskToTop(taskId, columnId) {

    // NEW CACHE SYSTEM: Update cached board directly
    if (window.cachedBoard) {
        const found = findTaskInBoard(taskId, columnId);
        if (found) {
            const { column } = found;
            const taskIndex = column.tasks.findIndex(t => t.id === taskId);
            if (taskIndex > 0) {
                const task = column.tasks.splice(taskIndex, 1)[0];
                column.tasks.unshift(task);

                // Re-render UI to reflect changes
                if (typeof renderBoard === 'function') {
                    renderBoard();
                }

                markUnsavedChanges();
            }
        }
    }

    // Cache-first: No automatic save, UI updated via cache update above
    // vscode.postMessage({ type: 'moveTaskToTop', taskId, columnId });

    // Close all menus
    closeAllMenus();

}

function moveTaskUp(taskId, columnId) {

    // NEW CACHE SYSTEM: Update cached board directly
    if (window.cachedBoard) {
        const found = findTaskInBoard(taskId, columnId);
        if (found) {
            const { column } = found;
            const taskIndex = column.tasks.findIndex(t => t.id === taskId);
            if (taskIndex > 0) {
                const task = column.tasks[taskIndex];
                column.tasks[taskIndex] = column.tasks[taskIndex - 1];
                column.tasks[taskIndex - 1] = task;

                // Re-render UI to reflect changes
                if (typeof renderBoard === 'function') {
                    renderBoard();
                }

                markUnsavedChanges();
            }
        }
    }

    // Cache-first: No automatic save, UI updated via cache update above
    // vscode.postMessage({ type: 'moveTaskUp', taskId, columnId });

    // Close all menus
    closeAllMenus();

}

function moveTaskDown(taskId, columnId) {

    // NEW CACHE SYSTEM: Update cached board directly
    if (window.cachedBoard) {
        const found = findTaskInBoard(taskId, columnId);
        if (found) {
            const { column } = found;
            const taskIndex = column.tasks.findIndex(t => t.id === taskId);
            if (taskIndex >= 0 && taskIndex < column.tasks.length - 1) {
                const task = column.tasks[taskIndex];
                column.tasks[taskIndex] = column.tasks[taskIndex + 1];
                column.tasks[taskIndex + 1] = task;

                // Re-render UI to reflect changes
                if (typeof renderBoard === 'function') {
                    renderBoard();
                }

                markUnsavedChanges();
            }
        }
    }

    // Cache-first: No automatic save, UI updated via cache update above
    // vscode.postMessage({ type: 'moveTaskDown', taskId, columnId });

    // Close all menus
    closeAllMenus();

}

function moveTaskToBottom(taskId, columnId) {

    // NEW CACHE SYSTEM: Update cached board directly
    if (window.cachedBoard) {
        const found = findTaskInBoard(taskId, columnId);
        if (found) {
            const { column } = found;
            const taskIndex = column.tasks.findIndex(t => t.id === taskId);
            if (taskIndex >= 0 && taskIndex < column.tasks.length - 1) {
                const task = column.tasks.splice(taskIndex, 1)[0];
                column.tasks.push(task);

                // Re-render UI to reflect changes
                if (typeof renderBoard === 'function') {
                    renderBoard();
                }

                markUnsavedChanges();
            }
        }
    }

    // Cache-first: No automatic save, UI updated via cache update above
    // vscode.postMessage({ type: 'moveTaskToBottom', taskId, columnId });

    // Close all menus
    closeAllMenus();

}

/**
 * Moves a task to a different column
 * Purpose: Drag and drop or menu-based task relocation
 * Used by: Move submenu selections
 * @param {string} taskId - Task to move
 * @param {string} fromColumnId - Source column
 * @param {string} toColumnId - Destination column
 * Side effects: Flushes pending changes, unfolds target
 */
function moveTaskToColumn(taskId, fromColumnId, toColumnId) {
    console.log(`[moveTaskToColumn] Moving task ${taskId}`);
    console.log(`[moveTaskToColumn]   FROM column: ${fromColumnId}`);
    console.log(`[moveTaskToColumn]   TO column: ${toColumnId}`);

    // Unfold the destination column if it's collapsed BEFORE any DOM changes
    unfoldColumnIfCollapsed(toColumnId);

    // NEW CACHE SYSTEM: Update cached board directly
    if (window.cachedBoard) {
        const fromColumn = window.cachedBoard.columns.find(col => col.id === fromColumnId);
        const toColumn = window.cachedBoard.columns.find(col => col.id === toColumnId);

        console.log(`[moveTaskToColumn] Found FROM column:`, fromColumn ? fromColumn.title : 'NOT FOUND');
        console.log(`[moveTaskToColumn] Found TO column:`, toColumn ? toColumn.title : 'NOT FOUND');

        if (fromColumn && toColumn) {
            const taskIndex = fromColumn.tasks.findIndex(t => t.id === taskId);
            if (taskIndex >= 0) {
                const task = fromColumn.tasks.splice(taskIndex, 1)[0];
                toColumn.tasks.push(task);

                console.log(`[moveTaskToColumn] Task moved successfully, calling renderBoard()`);

                // Re-render UI to reflect changes
                if (typeof renderBoard === 'function') {
                    renderBoard();
                }

                markUnsavedChanges();
            }
        }
    }
    
    // Cache-first: No automatic save, UI updated via cache update above
    // vscode.postMessage({ type: 'moveTaskToColumn', taskId, fromColumnId, toColumnId });
    
    // Close all menus
    closeAllMenus();
    
}

function deleteTask(taskId, columnId) {
    // Close all menus properly
    closeAllMenus();

    // NEW CACHE SYSTEM: Remove task from cached board instead of sending to VS Code immediately
    if (window.cachedBoard) {
        // Find the task in any column (task might have been moved since the menu was generated)
        let foundColumn = null;
        let taskIndex = -1;

        for (const column of window.cachedBoard.columns) {
            taskIndex = column.tasks.findIndex(t => t.id === taskId);
            if (taskIndex >= 0) {
                foundColumn = column;
                break;
            }
        }

        if (foundColumn && taskIndex >= 0) {
            const deletedTask = foundColumn.tasks.splice(taskIndex, 1)[0];

            // Also update currentBoard for compatibility
            if (window.cachedBoard !== window.cachedBoard) {
                for (const currentColumn of window.cachedBoard.columns) {
                    const currentTaskIndex = currentColumn.tasks.findIndex(t => t.id === taskId);
                    if (currentTaskIndex >= 0) {
                        currentColumn.tasks.splice(currentTaskIndex, 1);
                        break;
                    }
                }
            }

            // Remove task from DOM immediately
            const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
            if (taskElement) {
                taskElement.remove();
            }

            // Check if column is now empty and add placeholder button
            updateColumnEmptyState(foundColumn.id);

            // Mark board as having unsaved changes
            markUnsavedChanges();

            // Send message to VS Code for undo tracking - use the actual column where task was found
            vscode.postMessage({ type: 'deleteTask', taskId, columnId: foundColumn.id });

        }
    }
}

// Helper function to update column empty state (add/remove placeholder button)
function updateColumnEmptyState(columnId) {
    const tasksContainer = document.querySelector(`#tasks-${columnId}`);
    if (!tasksContainer) { return; }

    // Count actual task elements (not placeholder buttons)
    const taskElements = tasksContainer.querySelectorAll('.task-item');
    const hasAddButton = tasksContainer.querySelector('.add-task-btn');

    if (taskElements.length === 0 && !hasAddButton) {
        // Column is empty and has no add button - add it
        const addButton = document.createElement('button');
        addButton.className = 'add-task-btn';
        addButton.setAttribute('onclick', `addTask('${columnId}')`);
        addButton.innerHTML = '\n                        + Add Task\n                    ';
        tasksContainer.appendChild(addButton);
    } else if (taskElements.length > 0 && hasAddButton) {
        // Column has tasks but still has add button - remove it
        hasAddButton.remove();
    }
}

// Make updateColumnEmptyState globally available
window.updateColumnEmptyState = updateColumnEmptyState;

// Helper function to update cache when creating tasks
function updateCacheForNewTask(columnId, newTask, insertIndex = -1) {
    if (window.cachedBoard) {
        const targetColumn = window.cachedBoard.columns.find(col => col.id === columnId);
        if (targetColumn) {
            if (insertIndex >= 0 && insertIndex <= targetColumn.tasks.length) {
                targetColumn.tasks.splice(insertIndex, 0, newTask);
            } else {
                targetColumn.tasks.push(newTask);
            }

            // Also update currentBoard to keep it in sync for tag operations
            if (window.cachedBoard && window.cachedBoard !== window.cachedBoard) {
                const currentColumn = window.cachedBoard.columns.find(col => col.id === columnId);
                if (currentColumn) {
                    if (insertIndex >= 0 && insertIndex <= currentColumn.tasks.length) {
                        currentColumn.tasks.splice(insertIndex, 0, { ...newTask });
                    } else {
                        currentColumn.tasks.push({ ...newTask });
                    }
                }
            }

            // Mark as unsaved since we added a task
            markUnsavedChanges();

            // Use incremental DOM update instead of full redraw
            if (typeof window.addSingleTaskToDOM === 'function') {
                const taskElement = window.addSingleTaskToDOM(columnId, newTask, insertIndex);

                // Focus the newly created task and start editing
                if (taskElement) {
                    setTimeout(() => {
                        scrollToElementIfNeeded(taskElement, 'task');

                        // Start editing the title
                        const titleContainer = taskElement.querySelector('.task-title-container');
                        if (titleContainer && window.editTitle) {
                            window.editTitle(titleContainer, newTask.id, columnId);
                        }
                    }, 50);
                }
            } else {
                // Fallback to full render if incremental function not available
                if (typeof renderBoard === 'function') {
                    renderBoard();
                }
            }

        }
    }
}

// Helper function to update cache when creating columns
function updateCacheForNewColumn(newColumn, insertIndex = -1, referenceColumnId = null) {
    if (window.cachedBoard) {
        let actualInsertIndex = insertIndex;

        if (referenceColumnId) {
            // Insert relative to reference column
            const referenceIndex = window.cachedBoard.columns.findIndex(col => col.id === referenceColumnId);
            if (referenceIndex >= 0) {
                actualInsertIndex = insertIndex >= 0 ? insertIndex : referenceIndex + 1;
                window.cachedBoard.columns.splice(actualInsertIndex, 0, newColumn);
            } else {
                // Fallback: add to end
                window.cachedBoard.columns.push(newColumn);
                actualInsertIndex = window.cachedBoard.columns.length - 1;
            }
        } else {
            // Simple insertion
            if (insertIndex >= 0 && insertIndex <= window.cachedBoard.columns.length) {
                window.cachedBoard.columns.splice(insertIndex, 0, newColumn);
            } else {
                window.cachedBoard.columns.push(newColumn);
                actualInsertIndex = window.cachedBoard.columns.length - 1;
            }
        }

        // Mark as unsaved
        if (typeof markUnsavedChanges === 'function') {
            markUnsavedChanges();
        }

        // Use incremental DOM update instead of full redraw
        if (typeof window.addSingleColumnToDOM === 'function') {
            const columnElement = window.addSingleColumnToDOM(newColumn, actualInsertIndex);

            // Focus the newly created column and start editing its title
            if (columnElement) {
                setTimeout(() => {
                    scrollToElementIfNeeded(columnElement, 'column');

                    // Start editing the column title
                    if (window.editColumnTitle) {
                        window.editColumnTitle(newColumn.id, columnElement);
                    }
                }, 50);
            }
        } else {
            // Fallback to full render if incremental function not available
            if (typeof renderBoard === 'function') {
                renderBoard();
            }
        }
    }
}

function addTask(columnId) {
    // Close all menus properly
    closeAllMenus();
    
    // Cache-first: Only update cached board, no automatic save
    const newTask = {
        id: `temp-menu-${Date.now()}`,
        title: '',
        description: ''
    };
    
    updateCacheForNewTask(columnId, newTask);
    
    // No VS Code message - cache-first system requires explicit save via Cmd+S
}

// Helper function to unfold a column if it's collapsed
function unfoldColumnIfCollapsed(columnId, skipUnfold = false) {
    if (skipUnfold) {
        return false; // Skip unfolding
    }
    const column = document.querySelector(`.kanban-full-height-column[data-column-id="${columnId}"]`);
    if (window.isColumnCollapsed && window.isColumnCollapsed(column)) {
        toggleColumnCollapse(columnId);
        return true; // Column was unfolded
    }
    return false; // Column was already unfolded
}

function addTaskAndUnfold(columnId) {
    unfoldColumnIfCollapsed(columnId);
    addTask(columnId);
}

function addColumn(rowNumber) {
    // Cache-first: Create new column and add to end
    const title = (rowNumber && rowNumber > 1) ? `#row${rowNumber}` : '';
    const newColumn = {
        id: `temp-column-${Date.now()}`,
        title: title,
        tasks: []
    };
    
    updateCacheForNewColumn(newColumn);
    
    // No VS Code message - cache-first system requires explicit save via Cmd+S
}

// Tag operations - IMPORTANT: Always use unique IDs, never titles!
// This system correctly uses column.id and task.id for identification
// to avoid conflicts when multiple items have the same title
/**
 * Toggles a tag on/off for a column
 * Purpose: Add or remove tags from column titles
 * Used by: Tag menu clicks for columns
 * @param {string} columnId - Column to modify
 * @param {string} tagName - Tag to toggle
 * @param {Event} event - Click event
 * Side effects: Updates pending changes, triggers visual updates
 */
function toggleColumnTag(columnId, tagName, event) {
    // Enhanced duplicate prevention with stronger key and longer timeout
    const key = `column-${columnId}-${tagName}`;
    const now = Date.now();
    if (!window._lastTagExecution) {
        window._lastTagExecution = {};
    }

    if (window._lastTagExecution[key] && now - window._lastTagExecution[key] < 500) {
        return;
    }
    window._lastTagExecution[key] = now;

    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }

    // Try to find the column in the best available board data
    let boardToUse = null;
    let column = null;

    // First try cachedBoard (most current)
    if (window.cachedBoard?.columns) {
        column = window.cachedBoard.columns.find(c => c.id === columnId);
        if (column) {
            boardToUse = window.cachedBoard;
        }
    }

    // If not found, try currentBoard
    if (!column && window.cachedBoard?.columns) {
        column = window.cachedBoard.columns.find(c => c.id === columnId);
        if (column) {
            boardToUse = window.cachedBoard;
        }
    }

    if (!column) {
        if (window.cachedBoard?.columns) {
        }
        if (window.cachedBoard?.columns) {
        }
        return;
    }


    // Also check DOM element
    const domElement = document.querySelector(`.kanban-full-height-column[data-column-id="${columnId}"]`);
    if (!domElement) {
        return;
    }

    
    const tagWithHash = `#${tagName}`;
    let title = column.title || '';
    const wasActive = new RegExp(`#${tagName}\\b`, 'gi').test(title);


    if (wasActive) {
        const beforeRemoval = title;
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
    
    // Update the board data - make sure both boards are updated
    const oldTitle = column.title;
    column.title = title;

    // Ensure both currentBoard and cachedBoard are updated if they exist and are different
    if (window.cachedBoard && window.cachedBoard !== boardToUse) {
        const currentColumn = window.cachedBoard.columns.find(col => col.id === columnId);
        if (currentColumn) {
            currentColumn.title = title;
        }
    }

    if (window.cachedBoard && window.cachedBoard !== boardToUse) {
        const cachedColumn = window.cachedBoard.columns.find(col => col.id === columnId);
        if (cachedColumn) {
            cachedColumn.title = title;
        }
    }

    // Add to pending column changes so it gets saved to the backend
    if (!window.pendingColumnChanges) {
        window.pendingColumnChanges = new Map();
    }
    window.pendingColumnChanges.set(columnId, { columnId, title });

    // Mark as unsaved since we made a change
    markUnsavedChanges();

    // Check if element is visible BEFORE any layout changes
    const rect = domElement.getBoundingClientRect();
    const isVisible = rect.left >= 0 && rect.right <= window.innerWidth;

    // Update DOM immediately using unique ID
    updateColumnDisplayImmediate(columnId, title, !wasActive, tagName);

    // Update tag button appearance immediately
    updateTagButtonAppearance(columnId, 'column', tagName, !wasActive);

    // Update tag category counts in menu
    updateTagCategoryCounts(columnId, 'column');

    // Update corner badges immediately
    updateCornerBadgesImmediate(columnId, 'column', title);

    // Only recalculate stack heights if this tag change affects visual elements (headers/footers)
    // that change the column height
    const visualTagsBefore = window.getActiveTagsInTitle ? window.getActiveTagsInTitle(oldTitle) : [];
    const visualTagsAfter = window.getActiveTagsInTitle ? window.getActiveTagsInTitle(title) : [];

    // If the number of visual tags changed, heights may have changed
    if (visualTagsBefore.length !== visualTagsAfter.length) {
        if (typeof window.applyStackedColumnStyles === 'function') {
            window.applyStackedColumnStyles();
        }
    }

    // Check if we need to scroll to element (only if it was not visible)
    if (!isVisible) {
        requestAnimationFrame(() => {
            scrollToElementIfNeeded(domElement, 'column');
        });
    }

    // NEW CACHE SYSTEM: Changes are already in cachedBoard, mark as unsaved

    // Mark board as having unsaved changes
    markUnsavedChanges();

}

// IMPORTANT: This function correctly uses unique task.id and column.id
// Never modify to use titles - this would break with duplicate titles
/**
 * Toggles a tag on/off for a task
 * Purpose: Add or remove tags from task titles  
 * Used by: Tag menu clicks for tasks
 * @param {string} taskId - Task to modify
 * @param {string} columnId - Parent column ID
 * @param {string} tagName - Tag to toggle
 * @param {Event} event - Click event
 * Side effects: Updates pending changes, triggers visual updates
 */
function toggleTaskTag(taskId, columnId, tagName, event) {

    // Enhanced duplicate prevention with stronger key and longer timeout
    const key = `task-${taskId}-${tagName}`;
    const now = Date.now();
    if (!window._lastTagExecution) {
        window._lastTagExecution = {};
    }

    if (window._lastTagExecution[key] && now - window._lastTagExecution[key] < 500) {
        return;
    }
    window._lastTagExecution[key] = now;

    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }

    // Try to find the task in the best available board data
    let boardToUse = null;
    let column = null;
    let task = null;

    // First try cachedBoard (most current)
    if (window.cachedBoard?.columns) {
        column = window.cachedBoard.columns.find(c => c.id === columnId);
        task = column?.tasks.find(t => t.id === taskId);

        // If task not found in expected column, search all columns
        if (!task) {
            for (const col of window.cachedBoard.columns) {
                const foundTask = col.tasks.find(t => t.id === taskId);
                if (foundTask) {
                    column = col;
                    task = foundTask;
                    break;
                }
            }
        }

        if (task) {
            boardToUse = window.cachedBoard;
        }
    }

    // If not found, try currentBoard
    if (!task && window.cachedBoard?.columns) {
        column = window.cachedBoard.columns.find(c => c.id === columnId);
        task = column?.tasks.find(t => t.id === taskId);

        // If task not found in expected column, search all columns
        if (!task) {
            for (const col of window.cachedBoard.columns) {
                const foundTask = col.tasks.find(t => t.id === taskId);
                if (foundTask) {
                    column = col;
                    task = foundTask;
                    break;
                }
            }
        }

        if (task) {
            boardToUse = window.cachedBoard;
        }
    }

    if (!column || !task) {
        return;
    }

    
    
    // Also check DOM element
    const domElement = document.querySelector(`[data-task-id="${taskId}"]`);
    if (!domElement) {
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

    // Update the task in the found board
    const oldTitle = task.title;
    task.title = title;

    // Ensure both currentBoard and cachedBoard are updated if they exist and are different
    if (window.cachedBoard && window.cachedBoard !== boardToUse) {
        const currentColumn = window.cachedBoard.columns.find(col => col.id === column.id);
        if (currentColumn) {
            const currentTask = currentColumn.tasks.find(t => t.id === taskId);
            if (currentTask) {
                currentTask.title = title;
            }
        }
    }

    if (window.cachedBoard && window.cachedBoard !== boardToUse) {
        const cachedColumn = window.cachedBoard.columns.find(col => col.id === column.id);
        if (cachedColumn) {
            const cachedTask = cachedColumn.tasks.find(t => t.id === taskId);
            if (cachedTask) {
                cachedTask.title = title;
            }
        }
    }
    
    // Mark as unsaved since we made a change
    markUnsavedChanges();

    // Check if element is visible BEFORE any layout changes
    const rect = domElement.getBoundingClientRect();
    const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;

    // Update DOM immediately using unique ID
    updateTaskDisplayImmediate(taskId, title, !wasActive, tagName);

    // Update tag button appearance immediately
    updateTagButtonAppearance(taskId, 'task', tagName, !wasActive);

    // Update tag category counts in menu
    updateTagCategoryCounts(taskId, 'task', columnId);

    // Update corner badges immediately
    updateCornerBadgesImmediate(taskId, 'task', title);

    // Only recalculate stack heights if this tag change affects visual elements (headers/footers)
    // that change the task height
    const visualTagsBefore = window.getActiveTagsInTitle ? window.getActiveTagsInTitle(oldTitle) : [];
    const visualTagsAfter = window.getActiveTagsInTitle ? window.getActiveTagsInTitle(title) : [];

    // If the number of visual tags changed, heights may have changed
    if (visualTagsBefore.length !== visualTagsAfter.length) {
        if (typeof window.applyStackedColumnStyles === 'function') {
            window.applyStackedColumnStyles();
        }
    }

    // Check if we need to scroll to element (only if it was not visible)
    if (!isVisible) {
        requestAnimationFrame(() => {
            scrollToElementIfNeeded(domElement, 'task');
        });
    }

    // NEW CACHE SYSTEM: Changes are already in cachedBoard, mark as unsaved

    // Mark board as having unsaved changes
    markUnsavedChanges();

}

// Enhanced DOM update functions using unique IDs
// CRITICAL: Always use data-column-id and data-task-id selectors to avoid title conflicts
/**
 * Immediately updates column visual state in DOM
 * Purpose: Real-time visual feedback before save
 * Used by: Tag toggle operations
 * @param {string} columnId - Column to update
 * @param {string} newTitle - New title with tags
 * @param {boolean} isActive - Whether tag is active
 * @param {string} tagName - Tag being modified
 */
function updateColumnDisplayImmediate(columnId, newTitle, isActive, tagName) {
    // Use unique ID to find column element - NEVER use titles for selection
    const columnElement = document.querySelector(`.kanban-full-height-column[data-column-id="${columnId}"]`);
    if (!columnElement) {
        return;
    }
    
    // Update title display using shared function
    const titleElement = columnElement.querySelector('.column-title-text');
    if (titleElement && window.cachedBoard) {
        const columnData = window.cachedBoard.columns.find(c => c.id === columnId);
        if (columnData) {
            const renderedTitle = window.tagUtils ? window.tagUtils.getColumnDisplayTitle(columnData, window.filterTagsFromText) : (columnData.title || '');
            titleElement.innerHTML = renderedTitle;
        }
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
    
    // Update header bars immediately
    if (window.updateVisualTagState && typeof window.updateVisualTagState === 'function') {
        const isCollapsed = columnElement.classList.contains('collapsed');
        window.updateVisualTagState(columnElement, allTags, 'column', isCollapsed);
    }
    
    // Update corner badges immediately
    updateCornerBadgesImmediate(columnId, 'column', newTitle);
    
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
    if (window.ensureTagStyleExists) {
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
    
}

// CRITICAL: Always use unique task IDs to prevent targeting wrong tasks with same titles
function updateTaskDisplayImmediate(taskId, newTitle, isActive, tagName) {
    // Use unique ID to find task element - NEVER use titles for selection
    const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
    if (!taskElement) {
        return;
    }
    
    // Update title display
    const titleElement = taskElement.querySelector('.task-title-display');
    if (titleElement) {
        const renderedTitle = newTitle ? 
            (window.renderMarkdown ? window.renderMarkdown(newTitle) : newTitle) :
            '';
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
    
    // Update header bars immediately
    if (window.updateVisualTagState && typeof window.updateVisualTagState === 'function') {
        const isCollapsed = taskElement.classList.contains('collapsed');
        window.updateVisualTagState(taskElement, allTags, 'task', isCollapsed);
    }
    
    // Update corner badges immediately
    updateCornerBadgesImmediate(taskId, 'task', newTitle);
    
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
    if (window.ensureTagStyleExists) {
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

/**
 * Marks the cached board as having unsaved changes
 * Purpose: Track when user makes changes that need saving
 * Used by: All operations that modify the board
 * Side effects: Updates unsaved flag and UI state
 */
function markUnsavedChanges() {
    window.hasUnsavedChanges = true;
    updateRefreshButtonState('unsaved', 1);
    
    // Always notify backend about unsaved changes state AND send the current cached board data
    if (typeof vscode !== 'undefined') {
        const boardToSend = window.cachedBoard || window.cachedBoard;
        
        vscode.postMessage({
            type: 'markUnsavedChanges',
            hasUnsavedChanges: true,
            cachedBoard: boardToSend // Send the current board data
        });
    }
}

/**
 * Marks changes as saved and notifies backend
 * Purpose: Track when changes have been saved successfully
 * Used by: Save operations and discard operations
 * Side effects: Clears unsaved flag and updates UI state
 */
function markSavedChanges() {
    window.hasUnsavedChanges = false;
    updateRefreshButtonState('default');
    
    // Always notify backend about saved state immediately
    if (typeof vscode !== 'undefined') {
        vscode.postMessage({
            type: 'markUnsavedChanges',
            hasUnsavedChanges: false
        });
    }
}

/**
 * Checks if there are any unsaved changes in the cached board
 * Purpose: Determine if save confirmation dialog should be shown
 * Used by: Close/exit handlers
 * Returns: true if there are unsaved changes
 */
function hasUnsavedChanges() {
    return window.hasUnsavedChanges === true;
}

/**
 * Compares two board states to find what has changed
 * Purpose: Detect specific changes to send to VS Code
 * Used by: Save operation to minimize messages sent
 * Returns: Object with arrays of changes by type
 */
function compareBoards(savedBoard, cachedBoard) {
    const changes = {
        columnTitleChanges: [],
        taskChanges: [],
        taskMoves: [],
        taskDeletions: [],
        columnOrderChanged: false
    };
    
    // Check if column order changed
    const savedOrder = savedBoard.columns.map(col => col.id).join(',');
    const cachedOrder = cachedBoard.columns.map(col => col.id).join(',');
    if (savedOrder !== cachedOrder) {
        changes.columnOrderChanged = true;
    }
    
    // Find deleted tasks
    savedBoard.columns.forEach(savedCol => {
        savedCol.tasks.forEach(savedTask => {
            let foundInCached = false;
            for (const cachedCol of cachedBoard.columns) {
                if (cachedCol.tasks.find(t => t.id === savedTask.id)) {
                    foundInCached = true;
                    break;
                }
            }
            if (!foundInCached) {
                changes.taskDeletions.push({
                    taskId: savedTask.id,
                    columnId: savedCol.id
                });
            }
        });
    });
    
    // Compare each column
    cachedBoard.columns.forEach(cachedCol => {
        const savedCol = savedBoard.columns.find(col => col.id === cachedCol.id);
        if (!savedCol) {return;} // New column (shouldn't happen in our cache system)
        
        // Check column title changes
        if (savedCol.title !== cachedCol.title) {
            changes.columnTitleChanges.push({
                columnId: cachedCol.id,
                oldTitle: savedCol.title,
                newTitle: cachedCol.title
            });
        }
        
        // Compare each task in this column
        cachedCol.tasks.forEach((cachedTask, cachedIndex) => {
            // Find task in saved board (it might be in a different column)
            let savedTask = null;
            let savedTaskColumn = null;
            let savedTaskIndex = -1;
            
            for (const savedColumn of savedBoard.columns) {
                const foundIndex = savedColumn.tasks.findIndex(t => t.id === cachedTask.id);
                if (foundIndex >= 0) {
                    savedTask = savedColumn.tasks[foundIndex];
                    savedTaskColumn = savedColumn.id;
                    savedTaskIndex = foundIndex;
                    break;
                }
            }
            
            if (!savedTask) {return;} // New task (shouldn't happen in our cache system)
            
            // Check if task moved between columns or changed position
            if (savedTaskColumn !== cachedCol.id || savedTaskIndex !== cachedIndex) {
                changes.taskMoves.push({
                    taskId: cachedTask.id,
                    fromColumn: savedTaskColumn,
                    toColumn: cachedCol.id,
                    newIndex: cachedIndex
                });
            }
            
            // Check task content changes
            if (savedTask.title !== cachedTask.title || savedTask.description !== cachedTask.description) {
                changes.taskChanges.push({
                    taskId: cachedTask.id,
                    columnId: cachedCol.id, // Current column
                    taskData: {
                        title: cachedTask.title,
                        description: cachedTask.description
                    }
                });
            }
        });
    });
    
    return changes;
}

/**
 * NEW CLEAN SAVE SYSTEM: Save complete cached board to markdown file
 * Purpose: Save all changes (tags, moves, edits) from cache to file
 * Used by: Manual save (Cmd+S) only
 * Side effects: Sends board to VS Code for file write
 * Note: Single source of truth - no more pending changes mess
 */
function saveCachedBoard() {

    if (!window.cachedBoard) {
        return;
    }

    // Capture any in-progress edits and include them in the save
    let boardToSave = window.cachedBoard;
    let hadInProgressEdits = false;
    if (window.taskEditor) {
        const editState = window.taskEditor.getCurrentEditState();
        if (editState) {
            boardToSave = window.taskEditor.applyCurrentEditToBoard(window.cachedBoard);
            hadInProgressEdits = true;
        }
    }

    // Send the complete board state to VS Code using a simple message
    // This avoids complex sequential processing that might cause issues
    vscode.postMessage({
        type: 'saveBoardState',
        board: boardToSave
    });
    
    
    // Mark as saved and notify backend
    if (boardToSave) {
        // Update our cached state to include the in-progress edits
        window.cachedBoard = JSON.parse(JSON.stringify(boardToSave));
        window.savedBoardState = JSON.parse(JSON.stringify(boardToSave));

        // Update editor state if we had in-progress edits
        if (hadInProgressEdits && window.taskEditor) {
            window.taskEditor.handlePostSaveUpdate();
        }
    }
    markSavedChanges();
    
    // Update UI to show saved state
    updateRefreshButtonState('saved');
    
    // Clear any old pending changes (obsolete system cleanup)
    if (window.pendingColumnChanges) {window.pendingColumnChanges.clear();}
    if (window.pendingTaskChanges) {window.pendingTaskChanges.clear();}
    
}

// Legacy function - redirect to new system
function flushPendingTagChanges() {
    saveCachedBoard();
}

// Retry function for failed saves
function retryLastFlushedChanges() {
    if (!window._lastFlushedChanges) {
        return false;
    }
    
    const { columns, tasks, timestamp } = window._lastFlushedChanges;
    const timeSinceFlush = Date.now() - timestamp;
    
    // Don't retry if too much time has passed (5 minutes)
    if (timeSinceFlush > 300000) {
        window._lastFlushedChanges = null;
        return false;
    }
    
    
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

/**
 * Applies pending changes locally without saving to backend
 * Purpose: Update local board state before drag operations
 * Used by: Drag and drop operations that need consistent state
 * Side effects: Updates currentBoard data, keeps pending changes intact
 * Note: Does not send messages to VS Code or clear pending changes
 */
function applyPendingChangesLocally() {
    
    if (!window.cachedBoard) {
        return;
    }
    
    let changesApplied = 0;
    
    // Apply column changes locally
    if (window.pendingColumnChanges && window.pendingColumnChanges.size > 0) {
        window.pendingColumnChanges.forEach(({ title, columnId }) => {
            const column = window.cachedBoard.columns.find(col => col.id === columnId);
            if (column && column.title !== title) {
                column.title = title;
                changesApplied++;
            }
        });
    }
    
    // Apply task changes locally
    if (window.pendingTaskChanges && window.pendingTaskChanges.size > 0) {
        window.pendingTaskChanges.forEach(({ taskId, columnId, taskData }) => {
            // Search for task in ALL columns, not just the stored columnId
            // This is critical for drag operations where task moves between columns
            let task = null;
            let actualColumn = null;
            
            for (const column of window.cachedBoard.columns) {
                task = column.tasks.find(t => t.id === taskId);
                if (task) {
                    actualColumn = column;
                    break;
                }
            }
            
            if (task && actualColumn) {
                if (taskData.title !== undefined && task.title !== taskData.title) {
                    task.title = taskData.title;
                    changesApplied++;
                }
                if (taskData.description !== undefined && task.description !== taskData.description) {
                    task.description = taskData.description;
                    changesApplied++;
                }
            }
        });
    }
    
    return changesApplied;
}

// Function to handle save errors from the backend
function handleSaveError(errorMessage) {
    console.error('❌ Save error from backend:', errorMessage);
    
    // Update UI to show error state
    updateRefreshButtonState('error');
    
    // Show user-friendly error message
    if (errorMessage.includes('workspace edit')) {
        // Attempt to retry after a delay
        setTimeout(() => {
            if (retryLastFlushedChanges()) {
            }
        }, 2000);
    }
}

// Modal functions - delegate to centralized modalUtils
function showInputModal(title, message, placeholder, onConfirm) {
    modalUtils.showInputModal(title, message, placeholder, onConfirm);
}

function closeInputModal() {
    modalUtils.closeInputModal();
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
    // First flush any pending tag changes immediately
    flushPendingTagChanges();
    
    // Send all pending column changes
    if (window.pendingColumnChanges && window.pendingColumnChanges.size > 0) {
        window.pendingColumnChanges.forEach((change) => {
            vscode.postMessage({
                type: 'editColumnTitle',
                columnId: change.columnId,
                title: change.title
            });
        });
        window.pendingColumnChanges.clear();
    } else {
    }
    
    // Send all pending task changes
    if (window.pendingTaskChanges && window.pendingTaskChanges.size > 0) {
        window.pendingTaskChanges.forEach((change) => {
            vscode.postMessage({
                type: 'editTask',
                taskId: change.taskId,
                columnId: change.columnId,
                taskData: change.taskData
            });
        });
        window.pendingTaskChanges.clear();
    } else {
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
/**
 * Updates the refresh button to show save state
 * Purpose: Visual feedback for pending/saved changes
 * Used by: After any change, after saves
 * @param {string} state - 'pending', 'saved', 'error', etc
 * @param {number} count - Number of pending changes
 */
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
            refreshBtn.title = `${count} changes pending - press Cmd+S (or Ctrl+S) to save`;
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
        case 'unsaved':
            refreshBtn.classList.remove('saved');
            refreshBtn.classList.add('pending');
            refreshIcon.textContent = '!';
            refreshText.textContent = 'Unsaved';
            refreshBtn.title = 'Changes have been made - click to refresh and save all changes';
            break;
        case 'error':
            refreshBtn.classList.remove('pending', 'saved');
            refreshBtn.classList.add('error');
            refreshIcon.textContent = '❌';
            refreshText.textContent = 'Error';
            refreshBtn.title = 'Save failed - click to try again';
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
    
    // Find the tag button using the same ID pattern as in generateGroupTagItems
    const buttonId = `tag-chip-${type}-${id}-${tagName}`.replace(/[^a-zA-Z0-9-]/g, '-');
    const button = document.getElementById(buttonId);
    
    if (!button) {
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
        if (bgDark && typeof colorUtils !== 'undefined') {
            const editorBg = getComputedStyle(document.documentElement).getPropertyValue('--vscode-editor-background') || '#ffffff';
            // Use a lighter interpolation for the button background when active
            bgColor = colorUtils.interpolateColor(editorBg, bgDark, isActive ? 0.25 : 0.1);
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
    
}

// Update corner badges immediately for an element
function updateCornerBadgesImmediate(elementId, elementType, newTitle) {

    // Find the element
    const selector = elementType === 'column' ? `[data-column-id="${elementId}"]` : `[data-task-id="${elementId}"]`;
    const element = document.querySelector(selector);
    if (!element) {
        return;
    }

    // Get all active tags from the new title
    const activeTags = getActiveTagsInTitle(newTitle);


    // Update data-all-tags attribute
    if (activeTags.length > 0) {
        element.setAttribute('data-all-tags', activeTags.join(' '));
    } else {
        element.removeAttribute('data-all-tags');
    }

    // Find existing corner badges container or create one
    // For columns, append to column-header; for tasks, append to element
    const targetContainer = elementType === 'column' ? element.querySelector('.column-header') || element : element;
    let badgesContainer = targetContainer.querySelector('.corner-badges-container');
    if (!badgesContainer) {
        badgesContainer = document.createElement('div');
        badgesContainer.className = 'corner-badges-container';
        badgesContainer.style.cssText = 'position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none; z-index: 9;';
        targetContainer.appendChild(badgesContainer);
        // Ensure parent has relative positioning
        // if (!element.style.position || element.style.position === 'static') {
        //     element.style.position = 'relative';
        // }
    }

    // Generate new badges HTML
    let newBadgesHtml = '';
    if (window.tagColors && activeTags.length > 0) {
        const positions = {
            'top-left': [],
            'top-right': [],
            'bottom-left': [],
            'bottom-right': []
        };

        // Collect badges by position
        activeTags.forEach(tag => {
            const config = getTagConfig(tag);
            if (config && config.cornerBadge) {
                const position = config.cornerBadge.position || 'top-right';
                positions[position].push({
                    tag: tag,
                    badge: config.cornerBadge
                });
            }
        });

        // Generate HTML for each position with proper vertical stacking
        Object.entries(positions).forEach(([position, badgesAtPosition]) => {
            badgesAtPosition.forEach((item, index) => {
                const badge = item.badge;
                const offsetMultiplier = 24; // Space between stacked badges
                let positionStyle = '';

                switch (position) {
                    case 'top-left':
                        positionStyle = `top: ${10 + (index * offsetMultiplier)}px; left: -8px;`;
                        break;
                    case 'top-right':
                        positionStyle = `top: ${10 + (index * offsetMultiplier)}px; right: -8px;`;
                        break;
                    case 'bottom-left':
                        positionStyle = `bottom: ${-8 + (index * offsetMultiplier)}px; left: -8px;`;
                        break;
                    case 'bottom-right':
                        positionStyle = `bottom: ${-8 + (index * offsetMultiplier)}px; right: -8px;`;
                        break;
                }

                const badgeContent = badge.image ? '' : (badge.label || '');
                newBadgesHtml += `<div class="corner-badge corner-badge-${item.tag}" style="${positionStyle}" data-badge-position="${position}" data-badge-index="${index}">${badgeContent}</div>`;
            });
        });
    }

    // Clear and update badges
    badgesContainer.innerHTML = newBadgesHtml;

    // If no badges, remove container to prevent empty space
    if (!newBadgesHtml || newBadgesHtml.trim() === '') {
        badgesContainer.remove();
    }

}

// Update tag category counts in the open dropdown menu
function updateTagCategoryCounts(id, type, columnId = null) {

    // Get current title to check which tags are active
    const currentBoard = window.cachedBoard;

    let currentTitle = '';
    if (type === 'column') {
        const column = currentBoard?.columns?.find(c => c.id === id);
        currentTitle = column?.title || '';
    } else if (type === 'task' && columnId) {
        const column = currentBoard?.columns?.find(c => c.id === columnId);
        const task = column?.tasks?.find(t => t.id === id);
        currentTitle = task?.title || '';
    }

    // Get active tags
    const activeTags = getActiveTagsInTitle(currentTitle);
    
    // Find the active dropdown menu that contains category items for this element
    // First try to find it in the menu, then check if it's been moved to body
    const activeMenu = document.querySelector('.donut-menu.active');
    let activeDropdown = activeMenu?.querySelector('.donut-menu-dropdown');
    
    if (!activeDropdown) {
        // Look for moved dropdowns in body that belong to the active menu
        const movedDropdowns = document.body.querySelectorAll('.donut-menu-dropdown.moved-to-body');
        activeDropdown = Array.from(movedDropdowns).find(d => d._originalParent === activeMenu);
    }
    
    if (!activeDropdown) {
        return;
    }
    
    // Update configured tag group counts
    const tagConfig = window.tagColors || {};
    Object.keys(tagConfig).forEach(groupKey => {
        const groupValue = tagConfig[groupKey];
        
        if (groupValue && typeof groupValue === 'object') {
            let groupTags = [];

            // Check if this is a direct tag configuration or a group (check ALL styling properties)
            const isDirectTag = groupValue.light || groupValue.dark || groupValue.headerBar ||
                               groupValue.border || groupValue.footerBar || groupValue.cornerBadge;

            if (isDirectTag) {
                groupTags = [groupKey];
            } else {
                Object.keys(groupValue).forEach(tagKey => {
                    const tagValue = groupValue[tagKey];
                    const hasTagProperties = tagValue && typeof tagValue === 'object' &&
                                            (tagValue.light || tagValue.dark || tagValue.headerBar ||
                                             tagValue.border || tagValue.footerBar || tagValue.cornerBadge);
                    if (hasTagProperties) {
                        groupTags.push(tagKey);
                    }
                });
            }
            
            if (groupTags.length > 0) {
                // Find the menu item for this group
                const menuItem = activeDropdown.querySelector(`[data-group="${groupKey}"]`);
                if (menuItem) {
                    // Count active tags in this group
                    const activeCount = groupTags.filter(tag => 
                        activeTags.includes(tag.toLowerCase())
                    ).length;
                    
                    // Update or create count badge
                    let countBadge = menuItem.querySelector('span:last-child');
                    if (activeCount > 0) {
                        if (countBadge && countBadge.style.opacity) {
                            // Update existing badge
                            countBadge.textContent = activeCount;
                        } else {
                            // Create new badge
                            const badge = document.createElement('span');
                            badge.style.cssText = 'opacity: 0.7; margin-left: auto; padding-left: 10px;';
                            badge.textContent = activeCount;
                            menuItem.appendChild(badge);
                        }
                    } else {
                        // Remove badge if count is 0
                        if (countBadge && countBadge.style.opacity) {
                            countBadge.remove();
                        }
                    }
                }
            }
        }
    });
    
    // Update custom tag group count
    const customMenuItem = activeDropdown.querySelector('[data-group="custom"]');
    if (customMenuItem) {
        const userAddedTags = getUserAddedTags();
        const activeCustomCount = userAddedTags.filter(tag => 
            activeTags.includes(tag.toLowerCase())
        ).length;
        
        let customCountBadge = customMenuItem.querySelector('span:last-child');
        if (activeCustomCount > 0) {
            if (customCountBadge && customCountBadge.style.opacity) {
                customCountBadge.textContent = activeCustomCount;
            } else {
                const badge = document.createElement('span');
                badge.style.cssText = 'opacity: 0.7; margin-left: auto; padding-left: 10px;';
                badge.textContent = activeCustomCount;
                customMenuItem.appendChild(badge);
            }
        } else {
            if (customCountBadge && customCountBadge.style.opacity) {
                customCountBadge.remove();
            }
        }
    }
    
    // Show/hide "Remove all tags" option - ensure only one exists
    const existingRemoveAllButtons = activeDropdown.querySelectorAll('[data-action="remove-all-tags"]');

    if (activeTags.length > 0) {
        // Remove any existing "remove all tags" buttons first to prevent duplicates
        existingRemoveAllButtons.forEach(button => {
            const divider = button.previousElementSibling;
            if (divider && divider.classList.contains('donut-menu-divider')) {
                divider.remove();
            }
            button.remove();
        });

        // Add single "Remove all tags" option before the last item (usually Delete)
        const button = document.createElement('button');
        button.className = 'donut-menu-item';
        button.setAttribute('data-action', 'remove-all-tags'); // Add identifier for reliable detection
        button.onclick = () => removeAllTags(id, type, columnId);
        button.textContent = 'Remove all tags';

        // Find the last menu item (usually "Delete card" or "Delete list")
        const lastMenuItem = activeDropdown.querySelector('.donut-menu-item.danger:last-of-type');

        if (lastMenuItem) {
            // Check if there's already a divider before the delete button
            const existingDivider = lastMenuItem.previousElementSibling;
            const hasExistingDivider = existingDivider && existingDivider.classList.contains('donut-menu-divider');

            // Insert the button before the delete button
            activeDropdown.insertBefore(button, lastMenuItem);

            // Add a divider after the "Remove all tags" button (before delete) if none exists
            if (!hasExistingDivider) {
                const dividerAfter = document.createElement('div');
                dividerAfter.className = 'donut-menu-divider';
                activeDropdown.insertBefore(dividerAfter, lastMenuItem);
            }
        } else {
            // Fallback: add at the end if no danger button found
            const divider = document.createElement('div');
            divider.className = 'donut-menu-divider';
            activeDropdown.appendChild(divider);
            activeDropdown.appendChild(button);
        }
    } else {
        // Remove all "Remove all tags" options if no active tags
        existingRemoveAllButtons.forEach(button => {
            const divider = button.previousElementSibling;
            if (divider && divider.classList.contains('donut-menu-divider')) {
                divider.remove();
            }
            button.remove();
        });
    }
    
}

// Make functions globally available
window.toggleDonutMenu = toggleDonutMenu;
window.toggleFileBarMenu = toggleFileBarMenu;
window.closeAllMenus = closeAllMenus;
window.handleColumnTagClick = (columnId, tagName, event) => {
    // CRITICAL: Clear any pending hover timeouts to prevent menu from closing
    // When you click a tag, the menu should stay open
    if (window.menuManager && typeof window.menuManager.clearTimeout === 'function') {
        window.menuManager.clearTimeout();
    }

    // Set dropdown state to prevent the hover timeout from closing the menu
    window._inDropdown = true;

    return toggleColumnTag(columnId, tagName, event);
};
window.handleTaskTagClick = (taskId, columnId, tagName, event) => {
    // CRITICAL: Clear any pending hover timeouts to prevent menu from closing
    // When you click a tag, the menu should stay open
    if (window.menuManager && typeof window.menuManager.clearTimeout === 'function') {
        window.menuManager.clearTimeout();
    }

    // Set dropdown state to prevent the hover timeout from closing the menu
    window._inDropdown = true;

    return toggleTaskTag(taskId, columnId, tagName, event);
};
window.updateTagChipStyle = updateTagChipStyle;
window.updateTagButtonAppearance = updateTagButtonAppearance;
// NEW CACHE SYSTEM - Single save function
window.saveCachedBoard = saveCachedBoard;
window.markUnsavedChanges = markUnsavedChanges;
window.hasUnsavedChanges = hasUnsavedChanges;
window.flushPendingTagChanges = flushPendingTagChanges; // Legacy redirect
window.updateRefreshButtonState = updateRefreshButtonState;
window.handleSaveError = handleSaveError;

// Legacy/compatibility functions - marked for removal
window.applyPendingChangesLocally = applyPendingChangesLocally;
// Update visual tag state - handles borders and other tag-based styling
function updateVisualTagState(element, allTags, elementType, isCollapsed) {
    
    // Update primary tag attribute (for primary styling like borders)
    const primaryTag = allTags.length > 0 ? allTags[0] : null;
    const tagAttribute = elementType === 'column' ? 'data-column-tag' : 'data-task-tag';
    
    if (primaryTag) {
        element.setAttribute(tagAttribute, primaryTag);
        
        // Ensure style exists for the primary tag
        if (window.ensureTagStyleExists) {
            window.ensureTagStyleExists(primaryTag);
        }
    } else {
        element.removeAttribute(tagAttribute);
    }
    
    // Update all-tags attribute (for multi-tag styling)
    if (allTags.length > 0) {
        element.setAttribute('data-all-tags', allTags.join(' '));
        
        // Ensure styles exist for all tags
        if (window.ensureTagStyleExists) {
            allTags.forEach(tag => {
                window.ensureTagStyleExists(tag);
            });
        }
    } else {
        element.removeAttribute('data-all-tags');
    }
    
    // Update all visual tag elements immediately (headers, footers, borders, badges)
    updateAllVisualTagElements(element, allTags, elementType);
    
    // Force a style recalculation to ensure CSS changes are applied immediately
    element.offsetHeight; // Trigger reflow
    
}

// Comprehensive function to update ALL visual tag elements immediately
function updateAllVisualTagElements(element, allTags, elementType) {
    
    // 1. CLEAN UP - Remove visual elements only from column-title and column-footer areas
    if (elementType === 'column') {
        // For columns: clean up only within column-header and column-footer (never column-inner)

        const columnHeader = element.querySelector('.column-header');
        if (columnHeader) {
            // Remove all visual tag elements from column-header (including corner badges)
            columnHeader.querySelectorAll('.header-bar, .header-bars-container, .corner-badges-container').forEach(el => el.remove());
        }

        const columnTitle = element.querySelector('.column-title');
        if (columnTitle) {
            // Column title no longer contains corner badges (moved to column-header)
            // Keep this selector for backward compatibility if needed
        }

        const columnFooter = element.querySelector('.column-footer');
        if (columnFooter) {
            // Remove all visual tag elements from column-footer
            columnFooter.querySelectorAll('.footer-bar, .footer-bars-container').forEach(el => el.remove());
        }

        // For collapsed state: remove direct children that are visual elements
        Array.from(element.children).forEach(child => {
            if (child.classList.contains('header-bar') ||
                child.classList.contains('footer-bar') ||
                child.classList.contains('header-bars-container') ||
                child.classList.contains('footer-bars-container') ||
                child.classList.contains('corner-badges-container')) {
                child.remove();
            }
        });
    } else {
        // For tasks, safe to remove all visual elements directly
        element.querySelectorAll('.header-bar, .footer-bar, .header-bars-container, .footer-bars-container, .corner-badges-container').forEach(el => el.remove());
    }
    element.classList.remove('has-header-bar', 'has-footer-bar', 'has-header-label', 'has-footer-label');
    
    if (allTags.length === 0) {
        return;
    }
    
    // 2. ENSURE STYLES - Make sure CSS exists for all tags
    allTags.forEach(tag => {
        if (window.ensureTagStyleExists) {
            window.ensureTagStyleExists(tag);
        }
    });
    
    // 3. CORNER BADGES - Update badges immediately
    let badgesContainer = element.querySelector('.corner-badges-container');
    if (!badgesContainer && window.getTagConfig) {
        // Generate badges HTML inline
        let badgesHtml = '';
        if (window.tagColors && allTags.length > 0) {
            const positions = {
                'top-left': [],
                'top-right': [],
                'bottom-left': [],
                'bottom-right': []
            };

            // Collect badges by position
            allTags.forEach(tag => {
                const config = window.getTagConfig(tag);
                if (config && config.cornerBadge) {
                    const position = config.cornerBadge.position || 'top-right';
                    positions[position].push({
                        tag: tag,
                        badge: config.cornerBadge
                    });
                }
            });

            // Generate HTML for each position with proper vertical stacking
            Object.entries(positions).forEach(([position, badgesAtPosition]) => {
                badgesAtPosition.forEach((item, index) => {
                    const badge = item.badge;
                    const offsetMultiplier = 24; // Space between stacked badges
                    let positionStyle = '';

                    switch (position) {
                        case 'top-left':
                            positionStyle = `top: ${10 + (index * offsetMultiplier)}px; left: -8px;`;
                            break;
                        case 'top-right':
                            positionStyle = `top: ${10 + (index * offsetMultiplier)}px; right: -8px;`;
                            break;
                        case 'bottom-left':
                            positionStyle = `bottom: ${-8 + (index * offsetMultiplier)}px; left: -8px;`;
                            break;
                        case 'bottom-right':
                            positionStyle = `bottom: ${-8 + (index * offsetMultiplier)}px; right: -8px;`;
                            break;
                    }

                    const badgeContent = badge.image ? '' : (badge.label || '');
                    badgesHtml += `<div class="corner-badge corner-badge-${item.tag}" style="${positionStyle}" data-badge-position="${position}" data-badge-index="${index}">${badgeContent}</div>`;
                });
            });
        }

        if (badgesHtml && badgesHtml.trim() !== '') {
            badgesContainer = document.createElement('div');
            badgesContainer.className = 'corner-badges-container';
            badgesContainer.style.cssText = 'position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none; z-index: 10;';
            badgesContainer.innerHTML = badgesHtml;
            // For columns, append to column-title; for tasks, append to element
            const targetContainer = elementType === 'column' ? element.querySelector('.column-title') || element : element;
            targetContainer.appendChild(badgesContainer);
        }
    }
    
    // 4. HEADER BARS - Create header bars only for title tags (not description tags)
    const headerBars = [];
    let hasHeaderLabel = false;

    // Filter out tags that are only in description for task elements
    let tagsForCardStyling = allTags;
    if (elementType === 'task') {
        // For tasks, check if tags exist in description and exclude them
        const taskDescDisplay = element.querySelector('.task-description-display');
        if (taskDescDisplay) {
            const descriptionTags = new Set();
            // Find all tag spans in the description
            taskDescDisplay.querySelectorAll('.kanban-tag').forEach(tagSpan => {
                const tagName = tagSpan.getAttribute('data-tag');
                if (tagName) {
                    descriptionTags.add(tagName);
                }
            });

            // Only use tags that are NOT in description for card-level styling
            tagsForCardStyling = allTags.filter(tag => !descriptionTags.has(tag));
        }
    }

    tagsForCardStyling.forEach(tag => {
        if (window.getTagConfig) {
            const config = window.getTagConfig(tag);
            if (config && config.headerBar) {
                const headerBar = document.createElement('div');
                headerBar.className = `header-bar header-bar-${tag.toLowerCase()}`;
                headerBars.push(headerBar);
                if (config.headerBar.label) {hasHeaderLabel = true;}
            }
        }
    });

    // Always try to add header-bars-container to column-header (regardless of collapsed state)
    const columnHeader = element.querySelector('.column-header');
    if (columnHeader && headerBars.length > 0) {
        const headerContainer = document.createElement('div');
        headerContainer.className = 'header-bars-container';
        headerBars.forEach(bar => headerContainer.appendChild(bar));
        // Header container should be first child, so insert at the beginning
        columnHeader.insertBefore(headerContainer, columnHeader.firstChild);
    } else if (headerBars.length > 0) {
        // Fallback: add directly to element if no column-header found
        const headerContainer = document.createElement('div');
        headerContainer.className = 'header-bars-container';
        headerBars.forEach(bar => headerContainer.appendChild(bar));
        element.appendChild(headerContainer);
    }

    // Set classes only if there are actual header bars
    if (headerBars.length > 0) {
        element.classList.add('has-header-bar');
        // if (hasHeaderLabel) element.classList.add('has-header-label');
    }
    
    // 5. FOOTER BARS - Create footer bars only for title tags (not description tags)
    const footerBars = [];
    let hasFooterLabel = false;
    // Use the same filtered tags as for header bars
    tagsForCardStyling.forEach(tag => {
        if (window.getTagConfig) {
            const config = window.getTagConfig(tag);
            if (config && config.footerBar) {
                const footerBar = document.createElement('div');
                footerBar.className = `footer-bar footer-bar-${tag.toLowerCase()}`;
                footerBars.push(footerBar);
                if (config.footerBar.label) {hasFooterLabel = true;}
            }
        }
    });
    
    if (footerBars.length > 0) {
        // Always try to add footer-bars-container to column-footer (regardless of collapsed state)
        const columnFooter = element.querySelector('.column-footer');
        if (columnFooter) {
            const footerContainer = document.createElement('div');
            footerContainer.className = 'footer-bars-container';
            footerBars.forEach(bar => footerContainer.appendChild(bar));
            columnFooter.appendChild(footerContainer);
        } else {
            // Fallback: add directly to element if no column-footer found
            const footerContainer = document.createElement('div');
            footerContainer.className = 'footer-bars-container';
            footerBars.forEach(bar => footerContainer.appendChild(bar));
            element.appendChild(footerContainer);
        }
        element.classList.add('has-footer-bar');
        if (hasFooterLabel) {element.classList.add('has-footer-label');}
    }
    
}

window.updateTagCategoryCounts = updateTagCategoryCounts;
window.unfoldColumnIfCollapsed = unfoldColumnIfCollapsed;
window.cleanupDropdown = cleanupDropdown;
window.columnTagUpdateTimeout = null;
window.taskTagUpdateTimeout = null;
window.toggleColumnTag = toggleColumnTag;
window.toggleTaskTag = toggleTaskTag;
window.submenuGenerator = window.menuManager; // Compatibility alias
window.manualRefresh = manualRefresh;
window.updateVisualTagState = updateVisualTagState;
window.updateAllVisualTagElements = updateAllVisualTagElements;
window.toggleTaskIncludeMode = toggleTaskIncludeMode;
window.editTaskIncludeFile = editTaskIncludeFile;

