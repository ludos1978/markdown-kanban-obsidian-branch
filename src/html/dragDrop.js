
// Add debugging flag
let lastIndicatorUpdate = 0;
const INDICATOR_UPDATE_THROTTLE = 100; // milliseconds
const DEBUG_DROP = false;

// Track if drag/drop is already set up to prevent multiple listeners
let dragDropInitialized = false;
let isProcessingDrop = false; // Prevent multiple simultaneous drops
let currentExternalDropColumn = null;
let externalDropIndicator = null;

// Track recently created tasks to prevent duplicates
let recentlyCreatedTasks = new Set();

// Use centralized DragStateManager instead of local state
// The dragStateManager is already available globally as window.dragState
// for backward compatibility

// Create local references for frequently accessed properties
// Wait for dragStateManager to be available via window.dragState
let dragState = window.dragState;

// Add custom properties that aren't in base DragStateManager
// Initialize dragState if not available yet
if (!dragState) {
    dragState = {
        isDragging: false,
        draggedTask: null,
        draggedColumn: null,
        draggedClipboardCard: null,
        draggedEmptyCard: null,
        // Column-specific
        draggedColumnId: null,
        originalColumnIndex: -1,
        originalColumnNextSibling: null,
        originalColumnParent: null,
        originalDataIndex: -1,

        // Task-specific
        originalTaskIndex: -1,
        originalTaskParent: null,
        originalTaskNextSibling: null,

        // Drop tracking
        lastValidDropTarget: null,
        lastDropTarget: null,
        lastRowDropTarget: null,
        lastRow: null,
        targetRowNumber: null,
        targetPosition: null,
        finalRowNumber: null,

        // Modifier keys
        altKeyPressed: false
    };
    window.dragState = dragState;
} else if (!dragState.originalColumnIndex) {
    Object.assign(dragState, {
        // Column-specific
        draggedColumnId: null,
        originalColumnIndex: -1,
        originalColumnNextSibling: null,
        originalColumnParent: null,
        originalDataIndex: -1,

        // Task-specific
        originalTaskIndex: -1,
        originalTaskParent: null,
        originalTaskNextSibling: null,

        // Drop tracking
        lastValidDropTarget: null,
        lastDropTarget: null,
        lastRowDropTarget: null,
        lastRow: null,
        targetRowNumber: null,
        targetPosition: null,
        finalRowNumber: null,

        // Modifier keys
        altKeyPressed: false
    });
}

// External file drop location indicators
function createExternalDropIndicator() {
    if (externalDropIndicator) {
        return externalDropIndicator;
    }
    
    const indicator = document.createElement('div');
    indicator.className = 'external-drop-indicator';
    indicator.style.display = 'none';
    indicator.style.pointerEvents = 'none'; // Ensure it doesn't interfere with drops
    document.body.appendChild(indicator);
    externalDropIndicator = indicator;
    
    if (DEBUG_DROP) {
    }
    
    return indicator;
}

function showExternalDropIndicator(column, clientY) {
    if (DEBUG_DROP && currentExternalDropColumn !== column) {
    }
    const indicator = createExternalDropIndicator();
    const tasksContainer = column.querySelector('.tasks-container');
    
    if (!tasksContainer) {return;}
    
    // Calculate insertion position
    const containerRect = tasksContainer.getBoundingClientRect();
    
    // Find insertion point between tasks
    const tasks = Array.from(tasksContainer.children);
    let insertionY = containerRect.top;
    
    if (tasks.length === 0) {
        insertionY = containerRect.top + 10;
    } else {
        let foundPosition = false;
        for (let i = 0; i < tasks.length; i++) {
            const taskRect = tasks[i].getBoundingClientRect();
            const taskCenter = taskRect.top + taskRect.height / 2;
            
            if (clientY < taskCenter) {
                insertionY = taskRect.top - 2;
                foundPosition = true;
                break;
            }
        }
        
        if (!foundPosition && tasks.length > 0) {
            const lastTaskRect = tasks[tasks.length - 1].getBoundingClientRect();
            insertionY = lastTaskRect.bottom + 2;
        }
    }
    
    // Position the indicator
    const columnRect = column.getBoundingClientRect();
    indicator.style.position = 'fixed';
    indicator.style.left = (columnRect.left + columnRect.width * 0.1) + 'px';
    indicator.style.right = 'auto';
    indicator.style.width = (columnRect.width * 0.8) + 'px';
    indicator.style.top = insertionY + 'px';
    indicator.style.display = 'block';
    indicator.classList.add('active');
    
    // Add highlight to column
    column.classList.add('external-drag-over');
    currentExternalDropColumn = column;
}

function hideExternalDropIndicator() {

    if (externalDropIndicator) {
        externalDropIndicator.classList.remove('active');
        externalDropIndicator.style.display = 'none';
    }
    
    if (currentExternalDropColumn) {
        currentExternalDropColumn.classList.remove('external-drag-over');
        currentExternalDropColumn = null;
    }
    
    // Remove highlight from all columns
    document.querySelectorAll('.kanban-full-height-column').forEach(col => {
        col.classList.remove('external-drag-over');
    });
}

function cleanupExternalDropIndicators() {

    hideExternalDropIndicator();
    if (externalDropIndicator) {
        externalDropIndicator.remove();
        externalDropIndicator = null;
    }
}

/**
 * Sets up global drag and drop event listeners
 * Purpose: Handle external file drops and clipboard operations
 * Used by: Board initialization
 * Side effects: Adds document-level event listeners
 */
