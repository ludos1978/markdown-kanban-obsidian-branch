const vscode = acquireVsCodeApi();

// Global variables
let currentFileInfo = null;
let canUndo = false;
let canRedo = false;
window.currentImageMappings = {};
window.showRowTags = false;

// Document-specific folding state storage
let documentFoldingStates = new Map(); // Map<documentUri, {collapsedColumns: Set, collapsedTasks: Set, columnFoldStates: Map}>
let currentDocumentUri = null;

// Layout preferences
let currentColumnWidth = 'medium';
let currentLayoutRows = 1;

// Clipboard card source functionality
let clipboardCardData = null;

// Global mousedown handler - no longer needed
window.handleClipboardMouseDown = function(e) {
    // Empty - clipboard is read on focus and Cmd/Ctrl+C
};

// Global drag handler for clipboard card source
window.handleClipboardDragStart = function(e) {
    console.log('[CLIPBOARD DEBUG] Global drag handler fired!');
    console.log('[CLIPBOARD DEBUG] Current clipboardCardData:', clipboardCardData);
    
    // Create default data if no clipboard data
    if (!clipboardCardData) {
        console.log('[CLIPBOARD DEBUG] No clipboard data available, using default');
        clipboardCardData = {
            title: 'Clipboard Content',
            content: 'Drag to create card from clipboard',
            isLink: false
        };
    }
    
    // Create task data
    const tempTask = {
        id: 'temp-clipboard-' + Date.now(),
        title: clipboardCardData.title,
        description: clipboardCardData.content,
        isFromClipboard: true
    };
    
    // Set drag state
    if (window.dragState) {
        window.dragState.isDragging = true;
        window.dragState.draggedClipboardCard = tempTask;
        console.log('[CLIPBOARD DEBUG] Set dragState.draggedClipboardCard:', tempTask);
    }
    
    // Set drag data
    const dragData = JSON.stringify({
        type: 'clipboard-card',
        task: tempTask
    });
    e.dataTransfer.setData('text/plain', `CLIPBOARD_CARD:${dragData}`);
    e.dataTransfer.effectAllowed = 'copy';
    
    // Add visual feedback
    e.target.classList.add('dragging');
};

window.handleClipboardDragEnd = function(e) {
    console.log('[CLIPBOARD DEBUG] Global drag end handler fired!');
    
    // Clear visual feedback
    e.target.classList.remove('dragging');
    
    // Clear drag state
    if (window.dragState) {
        window.dragState.isDragging = false;
        window.dragState.draggedClipboardCard = null;
    }
};

async function readClipboardContent() {
    try {
        console.log('[CLIPBOARD DEBUG] Attempting to read clipboard');
        const text = await navigator.clipboard.readText();
        console.log('[CLIPBOARD DEBUG] Successfully read clipboard:', text);
        
        if (!text || text.trim() === '') {
            console.log('[CLIPBOARD DEBUG] Empty clipboard');
            return null;
        }
        
        const processed = await processClipboardText(text.trim());
        console.log('[CLIPBOARD DEBUG] Processed clipboard:', processed);
        return processed;
    } catch (error) {
        console.error('[CLIPBOARD DEBUG] Failed to read clipboard:', error);
        // Don't return error object, just null
        return null;
    }
}

async function processClipboardText(text) {
    // Check if it's a URL
    const urlRegex = /^https?:\/\/[^\s]+$/;
    if (urlRegex.test(text)) {
        try {
            // Try to fetch title from URL
            const title = await fetchUrlTitle(text);
            return {
                title: title || extractDomainFromUrl(text),
                content: `[${title || extractDomainFromUrl(text)}](${text})`,
                isLink: true
            };
        } catch (error) {
            // Fallback to domain name as title
            return {
                title: extractDomainFromUrl(text),
                content: `[${extractDomainFromUrl(text)}](${text})`,
                isLink: true
            };
        }
    }
    
    // Check if it contains a URL within text
    const urlInTextRegex = /https?:\/\/[^\s]+/g;
    if (urlInTextRegex.test(text)) {
        // Extract title from first line if available
        const lines = text.split('\n');
        const title = lines[0].length > 50 ? lines[0].substring(0, 50) + '...' : lines[0];
        
        return {
            title: title || 'Clipboard Content',
            content: text,
            isLink: false
        };
    }
    
    // Regular text content
    const lines = text.split('\n');
    const title = lines[0].length > 50 ? lines[0].substring(0, 50) + '...' : lines[0];
    
    return {
        title: title || 'Clipboard Content',
        content: text,
        isLink: false
    };
}

function extractDomainFromUrl(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace('www.', '');
    } catch (error) {
        return 'Link';
    }
}

