let scrollPositions = new Map();

// Make folding state variables global for persistence
window.collapsedColumns = window.collapsedColumns || new Set();
window.collapsedTasks = window.collapsedTasks || new Set();
window.columnFoldStates = window.columnFoldStates || new Map(); // Track last manual fold state for each column
window.globalColumnFoldState = window.globalColumnFoldState || 'fold-mixed'; // Track global column fold state

let currentBoard = null;
// Don't set window.currentBoard here as it will be set when board is loaded
let renderTimeout = null;

/**
 * Extracts the first valid style tag from text (e.g., #urgent, #feature)
 * Purpose: Used to determine primary tag for styling columns and tasks
 * Used by: renderBoard(), generateTagStyles(), task/column rendering
 * @param {string} text - Text containing hashtags
 * @returns {string|null} - Lowercase tag name without # or null if none found
 * Note: Skips row tags (#rowN), span tags (#spanN), and gather tags (#gather_...)
 */
function extractFirstTag(text) {
    if (!text) {return null;}
    const re = /#(?!row\d+\b)(?!span\d+\b)([a-zA-Z0-9_-]+(?:[=|><][a-zA-Z0-9_-]+)*)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const raw = m[1];
        const baseMatch = raw.match(/^([a-zA-Z0-9_-]+)/);
        const base = (baseMatch ? baseMatch[1] : raw).toLowerCase();
        if (base.startsWith('gather_')) {continue;} // do not use gather tags for styling
        return base;
    }
    return null;
}


/**
 * Converts hex color to RGBA format with specified alpha
 * Purpose: Creates semi-transparent colors for backgrounds and borders
 * Used by: generateTagStyles() for creating tag-based styling
 * @param {string} hex - Hex color code (with or without #)
 * @param {number} alpha - Opacity value (0-1)
 * @returns {string} - RGBA color string
 */