function setupGlobalDragAndDrop() {

    const boardContainer = document.getElementById('kanban-container');
    const dropFeedback = document.getElementById('drop-zone-feedback');
    
    if (!boardContainer) {
        // Board container not found
        return;
    }
    
    // Variables for throttling
    let lastIndicatorUpdate = 0;
    const INDICATOR_UPDATE_THROTTLE = 100;
    
    // Helper functions
    function isExternalFileDrag(e) {
        const dt = e.dataTransfer;
        if (!dt) {
            return false;
        }
        
        // Only log on drop events to reduce spam
        const isDropEvent = e.type === 'drop';
        if (isDropEvent) {
            }
        
        const hasFiles = Array.from(dt.types).some(t => t === 'Files' || t === 'files');
        if (hasFiles) {
            return true;
        }
        
        // Check for clipboard card type using drag state
        // We can't reliably read data during dragover due to browser security
        const hasClipboardCard = dragState.draggedClipboardCard !== null;
        const hasEmptyCard = dragState.draggedEmptyCard !== null;
        
        if (hasClipboardCard || hasEmptyCard) {
            return true;
        }
        
        if (dragState.isDragging && (dragState.draggedColumn || dragState.draggedTask) && !dragState.draggedClipboardCard && !dragState.draggedEmptyCard) {
            return false;
        }
        
        const hasUriList = Array.from(dt.types).some(t => t.toLowerCase() === 'text/uri-list');
        return hasUriList;
    }
    
    function showDropFeedback() {
        if (dropFeedback) {
            dropFeedback.classList.add('active');
        }
    }
    
    function hideDropFeedback() {
        if (dropFeedback) {
            dropFeedback.classList.remove('active');
        }
        boardContainer.classList.remove('drag-highlight');
    }
    
    // Main drop handler function  
    function handleExternalDrop(e) {
        // Handle external drop event

        // Prevent default browser behavior
        e.preventDefault();
        
        // Check if this is an internal column/task drag (not clipboard/empty cards)
        const isInternalDrag = dragState.isDragging && 
            (dragState.draggedColumn || dragState.draggedTask) && 
            !dragState.draggedClipboardCard && 
            !dragState.draggedEmptyCard;
            
        if (isInternalDrag) {
                return;
        }
        
        // Stop event propagation to prevent duplicate handling
        e.stopPropagation();
        
        // Always clean up visual indicators
        hideDropFeedback();
        hideExternalDropIndicator();
        document.querySelectorAll('.kanban-full-height-column').forEach(col => {
            col.classList.remove('external-drag-over');
        });
        
        const dt = e.dataTransfer;
        if (!dt) {
            // No dataTransfer available
            return;
        }
        
        
        // Priority 1: Check for clipboard images via dataTransfer (most reliable for images)
        const textData = dt.getData('text/plain');
        if (textData && textData.startsWith('CLIPBOARD_IMAGE:')) {
            const imageData = textData.substring('CLIPBOARD_IMAGE:'.length);
            handleClipboardImageDrop(e, imageData);
            if (dragState.draggedClipboardCard) {
                dragState.draggedClipboardCard = null;
                dragState.isDragging = false;
            }
            return;
        }

        // Priority 2: Check dragState for text clipboard/empty cards
        if (dragState.draggedClipboardCard) {
            // Regular clipboard card (text only)
            const clipboardData = JSON.stringify({
                type: 'clipboard-card',
                task: dragState.draggedClipboardCard
            });
            handleClipboardCardDrop(e, clipboardData);
            dragState.draggedClipboardCard = null;
            dragState.isDragging = false;
            return;
        }
        
        if (dragState.draggedEmptyCard) {
            const emptyCardData = JSON.stringify({
                type: 'empty-card',
                task: dragState.draggedEmptyCard
            });
            handleEmptyCardDrop(e, emptyCardData);
            dragState.draggedEmptyCard = null;
            dragState.isDragging = false;
            return;
        }
        
        // Priority 2: Check for files
        if (dt.files && dt.files.length > 0) {
            handleVSCodeFileDrop(e, dt.files);
            return;
        }
        
        // Priority 3: Check text data for special formats
        const textData2 = dt.getData('text/plain');
        
        if (textData2) {
            if (textData2.startsWith('CLIPBOARD_CARD:')) {
                const clipboardData = textData2.substring('CLIPBOARD_CARD:'.length);
                handleClipboardCardDrop(e, clipboardData);
            } else if (textData2.startsWith('EMPTY_CARD:')) {
                const emptyCardData = textData2.substring('EMPTY_CARD:'.length);
                handleEmptyCardDrop(e, emptyCardData);
            } else if (textData2.startsWith('MULTIPLE_FILES:')) {
                const filesContent = textData2.substring('MULTIPLE_FILES:'.length);
                handleMultipleFilesDrop(e, filesContent);
            } else if (textData2.startsWith('CLIPBOARD_IMAGE:')) {
                const imageData = textData2.substring('CLIPBOARD_IMAGE:'.length);
                handleClipboardImageDrop(e, imageData);
            } else if (textData2.includes('/')) {
                // Looks like a file path
                handleVSCodeUriDrop(e, textData2);
            } else {
                // Plain text - create a new card
                createNewTaskWithContent(
                    textData2,
                    { x: e.clientX, y: e.clientY },
                    ''
                );
            }
            return;
        }
        
        // Priority 4: Check for URI list
        const uriList = dt.getData('text/uri-list');
        if (uriList) {
            handleVSCodeUriDrop(e, uriList);
            return;
        }
        
    }
    
    // Register handlers on the container (works for both single row and multi-row)
    boardContainer.addEventListener('dragover', function(e) {
        // Always prevent default to allow drops
        e.preventDefault();
        
        // Skip visual indicators for internal column/task drags
        if (dragState.isDragging && (dragState.draggedColumn || dragState.draggedTask) && 
            !dragState.draggedClipboardCard && !dragState.draggedEmptyCard) {
            return; // Don't show external drop indicators during internal drags
        }
        
        // Show drop indicators for external drags
        const now = Date.now();
        if (now - lastIndicatorUpdate >= INDICATOR_UPDATE_THROTTLE) {
            lastIndicatorUpdate = now;
            
            // Check if we're over a column (works for both single and multi-row layouts)
            const column = e.target && e.target.closest ? e.target.closest('.kanban-full-height-column') : null;
            if (column) {
                // Allow drops on collapsed columns - they will be unfolded on drop
                showExternalDropIndicator(column, e.clientY);
            } else {
                // Check if we're over a row or spacer in multi-row mode
                const row = e.target && e.target.closest ? e.target.closest('.kanban-row') : null;
                const spacer = e.target && e.target.closest ? e.target.closest('.row-drop-zone-spacer') : null;
                if (row || spacer) {
                    // Try to find the nearest column (include collapsed columns)
                    const columns = boardContainer.querySelectorAll('.kanban-full-height-column');
                    let nearestColumn = null;
                    let minDistance = Infinity;
                    
                    columns.forEach(col => {
                        const rect = col.getBoundingClientRect();
                        const distance = Math.abs(rect.left + rect.width / 2 - e.clientX);
                        if (distance < minDistance) {
                            minDistance = distance;
                            nearestColumn = col;
                        }
                    });
                    
                    if (nearestColumn) {
                        showExternalDropIndicator(nearestColumn, e.clientY);
                    } else {
                        hideExternalDropIndicator();
                    }
                } else {
                    hideExternalDropIndicator();
                }
            }
            showDropFeedback();
        }
    }, false);
    
    boardContainer.addEventListener('drop', handleExternalDrop, false);
    
    boardContainer.addEventListener('dragenter', function(e) {
        // Skip external file drag handling if we're dragging internal elements
        if (dragState.isDragging && (dragState.draggedColumn || dragState.draggedTask)) {
            return; // Don't show external drop feedback during internal drags
        }
        
        if (isExternalFileDrag(e)) {
            e.preventDefault();
            showDropFeedback();
        }
    }, false);
    
    boardContainer.addEventListener('dragleave', function(e) {
        // More robust check for actually leaving the board
        const rect = boardContainer.getBoundingClientRect();
        const isReallyLeaving = e.clientX < rect.left || e.clientX > rect.right || 
                               e.clientY < rect.top || e.clientY > rect.bottom;
        
        if (isReallyLeaving || (!boardContainer.contains(e.relatedTarget) && e.relatedTarget !== null)) {
            hideDropFeedback();
            hideExternalDropIndicator();
        }
    }, false);
    
    // Removed duplicate drop handler that was causing double card creation
    // The main handler at line 305 already handles all external drops
    
    // Document level handlers
    document.addEventListener('dragover', function(e) {
        if (!boardContainer.contains(e.target) && isExternalFileDrag(e)) {
            e.preventDefault();
        }
    }, false);
    
    document.addEventListener('drop', function(e) {
        if (!boardContainer.contains(e.target)) {
            e.preventDefault();
            // Clean up indicators if drop happens outside board
            hideDropFeedback();
            hideExternalDropIndicator();
        }
    }, false);
    
    // Global dragend handler to ensure cleanup
    document.addEventListener('dragend', function(e) {
        
        // Clean up any lingering indicators when drag ends
        hideDropFeedback();
        hideExternalDropIndicator();
        
        // Clean up any lingering drag highlights
        document.querySelectorAll('.kanban-full-height-column').forEach(col => {
            col.classList.remove('external-drag-over');
        });
        
        // Reset ALL drag states to ensure clean state
        if (dragState.draggedClipboardCard) {
            dragState.draggedClipboardCard = null;
        }
        if (dragState.draggedEmptyCard) {
            dragState.draggedEmptyCard = null;
        }
        if (dragState.draggedTask) {
            dragState.draggedTask = null;
            dragState.originalTaskParent = null;
            dragState.originalTaskNextSibling = null;
            dragState.originalTaskIndex = -1;
        }
        if (dragState.draggedColumn) {
            dragState.draggedColumn = null;
            dragState.draggedColumnId = null;
            dragState.originalDataIndex = -1;
        }
        
        // Always reset the main flags
        dragState.isDragging = false;
        
    }, false);
    
}