async function fetchUrlTitle(url) {
    try {
        // Note: This will likely be blocked by CORS in most cases
        // But we'll try anyway, with a fallback to domain name
        const response = await fetch(url, { mode: 'cors' });
        const text = await response.text();
        const titleMatch = text.match(/<title[^>]*>([^<]*)<\/title>/i);
        return titleMatch ? titleMatch[1].trim() : null;
    } catch (error) {
        // CORS will usually block this, so we'll use domain as fallback
        return null;
    }
}

async function updateClipboardCardSource() {
    console.log('[CLIPBOARD DEBUG] Updating clipboard card source');
    clipboardCardData = await readClipboardContent();
    console.log('[CLIPBOARD DEBUG] Read clipboard data:', clipboardCardData);
    const clipboardSource = document.getElementById('clipboard-card-source');
    
    if (clipboardSource) {
        const iconSpan = clipboardSource.querySelector('.clipboard-icon');
        const textSpan = clipboardSource.querySelector('.clipboard-text');
        
        if (clipboardCardData && clipboardCardData.content) {
            clipboardSource.style.opacity = '1';
            clipboardSource.title = `Drag to create card: "${clipboardCardData.title}"`;
            
            // Show first 20 characters of clipboard content
            const preview = clipboardCardData.content.length > 20 
                ? clipboardCardData.content.substring(0, 20) + '...'
                : clipboardCardData.content;
            
            // Update visual indicator based on content type
            if (clipboardCardData.isLink) {
                iconSpan.textContent = '🔗';
                textSpan.textContent = `Link: ${preview}`;
            } else {
                iconSpan.textContent = '📋';
                textSpan.textContent = `Clip: ${preview}`;
            }
        } else {
            clipboardSource.style.opacity = '0.5';
            clipboardSource.title = 'No clipboard content available';
            
            iconSpan.textContent = '📋';
            textSpan.textContent = 'Clip';
        }
    }
}

function initializeClipboardCardSource() {
    const clipboardSource = document.getElementById('clipboard-card-source');
    console.log('[CLIPBOARD DEBUG] Initializing clipboard source:', clipboardSource);
    if (!clipboardSource) {
        console.error('[CLIPBOARD DEBUG] Clipboard source element not found!');
        return;
    }
    
    clipboardSource.addEventListener('dragstart', (e) => {
        console.log('[CLIPBOARD DEBUG] Drag start event fired');
        console.log('[CLIPBOARD DEBUG] e.target:', e.target);
        console.log('[CLIPBOARD DEBUG] e.currentTarget:', e.currentTarget);
        console.log('[CLIPBOARD DEBUG] clipboardCardData:', clipboardCardData);
        
        // For testing - create dummy data if no clipboard data
        if (!clipboardCardData) {
            console.log('[CLIPBOARD DEBUG] No clipboard data, creating test data');
            clipboardCardData = {
                title: 'Test Clipboard Card',
                content: 'This is a test card from clipboard',
                isLink: false
            };
        }
        
        // Create a temporary task object for the drag operation
        const tempTask = {
            id: 'temp-clipboard-' + Date.now(),
            title: clipboardCardData.title,
            description: clipboardCardData.content,
            isFromClipboard: true
        };
        
        console.log('[CLIPBOARD DEBUG] Setting drag data:', tempTask);
        
        // Store in drag data
        const dragData = JSON.stringify({
            type: 'clipboard-card',
            task: tempTask
        });
        
        // Use text/plain with a special prefix for clipboard cards
        // Custom MIME types don't work reliably across browsers
        e.dataTransfer.setData('text/plain', `CLIPBOARD_CARD:${dragData}`);
        e.dataTransfer.effectAllowed = 'copy';
        
        console.log('[CLIPBOARD DEBUG] Drag data set:', dragData);
        
        // Set drag state to prevent interference with internal drag detection
        console.log('[CLIPBOARD DEBUG] window.dragState before setting:', window.dragState);
        if (window.dragState) {
            window.dragState.isDragging = true;
            window.dragState.draggedClipboardCard = tempTask;
            console.log('[CLIPBOARD DEBUG] window.dragState after setting:', window.dragState);
        } else {
            console.error('[CLIPBOARD DEBUG] window.dragState is not available!');
        }
        
        clipboardSource.classList.add('dragging');
    });
    
    clipboardSource.addEventListener('dragend', (e) => {
        clipboardSource.classList.remove('dragging');
        
        // Clear drag state
        if (window.dragState) {
            window.dragState.isDragging = false;
            window.dragState.draggedClipboardCard = null;
        }
    });
}

// Function to toggle file bar menu
function toggleFileBarMenu(event, button) {
    event.stopPropagation();
    const menu = button.parentElement;
    const wasActive = menu.classList.contains('active');
    
    // Close all menus
    document.querySelectorAll('.file-bar-menu').forEach(m => {
        m.classList.remove('active');
    });
    document.querySelectorAll('.donut-menu').forEach(m => {
        m.classList.remove('active');
    });
    
    // Toggle this menu
    if (!wasActive) {
        menu.classList.add('active');
    }
}

