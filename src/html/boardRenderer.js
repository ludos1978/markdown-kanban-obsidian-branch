let scrollPositions = new Map();

// Make folding state variables global for persistence
window.collapsedColumns = window.collapsedColumns || new Set();
window.collapsedTasks = window.collapsedTasks || new Set();
window.columnFoldStates = window.columnFoldStates || new Map(); // Track last manual fold state for each column
window.globalColumnFoldState = window.globalColumnFoldState || 'fold-mixed'; // Track global column fold state

// Use global window.window.cachedBoard instead of local variable
// let window.cachedBoard = null; // Removed to avoid conflicts
let renderTimeout = null;

// Cache board element reference for performance
let cachedBoardElement = null;
function getBoardElement() {
    if (!cachedBoardElement) {
        cachedBoardElement = document.getElementById('kanban-board');
    }
    return cachedBoardElement;
}

// Cache CSS variables for performance
let cachedEditorBg = null;
function getEditorBackground() {
    if (!cachedEditorBg) {
        cachedEditorBg = getComputedStyle(document.documentElement).getPropertyValue('--vscode-editor-background') || '#ffffff';
    }
    return cachedEditorBg;
}

/**
 * Gets the column ID for any element by traversing up the DOM tree
 * This avoids storing redundant data-column-id on task elements
 * @param {HTMLElement} element - Any element within a column
 * @returns {string|null} The column ID, or null if not found
 */
function getColumnIdFromElement(element) {
    if (!element) return null;
    const columnElement = element.closest('.kanban-full-height-column');
    return columnElement?.dataset.columnId || null;
}

/**
 * Gets the task ID for any element by traversing up the DOM tree
 * This avoids storing redundant data-task-id on child elements
 * @param {HTMLElement} element - Any element within a task
 * @returns {string|null} The task ID, or null if not found
 */
function getTaskIdFromElement(element) {
    if (!element) return null;
    const taskElement = element.closest('.task-item');
    return taskElement?.dataset.taskId || null;
}