function handleClipboardCardDrop(e, clipboardData) {

    try {
        const parsedData = JSON.parse(clipboardData);

        // Extract the task data
        const taskData = parsedData.task || parsedData;

        const title = taskData.title || taskData.content || parsedData.content || 'New Card';

        // Ensure description is always a string, never a blob object
        let description = taskData.description || '';
        if (typeof description !== 'string') {
            description = taskData.content || '';
            if (typeof description !== 'string') {
                description = 'Clipboard content';
            }
        }

        createNewTaskWithContent(
            title,
            { x: e.clientX, y: e.clientY },
            description
        );
    } catch (error) {
        // Failed to parse clipboard data
        // Fallback: treat as plain text
        createNewTaskWithContent(
            'Clipboard Content',
            { x: e.clientX, y: e.clientY },
            typeof clipboardData === 'string' ? clipboardData : 'Clipboard content'
        );
    }
}

function handleEmptyCardDrop(e, emptyCardData) {

    try {
        const parsedData = JSON.parse(emptyCardData);

        // Create empty task

        createNewTaskWithContent(
            '',
            { x: e.clientX, y: e.clientY },
            ''
        );
    } catch (error) {
        // Failed to parse empty card data
        // Fallback: create empty task anyway
        createNewTaskWithContent(
            '',
            { x: e.clientX, y: e.clientY },
            ''
        );
    }
}

function handleMultipleFilesDrop(e, filesContent) {
    // Split the pre-formatted markdown links by lines
    const links = filesContent.split(/\r\n|\r|\n/).filter(line => line.trim().length > 0);

    links.forEach((link, index) => {
        // Extract title from the markdown link format
        let title = 'File';

        // Try to extract filename from different link formats
        if (link.startsWith('![](')) {
            // Image: ![](path) - extract filename from path
            const pathMatch = link.match(/!\[\]\(([^)]+)\)/);
            if (pathMatch) {
                const path = decodeURIComponent(pathMatch[1]);
                title = path.split(/[\/\\]/).pop() || 'Image';
            }
        } else if (link.startsWith('[[')) {
            // Wiki link: [[filename]] - extract filename
            const fileMatch = link.match(/\[\[([^\]]+)\]\]/);
            if (fileMatch) {
                title = fileMatch[1];
            }
        } else if (link.startsWith('[') && link.includes('](')) {
            // Standard link: [title](path) - extract title
            const titleMatch = link.match(/\[([^\]]+)\]/);
            if (titleMatch) {
                title = titleMatch[1];
            }
        } else if (link.startsWith('<') && link.endsWith('>')) {
            // URL: <url> - extract domain
            const urlMatch = link.match(/<([^>]+)>/);
            if (urlMatch) {
                try {
                    const url = new URL(urlMatch[1]);
                    title = url.hostname.replace('www.', '');
                } catch {
                    title = 'URL';
                }
            }
        }

        // Stagger creation slightly if multiple files
        setTimeout(() => {
            createNewTaskWithContent(
                title,
                { x: e.clientX, y: e.clientY },
                link
            );
        }, index * 10);
    });
}

function handleClipboardImageDrop(e, imageData) {
    try {
        // Parse the image data
        const parsedData = JSON.parse(imageData);

        const base64Data = parsedData.data;
        const imageType = parsedData.imageType || 'image/png';

        if (!base64Data) {
            console.error('No image data found in parsed data');
            createNewTaskWithContent(
                'Clipboard Image',
                { x: e.clientX, y: e.clientY },
                'Failed to save image: No image data found'
            );
            return;
        }

        // Extract the base64 part (remove data:image/png;base64, prefix if present)
        const base64Only = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;

        processImageSave(e, base64Only, imageType, parsedData.md5Hash);

    } catch (error) {
        console.error('Failed to handle clipboard image drop:', error);
        createNewTaskWithContent(
            'Clipboard Image',
            { x: e.clientX, y: e.clientY },
            'Failed to process clipboard image'
        );
    }
}

function processImageSave(e, base64Data, imageType, md5Hash) {
    try {

        // Get the current markdown file information
        let currentFilePath = window.currentFileInfo?.filePath;

        // Fallback: Request file path from backend if not available
        if (!currentFilePath) {
            // Send message to backend to get current file path and save image
            vscode.postMessage({
                type: 'saveClipboardImageWithPath',
                imageData: base64Data,
                imageType: imageType,
                dropPosition: { x: e.clientX, y: e.clientY },
                md5Hash: md5Hash // Pass MD5 hash for filename
            });
            return;
        }

        // Extract base filename without extension
        const pathParts = currentFilePath.split(/[\/\\]/);
        const fileName = pathParts.pop() || 'kanban';
        const baseFileName = fileName.replace(/\.[^/.]+$/, '');
        const directory = pathParts.join('/'); // Always use forward slash for consistency

        // Generate unique filename for the image
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + 'T' +
                         new Date().toISOString().replace(/[:.]/g, '-').split('T')[1].split('-')[0];
        const extension = imageType.split('/')[1] || 'png';
        const imageFileName = `clipboard-image-${timestamp}.${extension}`;

        // Create the media folder path
        const mediaFolderName = `${baseFileName}-MEDIA`;
        const mediaFolderPath = `${directory}/${mediaFolderName}`;
        const imagePath = `${mediaFolderPath}/${imageFileName}`;


        // Send message to VS Code to save the image
        // The task card will be created by the 'clipboardImageSaved' message handler
        // after the backend confirms the file was saved successfully
        vscode.postMessage({
            type: 'saveClipboardImage',
            imageData: base64Data,
            imagePath: imagePath,
            mediaFolderPath: mediaFolderPath,
            dropPosition: { x: e.clientX, y: e.clientY },
            imageFileName: imageFileName,
            mediaFolderName: mediaFolderName
        });

    } catch (error) {
        console.error('Failed to process clipboard image save:', error);

        // Fallback: create a text card indicating the error
        createNewTaskWithContent(
            'Clipboard Image',
            { x: e.clientX, y: e.clientY },
            'Failed to process clipboard image'
        );
    }
}

function handleVSCodeFileDrop(e, files) {
    const file = files[0];
    const fileName = file.name;

    // Create appropriate link format based on file type
    const fileLink = createFileLink(fileName, fileName); // For direct file drops, use filename as path

    createNewTaskWithContent(
        fileName,  // Title: actual filename
        { x: e.clientX, y: e.clientY },
        fileLink   // Description: formatted link
    );
}


function handleVSCodeUriDrop(e, uriData) {
    const uris = uriData.split('\n').filter(uri => uri.trim()).filter(uri => {
        const isFile = uri.startsWith('file://') || (uri.includes('/') && !uri.includes('task_') && !uri.includes('col_'));
        return isFile;
    });

    if (uris.length > 0) {
        // Create tasks for each URI using cache-first approach
        uris.forEach((uri, index) => {
            let filename = uri;
            let fullPath = uri;

            if (uri.startsWith('file://')) {
                // Extract filename from file:// URIs
                filename = decodeURIComponent(uri).split('/').pop() || uri;
                fullPath = decodeURIComponent(uri); // Keep full path for link creation
            } else {
                // For non-file URIs, try to get the filename
                filename = uri.split('/').pop() || uri;
                fullPath = uri;
            }

            // Create appropriate link format based on file type
            const fileLink = createFileLink(filename, fullPath);

            // Stagger the creation slightly if multiple files
            setTimeout(() => {
                createNewTaskWithContent(
                    filename,  // Title: actual filename
                    { x: e.clientX, y: e.clientY },
                    fileLink   // Description: formatted link
                );
            }, index * 10);
        });
    } else {
        // Could not process dropped file URIs
    }
}