// Function to set column width
function setColumnWidth(size) {
    currentColumnWidth = size;
    
    let width = '350px'; // default medium
    switch(size) {
        case 'small':
            width = '250px';
            break;
        case 'medium':
            width = '350px';
            break;
        case 'wide':
            width = '450px';
            break;
    }
    
    document.documentElement.style.setProperty('--column-width', width);
    
    // Store preference
    vscode.postMessage({ 
        type: 'setPreference', 
        key: 'columnWidth', 
        value: size 
    });
    
    // Close menu
    document.querySelectorAll('.file-bar-menu').forEach(m => {
        m.classList.remove('active');
    });
    
    vscode.postMessage({ type: 'showMessage', text: `Column width set to ${size}` });
}



// Function to set layout rows
function setLayoutRows(rows) {
    console.log(`setLayoutRows ${rows}`);

    currentLayoutRows = rows;
    
    // Re-render the board to apply row layout
    if (currentBoard) {
        renderBoard();
    }
    
    // Store preference
    vscode.postMessage({ 
        type: 'setPreference', 
        key: 'layoutRows', 
        value: rows 
    });
    
    // Close menu
    document.querySelectorAll('.file-bar-menu').forEach(m => {
        m.classList.remove('active');
    });
    
    vscode.postMessage({ type: 'showMessage', text: `Layout set to ${rows} row${rows > 1 ? 's' : ''}` });
}

