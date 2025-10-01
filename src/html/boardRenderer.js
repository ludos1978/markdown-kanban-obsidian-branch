let scrollPositions = new Map();

// Make folding state variables global for persistence
window.collapsedColumns = window.collapsedColumns || new Set();
window.collapsedTasks = window.collapsedTasks || new Set();
window.columnFoldStates = window.columnFoldStates || new Map(); // Track last manual fold state for each column
window.globalColumnFoldState = window.globalColumnFoldState || 'fold-mixed'; // Track global column fold state

// Use global window.window.currentBoard instead of local variable
// let window.currentBoard = null; // Removed to avoid conflicts
let renderTimeout = null;

// extractFirstTag function now in utils/tagUtils.js


// Import colorUtils at the top of the file (will be included via HTML)
// The colorUtils module provides: hexToRgb, rgbToHex, withAlpha, etc.


/**
 * Legacy wrapper for backward compatibility - delegates to colorUtils
 * @deprecated Use colorUtils.interpolateColor() instead
 */
function interpolateColor(color1, color2, factor) {
    return colorUtils.interpolateColor(color1, color2, factor);
}

/**
 * Wraps rendered HTML content in task-section divs for keyboard navigation
 * Sections are separated by <hr> tags
 * @param {string} html - Rendered HTML content
 * @returns {string} HTML with sections wrapped
 */