/**
 * Creates appropriate link format based on file type
 * @param {string} filename - The filename with extension
 * @param {string} fullPath - The full path to the file
 * @returns {string} Formatted link based on file type
 */
function createFileLink(filename, fullPath) {
    const extension = filename.toLowerCase().split('.').pop();
    const baseName = filename.replace(/\.[^/.]+$/, ""); // filename without extension

    // Image file extensions
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico', 'tiff', 'tif'];

    // Video file extensions
    const videoExtensions = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'ogv', '3gp'];

    // Audio file extensions
    const audioExtensions = ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a', 'wma', 'opus'];

    // Markdown file extensions
    const markdownExtensions = ['md', 'markdown', 'mdown', 'mkd', 'mdx'];

    if (imageExtensions.includes(extension) || videoExtensions.includes(extension) || audioExtensions.includes(extension)) {
        // Use image/media syntax: ![alt-text](path)
        return `![${baseName}](${fullPath})`;
    } else if (markdownExtensions.includes(extension)) {
        // Use Obsidian-style wiki links: [[file.md]]
        return `[[${filename}]]`;
    } else if (fullPath.startsWith('http://') || fullPath.startsWith('https://')) {
        // Use angle brackets for URLs: <url>
        return `<${fullPath}>`;
    } else {
        // Use standard markdown link for unknown file types: [filename](path)
        return `[${baseName}](${fullPath})`;
    }
}

function getActiveTextEditor() {

    if (taskEditor.currentEditor) {
        const editor = taskEditor.currentEditor;
        return {
            type: editor.type.replace('task-', '').replace('-', '-'),
            taskId: editor.taskId,
            columnId: editor.columnId,
            cursorPosition: editor.element.selectionStart || 0,
            element: editor.element
        };
    }
    
    return null;
}

/**
 * Creates new task from dropped content
 * Purpose: Convert external drops to tasks
 * Used by: File drops, clipboard drops, empty card drops
 * @param {string} content - Task title content
 * @param {Object} dropPosition - Column and index info
 * @param {string} description - Optional description
 * Side effects: Sends create task message to VS Code
 */