// Function to detect row tags from board
function detectRowsFromBoard(board) {
    if (!board || !board.columns) return 1;
    
    let maxRow = 1;
    board.columns.forEach(column => {
        if (column.title) {
            const rowMatch = column.title.match(/#row(\d+)/i);
            if (rowMatch) {
                const rowNum = parseInt(rowMatch[1]);
                if (rowNum > maxRow) {
                    maxRow = rowNum;
                }
            }
        }
    });
    
    return Math.min(maxRow, 4); // Cap at 4 rows
}

// Function to get column row from title
function getColumnRow(title) {
    if (!title) return 1;
    
    // More comprehensive regex to find row tags
    const rowMatches = title.match(/#row(\d+)\b/gi);
    if (rowMatches && rowMatches.length > 0) {
        // Get the last match in case there are multiple (shouldn't happen, but just in case)
        const lastMatch = rowMatches[rowMatches.length - 1];
        const rowNum = parseInt(lastMatch.replace(/#row/i, ''));
        return Math.min(Math.max(rowNum, 1), 4); // Ensure it's between 1 and 4
    }
    return 1;
}

// Function to update column row tag
function updateColumnRowTag(columnId, newRow) {
    if (!currentBoard || !currentBoard.columns) return;
    
    const column = currentBoard.columns.find(c => c.id === columnId);
    if (!column) return;
    
    // Remove ALL existing row tags - more comprehensive regex patterns
    let cleanTitle = column.title
        .replace(/#row\d+\b/gi, '')  // Remove #row followed by digits
        .replace(/\s+#row\d+/gi, '')  // Remove with preceding space
        .replace(/#row\d+\s+/gi, '')  // Remove with following space
        .replace(/\s+#row\d+\s+/gi, '');  // Remove with following and preceding space
    
    // Update the column title
    if (newRow > 1) {
        // Add row tag for rows 2, 3, 4
        column.title = cleanTitle + ` #row${newRow}`;
    } else {
        // For row 1, just use the clean title without any row tag
        column.title = cleanTitle;
    }
    
    console.log(`Updated column "${columnId}" from "${column.title}" to row ${newRow}. New title: "${column.title}"`);
    
    // Update the visual element immediately
    const columnElement = document.querySelector(`[data-column-id="${columnId}"]`);
    if (columnElement) {
        columnElement.setAttribute('data-row', newRow);
        
        // Update the displayed title
        const titleElement = columnElement.querySelector('.column-title');
        if (titleElement) {
            const displayTitle = column.title.replace(/#row\d+/gi, '').trim();
            const renderedTitle = displayTitle ? renderMarkdown(displayTitle) : '<span class="task-title-placeholder">Add title...</span>';
            const rowIndicator = newRow > 1 ? `<span class="column-row-tag">Row ${newRow}</span>` : '';
            titleElement.innerHTML = renderedTitle + rowIndicator;
        }
        
        // Update the edit textarea
        const editElement = columnElement.querySelector('.column-title-edit');
        if (editElement) {
            editElement.value = column.title;
        }
    }
    
    // Send update to backend
    vscode.postMessage({
        type: 'editColumnTitle',
        columnId: columnId,
        title: cleanTitle
    });
}

// Function to clean up any duplicate or invalid row tags
function cleanupRowTags() {
    if (!currentBoard || !currentBoard.columns) return;
    
    let needsUpdate = false;
    
    currentBoard.columns.forEach(column => {
        const originalTitle = column.title;
        
        // Find all row tags
        const rowTags = column.title.match(/#row\d+\b/gi) || [];
        
        if (rowTags.length > 1) {
            // Multiple row tags found - keep only the last one
            console.log(`Cleaning up multiple row tags in column "${column.id}": ${rowTags.join(', ')}`);
            
            // Remove all row tags first
            let cleanTitle = column.title;
            rowTags.forEach(tag => {
                cleanTitle = cleanTitle.replace(new RegExp(tag, 'gi'), '');
            });
            cleanTitle = cleanTitle.replace(/\s{2,}/g, ' ').trim();
            
            // Add back only the last tag
            const lastTag = rowTags[rowTags.length - 1];
            column.title = cleanTitle + ' ' + lastTag;
            
            if (column.title !== originalTitle) {
                needsUpdate = true;
                console.log(`Cleaned column title from "${originalTitle}" to "${column.title}"`);
            }
        }
    });
    
    if (needsUpdate) {
        // Trigger a board update if we made changes
        renderBoard();
    }
}

// Function to get current document folding state
function getCurrentDocumentFoldingState() {
    if (!currentDocumentUri) return null;
    
    if (!documentFoldingStates.has(currentDocumentUri)) {
        // Initialize empty state for new document
        documentFoldingStates.set(currentDocumentUri, {
            collapsedColumns: new Set(),
            collapsedTasks: new Set(),
            columnFoldStates: new Map(),
            globalColumnFoldState: 'fold-mixed',
            isInitialized: false
        });
    }
    
    return documentFoldingStates.get(currentDocumentUri);
}

// Function to save current folding state to document storage
function saveCurrentFoldingState() {
    if (!currentDocumentUri || !window.collapsedColumns) return;
    
    const state = getCurrentDocumentFoldingState();
    if (!state) return;
    
    // Copy current state
    state.collapsedColumns = new Set(window.collapsedColumns);
    state.collapsedTasks = new Set(window.collapsedTasks);
    state.columnFoldStates = new Map(window.columnFoldStates);
    state.globalColumnFoldState = window.globalColumnFoldState;
    state.isInitialized = true;
    
    console.log(`Saved folding state for document: ${currentDocumentUri}`, state);
}

// Function to restore folding state from document storage
function restoreFoldingState() {
    if (!currentDocumentUri) return false;
    
    const state = getCurrentDocumentFoldingState();
    if (!state) return false;
    
    // Initialize global folding variables if they don't exist
    if (!window.collapsedColumns) window.collapsedColumns = new Set();
    if (!window.collapsedTasks) window.collapsedTasks = new Set();
    if (!window.columnFoldStates) window.columnFoldStates = new Map();
    if (!window.globalColumnFoldState) window.globalColumnFoldState = 'fold-mixed';
    
    if (state.isInitialized) {
        // Restore saved state
        window.collapsedColumns = new Set(state.collapsedColumns);
        window.collapsedTasks = new Set(state.collapsedTasks);
        window.columnFoldStates = new Map(state.columnFoldStates);
        window.globalColumnFoldState = state.globalColumnFoldState;
        
        console.log(`Restored folding state for document: ${currentDocumentUri}`, state);
        return true;
    }
    
    return false; // Don't apply default folding here
}

// Function to apply default folding (empty columns folded) - only for truly new documents
function applyDefaultFoldingToNewDocument() {
    if (!currentBoard || !currentBoard.columns) return;
    
    console.log('Applying default folding for new document - empty columns will be collapsed');
    
    // Don't reset existing state, just add empty columns to collapsed set
    currentBoard.columns.forEach(column => {
        if (!column.tasks || column.tasks.length === 0) {
            window.collapsedColumns.add(column.id);
            console.log(`Auto-folding empty column: ${column.title} (${column.id})`);
        }
    });
    
    // Mark this document as initialized so we don't apply defaults again
    const state = getCurrentDocumentFoldingState();
    if (state) {
        state.isInitialized = true;
    }
}

// Function to update document URI and manage state
function updateDocumentUri(newUri) {
    if (currentDocumentUri !== newUri) {
        // Save current state before switching
        if (currentDocumentUri) {
            saveCurrentFoldingState();
        }
        
        currentDocumentUri = newUri;
        console.log(`Switched to document: ${currentDocumentUri}`);
        
        // Try to restore state for the new document
        const hadSavedState = restoreFoldingState();
        
        // If no saved state exists and board is ready, apply defaults for new document
        if (!hadSavedState && currentBoard && currentBoard.columns) {
            applyDefaultFoldingToNewDocument();
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Theme observer is set up later in the file
    
    // Initialize clipboard card source
    console.log('[CLIPBOARD DEBUG] Initializing clipboard functionality');
    initializeClipboardCardSource();
    
    // Update clipboard content when window gets focus
    console.log('[CLIPBOARD DEBUG] Setting up focus event listener');
    window.addEventListener('focus', async () => {
        console.log('[CLIPBOARD DEBUG] Window focus event fired');
        await updateClipboardCardSource();
    });
    
    // Listen for Cmd/Ctrl+C to update clipboard
    console.log('[CLIPBOARD DEBUG] Setting up keydown event listener');
    document.addEventListener('keydown', async (e) => {
        console.log('[CLIPBOARD DEBUG] Keydown detected:', e.key, 'metaKey:', e.metaKey, 'ctrlKey:', e.ctrlKey);
        // Check for Cmd+C (Mac) or Ctrl+C (Windows/Linux)
        if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
            console.log('[CLIPBOARD DEBUG] Cmd/Ctrl+C detected, waiting for clipboard to update');
            // Wait a bit for the clipboard to be updated
            setTimeout(async () => {
                console.log('[CLIPBOARD DEBUG] Reading clipboard after copy');
                try {
                    const text = await navigator.clipboard.readText();
                    console.log('[CLIPBOARD DEBUG] Direct clipboard read result:', text);
                    if (text && text.trim()) {
                        clipboardCardData = {
                            title: text.trim().substring(0, 50),
                            content: text.trim(),
                            isLink: false
                        };
                        console.log('[CLIPBOARD DEBUG] Set clipboardCardData from Ctrl+C:', clipboardCardData);
                        updateClipboardCardSource();
                    }
                } catch (error) {
                    console.error('[CLIPBOARD DEBUG] Failed to read clipboard after Ctrl+C:', error);
                    // Try fallback - set dummy content to test the UI
                    clipboardCardData = {
                        title: 'Test Content',
                        content: 'This is test clipboard content from Ctrl+C',
                        isLink: false
                    };
                    updateClipboardCardSource();
                }
            }, 200);
        }
    });
    
    // Initial clipboard check
    setTimeout(async () => {
        console.log('[CLIPBOARD DEBUG] Initial clipboard check');
        await updateClipboardCardSource();
    }, 1000); // Delay to ensure everything is initialized
    
    // Add a simple test to verify clipboard functionality is working
    setTimeout(() => {
        console.log('[CLIPBOARD DEBUG] Testing clipboard functionality...');
        const clipboardSource = document.getElementById('clipboard-card-source');
        if (clipboardSource) {
            console.log('[CLIPBOARD DEBUG] Clipboard source found, testing update');
            // Force update with test data
            clipboardCardData = {
                title: 'Test Update',
                content: 'Testing clipboard update functionality',
                isLink: false
            };
            // Update UI without trying to read clipboard again
            const iconSpan = clipboardSource.querySelector('.clipboard-icon');
            const textSpan = clipboardSource.querySelector('.clipboard-text');
            
            if (iconSpan && textSpan) {
                const preview = clipboardCardData.content.length > 20 
                    ? clipboardCardData.content.substring(0, 20) + '...'
                    : clipboardCardData.content;
                
                iconSpan.textContent = '📋';
                textSpan.textContent = `Clip: ${preview}`;
                clipboardSource.style.opacity = '1';
                clipboardSource.title = `Drag to create card: "${clipboardCardData.title}"`;
                console.log('[CLIPBOARD DEBUG] Updated button text to:', `Clip: ${preview}`);
            }
        } else {
            console.error('[CLIPBOARD DEBUG] Clipboard source not found!');
        }
    }, 2000);
    
    // Add click handler to read clipboard (user interaction required for clipboard API)
    const clipboardSource = document.getElementById('clipboard-card-source');
    if (clipboardSource) {
        clipboardSource.addEventListener('click', async () => {
            console.log('[CLIPBOARD DEBUG] Click event - reading clipboard');
            try {
                const text = await navigator.clipboard.readText();
                console.log('[CLIPBOARD DEBUG] Successfully read clipboard:', text);
                if (text && text.trim()) {
                    clipboardCardData = await processClipboardText(text.trim());
                    console.log('[CLIPBOARD DEBUG] Updated clipboardCardData:', clipboardCardData);
                    await updateClipboardCardSource();
                }
            } catch (error) {
                console.error('[CLIPBOARD DEBUG] Failed to read clipboard on click:', error);
            }
        });
    }
 
    // Global Alt+click handler for links/images (as fallback)
    document.addEventListener('click', (e) => {
        // Only handle Alt+click for opening links/images
        if (!e.altKey) return;
        
        // Check if we're in a kanban element that has its own handler
        if (e.target.closest('.column-title') || 
            e.target.closest('.task-title-container') || 
            e.target.closest('.task-description-container')) {
            return; // Let the specific handlers deal with it
        }
        
        // For other areas, handle Alt+click to open
        window.handleLinkOrImageOpen && window.handleLinkOrImageOpen(e, e.target);
    }, false);

    // Close menus when clicking outside (but don't interfere with editing)
    document.addEventListener('click', (e) => {
        // Check if clicking outside menus
        if (!e.target.closest('.donut-menu') && !e.target.closest('.file-bar-menu')) {
            // Flush any pending tag changes before closing menus
            if (typeof flushPendingTagChanges === 'function' && 
                window.pendingTagChanges && 
                (window.pendingTagChanges.columns.size + window.pendingTagChanges.tasks.size > 0)) {
                flushPendingTagChanges();
            }
            
            // Close all menus
            document.querySelectorAll('.donut-menu').forEach(menu => {
                menu.classList.remove('active');
            });
            document.querySelectorAll('.file-bar-menu').forEach(menu => {
                menu.classList.remove('active');
            });
        }
    });

    // Modal event listeners
    document.getElementById('input-modal').addEventListener('click', e => {
        if (e.target.id === 'input-modal') {
            closeInputModal();
        }
    });

    // Request initial board data and file info
    setTimeout(() => {
        if (!currentBoard || !currentBoard.columns || currentBoard.columns.length === 0) {
            vscode.postMessage({ type: 'requestBoardUpdate' });
        }
        if (!currentFileInfo) {
            vscode.postMessage({ type: 'requestFileInfo' });
        }
    }, 100);
    
    // Setup drag and drop
    setupDragAndDrop();
});

// Helper function to check if we're currently in editing mode
function isCurrentlyEditing() {
    return window.taskEditor && window.taskEditor.currentEditor && 
           window.taskEditor.currentEditor.element && 
           window.taskEditor.currentEditor.element.style.display !== 'none';
}

// Also request update when window becomes visible again
window.addEventListener('focus', () => {
    // Only request update if not currently editing
    if (!isCurrentlyEditing() && (!currentBoard || !currentBoard.columns || currentBoard.columns.length === 0)) {
        vscode.postMessage({ type: 'requestBoardUpdate' });
    }
});

// Listen for messages from the extension
window.addEventListener('message', event => {
    const message = event.data;
    console.log('Received message:', message);
    
    switch (message.type) {
        case 'updateBoard':
            console.log('Updating board with:', message.board);
            const previousBoard = currentBoard;
            currentBoard = message.board;
            window.currentBoard = currentBoard;

            // Clean up any duplicate row tags
            cleanupRowTags();
            
            // Detect rows from board
            const detectedRows = detectRowsFromBoard(currentBoard);
            if (detectedRows > currentLayoutRows) {
                setLayoutRows(detectedRows);
            }
            
            if (message.imageMappings) {
                window.currentImageMappings = message.imageMappings;
                console.log('Received image mappings:', window.currentImageMappings);
            }            

            // Update whitespace with the value from configuration
            if (message.whitespace) {
                updateWhitespace(message.whitespace);
            } else {
                updateWhitespace('4px'); // Default fallback
            }

            // Update max row height
            if (typeof message.maxRowHeight !== 'undefined') {
                updateMaxRowHeight(message.maxRowHeight);
            }

            // Store tag colors globally - THIS IS CRITICAL
            if (message.tagColors) {
                window.tagColors = message.tagColors;
                console.log('Received tag colors:', window.tagColors);
                // Apply styles immediately when we receive new colors
                if (typeof applyTagStyles === 'function') {
                    applyTagStyles();
                }
            }
            
            // Store showRowTags configuration
            if (typeof message.showRowTags !== 'undefined') {
                window.showRowTags = message.showRowTags;
                console.log('Show row tags:', window.showRowTags);
            }
            
            // Save folding state before re-render
            saveCurrentFoldingState();
            
            // Check if we should preserve editing state
            const isEditing = window.taskEditor && window.taskEditor.currentEditor;
            if (!isEditing) {
                // Only render if not editing
                debouncedRenderBoard();
            } else {
                console.log('Skipping render update - currently editing');
            }
            break;
        case 'updateFileInfo':
            console.log('Updating file info with:', message.fileInfo);
            const previousDocumentPath = currentFileInfo?.documentPath;
            currentFileInfo = message.fileInfo;
            
            // Only update document URI if it actually changed
            if (currentFileInfo && currentFileInfo.documentPath && 
                currentFileInfo.documentPath !== previousDocumentPath) {
                updateDocumentUri(currentFileInfo.documentPath);
            }
            
            updateFileInfoBar();
            break;
        case 'undoRedoStatus':
            console.log('Undo/Redo status:', message);
            canUndo = message.canUndo;
            canRedo = message.canRedo;
            updateUndoRedoButtons();
            break;
        case 'insertFileLink':
            console.log('Insert file link:', message.fileInfo);
            insertFileLink(message.fileInfo);
            break;
    }
});

// Watch for theme changes and update styles
if (typeof MutationObserver !== 'undefined') {
    const themeObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                // Check if the body class actually changed (theme change)
                updateTagStylesForTheme();
            }
        });
    });
    
    // Start observing when DOM is ready
    if (document.body) {
        themeObserver.observe(document.body, {
            attributes: true,
            attributeFilter: ['class']
        });
    }
}

// Also request update when window becomes visible again
window.addEventListener('focus', () => {
    if (!currentBoard || !currentBoard.columns || currentBoard.columns.length === 0) {
        vscode.postMessage({ type: 'requestBoardUpdate' });
    }
});

// Keyboard shortcuts for search
document.addEventListener('keydown', (e) => {
    const activeElement = document.activeElement;
    const isEditing = activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' || 
        activeElement.classList.contains('column-title-edit') ||
        activeElement.classList.contains('task-title-edit') ||
        activeElement.classList.contains('task-description-edit')
    );
    
    // Don't trigger search shortcuts when editing (except when in search input)
    const isInSearchInput = activeElement && activeElement.id === 'search-input';
    
    // Ctrl+F or Cmd+F to open search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f' && !isEditing) {
        e.preventDefault();
        kanbanSearch.openSearch();
        return;
    }
    
    // Handle search-specific shortcuts when search panel is open
    if (kanbanSearch && kanbanSearch.isSearching) {
        // Escape to close search
        if (e.key === 'Escape') {
            e.preventDefault();
            kanbanSearch.closeSearch();
            return;
        }
        
        // Enter for next result (when in search input)
        if (e.key === 'Enter' && isInSearchInput && !e.shiftKey) {
            e.preventDefault();
            kanbanSearch.nextResult();
            return;
        }
        
        // Shift+Enter for previous result (when in search input)
        if (e.key === 'Enter' && isInSearchInput && e.shiftKey) {
            e.preventDefault();
            kanbanSearch.previousResult();
            return;
        }
        
        // F3 for next result
        if (e.key === 'F3' && !e.shiftKey) {
            e.preventDefault();
            kanbanSearch.nextResult();
            return;
        }
        
        // Shift+F3 for previous result
        if (e.key === 'F3' && e.shiftKey) {
            e.preventDefault();
            kanbanSearch.previousResult();
            return;
        }
    }
    
    // Original undo/redo shortcuts (keep these)
    if (!isEditing && !isInSearchInput) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
        }
        else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
            e.preventDefault();
            redo();
        }
    }
});