// Make them globally accessible
window.getColumnIdFromElement = getColumnIdFromElement;
window.getTaskIdFromElement = getTaskIdFromElement;

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
    const editorBg = getEditorBackground();
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
.kanban-full-height-column[data-column-tag="${tagName}"] .column-title,
.kanban-full-height-column[data-all-tags~="${tagName}"] .column-title {
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
.kanban-full-height-column.collapsed[data-column-tag="${tagName}"] .column-title,
.kanban-full-height-column.collapsed[data-all-tags~="${tagName}"] .column-title {
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
            /* position: relative; */
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
            /* position: relative !important; */
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

    // Use boardRenderer.js compatible regex with exclusions for layout tags
    const re = /#(?!row\d+\b)(?!span\d+\b)(?!stack\b)([a-zA-Z0-9_-]+(?:[=|><][a-zA-Z0-9_-]+)*)/g;
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
    if (!window.cachedBoard || !window.cachedBoard.columns || window.cachedBoard.columns.length === 0) {return;}

    // Ensure folding state variables are initialized
    if (!window.collapsedColumns) {window.collapsedColumns = new Set();}
    if (!window.columnFoldModes) {window.columnFoldModes = new Map();}

    window.cachedBoard.columns.forEach(column => {
        const hasNoTasks = !column.tasks || column.tasks.length === 0;
        const columnElement = document.querySelector(`[data-column-id="${column.id}"]`);
        const toggle = columnElement?.querySelector('.collapse-toggle');

        if (hasNoTasks) {
            // Empty columns should be collapsed by default
            window.collapsedColumns.add(column.id);
            const foldMode = getDefaultFoldMode(column.id);
            window.columnFoldModes.set(column.id, foldMode);
            if (foldMode === 'vertical') {
                columnElement?.classList.add('collapsed-vertical');
            } else {
                columnElement?.classList.add('collapsed-horizontal');
            }
            toggle?.classList.add('rotated');
        } else {
            // Non-empty columns should be expanded by default
            window.collapsedColumns.delete(column.id);
            window.columnFoldModes.delete(column.id);
            columnElement?.classList.remove('collapsed-vertical', 'collapsed-horizontal');
            toggle?.classList.remove('rotated');
        }
    });

    // Set the global fold state to expanded (the default state)
    window.globalColumnFoldState = 'fold-expanded';

    // Recalculate heights after applying default folding
    // Use requestAnimationFrame to ensure DOM has finished updating all column states
    requestAnimationFrame(() => {
        enforceFoldModesForStacks();
        recalculateStackHeightsImmediate();
    });
}

/**
 * Sets the default folding state for all columns (data only)
 * Purpose: Apply default logic without DOM changes (for initialization)
 * Used by: applyFoldingStates() when detecting fresh load
 * Side effects: Updates collapsedColumns set based on column content
 */
function setDefaultFoldingState() {
    if (!window.cachedBoard || !window.cachedBoard.columns || window.cachedBoard.columns.length === 0) {return;}
    
    // Ensure folding state variables are initialized
    if (!window.collapsedColumns) {window.collapsedColumns = new Set();}
    
    window.cachedBoard.columns.forEach(column => {
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
    if (!window.cachedBoard || !window.cachedBoard.columns || window.cachedBoard.columns.length === 0) {
        return 'fold-mixed';
    }
    
    // Count columns with tasks that are collapsed
    const columnsWithTasks = window.cachedBoard.columns.filter(column => column.tasks && column.tasks.length > 0);
    const emptyColumns = window.cachedBoard.columns.filter(column => !column.tasks || column.tasks.length === 0);
    
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
    if (!window.cachedBoard || !window.cachedBoard.columns || window.cachedBoard.columns.length === 0) {return;}
    
    // Ensure state variables are initialized
    if (!window.collapsedColumns) {window.collapsedColumns = new Set();}
    
    const currentState = getGlobalColumnFoldState();
    const collapsedCount = window.cachedBoard.columns.filter(column => window.collapsedColumns.has(column.id)).length;
    const totalColumns = window.cachedBoard.columns.length;
    
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
        window.cachedBoard.columns.forEach(column => {
            const columnElement = document.querySelector(`[data-column-id="${column.id}"]`);
            const toggle = columnElement?.querySelector('.collapse-toggle');

            window.collapsedColumns.add(column.id);
            const foldMode = getDefaultFoldMode(column.id);
            window.columnFoldModes.set(column.id, foldMode);
            if (foldMode === 'vertical') {
                columnElement?.classList.add('collapsed-vertical');
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

    // Recalculate stacked column heights after bulk fold/unfold
    // Use requestAnimationFrame to ensure DOM has finished updating all column states
    requestAnimationFrame(() => {
        enforceFoldModesForStacks();
        recalculateStackHeightsImmediate();
    });

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
    
    if (!window.cachedBoard || !window.cachedBoard.columns) {
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
                columnElement.classList.add('collapsed-vertical');
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
    if (window.cachedBoard && window.cachedBoard.columns) {
        window.cachedBoard.columns.forEach(column => {
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
    // Skip layout tags: row, span, and stack
    const matches = text.match(/#(?!row\d+\b)(?!span\d+\b)(?!stack\b)([a-zA-Z0-9_-]+(?:[&|=><][a-zA-Z0-9_-]+)*)/g) || [];
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
    
    if (!window.cachedBoard || !window.cachedBoard.columns) {return tagsInUse;}
    
    // Collect tags from all columns and tasks
    window.cachedBoard.columns.forEach(column => {
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
        // Skip the default group (contains column/card defaults, not tags)
        if (key === 'default') return;

        const value = tagConfig[key];

        // Check if this is a group (contains objects)
        if (value && typeof value === 'object') {
            // Check if this is a direct tag configuration (has any styling properties)
            const isDirectTag = value.light || value.dark || value.headerBar ||
                               value.border || value.footerBar || value.cornerBadge;

            if (isDirectTag) {
                // This is a direct tag configuration
                configuredTags.add(key.toLowerCase());
            } else {
                // This might be a group, check its children
                Object.keys(value).forEach(subKey => {
                    const subValue = value[subKey];
                    if (subValue && typeof subValue === 'object') {
                        // Check if this has any valid tag styling properties
                        const hasTagProperties = subValue.light || subValue.dark || subValue.headerBar ||
                                                subValue.border || subValue.footerBar || subValue.cornerBadge;
                        if (hasTagProperties) {
                            configuredTags.add(subKey.toLowerCase());
                        }
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

    let menuHtml = '';
    let hasAnyTags = false;
    
    // Get enabled categories based on element type
    const enabledCategories = type === 'column'
        ? (window.enabledTagCategoriesColumn || {})
        : (window.enabledTagCategoriesTask || {});

    // Map group keys to config keys (kebab-case to camelCase)
    const groupKeyToConfigKey = (groupKey) => {
        // Convert kebab-case to camelCase: 'content-type-teaching' -> 'contentTypeTeaching'
        return groupKey.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    };

    // Dynamically generate menu for all groups in configuration
    Object.keys(tagConfig).forEach(groupKey => {
        // Skip the default group (contains column/card defaults, not tags)
        if (groupKey === 'default') return;

        // Check if this category is enabled for the current element type
        const configKey = groupKeyToConfigKey(groupKey);
        if (enabledCategories[configKey] !== true) {
            return; // Skip if NOT explicitly enabled
        }

        const groupValue = tagConfig[groupKey];

        // Check if this is a group (contains tag objects)
        if (groupValue && typeof groupValue === 'object') {
            let groupTags = [];

            // Check if this is a direct tag configuration (has any styling properties)
            const isDirectTag = groupValue.light || groupValue.dark || groupValue.headerBar ||
                               groupValue.border || groupValue.footerBar || groupValue.cornerBadge;

            if (isDirectTag) {
                // This is a single tag, not a group
                groupTags = [groupKey];
            } else {
                // This is a group, collect its tags
                Object.keys(groupValue).forEach(tagKey => {
                    const tagValue = groupValue[tagKey];
                    if (tagValue && typeof tagValue === 'object') {
                        // Check if this has any valid tag styling properties
                        const hasTagProperties = tagValue.light || tagValue.dark || tagValue.headerBar ||
                                                tagValue.border || tagValue.footerBar || tagValue.cornerBadge;
                        if (hasTagProperties) {
                            groupTags.push(tagKey);
                        }
                    }
                });
            }
            
            if (groupTags.length > 0) {
                hasAnyTags = true;

                // Use dynamic submenu generation - just add placeholder with data attributes
                // Count badges will be added dynamically by updateTagCategoryCounts() when menu opens
                const groupLabel = groupKey.charAt(0).toUpperCase() + groupKey.slice(1);
                menuHtml += `
                    <div class="donut-menu-item has-submenu" data-submenu-type="tags" data-group="${groupKey}" data-id="${id}" data-type="${type}" data-column-id="${columnId || ''}" style="display: flex; align-items: center;">
                        <span>${groupLabel}</span>
                    </div>
                `;
            }
        }
    });
    
    // Add user-added tags if any exist
    if (userAddedTags.length > 0) {
        hasAnyTags = true;
        // Count badges will be added dynamically by updateTagCategoryCounts() when menu opens

        menuHtml += `
            <div class="donut-menu-item has-submenu" data-submenu-type="tags" data-group="custom" data-id="${id}" data-type="${type}" data-column-id="${columnId || ''}" style="display: flex; align-items: center;">
                <span>Custom Tags</span>
            </div>
        `;
    }
    
    // Note: "Remove all tags" option is added dynamically by updateTagCategoryCounts() when tags are active

    // If no tags at all, show a message
    if (!hasAnyTags) {
        menuHtml = '<button class="donut-menu-item" disabled>No tags available</button>';
    }

    return menuHtml;
}




// Helper function to generate tag items for a group (horizontal layout)
function generateGroupTagItems(tags, id, type, columnId = null, isConfigured = true) {

    // Get current title to check which tags are active
    let currentTitle = '';
    if (type === 'column') {
        const column = window.cachedBoard?.columns?.find(c => c.id === id);
        currentTitle = column?.title || '';
    } else if (type === 'task' && columnId) {
        const column = window.cachedBoard?.columns?.find(c => c.id === columnId);
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
                    const editorBg = getEditorBackground();
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
        const column = window.cachedBoard?.columns?.find(c => c.id === id);
        currentTitle = column?.title || '';
    } else if (type === 'task' && columnId) {
        const column = window.cachedBoard?.columns?.find(c => c.id === columnId);
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
        const foldMode = window.columnFoldModes?.get(columnId) || getDefaultFoldMode(columnId);
        if (foldMode === 'vertical') {
            newColumnElement.classList.add('collapsed-vertical');
        } else {
            newColumnElement.classList.add('collapsed-horizontal');
        }
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

    const boardElement = getBoardElement();
    if (!boardElement) {
        console.error('Board element not found');
        return;
    }

    if (!window.cachedBoard) {
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

    if (!window.cachedBoard.columns) {
        window.cachedBoard.columns = [];
    }
    
    // Save current scroll positions - scope to board element for performance
    boardElement.querySelectorAll('.tasks-container').forEach(container => {
        const columnId = container.id.replace('tasks-', '');
        scrollPositions.set(columnId, container.scrollTop);
    });

    boardElement.innerHTML = '';

    // Check if board is valid (has proper kanban header)
    if (window.cachedBoard.valid === false) {
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

    /**
     * Removes empty kanban-column-stack containers and adds drop zones between remaining stacks/columns
     */
    function cleanupStacksAndAddDropZones(rowContainer) {
        // 1. Remove all empty kanban-column-stack elements
        const allStacks = rowContainer.querySelectorAll('.kanban-column-stack');
        allStacks.forEach(stack => {
            const columns = stack.querySelectorAll('.kanban-full-height-column');
            if (columns.length === 0) {
                stack.remove();
            }
        });

        // 2. Get all remaining children (stacks and single columns)
        const children = Array.from(rowContainer.children).filter(child =>
            child.classList.contains('kanban-column-stack') ||
            child.classList.contains('kanban-full-height-column')
        );

        if (children.length === 0) return;

        // 3. Insert drop zones before, between, and after stacks/columns
        // Insert before first element
        const firstDropZoneStack = createDropZoneStack('before');
        rowContainer.insertBefore(firstDropZoneStack, children[0]);

        // Insert between elements
        for (let i = 0; i < children.length - 1; i++) {
            const betweenDropZoneStack = createDropZoneStack('between');
            children[i].parentNode.insertBefore(betweenDropZoneStack, children[i].nextSibling);
        }

        // Insert after last element
        const lastDropZoneStack = createDropZoneStack('after');
        children[children.length - 1].parentNode.insertBefore(lastDropZoneStack, children[children.length - 1].nextSibling);
    }

    /**
     * Creates a drop zone stack wrapper with a drop zone inside
     */
    function createDropZoneStack(position) {
        const dropZoneStack = document.createElement('div');
        dropZoneStack.className = 'kanban-column-stack column-drop-zone-stack';

        const dropZone = document.createElement('div');
        dropZone.className = `column-drop-zone column-drop-zone-${position}`;

        dropZoneStack.appendChild(dropZone);
        return dropZoneStack;
    }

    // Detect number of rows from the board
    const detectedRows = detectRowsFromBoard(window.cachedBoard);
    const numRows = Math.max(currentLayoutRows, detectedRows);

    // Always use row containers (even for single row)
    boardElement.classList.add('multi-row');

    // Use DocumentFragment to batch DOM insertions for better performance
    const fragment = document.createDocumentFragment();

    // Sort columns by row first, then by their original index within each row
    // This ensures row 1 columns come before row 2 columns in the DOM
    const sortedColumns = window.cachedBoard.columns
        .map((column, index) => ({
            column,
            index,
            row: getColumnRow(column.title)
        }))
        .sort((a, b) => {
            // First sort by row number
            if (a.row !== b.row) {
                return a.row - b.row;
            }
            // Within same row, maintain original order
            return a.index - b.index;
        });

    // Group sorted columns by row
    const columnsByRow = {};
    for (let row = 1; row <= numRows; row++) {
        columnsByRow[row] = [];
    }

    sortedColumns.forEach(({ column, index, row }) => {
        columnsByRow[row].push({ column, index });
    });

    // Create row containers in order
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

            // Process columns in the order they appear in the board data
            columnsByRow[row].forEach(({ column, index }) => {
                const columnElement = createColumnElement(column, index);
                const isStacked = /#stack\b/i.test(column.title);

                if (isStacked && lastColumnElement) {
                    // This column should be stacked below the previous one
                    if (!currentStackContainer) {
                        // Create a new stack container and move the previous column into it
                        currentStackContainer = document.createElement('div');
                        currentStackContainer.className = 'kanban-column-stack';

                        // Replace the previous column's wrapper with the stack container
                        const lastWrapper = lastColumnElement.parentNode;
                        lastWrapper.parentNode.replaceChild(currentStackContainer, lastWrapper);
                        currentStackContainer.appendChild(lastColumnElement);
                    }

                    // Add the current stacked column to the stack
                    currentStackContainer.appendChild(columnElement);
                } else {
                    // Regular column - wrap in its own stack container
                    const stackContainer = document.createElement('div');
                    stackContainer.className = 'kanban-column-stack';
                    stackContainer.appendChild(columnElement);
                    rowContainer.appendChild(stackContainer);
                    currentStackContainer = null;
                    lastColumnElement = columnElement;
                }
            });

            // Clean up empty stacks and add drop zones
            cleanupStacksAndAddDropZones(rowContainer);

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

            fragment.appendChild(rowContainer);
        }

    // Append all rows at once to minimize reflows
    boardElement.appendChild(fragment);

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
        // Batch post-render operations to reduce DOM thrashing
        window.stackedColumnStylesTimeout = setTimeout(() => {
            // Apply stacked column styles
            applyStackedColumnStyles();

            // Re-apply column width after render to preserve user's UI settings
            if (window.currentColumnWidth && window.applyColumnWidth) {
                window.applyColumnWidth(window.currentColumnWidth, true); // Skip render to prevent loop
            }

            window.stackedColumnStylesTimeout = null;
        }, 50);
    }

    // Apply immediate visual updates to all elements with tags - done earlier for visual feedback
    setTimeout(() => {
        document.querySelectorAll('[data-all-tags]').forEach(element => {
            const tags = element.getAttribute('data-all-tags').split(' ').filter(tag => tag.trim());
            const elementType = element.classList.contains('kanban-full-height-column') ? 'column' : 'task';
            if (window.updateAllVisualTagElements) {
                window.updateAllVisualTagElements(element, tags, elementType);
            }
        });
    }, 20);

    // Setup compact view detection for ALL columns
    // DISABLED: Causes severe performance issues with expensive scroll handlers
    // - Runs querySelectorAll on every scroll event
    // - Calls getBoundingClientRect() forcing layout recalculations
    // - With 50 columns = 500 forced layouts per second during scroll
    // - Feature is currently disabled anyway (see setupCompactViewHandler)
    // TODO: Replace with IntersectionObserver for proper implementation
    // setupCompactViewHandler();
}

function getFoldAllButtonState(columnId) {
    if (!window.cachedBoard || !window.cachedBoard.columns) {return 'fold-mixed';}
    
    const column = window.cachedBoard.columns.find(c => c.id === columnId);
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
    if (!window.cachedBoard || !window.cachedBoard.columns) {
        return;
    }

    // Ensure state variables are initialized
    if (!window.collapsedTasks) {window.collapsedTasks = new Set();}
    if (!window.columnFoldStates) {window.columnFoldStates = new Map();}

    const column = window.cachedBoard.columns.find(c => c.id === columnId);
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

        // Only toggle if state needs to change (skip recalculation for bulk operation)
        if (shouldCollapse && !isCollapsed) {
            toggleTaskCollapse(taskId, true);
        } else if (!shouldCollapse && isCollapsed) {
            toggleTaskCollapse(taskId, true);
        }
    });

    // Recalculate once after all tasks are toggled
    if (typeof window.applyStackedColumnStyles === 'function') {
        window.applyStackedColumnStyles();
    }

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

        // Use displayTitle from backend (which already has include syntax removed)
        // If displayTitle is the filename without extension, don't show it again
        const fileNameWithoutExt = baseFileName.replace(/\.[^/.]+$/, '');
        const additionalTitle = (column.displayTitle && column.displayTitle !== fileNameWithoutExt) ? column.displayTitle : '';

        if (additionalTitle) {
            renderedTitle = `${linkHtml} ${renderMarkdown(additionalTitle)}`;
        } else {
            renderedTitle = linkHtml;
        }
    } else {
        // Normal column - use displayTitle or filter tags based on tagVisibility
        // Tags like #stack and #row will be rendered as <span class="kanban-tag"> by markdown
        displayTitle = column.displayTitle || (column.title ? window.filterTagsFromText(column.title) : '');
        renderedTitle = displayTitle ? renderMarkdown(displayTitle) : '';
    }

    // For editing, always use the full title including include syntax
    const editTitle = column.title || '';
    const foldButtonState = getFoldAllButtonState(column.id);

		// the column-header and column-title MUST be outside the column-inner to be able to be sticky over the full height!!!
    columnDiv.innerHTML = `
				<div class="column-offset"></div>
				<div class="column-margin"></div>
				<div class="column-header">
						${headerBarsHtml || ''}
				</div>
				<div class="column-title">
						${cornerBadgesHtml}
						<div class="column-title-section">
								<span class="drag-handle column-drag-handle" draggable="true">⋮⋮</span>
								<span class="collapse-toggle ${isCollapsed ? 'rotated' : ''}" data-column-id="${column.id}">▶</span>
								<div class="column-title-container">
										<div class="column-title-text markdown-content" onclick="handleColumnTitleClick(event, '${column.id}')">${renderedTitle}</div>
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
												${generateTagMenuItems(column.id, 'column', null)}
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
             data-task-index="${taskIndex}"${tagAttribute}${allTagsAttribute}
             style="${paddingTopStyle} ${paddingBottomStyle}">
            ${headerBarsHtml}
            ${cornerBadgesHtml}
            <div class="task-header">
                <div class="task-drag-handle" title="Drag to move task">⋮⋮</div>
                <span class="task-collapse-toggle ${isCollapsed ? 'rotated' : ''}" onclick="toggleTaskCollapse('${task.id}'); updateFoldAllButton('${columnId}')">▶</span>
                <div class="task-title-container" onclick="handleTaskTitleClick(event, this, '${task.id}', '${columnId}')">
                <div class="task-title-display markdown-content">${renderedTitle}</div>
                    <textarea class="task-title-edit"
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
                            <div class="donut-menu-item has-submenu" data-submenu-type="move" data-id="${task.id}" data-type="task">
                                Move
                            </div>
                            <div class="donut-menu-item has-submenu" data-submenu-type="move-to-list" data-id="${task.id}" data-type="task">
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
                        onclick="handleDescriptionClick(event, this, '${task.id}', '${columnId}')">${renderedDescription}</div>
                <textarea class="task-description-edit"
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
        columnElement.classList.contains('collapsed-vertical') ||
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
    const column = document.querySelector(`.kanban-full-height-column[data-column-id="${columnId}"]`);
    if (!column) {
        return 'horizontal'; // Fallback
    }

    // Check if column is in a stack
    const isInStack = column.closest('.kanban-column-stack') !== null;
    let defaultFoldMode = 'vertical'; // Default for non-stacked columns

    if (isInStack) {
        const stackElement = column.closest('.kanban-column-stack');
        if (stackElement) {
            const columnsInStack = stackElement.querySelectorAll('.kanban-full-height-column').length;
            // Multiple columns in stack: horizontal folding
            // Single column in stack: vertical folding
            defaultFoldMode = columnsInStack > 1 ? 'horizontal' : 'vertical';
        } else {
            // Fallback: if no stack element found, use horizontal for safety
            defaultFoldMode = 'horizontal';
        }
    }

    return defaultFoldMode;
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
    const column = document.querySelector(`.kanban-full-height-column[data-column-id="${columnId}"]`);
    if (!column) {
        console.error('[kanban.toggleColumnCollapse] Column element not found', {columnId});
        return;
    }

    const toggle = column.querySelector('.collapse-toggle');
    if (!toggle) {
        console.error('[kanban.toggleColumnCollapse] Collapse toggle not found in column', {columnId});
        return;
    }

    // Ensure state variables are initialized
    if (!window.collapsedColumns) {window.collapsedColumns = new Set();}
    if (!window.columnFoldModes) {window.columnFoldModes = new Map();}

    const isCurrentlyCollapsed = column.classList.contains('collapsed-vertical') ||
                                  column.classList.contains('collapsed-horizontal');

    // Determine if column is in a stack (has #stack tag or next column has #stack tag)
    const columnData = window.cachedBoard?.columns.find(c => c.id === columnId);
    const columnIndex = window.cachedBoard?.columns.findIndex(c => c.id === columnId);
    const nextColumn = columnIndex >= 0 ? window.cachedBoard?.columns[columnIndex + 1] : null;
    const isInStack = columnData?.tags?.includes('stack') || nextColumn?.tags?.includes('stack');

    // Determine default fold mode based on number of columns in stack
    let defaultFoldMode = 'vertical'; // Default for non-stacked columns
    let forceHorizontal = false; // Flag to enforce horizontal folding in multi-column stacks

    if (isInStack) {
        // Get the actual stack container this column is in
        const stackElement = column ? column.closest('.kanban-column-stack') : null;
        if (stackElement) {
            const columnsInStack = stackElement.querySelectorAll('.kanban-full-height-column').length;
            // Multiple columns in stack: ONLY allow horizontal folding
            if (columnsInStack > 1) {
                defaultFoldMode = 'horizontal';
                forceHorizontal = true;
            } else {
                // Single column in stack: vertical is allowed
                defaultFoldMode = 'vertical';
            }
        } else {
            // Fallback: if no stack element found, use horizontal for safety
            defaultFoldMode = 'horizontal';
        }
    }

    if (isCurrentlyCollapsed) {
        const currentMode = column.classList.contains('collapsed-vertical') ? 'vertical' : 'horizontal';

        if (event && event.altKey && !forceHorizontal) {
            // Alt+click while collapsed: switch fold direction (only if not forced horizontal)
            const newMode = currentMode === 'vertical' ? 'horizontal' : 'vertical';
            column.classList.remove('collapsed-vertical', 'collapsed-horizontal');
            column.classList.add(`collapsed-${newMode}`);
            window.columnFoldModes.set(columnId, newMode);
            // Stay collapsed, just rotated differently
        } else if (forceHorizontal && currentMode === 'vertical') {
            // Force conversion from vertical to horizontal if in multi-column stack
            column.classList.remove('collapsed-vertical', 'collapsed-horizontal');
            column.classList.add('collapsed-horizontal');
            window.columnFoldModes.set(columnId, 'horizontal');
            // Stay collapsed, just changed to horizontal
        } else {
            // Regular click while collapsed: unfold
            column.classList.remove('collapsed-vertical', 'collapsed-horizontal');
            toggle.classList.remove('rotated');
            window.collapsedColumns.delete(columnId);
            window.columnFoldModes.delete(columnId);
        }
    } else {
        // Currently unfolded - fold with mode based on Alt key
        let foldMode;
        if (event && event.altKey && !forceHorizontal) {
            // Alt+click while unfolded: fold to non-default mode (only if not forced horizontal)
            foldMode = defaultFoldMode === 'vertical' ? 'horizontal' : 'vertical';
        } else {
            // Regular click: fold to default mode (or forced mode)
            foldMode = defaultFoldMode;
        }

        column.classList.add(`collapsed-${foldMode}`);
        toggle.classList.add('rotated');
        window.collapsedColumns.add(columnId);
        window.columnFoldModes.set(columnId, foldMode);
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

/**
 * Apply special styling and positioning for stacked columns
 * Purpose:
 *   1. Group vertically-folded stacked columns horizontally
 *   2. Make headers sticky at different positions for expanded stacked columns
 * Used by: After any column fold/unfold operation, board rendering
 * Side effects: Adds/removes CSS classes, sets inline styles for header positions
 */
/**
 * Legacy function - calls both enforcement and height recalculation
 * For new code, use enforceFoldModesForStacks() and recalculateStackHeights() separately
 */
function applyStackedColumnStyles() {
    enforceFoldModesForStacks();
    recalculateStackHeights();

    // Update bottom drop zones after layout changes
    if (typeof window.updateStackBottomDropZones === 'function') {
        window.updateStackBottomDropZones();
    }
}
window.applyStackedColumnStyles = applyStackedColumnStyles;

/**
 * DEPRECATED - DO NOT USE - keeping for reference only
 * Use enforceFoldModesForStacks() and recalculateStackHeights() instead
 */
function _old_applyStackedColumnStyles() {
    const stacks = document.querySelectorAll('.kanban-column-stack');

    stacks.forEach(stack => {
        const columns = Array.from(stack.querySelectorAll('.kanban-full-height-column'));

        // ENFORCE: Multi-column stacks ONLY allow horizontal folding
        if (columns.length > 1) {
            columns.forEach(col => {
                if (col.classList.contains('collapsed-vertical')) {
                    // Convert any vertically-folded columns to horizontal
                    col.classList.remove('collapsed-vertical');
                    col.classList.add('collapsed-horizontal');

                    // Update stored fold mode
                    const columnId = col.getAttribute('data-column-id');
                    if (columnId && window.columnFoldModes) {
                        window.columnFoldModes.set(columnId, 'horizontal');
                    }
                }
            });
        }

        // ... old code removed, see _old_applyStackedColumnStyles for reference ...
    });
}

/**
 * Enforce horizontal folding for multi-column stacks
 * ONLY call when column structure changes (add/remove from stack, column fold/unfold)
 * @param {HTMLElement} stackElement - Specific stack to enforce, or null for all stacks
 */
function enforceFoldModesForStacks(stackElement = null) {
    const stacks = stackElement ? [stackElement] : document.querySelectorAll('.kanban-column-stack');

    stacks.forEach(stack => {
        const columns = Array.from(stack.querySelectorAll('.kanban-full-height-column'));

        // ENFORCE: Multi-column stacks ONLY allow horizontal folding
        if (columns.length > 1) {
            columns.forEach(col => {
                if (col.classList.contains('collapsed-vertical')) {
                    // Convert any vertically-folded columns to horizontal
                    col.classList.remove('collapsed-vertical');
                    col.classList.add('collapsed-horizontal');

                    // Update stored fold mode
                    const columnId = col.getAttribute('data-column-id');
                    if (columnId && window.columnFoldModes) {
                        window.columnFoldModes.set(columnId, 'horizontal');
                    }
                }
            });
        }
    });
}

/**
 * Recalculate stack heights and positions WITHOUT fold mode enforcement
 * Call this for most events (task moves, task folds, etc.)
 * @param {HTMLElement} stackElement - Specific stack to recalc, or null for all stacks
 */
// Debounced version to prevent excessive calls
let recalculateStackHeightsTimer = null;
let pendingStackElement = null;

function recalculateStackHeightsDebounced(stackElement = null) {
    // Store the stack element - if null is passed, it will recalculate all
    // If a specific stack is passed multiple times, we still only recalculate once
    if (stackElement === null) {
        pendingStackElement = null; // null means recalculate all
    } else if (pendingStackElement !== null) {
        // If we already have a specific stack pending and another specific stack is requested,
        // upgrade to recalculate all
        if (pendingStackElement !== stackElement) {
            pendingStackElement = null;
        }
    } else {
        pendingStackElement = stackElement;
    }

    if (recalculateStackHeightsTimer) {
        clearTimeout(recalculateStackHeightsTimer);
    }

    recalculateStackHeightsTimer = setTimeout(() => {
        recalculateStackHeightsImmediate(pendingStackElement);
        recalculateStackHeightsTimer = null;
        pendingStackElement = null;
    }, 150); // 150ms debounce delay
}

function recalculateStackHeightsImmediate(stackElement = null) {
    const stacks = stackElement ? [stackElement] : document.querySelectorAll('.kanban-column-stack');

    stacks.forEach(stack => {
        const columns = Array.from(stack.querySelectorAll('.kanban-full-height-column'));

        // Check if all columns in stack are vertically folded
        const allVerticalFolded = columns.length > 0 && columns.every(col =>
            col.classList.contains('collapsed-vertical')
        );

        if (allVerticalFolded) {
            // All columns vertically folded - display horizontally
            stack.classList.add('all-vertical-folded');
        } else {
            // At least one column is expanded or horizontally folded - display vertically
            stack.classList.remove('all-vertical-folded');

            // First pass: reset all padding/margins to get accurate natural heights
            columns.forEach(col => {
                col.style.paddingTop = '';
                const columnOffset = col.querySelector('.column-offset');
                if (columnOffset) {
                    columnOffset.style.marginTop = '';
                }
            });

            // Force a reflow to ensure padding reset takes effect
            void stack.offsetHeight;

            // Second pass: measure actual content heights
            const columnData = [];
            columns.forEach((col, idx) => {
                const isVerticallyFolded = col.classList.contains('collapsed-vertical');
                const isHorizontallyFolded = col.classList.contains('collapsed-horizontal');

                const columnHeader = col.querySelector('.column-header');
                const header = col.querySelector('.column-title');
                const footer = col.querySelector('.column-footer');
                const content = col.querySelector('.column-inner');

                // No need for individual reflows since we already forced one above on the parent stack

                const columnHeaderHeight = columnHeader ? columnHeader.offsetHeight : 0;
                const headerHeight = header ? header.offsetHeight : 0;
                const footerHeight = footer ? footer.offsetHeight : 0;
                const contentHeight = (isVerticallyFolded || isHorizontallyFolded) ? 0 : (content ? content.scrollHeight : 0);

                const footerBarsContainer = footer ? footer.querySelector('.stacked-footer-bars') : null;
                const footerBarsHeight = footerBarsContainer ? footerBarsContainer.offsetHeight : 0;

                const columnMargin = col.querySelector('.column-margin');
                const marginHeight = columnMargin ? columnMargin.offsetHeight : 4;

                const totalHeight = columnHeaderHeight + headerHeight + footerHeight + contentHeight;

                columnData.push({
                    col,
                    index: idx,
                    columnHeader,
                    header,
                    footer,
                    columnHeaderHeight,
                    headerHeight,
                    footerHeight,
                    contentHeight,
                    totalHeight,
                    footerBarsContainer,
                    footerBarsHeight,
                    marginHeight,
                    isVerticallyFolded,
                    isHorizontallyFolded
                });
            });

            // All columns (including both horizontally and vertically folded) are included in stacking calculations
            const expandedColumns = columnData;

            // Get current sticky stack mode
            const stickyMode = window.currentStickyStackMode || 'titleonly';
            const isFullMode = stickyMode === 'full';
            const isTitleOnlyMode = stickyMode === 'titleonly';
            const isNoneMode = stickyMode === 'none';

            // Third pass: Calculate all sticky positions based on mode
            // Note: HTML order is: margin, column-header, column-title, column-inner, column-footer
            let cumulativeStickyTop = 0;
            const positions = expandedColumns.map((data, expandedIdx) => {
                // Margin comes first in HTML
                const marginTop = cumulativeStickyTop;
                if (isFullMode) {
                    cumulativeStickyTop += data.marginHeight;
                }

                // Then column-header
                const columnHeaderTop = cumulativeStickyTop;
                if (isFullMode) {
                    cumulativeStickyTop += data.columnHeaderHeight;
                }

                // Then column-title
                const headerTop = cumulativeStickyTop;
                if (!isNoneMode) {
                    cumulativeStickyTop += data.headerHeight;
                }

                // Then column-footer
                const footerTop = cumulativeStickyTop;
                if (isFullMode) {
                    cumulativeStickyTop += data.footerHeight;
                }

                return {
                    ...data,
                    marginTop,
                    columnHeaderTop,
                    headerTop,
                    footerTop,
                    zIndex: 1000000 + (expandedColumns.length - expandedIdx)
                };
            });

            // Calculate bottom positions based on mode
            // Bottom to top order: footer, column-inner, column-title, column-header, margin
            let cumulativeFromBottom = 0;
            for (let i = expandedColumns.length - 1; i >= 0; i--) {
                // Footer is at the bottom
                const footerBottom = cumulativeFromBottom;
                if (isFullMode) {
                    cumulativeFromBottom += positions[i].footerHeight;
                }

                // Then column-title
                const headerBottom = cumulativeFromBottom;
                if (!isNoneMode) {
                    cumulativeFromBottom += positions[i].headerHeight;
                }

                // Then column-header
                const columnHeaderBottom = cumulativeFromBottom;
                if (isFullMode) {
                    cumulativeFromBottom += positions[i].columnHeaderHeight;
                }

                // Margin is at the top (furthest from bottom)
                const marginBottom = cumulativeFromBottom;
                if (isFullMode) {
                    cumulativeFromBottom += positions[i].marginHeight;
                }

                positions[i].marginBottom = marginBottom;
                positions[i].columnHeaderBottom = columnHeaderBottom;
                positions[i].headerBottom = headerBottom;
                positions[i].footerBottom = footerBottom;
            }

            // Calculate padding
            let cumulativePadding = 0;
            positions.forEach((pos, idx) => {
                pos.contentPadding = idx > 0 ? cumulativePadding : 0;
                cumulativePadding += pos.totalHeight + pos.marginHeight;
            });

            // Apply all calculated positions
            positions.forEach(({ col, index, columnHeader, header, footer, columnHeaderHeight, headerHeight, marginTop, columnHeaderTop, headerTop, footerTop, marginBottom, columnHeaderBottom, headerBottom, footerBottom, contentPadding, zIndex, marginHeight, isVerticallyFolded, isHorizontallyFolded }) => {
                col.dataset.columnHeaderTop = columnHeaderTop;
                col.dataset.headerTop = headerTop;
                col.dataset.footerTop = footerTop;
                col.dataset.columnHeaderBottom = columnHeaderBottom;
                col.dataset.headerBottom = headerBottom;
                col.dataset.footerBottom = footerBottom;
                col.dataset.zIndex = zIndex;

                // Store content area boundaries (absolute positions from top of page)
                // Content starts at bottom of header, ends at top of footer
                if (header && footer) {
                    const headerRect = header.getBoundingClientRect();
                    const footerRect = footer.getBoundingClientRect();
                    const scrollY = window.scrollY || window.pageYOffset;

                    col.dataset.contentAreaTop = scrollY + headerRect.bottom;
                    col.dataset.contentAreaBottom = scrollY + footerRect.top;
                }

                // Only apply sticky positioning and values to elements that are sticky in this mode
                if (columnHeader) {
                    if (isFullMode) {
                        columnHeader.style.position = 'sticky';
                        columnHeader.style.top = `${columnHeaderTop}px`;
                        columnHeader.style.bottom = `${columnHeaderBottom}px`;
                        columnHeader.style.zIndex = zIndex + 1;
                    } else {
                        columnHeader.style.position = 'relative';
                        columnHeader.style.top = '';
                        columnHeader.style.bottom = '';
                        columnHeader.style.zIndex = '';
                    }
                }

                if (header) {
                    if (!isNoneMode) {
                        header.style.position = 'sticky';
                        header.style.top = `${headerTop}px`;
                        header.style.bottom = `${headerBottom}px`;
                        header.style.zIndex = zIndex;
                    } else {
                        header.style.position = '';
                        header.style.top = '';
                        header.style.bottom = '';
                        header.style.zIndex = '';
                    }
                }

                if (footer) {
                    if (isFullMode) {
                        footer.style.position = 'sticky';
                        footer.style.top = `${footerTop}px`;
                        footer.style.bottom = `${footerBottom}px`;
                        footer.style.zIndex = zIndex;
                    } else {
                        footer.style.position = '';
                        footer.style.top = '';
                        footer.style.bottom = '';
                        footer.style.zIndex = '';
                    }
                }

                const columnOffset = col.querySelector('.column-offset');
                if (columnOffset) {
                    columnOffset.style.marginTop = contentPadding > 0 ? `${contentPadding}px` : '';
                }

                const columnMargin = col.querySelector('.column-margin');
                if (columnMargin) {
                    if (isFullMode) {
                        columnMargin.style.position = 'sticky';
                        columnMargin.style.top = `${marginTop}px`;
                        columnMargin.style.bottom = `${marginBottom}px`;
                        columnMargin.style.zIndex = zIndex;
                    } else {
                        columnMargin.style.position = '';
                        columnMargin.style.top = '';
                        columnMargin.style.bottom = '';
                        columnMargin.style.zIndex = '';
                    }
                }
            });

            // Update scroll handler data with all columns (including horizontally folded)
            window.stackedColumnsData = positions.map(pos => ({
                col: pos.col,
                headerHeight: pos.headerHeight,
                footerHeight: pos.footerHeight,
                totalHeight: pos.totalHeight
            }));
        }
    });
}

// Export new functions
window.enforceFoldModesForStacks = enforceFoldModesForStacks;
// Use debounced version by default for performance, but export immediate version too
window.recalculateStackHeights = recalculateStackHeightsDebounced;
window.recalculateStackHeightsImmediate = recalculateStackHeightsImmediate;

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
    // Use requestAnimationFrame throttling to prevent excessive calls
    let ticking = false;

    const updateScrollPositions = () => {
        if (!window.stackedColumnsData) return;

        const scrollY = window.scrollY || window.pageYOffset;
        const viewportHeight = window.innerHeight;
        const viewportBottom = scrollY + viewportHeight;
        const viewportTop = scrollY;

        window.stackedColumnsData.forEach(({ col, headerHeight, footerHeight, totalHeight }, idx) => {
            const header = col.querySelector('.column-title');
            const footer = col.querySelector('.column-footer');
            const columnInner = col.querySelector('.column-inner');

            if (!header || !footer) return;

            const headerBottom = parseFloat(col.dataset.headerBottom || 0);
            const footerBottom = parseFloat(col.dataset.footerBottom || 0);
            const zIndex = parseInt(col.dataset.zIndex || 100);
            const colIndex = col.dataset.columnIndex;

            const rect = col.getBoundingClientRect();
            const columnInnerPadding = columnInner ? parseFloat(window.getComputedStyle(columnInner).paddingTop) : 0;

            // Check if content area (between title bottom and footer top) is still within viewport
            // Use stored absolute positions from when layout was calculated
            const contentAreaTop = parseFloat(col.dataset.contentAreaTop || 0);
            const contentAreaBottom = parseFloat(col.dataset.contentAreaBottom || 0);
            const contentStillInView = contentAreaBottom >= viewportTop;

            if (!contentStillInView) {
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
            }

            // Compact view - detect column-inner visibility and apply scale
            if (columnInner) {
                const innerRect = columnInner.getBoundingClientRect();
                const innerTop = innerRect.top;
                const innerBottom = innerRect.bottom;
                const innerHeight = innerRect.height;

                // Calculate how much of column-inner is visible in viewport
                const visibleTop = Math.max(innerTop, viewportTop);
                const visibleBottom = Math.min(innerBottom, viewportBottom);
                const visibleHeight = Math.max(0, visibleBottom - visibleTop);
                const visibilityRatio = innerHeight > 0 ? visibleHeight / innerHeight : 1;

                // Get threshold from CSS variable
                const threshold = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--compact-visibility-threshold')) || 0.3;

                // Apply compact-view class when less than threshold is visible
                // DISABLED
                // if (visibilityRatio < threshold && innerHeight > 0) {
                //     col.classList.add('compact-view');
                // } else {
                //     col.classList.remove('compact-view');
                // }
            }
        });

        ticking = false;
    };

    const scrollHandler = () => {
        if (!ticking) {
            requestAnimationFrame(updateScrollPositions);
            ticking = true;
        }
    };

    // Store handler reference
    window.stackedColumnScrollHandler = scrollHandler;

    // Attach scroll listener
    window.addEventListener('scroll', scrollHandler, true);

    // Run once immediately
    updateScrollPositions();
}
window.setupStackedColumnScrollHandler = setupStackedColumnScrollHandler;

/**
 * Setup compact view handler for ALL columns (not just stacked)
 * Detects when column-inner is mostly outside viewport and adds compact-view class
 */
function setupCompactViewHandler() {
    // Remove existing handler if any
    if (window.compactViewScrollHandler) {
        window.removeEventListener('scroll', window.compactViewScrollHandler, true);
    }

    // Clear any existing debounce timer
    if (window.compactViewDebounceTimer) {
        clearTimeout(window.compactViewDebounceTimer);
    }

    const calculateCompactView = () => {
        const viewportHeight = window.innerHeight;

        // Get ALL columns on the board
        const allColumns = document.querySelectorAll('.kanban-full-height-column');

        allColumns.forEach(col => {
            const columnInner = col.querySelector('.column-inner');

            if (!columnInner) return;

            const innerRect = columnInner.getBoundingClientRect();
            const innerTop = innerRect.top;
            const innerBottom = innerRect.bottom;

            // Check if column-inner is COMPLETELY outside the viewport
            // getBoundingClientRect() is relative to viewport: 0 = top of screen, viewportHeight = bottom of screen
            // Compact view only when entire bounding box is out of view
            const isCompletelyAbove = innerBottom <= 0;
            const isCompletelyBelow = innerTop >= viewportHeight;
            const isCompletelyOutside = isCompletelyAbove || isCompletelyBelow;

            // Track if compact state changed
            const wasCompact = col.classList.contains('compact-view');
            const shouldBeCompact = isCompletelyOutside;

            // Apply compact-view class when less than threshold is visible
            // DISABLED
            // if (shouldBeCompact) {
            //     col.classList.add('compact-view');
            // } else {
            //     col.classList.remove('compact-view');
            // }

            // If compact state changed and column is in a stack, recalculate positions
            if (wasCompact !== shouldBeCompact) {
                const stack = col.closest('.kanban-column-stack');
                if (stack && typeof window.applyStackedColumnStyles === 'function') {
                    // Recalculate sticky positions for the stack
                    requestAnimationFrame(() => {
                        window.applyStackedColumnStyles();
                    });
                }
            }
        });
    };

    const scrollHandler = () => {
        // Clear existing timer
        if (window.compactViewDebounceTimer) {
            clearTimeout(window.compactViewDebounceTimer);
        }

        // Set new timer with 100ms debounce
        window.compactViewDebounceTimer = setTimeout(calculateCompactView, 100);
    };

    // Store handler reference
    window.compactViewScrollHandler = scrollHandler;

    // Attach scroll listener
    window.addEventListener('scroll', scrollHandler, true);

    // Run once immediately (no debounce for initial calculation)
    calculateCompactView();
}
window.setupCompactViewHandler = setupCompactViewHandler;

/**
 * Toggles a task between collapsed and expanded states
 * Purpose: Show/hide task description for cleaner view
 * Used by: Task fold button clicks
 * @param {string} taskId - ID of task to toggle
 * Side effects: Updates collapsedTasks set, DOM classes
 */
function toggleTaskCollapse(taskId, skipRecalculation = false) {
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

    // Recalculate stacked column heights after collapse/expand (unless skipped for bulk operations)
    if (!skipRecalculation && typeof window.applyStackedColumnStyles === 'function') {
        window.applyStackedColumnStyles();
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

    // Use DOM traversal from clicked element - this is guaranteed to be the correct column
    const columnElement = event.target.closest('.kanban-full-height-column');
    if (!columnElement) {
        console.error(`[handleColumnTitleClick] Could not find column element from click target`);
        return;
    }

    // Get the actual column ID from the DOM element (source of truth)
    const actualColumnId = columnElement.dataset.columnId;
    if (actualColumnId !== columnId) {
        console.warn(`[handleColumnTitleClick] Column ID mismatch - onclick: "${columnId}", DOM: "${actualColumnId}". Using DOM value.`);
        columnId = actualColumnId; // Use the DOM value as source of truth
    }

    if (isColumnCollapsed(columnElement)) {
        // Unfold the column first
        toggleColumnCollapse(columnId);
        // Use a short delay to allow the unfold animation to start, then enter edit mode
        setTimeout(() => {
            editColumnTitle(columnId, columnElement);
        }, 50);
    } else {
        // Column is already unfolded, edit immediately
        editColumnTitle(columnId, columnElement);
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
    const groups = [
        'status', 'type', 'priority', 'category', 'colors', 'importance',
        'workflow', 'organization',
        'content-type-teaching', 'content-type-product',
        'complexity', 'review-status', 'time-estimate',
        'testing-status', 'platform-teaching', 'platform-product',
        'version', 'impact'
    ];
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
                const editorBg = getEditorBackground();
                const bgDark = columnColors.backgroundDark || columnColors.background;
                
                const columnBg = interpolateColor(editorBg, bgDark, 0.15);

                // Default column header background
                styles += `.kanban-full-height-column:not([data-column-tag]) .column-header {
                    background-color: ${columnBg} !important;
                }\n`;

                styles += `.kanban-full-height-column:not([data-column-tag]) .column-title {
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

                styles += `.kanban-full-height-column.collapsed:not([data-column-tag]) .column-title {
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
                const editorBg = getEditorBackground();
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

                    // Highlight lines/paragraphs containing this tag in descriptions
                    // Only p and li elements, not the task-section div wrappers
                    const lineBgAlpha = themeColors.background + '20'; // Add 20 for ~12% opacity
                    styles += `.task-description-display p:has(.kanban-tag[data-tag="${lowerTagName}"]),
.task-description-display li:has(.kanban-tag[data-tag="${lowerTagName}"]) {
    background-color: ${lineBgAlpha} !important;
    border-left: 2px solid ${themeColors.background} !important;
    padding: 2px 4px !important;
    margin: 2px 0 !important;
    border-radius: 3px !important;
}\n`;

                    // Get the base background color (or use editor background as default)
                    const editorBg = getEditorBackground();
                    const bgDark = themeColors.backgroundDark || themeColors.background;
                    
                    // Column background styles - only for primary tag
                    // Interpolate 15% towards the darker color
                    const columnBg = interpolateColor(editorBg, bgDark, 0.15);
                    
                    // Column header background
                    styles += `.kanban-full-height-column[data-column-tag="${lowerTagName}"] .column-header {
                        background-color: ${columnBg} !important;
                    }\n`;

                    styles += `.kanban-full-height-column[data-column-tag="${lowerTagName}"] .column-title {
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

                    styles += `.kanban-full-height-column.collapsed[data-column-tag="${lowerTagName}"] .column-title {
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
                            styles += `.kanban-full-height-column[data-column-tag="${lowerTagName}"] .column-title {
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
                            styles += `.kanban-full-height-column[data-column-tag="${lowerTagName}"] .column-header {
                                border-left: ${borderWidth} ${borderStyle} ${borderColor} !important;
                                border-right: ${borderWidth} ${borderStyle} ${borderColor} !important;
                                border-top: ${borderWidth} ${borderStyle} ${borderColor} !important;
                            }\n
														.kanban-full-height-column[data-column-tag="${lowerTagName}"] .column-title {
                                border-left: ${borderWidth} ${borderStyle} ${borderColor} !important;
                                border-right: ${borderWidth} ${borderStyle} ${borderColor} !important;
                            }\n
														.kanban-full-height-column[data-column-tag="${lowerTagName}"] .column-inner {
                                border-left: ${borderWidth} ${borderStyle} ${borderColor} !important;
                                border-right: ${borderWidth} ${borderStyle} ${borderColor} !important;
                                border-bottom: none !important;
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
                            /* position: absolute; */
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
                            /* position: absolute; */
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
                     window.tagColors.colors || window.tagColors['dark-colors'] ||
                     window.tagColors['light-colors'] || window.tagColors['accessible-colors'] ||
                     window.tagColors.workflow ||
                     window.tagColors.organization || window.tagColors.importance ||
                     window.tagColors['content-type-teaching'] || window.tagColors['content-type-product'] ||
                     window.tagColors.complexity || window.tagColors['review-status'] ||
                     window.tagColors['time-estimate'] || window.tagColors['testing-status'] ||
                     window.tagColors['platform-teaching'] || window.tagColors['platform-product'] ||
                     window.tagColors.version || window.tagColors.impact;

    if (isGrouped) {
        // Process each group
        const groups = [
            'status', 'type', 'priority', 'category',
            'colors', 'dark-colors', 'light-colors', 'accessible-colors',
            'importance', 'workflow', 'organization',
            'content-type-teaching', 'content-type-product',
            'complexity', 'review-status', 'time-estimate',
            'testing-status', 'platform-teaching', 'platform-product',
            'version', 'impact'
        ];
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

    elementsToProcess.forEach((element, idx) => {
        const allTagsAttr = element.getAttribute('data-all-tags');
        let tags = allTagsAttr ? allTagsAttr.split(' ').filter(tag => tag.trim()) : [];
        const isColumn = element.classList.contains('kanban-full-height-column');
        const isCollapsed = isColumn && isColumnCollapsed(element);
        const isStacked = isColumn && element.closest('.kanban-column-stack');

        // Filter out tags that are ONLY in description (not in title) for task elements
        if (!isColumn) { // This is a task element
            const taskTitleDisplay = element.querySelector('.task-title-display');
            const taskDescDisplay = element.querySelector('.task-description-display');

            if (taskTitleDisplay && taskDescDisplay) {
                // Get tags from title
                const titleTags = new Set();
                taskTitleDisplay.querySelectorAll('.kanban-tag').forEach(tagSpan => {
                    const tagName = tagSpan.getAttribute('data-tag');
                    if (tagName) {
                        titleTags.add(tagName);
                    }
                });

                // Get tags from description
                const descriptionTags = new Set();
                taskDescDisplay.querySelectorAll('.kanban-tag').forEach(tagSpan => {
                    const tagName = tagSpan.getAttribute('data-tag');
                    if (tagName) {
                        descriptionTags.add(tagName);
                    }
                });

                // Only use tags that are in the title (even if also in description)
                // Filter out tags that are ONLY in description
                tags = tags.filter(tag => titleTags.has(tag) || !descriptionTags.has(tag));
            }
        }

        // Deduplicate tags array to prevent duplicate header/footer bars
        tags = [...new Set(tags)];

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

                // Don't set inline top style - let CSS handle layout via flexbox/normal flow
                // The header-bars-container uses flex layout, so bars stack naturally

                headerBars.push(headerBar);
                // Only add label class for columns, not for tasks
                if (config.headerBar.label && isColumn) {hasHeaderLabel = true;}
            }

            if (config && config.footerBar) {
                const footerBar = document.createElement('div');
                footerBar.className = `footer-bar footer-bar-${tag}`;

                // Don't set inline bottom style - let CSS handle layout via flexbox/normal flow
                // The footer-bars-container uses flex layout, so bars stack naturally

                footerBars.push(footerBar);
                // Only add label class for columns, not for tasks
                if (config.footerBar.label && isColumn) {hasFooterLabel = true;}
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
            // For non-collapsed columns, use column-header and column-footer
            if (isColumn) {
                const columnHeader = element.querySelector('.column-header');
                const columnFooter = element.querySelector('.column-footer');
                const isInStack = element.closest('.kanban-column-stack') !== null;

                if (columnHeader && headerBars.length > 0) {
                    // Create and insert header container at the beginning of column-header
                    const headerContainer = document.createElement('div');
                    headerContainer.className = 'header-bars-container';
                    headerBars.forEach(bar => headerContainer.appendChild(bar));
                    columnHeader.insertBefore(headerContainer, columnHeader.firstChild);
                    element.classList.add('has-header-bar');
                    if (hasHeaderLabel) {element.classList.add('has-header-label');}
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
                }
            } else {
                // For non-column elements (tasks), use appendChild and rely on CSS flexbox order
                if (headerBars.length > 0) {
                    const headerContainer = document.createElement('div');
                    headerContainer.className = 'header-bars-container';
                    headerBars.forEach(bar => headerContainer.appendChild(bar));
                    element.appendChild(headerContainer);
                    element.classList.add('has-header-bar');
                    if (hasHeaderLabel) {element.classList.add('has-header-label');}
                }

                if (footerBars.length > 0) {
                    const footerContainer = document.createElement('div');
                    footerContainer.className = 'footer-bars-container';
                    footerBars.forEach(bar => footerContainer.appendChild(bar));
                    element.appendChild(footerContainer);
                    element.classList.add('has-footer-bar');
                    if (hasFooterLabel) {element.classList.add('has-footer-label');}
                }
            }
        }
    });

    // Force a full reflow to ensure all bars are laid out
    void document.body.offsetHeight;
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
        const column = window.cachedBoard?.columns?.find(c => c.id === id);
        if (column) {
            currentTitle = column.title || '';
            element = column;
        }
    } else if (type === 'task' && columnId) {
        const column = window.cachedBoard?.columns?.find(c => c.id === columnId);
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
    const column = window.cachedBoard?.columns?.find(c => c.id === columnId);
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

window.handleLinkOrImageOpen = handleLinkOrImageOpen;