function hexToRgba(hex, alpha) {
    // Remove the # if present
    hex = hex.replace('#', '');
    
    // Parse the hex values
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Parses hex color into RGB components
 * Purpose: Breaks down colors for interpolation calculations
 * Used by: interpolateColor() for gradient calculations
 * @param {string} hex - Hex color code
 * @returns {Object} - Object with r, g, b numeric values (0-255)
 */
function hexToRgb(hex) {
    hex = hex.replace('#', '');
    return {
        r: parseInt(hex.substring(0, 2), 16),
        g: parseInt(hex.substring(2, 4), 16),
        b: parseInt(hex.substring(4, 6), 16)
    };
}

/**
 * Interpolates between two colors for gradient effects
 * Purpose: Creates smooth color transitions for multi-tag combinations
 * Used by: generateTagStyles() when handling multiple tags
 * @param {string} color1 - Starting hex color
 * @param {string} color2 - Ending hex color
 * @param {number} factor - Interpolation factor (0-1)
 * @returns {string} - Interpolated hex color
 */
function interpolateColor(color1, color2, factor) {
    // Parse colors
    const c1 = hexToRgb(color1);
    const c2 = hexToRgb(color2);
    
    // Interpolate each component
    const r = Math.round(c1.r + (c2.r - c1.r) * factor);
    const g = Math.round(c1.g + (c2.g - c1.g) * factor);
    const b = Math.round(c1.b + (c2.b - c1.b) * factor);
    
    // Convert to hex
    const toHex = (n) => n.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Applies all tag-based CSS styles to the document
 * Purpose: Injects dynamic CSS for tag colors, borders, and effects
 * Used by: renderBoard() after board content is rendered
 * Called when: Board updates, tag configurations change
 * Side effects: Modifies document.head with style element
 */
function applyTagStyles() {
    
    // Remove existing dynamic styles
    const existingStyles = document.getElementById('dynamic-tag-styles');
    if (existingStyles) {
        existingStyles.remove();
    }
    
    // Generate new styles
    const styles = generateTagStyles();
    
    if (styles) {
        // Create and inject style element
        const styleElement = document.createElement('style');
        styleElement.id = 'dynamic-tag-styles';
        styleElement.textContent = styles;
        document.head.appendChild(styleElement);
        
        // Debug: Check what columns have tags
        document.querySelectorAll('.kanban-full-height-column[data-column-tag]').forEach(col => {
        });
    } 
}

/**
 * Ensures a specific tag's CSS exists without full regeneration
 * Purpose: Optimizes performance by adding single tag styles on-demand
 * Used by: Tag toggle operations, real-time tag updates
 */
function ensureTagStyleExists(tagName) {
    const config = getTagConfig(tagName);
    if (!config) {
        return;
    }
    
    const isDarkTheme = document.body.classList.contains('vscode-dark') || 
                        document.body.classList.contains('vscode-high-contrast');
    const themeKey = isDarkTheme ? 'dark' : 'light';
    
    // Check if style already exists
    let styleElement = document.getElementById('dynamic-tag-styles');
    if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = 'dynamic-tag-styles';
        document.head.appendChild(styleElement);
    }
    
    // Check if this tag's styles already exist
    const existingStyles = styleElement.textContent || '';
    if (existingStyles.includes(`[data-column-tag="${tagName}"]`) || 
        existingStyles.includes(`[data-task-tag="${tagName}"]`)) {
        return;
    }
    
    // Generate styles for this specific tag
    const tagConfig = config;
    const editorBg = getComputedStyle(document.documentElement).getPropertyValue('--vscode-editor-background') || '#ffffff';
    let newStyles = '';
    
    // Generate column styles for this tag
    if (tagConfig.column) {
        const columnColors = tagConfig.column[themeKey] || tagConfig.column.light || {};
        if (columnColors.background) {
            const bgDark = columnColors.backgroundDark || columnColors.background;
            const columnBg = interpolateColor(editorBg, bgDark, 0.15);
            const columnCollapsedBg = interpolateColor(editorBg, bgDark, 0.2);
            
            newStyles += `.kanban-full-height-column[data-column-tag="${tagName}"] .column-header,
.kanban-full-height-column[data-all-tags~="${tagName}"] .column-header {
    background-color: ${columnBg} !important;
}
.kanban-full-height-column[data-column-tag="${tagName}"] .column-content,
.kanban-full-height-column[data-all-tags~="${tagName}"] .column-content {
    background-color: ${columnBg} !important;
}
.kanban-full-height-column.collapsed[data-column-tag="${tagName}"] .column-header,
.kanban-full-height-column.collapsed[data-all-tags~="${tagName}"] .column-header {
    background-color: ${columnCollapsedBg} !important;
}\n`;
        }
    }
    
    // Generate card styles for this tag
    if (tagConfig.card) {
        const cardColors = tagConfig.card[themeKey] || tagConfig.card.light || {};
        if (cardColors.background) {
            const bgDark = cardColors.backgroundDark || cardColors.background;
            const cardBg = interpolateColor(editorBg, bgDark, 0.25);
            const cardHoverBg = interpolateColor(editorBg, bgDark, 0.35);
            
            newStyles += `.task-item[data-task-tag="${tagName}"],
.task-item[data-all-tags~="${tagName}"] {
    background-color: ${cardBg} !important;
}
.task-item[data-task-tag="${tagName}"]:hover,
.task-item[data-all-tags~="${tagName}"]:hover {
    background-color: ${cardHoverBg} !important;
}\n`;
        }
    }
    
    // Generate border styles for this tag
    if (tagConfig.border) {
        const borderColor = tagConfig.border.color || (tagConfig[themeKey]?.background || tagConfig.light?.background);
        const borderWidth = tagConfig.border.width || '2px';
        const borderStyle = tagConfig.border.style || 'solid';
        
        if (tagConfig.border.position === 'left') {
            newStyles += `.kanban-full-height-column[data-column-tag="${tagName}"] .column-header {
                border-left: ${borderWidth} ${borderStyle} ${borderColor} !important;
            }
.kanban-full-height-column[data-column-tag="${tagName}"] .column-content {
                border-left: ${borderWidth} ${borderStyle} ${borderColor} !important;
            }
.task-item[data-task-tag="${tagName}"] {
                border-left: ${borderWidth} ${borderStyle} ${borderColor} !important;
            }\n`;
        } else {
            newStyles += `.kanban-full-height-column[data-column-tag="${tagName}"] .column-header {
                border: ${borderWidth} ${borderStyle} ${borderColor} !important;
            }
.kanban-full-height-column[data-column-tag="${tagName}"] .column-content {
                border: ${borderWidth} ${borderStyle} ${borderColor} !important;
                border-top: none !important;
            }
.task-item[data-task-tag="${tagName}"] {
                border: ${borderWidth} ${borderStyle} ${borderColor} !important;
            }\n`;
        }
    }
    
    // Generate footer bar styles for this tag
    if (tagConfig.footerBar) {
        const footerColor = tagConfig.footerBar.color || (tagConfig[themeKey]?.background || tagConfig.light?.background);
        const footerHeight = tagConfig.footerBar.label ? '20px' : (tagConfig.footerBar.height || '3px');
        const footerText = tagConfig.footerBar.label || '';
        const footerTextColor = tagConfig.footerBar.labelColor || (tagConfig[themeKey]?.text || tagConfig.light?.text);
        
        // Use relative positioning to work with flex layout (like original system)
        newStyles += `.footer-bar-${tagName.toLowerCase()} {
            position: relative;
            width: 100%;
            height: ${footerHeight};
            background-color: ${footerColor} !important;
            color: ${footerTextColor} !important;
            font-size: 10px;
            font-weight: bold;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            flex-shrink: 0;
            pointer-events: none;
            transition: all 0.2s ease;
        }\n`;
        
        if (footerText) {
            newStyles += `.footer-bar-${tagName.toLowerCase()}::after {
                content: '${footerText}';
            }\n`;
        }
        
        // Collapsed state styles
        newStyles += `.kanban-full-height-column.collapsed .footer-bar-${tagName.toLowerCase()} {
            position: relative !important;
            bottom: auto !important;
            left: 0 !important;
            right: 0 !important;
            width: 100% !important;
            height: ${footerText ? '20px' : footerHeight} !important;
            writing-mode: horizontal-tb !important;
            transform: none !important;
            font-size: 9px !important;
            ${footerText ? 'padding: 0 2px !important;' : ''}
        }\n`;
    }
    
    // Generate header bar styles for this tag
    if (tagConfig.headerBar) {
        const headerColor = tagConfig.headerBar.color || (tagConfig[themeKey]?.background || tagConfig.light?.background);
        const headerHeight = tagConfig.headerBar.label ? '20px' : (tagConfig.headerBar.height || '3px');
        const headerText = tagConfig.headerBar.label || '';
        const headerTextColor = tagConfig.headerBar.labelColor || (tagConfig[themeKey]?.text || tagConfig.light?.text);
        
        // Use relative positioning to work with flex layout (like original system)
        newStyles += `.header-bar-${tagName.toLowerCase()} {
            position: relative;
            width: 100%;
            height: ${headerHeight};
            background-color: ${headerColor} !important;
            color: ${headerTextColor} !important;
            font-size: 10px;
            font-weight: bold;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            flex-shrink: 0;
            pointer-events: none;
            transition: all 0.2s ease;
        }\n`;
        
        if (headerText) {
            newStyles += `.header-bar-${tagName.toLowerCase()}::after {
                content: '${headerText}';
            }\n`;
        }
        
        // Collapsed state styles
        newStyles += `.kanban-full-height-column.collapsed .header-bar-${tagName.toLowerCase()} {
            position: relative !important;
            width: 100% !important;
            height: ${headerText ? '20px' : headerHeight} !important;
            writing-mode: horizontal-tb !important;
            transform: none !important;
            font-size: 9px !important;
            ${headerText ? 'padding: 0 2px !important;' : ''}
        }\n`;
    }
    
    // Generate corner badge styles for this tag
    if (tagConfig.cornerBadge) {
        const badgeColor = tagConfig.cornerBadge.color || (tagConfig[themeKey]?.background || tagConfig.light?.background);
        const badgeTextColor = tagConfig.cornerBadge.labelColor || (tagConfig[themeKey]?.text || tagConfig.light?.text);
        const badgeStyle = tagConfig.cornerBadge.style || 'circle';
        
        newStyles += `.corner-badge-${tagName.toLowerCase()} {
            background-color: ${badgeColor} !important;
            color: ${badgeTextColor} !important;
            ${badgeStyle === 'square' ? 'border-radius: 2px;' : 'border-radius: 50%;'}
            width: 16px;
            height: 16px;
            min-width: 16px;
            font-size: 10px;
            font-weight: bold;
            display: flex;
            align-items: center;
            justify-content: center;
            position: absolute;
            z-index: 100;
            transition: all 0.2s ease;
        }\n`;
    }
    
    // Append new styles
    if (newStyles) {
        styleElement.textContent += newStyles;
    }
}

// Make functions globally available
window.ensureTagStyleExists = ensureTagStyleExists;
window.extractFirstTag = extractFirstTag;



/**
 * Debounced board rendering to prevent performance issues
 * Purpose: Prevents rapid re-renders when multiple updates occur
 * Used by: All board update operations
 * Delay: 50ms to batch multiple changes
 */
function debouncedRenderBoard() {
    if (renderTimeout) {
        clearTimeout(renderTimeout);
    }
    
    renderTimeout = setTimeout(() => {
        renderBoard();
        renderTimeout = null;
    }, 50);
}

/**
 * Applies the default folding state for all columns
 * Purpose: Empty columns collapsed, non-empty columns expanded (default state)
 * Used by: applyFoldingStates(), toggleAllColumns() when expanding
 * Side effects: Updates collapsedColumns set and DOM elements
 */
function applyDefaultFoldingState() {
    if (!currentBoard || !currentBoard.columns || currentBoard.columns.length === 0) {return;}
    
    // Ensure folding state variables are initialized
    if (!window.collapsedColumns) {window.collapsedColumns = new Set();}
    
    currentBoard.columns.forEach(column => {
        const hasNoTasks = !column.tasks || column.tasks.length === 0;
        const columnElement = document.querySelector(`[data-column-id="${column.id}"]`);
        const toggle = columnElement?.querySelector('.collapse-toggle');
        
        if (hasNoTasks) {
            // Empty columns should be collapsed by default
            window.collapsedColumns.add(column.id);
            columnElement?.classList.add('collapsed');
            toggle?.classList.add('rotated');
        } else {
            // Non-empty columns should be expanded by default  
            window.collapsedColumns.delete(column.id);
            columnElement?.classList.remove('collapsed');
            toggle?.classList.remove('rotated');
        }
    });
    
    // Set the global fold state to expanded (the default state)
    window.globalColumnFoldState = 'fold-expanded';
}

/**
 * Sets the default folding state for all columns (data only)
 * Purpose: Apply default logic without DOM changes (for initialization)
 * Used by: applyFoldingStates() when detecting fresh load
 * Side effects: Updates collapsedColumns set based on column content
 */
function setDefaultFoldingState() {
    if (!currentBoard || !currentBoard.columns || currentBoard.columns.length === 0) {return;}
    
    // Ensure folding state variables are initialized
    if (!window.collapsedColumns) {window.collapsedColumns = new Set();}
    
    currentBoard.columns.forEach(column => {
        const hasNoTasks = !column.tasks || column.tasks.length === 0;
        
        if (hasNoTasks) {
            // Empty columns should be collapsed by default
            window.collapsedColumns.add(column.id);
        } else {
            // Non-empty columns should be expanded by default  
            window.collapsedColumns.delete(column.id);
        }
    });
    
    // Set the global fold state to expanded (the default state)
    window.globalColumnFoldState = 'fold-expanded';
}

/**
 * Determines the global fold state of all columns
 * Purpose: Controls the fold-all/unfold-all button state
 * Used by: updateGlobalColumnFoldButton(), toggleAllColumns()
 * @returns {'fold-expanded'|'fold-collapsed'|'fold-mixed'} Current global state
 */
function getGlobalColumnFoldState() {
    if (!currentBoard || !currentBoard.columns || currentBoard.columns.length === 0) {
        return 'fold-mixed';
    }
    
    // Count columns with tasks that are collapsed
    const columnsWithTasks = currentBoard.columns.filter(column => column.tasks && column.tasks.length > 0);
    const emptyColumns = currentBoard.columns.filter(column => !column.tasks || column.tasks.length === 0);
    
    if (columnsWithTasks.length === 0) {
        // All columns are empty - consider them as all folded
        return 'fold-collapsed';
    }
    
    const collapsedWithTasks = columnsWithTasks.filter(column => window.collapsedColumns.has(column.id)).length;
    const collapsedEmpty = emptyColumns.filter(column => window.collapsedColumns.has(column.id)).length;
    
    // If all columns with tasks are expanded and all empty columns are collapsed
    if (collapsedWithTasks === 0 && collapsedEmpty === emptyColumns.length) {
        return 'fold-expanded'; // This is the "expanded" state
    } else if (collapsedWithTasks === columnsWithTasks.length) {
        // All columns with tasks are collapsed
        return 'fold-collapsed';
    } else {
        // Mixed state - return last manual state or default
        return window.globalColumnFoldState || 'fold-mixed';
    }
}

/**
 * Toggles all columns between collapsed and expanded states
 * Purpose: Bulk fold/unfold operation for all columns
 * Used by: Global fold button in board header
 * Side effects: Updates collapsedColumns set, re-renders board
 */
function toggleAllColumns() {
    if (!currentBoard || !currentBoard.columns || currentBoard.columns.length === 0) {return;}
    
    // Ensure state variables are initialized
    if (!window.collapsedColumns) {window.collapsedColumns = new Set();}
    
    const currentState = getGlobalColumnFoldState();
    const collapsedCount = currentBoard.columns.filter(column => window.collapsedColumns.has(column.id)).length;
    const totalColumns = currentBoard.columns.length;
    
    // Determine action based on current state
    let shouldCollapse;
    if (collapsedCount === totalColumns) {
        // All folded -> expand all (except empty ones)
        shouldCollapse = false;
    } else if (collapsedCount === 0) {
        // All expanded -> collapse all
        shouldCollapse = true;
    } else {
        // Mixed state -> use opposite of last manual state, or default to collapse
        if (window.globalColumnFoldState === 'fold-collapsed') {
            shouldCollapse = false; // Was manually set to collapsed, so expand
        } else {
            shouldCollapse = true; // Default or was expanded, so collapse
        }
    }
    
    // Apply the action to all columns
    if (shouldCollapse) {
        // When collapsing, collapse all columns
        currentBoard.columns.forEach(column => {
            const columnElement = document.querySelector(`[data-column-id="${column.id}"]`);
            const toggle = columnElement?.querySelector('.collapse-toggle');
            
            window.collapsedColumns.add(column.id);
            columnElement?.classList.add('collapsed');
            toggle?.classList.add('rotated');
        });
    } else {
        // When expanding, apply the default folding logic (empty collapsed, non-empty expanded)
        applyDefaultFoldingState();
        return; // Early return since applyDefaultFoldingState() sets the global state
    }
    
    // Remember this manual state
    window.globalColumnFoldState = shouldCollapse ? 'fold-collapsed' : 'fold-expanded';
    
    // Update the global fold button appearance
    updateGlobalColumnFoldButton();
    
    // Save state immediately
    if (window.saveCurrentFoldingState) {
        window.saveCurrentFoldingState();
    }
}

/**
 * Updates the global fold button appearance based on column states
 * Purpose: Visual feedback for current fold state
 * Used by: After any column fold/unfold operation
 * Updates: Button text, title, and data-state attribute
 */
function updateGlobalColumnFoldButton() {
    const globalFoldButton = document.getElementById('global-fold-btn');
    const globalFoldIcon = document.getElementById('global-fold-icon');
    
    if (!globalFoldButton || !globalFoldIcon) {return;}
    
    // Remove all state classes
    globalFoldButton.classList.remove('fold-collapsed', 'fold-expanded', 'fold-mixed');
    
    // Get current state
    const currentState = getGlobalColumnFoldState();
    globalFoldButton.classList.add(currentState);
    
    // Update icon and title
    if (currentState === 'fold-collapsed') {
        globalFoldIcon.textContent = '▶';
        globalFoldButton.title = 'Expand all columns';
    } else if (currentState === 'fold-expanded') {
        globalFoldIcon.textContent = '▼';
        globalFoldButton.title = 'Collapse all columns';
    } else {
        globalFoldIcon.textContent = '▽';
        globalFoldButton.title = 'Fold/unfold all columns';
    }
}

// Apply saved or default folding states to rendered elements
/**
 * Applies saved folding states to columns and tasks after render
 * Purpose: Persists fold state across board refreshes
 * Used by: renderBoard() after DOM creation
 * Side effects: Adds 'collapsed' class to previously collapsed elements
 */
function applyFoldingStates() {
    // Ensure folding state variables are initialized
    if (!window.collapsedColumns) {window.collapsedColumns = new Set();}
    if (!window.collapsedTasks) {window.collapsedTasks = new Set();}
    if (!window.columnFoldStates) {window.columnFoldStates = new Map();}
    
    if (!currentBoard || !currentBoard.columns) {
        return;
    }
    
    // Only reset to defaults if this is a truly fresh load (no global state at all)
    // Don't reset for "inconsistencies" as this causes unwanted unfolding when adding tasks to empty columns
    if (!window.globalColumnFoldState) {
        setDefaultFoldingState();
    }
    
    // Apply column folding states
    window.collapsedColumns.forEach(columnId => {
        const columnElement = document.querySelector(`[data-column-id="${columnId}"]`);
        const toggle = columnElement?.querySelector('.collapse-toggle');
        
        if (columnElement) {
            columnElement.classList.add('collapsed');
            if (toggle) {toggle.classList.add('rotated');}
        }
    });
    
    // Apply task folding states
    window.collapsedTasks.forEach(taskId => {
        const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
        const toggle = taskElement?.querySelector('.task-collapse-toggle');
        
        if (taskElement) {
            taskElement.classList.add('collapsed');
            if (toggle) {toggle.classList.add('rotated');}
        }
    });
    
    // Update fold all buttons for each column
    if (currentBoard && currentBoard.columns) {
        currentBoard.columns.forEach(column => {
            updateFoldAllButton(column.id);
        });
    }
    
    // Update global fold button
    updateGlobalColumnFoldButton();
}

// Helper function to get active tags in a title
/**
 * Extracts all active tag names from text (without # symbol)
 * Purpose: Identifies which tags are applied to an element
 * Used by: Tag menu generation, visual tag state updates
 * @param {string} text - Text containing hashtags
 * @returns {Array<string>} Lowercase tag names without #
 */
function getActiveTagsInTitle(text) {
    if (!text || typeof text !== 'string') {return [];}
    // Match all tags - for gather tags, include the full expression until next space
    // Skip row tags and span tags
    const matches = text.match(/#(?!row\d+\b)(?!span\d+\b)([a-zA-Z0-9_-]+(?:[&|=><][a-zA-Z0-9_-]+)*)/g) || [];
    return matches.map(tag => {
        const fullTag = tag.substring(1);
        // For gather tags, keep the full expression
        if (fullTag.startsWith('gather_')) {
            return fullTag;
        }
        // For other tags, extract base name
        const baseMatch = fullTag.match(/^([a-zA-Z0-9_-]+)/);
        return baseMatch ? baseMatch[1].toLowerCase() : fullTag.toLowerCase();
    });
}

// Add a new function to get full tag content (including operators)
/**
 * Extracts complete tag content including parameters (e.g., #tag=value)
 * Purpose: Preserves full tag syntax for operations
 * Used by: Tag manipulation operations
 * @param {string} text - Text containing tags
 * @returns {Array<string>} Complete tag strings with parameters
 */
function getFullTagContent(text) {
    if (!text) {return [];}
    // Match tags including full gather expressions
    const matches = text.match(/#(?!row\d+\b)(gather_[a-zA-Z0-9_&|=><-]+|[a-zA-Z0-9_-]+)/g) || [];
    return matches.map(tag => tag.substring(1));
}

// Helper function to collect all tags currently in use across the board
/**
 * Collects all unique tags currently used in the board
 * Purpose: Builds complete tag inventory for menus
 * Used by: Tag menu generation, available tags display
 * @returns {Set<string>} Unique lowercase tag names
 */
function getAllTagsInUse() {
    const tagsInUse = new Set();
    
    if (!currentBoard || !currentBoard.columns) {return tagsInUse;}
    
    // Collect tags from all columns and tasks
    currentBoard.columns.forEach(column => {
        // Get tags from column title
        const columnTags = getActiveTagsInTitle(column.title);
        columnTags.forEach(tag => tagsInUse.add(tag.toLowerCase()));
        
        // Get tags from all tasks
        column.tasks.forEach(task => {
            const taskTitleTags = getActiveTagsInTitle(task.title);
            taskTitleTags.forEach(tag => tagsInUse.add(tag.toLowerCase()));
            
            const taskDescTags = getActiveTagsInTitle(task.description);
            taskDescTags.forEach(tag => tagsInUse.add(tag.toLowerCase()));
        });
    });
    
    return tagsInUse;
}

  // Helper function to get user-added tags (not in configuration)
/**
 * Gets tags that users added but aren't in configuration
 * Purpose: Shows custom/unconfigured tags in menus
 * Used by: Tag menu generation for 'Custom Tags' section
 * @returns {Array<string>} Sorted array of custom tag names
 */
function getUserAddedTags() {
    const allTagsInUse = getAllTagsInUse();
    const configuredTags = new Set();
    const tagConfig = window.tagColors || {};
    
    // Dynamically collect all configured tags regardless of group names
    Object.keys(tagConfig).forEach(key => {
        const value = tagConfig[key];
        
        // Check if this is a group (contains objects with light/dark themes)
        if (value && typeof value === 'object') {
            // Check if this is a direct tag configuration (has light/dark)
            if (value.light || value.dark) {
                // This is a direct tag configuration
                configuredTags.add(key.toLowerCase());
            } else {
                // This might be a group, check its children
                Object.keys(value).forEach(subKey => {
                    const subValue = value[subKey];
                    if (subValue && typeof subValue === 'object' && (subValue.light || subValue.dark)) {
                        configuredTags.add(subKey.toLowerCase());
                    }
                });
            }
        }
    });
    
    // Find tags that are in use but not configured
    const userAddedTags = [];
    allTagsInUse.forEach(tag => {
        if (!configuredTags.has(tag) && !tag.startsWith('row')) { // Exclude row tags
            userAddedTags.push(tag);
        }
    });
    
    return userAddedTags.sort(); // Sort alphabetically
}

// Helper function to generate tag menu items from configuration and user-added tags
/**
 * Generates complete HTML for tag selection menu
 * Purpose: Creates interactive tag toggle menu for columns/tasks
 * Used by: Column and task burger menus
 * @param {string} id - Element ID (column or task)
 * @param {string} type - 'column' or 'task'
 * @param {string} columnId - Parent column ID for tasks
 * @returns {string} HTML string for menu items
 */
function generateTagMenuItems(id, type, columnId = null) {
    const tagConfig = window.tagColors || {};
    const userAddedTags = getUserAddedTags();
    
    // Get current title to check which tags are active
    let currentTitle = '';
    if (type === 'column') {
        const column = currentBoard?.columns?.find(c => c.id === id);
        currentTitle = column?.title || '';
    } else if (type === 'task' && columnId) {
        const column = currentBoard?.columns?.find(c => c.id === columnId);
        const task = column?.tasks?.find(t => t.id === id);
        currentTitle = task?.title || '';
    }
    
    // Get all active tags
    const activeTags = getActiveTagsInTitle(currentTitle);
    
    let menuHtml = '';
    let hasAnyTags = false;
    
    // Dynamically generate menu for all groups in configuration
    Object.keys(tagConfig).forEach(groupKey => {
        const groupValue = tagConfig[groupKey];
        
        // Check if this is a group (contains objects with light/dark themes)
        if (groupValue && typeof groupValue === 'object') {
            let groupTags = [];
            
            // Check if this is a direct tag configuration
            if (groupValue.light || groupValue.dark) {
                // This is a single tag, not a group
                groupTags = [groupKey];
            } else {
                // This is a group, collect its tags
                Object.keys(groupValue).forEach(tagKey => {
                    const tagValue = groupValue[tagKey];
                    if (tagValue && typeof tagValue === 'object' && (tagValue.light || tagValue.dark)) {
                        groupTags.push(tagKey);
                    }
                });
            }
            
            if (groupTags.length > 0) {
                hasAnyTags = true;
                // Count active tags in this group
                const activeCount = groupTags.filter(tag => 
                    activeTags.includes(tag.toLowerCase())
                ).length;
                
                // Use dynamic submenu generation - just add placeholder with data attributes
                const groupLabel = groupKey.charAt(0).toUpperCase() + groupKey.slice(1);
                const countBadge = activeCount > 0 ? `<span style="opacity: 0.7; margin-left: auto; padding-left: 10px;">${activeCount}</span>` : '';
                menuHtml += `
                    <div class="donut-menu-item has-submenu" data-submenu-type="tags" data-group="${groupKey}" data-id="${id}" data-type="${type}" data-column-id="${columnId || ''}" style="display: flex; align-items: center;">
                        <span>${groupLabel}</span>
                        ${countBadge}
                    </div>
                `;
            }
        }
    });
    
    // Add user-added tags if any exist
    if (userAddedTags.length > 0) {
        hasAnyTags = true;
        // Count active custom tags
        const activeCustomCount = userAddedTags.filter(tag => 
            activeTags.includes(tag.toLowerCase())
        ).length;
        const customCountBadge = activeCustomCount > 0 ? `<span style="opacity: 0.7; margin-left: auto; padding-left: 10px;">${activeCustomCount}</span>` : '';
        
        menuHtml += `
            <div class="donut-menu-item has-submenu" data-submenu-type="tags" data-group="custom" data-id="${id}" data-type="${type}" data-column-id="${columnId || ''}" style="display: flex; align-items: center;">
                <span>Custom Tags</span>
                ${customCountBadge}
            </div>
        `;
    }
    
    // Note: "Remove all tags" option is added dynamically by updateTagCategoryCounts() when tags are active
    
    // If no tags at all, show a message
    if (!hasAnyTags && activeTags.length === 0) {
        menuHtml = '<button class="donut-menu-item" disabled>No tags available</button>';
    }
    
    return menuHtml;
}




// Helper function to generate tag items for a group (horizontal layout)
function generateGroupTagItems(tags, id, type, columnId = null, isConfigured = true) {
    // Get current title to check which tags are active
    let currentTitle = '';
    if (type === 'column') {
        const column = currentBoard?.columns?.find(c => c.id === id);
        currentTitle = column?.title || '';
    } else if (type === 'task' && columnId) {
        const column = currentBoard?.columns?.find(c => c.id === columnId);
        const task = column?.tasks?.find(t => t.id === id);
        currentTitle = task?.title || '';
    }
    
    // Check which tags are currently in the title
    const activeTags = getActiveTagsInTitle(currentTitle);
    
    // Create a grid container with tag buttons
    const tagButtons = tags.map(tagName => {
        const isActive = activeTags.includes(tagName.toLowerCase());
        const checkbox = isActive ? '✓' : '';
        
        // Create unique ID for this button
        const buttonId = `tag-chip-${type}-${id}-${tagName}`.replace(/[^a-zA-Z0-9-]/g, '-');
        
        // Get tag config for color (only for configured tags)
        let bgColor = '#666';
        let textColor = '#fff';
        let bgDark = null;
        
        if (isConfigured) {
            const config = getTagConfig(tagName);
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
                if (bgDark) {
                    const editorBg = getComputedStyle(document.documentElement).getPropertyValue('--vscode-editor-background') || '#ffffff';
                    // Use a lighter interpolation for the button background when active
                    bgColor = interpolateColor(editorBg, bgDark, isActive ? 0.25 : 0.1);
                }
            }
        } else {
            // Default colors for user-added tags
            const isDarkTheme = document.body.classList.contains('vscode-dark') || 
                               document.body.classList.contains('vscode-high-contrast');
            if (isDarkTheme) {
                bgColor = '#555';
                textColor = '#ddd';
            } else {
                bgColor = '#999';
                textColor = '#fff';
            }
        }
        
        const displayName = isConfigured ? tagName : tagName;
        const title = isConfigured ? tagName : `Custom tag: ${tagName}`;
        
        // Store the handler in a global object
        if (!window.tagHandlers) {window.tagHandlers = {};}
        window.tagHandlers[buttonId] = function(event) {
            event.stopPropagation();
            event.preventDefault();
            if (type === 'column') {
                if (typeof handleColumnTagClick === 'function') {
                    handleColumnTagClick(id, tagName, event);
                } else if (typeof window.handleColumnTagClick === 'function') {
                    window.handleColumnTagClick(id, tagName, event);
                }
            } else {
                if (typeof handleTaskTagClick === 'function') {
                    handleTaskTagClick(id, columnId, tagName, event);
                } else if (typeof window.handleTaskTagClick === 'function') {
                    window.handleTaskTagClick(id, columnId, tagName, event);
                }
            }
            return false;
        };
        
        return `
            <button id="${buttonId}"
                    class="donut-menu-tag-chip ${isActive ? 'active' : ''} ${isConfigured ? '' : 'custom-tag'}"
                    data-tag-name="${tagName}"
                    data-tag-type="${type}"
                    onclick="window.tagHandlers['${buttonId}'](event); return false;"
                    style="background-color: ${isActive ? bgColor : 'transparent'}; 
                           color: ${isActive ? textColor : (bgDark ? bgDark : 'inherit')};
                           border-color: ${bgDark || bgColor};
                           ${!isActive && bgDark ? `border: 2px solid ${bgDark};` : ''}"
                    title="${title}">
                <span class="tag-chip-check">${checkbox}</span>
                <span class="tag-chip-name" style="${!isActive && bgDark ? `color: ${bgDark};` : ''}">${displayName}</span>
            </button>
        `;
    }).join('');
    
    return tagButtons;
}


// Helper function for flat structure (backward compatibility)
function generateFlatTagItems(tags, id, type, columnId = null) {
    if (tags.length === 0) {
        return '<button class="donut-menu-item" disabled>No tags configured</button>';
    }
    
    // Get current title to check which tags are active
    let currentTitle = '';
    if (type === 'column') {
        const column = currentBoard?.columns?.find(c => c.id === id);
        currentTitle = column?.title || '';
    } else if (type === 'task' && columnId) {
        const column = currentBoard?.columns?.find(c => c.id === columnId);
        const task = column?.tasks?.find(t => t.id === id);
        currentTitle = task?.title || '';
    }
    
    // Check which tags are currently in the title
    const activeTags = getActiveTagsInTitle(currentTitle);
    
    // Create horizontal layout for flat structure too
    return tags.map(tagName => {
        const isActive = activeTags.includes(tagName.toLowerCase());
        const checkbox = isActive ? '✓' : '';
        const onclick = type === 'column' 
            ? `toggleColumnTag('${id}', '${tagName}')`
            : `toggleTaskTag('${id}', '${columnId}', '${tagName}')`;
        
        return `
            <button class="donut-menu-tag-chip ${isActive ? 'active' : ''}" 
                    onclick="${onclick}"
                    data-element-id="${id}"
                    data-tag-name="${tagName}"
                    title="${tagName}">
                <span class="tag-chip-check">${checkbox}</span>
                <span class="tag-chip-name">${tagName}</span>
            </button>
        `;
    }).join('');
}


// Render Kanban board
/**
 * Main board rendering function - creates entire kanban UI
 * Purpose: Converts board data to interactive HTML
 * Used by: Initial load, board updates, refresh operations
 * Side effects: Updates DOM, applies styles, restores state
 * Performance: Debounced to prevent rapid re-renders
 */
function renderBoard() {
    
    // Apply tag styles first
    applyTagStyles();
    
    // Check if we're currently editing - if so, skip the render
    if (window.taskEditor && window.taskEditor.currentEditor) {
        return;
    }
    
    const boardElement = document.getElementById('kanban-board');
    if (!boardElement) {
        console.error('Board element not found');
        return;
    }

    // Ensure currentBoard is synced with cachedBoard for operations like tag toggling
    if (window.cachedBoard && window.cachedBoard !== currentBoard) {
        currentBoard = window.cachedBoard;
    }

    if (!currentBoard) {
        boardElement.innerHTML = `
            <div class="empty-board" style="
                text-align: center;
                padding: 40px;
                color: var(--vscode-descriptionForeground);
                font-style: italic;
            ">
                No board data available. Please open a Markdown file.
            </div>`;
        return;
    }

    if (!currentBoard.columns) {
        currentBoard.columns = [];
    }
    
    // Save current scroll positions
    document.querySelectorAll('.tasks-container').forEach(container => {
        const columnId = container.id.replace('tasks-', '');
        scrollPositions.set(columnId, container.scrollTop);
    });

    boardElement.innerHTML = '';

    // Check if board is valid (has proper kanban header)
    if (currentBoard.valid === false) {
        // Show initialize button instead of columns
        const initializeContainer = document.createElement('div');
        initializeContainer.style.cssText = `
            text-align: center; 
            padding: 40px; 
            color: var(--vscode-descriptionForeground);
        `;
        
        initializeContainer.innerHTML = `
            <div style="margin-bottom: 20px; font-size: 16px; text-align: left;">
                This file is not initialized as a Kanban board.<br><br>
                Click the button below to add the required header.<br><br>
                This might overwrite content of the file if not structured correctly!
            </div>
        `;
        
        const initializeBtn = document.createElement('button');
        initializeBtn.className = 'initialise-btn';
        initializeBtn.textContent = 'Initialize File';
        initializeBtn.onclick = () => initializeFile();
        
        initializeContainer.appendChild(initializeBtn);
        boardElement.appendChild(initializeContainer);
        return;
    }

    // Detect number of rows from the board
    const detectedRows = detectRowsFromBoard(currentBoard);
    const numRows = Math.max(currentLayoutRows, detectedRows);
    
    // Apply multi-row class if needed
    if (numRows > 1) {
        boardElement.classList.add('multi-row');
        
        // Create row containers
        for (let row = 1; row <= numRows; row++) {
            const rowContainer = document.createElement('div');
            rowContainer.className = 'kanban-row';
            rowContainer.setAttribute('data-row-number', row);
            
            // Add row header
            // const rowHeader = document.createElement('div');
            // rowHeader.className = 'kanban-row-header';
            // rowHeader.textContent = `Row ${row}`;
            // rowContainer.appendChild(rowHeader);
            
            // Add columns for this row
            currentBoard.columns.forEach((column, index) => {
                const columnRow = getColumnRow(column.title);
                if (columnRow === row) {
                    const columnElement = createColumnElement(column, index);
                    rowContainer.appendChild(columnElement);
                }
            });
            
            // Add the "Add Column" button to each row
            const addColumnBtn = document.createElement('button');
            addColumnBtn.className = 'add-column-btn multi-row-add-btn'; // Add the multi-row-add-btn class
            addColumnBtn.textContent = '+ Add Column';
            addColumnBtn.onclick = () => addColumn(row);
            rowContainer.appendChild(addColumnBtn);    

            // Add a drop zone spacer that fills remaining horizontal space
            const dropZoneSpacer = document.createElement('div');
            dropZoneSpacer.className = 'row-drop-zone-spacer';
            rowContainer.appendChild(dropZoneSpacer);
            
            boardElement.appendChild(rowContainer);
        }
    } else {
        // Single row layout (existing behavior)
        boardElement.classList.remove('multi-row');
        
        currentBoard.columns.forEach((column, index) => {
            const columnElement = createColumnElement(column, index);
            boardElement.appendChild(columnElement);
        });

        const addColumnBtn = document.createElement('button');
        addColumnBtn.className = 'add-column-btn';
        addColumnBtn.textContent = '+ Add Column';
        addColumnBtn.onclick = () => addColumn(1); // Default to row 1 for single row layout
        boardElement.appendChild(addColumnBtn);
    }

    // Apply folding states after rendering
    setTimeout(() => {
        applyFoldingStates();
        
        // Apply user-configured row height if set
        if (window.currentRowHeight && window.currentRowHeight !== 'auto') {
            window.applyRowHeight(window.currentRowHeight);
        }
        // For 'auto' mode, CSS handles the layout naturally without any JS intervention
        
        // Restore scroll positions
        scrollPositions.forEach((scrollTop, columnId) => {
            const container = document.getElementById(`tasks-${columnId}`);
            if (container) {
                container.scrollTop = scrollTop;
            }
        });
        
        // Update image sources after rendering
        updateImageSources();
        
        // Notify that rendering is complete (for focus functionality)
        if (window.onBoardRenderingComplete) {
            window.onBoardRenderingComplete();
        }

        // Recalculate task description heights after board renders
        if (window.calculateTaskDescriptionHeight) {
            window.calculateTaskDescriptionHeight();
        }
    }, 10);

    setupDragAndDrop();
    
    // Apply immediate visual updates to all elements with tags
    setTimeout(() => {
        document.querySelectorAll('[data-all-tags]').forEach(element => {
            const tags = element.getAttribute('data-all-tags').split(' ').filter(tag => tag.trim());
            const elementType = element.classList.contains('kanban-full-height-column') ? 'column' : 'task';
            if (window.updateAllVisualTagElements) {
                window.updateAllVisualTagElements(element, tags, elementType);
            }
        });
    }, 20);

    // Re-apply column width after render to preserve user's UI settings
    // Use setTimeout to ensure DOM is fully ready after the render
    setTimeout(() => {
        if (window.currentColumnWidth && window.applyColumnWidth) {
            window.applyColumnWidth(window.currentColumnWidth, true); // Skip render to prevent loop
        }
    }, 50);
}

function getFoldAllButtonState(columnId) {
    if (!currentBoard || !currentBoard.columns) {return 'fold-mixed';}
    
    const column = currentBoard.columns.find(c => c.id === columnId);
    if (!column || column.tasks.length === 0) {return 'fold-mixed';}
    
    const collapsedCount = column.tasks.filter(task => window.collapsedTasks.has(task.id)).length;
    const totalTasks = column.tasks.length;
    
    if (collapsedCount === totalTasks) {
        return 'fold-collapsed'; // All folded
    } else if (collapsedCount === 0) {
        return 'fold-expanded'; // All expanded
    } else {
        // Mixed state - use last manual state or default
        const lastState = window.columnFoldStates.get(columnId);
        return lastState || 'fold-mixed';
    }
}

function toggleAllTasksInColumn(columnId) {
    if (!currentBoard || !currentBoard.columns) {return;}
    
    // Ensure state variables are initialized
    if (!window.collapsedTasks) {window.collapsedTasks = new Set();}
    if (!window.columnFoldStates) {window.columnFoldStates = new Map();}
    
    const column = currentBoard.columns.find(c => c.id === columnId);
    if (!column || column.tasks.length === 0) {return;}
    
    const collapsedCount = column.tasks.filter(task => window.collapsedTasks.has(task.id)).length;
    const totalTasks = column.tasks.length;
    
    // Determine action based on current state
    let shouldCollapse;
    if (collapsedCount === totalTasks) {
        // All folded -> expand all
        shouldCollapse = false;
    } else if (collapsedCount === 0) {
        // All expanded -> collapse all
        shouldCollapse = true;
    } else {
        // Mixed state -> use opposite of last manual state, or default to collapse
        const lastState = window.columnFoldStates.get(columnId);
        if (lastState === 'fold-collapsed') {
            shouldCollapse = false; // Was manually set to collapsed, so expand
        } else {
            shouldCollapse = true; // Default or was expanded, so collapse
        }
    }
    
    // Apply the action to all tasks - scope to this column only
    const columnElement = document.querySelector(`[data-column-id="${columnId}"]`);
    if (!columnElement) {return;}
    
    column.tasks.forEach(task => {
        const taskElement = columnElement.querySelector(`[data-task-id="${task.id}"]`);
        const toggle = taskElement?.querySelector('.task-collapse-toggle');
        
        if (shouldCollapse) {
            window.collapsedTasks.add(task.id);
            taskElement?.classList.add('collapsed');
            toggle?.classList.add('rotated');
        } else {
            window.collapsedTasks.delete(task.id);
            taskElement?.classList.remove('collapsed');
            toggle?.classList.remove('rotated');
        }
    });
    
    // Remember this manual state
    window.columnFoldStates.set(columnId, shouldCollapse ? 'fold-collapsed' : 'fold-expanded');
    
    // Update the fold button appearance
    updateFoldAllButton(columnId);
    
    // Save state immediately
    if (window.saveCurrentFoldingState) {
        window.saveCurrentFoldingState();
    }
}

function updateFoldAllButton(columnId) {
    const foldButton = document.querySelector(`[data-column-id="${columnId}"] .fold-all-btn`);
    if (!foldButton) {return;}
    
    // Remove all state classes
    foldButton.classList.remove('fold-collapsed', 'fold-expanded', 'fold-mixed');
    
    // Add current state class
    const currentState = getFoldAllButtonState(columnId);
    foldButton.classList.add(currentState);
    
    // Update icon and title
    const icon = foldButton.querySelector('.fold-icon');
    if (icon) {
        if (currentState === 'fold-collapsed') {
            icon.textContent = '▶';
            foldButton.title = 'Expand all cards';
        } else if (currentState === 'fold-expanded') {
            icon.textContent = '▼';
            foldButton.title = 'Collapse all cards';
        } else {
            icon.textContent = '▽';
            foldButton.title = 'Fold/unfold all cards';
        }
    }
}

/**
 * Creates HTML element for a single column
 * Purpose: Generates column structure with header, tasks, footer
 * Used by: renderBoard() for each column
 * @param {Object} column - Column data object
 * @param {number} columnIndex - Position in column array
 * @returns {string} Complete HTML for column
 */
function createColumnElement(column, columnIndex) {
    if (!column) {
        return document.createElement('div');
    }

    if (!column.tasks) {
        column.tasks = [];
    }

    // Extract ALL tags from column title for stacking features
    const allTags = getActiveTagsInTitle(column.title);
    
    // Use first tag for background color (never stack backgrounds)
    const columnTag = extractFirstTag(column.title);
    
    const columnDiv = document.createElement('div');
    const isCollapsed = window.collapsedColumns.has(column.id);
    
    // Header/footer bars handled by immediate update system
    const headerBarsHtml = '';
    const footerBarsHtml = '';
    
    // Determine classes
    let headerClasses = '';
    let footerClasses = '';
    
    if (headerBarsHtml) {
        headerClasses = 'has-header-bar';
        if (headerBarsHtml.includes('label')) {headerClasses += ' has-header-label';}
    }
    if (footerBarsHtml) {
        footerClasses = 'has-footer-bar';
        if (footerBarsHtml.includes('label')) {footerClasses += ' has-footer-label';}
    }
    
    // Check for span tag to set column width (only blocked by viewport-based widths, not pixel widths)
    let spanClass = '';
    const spanMatch = column.title.match(/#span(\d+)\b/i);
    const hasViewportWidth = window.currentColumnWidth && (window.currentColumnWidth === '66' || window.currentColumnWidth === '100');
    if (spanMatch && !hasViewportWidth) {
        const spanCount = parseInt(spanMatch[1]);
        if (spanCount >= 2 && spanCount <= 4) { // Limit to reasonable span values
            spanClass = `column-span-${spanCount}`;
        }
    }

    columnDiv.className = `kanban-full-height-column ${isCollapsed ? 'collapsed' : ''} ${headerClasses} ${footerClasses} ${spanClass}`.trim();
    columnDiv.setAttribute('data-column-id', column.id);
    columnDiv.setAttribute('data-column-index', columnIndex);
    columnDiv.setAttribute('data-row', getColumnRow(column.title));

    // Add primary tag for background color only (ignore row/gather/span)
    if (columnTag && !columnTag.startsWith('row') && !columnTag.startsWith('gather_') && !columnTag.startsWith('span')) {
        columnDiv.setAttribute('data-column-tag', columnTag);
    }
    
    // Add all tags as a separate attribute for stacking features
    if (allTags.length > 0) {
        columnDiv.setAttribute('data-all-tags', allTags.join(' '));
    }

    // Corner badges handled by immediate update system
    const cornerBadgesHtml = '';

    // Filter tags from displayed title based on visibility setting
    const displayTitle = column.title ? window.filterTagsFromText(column.title) : '';
    const renderedTitle = displayTitle ? renderMarkdown(displayTitle) : '';
    const foldButtonState = getFoldAllButtonState(column.id);

    // Only show row indicator for rows 2, 3, 4 if configuration allows (not row 1)
    const columnRow = getColumnRow(column.title);
    const rowIndicator = (window.showRowTags && columnRow > 1) ? `<span class="column-row-tag">Row ${columnRow}</span>` : '';

		// the column-header MUST be outside the column-inner to be able to be sticky over the full height!!!
    columnDiv.innerHTML = `
				<div class="column-header">
						${headerBarsHtml || ''}
						${cornerBadgesHtml}
						<div class="column-title-section">
								<span class="drag-handle column-drag-handle" draggable="true">⋮⋮</span>
								<span class="collapse-toggle ${isCollapsed ? 'rotated' : ''}" onclick="toggleColumnCollapse('${column.id}')">▶</span>
								<div class="column-title-container">
										<div class="column-title markdown-content" onclick="handleColumnTitleClick(event, '${column.id}')">${renderedTitle}${rowIndicator}</div>
										<textarea class="column-title-edit" 
																data-column-id="${column.id}"
																style="display: none;">${escapeHtml(displayTitle)}</textarea>
								</div>
								<span class="task-count">${column.tasks.length}
										<button class="fold-all-btn ${foldButtonState}" onclick="toggleAllTasksInColumn('${column.id}')" title="Fold/unfold all cards">
												<span class="fold-icon">${foldButtonState === 'fold-collapsed' ? '▶' : foldButtonState === 'fold-expanded' ? '▼' : '▽'}</span>
										</button>
								</span>
								<button class="collapsed-add-task-btn" onclick="addTaskAndUnfold('${column.id}')" title="Add task and unfold column">+</button>
								<div class="donut-menu">
										<button class="donut-menu-btn" onclick="toggleDonutMenu(event, this)">⋯</button>
										<div class="donut-menu-dropdown">
												<button class="donut-menu-item" onclick="insertColumnBefore('${column.id}')">Insert list before</button>
												<button class="donut-menu-item" onclick="insertColumnAfter('${column.id}')">Insert list after</button>
												<div class="donut-menu-divider"></div>
												<button class="donut-menu-item" onclick="copyColumnAsMarkdown('${column.id}')">Copy as markdown</button>
												<div class="donut-menu-divider"></div>
												<button class="donut-menu-item" onclick="moveColumnLeft('${column.id}')">Move list left</button>
												<button class="donut-menu-item" onclick="moveColumnRight('${column.id}')">Move list right</button>
												<div class="donut-menu-divider"></div>
												<div class="donut-menu-item span-width-control">
													<span class="span-width-label">Width:</span>
													<div class="span-width-controls">
														<button class="span-width-btn" onclick="changeColumnSpan('${column.id}', -1)">−</button>
														<span class="span-width-value" data-column-id="${column.id}">${(() => {
															const spanMatch = column.title.match(/#span(\d+)\b/i);
															return spanMatch ? spanMatch[1] : '1';
														})()}</span>
														<button class="span-width-btn" onclick="changeColumnSpan('${column.id}', 1)">+</button>
													</div>
												</div>
												<div class="donut-menu-divider"></div>
												<div class="donut-menu-item has-submenu" data-submenu-type="sort" data-id="${column.id}" data-type="column" data-column-id="${column.id}">
														Sort by
												</div>
												<div class="donut-menu-divider"></div>
												${generateTagMenuItems(column.id, 'column')}
												<div class="donut-menu-divider"></div>
												<button class="donut-menu-item danger" onclick="deleteColumn('${column.id}')">Delete list</button>
										</div>
								</div>
						</div>
				</div>
        <div class="column-inner">
            <div class="column-content">
                <div class="tasks-container" id="tasks-${column.id}">
                    ${column.tasks.map((task, index) => createTaskElement(task, column.id, index)).join('')}
                    ${column.tasks.length === 0 ? `<button class="add-task-btn" onclick="addTask('${column.id}')">
                        + Add Task
                    </button>` : ''}
                </div>
            </div>
        </div>
        <div class="column-footer">
            ${footerBarsHtml || ''}
        </div>
    `;

    return columnDiv;
}

/**
 * Creates HTML element for a single task/card
 * Purpose: Generates task card with title, description, tags
 * Used by: createColumnElement() for each task
 * @param {Object} task - Task data object
 * @param {string} columnId - Parent column ID
 * @param {number} taskIndex - Position in task array
 * @returns {string} Complete HTML for task card
 */
function createTaskElement(task, columnId, taskIndex) {
    if (!task) {
        return '';
    }

    const renderedDescription = (task.description && typeof task.description === 'string' && task.description.trim()) ? renderMarkdown(task.description) : '';
    const renderedTitle = (task.title && typeof task.title === 'string' && task.title.trim()) ? renderMarkdown(task.title) : '';
    const isCollapsed = window.collapsedTasks.has(task.id);
    
    // Extract ALL tags for stacking features
    const allTags = getActiveTagsInTitle(task.title);
    
    // Use first tag for background color
    const taskTag = extractFirstTag(task.title);
    const tagAttribute = taskTag ? ` data-task-tag="${taskTag}"` : '';
    
    // Add all tags attribute for stacking features
    const allTagsAttribute = allTags.length > 0 ? ` data-all-tags="${allTags.join(' ')}"` : '';
    
    // Corner badges and header/footer bars handled by immediate update system
    const cornerBadgesHtml = '';
    const headerBarsData = { html: '', totalHeight: 0, hasLabel: false };
    const footerBarsData = { html: '', totalHeight: 0, hasLabel: false };
    
    // Calculate padding
    let paddingTopStyle = '';
    let paddingBottomStyle = '';
    let headerClasses = '';
    let footerClasses = '';
    
    if (headerBarsData && headerBarsData.totalHeight) {
        paddingTopStyle = `padding-top: ${headerBarsData.totalHeight}px);`; /*calc(var(--whitespace-div2) + */
        headerClasses = 'has-header-bar';
        if (headerBarsData.hasLabel) {headerClasses += ' has-header-label';}
    }
    if (footerBarsData && footerBarsData.totalHeight) {
        paddingBottomStyle = `padding-bottom: ${footerBarsData.totalHeight}px);`; /*calc(var(--whitespace-div2) + */
        footerClasses = 'has-footer-bar';
        if (footerBarsData.hasLabel) {footerClasses += ' has-footer-label';}
    }
    
    const headerBarsHtml = headerBarsData.html || '';
    const footerBarsHtml = footerBarsData.html || '';
    
    return `
        <div class="${['task-item', isCollapsed ? 'collapsed' : '', headerClasses || '', footerClasses || ''].filter(cls => cls && cls.trim()).join(' ')}" 
             data-task-id="${task.id}" 
             data-column-id="${columnId}" 
             data-task-index="${taskIndex}"${tagAttribute}${allTagsAttribute}
             style="${paddingTopStyle} ${paddingBottomStyle}">
            ${headerBarsHtml}
            ${cornerBadgesHtml}
            <div class="task-header">
                <div class="task-drag-handle" title="Drag to move task">⋮⋮</div>
                <span class="task-collapse-toggle ${isCollapsed ? 'rotated' : ''}" onclick="toggleTaskCollapse('${task.id}'); updateFoldAllButton('${columnId}')">▶</span>
                <div class="task-title-container" onclick="handleTaskTitleClick(event, this, '${task.id}', '${columnId}')">
                <div class="task-title-display markdown-content"
                            data-task-id="${task.id}"
                            data-column-id="${columnId}">${renderedTitle}</div>
                    <textarea class="task-title-edit" 
                                data-task-id="${task.id}" 
                                data-column-id="${columnId}"
                                data-field="title"
                                placeholder="Task title (Markdown supported)..."
                                style="display: none;">${escapeHtml(task.title || '')}</textarea>
                </div>
                <div class="task-menu-container">
                    <div class="donut-menu">
                        <button class="donut-menu-btn" onclick="toggleDonutMenu(event, this)">⋯</button>
                        <div class="donut-menu-dropdown">
                            <button class="donut-menu-item" onclick="insertTaskBefore('${task.id}', '${columnId}')">Insert card before</button>
                            <button class="donut-menu-item" onclick="insertTaskAfter('${task.id}', '${columnId}')">Insert card after</button>
                            <button class="donut-menu-item" onclick="duplicateTask('${task.id}', '${columnId}')">Duplicate card</button>
                            <div class="donut-menu-divider"></div>
                            <button class="donut-menu-item" onclick="copyTaskAsMarkdown('${task.id}', '${columnId}')">Copy as markdown</button>
                            <div class="donut-menu-divider"></div>
                            <div class="donut-menu-item has-submenu" data-submenu-type="move" data-id="${task.id}" data-type="task" data-column-id="${columnId}">
                                Move
                            </div>
                            <div class="donut-menu-item has-submenu" data-submenu-type="move-to-list" data-id="${task.id}" data-type="task" data-column-id="${columnId}">
                                Move to list
                            </div>
                            <div class="donut-menu-divider"></div>
                            ${generateTagMenuItems(task.id, 'task', columnId)}
                            <div class="donut-menu-divider"></div>
                            <button class="donut-menu-item danger" onclick="deleteTask('${task.id}', '${columnId}')">Delete card</button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="task-description-container">
                <div class="task-description-display markdown-content"
                        data-task-id="${task.id}"
                        data-column-id="${columnId}"
                        onclick="handleDescriptionClick(event, this)">${renderedDescription}</div>
                <textarea class="task-description-edit" 
                            data-task-id="${task.id}" 
                            data-column-id="${columnId}"
                            data-field="description"
                            placeholder="Add description (Markdown supported)..."
                            style="display: none;">${escapeHtml(task.description || '')}</textarea>
            </div>
            ${footerBarsHtml}
        </div>
    `;
}

// Update tag styles when theme changes
function updateTagStylesForTheme() {
    applyTagStyles();
}

function initializeFile() {
    vscode.postMessage({
        type: 'initializeFile'
    });
}

function updateImageSources() {
    // This function would handle updating image sources if needed
    // Currently handled by the backend processing
}

// Make toggle functions globally accessible
window.toggleAllColumns = toggleAllColumns;

/**
 * Toggles a column between collapsed and expanded states
 * Purpose: Show/hide column content for space management
 * Used by: Column fold button clicks
 * @param {string} columnId - ID of column to toggle
 * Side effects: Updates collapsedColumns set, DOM classes
 */
function toggleColumnCollapse(columnId) {
    const column = document.querySelector(`[data-column-id="${columnId}"]`);
    const toggle = column.querySelector('.collapse-toggle');
    
    column.classList.toggle('collapsed');
    toggle.classList.toggle('rotated');
    
    // Ensure state variables are initialized
    if (!window.collapsedColumns) {window.collapsedColumns = new Set();}
    
    // Store state
    const isNowCollapsed = column.classList.contains('collapsed');
    if (isNowCollapsed) {
        window.collapsedColumns.add(columnId);
        
        // Reset height for collapsed column - let it use natural size
        const columnInner = column.querySelector('.column-inner');
        if (columnInner) {
            columnInner.style.minHeight = '';
            columnInner.style.overflowY = 'visible';
        }
        column.style.minHeight = '';
    } else {
        window.collapsedColumns.delete(columnId);
    }
    
    // Save state immediately
    if (window.saveCurrentFoldingState) {
        window.saveCurrentFoldingState();
    }
    
    // Update global fold button after individual column toggle
    setTimeout(() => {
        updateGlobalColumnFoldButton();
        // Re-apply user's fixed height setting after column state change (if not auto)
        if (window.currentRowHeight && window.currentRowHeight !== 'auto') {
            window.applyRowHeight(window.currentRowHeight);
        }
        // For 'auto' mode, CSS handles the layout naturally
    }, 10);
}

// Removed handleColumnBarsOnToggle - no longer needed since we keep same HTML structure

/**
 * Toggles a task between collapsed and expanded states
 * Purpose: Show/hide task description for cleaner view
 * Used by: Task fold button clicks
 * @param {string} taskId - ID of task to toggle
 * Side effects: Updates collapsedTasks set, DOM classes
 */
function toggleTaskCollapse(taskId) {
    const task = document.querySelector(`[data-task-id="${taskId}"]`);
    const toggle = task.querySelector('.task-collapse-toggle');
    
    task.classList.toggle('collapsed');
    toggle.classList.toggle('rotated');
    
    // Ensure state variables are initialized
    if (!window.collapsedTasks) {window.collapsedTasks = new Set();}
    
    // Store state
    if (task.classList.contains('collapsed')) {
        window.collapsedTasks.add(taskId);
    } else {
        window.collapsedTasks.delete(taskId);
    }
    
    // Save state immediately
    if (window.saveCurrentFoldingState) {
        window.saveCurrentFoldingState();
    }
}

// Single function to handle opening links/images/wiki links
function handleLinkOrImageOpen(event, target) {
    const link = target.closest('a');
    const img = target.closest('img');
    const wikiLink = target.closest('.wiki-link');
    
    // Handle wiki links
    if (wikiLink) {
        event.preventDefault();
        event.stopPropagation();
        const documentName = wikiLink.getAttribute('data-document');
        if (documentName) {
            vscode.postMessage({
                type: 'openWikiLink',
                documentName: documentName
            });
        }
        return true;
    }
    
    // Handle regular links
    if (link) {
        event.preventDefault();
        event.stopPropagation();
        const href = link.getAttribute('data-original-href') || link.getAttribute('href');
        if (href && href !== '#') {
            if (href.startsWith('http://') || href.startsWith('https://')) {
                vscode.postMessage({
                    type: 'openExternalLink',
                    href: href
                });
            } else {
                vscode.postMessage({
                    type: 'openFileLink',
                    href: href
                });
            }
        }
        return true;
    }
    
    // Handle images
    if (img) {
        event.preventDefault();
        event.stopPropagation();
        const originalSrc = img.getAttribute('data-original-src') || img.getAttribute('src');
        if (originalSrc && !originalSrc.startsWith('data:')) {
            vscode.postMessage({
                type: 'openFileLink',
                href: originalSrc
            });
        }
        return true;
    }
    
    return false;
}

// Global click handlers that check for Alt key
function handleColumnTitleClick(event, columnId) {
    if (event.altKey) {
        // Alt+click: open link/image
        if (handleLinkOrImageOpen(event, event.target)) {return;}
        return; // Don't edit if Alt is pressed
    }

    // Default: unfold if collapsed, then edit
    event.preventDefault();
    event.stopPropagation();

    const column = document.querySelector(`[data-column-id="${columnId}"]`);
    if (column && column.classList.contains('collapsed')) {
        // Unfold the column first
        toggleColumnCollapse(columnId);
        // Use a short delay to allow the unfold animation to start, then enter edit mode
        setTimeout(() => {
            editColumnTitle(columnId);
        }, 50);
    } else {
        // Column is already unfolded, edit immediately
        editColumnTitle(columnId);
    }
}

function handleTaskTitleClick(event, element, taskId, columnId) {
    if (event.altKey) {
        // Alt+click: open link/image
        if (handleLinkOrImageOpen(event, event.target)) {return;}
        return; // Don't edit if Alt is pressed
    }
    
    // Default: always edit
    event.preventDefault();
    event.stopPropagation();
    editTitle(element, taskId, columnId);
}

function handleDescriptionClick(event, element, taskId, columnId) {
    if (event.altKey) {
        // Alt+click: open link/image
        if (handleLinkOrImageOpen(event, event.target)) {return;}
        return; // Don't edit if Alt is pressed
    }
    
    // Default: always edit
    event.preventDefault();
    event.stopPropagation();
    if (taskId && columnId) {
        editDescription(element, taskId, columnId);
    } else {
        editDescription(element);
    }
}

// Helper function to get tag configuration from grouped or flat structure
function getTagConfig(tagName) {
    if (!window.tagColors) {return null;}
    
    // Skip default configuration
    if (tagName === 'default') {return null;}
    
    // Check grouped structure
    const groups = ['status', 'type', 'priority', 'category', 'colors'];
    for (const group of groups) {
        if (window.tagColors[group] && window.tagColors[group][tagName]) {
            return window.tagColors[group][tagName];
        }
    }
    
    // Check flat structure
    if (window.tagColors[tagName]) {
        return window.tagColors[tagName];
    }
    
    return null;
}

// Generate dynamic CSS for tag colors and additional styles
/**
 * Generates all CSS styles for tag-based theming
 * Purpose: Creates dynamic styles for colors, borders, bars
 * Used by: applyTagStyles() on board render
 * @returns {string} Complete CSS text for all tag styles
 * Note: Handles theme detection, color interpolation
 */
function generateTagStyles() {
    if (!window.tagColors) {
        return '';
    }
    
    const isDarkTheme = document.body.classList.contains('vscode-dark') || 
                        document.body.classList.contains('vscode-high-contrast');
    const themeKey = isDarkTheme ? 'dark' : 'light';
    
    let styles = '';
    
    // Add base styles for corner badges
    styles += `.corner-badge {
        position: absolute;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 11px;
        z-index: 50;
        pointer-events: none;
        transition: all 0.2s ease;
    }\n`;
    
    // Add default styles for elements without tags only when explicitly enabled
    if (window.tagColors.default) {
        const defaultConfig = window.tagColors.default;

        // Default column styles (gated)
        if (defaultConfig.column && (defaultConfig.column.applyBackground === true || defaultConfig.column.enable === true)) {
            const columnColors = defaultConfig.column[themeKey] || defaultConfig.column.light || {};
            if (columnColors.text && columnColors.background) {
                const editorBg = getComputedStyle(document.documentElement).getPropertyValue('--vscode-editor-background') || '#ffffff';
                const bgDark = columnColors.backgroundDark || columnColors.background;
                
                const columnBg = interpolateColor(editorBg, bgDark, 0.15);
                
                // Default column header background
                styles += `.kanban-full-height-column:not([data-column-tag]) .column-header {
                    background-color: ${columnBg} !important;
                }\n`;
                
                // Default column content background
                styles += `.kanban-full-height-column:not([data-column-tag]) .column-content {
                    background-color: ${columnBg} !important;
                }\n`;

                const columnCollapsedBg = interpolateColor(editorBg, bgDark, 0.2);
                
                // Default collapsed column header background
                styles += `.kanban-full-height-column.collapsed:not([data-column-tag]) .column-header {
                    background-color: ${columnCollapsedBg} !important;
                }\n`;
            }
        }

        // Default card styles (gated)
        if (defaultConfig.card && (defaultConfig.card.applyBackground === true || defaultConfig.card.enable === true)) {
            const cardColors = defaultConfig.card[themeKey] || defaultConfig.card.light || {};
            if (cardColors.text && cardColors.background) {
                const editorBg = getComputedStyle(document.documentElement).getPropertyValue('--vscode-editor-background') || '#ffffff';
                const bgDark = cardColors.backgroundDark || cardColors.background;
                
                const cardBg = interpolateColor(editorBg, bgDark, 0.25);
                styles += `.task-item:not([data-task-tag]) {
                    background-color: ${cardBg} !important;
                    position: relative;
                }\n`;

                const cardHoverBg = interpolateColor(editorBg, bgDark, 0.35);
                styles += `.task-item:not([data-task-tag]):hover {
                    background-color: ${cardHoverBg} !important;
                }\n`;
            }
        }

        // Default card border (always allowed if provided)
        if (defaultConfig.card && defaultConfig.card.border) {
            const b = defaultConfig.card.border;
            const bStyle = b.style || 'solid';
            const bWidth = b.width || '1px';
            const bColor = b.color || 'var(--vscode-panel-border)';
            if (b.position === 'left') {
                styles += `.task-item:not([data-task-tag]) { border-left: ${bWidth} ${bStyle} ${bColor} !important; }\n`;
            } else {
                styles += `.task-item:not([data-task-tag]) { border: ${bWidth} ${bStyle} ${bColor} !important; }\n`;
            }
        }
    }
    
    // Function to process tags from either grouped or flat structure
    const processTags = (tags, groupName = null) => {
        for (const [tagName, config] of Object.entries(tags)) {
            // Skip the default configuration
            if (tagName === 'default') {continue;}
            
            // Skip if this is a group (has nested objects with light/dark themes)
            if (config.light || config.dark) {
                const themeColors = config[themeKey] || config.light || {};
                if (themeColors.text && themeColors.background) {
                    const lowerTagName = tagName.toLowerCase();
                    
                    // Tag pill styles (the tag text itself)
                    styles += `.kanban-tag[data-tag="${lowerTagName}"] {
                        color: ${themeColors.text} !important;
                        background-color: ${themeColors.background} !important;
                        border: 1px solid ${themeColors.background};
                    }\n`;
                    
                    // Get the base background color (or use editor background as default)
                    const editorBg = getComputedStyle(document.documentElement).getPropertyValue('--vscode-editor-background') || '#ffffff';
                    const bgDark = themeColors.backgroundDark || themeColors.background;
                    
                    // Column background styles - only for primary tag
                    // Interpolate 15% towards the darker color
                    const columnBg = interpolateColor(editorBg, bgDark, 0.15);
                    
                    // Column header background
                    styles += `.kanban-full-height-column[data-column-tag="${lowerTagName}"] .column-header {
                        background-color: ${columnBg} !important;
                    }\n`;
                    
                    // Column content background  
                    styles += `.kanban-full-height-column[data-column-tag="${lowerTagName}"] .column-content {
                        background-color: ${columnBg} !important;
                    }\n`;
                    
                    // Column collapsed state - interpolate 20% towards the darker color
                    const columnCollapsedBg = interpolateColor(editorBg, bgDark, 0.2);
                    
                    // Collapsed column header background
                    styles += `.kanban-full-height-column.collapsed[data-column-tag="${lowerTagName}"] .column-header {
                        background-color: ${columnCollapsedBg} !important;
                    }\n`;
                    
                    // Card background styles - only for primary tag
                    // Interpolate 25% towards the darker color
                    const cardBg = interpolateColor(editorBg, bgDark, 0.25);
                    styles += `.task-item[data-task-tag="${lowerTagName}"] {
                        background-color: ${cardBg} !important;
                        position: relative;
                    }\n`;
                    
                    // Card hover state - interpolate 35% towards the darker color
                    const cardHoverBg = interpolateColor(editorBg, bgDark, 0.35);
                    styles += `.task-item[data-task-tag="${lowerTagName}"]:hover {
                        background-color: ${cardHoverBg} !important;
                    }\n`;
                    
                    // Stackable border styles using data-all-tags
                    if (config.border) {
                        const borderColor = config.border.color || themeColors.background;
                        const borderWidth = config.border.width || '2px';
                        const borderStyle = config.border.style || 'solid';
                        
                        if (config.border.position === 'left') {
                            // Use data-column-tag for left border on column-inner only
                            styles += `.kanban-full-height-column[data-column-tag="${lowerTagName}"] .column-inner {
                                border-left: ${borderWidth} ${borderStyle} ${borderColor} !important;
                            }\n`;
                            styles += `.task-item[data-task-tag="${lowerTagName}"] {
                                border-left: ${borderWidth} ${borderStyle} ${borderColor} !important;
                            }\n`;
                        } else {
                            // Full border split the border for top and bottom part
                            styles += `.kanban-full-height-column[data-column-tag="${lowerTagName}"] .column-inner {
                                border-left: ${borderWidth} ${borderStyle} ${borderColor} !important;
                                border-right: ${borderWidth} ${borderStyle} ${borderColor} !important;
                                border-bottom: ${borderWidth} ${borderStyle} ${borderColor} !important;
                            }\n
														.kanban-full-height-column[data-column-tag="${lowerTagName}"] .column-header {
                                border-left: ${borderWidth} ${borderStyle} ${borderColor} !important;
                                border-right: ${borderWidth} ${borderStyle} ${borderColor} !important;
                                border-top: ${borderWidth} ${borderStyle} ${borderColor} !important;
                            }\n`;
                            styles += `.task-item[data-task-tag="${lowerTagName}"] {
                                border: ${borderWidth} ${borderStyle} ${borderColor} !important;
                            }\n`;
                        }
                    }
                    
                    // Stackable header bar with text
                    if (config.headerBar) {
                        const headerColor = config.headerBar.color || themeColors.background;
                        const headerHeight = config.headerBar.label ? '20px' : (config.headerBar.height || '4px');
                        const headerText = config.headerBar.label || '';
                        const headerTextColor = config.headerBar.labelColor || themeColors.text;
                        
                        // Create a unique class for this header bar - always solid color
                        styles += `.header-bar-${lowerTagName} {
                            position: absolute;
                            left: 0;
                            right: 0;
                            height: ${headerHeight};
                            background: ${headerColor};
                            z-index: 1;
                            ${headerText ? `
                                color: ${headerTextColor};
                                font-size: 10px;
                                font-weight: bold;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                            ` : ''}
                        }\n`;
                        
                        if (headerText) {
                            styles += `.header-bar-${lowerTagName}::after {
                                content: '${headerText}';
                            }\n`;
                            
                            // Collapsed state with label - needs full height
                            styles += `.kanban-full-height-column.collapsed .header-bar-${lowerTagName} {
                                height: 20px !important;
                                padding: 0 2px !important;
                            }\n`;
                        } else {
                            // Collapsed state without label - keep original height
                            styles += `.kanban-full-height-column.collapsed .header-bar-${lowerTagName} {
                                height: ${headerHeight} !important;
                            }\n`;
                        }
                    }
                    
                    // Stackable footer bar with text
                    if (config.footerBar) {
                        const footerColor = config.footerBar.color || themeColors.background;
                        const footerHeight = config.footerBar.label ? '20px' : (config.footerBar.height || '3px');
                        const footerText = config.footerBar.label || '';
                        const footerTextColor = config.footerBar.labelColor || themeColors.text;
                        
                        // Create a unique class for this footer bar
                        styles += `.footer-bar-${lowerTagName} {
                            position: absolute;
                            left: 0;
                            right: 0;
                            height: ${footerHeight};
                            background: ${footerColor};
                            z-index: 1;
                            ${footerText ? `
                                color: ${footerTextColor};
                                font-size: 10px;
                                font-weight: bold;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                            ` : ''}
                        }\n`;
                        
                        if (footerText) {
                            styles += `.footer-bar-${lowerTagName}::after {
                                content: '${footerText}';
                            }\n`;
                            
                            // Collapsed state with label - needs full height
                            styles += `.kanban-full-height-column.collapsed .footer-bar-${lowerTagName} {
                                height: 20px !important;
                                padding: 0 2px !important;
                            }\n`;
                        } else {
                            // Collapsed state without label - keep original height
                            styles += `.kanban-full-height-column.collapsed .footer-bar-${lowerTagName} {
                                height: ${footerHeight} !important;
                            }\n`;
                        }
                    }
                    
                    // Corner badge styles with image support
                    if (config.cornerBadge) {
                        const badgeColor = config.cornerBadge.color || themeColors.background;
                        const badgeTextColor = config.cornerBadge.labelColor || themeColors.text;
                        const badgeStyle = config.cornerBadge.style || 'circle';
                        const badgeImage = config.cornerBadge.image || '';
                        
                        let shapeStyles = '';
                        switch (badgeStyle) {
                            case 'circle':
                                shapeStyles = 'width: 20px; height: 20px; border-radius: 50%;';
                                break;
                            case 'square':
                                shapeStyles = 'width: 20px; height: 20px; border-radius: 3px;';
                                break;
                            case 'ribbon':
                                shapeStyles = 'padding: 2px 8px; border-radius: 3px; min-width: 20px;';
                                break;
                        }
                        
                        styles += `.corner-badge-${lowerTagName} {
                            ${shapeStyles}
                            background: ${badgeColor} !important;
                            color: ${badgeTextColor} !important;
                            ${badgeImage ? `
                                background-image: url('${badgeImage}') !important;
                                background-size: contain;
                                background-repeat: no-repeat;
                                background-position: center;
                            ` : ''}
                        }\n`;
                    }
                }
            }
        }
    };
    
    // Check if we have grouped structure
    const isGrouped = window.tagColors.status || window.tagColors.type || 
                     window.tagColors.priority || window.tagColors.category || 
                     window.tagColors.colors;
    
    if (isGrouped) {
        // Process each group
        const groups = ['status', 'type', 'priority', 'category', 'colors'];
        groups.forEach(groupName => {
            if (window.tagColors[groupName]) {
                processTags(window.tagColors[groupName], groupName);
            }
        });
    } else {
        // Process flat structure
        processTags(window.tagColors);
    }
    
    return styles;
}

// Function to inject header, footer bars, and border text after render
// Modified injectStackableBars function
function injectStackableBars(targetElement = null) {
    let elementsToProcess;
    if (targetElement) {
        // Always process the target element (even without data-all-tags) to clean up existing bars
        elementsToProcess = [targetElement];
    } else {
        elementsToProcess = document.querySelectorAll('[data-all-tags]');
    }

    elementsToProcess.forEach(element => {
        const allTagsAttr = element.getAttribute('data-all-tags');
        const tags = allTagsAttr ? allTagsAttr.split(' ').filter(tag => tag.trim()) : [];
        const isColumn = element.classList.contains('kanban-full-height-column');
        const isCollapsed = isColumn && element.classList.contains('collapsed');
        
        // Remove existing bars/containers - only from appropriate areas
        if (isColumn) {
            // For columns: only remove from column-header and column-footer, not from nested task cards
            const columnHeader = element.querySelector('.column-header');
            if (columnHeader) {
                columnHeader.querySelectorAll('.header-bar, .header-bars-container').forEach(el => el.remove());
            }
            const columnFooter = element.querySelector('.column-footer');
            if (columnFooter) {
                columnFooter.querySelectorAll('.footer-bar, .footer-bars-container').forEach(el => el.remove());
            }
            // Also remove any direct children that are visual elements (for collapsed state)
            Array.from(element.children).forEach(child => {
                if (child.classList.contains('header-bar') ||
                    child.classList.contains('footer-bar') ||
                    child.classList.contains('header-bars-container') ||
                    child.classList.contains('footer-bars-container')) {
                    child.remove();
                }
            });
        } else {
            // For non-column elements (tasks), safe to remove all
            element.querySelectorAll('.header-bar, .footer-bar, .header-bars-container, .footer-bars-container').forEach(bar => bar.remove());
        }
        
        // Also remove old classes
        element.classList.remove('has-header-bar', 'has-footer-bar', 'has-header-label', 'has-footer-label');
        
        let headerBars = [];
        let footerBars = [];
        let hasHeaderLabel = false;
        let hasFooterLabel = false;
        
        // Collect header and footer bars
        tags.forEach(tag => {
            const config = getTagConfig(tag);
            
            if (config && config.headerBar) {
                const headerBar = document.createElement('div');
                headerBar.className = `header-bar header-bar-${tag}`;
                
                if (!isCollapsed) {
                    // Only use absolute positioning for non-collapsed elements
                    const height = config.headerBar.label ? 20 : parseInt(config.headerBar.height || '4px');
                    headerBar.style.top = `${headerBars.reduce((sum, bar) => {
                        const barTag = bar.className.match(/header-bar-(\S+)/)?.[1];
                        const barConfig = getTagConfig(barTag);
                        return sum + (barConfig?.headerBar?.label ? 20 : parseInt(barConfig?.headerBar?.height || '4px'));
                    }, 0)}px`;
                }
                
                headerBars.push(headerBar);
                if (config.headerBar.label) {hasHeaderLabel = true;}
            }
            
            if (config && config.footerBar) {
                const footerBar = document.createElement('div');
                footerBar.className = `footer-bar footer-bar-${tag}`;
                
                if (!isCollapsed) {
                    // Only use absolute positioning for non-collapsed elements
                    const height = config.footerBar.label ? 20 : parseInt(config.footerBar.height || '3px');
                    footerBar.style.bottom = `${footerBars.reduce((sum, bar) => {
                        const barTag = bar.className.match(/footer-bar-(\S+)/)?.[1];
                        const barConfig = getTagConfig(barTag);
                        return sum + (barConfig?.footerBar?.label ? 20 : parseInt(barConfig?.footerBar?.height || '3px'));
                    }, 0)}px`;
                }
                
                footerBars.push(footerBar);
                if (config.footerBar.label) {hasFooterLabel = true;}
            }
        });
        
        // Handle collapsed columns with flex containers
        if (isCollapsed) {
            // Find the column-inner element to insert bars into
            // const columnInner = element.querySelector('.column-inner');
						const kanbanFullHeight = element.querySelector('.kanban-full-height-column');
						const columnHeader = element.querySelector('.column-header');
            
            // Create and insert header container at the beginning of column-inner
            if (headerBars.length > 0 && kanbanFullHeight) {
                const headerContainer = document.createElement('div');
                headerContainer.className = 'header-bars-container';
                headerBars.forEach(bar => headerContainer.appendChild(bar));
                columnHeader.insertBefore(headerContainer, columnHeader.firstChild);
                element.classList.add('has-header-bar');
                if (hasHeaderLabel) {element.classList.add('has-header-label');}
            }
            
            // Create and append footer container at the end of column-inner
            if (footerBars.length > 0 && kanbanFullHeight) {
                const footerContainer = document.createElement('div');
                footerContainer.className = 'footer-bars-container';
                footerBars.forEach(bar => footerContainer.appendChild(bar));
                kanbanFullHeight.appendChild(footerContainer);
                element.classList.add('has-footer-bar');
                if (hasFooterLabel) {element.classList.add('has-footer-label');}
            }
            
            // Clear any inline padding styles for collapsed columns
            element.style.paddingTop = '';
            element.style.paddingBottom = '';
            
        } else {
            // For non-collapsed elements, use column-header and column-footer
            const columnHeader = element.querySelector('.column-header');
            const columnFooter = element.querySelector('.column-footer');

            if (columnHeader) {
                // Create and insert header container at the beginning of column-header
                if (headerBars.length > 0) {
                    const headerContainer = document.createElement('div');
                    headerContainer.className = 'header-bars-container';
                    headerBars.forEach(bar => headerContainer.appendChild(bar));
                    columnHeader.insertBefore(headerContainer, columnHeader.firstChild);
                }
            }

            if (columnFooter) {
                // Create and append footer container to column-footer
                if (footerBars.length > 0) {
                    const footerContainer = document.createElement('div');
                    footerContainer.className = 'footer-bars-container';
                    footerBars.forEach(bar => footerContainer.appendChild(bar));
                    columnFooter.appendChild(footerContainer);
                }
            } 
						
						// For task items, use appendChild and rely on CSS flexbox order
						if (element.classList.contains('task-item')) {
								// Create header container and append (CSS order: -1 will position it first)
								if (headerBars.length > 0) {
										const headerContainer = document.createElement('div');
										headerContainer.className = 'header-bars-container';
										headerBars.forEach(bar => headerContainer.appendChild(bar));
										element.appendChild(headerContainer);
								}

								// Create footer container and append at the end
								if (footerBars.length > 0) {
										const footerContainer = document.createElement('div');
										footerContainer.className = 'footer-bars-container';
										footerBars.forEach(bar => footerContainer.appendChild(bar));
										element.appendChild(footerContainer);
								}
						} else {
								// Fallback for other elements
								headerBars.forEach(bar => element.appendChild(bar));
								footerBars.forEach(bar => element.appendChild(bar));
						}
            
            // Set CSS classes for header bars (no padding needed with flex layout)
            if (headerBars.length > 0) {
                element.classList.add('has-header-bar');
                if (hasHeaderLabel) {element.classList.add('has-header-label');}
            }
            
            // Set CSS classes for footer bars (no padding needed with flex layout)
            if (footerBars.length > 0) {
                element.classList.add('has-footer-bar');
                if (hasFooterLabel) {element.classList.add('has-footer-label');}
            }
        }
    });
}

// Helper function to check if dark theme
function isDarkTheme() {
    return document.body.classList.contains('vscode-dark') || 
           document.body.classList.contains('vscode-high-contrast');
}

// Make functions globally available
window.handleColumnTitleClick = handleColumnTitleClick;
window.handleTaskTitleClick = handleTaskTitleClick;
window.handleDescriptionClick = handleDescriptionClick;

window.getActiveTagsInTitle = getActiveTagsInTitle;
window.generateTagMenuItems = generateTagMenuItems;
window.generateGroupTagItems = generateGroupTagItems;
window.generateFlatTagItems = generateFlatTagItems;

window.getTagConfig = getTagConfig;

// Function to remove all tags from a card or column
/**
 * Removes all tags from a column or task
 * Purpose: Bulk tag removal operation
 * Used by: 'Remove all tags' menu option
 * @param {string} id - Element ID
 * @param {string} type - 'column' or 'task'
 * @param {string} columnId - Parent column for tasks
 * Side effects: Updates pending changes, triggers save
 */
function removeAllTags(id, type, columnId = null) {
    
    // Get current title
    let currentTitle = '';
    let element = null;
    
    if (type === 'column') {
        const column = currentBoard?.columns?.find(c => c.id === id);
        if (column) {
            currentTitle = column.title || '';
            element = column;
        }
    } else if (type === 'task' && columnId) {
        const column = currentBoard?.columns?.find(c => c.id === columnId);
        const task = column?.tasks?.find(t => t.id === id);
        if (task) {
            currentTitle = task.title || '';
            element = task;
        }
    }
    
    if (!element) {
        return;
    }
    
    // Remove all tags from the title (keep everything except tags)
    // Tags are in format #tagname, but preserve #row tags and #span tags
    const newTitle = currentTitle.replace(/#(?!row\d+\b)(?!span\d+\b)[a-zA-Z0-9_-]+(?:[&|=><][a-zA-Z0-9_-]+)*/g, '').trim();
    
    // Update the element
    element.title = newTitle;
    
    // Store the change in pending changes
    if (type === 'column') {
        if (!window.pendingColumnChanges) {
            window.pendingColumnChanges = new Map();
        }
        window.pendingColumnChanges.set(id, { title: newTitle, columnId: id });
        
        // Update display immediately
        if (typeof updateColumnDisplayImmediate === 'function') {
            updateColumnDisplayImmediate(id, newTitle, false, '');
        }
    } else if (type === 'task') {
        if (!window.pendingTaskChanges) {
            window.pendingTaskChanges = new Map();
        }
        const task = element; // element is the task object from line 2228
        task.title = newTitle; // Update the task title
        window.pendingTaskChanges.set(id, { taskId: id, columnId: columnId, taskData: task });
        
        // Update display immediately
        if (typeof updateTaskDisplayImmediate === 'function') {
            updateTaskDisplayImmediate(id, newTitle, false, '');
        }
    }
    
    // Update refresh button state
    const totalPending = (window.pendingColumnChanges?.size || 0) + (window.pendingTaskChanges?.size || 0);
    if (typeof updateRefreshButtonState === 'function') {
        updateRefreshButtonState('unsaved', totalPending);
    }
    
    // Update tag category counts if menu is still open
    if (typeof updateTagCategoryCounts === 'function') {
        updateTagCategoryCounts(id, type, columnId);
    }
    
    // Close the menu
    if (typeof closeAllMenus === 'function') {
        closeAllMenus();
    } else {
        document.querySelectorAll('.donut-menu').forEach(menu => menu.classList.remove('active'));
    }
    
}

window.removeAllTags = removeAllTags;

// TODO: These functions are not defined - commenting out to prevent errors
// window.getAllHeaderBarsHtml = getAllHeaderBarsHtml;
// window.getAllFooterBarsHtml = getAllFooterBarsHtml;
window.injectStackableBars = injectStackableBars;
window.isDarkTheme = isDarkTheme;

window.getAllTagsInUse = getAllTagsInUse;
window.getUserAddedTags = getUserAddedTags;

// window.handleColumnBarsOnToggle = handleColumnBarsOnToggle; // Removed - no longer needed
window.handleLinkOrImageOpen = handleLinkOrImageOpen;

// Function to calculate and apply row heights based on tallest column
// Removed calculateAndApplyRowHeights and calculateRowHeight functions
// Height management is now handled by:
// 1. CSS flexbox for 'auto' mode (natural layout)
// 2. applyRowHeight() for user-defined heights (vh, px, em)