// Undo/Redo functions
function undo() {
    if (canUndo) {
        vscode.postMessage({ type: 'undo' });
    }
}

function redo() {
    if (canRedo) {
        vscode.postMessage({ type: 'redo' });
    }
}

function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    
    if (undoBtn) {
        undoBtn.disabled = !canUndo;
        undoBtn.style.opacity = canUndo ? '1' : '0.5';
    }
    
    if (redoBtn) {
        redoBtn.disabled = !canRedo;
        redoBtn.style.opacity = canRedo ? '1' : '0.5';
    }
}

function insertFileLink(fileInfo) {
    console.log('[DROP DEBUG] insertFileLink called with:', fileInfo);
    
    const { fileName, relativePath, isImage } = fileInfo;
    let activeEditor = getActiveTextEditor();
    
    console.log('[DROP DEBUG] Current active editor:', activeEditor);

    // Create markdown link with ORIGINAL relative path
    let markdownLink;
    if (isImage) {
        const altText = fileName.split('.')[0];
        markdownLink = `![${altText}](${relativePath})`;
    } else {
        markdownLink = `[${fileName}](${relativePath})`;
    }
    
    if (activeEditor && activeEditor.element && 
        document.contains(activeEditor.element) && 
        activeEditor.element.style.display !== 'none') {
        
        // Insert at current cursor position
        const element = activeEditor.element;
        const cursorPos = element.selectionStart || activeEditor.cursorPosition || 0;
        const currentValue = element.value;
        
        const newValue = currentValue.slice(0, cursorPos) + markdownLink + currentValue.slice(cursorPos);
        element.value = newValue;
        
        // Update cursor position
        const newCursorPos = cursorPos + markdownLink.length;
        element.setSelectionRange(newCursorPos, newCursorPos);
        
        // Trigger input event to auto-resize if needed
        element.dispatchEvent(new Event('input'));
        if (typeof autoResize === 'function') {
            autoResize(element);
        }
        
        // FOR IMAGES: Also add to the other field if needed
        if (isImage && (activeEditor.type === 'task-title' || activeEditor.type === 'task-description')) {
            const taskItem = element.closest('.task-item');
            const otherField = activeEditor.type === 'task-title' ? 
                taskItem.querySelector('.task-description-edit') : 
                taskItem.querySelector('.task-title-edit');
            
            if (otherField) {
                const otherValue = otherField.value;
                otherField.value = otherValue ? `${otherValue}\n${markdownLink}` : markdownLink;
                otherField.dispatchEvent(new Event('input'));
                if (typeof autoResize === 'function') {
                    autoResize(otherField);
                }
            }
        }
        
        // Focus back on the element
        element.focus();
        
        // Save the changes immediately
        setTimeout(() => {
            if (element.classList.contains('task-title-edit') || element.classList.contains('task-description-edit')) {
                if (taskEditor.currentEditor && taskEditor.currentEditor.element === element) {
                    taskEditor.save();
                }
            } else if (element.classList.contains('column-title-edit')) {
                element.blur();
            }
        }, 50);
        
        vscode.postMessage({ type: 'showMessage', text: `Inserted ${isImage ? 'image' : 'file'} link: ${fileName}` });
    } else {
        // Create new task with the file link
        createNewTaskWithContent(markdownLink, fileInfo.dropPosition, isImage ? markdownLink : '');
        vscode.postMessage({ type: 'showMessage', text: `Created new task with ${isImage ? 'image' : 'file'} link: ${fileName}` });
    }
}