function createNewTaskWithContent(content, dropPosition, description = '') {
    
    // Check board availability - NEW CACHE SYSTEM
    
    if (!window.cachedBoard) {
        // No cached board available
        vscode.postMessage({ 
            type: 'showMessage', 
            text: 'Cannot create task: No board loaded' 
        });
        return;
    }
    
    if (!window.cachedBoard.columns || window.cachedBoard.columns.length === 0) {
        // Board has no columns
        vscode.postMessage({ 
            type: 'showMessage', 
            text: 'Cannot create task: No columns available' 
        });
        return;
    }
    
    // Find target column
    let targetColumnId = null;
    let insertionIndex = -1;
    
    const elementAtPoint = document.elementFromPoint(dropPosition.x, dropPosition.y);
    
    // Try multiple strategies to find the column
    let columnElement = elementAtPoint?.closest('.kanban-full-height-column');
    
    // If we didn't find a column, try the parent elements
    if (!columnElement) {
        // Check if we're on a row
        const row = elementAtPoint?.closest('.kanban-row');
        if (row) {
            // Find the column that contains this x position
            const columns = row.querySelectorAll('.kanban-full-height-column');
            for (const col of columns) {
                const rect = col.getBoundingClientRect();
                if (dropPosition.x >= rect.left && dropPosition.x <= rect.right) {
                    columnElement = col;
                    break;
                }
            }
        }
    }
    
    
    if (columnElement) {
        targetColumnId = columnElement.dataset.columnId;
        
        // Unfold the column if it's collapsed
        if (columnElement.classList.contains('collapsed')) {
            if (typeof unfoldColumnIfCollapsed === 'function') {
                unfoldColumnIfCollapsed(targetColumnId);
            }
        }
        
        insertionIndex = calculateInsertionIndex(columnElement, dropPosition.y);
    } else {
        const columns = document.querySelectorAll('.kanban-full-height-column'); // Allow collapsed columns
        let minDistance = Infinity;
        
        columns.forEach(column => {
            const rect = column.getBoundingClientRect();
            const distX = Math.abs((rect.left + rect.right) / 2 - dropPosition.x);
            const distY = Math.abs((rect.top + rect.bottom) / 2 - dropPosition.y);
            const distance = Math.sqrt(distX * distX + distY * distY);
            
            if (distance < minDistance) {
                minDistance = distance;
                targetColumnId = column.dataset.columnId;
                
                // Unfold the nearest column if it's collapsed
                if (column.classList.contains('collapsed')) {
                    if (typeof unfoldColumnIfCollapsed === 'function') {
                        unfoldColumnIfCollapsed(targetColumnId);
                    }
                }
                
                insertionIndex = calculateInsertionIndex(column, dropPosition.y);
            }
        });
        
        if (targetColumnId) {
        }
    }
    
    if (!targetColumnId && window.cachedBoard.columns.length > 0) {
        // Try non-collapsed first, then any column
        let fallbackColumn = window.cachedBoard.columns.find(col => 
            !window.collapsedColumns || !window.collapsedColumns.has(col.id)
        );
        
        if (!fallbackColumn) {
            // If all columns are collapsed, use the first one and unfold it
            fallbackColumn = window.cachedBoard.columns[0];
        }
        
        if (fallbackColumn) {
            targetColumnId = fallbackColumn.id;
            
            // Unfold if collapsed
            if (typeof unfoldColumnIfCollapsed === 'function') {
                unfoldColumnIfCollapsed(targetColumnId);
            }
            
            insertionIndex = -1;
        }
    }
    
    if (targetColumnId) {
        // Create new task with cache-first approach (no VS Code message)
        // Ensure all task fields are strings, not blobs or other objects
        const newTask = {
            id: `temp-drop-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            title: typeof content === 'string' ? content : 'New Task',
            description: typeof description === 'string' ? description : ''
        };

        // Update cached board directly
        if (typeof updateCacheForNewTask === 'function') {
            updateCacheForNewTask(targetColumnId, newTask, insertionIndex);
        }

        // Mark as unsaved changes
        if (typeof markUnsavedChanges === 'function') {
            markUnsavedChanges();
        }

        // Update refresh button to show unsaved state
        if (typeof updateRefreshButtonState === 'function') {
            updateRefreshButtonState('unsaved', 1);
        }

        // Re-render board to show the new task
        if (typeof renderBoard === 'function') {
            renderBoard();
        }
    } else {
        // Could not find suitable column
        vscode.postMessage({ 
            type: 'showMessage', 
            text: 'Could not find a suitable column. Please ensure at least one column is not collapsed.' 
        });
    }
}


function calculateInsertionIndex(column, clientY) {

    const tasksContainer = column.querySelector('.tasks-container');
    if (!tasksContainer) {
        return -1;
    }
    
    const tasks = Array.from(tasksContainer.children);
    
    if (tasks.length === 0) {
        return 0;
    }
    
    for (let i = 0; i < tasks.length; i++) {
        const taskRect = tasks[i].getBoundingClientRect();
        const taskCenter = taskRect.top + taskRect.height / 2;
        
        if (clientY < taskCenter) {
            return i;
        }
    }
    
    return -1;
}


// Helper function to restore original task position
function restoreTaskPosition() {

    if (dragState.draggedTask && dragState.originalTaskParent) {
        // Remove from current position
        if (dragState.draggedTask.parentNode) {
            dragState.draggedTask.parentNode.removeChild(dragState.draggedTask);
        }
        
        // Insert back to original position
        if (dragState.originalTaskNextSibling) {
            dragState.originalTaskParent.insertBefore(dragState.draggedTask, dragState.originalTaskNextSibling);
        } else {
            dragState.originalTaskParent.appendChild(dragState.draggedTask);
        }
        
        dragState.draggedTask.classList.remove('drag-source-hidden');
    }
}

function setupRowDragAndDrop() {
    const boardElement = document.getElementById('kanban-board');
    const rows = boardElement.querySelectorAll('.kanban-row');
    
    rows.forEach(row => {
        row.addEventListener('dragover', e => {
            // Only handle dragover for column dragging, let external drags bubble up  
            if (!dragState.draggedColumn || dragState.draggedClipboardCard || dragState.draggedEmptyCard) {return;}
            
            e.preventDefault();
            e.stopPropagation();
            
            // Visual feedback (this is cheap, just adding a class)
            if (!row.classList.contains('drag-over')) {
                row.classList.add('drag-over');
            }
            
            // Find insertion point in this row
            const columnsInRow = Array.from(row.querySelectorAll('.kanban-full-height-column:not(.dragging)'));
            const mouseX = e.clientX;
            
            let targetPosition = null;
            for (const col of columnsInRow) {
                const rect = col.getBoundingClientRect();
                if (mouseX < rect.left + rect.width / 2) {
                    targetPosition = col;
                    break;
                }
            }
            
            // Default to end position if not found
            if (!targetPosition) {
                const addBtn = row.querySelector('.add-column-btn');
                targetPosition = addBtn || null;
            }
            
            // Only move if position changed
            if (dragState.lastRowDropTarget !== targetPosition || dragState.lastRow !== row) {
                dragState.lastRowDropTarget = targetPosition;
                dragState.lastRow = row;
                
                // Move the dragged column to this position
                if (targetPosition) {
                    if (dragState.draggedColumn.nextSibling !== targetPosition) {
                        row.insertBefore(dragState.draggedColumn, targetPosition);
                    }
                } else {
                    if (dragState.draggedColumn.parentNode !== row || 
                        dragState.draggedColumn !== row.lastElementChild) {
                        row.appendChild(dragState.draggedColumn);
                    }
                }
                
                // Update the row attribute
                const rowNumber = parseInt(row.getAttribute('data-row-number') || '1');
                dragState.draggedColumn.setAttribute('data-row', rowNumber);
            }
        });
        
        row.addEventListener('dragleave', e => {
            if (!row.contains(e.relatedTarget)) {
                row.classList.remove('drag-over');
            }
        });
        
        row.addEventListener('drop', e => {
            // Only handle drops for column dragging, let external drops bubble up
            if (dragState.draggedColumn && !dragState.draggedClipboardCard && !dragState.draggedEmptyCard) {
                e.preventDefault();
                e.stopPropagation();
                row.classList.remove('drag-over');
                
                // Clear the row tracking
                dragState.lastRowDropTarget = null;
                dragState.lastRow = null;
            }
        });
    });
}

function calculateColumnDropIndexInRow(draggedColumn) {

    if (!currentBoard || !currentBoard.columns) {return -1;}
    
    const boardElement = document.getElementById('kanban-board');
    const columnId = draggedColumn.getAttribute('data-column-id');
    
    // Get all columns in their visual order
    let allColumnsInOrder = [];
    
    // If multi-row layout
    const rows = boardElement.querySelectorAll('.kanban-row');
    if (rows.length > 0) {
        rows.forEach(row => {
            const columnsInRow = row.querySelectorAll('.kanban-full-height-column');
            columnsInRow.forEach(col => {
                allColumnsInOrder.push(col.getAttribute('data-column-id'));
            });
        });
    } else {
        // Single row layout
        const columns = boardElement.querySelectorAll('.kanban-full-height-column');
        columns.forEach(col => {
            allColumnsInOrder.push(col.getAttribute('data-column-id'));
        });
    }
    
    // Find the target index in the data model
    const visualIndex = allColumnsInOrder.indexOf(columnId);
    
    // Map visual order to data model order
    let targetIndex = 0;
    for (let i = 0; i < visualIndex; i++) {
        const colId = allColumnsInOrder[i];
        if (currentBoard.columns.findIndex(c => c.id === colId) !== -1) {
            targetIndex++;
        }
    }
    
    return targetIndex;
}

function calculateColumnDropIndex(boardElement, draggedColumn) {

    const columns = Array.from(boardElement.querySelectorAll('.kanban-full-height-column'));
    const currentIndex = columns.indexOf(draggedColumn);
    
    if (!currentBoard || !currentBoard.columns) {return -1;}
    
    // Map DOM position to data model position
    const columnId = draggedColumn.getAttribute('data-column-id');
    let targetIndex = 0;
    
    for (let i = 0; i < currentIndex; i++) {
        const col = columns[i];
        const colId = col.getAttribute('data-column-id');
        const dataIndex = currentBoard.columns.findIndex(c => c.id === colId);
        if (dataIndex !== -1) {
            targetIndex++;
        }
    }
    
    return targetIndex;
}

/**
 * Sets up drag and drop for task elements
 * Purpose: Enable dragging tasks between columns
 * Used by: setupDragAndDrop() after board render
 * Side effects: Makes tasks draggable, adds drop zones
 */
function setupTaskDragAndDrop() {

    // Get all columns across all rows
    const boardElement = document.getElementById('kanban-board');
    const allColumns = boardElement.querySelectorAll('.kanban-full-height-column');
    
    allColumns.forEach(columnElement => {
        const columnId = columnElement.dataset.columnId;
        const tasksContainer = columnElement.querySelector('.tasks-container');

        if (!tasksContainer) {return;}

        // Add dragover handler to the entire column for appending to end
        columnElement.addEventListener('dragover', e => {
            // Update Alt key state during drag (user might press/release Alt mid-drag)
            if (dragState.isDragging) {
                dragState.altKeyPressed = e.altKey;
            }

            // Only process if we have a dragged task
            if (!dragState.draggedTask) {return;}

            // Check if we're over the tasks container specifically
            const isOverTasksContainer = tasksContainer.contains(e.target);
            
            if (!isOverTasksContainer) {
                // We're over the column but not the tasks container (e.g., header area)
                e.preventDefault();
                
                // Move task to the end of this column
                const addButton = tasksContainer.querySelector('.add-task-btn');
                if (addButton) {
                    tasksContainer.insertBefore(dragState.draggedTask, addButton);
                } else {
                    tasksContainer.appendChild(dragState.draggedTask);
                }
                
                // Add visual feedback
                columnElement.classList.add('drag-over-append');
            }
        });

        // Add drop handler to entire column
        columnElement.addEventListener('drop', e => {
            if (!dragState.draggedTask) {return;}
            
            const isOverTasksContainer = tasksContainer.contains(e.target);
            if (!isOverTasksContainer) {
                e.preventDefault();
                columnElement.classList.remove('drag-over-append');
            }
        });

        // Clean up visual feedback when leaving column
        columnElement.addEventListener('dragleave', e => {
            if (!columnElement.contains(e.relatedTarget)) {
                columnElement.classList.remove('drag-over-append');
            }
        });

        // Keep the existing tasks container specific handling for precise placement
        tasksContainer.addEventListener('dragover', e => {
            e.preventDefault();

            // Update Alt key state during drag (user might press/release Alt mid-drag)
            if (dragState.isDragging) {
                dragState.altKeyPressed = e.altKey;
            }

            // Only stop propagation for internal task drags, not external drops
            if (dragState.draggedTask && !dragState.draggedClipboardCard && !dragState.draggedEmptyCard) {
                e.stopPropagation(); // Prevent column-level handler from interfering
            }

            if (!dragState.draggedTask) {return;}
            
            // Remove any column-level visual feedback when over tasks
            columnElement.classList.remove('drag-over-append');
            
            const afterElement = getDragAfterTaskElement(tasksContainer, e.clientY);
            
            if (afterElement === null) {
                // Insert at the end, but before the add button if it exists
                const addButton = tasksContainer.querySelector('.add-task-btn');
                if (addButton) {
                    tasksContainer.insertBefore(dragState.draggedTask, addButton);
                } else {
                    tasksContainer.appendChild(dragState.draggedTask);
                }
            } else if (afterElement !== dragState.draggedTask) {
                // Insert before the after element
                tasksContainer.insertBefore(dragState.draggedTask, afterElement);
            }
            
            // Add transition classes for smooth movement
            tasksContainer.querySelectorAll('.task-item').forEach(task => {
                if (task !== dragState.draggedTask) {
                    task.classList.add('drag-transitioning');
                }
            });
        });

        tasksContainer.addEventListener('drop', e => {
            e.preventDefault();
            
            // Only stop propagation for internal task drags, let external drops bubble up
            if (dragState.draggedTask && !dragState.draggedClipboardCard && !dragState.draggedEmptyCard) {
                e.stopPropagation(); // Prevent column-level handler for internal drags only
            }
            
            columnElement.classList.remove('drag-over');
            columnElement.classList.remove('drag-over-append');
            
            // The actual position change is handled in dragend
        });

        // Setup drag handles for all tasks in this column
        columnElement.querySelectorAll('.task-drag-handle').forEach(handle => {
            setupTaskDragHandle(handle);
        });
    });
}

function setupTaskDragHandle(handle) {

    handle.draggable = true;
    
    handle.addEventListener('dragstart', e => {
        const taskItem = e.target && e.target.closest ? e.target.closest('.task-item') : null;
        if (taskItem) {
            e.stopPropagation();
            const taskId = taskItem.dataset.taskId;
            const columnId = taskItem.dataset.columnId;
            
            // Store original position
            dragState.draggedTask = taskItem;
            dragState.originalTaskParent = taskItem.parentNode;
            dragState.originalTaskNextSibling = taskItem.nextSibling;
            dragState.originalTaskIndex = Array.from(dragState.originalTaskParent.children).indexOf(taskItem);
            dragState.isDragging = true; // IMPORTANT: Set this BEFORE setting data
            dragState.altKeyPressed = e.altKey; // Track Alt key state from the start
            
            // Set multiple data formats
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', `kanban-task:${taskId}`); // Add prefix
            e.dataTransfer.setData('application/kanban-task', taskId);
            e.dataTransfer.setData('application/x-kanban-task', taskId); // Fallback
            
            // Make the task semi-transparent
            taskItem.classList.add('dragging', 'drag-preview');
            
        }
    });

    handle.addEventListener('dragend', e => {

        const taskItem = e.target && e.target.closest ? e.target.closest('.task-item') : null;
        if (taskItem) {
            // Clean up drag state FIRST
            dragState.isDragging = false;
            
            // Remove all visual feedback
            taskItem.classList.remove('dragging', 'drag-preview');
            document.querySelectorAll('.task-item').forEach(task => {
                task.classList.remove('drag-transitioning');
            });
            // Clean up column drag-over styles
            document.querySelectorAll('.kanban-full-height-column').forEach(col => {
                col.classList.remove('drag-over-append');
            });
            
            // Get the final position
            const finalParent = taskItem.parentNode;
            const finalColumnElement = finalParent?.closest('.kanban-full-height-column');
            const finalColumnId = finalColumnElement?.dataset.columnId;
            
            if (finalParent && finalColumnId) {
                const originalColumnElement = dragState.originalTaskParent?.closest('.kanban-full-height-column');
                const originalColumnId = originalColumnElement?.dataset.columnId;
                
                const finalIndex = Array.from(finalParent.children).indexOf(taskItem);
                
                // Check if position actually changed
                const positionChanged = finalParent !== dragState.originalTaskParent ||
                                       finalIndex !== dragState.originalTaskIndex;

                if (positionChanged && originalColumnId) {
                    // DON'T restore position - keep the preview position
                    // Calculate the proper index for the data model
                    const dropIndex = finalIndex >= 0 ? finalIndex : 0;

                    // Unfold the destination column if it's collapsed (unless Alt key was pressed during drag)
                    if (typeof unfoldColumnIfCollapsed === 'function') {
                        const skipUnfold = dragState.altKeyPressed; // Skip unfolding if Alt key was pressed
                        unfoldColumnIfCollapsed(finalColumnId, skipUnfold);
                    }
                    
                    // NEW CACHE SYSTEM: Update cached board directly
                    if (window.cachedBoard) {
                        const taskId = taskItem.dataset.taskId;
                        
                        // SAVE UNDO STATE BEFORE MAKING CHANGES (for both same-column and cross-column moves)
                        vscode.postMessage({ 
                            type: 'saveUndoState', 
                            operation: originalColumnId !== finalColumnId ? 'moveTaskViaDrag' : 'reorderTaskViaDrag', 
                            taskId: taskId,
                            fromColumnId: originalColumnId,
                            toColumnId: finalColumnId,
                            currentBoard: window.cachedBoard
                        });
                        
                        // Find and remove task from original column
                        const originalColumn = window.cachedBoard.columns.find(col => col.id === originalColumnId);
                        const finalColumn = window.cachedBoard.columns.find(col => col.id === finalColumnId);
                        
                        if (originalColumn && finalColumn) {
                            const taskIndex = originalColumn.tasks.findIndex(t => t.id === taskId);
                            if (taskIndex >= 0) {
                                const [task] = originalColumn.tasks.splice(taskIndex, 1);
                                
                                // Add task to new column at correct position
                                const insertIndex = Math.min(dropIndex, finalColumn.tasks.length);
                                finalColumn.tasks.splice(insertIndex, 0, task);
                                
                                if (originalColumnId !== finalColumnId) {
                                } else {
                                }
                                
                                // Also update currentBoard for compatibility
                                if (window.currentBoard !== window.cachedBoard) {
                                    const currentOriginal = window.currentBoard.columns.find(col => col.id === originalColumnId);
                                    const currentFinal = window.currentBoard.columns.find(col => col.id === finalColumnId);
                                    if (currentOriginal && currentFinal) {
                                        const currentTaskIndex = currentOriginal.tasks.findIndex(t => t.id === taskId);
                                        if (currentTaskIndex >= 0) {
                                            const [currentTask] = currentOriginal.tasks.splice(currentTaskIndex, 1);
                                            currentFinal.tasks.splice(insertIndex, 0, currentTask);
                                        }
                                    }
                                }

                                // Update column displays after task move
                                if (typeof window.updateColumnDisplay === 'function') {
                                    // Update both source and destination columns
                                    window.updateColumnDisplay(originalColumnId);
                                    if (originalColumnId !== finalColumnId) {
                                        window.updateColumnDisplay(finalColumnId);
                                    }
                                }

                                // Check empty state for both columns
                                if (typeof updateColumnEmptyState === 'function') {
                                    updateColumnEmptyState(originalColumnId);
                                    if (originalColumnId !== finalColumnId) {
                                        updateColumnEmptyState(finalColumnId);
                                    }
                                }
                            }
                        }

                    }

                    // NEW CACHE SYSTEM: Mark as unsaved
                    if (typeof markUnsavedChanges === 'function') {
                        markUnsavedChanges();
                    }
                }
            }
            
            // At the very end:
            dragState.draggedTask = null;
            dragState.originalTaskParent = null;
            dragState.originalTaskNextSibling = null;
            dragState.originalTaskIndex = -1;
            dragState.isDragging = false; // Extra safety
            dragState.altKeyPressed = false; // Reset Alt key state
        }
    });
    
    // Add ESC key handler to cancel task drag
    if (!handle.hasEscListener) {
        handle.hasEscListener = true;
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && dragState.isDragging && dragState.draggedTask) {
                restoreTaskPosition();
                dragState.draggedTask.classList.remove('dragging', 'drag-preview');
                
                // Reset drag state
                dragState.draggedTask = null;
                dragState.originalTaskParent = null;
                dragState.originalTaskNextSibling = null;
                dragState.originalTaskIndex = -1;
                dragState.isDragging = false;
                dragState.altKeyPressed = false;
            }
        });
    }
}

function getDragAfterTaskElement(container, y) {

    const draggableElements = [...container.querySelectorAll('.task-item')].filter(el => el !== dragState.draggedTask);
    const addButton = container.querySelector('.add-task-btn');

    // If column is empty (only has add button), always drop at the beginning (before add button)
    if (draggableElements.length === 0) {
        return null; // This means insert at the end (before add button if it exists)
    }

    // If dragging over or near the add button area, treat it as dropping at the end
    if (addButton) {
        const addButtonBox = addButton.getBoundingClientRect();
        if (y >= addButtonBox.top - 10) { // Add 10px buffer above the button
            // Return null to indicate dropping at the end (but before the add button)
            return null;
        }
    }

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;

        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function calculateTaskDropIndex(tasksContainer, draggedTask, event) {

    const tasks = Array.from(tasksContainer.children);
    const currentIndex = tasks.indexOf(draggedTask);
    
    // Return the current index in the DOM
    return currentIndex >= 0 ? currentIndex : 0;
}

/**
 * Calculates insertion index based on mouse position
 * Purpose: Determine where to insert dropped task
 * Used by: Task drop operations
 * @param {HTMLElement} tasksContainer - Target container
 * @param {number} clientY - Mouse Y position
 * @returns {number} Insertion index
 */
function calculateDropIndex(tasksContainer, clientY) {

    const tasks = Array.from(tasksContainer.children);
    let dropIndex = tasks.length;

    for (let i = 0; i < tasks.length; i++) {
        const taskElement = tasks[i];
        const rect = taskElement.getBoundingClientRect();
        const taskCenter = rect.top + rect.height / 2;

        if (clientY < taskCenter) {
            dropIndex = i;
            break;
        }
    }

    return dropIndex;
}

function getOriginalColumnIndex(columnId) {
    if (!currentBoard || !currentBoard.columns) {return -1;}
    return currentBoard.columns.findIndex(col => col.id === columnId);
}

// Drag and drop setup
function setupDragAndDrop() {

    // Clear any existing drag state when setting up
    dragState = {
        draggedColumn: null,
        draggedColumnId: null,
        originalColumnIndex: -1,
        originalColumnNextSibling: null,
        originalColumnParent: null,
        originalDataIndex: -1,
        draggedTask: null,
        originalTaskIndex: -1,
        originalTaskParent: null,
        originalTaskNextSibling: null,
        isDragging: false,  // This is the key flag
        lastValidDropTarget: null,
        lastDropTarget: null,
        lastRowDropTarget: null,
        lastRow: null,
        targetRowNumber: null,
        targetPosition: null,
        finalRowNumber: null,
        draggedClipboardCard: null,
        draggedEmptyCard: null
    };
    
    // Only set up global drag/drop once to prevent multiple listeners
    if (!dragDropInitialized) {
        setupGlobalDragAndDrop();
        dragDropInitialized = true;
    } else {
    }
    
    // Always refresh column, task, and row drag/drop since DOM changes
    setupRowDragAndDrop(); // Setup rows first
    setupColumnDragAndDrop(); // Then columns
    setupTaskDragAndDrop(); // Then tasks
}

/**
 * Sets up drag and drop for column reordering
 * Purpose: Enable column rearrangement
 * Used by: setupDragAndDrop() after board render
 * Side effects: Makes column headers draggable
 */
function setupColumnDragAndDrop() {

    const boardElement = document.getElementById('kanban-board');
    const columns = boardElement.querySelectorAll('.kanban-full-height-column');

    columns.forEach(column => {
        const dragHandle = column.querySelector('.column-drag-handle');
        if (!dragHandle) {return;}

        dragHandle.addEventListener('dragstart', e => {
            const columnElement = column;
            const columnId = columnElement.getAttribute('data-column-id');
            
            // Find the original position in the data model
            const originalIndex = currentBoard.columns.findIndex(c => c.id === columnId);
            
            // Store drag state
            dragState.draggedColumn = columnElement;
            dragState.draggedColumnId = columnId;
            dragState.originalDataIndex = originalIndex;
            dragState.isDragging = true;
            dragState.lastDropTarget = null;  // Track last drop position
            
            // Set drag data
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', `kanban-full-height-column:${columnId}`);
            
            // Visual feedback
            columnElement.classList.add('dragging', 'drag-preview');
            
        });

        dragHandle.addEventListener('dragend', e => {
            
            const columnElement = column;
            const columnId = dragState.draggedColumnId;
            
            // Clean up visual feedback
            columnElement.classList.remove('dragging', 'drag-preview');
            document.querySelectorAll('.kanban-full-height-column').forEach(col => {
                col.classList.remove('drag-over', 'drag-transitioning');
            });
            document.querySelectorAll('.kanban-row').forEach(row => {
                row.classList.remove('drag-over');
            });
            
            // Calculate target position based on where the column is in the DOM now
            const allColumns = Array.from(boardElement.querySelectorAll('.kanban-full-height-column'));
            const targetDOMIndex = allColumns.indexOf(columnElement);
            
            // Map DOM position to data model position
            // Build the new order based on current DOM state
            const newOrder = allColumns.map(col => col.getAttribute('data-column-id'));
            const targetDataIndex = newOrder.indexOf(columnId);
            
            // Get row number
            const parentRow = columnElement.closest('.kanban-row');
            const newRow = parentRow ? parseInt(parentRow.getAttribute('data-row-number') || '1') : 1;

            // Update the column's row tag FIRST in the data before reordering
            // This ensures the column has the correct row tag when the board is reordered
            if (window.cachedBoard) {
                const cachedColumn = window.cachedBoard.columns.find(col => col.id === columnId);
                if (cachedColumn) {
                    // Update row tag in cached column
                    let cleanTitle = cachedColumn.title
                        .replace(/#row\d+\b/gi, '')
                        .replace(/\s+#row\d+/gi, '')
                        .replace(/#row\d+\s+/gi, '')
                        .replace(/\s+#row\d+\s+/gi, '')
                        .trim();

                    if (newRow > 1) {
                        cachedColumn.title = cleanTitle + ` #row${newRow}`;
                    } else {
                        cachedColumn.title = cleanTitle;
                    }
                }
            }

            // Also update currentBoard
            if (window.currentBoard) {
                const currentColumn = window.currentBoard.columns.find(col => col.id === columnId);
                if (currentColumn) {
                    let cleanTitle = currentColumn.title
                        .replace(/#row\d+\b/gi, '')
                        .replace(/\s+#row\d+/gi, '')
                        .replace(/#row\d+\s+/gi, '')
                        .replace(/\s+#row\d+\s+/gi, '')
                        .trim();

                    if (newRow > 1) {
                        currentColumn.title = cleanTitle + ` #row${newRow}`;
                    } else {
                        currentColumn.title = cleanTitle;
                    }
                }
            }

            // Update #stack tags based on drop position
            const stackContainer = columnElement.closest('.kanban-column-stack');

            if (stackContainer) {
                // Dropped inside a stack
                const columnsInStack = Array.from(stackContainer.querySelectorAll('.kanban-full-height-column'));
                const positionInStack = columnsInStack.indexOf(columnElement);

                if (positionInStack === 0) {
                    // Dropped as FIRST column in stack
                    // Remove #stack from this column, add #stack to next column

                    // Update dropped column (remove #stack)
                    if (window.cachedBoard) {
                        const cachedColumn = window.cachedBoard.columns.find(col => col.id === columnId);
                        if (cachedColumn) {
                            cachedColumn.title = cachedColumn.title.replace(/#stack\b/gi, '').replace(/\s+/g, ' ').trim();
                        }
                    }
                    if (window.currentBoard) {
                        const currentColumn = window.currentBoard.columns.find(col => col.id === columnId);
                        if (currentColumn) {
                            currentColumn.title = currentColumn.title.replace(/#stack\b/gi, '').replace(/\s+/g, ' ').trim();
                        }
                    }

                    // Add #stack to next column (original first column)
                    if (columnsInStack.length > 1) {
                        const nextColumnElement = columnsInStack[1];
                        const nextColumnId = nextColumnElement.getAttribute('data-column-id');

                        if (window.cachedBoard) {
                            const cachedNextColumn = window.cachedBoard.columns.find(col => col.id === nextColumnId);
                            if (cachedNextColumn && !/#stack\b/i.test(cachedNextColumn.title)) {
                                cachedNextColumn.title = cachedNextColumn.title.trim() + ' #stack';
                            }
                        }
                        if (window.currentBoard) {
                            const currentNextColumn = window.currentBoard.columns.find(col => col.id === nextColumnId);
                            if (currentNextColumn && !/#stack\b/i.test(currentNextColumn.title)) {
                                currentNextColumn.title = currentNextColumn.title.trim() + ' #stack';
                            }
                        }
                    }
                } else if (positionInStack === columnsInStack.length - 1) {
                    // Dropped as LAST column in stack (at the end)
                    // Remove #stack from this column

                    if (window.cachedBoard) {
                        const cachedColumn = window.cachedBoard.columns.find(col => col.id === columnId);
                        if (cachedColumn) {
                            cachedColumn.title = cachedColumn.title.replace(/#stack\b/gi, '').replace(/\s+/g, ' ').trim();
                        }
                    }
                    if (window.currentBoard) {
                        const currentColumn = window.currentBoard.columns.find(col => col.id === columnId);
                        if (currentColumn) {
                            currentColumn.title = currentColumn.title.replace(/#stack\b/gi, '').replace(/\s+/g, ' ').trim();
                        }
                    }
                } else {
                    // Dropped BETWEEN stacked columns (middle position)
                    // Add #stack to dropped column

                    if (window.cachedBoard) {
                        const cachedColumn = window.cachedBoard.columns.find(col => col.id === columnId);
                        if (cachedColumn && !/#stack\b/i.test(cachedColumn.title)) {
                            cachedColumn.title = cachedColumn.title.trim() + ' #stack';
                        }
                    }
                    if (window.currentBoard) {
                        const currentColumn = window.currentBoard.columns.find(col => col.id === columnId);
                        if (currentColumn && !/#stack\b/i.test(currentColumn.title)) {
                            currentColumn.title = currentColumn.title.trim() + ' #stack';
                        }
                    }
                }
            } else {
                // Dropped OUTSIDE any stack - remove #stack tag

                if (window.cachedBoard) {
                    const cachedColumn = window.cachedBoard.columns.find(col => col.id === columnId);
                    if (cachedColumn) {
                        cachedColumn.title = cachedColumn.title.replace(/#stack\b/gi, '').replace(/\s+/g, ' ').trim();
                    }
                }
                if (window.currentBoard) {
                    const currentColumn = window.currentBoard.columns.find(col => col.id === columnId);
                    if (currentColumn) {
                        currentColumn.title = currentColumn.title.replace(/#stack\b/gi, '').replace(/\s+/g, ' ').trim();
                    }
                }
            }

            // Update the visual display
            const titleElement = columnElement.querySelector('.column-title');
            if (titleElement && window.cachedBoard) {
                const columnData = window.cachedBoard.columns.find(col => col.id === columnId);
                if (columnData) {
                    const displayTitle = columnData.title.replace(/#row\d+/gi, '').trim();
                    const renderedTitle = window.renderMarkdown ? window.renderMarkdown(displayTitle) : displayTitle;
                    const rowIndicator = (window.showRowTags && newRow > 1) ? `<span class="column-row-tag">Row ${newRow}</span>` : '';
                    titleElement.innerHTML = renderedTitle + rowIndicator;
                }
            }

            // NEW CACHE SYSTEM: Update cached board directly
            if (window.cachedBoard) {
                // Reorder columns in cached board to match DOM order
                const reorderedColumns = newOrder.map(colId =>
                    window.cachedBoard.columns.find(col => col.id === colId)
                ).filter(Boolean);

                window.cachedBoard.columns = reorderedColumns;
                
                // Also update currentBoard for compatibility
                if (window.currentBoard !== window.cachedBoard) {
                    const currentReordered = newOrder.map(colId => 
                        window.currentBoard.columns.find(col => col.id === colId)
                    ).filter(Boolean);
                    window.currentBoard.columns = currentReordered;
                }
            }
            
            // NEW CACHE SYSTEM: Mark as unsaved
            if (typeof markUnsavedChanges === 'function') {
                markUnsavedChanges(); 
            }
            
            // Reset drag state
            dragState.draggedColumn = null;
            dragState.draggedColumnId = null;
            dragState.originalDataIndex = -1;
            dragState.isDragging = false;
            dragState.lastDropTarget = null;
        });

        column.addEventListener('dragover', e => {
            if (!dragState.draggedColumn || dragState.draggedColumn === column) {return;}
            
            e.preventDefault();
            
            const rect = column.getBoundingClientRect();
            const midpoint = rect.left + rect.width / 2;
            
            // Determine target position
            let targetElement;
            let insertBefore = false;
            
            if (e.clientX < midpoint) {
                targetElement = column;
                insertBefore = true;
            } else {
                targetElement = column.nextSibling;
                insertBefore = false;
            }
            
            // Only move if it's a different position than last time
            if (dragState.lastDropTarget !== targetElement) {
                dragState.lastDropTarget = targetElement;
                
                if (insertBefore) {
                    // Only move if not already there
                    if (dragState.draggedColumn.nextSibling !== column) {
                        column.parentNode.insertBefore(dragState.draggedColumn, column);
                    }
                } else {
                    // Only move if not already there
                    if (targetElement && dragState.draggedColumn.nextSibling !== targetElement) {
                        column.parentNode.insertBefore(dragState.draggedColumn, targetElement);
                    } else if (!targetElement && dragState.draggedColumn !== column.parentNode.lastElementChild) {
                        column.parentNode.appendChild(dragState.draggedColumn);
                    }
                }
            }
        });
    });
}

function calculateColumnNewPosition(draggedColumn) {

    if (!currentBoard || !currentBoard.columns) {return 0;}
    
    const boardElement = document.getElementById('kanban-board');
    const columnId = draggedColumn.getAttribute('data-column-id');
    
    // Build the desired final order of ALL columns based on current DOM state
    let desiredOrder = [];
    
    // Check if we have multi-row layout
    const rows = boardElement.querySelectorAll('.kanban-row');
    if (rows.length > 0) {
        // Multi-row layout - collect columns row by row, left to right
        rows.forEach(row => {
            const columnsInRow = row.querySelectorAll('.kanban-full-height-column');
            columnsInRow.forEach(col => {
                const colId = col.getAttribute('data-column-id');
                if (colId) {
                    desiredOrder.push(colId);
                }
            });
        });
    } else {
        // Single row layout
        const columns = boardElement.querySelectorAll('.kanban-full-height-column');
        columns.forEach(col => {
            const colId = col.getAttribute('data-column-id');
            if (colId) {
                desiredOrder.push(colId);
            }
        });
    }
    
    // Find where our dragged column should be in the final order
    const targetPosition = desiredOrder.indexOf(columnId);
    
    
    return targetPosition >= 0 ? targetPosition : 0;
}