function wrapTaskSections(html) {
    if (!html || !html.trim()) {
        return html;
    }

    // Create a temporary container to parse the HTML
    const temp = document.createElement('div');
    temp.innerHTML = html;

    const hrs = Array.from(temp.querySelectorAll('hr'));

    if (hrs.length === 0) {
        // No HRs: wrap entire content in a section
        return `<div class="task-section" tabindex="0">${html}</div>`;
    }

    // Has HRs: wrap sections between HRs
    const sections = [];
    let currentSection = [];

    Array.from(temp.childNodes).forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'HR') {
            // Save current section if it has content
            if (currentSection.length > 0) {
                sections.push({ type: 'section', nodes: currentSection });
                currentSection = [];
            }
            sections.push({ type: 'hr', node: node });
        } else {
            currentSection.push(node);
        }
    });

    // Don't forget the last section
    if (currentSection.length > 0) {
        sections.push({ type: 'section', nodes: currentSection });
    }

    // Build HTML string
    return sections.map(section => {
        if (section.type === 'hr') {
            return section.node.outerHTML;
        } else {
            const sectionHtml = section.nodes.map(node =>
                node.nodeType === Node.ELEMENT_NODE ? node.outerHTML : node.textContent
            ).join('');
            return `<div class="task-section" tabindex="0">${sectionHtml}</div>`;
        }
    }).join('');
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
.kanban-full-height-column[data-column-tag="${tagName}"] .column-footer,
.kanban-full-height-column[data-all-tags~="${tagName}"] .column-footer {
    background-color: ${columnBg} !important;
}
.kanban-full-height-column.collapsed[data-column-tag="${tagName}"] .column-header,
.kanban-full-height-column.collapsed[data-all-tags~="${tagName}"] .column-header {
    background-color: ${columnCollapsedBg} !important;
}
.kanban-full-height-column.collapsed[data-column-tag="${tagName}"] .column-footer,
.kanban-full-height-column.collapsed[data-all-tags~="${tagName}"] .column-footer {
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

/**
 * Extract the first tag from text (boardRenderer.js internal use)
 * @param {string} text - Text to extract tag from
 * @returns {string|null} First tag or null
 */
function extractFirstTag(text) {
    if (!text) {
        return null;
    }

    // Use boardRenderer.js compatible regex with exclusions
    const re = /#(?!row\d+\b)(?!span\d+\b)([a-zA-Z0-9_-]+(?:[=|><][a-zA-Z0-9_-]+)*)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const raw = m[1];
        const baseMatch = raw.match(/^([a-zA-Z0-9_-]+)/);
        const base = (baseMatch ? baseMatch[1] : raw).toLowerCase();
        if (base.startsWith('gather_')) {
            continue; // do not use gather tags for styling
        }
        return base;
    }
    return null;
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
    if (!window.currentBoard || !window.currentBoard.columns || window.currentBoard.columns.length === 0) {return;}

    // Ensure folding state variables are initialized
    if (!window.collapsedColumns) {window.collapsedColumns = new Set();}
    if (!window.columnFoldModes) {window.columnFoldModes = new Map();}

    window.currentBoard.columns.forEach(column => {
        const hasNoTasks = !column.tasks || column.tasks.length === 0;
        const columnElement = document.querySelector(`[data-column-id="${column.id}"]`);
        const toggle = columnElement?.querySelector('.collapse-toggle');

        if (hasNoTasks) {
            // Empty columns should be collapsed by default
            window.collapsedColumns.add(column.id);
            const foldMode = getDefaultFoldMode(column.id);
            window.columnFoldModes.set(column.id, foldMode);
            if (foldMode === 'vertical') {
                columnElement?.classList.add('collapsed');
            } else {
                columnElement?.classList.add('collapsed-horizontal');
            }
            toggle?.classList.add('rotated');
        } else {
            // Non-empty columns should be expanded by default
            window.collapsedColumns.delete(column.id);
            window.columnFoldModes.delete(column.id);
            columnElement?.classList.remove('collapsed', 'collapsed-horizontal');
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
    if (!window.currentBoard || !window.currentBoard.columns || window.currentBoard.columns.length === 0) {return;}
    
    // Ensure folding state variables are initialized
    if (!window.collapsedColumns) {window.collapsedColumns = new Set();}
    
    window.currentBoard.columns.forEach(column => {
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
    if (!window.currentBoard || !window.currentBoard.columns || window.currentBoard.columns.length === 0) {
        return 'fold-mixed';
    }
    
    // Count columns with tasks that are collapsed
    const columnsWithTasks = window.currentBoard.columns.filter(column => column.tasks && column.tasks.length > 0);
    const emptyColumns = window.currentBoard.columns.filter(column => !column.tasks || column.tasks.length === 0);
    
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
    if (!window.currentBoard || !window.currentBoard.columns || window.currentBoard.columns.length === 0) {return;}
    
    // Ensure state variables are initialized
    if (!window.collapsedColumns) {window.collapsedColumns = new Set();}
    
    const currentState = getGlobalColumnFoldState();
    const collapsedCount = window.currentBoard.columns.filter(column => window.collapsedColumns.has(column.id)).length;
    const totalColumns = window.currentBoard.columns.length;
    
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
        // When collapsing, collapse all columns with their default fold mode
        if (!window.columnFoldModes) {window.columnFoldModes = new Map();}
        window.currentBoard.columns.forEach(column => {
            const columnElement = document.querySelector(`[data-column-id="${column.id}"]`);
            const toggle = columnElement?.querySelector('.collapse-toggle');

            window.collapsedColumns.add(column.id);
            const foldMode = getDefaultFoldMode(column.id);
            window.columnFoldModes.set(column.id, foldMode);
            if (foldMode === 'vertical') {
                columnElement?.classList.add('collapsed');
            } else {
                columnElement?.classList.add('collapsed-horizontal');
            }
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
    
    if (!window.currentBoard || !window.currentBoard.columns) {
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
            // Get fold mode from map, or use default based on stack status
            const foldMode = window.columnFoldModes?.get(columnId) || getDefaultFoldMode(columnId);
            if (foldMode === 'vertical') {
                columnElement.classList.add('collapsed');
            } else {
                columnElement.classList.add('collapsed-horizontal');
            }
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
    if (window.currentBoard && window.currentBoard.columns) {
        window.currentBoard.columns.forEach(column => {
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
    
    if (!window.currentBoard || !window.currentBoard.columns) {return tagsInUse;}
    
    // Collect tags from all columns and tasks
    window.currentBoard.columns.forEach(column => {
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

    // Debug: Check if tagColors is available

    const userAddedTags = getUserAddedTags();
    
    // Get current title to check which tags are active
    let currentTitle = '';
    if (type === 'column') {
        const column = window.currentBoard?.columns?.find(c => c.id === id);
        currentTitle = column?.title || '';
    } else if (type === 'task' && columnId) {
        const column = window.currentBoard?.columns?.find(c => c.id === columnId);
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
        const column = window.currentBoard?.columns?.find(c => c.id === id);
        currentTitle = column?.title || '';
    } else if (type === 'task' && columnId) {
        const column = window.currentBoard?.columns?.find(c => c.id === columnId);
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
                } else {
                }
            } else {
                if (typeof handleTaskTagClick === 'function') {
                    handleTaskTagClick(id, columnId, tagName, event);
                } else if (typeof window.handleTaskTagClick === 'function') {
                    window.handleTaskTagClick(id, columnId, tagName, event);
                } else {
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
        const column = window.currentBoard?.columns?.find(c => c.id === id);
        currentTitle = column?.title || '';
    } else if (type === 'task' && columnId) {
        const column = window.currentBoard?.columns?.find(c => c.id === columnId);
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


/**
 * Render a single column - used for targeted updates of include columns
 * Purpose: Updates just one column without losing overall board state
 * Used by: Include file changes, targeted column updates
 * Side effects: Updates DOM for specific column, preserves styles
 */
function renderSingleColumn(columnId, columnData) {

    // Find the existing column element
    const existingColumnElement = document.querySelector(`[data-column-id="${columnId}"]`);
    if (!existingColumnElement) {
        return;
    }

    // Clean up old tag handlers for this column to prevent memory leaks
    if (window.tagHandlers) {
        // Find all tag handlers that belong to this column (both column tags and task tags)
        const handlersToCleanup = Object.keys(window.tagHandlers).filter(key => {
            // Pattern: tag-chip-column-{columnId}-{tagName} or tag-chip-task-{taskId}-{tagName}
            return key.startsWith(`tag-chip-column-${columnId}-`) ||
                   (key.startsWith(`tag-chip-task-`) && existingColumnElement.querySelector(`[data-task-id]`));
        });

        // Also find task handlers by checking actual task IDs in the existing column
        const taskElements = existingColumnElement.querySelectorAll('[data-task-id]');
        taskElements.forEach(taskEl => {
            const taskId = taskEl.getAttribute('data-task-id');
            const taskHandlerPrefix = `tag-chip-task-${taskId}-`;
            Object.keys(window.tagHandlers).forEach(key => {
                if (key.startsWith(taskHandlerPrefix)) {
                    handlersToCleanup.push(key);
                }
            });
        });

        // Remove duplicates and clean up
        const uniqueHandlers = [...new Set(handlersToCleanup)];
        uniqueHandlers.forEach(key => {
            delete window.tagHandlers[key];
        });
    }

    // Get the column index to maintain positioning
    const allColumns = Array.from(document.querySelectorAll('[data-column-id]'));
    const columnIndex = allColumns.indexOf(existingColumnElement);

    // Create new column element
    const newColumnElement = createColumnElement(columnData, columnIndex);

    // Preserve scroll position
    const tasksContainer = existingColumnElement.querySelector(`#tasks-${columnId}`);
    const scrollTop = tasksContainer ? tasksContainer.scrollTop : 0;

    // Replace the old element with the new one
    existingColumnElement.parentNode.replaceChild(newColumnElement, existingColumnElement);

    // Restore scroll position
    const newTasksContainer = newColumnElement.querySelector(`#tasks-${columnId}`);
    if (newTasksContainer) {
        newTasksContainer.scrollTop = scrollTop;
    }

    // Apply current column state (collapsed/expanded)
    if (window.collapsedColumns && window.collapsedColumns.has(columnId)) {
        newColumnElement.classList.add('collapsed');
        const toggle = newColumnElement.querySelector('.collapse-toggle');
        if (toggle) {
            toggle.classList.add('rotated');
        }
    }

    // Update image sources for the new content
    if (typeof updateImageSources === 'function') {
        updateImageSources();
    }

    // Re-initialize drag & drop for the new column elements
    // Since we replaced the entire column DOM element, we need to re-setup all drag & drop
    // handlers that were attached to the old element and its children

    // Setup drag handles for tasks in this column
    newColumnElement.querySelectorAll('.task-drag-handle').forEach(handle => {
        if (typeof setupTaskDragHandle === 'function') {
            setupTaskDragHandle(handle);
        }
    });

    // Re-setup drag & drop for all columns and tasks to ensure event handlers are properly attached
    // This is needed because setupTaskDragAndDrop() also sets up drop zones on the tasks container
    if (typeof setupTaskDragAndDrop === 'function') {
        setupTaskDragAndDrop();
    }

    if (typeof setupColumnDragAndDrop === 'function') {
        setupColumnDragAndDrop();
    }

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

    // Ensure window.currentBoard is synced with cachedBoard for operations like tag toggling
    if (window.cachedBoard && window.cachedBoard !== window.currentBoard) {
        window.currentBoard = window.cachedBoard;
    }

    if (!window.currentBoard) {
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

    if (!window.currentBoard.columns) {
        window.currentBoard.columns = [];
    }
    
    // Save current scroll positions
    document.querySelectorAll('.tasks-container').forEach(container => {
        const columnId = container.id.replace('tasks-', '');
        scrollPositions.set(columnId, container.scrollTop);
    });

    boardElement.innerHTML = '';

    // Check if board is valid (has proper kanban header)
    if (window.currentBoard.valid === false) {
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
    const detectedRows = detectRowsFromBoard(window.currentBoard);
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
            
            // Add columns for this row with stacking support
            let currentStackContainer = null;
            let lastColumnElement = null;

            window.currentBoard.columns.forEach((column, index) => {
                const columnRow = getColumnRow(column.title);
                if (columnRow === row) {
                    const columnElement = createColumnElement(column, index);
                    const isStacked = /#stack\b/i.test(column.title);

                    if (isStacked && lastColumnElement) {
                        // This column should be stacked below the previous one
                        if (!currentStackContainer) {
                            // Create a new stack container and move the previous column into it
                            currentStackContainer = document.createElement('div');
                            currentStackContainer.className = 'kanban-column-stack';

                            // Replace the previous column with the stack container
                            lastColumnElement.parentNode.replaceChild(currentStackContainer, lastColumnElement);
                            currentStackContainer.appendChild(lastColumnElement);
                        }

                        // Add the current stacked column to the stack
                        currentStackContainer.appendChild(columnElement);
                    } else {
                        // Regular column - add to row and reset stack container
                        rowContainer.appendChild(columnElement);
                        currentStackContainer = null;
                        lastColumnElement = columnElement;
                    }
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
        // Single row layout with stacking support
        boardElement.classList.remove('multi-row');

        let currentStackContainer = null;
        let lastColumnElement = null;

        window.currentBoard.columns.forEach((column, index) => {
            const columnElement = createColumnElement(column, index);
            const isStacked = /#stack\b/i.test(column.title);

            if (isStacked && lastColumnElement) {
                // This column should be stacked below the previous one
                if (!currentStackContainer) {
                    // Create a new stack container and move the previous column into it
                    currentStackContainer = document.createElement('div');
                    currentStackContainer.className = 'kanban-column-stack';

                    // Replace the previous column with the stack container
                    lastColumnElement.parentNode.replaceChild(currentStackContainer, lastColumnElement);
                    currentStackContainer.appendChild(lastColumnElement);
                }

                // Add the current stacked column to the stack
                currentStackContainer.appendChild(columnElement);
            } else {
                // Regular column - add to board and reset stack container
                boardElement.appendChild(columnElement);
                currentStackContainer = null;
                lastColumnElement = columnElement;
            }
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

    // Inject header/footer bars after DOM is rendered
    // This adds the actual bar elements to the DOM
    if (typeof injectStackableBars === 'function') {
        injectStackableBars();
    }

    // Apply stacked column styles AFTER bars are injected
    // Use setTimeout to ensure this happens after any rapid re-renders complete
    if (typeof applyStackedColumnStyles === 'function') {
        // Clear any pending call
        if (window.stackedColumnStylesTimeout) {
            clearTimeout(window.stackedColumnStylesTimeout);
        }
        // Debounce: wait for renders to settle before measuring
        window.stackedColumnStylesTimeout = setTimeout(() => {
            applyStackedColumnStyles();
            window.stackedColumnStylesTimeout = null;
        }, 50);
    }

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
    if (!window.currentBoard || !window.currentBoard.columns) {return 'fold-mixed';}
    
    const column = window.currentBoard.columns.find(c => c.id === columnId);
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
    if (!window.currentBoard || !window.currentBoard.columns) {
        return;
    }

    // Ensure state variables are initialized
    if (!window.collapsedTasks) {window.collapsedTasks = new Set();}
    if (!window.columnFoldStates) {window.columnFoldStates = new Map();}

    const column = window.currentBoard.columns.find(c => c.id === columnId);
    if (!column) {
        return;
    }

    // Get the full column element (kanban-full-height-column)
    const columnElement = document.querySelector(`[data-column-id="${columnId}"].kanban-full-height-column`);
    if (!columnElement) {
        return;
    }

    // Find the tasks container within the column structure
    const tasksContainer = columnElement.querySelector('.tasks-container');
    if (!tasksContainer) {
        return;
    }

    // Get all task elements currently in this column's tasks container
    const taskElements = tasksContainer.querySelectorAll('.task-item[data-task-id]');
    if (taskElements.length === 0) {
        return;
    }

    // Count collapsed tasks in this column's DOM
    let collapsedCount = 0;
    taskElements.forEach(taskElement => {
        if (taskElement.classList.contains('collapsed')) {
            collapsedCount++;
        }
    });

    const totalTasks = taskElements.length;

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

    // Apply the action to all tasks using existing toggleTaskCollapse function
    taskElements.forEach(taskElement => {
        const taskId = taskElement.getAttribute('data-task-id');
        const isCollapsed = taskElement.classList.contains('collapsed');

        // Only toggle if state needs to change
        if (shouldCollapse && !isCollapsed) {
            toggleTaskCollapse(taskId);
        } else if (!shouldCollapse && isCollapsed) {
            toggleTaskCollapse(taskId);
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
    const hasViewportWidth = window.currentColumnWidth && (window.currentColumnWidth === '50percent' || window.currentColumnWidth === '100percent');
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

    // Handle columninclude specially - show filename as clickable link
    let displayTitle;
    let renderedTitle = '';

    if (column.includeMode && column.includeFiles && column.includeFiles.length > 0) {
        // For columninclude, show filename as a clickable link
        const fileName = column.includeFiles[0]; // Use the first include file
        const baseFileName = fileName.split('/').pop().split('\\').pop(); // Get just the filename

        // Create a clickable link that handles Alt+click to open file
        const linkHtml = `<span class="columninclude-link" data-file-path="${escapeHtml(fileName)}" onclick="handleColumnIncludeClick(event, '${escapeHtml(fileName)}')" title="Alt+click to open file">${escapeHtml(baseFileName)}</span>`;

        // Combine with any additional title content (after removing include syntax)
        let additionalTitle = column.displayTitle || '';
        if (!additionalTitle && column.title) {
            additionalTitle = column.title.replace(/!!!columninclude\([^)]+\)!!!/g, '').trim();
        }

        if (additionalTitle) {
            renderedTitle = `${linkHtml} ${renderMarkdown(additionalTitle)}`;
        } else {
            renderedTitle = linkHtml;
        }
    } else {
        // Normal column - use displayTitle or filter tags
        displayTitle = column.displayTitle || (column.title ? window.filterTagsFromText(column.title) : '');
        renderedTitle = displayTitle ? renderMarkdown(displayTitle) : '';
    }

    // For editing, always use the full title including include syntax
    const editTitle = column.title || '';
    const foldButtonState = getFoldAllButtonState(column.id);

    // Only show row indicator for rows 2, 3, 4 if configuration allows (not row 1)
    const columnRow = getColumnRow(column.title);
    const rowIndicator = (window.showRowTags && columnRow > 1) ? `<span class="column-row-tag">Row ${columnRow}</span>` : '';

		// the column-header MUST be outside the column-inner to be able to be sticky over the full height!!!
    columnDiv.innerHTML = `
				<div class="column-offset"></div>
				<div class="column-header">
						${headerBarsHtml || ''}
						${cornerBadgesHtml}
						<div class="column-title-section">
								<span class="drag-handle column-drag-handle" draggable="true">⋮⋮</span>
								<span class="collapse-toggle ${isCollapsed ? 'rotated' : ''}" data-column-id="${column.id}">▶</span>
								<div class="column-title-container">
										<div class="column-title markdown-content" onclick="handleColumnTitleClick(event, '${column.id}')">${renderedTitle}${rowIndicator}</div>
										<textarea class="column-title-edit"
																data-column-id="${column.id}"
																style="display: none;">${escapeHtml(editTitle)}</textarea>
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
												<button class="donut-menu-item" onclick="exportColumn('${column.id}')">Export column</button>
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
												<div class="donut-menu-item stack-control">
													<span class="stack-label">Stack:</span>
													<button class="stack-toggle-btn ${/#stack\b/i.test(column.title) ? 'active' : ''}" onclick="toggleColumnStack('${column.id}')">
														${/#stack\b/i.test(column.title) ? 'On' : 'Off'}
													</button>
												</div>
												<div class="donut-menu-divider"></div>
												${column.includeMode ? `
													<button class="donut-menu-item" onclick="editColumnIncludeFile('${column.id}')">
														Edit include file
													</button>
													<button class="donut-menu-item" onclick="toggleColumnIncludeMode('${column.id}')">
														Disable include mode
													</button>
												` : `
													<button class="donut-menu-item" onclick="toggleColumnIncludeMode('${column.id}')">
														Enable include mode
													</button>
												`}
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
 * Get the content that should be shown in the edit field for a task
 * For task includes, this is the complete file content
 * For regular tasks, this is just the description
 */
function getTaskEditContent(task) {
    if (task.includeMode && task.displayTitle) {
        // For task includes, combine displayTitle and description to reconstruct complete file content
        let fullContent = task.displayTitle;
        if (task.description && task.description.trim()) {
            fullContent += '\n\n' + task.description;
        }
        return fullContent;
    }
    return task.description || '';
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

    let renderedDescription = (task.description && typeof task.description === 'string' && task.description.trim()) ? renderMarkdown(task.description) : '';

    // Wrap description in task sections for keyboard navigation
    if (renderedDescription) {
        renderedDescription = wrapTaskSections(renderedDescription);
    }

    // Use same pattern as column includes:
    // - displayTitle for display (content from file or filtered title)
    // - task.title for editing (includes the !!!taskinclude(...)!!! syntax)
    const displayTitle = task.displayTitle || (task.title ? window.filterTagsFromText(task.title) : '');
    const renderedTitle = (displayTitle && typeof displayTitle === 'string' && displayTitle.trim()) ? renderMarkdown(displayTitle) : '';

    // For editing, always use the full title including include syntax
    const editTitle = task.title || '';

    const isCollapsed = window.collapsedTasks.has(task.id);

    // Extract ALL tags for stacking features (from the full title)
    const allTags = getActiveTagsInTitle(task.title);

    // Extract primary tag for styling (first non-special tag)
    const primaryTag = window.extractFirstTag ? window.extractFirstTag(task.title) : null;
    const tagAttribute = (primaryTag && !primaryTag.startsWith('row') && !primaryTag.startsWith('gather_') && !primaryTag.startsWith('span'))
        ? ` data-task-tag="${primaryTag}"`
        : '';

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
                            ${task.includeMode ?
                                `<button class="donut-menu-item" onclick="toggleTaskIncludeMode('${task.id}', '${columnId}')">Disable include mode</button>
                                <button class="donut-menu-item" onclick="editTaskIncludeFile('${task.id}', '${columnId}')">Edit include file</button>` :
                                `<button class="donut-menu-item" onclick="toggleTaskIncludeMode('${task.id}', '${columnId}')">Enable include mode</button>`
                            }
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
                        onclick="handleDescriptionClick(event, this, '${task.id}', '${columnId}')">${renderedDescription}</div>
                <textarea class="task-description-edit" 
                            data-task-id="${task.id}" 
                            data-column-id="${columnId}"
                            data-field="description"
                            placeholder="Add description (Markdown supported)..."
                            style="display: none;">${escapeHtml(getTaskEditContent(task))}</textarea>
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
 * Check if a column element is collapsed (either vertically or horizontally)
 * @param {HTMLElement} columnElement - Column DOM element
 * @returns {boolean} True if column is collapsed in any mode
 */
function isColumnCollapsed(columnElement) {
    return columnElement && (
        columnElement.classList.contains('collapsed') ||
        columnElement.classList.contains('collapsed-horizontal')
    );
}
window.isColumnCollapsed = isColumnCollapsed;

/**
 * Check if a column is in a vertical stack
 * A column is in a vertical stack if it or the next column has #stack tag
 * @param {string} columnId - Column ID to check
 * @returns {boolean} True if column is in vertical stack
 */
function isInVerticalStack(columnId) {
    const column = window.cachedBoard?.columns?.find(c => c.id === columnId);
    if (!column) return false;

    // Check if this column has #stack tag
    if (/#stack\b/i.test(column.title)) {
        return true;
    }

    // Check if next column has #stack tag
    const columnIndex = window.cachedBoard.columns.indexOf(column);
    if (columnIndex >= 0 && columnIndex < window.cachedBoard.columns.length - 1) {
        const nextColumn = window.cachedBoard.columns[columnIndex + 1];
        if (/#stack\b/i.test(nextColumn.title)) {
            return true;
        }
    }

    return false;
}

/**
 * Get the default fold mode for a column based on whether it's in a stack
 * @param {string} columnId - Column ID
 * @returns {string} 'horizontal' or 'vertical'
 */
function getDefaultFoldMode(columnId) {
    return isInVerticalStack(columnId) ? 'horizontal' : 'vertical';
}

/**
 * Toggles a column between collapsed and expanded states
 * Purpose: Show/hide column content for space management
 * Used by: Column fold button clicks
 * @param {string} columnId - ID of column to toggle
 * @param {Event} event - Click event (optional, used to detect Alt key)
 * Side effects: Updates collapsedColumns set, columnFoldModes map, DOM classes
 */
function toggleColumnCollapse(columnId, event) {
    const column = document.querySelector(`[data-column-id="${columnId}"]`);
    const toggle = column.querySelector('.collapse-toggle');

    // Ensure state variables are initialized
    if (!window.collapsedColumns) {window.collapsedColumns = new Set();}
    if (!window.columnFoldModes) {window.columnFoldModes = new Map();}

    const isCurrentlyCollapsed = column.classList.contains('collapsed') ||
                                  column.classList.contains('collapsed-horizontal');
    const altPressed = event?.altKey || false;
    const defaultMode = getDefaultFoldMode(columnId);
    const currentMode = window.columnFoldModes.get(columnId);

    if (isCurrentlyCollapsed) {
        // Currently collapsed
        if (altPressed) {
            // Alt+click on folded column: switch fold mode (stay folded)
            const newMode = currentMode === 'vertical' ? 'horizontal' : 'vertical';
            column.classList.remove('collapsed', 'collapsed-horizontal');
            if (newMode === 'vertical') {
                column.classList.add('collapsed');
            } else {
                column.classList.add('collapsed-horizontal');
            }
            window.columnFoldModes.set(columnId, newMode);
        } else {
            // Normal click on folded column: unfold
            column.classList.remove('collapsed', 'collapsed-horizontal');
            toggle.classList.remove('rotated');
            window.collapsedColumns.delete(columnId);
            window.columnFoldModes.delete(columnId);
        }
    } else {
        // Currently unfolded
        const targetMode = altPressed ? (defaultMode === 'vertical' ? 'horizontal' : 'vertical') : defaultMode;
        if (targetMode === 'vertical') {
            column.classList.add('collapsed');
        } else {
            column.classList.add('collapsed-horizontal');
        }
        toggle.classList.add('rotated');
        window.collapsedColumns.add(columnId);
        window.columnFoldModes.set(columnId, targetMode);

        // Reset height for collapsed column - let it use natural size
        const columnInner = column.querySelector('.column-inner');
        if (columnInner) {
            columnInner.style.minHeight = '';
            columnInner.style.overflowY = 'visible';
        }
        column.style.minHeight = '';
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
        // Apply stacked column styles after state change
        applyStackedColumnStyles();
    }, 10);
}

// Removed handleColumnBarsOnToggle - no longer needed since we keep same HTML structure

/**
 * Apply special styling and positioning for stacked columns
 * Purpose:
 *   1. Group vertically-folded stacked columns horizontally
 *   2. Make headers sticky at different positions for expanded stacked columns
 * Used by: After any column fold/unfold operation, board rendering
 * Side effects: Adds/removes CSS classes, sets inline styles for header positions
 */
function applyStackedColumnStyles() {
    const stacks = document.querySelectorAll('.kanban-column-stack');

    stacks.forEach(stack => {
        const columns = Array.from(stack.querySelectorAll('.kanban-full-height-column'));

        // Check if all columns in stack are vertically folded (.collapsed)
        const allVerticalFolded = columns.length > 0 && columns.every(col =>
            col.classList.contains('collapsed') && !col.classList.contains('collapsed-horizontal')
        );

        if (allVerticalFolded) {
            // All columns vertically folded - display horizontally
            stack.classList.add('all-vertical-folded');
            // Reset header positions since they're not stacked
            columns.forEach(col => {
                const header = col.querySelector('.column-header');
                if (header) {
                    header.style.top = '';
                }
            });
        } else {
            // At least one column is expanded or horizontally folded - display vertically
            stack.classList.remove('all-vertical-folded');

            // Calculate padding-top for each column to create space for previous columns
            const computedStyle = getComputedStyle(stack);
            const gapPx = parseFloat(computedStyle.getPropertyValue('--whitespace')) || 8;

            // First pass: reset all padding to get accurate natural heights
            columns.forEach(col => {
                col.style.paddingTop = '';
            });

            // Force a reflow to ensure padding reset takes effect
            void stack.offsetHeight;

            // Second pass: measure actual content heights (header + content + footer)
            // Store all measurements for later use
            const columnData = [];
            columns.forEach((col, idx) => {
                const isVerticallyFolded = col.classList.contains('collapsed') && !col.classList.contains('collapsed-horizontal');
                if (!isVerticallyFolded) {
                    const header = col.querySelector('.column-header');
                    const footer = col.querySelector('.column-footer');
                    const content = col.querySelector('.column-inner');

                    // Force reflow on each header to ensure bars are included in measurement
                    if (header) {void header.offsetHeight;}
                    if (footer) {void footer.offsetHeight;}

                    const headerHeight = header ? header.offsetHeight : 0;
                    const footerHeight = footer ? footer.offsetHeight : 0;
                    const contentHeight = content ? content.scrollHeight : 0;

                    // Measure footer bars separately (in column-footer for stacked)
                    const footerBarsContainer = footer ? footer.querySelector('.stacked-footer-bars') : null;
                    const footerBarsHeight = footerBarsContainer ? footerBarsContainer.offsetHeight : 0;

                    // DEBUG: Check if bars exist and their heights
                    const headerBarsContainer = header ? header.querySelector('.header-bars-container') : null;
                    const headerBarCount = headerBarsContainer ? headerBarsContainer.children.length : 0;
                    const footerBarCount = footerBarsContainer ? footerBarsContainer.children.length : 0;
                    console.log(`[kanban.stacked-columns-DEBUG] Column ${idx}: ${headerBarCount} header-bars, ${footerBarCount} footer-bars (${footerBarsHeight}px)`);

                    const totalHeight = headerHeight + footerHeight + contentHeight;
                    console.log(`[kanban.stacked-columns] Column ${idx}: header=${headerHeight}px, footer=${footerHeight}px (includes ${footerBarsHeight}px bars), content=${contentHeight}px, total=${totalHeight}px`);

                    columnData.push({
                        col,
                        index: idx,
                        header,
                        footer,
                        headerHeight,
                        footerHeight,
                        contentHeight,
                        totalHeight,
                        footerBarsContainer,
                        footerBarsHeight,
                        isExpanded: true
                    });
                } else {
                    columnData.push({
                        col,
                        index: idx,
                        isExpanded: false,
                        totalHeight: 0,
                        headerHeight: 0,
                        footerHeight: 0
                    });
                }
            });

            // Filter to only expanded columns
            const expandedColumns = columnData.filter(data => data.isExpanded);

            // Third pass: Calculate all sticky positions from BOTTOM upwards
            // Step 1: Calculate bottom positions for footers and headers (stacked from bottom)
            // Iterate BACKWARDS: LAST column (highest index) gets bottom=0 (closest to viewport bottom)
            // FIRST column (index 0) gets largest bottom offset (furthest from viewport bottom)
            let cumulativeFromBottom = 0;
            const positions = [];
            for (let i = expandedColumns.length - 1; i >= 0; i--) {
                const data = expandedColumns[i];
                const expandedIdx = i;

                const footerBottom = cumulativeFromBottom;
                cumulativeFromBottom += data.footerHeight;

                const headerBottom = cumulativeFromBottom;  // Header right after footer
                cumulativeFromBottom += data.headerHeight + gapPx;  // Add header height + gap for next column

                positions[i] = {
                    ...data,
                    headerBottom,
                    footerBottom,
                    zIndex: 1000000 + (expandedColumns.length - expandedIdx)
                };
            }

            // Step 3: Calculate padding for column content (creates vertical stacking without stretching column element)
            let cumulativePadding = 0;
            positions.forEach((pos, idx) => {
                pos.contentPadding = idx > 0 ? cumulativePadding : 0;
                cumulativePadding += pos.totalHeight + gapPx;
            });

            // Step 4: Apply all calculated positions
            positions.forEach(({ col, index, header, footer, headerBottom, footerBottom, contentPadding, zIndex }) => {
                // Store calculated positions on the column element
                col.dataset.headerBottom = headerBottom;
                col.dataset.footerBottom = footerBottom;
                col.dataset.zIndex = zIndex;

                // Position header+footer sticky at BOTTOM using bottom property ONLY
                if (header) {
                    header.style.position = 'sticky';
                    header.style.bottom = `${headerBottom}px`;
                    header.style.zIndex = zIndex;
                }

                if (footer) {
                    footer.style.position = 'sticky';
                    footer.style.bottom = `${footerBottom}px`;
                    footer.style.zIndex = zIndex;
                }

                console.log(`[DEBUG-STACK] Initial setup - Column ${index}: headerBottom=${headerBottom}px, footerBottom=${footerBottom}px, contentPadding=${contentPadding}px`);

                // Apply padding to column-offset to push column content down
                const columnOffset = col.querySelector('.column-offset');
                if (columnOffset) {
                    columnOffset.style.paddingTop = contentPadding > 0 ? `${contentPadding}px` : '';
                }
            });
        }
    });
}
window.applyStackedColumnStyles = applyStackedColumnStyles;

/**
 * Setup scroll handler to keep all column headers visible at all times
 * Uses position:sticky for top, position:fixed for bottom (sticky bottom doesn't work with margin-top positioning)
 */
function setupStackedColumnScrollHandler(columnsData) {
    // Remove existing scroll handler if any
    if (window.stackedColumnScrollHandler) {
        window.removeEventListener('scroll', window.stackedColumnScrollHandler, true);
    }

    // Store columns data
    window.stackedColumnsData = columnsData;

    // Create scroll handler with FIXED positioning for bottom headers
    const scrollHandler = () => {
        if (!window.stackedColumnsData) return;

        const scrollY = window.scrollY || window.pageYOffset;
        const viewportHeight = window.innerHeight;
        const viewportBottom = scrollY + viewportHeight;

        console.log(`\n[DEBUG-STACK] === SCROLL EVENT ===`);
        console.log(`[DEBUG-STACK] scrollY=${scrollY.toFixed(0)}, viewportHeight=${viewportHeight.toFixed(0)}, viewportBottom=${viewportBottom.toFixed(0)}`);

        window.stackedColumnsData.forEach(({ col, headerHeight, footerHeight, totalHeight }, idx) => {
            const header = col.querySelector('.column-header');
            const footer = col.querySelector('.column-footer');
            const columnInner = col.querySelector('.column-inner');

            if (!header || !footer) return;

            const headerBottom = parseFloat(col.dataset.headerBottom || 0);
            const footerBottom = parseFloat(col.dataset.footerBottom || 0);
            const zIndex = parseInt(col.dataset.zIndex || 100);
            const colIndex = col.dataset.columnIndex;

            const rect = col.getBoundingClientRect();
            const headerRect = header.getBoundingClientRect();
            const columnInnerPadding = columnInner ? parseFloat(window.getComputedStyle(columnInner).paddingTop) : 0;

            console.log(`\n[DEBUG-STACK] --- Column ${colIndex} ---`);
            console.log(`[DEBUG-STACK]   Stored values: headerBottom=${headerBottom}, footerBottom=${footerBottom}`);
            console.log(`[DEBUG-STACK]   Heights: headerHeight=${headerHeight}, footerHeight=${footerHeight}, totalHeight=${totalHeight}`);
            console.log(`[DEBUG-STACK]   Column rect: top=${rect.top.toFixed(0)}, bottom=${rect.bottom.toFixed(0)}, height=${rect.height.toFixed(0)}`);
            console.log(`[DEBUG-STACK]   Header rect: top=${headerRect.top.toFixed(0)}, bottom=${headerRect.bottom.toFixed(0)}`);
            console.log(`[DEBUG-STACK]   Column-inner paddingTop=${columnInnerPadding.toFixed(0)}`);

            // Calculate: header would be ABOVE viewport top when sticky at bottom
            // headerRect.bottom is where the header currently is (accounting for sticky behavior)
            // If header is ABOVE the viewport top, switch to fixed top positioning
            const headerWouldBeAbove = headerRect.bottom < 0;

            console.log(`[DEBUG-STACK]   Calculation: headerRect.bottom=${headerRect.bottom.toFixed(0)}`);
            console.log(`[DEBUG-STACK]   Decision: headerAbove=${headerWouldBeAbove} (${headerRect.bottom.toFixed(0)} < 0)`);

            if (headerWouldBeAbove) {
                // Column is above viewport - use FIXED positioning at TOP
                const footerTop = headerHeight;

                header.style.position = 'fixed';
                header.style.top = '0px';
                header.style.bottom = '';
                header.style.left = rect.left + 'px';
                header.style.width = rect.width + 'px';
                header.style.zIndex = zIndex;

                footer.style.position = 'fixed';
                footer.style.top = `${footerTop}px`;
                footer.style.bottom = '';
                footer.style.left = rect.left + 'px';
                footer.style.width = rect.width + 'px';
                footer.style.zIndex = zIndex;

                console.log(`[DEBUG-STACK]   >>> ABOVE viewport - FIXED at TOP (top=0)`);
            } else {
                // Column is visible or below viewport - use STICKY at BOTTOM
                header.style.position = 'sticky';
                header.style.bottom = `${headerBottom}px`;
                header.style.top = '';
                header.style.left = '';
                header.style.right = '';
                header.style.zIndex = zIndex;

                footer.style.position = 'sticky';
                footer.style.bottom = `${footerBottom}px`;
                footer.style.top = '';
                footer.style.left = '';
                footer.style.right = '';
                footer.style.zIndex = zIndex;

                console.log(`[DEBUG-STACK]   >>> VISIBLE/BELOW - STICKY at BOTTOM (bottom=${footerBottom})`);
            }
        });
    };

    // Store handler reference
    window.stackedColumnScrollHandler = scrollHandler;

    // Attach scroll listener
    window.addEventListener('scroll', scrollHandler, true);

    // Run once immediately
    scrollHandler();
}
window.setupStackedColumnScrollHandler = setupStackedColumnScrollHandler;

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
function handleLinkOrImageOpen(event, target, taskId = null, columnId = null) {
    const link = target.closest('a');
    const img = target.closest('img');
    const wikiLink = target.closest('.wiki-link');

    // Function to find the position index of clicked element among similar elements
    function findElementIndex(clickedElement, containerElement, attributeName) {
        if (!clickedElement || !containerElement) return 0;

        const attributeValue = clickedElement.getAttribute(attributeName);
        if (!attributeValue) return 0;

        // Find all elements with the same tag name in the container
        const tagName = clickedElement.tagName.toLowerCase();
        const allElementsWithTag = containerElement.querySelectorAll(tagName);

        // Filter by attribute value (avoid CSS selector escaping issues)
        const allSimilar = Array.from(allElementsWithTag).filter(el =>
            el.getAttribute(attributeName) === attributeValue
        );

        // Find the index of our clicked element
        const index = allSimilar.indexOf(clickedElement);

        return index >= 0 ? index : 0;
    }

    // Find the task or column container to scope the search
    let containerElement = null;
    let linkIndex = 0;

    if (taskId) {
        // Look for task container
        containerElement = target.closest(`[data-task-id="${taskId}"]`);
        if (!containerElement) {
            containerElement = target.closest('.task-item');
        }
    } else if (columnId) {
        // Look for column container
        containerElement = target.closest(`[data-column-id="${columnId}"]`);
        if (!containerElement) {
            containerElement = target.closest('.column');
        }
    }

    if (!containerElement) {
        // Fallback to the entire board
        containerElement = document.querySelector('.kanban-board');
    }
    
    // Handle wiki links
    if (wikiLink) {
        event.preventDefault();
        event.stopPropagation();
        const documentName = wikiLink.getAttribute('data-document');
        if (documentName) {
            // Calculate index for wiki links
            linkIndex = findElementIndex(wikiLink, containerElement, 'data-document');

            vscode.postMessage({
                type: 'openWikiLink',
                documentName: documentName,
                linkIndex: linkIndex,
                taskId: taskId,
                columnId: columnId
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
                // Calculate index for file links using the href attribute
                const hrefAttr = link.getAttribute('data-original-href') ? 'data-original-href' : 'href';
                linkIndex = findElementIndex(link, containerElement, hrefAttr);

                vscode.postMessage({
                    type: 'openFileLink',
                    href: href,
                    linkIndex: linkIndex,
                    taskId: taskId,
                    columnId: columnId
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
            // Calculate index for images using the src attribute
            const srcAttr = img.getAttribute('data-original-src') ? 'data-original-src' : 'src';
            linkIndex = findElementIndex(img, containerElement, srcAttr);


            vscode.postMessage({
                type: 'openFileLink',
                href: originalSrc,
                linkIndex: linkIndex,
                taskId: taskId,
                columnId: columnId
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
        if (handleLinkOrImageOpen(event, event.target, taskId, columnId)) {return;}
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
        if (handleLinkOrImageOpen(event, event.target, taskId, columnId)) {return;}
        return; // Don't edit if Alt is pressed
    }

    // Default: always edit
    event.preventDefault();
    event.stopPropagation();

    if (typeof editTitle === 'function') {
        editTitle(element, taskId, columnId);
    } else {
        console.error('editTitle is not a function:', typeof editTitle);
    }
}

function handleDescriptionClick(event, element, taskId, columnId) {

    if (event.altKey) {
        // Alt+click: open link/image
        if (handleLinkOrImageOpen(event, event.target, taskId, columnId)) {return;}
        return; // Don't edit if Alt is pressed
    }

    // Default: always edit
    event.preventDefault();
    event.stopPropagation();

    if (typeof editDescription === 'function') {
        if (taskId && columnId) {
            editDescription(element, taskId, columnId);
        } else {
            editDescription(element);
        }
    } else {
        console.error('editDescription is not a function:', typeof editDescription);
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

                // Default column footer background
                styles += `.kanban-full-height-column:not([data-column-tag]) .column-footer {
                    background-color: ${columnBg} !important;
                }\n`;

                const columnCollapsedBg = interpolateColor(editorBg, bgDark, 0.2);

                // Default collapsed column header background
                styles += `.kanban-full-height-column.collapsed:not([data-column-tag]) .column-header {
                    background-color: ${columnCollapsedBg} !important;
                }\n`;

                // Default collapsed column footer background
                styles += `.kanban-full-height-column.collapsed:not([data-column-tag]) .column-footer {
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

                    // Column footer background
                    styles += `.kanban-full-height-column[data-column-tag="${lowerTagName}"] .column-footer {
                        background-color: ${columnBg} !important;
                    }\n`;

                    // Column collapsed state - interpolate 20% towards the darker color
                    const columnCollapsedBg = interpolateColor(editorBg, bgDark, 0.2);

                    // Collapsed column header background
                    styles += `.kanban-full-height-column.collapsed[data-column-tag="${lowerTagName}"] .column-header {
                        background-color: ${columnCollapsedBg} !important;
                    }\n`;

                    // Collapsed column footer background
                    styles += `.kanban-full-height-column.collapsed[data-column-tag="${lowerTagName}"] .column-footer {
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
                            // Use data-column-tag for left border on all column parts
                            styles += `.kanban-full-height-column[data-column-tag="${lowerTagName}"] .column-header {
                                border-left: ${borderWidth} ${borderStyle} ${borderColor} !important;
                            }\n`;
                            styles += `.kanban-full-height-column[data-column-tag="${lowerTagName}"] .column-inner {
                                border-left: ${borderWidth} ${borderStyle} ${borderColor} !important;
                            }\n`;
                            styles += `.kanban-full-height-column[data-column-tag="${lowerTagName}"] .column-footer {
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
                                border-bottom: none !important;
                            }\n
														.kanban-full-height-column[data-column-tag="${lowerTagName}"] .column-header {
                                border-left: ${borderWidth} ${borderStyle} ${borderColor} !important;
                                border-right: ${borderWidth} ${borderStyle} ${borderColor} !important;
                                border-top: ${borderWidth} ${borderStyle} ${borderColor} !important;
                            }\n
														.kanban-full-height-column[data-column-tag="${lowerTagName}"] .column-footer {
                                border-left: ${borderWidth} ${borderStyle} ${borderColor} !important;
                                border-right: ${borderWidth} ${borderStyle} ${borderColor} !important;
                                border-bottom: ${borderWidth} ${borderStyle} ${borderColor} !important;
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
    console.log('[kanban.injectStackableBars] START - targetElement:', targetElement ? 'specific element' : 'all elements');

    let elementsToProcess;
    if (targetElement) {
        // Always process the target element (even without data-all-tags) to clean up existing bars
        elementsToProcess = [targetElement];
    } else {
        elementsToProcess = document.querySelectorAll('[data-all-tags]');
    }

    console.log('[kanban.injectStackableBars] Found', elementsToProcess.length, 'elements to process');

    elementsToProcess.forEach((element, idx) => {
        const allTagsAttr = element.getAttribute('data-all-tags');
        let tags = allTagsAttr ? allTagsAttr.split(' ').filter(tag => tag.trim()) : [];
        const isColumn = element.classList.contains('kanban-full-height-column');
        const isCollapsed = isColumn && element.classList.contains('collapsed');
        const isStacked = isColumn && element.closest('.kanban-column-stack');

        console.log(`[kanban.injectStackableBars] Element ${idx}: isColumn=${isColumn}, isStacked=${isStacked}, tags=[${tags.join(', ')}]`);

        // Filter out tags that are only in description for task elements
        if (!isColumn) { // This is a task element
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
                tags = tags.filter(tag => !descriptionTags.has(tag));
            }
        }
        
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

                console.log(`[kanban.injectStackableBars] Creating header bar for tag "${tag}", height=${config.headerBar.height}, label=${config.headerBar.label}`);
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
            // Find the header and footer elements to insert bars into
						const columnHeader = element.querySelector('.column-header');
						const columnFooter = element.querySelector('.column-footer');

            // Create and insert header container at the beginning of column-header
            if (headerBars.length > 0 && columnHeader) {
                const headerContainer = document.createElement('div');
                headerContainer.className = 'header-bars-container';
                headerBars.forEach(bar => headerContainer.appendChild(bar));
                columnHeader.insertBefore(headerContainer, columnHeader.firstChild);
                element.classList.add('has-header-bar');
                if (hasHeaderLabel) {element.classList.add('has-header-label');}
                console.log(`[kanban.injectStackableBars] Inserted ${headerBars.length} header bars into COLLAPSED column header`);
            }

            // Create and append footer container to column-footer (not column-inner)
            if (footerBars.length > 0 && columnFooter) {
                const footerContainer = document.createElement('div');
                footerContainer.className = 'footer-bars-container';
                footerBars.forEach(bar => footerContainer.appendChild(bar));
                columnFooter.appendChild(footerContainer);
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
            const isInStack = element.closest('.kanban-column-stack') !== null;

            if (columnHeader) {
                // Create and insert header container at the beginning of column-header
                if (headerBars.length > 0) {
                    const headerContainer = document.createElement('div');
                    headerContainer.className = 'header-bars-container';
                    headerBars.forEach(bar => headerContainer.appendChild(bar));
                    columnHeader.insertBefore(headerContainer, columnHeader.firstChild);
                    console.log(`[kanban.injectStackableBars] Inserted ${headerBars.length} header bars into column header`);
                }
            }

            // Footer bars always go in column-footer, but stacked ones get special class
            if (columnFooter && footerBars.length > 0) {
                const footerContainer = document.createElement('div');
                footerContainer.className = 'footer-bars-container';
                if (isInStack) {
                    footerContainer.classList.add('stacked-footer-bars');
                }
                footerBars.forEach(bar => footerContainer.appendChild(bar));
                columnFooter.appendChild(footerContainer);
                element.classList.add('has-footer-bar');
                if (hasFooterLabel) {element.classList.add('has-footer-label');}
                console.log(`[kanban.injectStackableBars] Inserted ${footerBars.length} footer bars into column-footer${isInStack ? ' (stacked)' : ''}`);
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

    // Force a full reflow to ensure all bars are laid out
    void document.body.offsetHeight;

    console.log('[kanban.injectStackableBars] END - bars injected, applyStackedColumnStyles will be called from renderBoard');
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
        const column = window.currentBoard?.columns?.find(c => c.id === id);
        if (column) {
            currentTitle = column.title || '';
            element = column;
        }
    } else if (type === 'task' && columnId) {
        const column = window.currentBoard?.columns?.find(c => c.id === columnId);
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
        const task = element; // element is the task object
        task.title = newTitle; // Update the task title

        // Send editTask message immediately when tags are removed
        vscode.postMessage({
            type: 'editTask',
            taskId: id,
            columnId: columnId,
            taskData: task
        });

        // Update display immediately
        if (typeof updateTaskDisplayImmediate === 'function') {
            updateTaskDisplayImmediate(id, newTitle, false, '');
        }
    }

    // Update refresh button state (note: tasks now send immediately, only columns use pending)
    const totalPending = (window.pendingColumnChanges?.size || 0);
    if (typeof updateRefreshButtonState === 'function') {
        updateRefreshButtonState(totalPending > 0 ? 'unsaved' : 'default', totalPending);
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

// Function to update task count display for a column
function updateColumnTaskCount(columnId) {
    const column = window.currentBoard?.columns?.find(c => c.id === columnId);
    if (!column) {
        return;
    }

    const taskCountElement = document.querySelector(`[data-column-id="${columnId}"] .task-count`);
    if (taskCountElement) {
        // Update the text content while preserving the button
        const buttonHTML = taskCountElement.innerHTML.match(/<button[\s\S]*<\/button>/);
        taskCountElement.innerHTML = `${column.tasks.length}${buttonHTML ? buttonHTML[0] : ''}`;
    }
}

// Function to update fold button state for a column
function updateColumnFoldState(columnId) {
    updateFoldAllButton(columnId);
}

// Function to update both task count and fold state after task moves
function updateColumnDisplay(columnId) {
    updateColumnTaskCount(columnId);
    updateColumnFoldState(columnId);
}

// Expose fold/collapse functions for onclick handlers
window.toggleTaskCollapse = toggleTaskCollapse;
window.toggleAllTasksInColumn = toggleAllTasksInColumn;
window.updateColumnDisplay = updateColumnDisplay;

// Expose rendering functions for include file updates
window.renderSingleColumn = renderSingleColumn;

// TODO: These functions are not defined - commenting out to prevent errors
// window.getAllHeaderBarsHtml = getAllHeaderBarsHtml;
// window.getAllFooterBarsHtml = getAllFooterBarsHtml;
window.injectStackableBars = injectStackableBars;
window.isDarkTheme = isDarkTheme;

window.getAllTagsInUse = getAllTagsInUse;
window.getUserAddedTags = getUserAddedTags;

// Expose section wrapping function for taskEditor
window.wrapTaskSections = wrapTaskSections;

// window.handleColumnBarsOnToggle = handleColumnBarsOnToggle; // Removed - no longer needed
window.handleLinkOrImageOpen = handleLinkOrImageOpen;

// Function to calculate and apply row heights based on tallest column
// Removed calculateAndApplyRowHeights and calculateRowHeight functions
// Height management is now handled by:
// 1. CSS flexbox for 'auto' mode (natural layout)
// 2. applyRowHeight() for user-defined heights (vh, px, em)