function updateFileInfoBar() {
    if (!currentFileInfo) return;

    const fileNameElement = document.getElementById('file-name');
    const lockStatusIcon = document.getElementById('lock-status-icon');
    const lockToggleBtnElement = document.getElementById('lock-toggle-btn');
    const lockBtnTextElement = document.getElementById('lock-btn-text');
    const lockMenuIcon = document.getElementById('lock-menu-icon');

    if (fileNameElement) {
        fileNameElement.textContent = currentFileInfo.fileName;
        fileNameElement.title = currentFileInfo.filePath || currentFileInfo.fileName;
    }

    if (currentFileInfo.isLocked) {
        // Update lock icon button
        if (lockStatusIcon) {
            lockStatusIcon.textContent = '🔒';
            lockStatusIcon.title = 'File is locked - click to unlock';
            lockStatusIcon.classList.add('locked');
        }
        
        // Update menu item
        if (lockBtnTextElement) {
            lockBtnTextElement.textContent = 'Unlock File';
        }
        if (lockMenuIcon) {
            lockMenuIcon.textContent = '🔒';
        }
        if (lockToggleBtnElement) {
            lockToggleBtnElement.classList.add('locked');
        }
    } else {
        // Update lock icon button
        if (lockStatusIcon) {
            lockStatusIcon.textContent = '🔓';
            lockStatusIcon.title = 'File is unlocked - click to lock';
            lockStatusIcon.classList.remove('locked');
        }
        
        // Update menu item
        if (lockBtnTextElement) {
            lockBtnTextElement.textContent = 'Lock File';
        }
        if (lockMenuIcon) {
            lockMenuIcon.textContent = '🔓';
        }
        if (lockToggleBtnElement) {
            lockToggleBtnElement.classList.remove('locked');
        }
    }
    
    // Update undo/redo buttons when file info changes
    updateUndoRedoButtons();
}

function toggleFileLock() {
    vscode.postMessage({ type: 'toggleFileLock' });
}

function selectFile() {
    // Save current state before potentially switching files
    saveCurrentFoldingState();
    vscode.postMessage({ type: 'selectFile' });
}

function updateWhitespace(value) {
    // Ensure we have a valid value with 'px' suffix
    if (!value) {
        value = '4px';
    }
    // If the value is just a number, add 'px'
    if (!isNaN(value)) {
        value = value + 'px';
    }
    
    console.log('Updating whitespace to:', value);
    document.documentElement.style.setProperty('--whitespace', value);
}

function updateMaxRowHeight(value) {
    // If value is 0, remove the max-height restriction
    if (value === 0) {
        document.documentElement.style.removeProperty('--max-row-height');
        document.documentElement.style.setProperty('--row-overflow', 'visible');
    } else {
        // Set the max-height value
        document.documentElement.style.setProperty('--max-row-height', value + 'px');
        document.documentElement.style.setProperty('--row-overflow', 'auto');
    }
}

// Export functions for use by other modules
window.saveCurrentFoldingState = saveCurrentFoldingState;
window.restoreFoldingState = restoreFoldingState;

// Make functions globally available
window.toggleFileBarMenu = toggleFileBarMenu;
window.setColumnWidth = setColumnWidth;
window.setLayoutRows = setLayoutRows;
window.updateColumnRowTag = updateColumnRowTag;
window.getColumnRow = getColumnRow;

window.performSort = performSort;