// Use the global vscode instance set up in HTML
// (vscode is already declared globally in webview.html)

// Global variables
let currentFileInfo = null;

// MD5 hash generation function using Web Crypto API
async function generateMD5Hash(arrayBuffer) {
    try {
        // Use SHA-256 instead of MD5 as it's more widely supported and secure
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex.substring(0, 16); // Take first 16 characters to simulate MD5 length
    } catch (error) {
        console.error('❌ Failed to generate hash:', error.message);
        // Fallback to timestamp if crypto fails
        return Date.now().toString(16);
    }
}
let canUndo = false;
let canRedo = false;
window.currentImageMappings = {};
window.showRowTags = false;

// Card navigation variables
let currentFocusedCard = null;
let allCards = [];

// Document-specific folding state storage
let documentFoldingStates = new Map(); // Map<documentUri, {collapsedColumns: Set, collapsedTasks: Set, columnFoldStates: Map}>
let currentDocumentUri = null;

// Layout preferences
let currentColumnWidth = '350px';
let currentWhitespace = '8px';
let currentTaskMinHeight = 'auto';
let currentLayoutRows = 1;

// Centralized configuration for all menu options
// Font size configuration
const fontSizeMultipliers = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0];

// Generate font size CSS dynamically
function generateFontSizeCSS() {
    let css = '';
    fontSizeMultipliers.forEach(multiplier => {
        const safeName = multiplier.toString().replace('.', '_');
        const className = `font-size-${safeName}x`;
        const titleSize = `calc(var(--vscode-font-size, 14px) * ${multiplier})`;
        const descSize = `calc(var(--vscode-font-size, 14px) * ${multiplier * 0.9})`;
        const lineHeight = multiplier >= 2 ? '1.1' : (multiplier >= 1.5 ? '1.2' : '1.4');

        css += `
/* Font Size Classes - ${multiplier}x */
body.${className} .column-title,
body.${className} .column-title-edit,
body.${className} .task-title-display,
body.${className} .task-title-edit {
  font-size: ${titleSize} !important;
  line-height: ${lineHeight} !important;
}

body.${className} .task-description-display,
body.${className} .task-description-edit {
  font-size: ${descSize} !important;
  line-height: ${lineHeight === '1.1' ? '1.15' : (lineHeight === '1.2' ? '1.3' : '1.4')} !important;
}
`;
    });
    return css;
}

// Inject font size CSS into document
function injectFontSizeCSS() {
    const existingStyle = document.getElementById('dynamic-font-sizes');
    if (existingStyle) {
        existingStyle.remove();
    }

    const style = document.createElement('style');
    style.id = 'dynamic-font-sizes';
    style.textContent = generateFontSizeCSS();
    document.head.appendChild(style);
}

const menuConfig = {
    columnWidth: [
        { label: "Small (250px)", value: "250px", description: "250px" },
        { label: "Medium (350px)", value: "350px", description: "350px" },
        { label: "Wide (450px)", value: "450px", description: "450px" },
        { separator: true },
        { label: "1/3 Screen (33%)", value: "33percent", description: "33%" },
        { label: "1/2 Screen (50%)", value: "50percent", description: "50%" },
        { label: "Full Width (100%)", value: "100percent", description: "100%" }
    ],
    cardHeight: [
        { label: "Auto Height", value: "auto" },
        { separator: true },
        { label: "Small (200px)", value: "200px" },
        { label: "Medium (400px)", value: "400px" },
        { label: "Large (600px)", value: "600px" },
        { separator: true },
        { label: "1/3 Screen (26.5%)", value: "33percent" },
        { label: "1/2 Screen (43.5%)", value: "50percent" },
        { label: "Full Screen (89%)", value: "100percent" }
    ],
    whitespace: [
        { label: "Compact (4px)", value: "4px" },
        { label: "Default (8px)", value: "8px" },
        { label: "Comfortable (12px)", value: "12px" },
        { label: "Spacious (16px)", value: "16px" },
        { label: "Large (24px)", value: "24px" },
        { label: "Extra Large (36px)", value: "36px" },
        { label: "Maximum (48px)", value: "48px" }
    ],
    fontSize: fontSizeMultipliers.map((multiplier, index) => ({
        label: `${multiplier}x`,
        value: `${multiplier.toString().replace('.', '_')}x`,
        icon: multiplier < 1 ? "a" : "A",
        iconStyle: `font-size: ${10 + index}px;`
    })),
    fontFamily: [
        { label: "System Default", value: "system", icon: "Aa" },
        { label: "Roboto", value: "roboto", icon: "Aa", iconStyle: "font-family: 'Roboto', sans-serif;" },
        { label: "Open Sans", value: "opensans", icon: "Aa", iconStyle: "font-family: 'Open Sans', sans-serif;" },
        { label: "Lato", value: "lato", icon: "Aa", iconStyle: "font-family: 'Lato', sans-serif;" },
        { label: "Poppins", value: "poppins", icon: "Aa", iconStyle: "font-family: 'Poppins', sans-serif;" },
        { label: "Inter", value: "inter", icon: "Aa", iconStyle: "font-family: 'Inter', sans-serif;" },
        { separator: true },
        { label: "Helvetica", value: "helvetica", icon: "Aa", iconStyle: "font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;" },
        { label: "Arial", value: "arial", icon: "Aa", iconStyle: "font-family: Arial, sans-serif;" },
        { label: "Georgia", value: "georgia", icon: "Aa", iconStyle: "font-family: Georgia, serif;" },
        { label: "Times New Roman", value: "times", icon: "Aa", iconStyle: "font-family: 'Times New Roman', serif;" },
        { separator: true },
        { label: "Fira Code", value: "firacode", icon: "{ }", iconStyle: "font-family: 'Fira Code', monospace;" },
        { label: "JetBrains Mono", value: "jetbrains", icon: "{ }", iconStyle: "font-family: 'JetBrains Mono', monospace;" },
        { label: "Source Code Pro", value: "sourcecodepro", icon: "{ }", iconStyle: "font-family: 'Source Code Pro', monospace;" },
        { label: "Consolas", value: "consolas", icon: "{ }", iconStyle: "font-family: Consolas, monospace;" }
    ],
    layoutRows: [
        { label: "1 Row", value: 1 },
        { label: "2 Rows", value: 2 },
        { label: "3 Rows", value: 3 },
        { label: "4 Rows", value: 4 },
        { label: "5 Rows", value: 5 },
        { label: "6 Rows", value: 6 }
    ],
    rowHeight: [
        { label: "Auto Height", value: "auto" },
        { separator: true },
        { label: "Small (300px)", value: "300px" },
        { label: "Medium (500px)", value: "500px" },
        { label: "Large (700px)", value: "700px" },
        { separator: true },
        { label: "1/3 Screen (31.5%)", value: "33percent" },
        { label: "1/2 Screen (48%)", value: "50percent" },
        { label: "2/3 Screen (63%)", value: "67percent" },
        { label: "Full Screen (95%)", value: "100percent" }
    ],
    stickyHeaders: [
        { label: "Enabled", value: "enabled", description: "Headers stick to top when scrolling" },
        { label: "Disabled", value: "disabled", description: "Headers scroll with content" }
    ],
    tagVisibility: [
        { label: "All Tags", value: "all", description: "Show all tags including #span, #row, and @ tags" },
        { label: "All Excluding Layout", value: "allexcludinglayout", description: "Show all except #span and #row (includes @ tags)" },
        { label: "Custom Tags Only", value: "customonly", description: "Show only custom tags (not configured ones) and @ tags" },
        { label: "@ Tags Only", value: "mentionsonly", description: "Show only @ tags" },
        { label: "No Tags", value: "none", description: "Hide all tags" }
    ],
    exportTagVisibility: [
        { label: "All Tags", value: "all", description: "Export all tags including #span, #row, and @ tags" },
        { label: "All Excluding Layout", value: "allexcludinglayout", description: "Export all except #span and #row (includes @ tags)" },
        { label: "Custom Tags Only", value: "customonly", description: "Export only custom tags (not configured ones) and @ tags" },
        { label: "@ Tags Only", value: "mentionsonly", description: "Export only @ tags" },
        { label: "No Tags", value: "none", description: "Export without any tags" }
    ],
    imageFill: [
        { label: "Fit Content", value: "fit", description: "Images size to their natural dimensions" },
        { label: "Fill Space", value: "fill", description: "Images fill available space while keeping aspect ratio" }
    ]
};

// Layout Presets Configuration (will be loaded from backend)
let layoutPresets = {};

// Function to get current setting value for menu indicators
function getCurrentSettingValue(configKey) {
    switch (configKey) {
        case 'columnWidth':
            return window.currentColumnWidth || '350px';
        case 'cardHeight':
            return window.currentTaskMinHeight || 'auto';
        case 'whitespace':
            return window.currentWhitespace || '8px';
        case 'fontSize':
            return window.currentFontSize || '1x';
        case 'fontFamily':
            return window.currentFontFamily || 'system';
        case 'layoutRows':
            return window.currentLayoutRows || 1;
        case 'rowHeight':
            return window.currentRowHeight || 'auto';
        case 'stickyHeaders':
            return window.currentStickyHeaders || 'enabled';
        case 'tagVisibility':
            return window.currentTagVisibility || 'allexcludinglayout';
        case 'exportTagVisibility':
            return window.currentExportTagVisibility || 'allexcludinglayout';
        case 'imageFill':
            return window.currentImageFill || 'fit';
        default:
            return null;
    }
}

// Single function to update all menu indicators
function updateAllMenuIndicators() {
    const menuMappings = [
        { selector: '[data-menu="columnWidth"]', config: 'columnWidth', function: 'setColumnWidth' },
        { selector: '[data-menu="cardHeight"]', config: 'cardHeight', function: 'setTaskMinHeight' },
        { selector: '[data-menu="whitespace"]', config: 'whitespace', function: 'setWhitespace' },
        { selector: '[data-menu="fontSize"]', config: 'fontSize', function: 'setFontSize' },
        { selector: '[data-menu="fontFamily"]', config: 'fontFamily', function: 'setFontFamily' },
        { selector: '[data-menu="layoutRows"]', config: 'layoutRows', function: 'setLayoutRows' },
        { selector: '[data-menu="rowHeight"]', config: 'rowHeight', function: 'setRowHeight' },
        { selector: '[data-menu="stickyHeaders"]', config: 'stickyHeaders', function: 'setStickyHeaders' },
        { selector: '[data-menu="tagVisibility"]', config: 'tagVisibility', function: 'setTagVisibility' },
        { selector: '[data-menu="exportTagVisibility"]', config: 'exportTagVisibility', function: 'setExportTagVisibility' },
        { selector: '[data-menu="imageFill"]', config: 'imageFill', function: 'setImageFill' }
    ];

    menuMappings.forEach(mapping => {
        const container = document.querySelector(mapping.selector);
        if (container) {
            container.innerHTML = generateMenuHTML(mapping.config, mapping.function);
        }
    });
}

// Helper function to generate menu HTML from configuration
function generateMenuHTML(configKey, onClickFunction) {
    const config = menuConfig[configKey];
    if (!config) {return '';}

    const currentValue = getCurrentSettingValue(configKey);

    let html = '';
    for (const item of config) {
        if (item.separator) {
            html += '<div class="file-bar-menu-divider"></div>';
        } else {
            const iconHtml = item.icon ? `<span class="menu-icon"${item.iconStyle ? ` style="${item.iconStyle}"` : ''}>${item.icon}</span> ` : '';
            const isSelected = item.value === currentValue;
            const selectedClass = isSelected ? ' selected' : '';
            const checkmark = isSelected ? '<span class="menu-checkmark">✓</span>' : '';
            html += `<button class="file-bar-menu-item${selectedClass}" onclick="${onClickFunction}('${item.value}')">${iconHtml}${item.label}${checkmark}</button>`;
        }
    }
    return html;
}

// Function to populate dynamic menus
function populateDynamicMenus() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', populateDynamicMenus);
        return;
    }

    // Use the shared update function
    updateAllMenuIndicators();
}

// Clipboard card source functionality
let clipboardCardData = null;

/**
 * Legacy clipboard mousedown handler (deprecated)
 * Purpose: Previously handled clipboard interactions
 * Used by: Clipboard card source (now unused)
 * @param {MouseEvent} e - Mouse event
 */
window.handleClipboardMouseDown = async function(e) {
    // Refresh clipboard data immediately when user starts interacting
    clipboardCardData = await readClipboardContent();

    // Update the visual indicator immediately after refresh
    const clipboardSource = document.getElementById('clipboard-card-source');
    if (clipboardSource) {
        const iconSpan = clipboardSource.querySelector('.clipboard-icon');
        if (clipboardCardData && clipboardCardData.isImage) {
            iconSpan.textContent = '🖼️';
        } else if (clipboardCardData) {
            iconSpan.textContent = '📋';
        }
    }
};

/**
 * Handles drag start for clipboard card creation
 * Purpose: Enables dragging clipboard content to create cards
 * Used by: Clipboard card source UI element
 * @param {DragEvent} e - Drag event
 * Side effects: Sets drag state, formats clipboard data
 */
window.handleClipboardDragStart = function(e) {

    // Create default data if no clipboard data
    if (!clipboardCardData) {
        clipboardCardData = {
            title: 'Clipboard Content',
            content: 'Drag to create card from clipboard',
            isLink: false
        };
    }
    
    // Handle clipboard images
    if (clipboardCardData && clipboardCardData.isImage) {
        // For images, we have the base64 data already
        const imageData = clipboardCardData.content; // This is base64 now

        // Create data transfer with the base64 image data
        e.dataTransfer.setData('text/plain', `CLIPBOARD_IMAGE:${JSON.stringify({
            title: clipboardCardData.title,
            type: 'base64',
            imageType: clipboardCardData.imageType,
            data: imageData, // Include the actual base64 data
            md5Hash: clipboardCardData.md5Hash // Include the MD5 hash for filename
        })}`);

        e.dataTransfer.effectAllowed = 'copy';

        if (window.dragState) {
            window.dragState.isDragging = true;
            // Don't set draggedClipboardCard for images - let dataTransfer handle it
        }

        e.target.classList.add('dragging');
        return;
    }
    // Handle multiple files by passing pre-formatted links
    if (clipboardCardData && clipboardCardData.multipleFiles) {
        e.dataTransfer.setData('text/plain', `MULTIPLE_FILES:${clipboardCardData.content}`);
        e.dataTransfer.effectAllowed = 'copy';

        // Set drag state but don't set clipboard card
        if (window.dragState) {
            window.dragState.isDragging = true;
        }

        e.target.classList.add('dragging');
        return;
    }

    // Create task data for single content
    const tempTask = {
        id: 'temp-clipboard-' + Date.now(),
        title: clipboardCardData.title,
        description: clipboardCardData.isImage ? '[Image from clipboard]' : clipboardCardData.content,
        isFromClipboard: true
    };

    // Set drag state
    if (window.dragState) {
        window.dragState.isDragging = true;
        window.dragState.draggedClipboardCard = tempTask;
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

/**
 * Handles drag end for clipboard operations
 * Purpose: Cleanup after clipboard drag operation
 * Used by: Clipboard card source drag end
 * @param {DragEvent} e - Drag event
 * Side effects: Clears drag state and visual feedback
 */
window.handleClipboardDragEnd = function(e) {
    
    // Clear visual feedback
    e.target.classList.remove('dragging');
    
    // Clear drag state
    if (window.dragState) {
        window.dragState.isDragging = false;
        window.dragState.draggedClipboardCard = null;
    }
};

/**
 * Shows preview of clipboard content
 * Purpose: Display what will be created from clipboard
 * Used by: Clipboard card source hover/focus
 * Side effects: Updates preview UI elements
 */
window.showClipboardPreview = function() {
    const preview = document.getElementById('clipboard-preview');
    const header = document.getElementById('clipboard-preview-header');
    const body = document.getElementById('clipboard-preview-body');
    
    if (!preview || !clipboardCardData) {return;}
    
    // Update header based on content type
    if (clipboardCardData.isImage) {
        header.textContent = 'Clipboard Image';
    } else if (clipboardCardData.isLink) {
        if (clipboardCardData.content.startsWith('![')) {
            header.textContent = 'Image Link';
        } else if (clipboardCardData.content.startsWith('[')) {
            header.textContent = 'File Link';
        } else {
            header.textContent = 'URL Link';
        }
    } else {
        header.textContent = 'Clipboard Content';
    }
    
    // Clear previous content
    body.innerHTML = '';

    // Show image preview for clipboard images (base64)
    if (clipboardCardData.isImage && clipboardCardData.content) {
        const img = document.createElement('img');
        img.className = 'clipboard-preview-image';
        img.src = clipboardCardData.content; // This is base64 data URL

        const textDiv = document.createElement('div');
        textDiv.className = 'clipboard-preview-text';
        textDiv.textContent = '[Image from clipboard - will be saved when dropped]';

        img.onload = function() {
            body.appendChild(img);
            body.appendChild(textDiv);
        };

        img.onerror = function() {
            // If image fails to load, show fallback text
            textDiv.textContent = '[Clipboard contains image data]';
            body.appendChild(textDiv);
        };

    // Show image preview if it's an image link
    } else if (clipboardCardData.isLink && clipboardCardData.content.startsWith('![')) {
        // Extract image path from markdown ![alt](path)
        const imageMatch = clipboardCardData.content.match(/!\[.*?\]\((.*?)\)/);
        if (imageMatch && imageMatch[1]) {
            const imagePath = imageMatch[1];
            
            // Create image element
            const img = document.createElement('img');
            img.className = 'clipboard-preview-image';
            img.src = imagePath;
            
            // Add the markdown text first
            const textDiv = document.createElement('div');
            textDiv.className = 'clipboard-preview-text';
            textDiv.textContent = clipboardCardData.content;
            
            img.onerror = function() {
                // If image fails to load, just show text
                body.appendChild(textDiv);
            };
            
            img.onload = function() {
                // Image loaded successfully - show image then text
                body.appendChild(img);
                body.appendChild(textDiv);
            };
            
            // Start loading the image
            // If it fails, only text will show; if it succeeds, both will show
            
        } else {
            // Fallback to text
            const textDiv = document.createElement('div');
            textDiv.className = 'clipboard-preview-text';
            textDiv.textContent = clipboardCardData.content;
            body.appendChild(textDiv);
        }
    } else {
        // Show text content
        const textDiv = document.createElement('div');
        textDiv.className = 'clipboard-preview-text';
        textDiv.textContent = clipboardCardData.content;
        body.appendChild(textDiv);
    }
    
    // Show the preview
    preview.classList.add('show');
};

/**
 * Hides clipboard content preview
 * Purpose: Clean up preview display
 * Used by: Mouse leave, blur events
 * Side effects: Hides preview element
 */
window.hideClipboardPreview = function() {
    const preview = document.getElementById('clipboard-preview');
    if (preview) {
        preview.classList.remove('show');
    }
};

// Empty card drag handlers
window.handleEmptyCardDragStart = function(e) {
    
    // Create empty task data
    const tempTask = {
        id: 'temp-empty-' + Date.now(),
        title: '',
        description: '',
        isFromEmptyCard: true
    };
    
    // Set drag state
    if (window.dragState) {
        window.dragState.isDragging = true;
        window.dragState.draggedEmptyCard = tempTask;
    }
    
    // Set drag data
    const dragData = JSON.stringify({
        type: 'empty-card',
        task: tempTask
    });
    e.dataTransfer.setData('text/plain', `EMPTY_CARD:${dragData}`);
    e.dataTransfer.effectAllowed = 'copy';
    
    // Add visual feedback
    e.target.classList.add('dragging');
};

window.handleEmptyCardDragEnd = function(e) {
    
    // Clear visual feedback
    e.target.classList.remove('dragging');
    
    // Clear drag state
    if (window.dragState) {
        window.dragState.isDragging = false;
        window.dragState.draggedEmptyCard = null;
    }
};

async function readClipboardContent() {
    try {
        // Check clipboard permissions first
        if (!navigator.clipboard) {
            console.error('❌ Clipboard API not available');
            return null;
        }

        // Check if we have clipboard permissions
        try {
            const permission = await navigator.permissions.query({ name: 'clipboard-read' });
            if (permission.state === 'denied') {
                console.warn('⚠️ Clipboard read permission denied');
                return null;
            }
        } catch (permError) {
            console.warn('⚠️ Could not check clipboard permissions:', permError.message);
        }

        // First check for clipboard images
        let clipboardItems;
        try {
            clipboardItems = await navigator.clipboard.read();
        } catch (error) {
            console.error('❌ Failed to read clipboard items:', error.message);
            // Fall back to text reading
            try {
                const text = await navigator.clipboard.readText();
                if (text && text.trim()) {
                    return await processClipboardText(text.trim());
                }
            } catch (textError) {
                console.error('❌ Failed to read clipboard text as fallback:', textError.message);
            }
            return null;
        }

        for (const clipboardItem of clipboardItems) {
            for (const type of clipboardItem.types) {
                if (type.startsWith('image/')) {
                    let blob;
                    try {
                        blob = await clipboardItem.getType(type);
                    } catch (error) {
                        console.error('❌ Failed to get blob for type', type, ':', error.message);
                        continue;
                    }

                    // Convert blob to base64 immediately to avoid blob being discarded
                    try {
                        const reader = new FileReader();
                        const base64Promise = new Promise((resolve, reject) => {
                            reader.onloadend = () => resolve(reader.result);
                            reader.onerror = () => reject(new Error('Failed to read blob as base64'));
                            reader.readAsDataURL(blob);
                        });

                        const base64Data = await base64Promise;

                        // Generate MD5 hash from blob data for consistent filename
                        const arrayBufferReader = new FileReader();
                        const arrayBufferPromise = new Promise((resolve, reject) => {
                            arrayBufferReader.onloadend = () => resolve(arrayBufferReader.result);
                            arrayBufferReader.onerror = () => reject(new Error('Failed to read blob as array buffer'));
                            arrayBufferReader.readAsArrayBuffer(blob);
                        });

                        const arrayBuffer = await arrayBufferPromise;
                        const md5Hash = await generateMD5Hash(arrayBuffer);

                        return {
                            title: 'Clipboard Image',
                            content: base64Data,
                            isLink: false,
                            isImage: true,
                            imageType: type,
                            isBase64: true,
                            md5Hash: md5Hash
                        };
                    } catch (error) {
                        console.error('❌ Failed to convert blob to base64:', error.message);
                        continue;
                    }
                }
            }
        }

        // If no images, check for text
        try {
            const text = await navigator.clipboard.readText();

            if (!text || text.trim() === '') {
                return null;
            }

            return await processClipboardText(text.trim());
        } catch (error) {
            console.error('❌ Failed to read clipboard text:', error.message);
            return null;
        }

    } catch (error) {
        console.error('❌ Unexpected error in readClipboardContent:', error.message);

        // Last resort fallback to text-only clipboard reading
        try {
            const text = await navigator.clipboard.readText();
            if (text && text.trim()) {
                return await processClipboardText(text.trim());
            }
        } catch (fallbackError) {
            console.error('❌ Last resort text reading failed:', fallbackError.message);
        }

        return null;
    }
}

// Helper functions for file path processing
/**
 * Legacy wrapper for backward compatibility - delegates to fileTypeUtils
 * @deprecated Use fileTypeUtils.isFilePath() instead
 */
function isFilePath(text) {
    return fileTypeUtils.isFilePath(text);
}

// escapeFilePath function moved to utils/validationUtils.js

function createFileMarkdownLink(filePath) {
    const fileName = filePath.split(/[\/\\]/).pop() || filePath;
    const extension = fileName.toLowerCase().split('.').pop();

    // Image file extensions
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico', 'tiff', 'tif'];
    // Markdown file extensions
    const markdownExtensions = ['md', 'markdown', 'mdown', 'mkd', 'mdx'];

    // Use original path without modification - let the system handle path resolution
    const safePath = escapeFilePath(filePath);

    if (imageExtensions.includes(extension)) {
        // Image: ![](path) - use original path
        return `![](${safePath})`;
    } else if (markdownExtensions.includes(extension)) {
        // Markdown: [[filename]] - for relative paths use just filename, for absolute paths use full path
        if (filePath.includes('/') || filePath.includes('\\')) {
            return `[[${safePath}]]`;
        } else {
            return `[[${fileName}]]`;
        }
    } else if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        // URL: <url>
        return `<${filePath}>`;
    } else {
        // Other files: [filename](path)
        const baseName = fileName.replace(/\.[^/.]+$/, "");
        return `[${baseName}](${safePath})`;
    }
}

async function processClipboardText(text) {
    // Handle multiple lines - check for multiple file paths first
    const lines = text.split(/\r\n|\r|\n/).map(line => line.trim()).filter(line => line.length > 0);

    if (lines.length > 1) {
        const filePaths = lines.filter(line => isFilePath(line));

        if (filePaths.length > 1) {
            // Multiple file paths - create links for each
            const links = filePaths.map(filePath => createFileMarkdownLink(filePath));
            const content = links.join('\n');

            return {
                title: `${filePaths.length} Files`,
                content: content,
                isLink: true,
                multipleFiles: true
            };
        }
    }

    // Single line processing
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

    // Check if it's a single file path
    if (isFilePath(text.trim())) {
        const filePath = text.trim();
        const fileName = filePath.split(/[\/\\]/).pop();
        const content = createFileMarkdownLink(filePath);

        return {
            title: fileName,
            content: content,
            isLink: true
        };
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
    const textLines = text.split('\n');
    const title = textLines[0].length > 50 ? textLines[0].substring(0, 50) + '...' : textLines[0];
    
    return {
        title: title || 'Clipboard Content',
        content: text,
        isLink: false
    };
}

/**
 * Legacy wrapper for backward compatibility - delegates to fileTypeUtils
 * @deprecated Use fileTypeUtils.isImageFile() instead
 */
function isImageFile(fileName) {
    return fileTypeUtils.isImageFile(fileName);
}

// escapeHtml function moved to utils/validationUtils.js

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
    // Update clipboard content
    clipboardCardData = await readClipboardContent();
    const clipboardSource = document.getElementById('clipboard-card-source');
    
    if (clipboardSource) {
        const iconSpan = clipboardSource.querySelector('.clipboard-icon');
        const textSpan = clipboardSource.querySelector('.clipboard-text');
        
        if (clipboardCardData && clipboardCardData.content) {
            clipboardSource.style.opacity = '1';
            clipboardSource.title = `Drag to create card: "${escapeHtml(clipboardCardData.title)}"`;
            
            // Show first 15 characters + character count (escaped for display)
            const rawPreview = clipboardCardData.content.length > 15 
                ? clipboardCardData.content.substring(0, 15) + `... (${clipboardCardData.content.length})`
                : `${clipboardCardData.content} (${clipboardCardData.content.length})`;
            
            // Escape the preview content to prevent HTML rendering
            const preview = escapeHtml(rawPreview);
            
            // Update visual indicator based on content type
            if (clipboardCardData.isImage) {
                iconSpan.textContent = '🖼️';
                textSpan.textContent = 'Image';
            } else if (clipboardCardData.isLink) {
                // Check if it's an image file or URL
                if (clipboardCardData.content.startsWith('![')) {
                    iconSpan.textContent = '🖼️';
                } else if (clipboardCardData.content.startsWith('[')) {
                    iconSpan.textContent = '📄';
                } else {
                    iconSpan.textContent = '🔗';
                }
                textSpan.textContent = preview;
            } else {
                iconSpan.textContent = '📋';
                textSpan.textContent = preview;
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
    if (!clipboardSource) {
        return;
    }
    
    clipboardSource.addEventListener('dragstart', (e) => {
        // Check if this is an image - if so, don't override the image handling
        if (clipboardCardData && clipboardCardData.isImage) {
            console.log('=== CONFLICTING HANDLER: Skipping for image ===');
            return; // Let the main handler deal with images
        }

        console.log('=== CONFLICTING HANDLER: Processing as text ===');
        // For testing - create dummy data if no clipboard data
        if (!clipboardCardData) {
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
            description: clipboardCardData.isImage ? '[Image from clipboard]' : clipboardCardData.content,
            isFromClipboard: true
        };


        // Store in drag data
        const dragData = JSON.stringify({
            type: 'clipboard-card',
            task: tempTask
        });

        // Use text/plain with a special prefix for clipboard cards
        // Custom MIME types don't work reliably across browsers
        e.dataTransfer.setData('text/plain', `CLIPBOARD_CARD:${dragData}`);
        e.dataTransfer.effectAllowed = 'copy';
        
        
        // Set drag state to prevent interference with internal drag detection
        if (window.dragState) {
            window.dragState.isDragging = true;
            window.dragState.draggedClipboardCard = tempTask;
        } else {
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

// Function to position file bar dropdown
function positionFileBarDropdown(triggerButton, dropdown) {
    const rect = triggerButton.getBoundingClientRect();
    const dropdownWidth = 200; // Approximate dropdown width
    const dropdownHeight = 400; // Approximate dropdown height
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Position below the button and aligned to the right
    let left = rect.right - dropdownWidth;
    let top = rect.bottom + 4; // Small margin below button
    
    // Adjust if dropdown would go off-screen horizontally
    if (left < 10) {
        left = 10; // Minimum left margin
    }
    if (left + dropdownWidth > viewportWidth) {
        left = viewportWidth - dropdownWidth - 10;
    }
    
    // Adjust if dropdown would go off-screen vertically (unlikely for top bar menu)
    if (top + dropdownHeight > viewportHeight) {
        top = viewportHeight - dropdownHeight - 10;
    }
    
    // Apply the calculated position
    dropdown.style.left = left + 'px';
    dropdown.style.top = top + 'px';
    dropdown.style.right = 'auto';
    dropdown.style.bottom = 'auto';
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
        
        // Position the file bar dropdown
        const dropdown = menu.querySelector('.file-bar-menu-dropdown');
        if (dropdown) {
            positionFileBarDropdown(button, dropdown);
            
            // Set up submenu positioning for file bar items with submenus
            dropdown.querySelectorAll('.file-bar-menu-item.has-submenu').forEach(menuItem => {
                // Remove any existing listeners to prevent duplicates
                if (menuItem._submenuPositionHandler) {
                    menuItem.removeEventListener('mouseenter', menuItem._submenuPositionHandler);
                }
                if (menuItem._submenuHideHandler) {
                    menuItem.removeEventListener('mouseleave', menuItem._submenuHideHandler);
                }
                
                // Create and store the handlers
                
                // Add submenu hover handlers to keep it visible
                const submenu = menuItem.querySelector('.file-bar-menu-submenu');
                if (submenu) {
                    // Track hover state more reliably
                    let isSubmenuHovered = false;
                    let isMenuItemHovered = false;
                    
                    const updateSubmenuVisibility = () => {
                        if (isSubmenuHovered || isMenuItemHovered) {
                            submenu.style.setProperty('display', 'block', 'important');
                            submenu.style.setProperty('visibility', 'visible', 'important');
                        } else {
                            setTimeout(() => {
                                if (!isSubmenuHovered && !isMenuItemHovered) {
                                    submenu.style.setProperty('display', 'none', 'important');
                                    submenu.style.setProperty('visibility', 'hidden', 'important');
                                }
                            }, 150);
                        }
                    };
                    
                    // Menu item hover tracking
                    menuItem.addEventListener('mouseenter', () => {
                        isMenuItemHovered = true;
                        // Position file bar submenu to the left (it's right-aligned)
                        const rect = menuItem.getBoundingClientRect();
                        
                        // Temporarily show submenu to get its actual dimensions
                        submenu.style.visibility = 'hidden';
                        submenu.style.display = 'block';
                        const submenuRect = submenu.getBoundingClientRect();
                        const submenuWidth = submenuRect.width || 200;
                        
                        // Position to the left of the menu item, aligned with its left edge
                        let left = rect.left - submenuWidth + 1; // 1px overlap for smooth hover
                        let top = rect.top;
                        
                        // Adjust if it would go off-screen
                        if (left < 10) {
                            left = 10;
                        }
                        
                        submenu.style.position = 'fixed';
                        submenu.style.left = left + 'px';
                        submenu.style.top = top + 'px';
                        submenu.style.zIndex = '2147483647';
                        submenu.style.visibility = 'visible';
                        
                        updateSubmenuVisibility();
                    });
                    menuItem.addEventListener('mouseleave', () => {
                        isMenuItemHovered = false;
                        updateSubmenuVisibility();
                    });
                    
                    // Submenu hover tracking  
                    submenu.addEventListener('mouseenter', () => {
                        isSubmenuHovered = true;
                        updateSubmenuVisibility();
                    });
                    submenu.addEventListener('mouseleave', () => {
                        isSubmenuHovered = false;
                        updateSubmenuVisibility();
                    });
                }
            });
        }
    }
}

// Function to set column width
/**
 * Sets the width of all kanban columns
 * Purpose: Adjust column width for different screen sizes
 * Used by: Column width menu selections
 * @param {string} size - 'narrow', 'medium', 'wide', 'full'
 * Side effects: Updates CSS variables, saves preference
 */
function applyColumnWidth(size, skipRender = false) {
    currentColumnWidth = size;
    window.currentColumnWidth = size;
    
    // Remove all existing column width classes
    const columns = document.querySelectorAll('.kanban-full-height-column');
    columns.forEach(column => {
        column.classList.remove('column-width-33percent', 'column-width-50percent', 'column-width-100percent');
        // Only remove span classes for viewport-based widths (40%, 66%, 100%), not pixel widths
        if (size === '33percent' || size === '50percent' || size === '100percent') {
            column.classList.remove('column-span-2', 'column-span-3', 'column-span-4');
        }
    });

    // Handle pixel-based and percentage-based widths differently
    if (size === '33percent' || size === '50percent' || size === '100percent') {
        // For percentage widths, add CSS classes
        columns.forEach(column => {
            column.classList.add(`column-width-${size}`);
        });
        // Reset CSS custom property to default for percentage layouts
        document.documentElement.style.setProperty('--column-width', '350px');
    } else {
        // For pixel widths, use CSS custom properties
        // For pixel widths, use CSS custom properties directly
        const width = size; // Now size is already in correct format like '250px', '350px', etc.
        document.documentElement.style.setProperty('--column-width', width);

        // For pixel widths, re-apply span classes if they exist
        // Trigger a re-render to restore span classes from column titles
        if (window.currentBoard && !skipRender) {
            renderBoard(window.currentBoard, { skipRender: false });
        }
    }
}

function setColumnWidth(size) {
    // Apply the column width
    applyColumnWidth(size);

    // Store preference
    configManager.setPreference('columnWidth', size);

    // Update menu indicators
    updateAllMenuIndicators();

    // Close menu
    document.querySelectorAll('.file-bar-menu').forEach(m => {
        m.classList.remove('active');
    });
    
    vscode.postMessage({ type: 'showMessage', text: `Column width set to ${size}` });
}



// Function to set layout rows
/**
 * Sets the number of rows in the kanban layout
 * Purpose: Switch between single and multi-row layouts
 * Used by: Layout menu selections
 * @param {number} rows - Number of rows (1, 2, or 3)
 * Side effects: Updates board layout, triggers re-render
 */
// Refactored layout rows functions using styleManager
function applyLayoutRows(rows) {
    currentLayoutRows = rows;
    window.currentLayoutRows = rows;

    // Use styleManager to apply CSS variable
    styleManager.applyLayoutRows(rows);

    // Re-render the board to apply row layout
    if (currentBoard) {
        renderBoard();
    }
}

function setLayoutRows(rows) {
    applyLayoutRows(rows);

    vscode.postMessage({
        type: 'setPreference',
        key: 'layoutRows',
        value: rows
    });

    updateAllMenuIndicators();

    document.querySelectorAll('.file-bar-menu').forEach(m => {
        m.classList.remove('active');
    });

    vscode.postMessage({ type: 'showMessage', text: `Layout set to ${rows} row${rows > 1 ? 's' : ''}` });
}

// Global variable to store current row height
let currentRowHeight = 'auto';

// Function to apply row height to existing rows
function applyRowHeight(height) {
    // Convert percent values to vh for CSS
    let cssHeight = height;
    if (height === '33percent') {
        cssHeight = '31.5vh';
    } else if (height === '50percent') {
        cssHeight = '48vh';
    } else if (height === '67percent') {
        cssHeight = '63vh';
    } else if (height === '100percent') {
        cssHeight = '95vh';
    }

    const rows = document.querySelectorAll('.kanban-row');
    const boardElement = document.getElementById('kanban-board');
    const isMultiRow = boardElement && boardElement.classList.contains('multi-row');

    rows.forEach((row, index) => {
        if (cssHeight === 'auto') {
            // Auto height - no constraints
            row.style.height = 'auto';
            row.style.minHeight = 'auto';
            row.style.maxHeight = 'none';
            row.style.overflowY = 'visible';
            row.style.overflowX = 'visible';
            
            // Reset individual columns
            row.querySelectorAll('.kanban-full-height-column .column-content').forEach(content => {
                content.style.maxHeight = '';
                content.style.overflowY = 'visible';
            });
        } else {
            // Fixed height - constrain row height but no row scrollbars
            row.style.height = cssHeight;
            row.style.minHeight = cssHeight;
            row.style.maxHeight = cssHeight;
            row.style.overflowY = 'hidden';  // No row scrollbars
            row.style.overflowX = 'visible';  // No horizontal scrollbar on row
            
            // Apply scrollbars to individual column contents
            row.querySelectorAll('.kanban-full-height-column .column-content').forEach(content => {
                const column = content.closest('.kanban-full-height-column');
                if (!column.classList.contains('collapsed')) {
                    // Use CSS calc to determine available height (row height minus estimated header height)
                    // This avoids relying on offsetHeight during rendering
                    const availableHeight = `calc(${height} - 60px)`; // Estimated header height
                    
                    content.style.maxHeight = availableHeight;
                    content.style.overflowY = 'auto';  // Individual column vertical scrollbar
                    content.style.overflowX = 'hidden'; // No horizontal scrollbar on columns
                }
            });
        }
    });
    
    // For single-row layout, also apply height constraints directly to columns
    if (!isMultiRow) {
        const columns = document.querySelectorAll('.kanban-full-height-column');
        columns.forEach(column => {
            const content = column.querySelector('.column-content');
            if (content && !column.classList.contains('collapsed')) {
                if (height === 'auto') {
                    content.style.maxHeight = '';
                    content.style.overflowY = 'visible';
                } else {
                    const availableHeight = `calc(${height} - 60px)`;
                    content.style.maxHeight = availableHeight;
                    content.style.overflowY = 'auto';
                    content.style.overflowX = 'hidden';
                }
            }
        });
    }
}

// Refactored row height functions using styleManager
function applyRowHeightSetting(height) {
    currentRowHeight = height;
    window.currentRowHeight = height;

    // Convert percentage values to viewport units
    let cssValue = height;
    if (height.includes('percent')) {
        const percent = parseInt(height.replace('percent', ''));
        cssValue = `${percent}vh`;
    }

    styleManager.applyRowHeight(cssValue === 'auto' ? 'auto' : cssValue);

    // Call legacy applyRowHeight if it exists
    if (typeof applyRowHeight === 'function') {
        applyRowHeight(height);
    }
}

function setRowHeight(height) {
    applyRowHeightSetting(height);

    vscode.postMessage({
        type: 'setPreference',
        key: 'rowHeight',
        value: height
    });

    updateAllMenuIndicators();

    document.querySelectorAll('.file-bar-menu').forEach(m => {
        m.classList.remove('active');
    });
    
    // Show user-friendly message
    // let message = 'Row height set to ';
    // switch(height) {
    //     case '100vh': message += '100% of screen'; break;
    //     case '63vh': message += '2/3 of screen'; break;
    //     case '44vh': message += '1/2 of screen'; break;
    //     case '30vh': message += '1/3 of screen'; break;
    //     case '44em': message += '700px (~44em)'; break;
    //     case '31em': message += '500px (~31em)'; break;
    //     case '19em': message += '300px (~19em)'; break;
    //     case 'auto': message += 'auto height'; break;
    //     default: message += height; break;
    // }
    
    // vscode.postMessage({ type: 'showMessage', text: message });
}

// Sticky headers functionality
let currentStickyHeaders = 'enabled'; // Default to enabled

function applyStickyHeaders(setting) {
    // Store current setting
    currentStickyHeaders = setting;
    window.currentStickyHeaders = setting;

    if (setting === 'disabled') {
        // Add class to disable sticky headers
        document.body.classList.add('sticky-headers-disabled');
    } else {
        // Remove class to enable sticky headers
        document.body.classList.remove('sticky-headers-disabled');
    }
}

function setStickyHeaders(setting) {
    // Apply the sticky headers setting
    applyStickyHeaders(setting);

    // Store preference
    vscode.postMessage({
        type: 'setPreference',
        key: 'stickyHeaders',
        value: setting
    });

    // Update menu indicators
    updateAllMenuIndicators();

    // Close menu
    document.querySelectorAll('.file-bar-menu').forEach(m => {
        m.classList.remove('active');
    });
}

// Tag visibility functionality
let currentTagVisibility = 'standard'; // Default to standard (exclude #span and #row)

// Helper function to filter tags from text based on current visibility setting
function filterTagsFromText(text) {
    if (!text) {return text;}

    const setting = currentTagVisibility || 'standard';

    switch (setting) {
        case 'all':
            // Show all tags - don't filter anything
            return text;
        case 'standard':
            // Hide #span and #row tags only, but preserve include syntax
            return text.replace(/#row\d+/gi, '').replace(/#span\d+/gi, '').trim();
        case 'custom':
            // Hide #span, #row, and configured tags (but show @ tags)
            // For now, just hide #span and #row (configured tag filtering happens in CSS)
            return text.replace(/#row\d+/gi, '').replace(/#span\d+/gi, '').trim();
        case 'mentions':
            // Hide all tags except @ tags - need to preserve @mentions but remove # tags
            return text.replace(/#\w+/gi, '').trim();
        case 'none':
            // Hide all tags
            return text.replace(/#\w+/gi, '').replace(/@\w+/gi, '').trim();
        default:
            // Default to standard behavior
            return text.replace(/#row\d+/gi, '').replace(/#span\d+/gi, '').trim();
    }
}

function applyTagVisibility(setting) {
    // Store current setting
    currentTagVisibility = setting;
    window.currentTagVisibility = setting;

    // Remove all tag visibility classes
    document.body.classList.remove('tag-visibility-all', 'tag-visibility-allexcludinglayout', 'tag-visibility-customonly', 'tag-visibility-mentionsonly', 'tag-visibility-none');

    // Add the selected tag visibility class
    document.body.classList.add(`tag-visibility-${setting}`);

    // Trigger re-render to apply text filtering changes
    if (window.currentBoard) {
        renderBoard(window.currentBoard, { skipRender: false });

        // Preserve column width after re-render
        setTimeout(() => {
            if (window.currentColumnWidth && window.applyColumnWidth) {
                window.applyColumnWidth(window.currentColumnWidth, true);
            }
        }, 50);
    }
}

function setTagVisibility(setting) {
    // Apply the tag visibility setting
    applyTagVisibility(setting);

    // Store preference
    vscode.postMessage({
        type: 'setPreference',
        key: 'tagVisibility',
        value: setting
    });

    // Update menu indicators
    updateAllMenuIndicators();

    // Close menu
    document.querySelectorAll('.file-bar-menu').forEach(m => {
        m.classList.remove('active');
    });
}

// Export tag visibility functionality
let currentExportTagVisibility = 'allexcludinglayout'; // Default setting

function setExportTagVisibility(setting) {
    // Store the export tag visibility setting
    currentExportTagVisibility = setting;
    window.currentExportTagVisibility = setting;

    // Store preference
    vscode.postMessage({
        type: 'setPreference',
        key: 'exportTagVisibility',
        value: setting
    });

    // Update menu indicators
    updateAllMenuIndicators();

    // Close menu
    document.querySelectorAll('.file-bar-menu').forEach(m => {
        m.classList.remove('active');
    });
}

// Helper function to filter tags from text based on export tag visibility setting
function filterTagsForExport(text) {
    if (!text) return text;

    const setting = window.currentExportTagVisibility || 'allexcludinglayout';

    switch (setting) {
        case 'all':
            // Export all tags - don't filter anything
            return text;
        case 'allexcludinglayout':
            // Export all except #span, #row, and #stack tags
            return text.replace(/#row\d+\b/gi, '').replace(/#span\d+\b/gi, '').replace(/#stack\b/gi, '').trim();
        case 'customonly':
            // Export only custom tags and @ tags (remove standard layout tags)
            return text.replace(/#row\d+\b/gi, '').replace(/#span\d+\b/gi, '').replace(/#stack\b/gi, '').trim();
        case 'mentionsonly':
            // Export only @ tags - remove all # tags
            return text.replace(/#\w+\b/gi, '').trim();
        case 'none':
            // Export no tags - remove all tags
            return text.replace(/#\w+\b/gi, '').replace(/@\w+\b/gi, '').trim();
        default:
            // Default to allexcludinglayout behavior
            return text.replace(/#row\d+\b/gi, '').replace(/#span\d+\b/gi, '').replace(/#stack\b/gi, '').trim();
    }
}

// Image fill functionality
let currentImageFill = 'fit'; // Default to fit content

function applyImageFill(setting) {
    // Store current setting
    currentImageFill = setting;
    window.currentImageFill = setting;

    // Remove all image fill classes
    document.body.classList.remove('image-fill-fit', 'image-fill-fill');

    // Add the selected image fill class
    document.body.classList.add(`image-fill-${setting}`);
}

function setImageFill(setting) {
    // Apply the image fill setting
    applyImageFill(setting);

    // Store preference
    vscode.postMessage({
        type: 'setPreference',
        key: 'imageFill',
        value: setting
    });

    // Update menu indicators
    updateAllMenuIndicators();

    // Close menu
    document.querySelectorAll('.file-bar-menu').forEach(m => {
        m.classList.remove('active');
    });
}

// Refactored whitespace functions using styleManager
function applyWhitespace(spacing) {
    currentWhitespace = spacing;
    window.currentWhitespace = spacing;

    // Use styleManager to apply CSS variable
    styleManager.applyWhitespace(spacing);

    // Call legacy updateWhitespace if it exists for compatibility
    if (typeof updateWhitespace === 'function') {
        updateWhitespace(spacing);
    }
}

function setWhitespace(spacing) {
    applyWhitespace(spacing);

    vscode.postMessage({
        type: 'setPreference',
        key: 'whitespace',
        value: spacing
    });

    updateAllMenuIndicators();

    document.querySelectorAll('.file-bar-menu').forEach(m => {
        m.classList.remove('active');
    });
}

// Refactored task min height functions using styleManager
function applyTaskMinHeight(height) {
    currentTaskMinHeight = height;
    window.currentTaskMinHeight = height;

    // Use styleManager to apply card height
    styleManager.applyCardHeight(height);

    // Call legacy updateTaskMinHeight if it exists for compatibility
    if (typeof updateTaskMinHeight === 'function') {
        updateTaskMinHeight(height);
    }
}

function setTaskMinHeight(height) {
    applyTaskMinHeight(height);

    vscode.postMessage({
        type: 'setPreference',
        key: 'taskMinHeight',
        value: height
    });

    updateAllMenuIndicators();

    document.querySelectorAll('.file-bar-menu').forEach(m => {
        m.classList.remove('active');
    });
}

// Function to detect row tags from board
/**
 * Auto-detects number of rows from column tags
 * Purpose: Determine layout from #row tags in columns
 * Used by: Board initialization and updates
 * @param {Object} board - Board data object
 * @returns {number} Detected number of rows
 */
function detectRowsFromBoard(board) {
    if (!board || !board.columns) {return 1;}

    let maxRow = 1;
    board.columns.forEach(column => {
        if (column.title) {
            // Look for #row{number} format only (hashtag required)
            const rowMatch = column.title.match(/#row(\d+)/i);
            if (rowMatch) {
                const rowNum = parseInt(rowMatch[1]);
                if (rowNum > maxRow) {
                    maxRow = rowNum;
                }
            }
        }
    });

    return Math.min(maxRow, 6); // Cap at 6 rows
}

// Function to get column row from title
function getColumnRow(title) {
    if (!title) {return 1;}
    
    // More comprehensive regex to find row tags
    const rowMatches = title.match(/#row(\d+)\b/gi);
    if (rowMatches && rowMatches.length > 0) {
        // Get the last match in case there are multiple (shouldn't happen, but just in case)
        const lastMatch = rowMatches[rowMatches.length - 1];
        const rowNum = parseInt(lastMatch.replace(/#row/i, ''));
        return Math.min(Math.max(rowNum, 1), 6); // Ensure it's between 1 and 6
    }
    return 1;
}

// Function to update column row tag
function updateColumnRowTag(columnId, newRow) {
    if (!currentBoard || !currentBoard.columns) {return;}

    const column = currentBoard.columns.find(c => c.id === columnId);
    if (!column) {return;}

    // Also update cachedBoard if it exists and is different
    let cachedColumn = null;
    if (window.cachedBoard && window.cachedBoard !== currentBoard) {
        cachedColumn = window.cachedBoard.columns.find(c => c.id === columnId);
    }
    
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
        if (cachedColumn) {
            cachedColumn.title = cleanTitle + ` #row${newRow}`;
        }
    } else {
        // For row 1, just use the clean title without any row tag
        column.title = cleanTitle;
        if (cachedColumn) {
            cachedColumn.title = cleanTitle;
        }
    }
    
    // Update the visual element immediately
    const columnElement = document.querySelector(`[data-column-id="${columnId}"]`);
    if (columnElement) {
        columnElement.setAttribute('data-row', newRow);
        
        // Update the displayed title
        const titleElement = columnElement.querySelector('.column-title');
        if (titleElement) {
            const displayTitle = column.title.replace(/#row\d+/gi, '').trim();
            const renderedTitle = displayTitle ? renderMarkdown(displayTitle) : '';
            const rowIndicator = (window.showRowTags && newRow > 1) ? `<span class="column-row-tag">Row ${newRow}</span>` : '';
            titleElement.innerHTML = renderedTitle + rowIndicator;
        }
        
        // Update the edit textarea
        const editElement = columnElement.querySelector('.column-title-edit');
        if (editElement) {
            editElement.value = column.title;
        }
    }
    
    // Send update to backend with the full title including row tag
    vscode.postMessage({
        type: 'editColumnTitle',
        columnId: columnId,
        title: column.title
    });
}

// Function to clean up any duplicate or invalid row tags
function cleanupRowTags() {
    if (!currentBoard || !currentBoard.columns) {return;}
    
    let needsUpdate = false;
    
    currentBoard.columns.forEach(column => {
        const originalTitle = column.title;
        
        // Find all row tags
        const rowTags = column.title.match(/#row\d+\b/gi) || [];
        
        if (rowTags.length > 1) {
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
    if (!currentDocumentUri) {return null;}
    
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
/**
 * Saves current folding state for document persistence
 * Purpose: Preserve fold states across document switches
 * Used by: Before document changes, refreshes
 * Side effects: Updates documentFoldingStates map
 */
function saveCurrentFoldingState() {
    if (!currentDocumentUri || !window.collapsedColumns) {return;}
    
    const state = getCurrentDocumentFoldingState();
    if (!state) {return;}
    
    // Copy current state
    state.collapsedColumns = new Set(window.collapsedColumns);
    state.collapsedTasks = new Set(window.collapsedTasks);
    state.columnFoldStates = new Map(window.columnFoldStates);
    state.globalColumnFoldState = window.globalColumnFoldState;
    state.isInitialized = true;
    
}

// Function to restore folding state from document storage
function restoreFoldingState() {
    if (!currentDocumentUri) {return false;}
    
    const state = getCurrentDocumentFoldingState();
    if (!state) {return false;}
    
    // Initialize global folding variables if they don't exist
    if (!window.collapsedColumns) {window.collapsedColumns = new Set();}
    if (!window.collapsedTasks) {window.collapsedTasks = new Set();}
    if (!window.columnFoldStates) {window.columnFoldStates = new Map();}
    if (!window.globalColumnFoldState) {window.globalColumnFoldState = 'fold-mixed';}
    
    if (state.isInitialized) {
        // Restore saved state
        window.collapsedColumns = new Set(state.collapsedColumns);
        window.collapsedTasks = new Set(state.collapsedTasks);
        window.columnFoldStates = new Map(state.columnFoldStates);
        window.globalColumnFoldState = state.globalColumnFoldState;
        
        return true;
    }
    
    return false; // Don't apply default folding here
}

// Function to apply default folding (empty columns folded) - only for truly new documents
function applyDefaultFoldingToNewDocument() {
    if (!currentBoard || !currentBoard.columns) {return;}
    
    // Don't reset existing state, just add empty columns to collapsed set
    currentBoard.columns.forEach(column => {
        if (!column.tasks || column.tasks.length === 0) {
            window.collapsedColumns.add(column.id);
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
    initializeClipboardCardSource();
    
    // Populate dynamic menus
    populateDynamicMenus();
    
    // Update clipboard content when window gets focus
    window.addEventListener('focus', async () => {
        await updateClipboardCardSource();
    });
    
    // Function to auto-save pending changes
    function autoSavePendingChanges() {
        const pendingColumnCount = window.pendingColumnChanges?.size || 0;
        const pendingTaskCount = window.pendingTaskChanges?.size || 0;
        const totalPending = pendingColumnCount + pendingTaskCount;
        
        if (totalPending > 0) {
            
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
            }
            
            // Update button state
            if (window.updateRefreshButtonState) {
                window.updateRefreshButtonState('default');
            }
        }
    }
    
    // Auto-save pending changes when losing focus
    // But delay to avoid saving when just switching views briefly
    window.addEventListener('blur', () => {
        
        // Wait a bit to see if focus returns quickly (view switching)
        setTimeout(() => {
            if (document.hidden || !document.hasFocus()) {
                autoSavePendingChanges();
            } else {
            }
        }, 100);
    });
    
    // Also handle visibility change (tab switching)
    // Use same delayed approach to avoid auto-save during quick view switches
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // Wait a bit to see if visibility returns quickly (view switching)
            setTimeout(() => {
                if (document.hidden && !closePromptActive) {
                    autoSavePendingChanges();
                }
            }, 100);
        }
    });
    
    // Handle page unload/refresh
    window.addEventListener('beforeunload', (e) => {
        const pendingCount = (window.pendingColumnChanges?.size || 0) + (window.pendingTaskChanges?.size || 0);
        if (pendingCount > 0) {
            autoSavePendingChanges();
            // Note: We can't reliably prevent unload in VS Code webviews,
            // but we try to save synchronously before the page closes
        }
    });
    
    // Listen for Cmd/Ctrl+C to update clipboard
    document.addEventListener('keydown', async (e) => {
        // Check for Cmd+C (Mac) or Ctrl+C (Windows/Linux)
        if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
            // Wait a bit for the clipboard to be updated
            setTimeout(async () => {
                // Use the main clipboard reader to preserve image detection
                await updateClipboardCardSource();
            }, 200);
        }
    });
    
    // Initial clipboard check
    setTimeout(async () => {
        await updateClipboardCardSource();
    }, 1000); // Delay to ensure everything is initialized
    
    // Add a simple test to verify clipboard functionality is working
    // setTimeout(() => {
    //     const clipboardSource = document.getElementById('clipboard-card-source');
    //     if (clipboardSource) {
    //         // Force update with test data
    //         clipboardCardData = {
    //             title: 'Test Update',
    //             content: 'Testing clipboard update functionality',
    //             isLink: false
    //         };
    //         // Update UI without trying to read clipboard again
    //         const iconSpan = clipboardSource.querySelector('.clipboard-icon');
    //         const textSpan = clipboardSource.querySelector('.clipboard-text');
            
    //         if (iconSpan && textSpan) {
    //             const rawPreview = clipboardCardData.content.length > 15 
    //                 ? clipboardCardData.content.substring(0, 15) + `... (${clipboardCardData.content.length})`
    //                 : `${clipboardCardData.content} (${clipboardCardData.content.length})`;
                
    //             // Escape preview content to prevent HTML rendering
    //             const preview = escapeHtml(rawPreview);
                
    //             iconSpan.textContent = '📋';
    //             textSpan.textContent = preview;
    //             clipboardSource.style.opacity = '1';
    //             clipboardSource.title = `Drag to create card: "${escapeHtml(clipboardCardData.title)}"`;
    //         }
    //     } else {
    //     }
    // }, 2000);
    
    // Add click handler to read clipboard (user interaction required for clipboard API)
    const clipboardSource = document.getElementById('clipboard-card-source');
    if (clipboardSource) {
        clipboardSource.addEventListener('click', async () => {
            // Use the main clipboard reader to preserve image detection
            await updateClipboardCardSource();
        });
    }
 
    // Global Alt+click handler for links/images (as fallback)
    document.addEventListener('click', (e) => {
        // Only handle Alt+click for opening links/images
        if (!e.altKey) {return;}
        
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
            // Don't automatically flush changes when clicking outside menus
            // Changes will only be saved when user explicitly saves (Cmd+S)
            // if (typeof flushPendingTagChanges === 'function') {
            //     const pendingColumnCount = window.pendingColumnChanges?.size || 0;
            //     const pendingTaskCount = window.pendingTaskChanges?.size || 0;
            //     if (pendingColumnCount > 0 || pendingTaskCount > 0) {
            //         flushPendingTagChanges();
            //     }
            // }
            
            // Close all menus and clean up moved dropdowns
            document.querySelectorAll('.donut-menu').forEach(menu => {
                menu.classList.remove('active');
                // Clean up moved dropdowns - check both in menu and moved to body
                let dropdown = menu.querySelector('.donut-menu-dropdown');
                if (!dropdown && typeof cleanupDropdown === 'function') {
                    // Look for moved dropdowns in body that belong to this menu
                    const movedDropdowns = document.body.querySelectorAll('.donut-menu-dropdown.moved-to-body');
                    dropdown = Array.from(movedDropdowns).find(d => d._originalParent === menu);
                }
                if (dropdown && typeof cleanupDropdown === 'function') {
                    cleanupDropdown(dropdown);
                }
            });
            document.querySelectorAll('.file-bar-menu').forEach(menu => {
                menu.classList.remove('active');
                // Clean up moved dropdowns - check both in menu and moved to body  
                let dropdown = menu.querySelector('.file-bar-menu-dropdown');
                if (!dropdown && typeof cleanupDropdown === 'function') {
                    // Look for moved dropdowns in body that belong to this menu
                    const movedDropdowns = document.body.querySelectorAll('.file-bar-menu-dropdown.moved-to-body');
                    dropdown = Array.from(movedDropdowns).find(d => d._originalParent === menu);
                }
                if (dropdown && typeof cleanupDropdown === 'function') {
                    cleanupDropdown(dropdown);
                }
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

// REMOVED: Focus handler that was causing board refresh and losing folding state
// The panel reuse mechanism now handles board updates properly

// Callback for when board rendering is complete
window.onBoardRenderingComplete = function() {
    if (window.pendingFocusTargets && window.pendingFocusTargets.length > 0) {
        
        // Try to find the first target element
        const target = window.pendingFocusTargets[0];
        let element = null;
        
        if (target.type === 'column') {
            element = document.querySelector(`[data-column-id="${target.id}"]`);
        } else if (target.type === 'task') {
            element = document.querySelector(`[data-task-id="${target.id}"]`);
        }
        
        
        if (element) {
            // Element exists - process focus targets and clear them
            handleFocusAfterUndoRedo(window.pendingFocusTargets);
            window.pendingFocusTargets = null;
        } else {
            // Element not found yet - keep targets for next render completion
        }
    } else {
    }
};

// Function to handle focusing on objects after undo/redo
function handleFocusAfterUndoRedo(focusTargets) {
    if (!focusTargets || focusTargets.length === 0) {
        return;
    }
    
    // First pass: Check for any columns that need unfolding
    const columnsToUnfold = new Set();
    focusTargets.forEach(target => {
        if (target.type === 'task') {
            const taskElement = document.querySelector(`[data-task-id="${target.id}"]`);
            if (taskElement) {
                const columnElement = taskElement.closest('[data-column-id]');
                if (columnElement && columnElement.classList.contains('collapsed')) {
                    const columnId = columnElement.getAttribute('data-column-id');
                    columnsToUnfold.add(columnId);
                }
            }
        }
    });

    // Unfold any collapsed columns first
    if (columnsToUnfold.size > 0) {
        if (typeof unfoldColumnIfCollapsed === 'function') {
            columnsToUnfold.forEach(columnId => {
                unfoldColumnIfCollapsed(columnId);
            });
        }
        
        // Wait for unfolding animation to complete before focusing
        setTimeout(() => {
            performFocusActions(focusTargets);
        }, 300); // Allow time for unfolding animation
    } else {
        // No unfolding needed, focus immediately
        performFocusActions(focusTargets);
    }
}

// Helper function to perform the actual focus actions
function performFocusActions(focusTargets) {
    
    // Process all focus targets to handle multiple changes
    focusTargets.forEach((target, index) => {
        let element = null;
        
        if (target.type === 'column') {
            element = document.querySelector(`[data-column-id="${target.id}"]`);
        } else if (target.type === 'task') {
            element = document.querySelector(`[data-task-id="${target.id}"]`);
        }
        
        
        if (element && index === 0) {
            // Only scroll to and highlight the first target to avoid jarring jumps
            // Scroll to element with proper horizontal scrolling for right-side elements
            element.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center',
                inline: 'center'  // Changed from 'nearest' to 'center' for better right-side visibility
            });
            
            // Add highlight effect
            element.classList.add('focus-highlight');
            
            // Remove highlight after animation
            setTimeout(() => {
                element.classList.remove('focus-highlight');
            }, 2000);
        } else if (element) {
            // For additional targets, just add highlight without scrolling
            element.classList.add('focus-highlight');
            setTimeout(() => {
                element.classList.remove('focus-highlight');
            }, 2000);
        } else {
            if (index === 0) {
                // Only debug for first target to avoid spam
            }
        }
    });
}

// Clear card focus on click
document.addEventListener('click', (e) => {
    // Don't clear focus if clicking on a card
    if (!e.target.closest('.task-item') && currentFocusedCard) {
        focusCard(null);
    }
});

// Listen for messages from the extension
window.addEventListener('message', event => {
    const message = event.data;
    
    switch (message.type) {
        case 'updateBoard':
            const previousBoard = currentBoard;
            
            // Clear card focus when board is updated
            focusCard(null);
            
            // Initialize cache system - this is the SINGLE source of truth
            const isInitialLoad = !window.cachedBoard;
            const isFullRefresh = message.isFullRefresh;
            if (isInitialLoad || isFullRefresh) {
                window.cachedBoard = JSON.parse(JSON.stringify(message.board)); // Deep clone
                window.currentBoard = window.cachedBoard; // Keep for compatibility
                window.savedBoardState = JSON.parse(JSON.stringify(message.board)); // Reference for unsaved detection
                window.hasUnsavedChanges = false;
            } else {
                // Always update the cached board when receiving updates from backend
                window.cachedBoard = JSON.parse(JSON.stringify(message.board));

                // If this is a save confirmation (no unsaved changes), update the saved reference
                if (!window.hasUnsavedChanges) {
                    window.savedBoardState = JSON.parse(JSON.stringify(message.board));
                }
            }
            currentBoard = window.cachedBoard;

            // Clean up any duplicate row tags
            cleanupRowTags();
            
            // First apply configuration (as fallback)
            if (message.layoutRows) {
                applyLayoutRows(message.layoutRows);
            } else {
                applyLayoutRows(1); // Default fallback
            }

            // Then detect rows from board and override configuration if different
            const detectedRows = detectRowsFromBoard(currentBoard);
            if (detectedRows !== currentLayoutRows) {
                setLayoutRows(detectedRows);
            }
            
            if (message.imageMappings) {
                window.currentImageMappings = message.imageMappings;
            }            

            // Only apply configuration settings on initial load, not on content updates
            if (isInitialLoad) {
                // Initialize global reference to current values
                window.currentColumnWidth = currentColumnWidth;
                // Update whitespace with the value from configuration
                if (message.whitespace) {
                    // Handle legacy whitespace values
                    let whitespace = message.whitespace;
                    if (whitespace === '2px') {
                        whitespace = '4px'; // Convert old compact to new compact
                    } else if (whitespace === '10px') {
                        whitespace = '12px'; // Convert old 10px to comfortable
                    } else if (whitespace === '20px') {
                        whitespace = '24px'; // Convert old 20px to large
                    } else if (whitespace === '40px') {
                        whitespace = '36px'; // Convert old 40px to extra large
                    } else if (whitespace === '60px') {
                        whitespace = '48px'; // Convert old 60px to maximum
                    }
                    applyWhitespace(whitespace);
                } else {
                    applyWhitespace('8px'); // Default fallback
                }

                // Update task min height with the value from configuration
                if (message.taskMinHeight) {
                    // Handle legacy card height values
                    let taskMinHeight = message.taskMinHeight;
                    if (taskMinHeight === '26.5vh') {
                        taskMinHeight = '33percent';
                    } else if (taskMinHeight === '43.5vh') {
                        taskMinHeight = '50percent';
                    } else if (taskMinHeight === '89vh') {
                        taskMinHeight = '100percent';
                    }
                    applyTaskMinHeight(taskMinHeight);
                } else {
                    applyTaskMinHeight('auto'); // Default fallback
                }

                // Update font size with the value from configuration
                if (message.fontSize) {
                    // Handle legacy font size values
                    let fontSize = message.fontSize;
                    if (fontSize === 'small') {
                        fontSize = '0_75x'; // Convert legacy 'small' to 0.75x
                    } else if (fontSize === 'normal') {
                        fontSize = '1x'; // Convert legacy 'normal' to 1x
                    }
                    applyFontSize(fontSize);
                } else {
                    applyFontSize('1x'); // Default fallback
                }

                // Update layout presets from configuration
                if (message.layoutPresets) {
                    layoutPresets = message.layoutPresets;
                    initializeLayoutPresetsMenu(); // Reinitialize menu with new presets
                }

                // Update layout preset from configuration
                if (message.layoutPreset) {
                    window.currentLayoutPreset = message.layoutPreset;
                    updateLayoutPresetsActiveState();
                } else {
                    window.currentLayoutPreset = 'normal'; // Default fallback
                    updateLayoutPresetsActiveState();
                }

                // Update font family with the value from configuration
                if (message.fontFamily) {
                    applyFontFamily(message.fontFamily);
                } else {
                    applyFontFamily('system'); // Default fallback
                }

                // Update column width with the value from configuration
                if (message.columnWidth) {
                    // Handle legacy column width values
                    let columnWidth = message.columnWidth;
                    if (columnWidth === 'small') {
                        columnWidth = '250px';
                    } else if (columnWidth === 'medium') {
                        columnWidth = '350px';
                    } else if (columnWidth === 'wide') {
                        columnWidth = '450px';
                    } else if (columnWidth === '40') {
                        columnWidth = '33percent';
                    } else if (columnWidth === '66') {
                        columnWidth = '50percent';
                    } else if (columnWidth === '100') {
                        columnWidth = '100percent';
                    }
                    applyColumnWidth(columnWidth);
                } else {
                    applyColumnWidth('350px'); // Default fallback
                }
            }
            
            // Layout rows are now handled above (with auto-detection override)
            
            // Continue configuration settings only on initial load
            if (isInitialLoad) {
                // Update row height with the value from configuration
                if (message.rowHeight) {
                    // Handle legacy row height values
                    let rowHeight = message.rowHeight;
                    if (rowHeight === '19em') {
                        rowHeight = '300px';
                    } else if (rowHeight === '31em') {
                        rowHeight = '500px';
                    } else if (rowHeight === '44em') {
                        rowHeight = '700px';
                    } else if (rowHeight === '31.5vh') {
                        rowHeight = '33percent';
                    } else if (rowHeight === '48vh') {
                        rowHeight = '50percent';
                    } else if (rowHeight === '63vh') {
                        rowHeight = '67percent';
                    } else if (rowHeight === '95vh') {
                        rowHeight = '100percent';
                    }
                    applyRowHeightSetting(rowHeight);
                } else {
                    applyRowHeightSetting('auto'); // Default fallback
                }

                // Update sticky headers with the value from configuration
                if (message.stickyHeaders) {
                    applyStickyHeaders(message.stickyHeaders);
                } else {
                    applyStickyHeaders('enabled'); // Default fallback
                }

                // Update tag visibility with the value from configuration
                if (message.tagVisibility) {
                    // Handle legacy tag visibility values
                    let tagVisibility = message.tagVisibility;
                    if (tagVisibility === 'standard') {
                        tagVisibility = 'allexcludinglayout';
                    } else if (tagVisibility === 'custom') {
                        tagVisibility = 'customonly';
                    } else if (tagVisibility === 'mentions') {
                        tagVisibility = 'mentionsonly';
                    }
                    applyTagVisibility(tagVisibility);
                } else {
                    applyTagVisibility('allexcludinglayout'); // Default fallback
                }

                // Update export tag visibility with the value from configuration
                if (message.exportTagVisibility) {
                    currentExportTagVisibility = message.exportTagVisibility;
                    window.currentExportTagVisibility = message.exportTagVisibility;
                } else {
                    currentExportTagVisibility = 'allexcludinglayout'; // Default fallback
                    window.currentExportTagVisibility = 'allexcludinglayout';
                }

                // Update image fill with the value from configuration
                if (message.imageFill) {
                    applyImageFill(message.imageFill);
                } else {
                    applyImageFill('fit'); // Default fallback
                }

                // Update all menu indicators after settings are applied
                updateAllMenuIndicators();
            }

            // Update max row height
            if (typeof message.maxRowHeight !== 'undefined') {
                updateMaxRowHeight(message.maxRowHeight);
            }

            // Check if we should skip rendering (for direct DOM updates like tag changes)
            const shouldSkipRender = message.skipRender || message.board?.skipRender;

            // Store tag colors globally - THIS IS CRITICAL
            if (message.tagColors) {
                window.tagColors = message.tagColors;
                // Only apply styles if not skipping render (prevents style spam during tag operations)
                if (!shouldSkipRender && typeof applyTagStyles === 'function') {
                    applyTagStyles();
                }
            }
            
            // Store showRowTags configuration
            if (typeof message.showRowTags !== 'undefined') {
                window.showRowTags = message.showRowTags;
            }
            
            // Save folding state before re-render
            saveCurrentFoldingState();
            const isEditing = window.taskEditor && window.taskEditor.currentEditor;
            
            
            if (!isEditing && !shouldSkipRender) {
                // Only render if not editing and not explicitly skipping
                debouncedRenderBoard();
                
                // Apply default folding if this is from an external change
                if (message.applyDefaultFolding) {
                    setTimeout(() => {
                        applyDefaultFoldingToNewDocument();
                    }, 100); // Wait for render to complete
                }
            } else if (shouldSkipRender) {
            } else {
            }
            break;
        case 'updateFileInfo':
            const previousDocumentPath = currentFileInfo?.documentPath;
            currentFileInfo = message.fileInfo;
            
            // Only update document URI if it actually changed
            if (currentFileInfo && currentFileInfo.documentPath && 
                currentFileInfo.documentPath !== previousDocumentPath) {
                updateDocumentUri(currentFileInfo.documentPath);
            }
            
            updateFileInfoBar();
            break;
        case 'resetClosePromptFlag':
            closePromptActive = false;
            break;
        case 'undoRedoStatus':
            canUndo = message.canUndo;
            canRedo = message.canRedo;
            updateUndoRedoButtons();
            break;
        case 'insertFileLink':
            insertFileLink(message.fileInfo);
            break;
        case 'saveError':
            if (typeof handleSaveError === 'function') {
                handleSaveError(message.error);
            } else {
                console.error('❌ handleSaveError function not available:', message.error);
            }
            break;
        case 'checkUnsavedChanges':
            
            const hasChanges = typeof hasUnsavedChanges === 'function' ? hasUnsavedChanges() : false;
                
            // Respond with current unsaved changes status
            vscode.postMessage({
                type: 'hasUnsavedChangesResponse',
                hasUnsavedChanges: hasChanges,
                requestId: message.requestId
            });
            break;
        case 'saveWithConflictFilename':
            // Save current cached board to conflict file
            if (typeof saveCachedBoard === 'function') {
                saveCachedBoard(message.conflictPath);
            } else {
                console.error('❌ saveCachedBoard function not available');
            }
            break;
        case 'requestCachedBoard':
            // Send the current cached board back to the backend
            if (window.cachedBoard || window.currentBoard) {
                vscode.postMessage({
                    type: 'markUnsavedChanges',
                    hasUnsavedChanges: window.hasUnsavedChanges || false,
                    cachedBoard: window.cachedBoard || window.currentBoard
                });
            }
            break;
        case 'unfoldColumnsBeforeUpdate':
            // Unfold columns immediately before board update happens
            if (typeof unfoldColumnIfCollapsed === 'function') {
                message.columnIds.forEach(columnId => {
                    unfoldColumnIfCollapsed(columnId);
                });
            }
            break;
        case 'focusAfterUndoRedo':
            // Store focus targets to be processed after rendering completes
            window.pendingFocusTargets = message.focusTargets;
            break;
        case 'includeFilesChanged':
            // Update the refresh includes button to show status
            const refreshIncludesBtn = document.getElementById('refresh-includes-btn');
            const countSpan = refreshIncludesBtn?.querySelector('.refresh-includes-count');
            const iconSpan = refreshIncludesBtn?.querySelector('.refresh-includes-icon');

            if (refreshIncludesBtn) {
                // Button is always visible, just update its state
                if (message.hasChanges) {
                    refreshIncludesBtn.classList.add('has-changes');
                    if (iconSpan) iconSpan.textContent = '❗';
                } else {
                    refreshIncludesBtn.classList.remove('has-changes');
                    if (iconSpan) iconSpan.textContent = '✓';
                }

                // Update badge count
                if (countSpan && message.changedFiles) {
                    const changeCount = message.changedFiles.length;
                    countSpan.textContent = changeCount > 0 ? changeCount.toString() : '';
                }

                // Update tooltip to show which files are tracked and which changed
                let tooltip = '';
                if (message.trackedFiles && message.trackedFiles.length > 0) {
                    tooltip = `Tracked files (${message.trackedFiles.length}):\n`;
                    tooltip += message.trackedFiles.map(f => `  • ${f}`).join('\n');

                    if (message.hasChanges && message.changedFiles && message.changedFiles.length > 0) {
                        tooltip += '\n\nChanged files:\n';
                        tooltip += message.changedFiles.map(f => `  ⚠ ${f}`).join('\n');
                    }
                } else {
                    tooltip = 'No included files tracked';
                }

                refreshIncludesBtn.title = tooltip;
            }
            break;
        case 'includeFileContent':
            // Handle include file content response from backend
            if (typeof window.updateIncludeFileCache === 'function') {
                window.updateIncludeFileCache(message.filePath, message.content);
            }
            break;
        case 'refreshIncludesOnly':
            // Lightweight include refresh - just re-render markdown without board changes
            if (typeof window.renderBoard === 'function') {
                window.renderBoard();
            }
            break;
        case 'clipboardImageSaved':
            // Handle clipboard image save response from backend
            console.log('[DEBUG] Received clipboardImageSaved message:', message);
            if (message.success) {
                // Create a new task with the image filename as title and markdown link as description
                const imageFileName = message.relativePath.split('/').pop().replace(/\.[^/.]+$/, ''); // Remove extension
                const markdownLink = `![](${message.relativePath})`;

                console.log('[DEBUG] Creating task with title:', imageFileName, 'and markdown:', markdownLink);
                createNewTaskWithContent(
                    imageFileName,
                    message.dropPosition,
                    markdownLink
                );
            } else {
                // Create error task if save failed
                console.log('[DEBUG] Image save failed, creating error task');
                createNewTaskWithContent(
                    'Clipboard Image (Error)',
                    message.dropPosition,
                    `Failed to save image: ${message.error || 'Unknown error'}`
                );
            }
            break;
        case 'insertSnippetContent':
            // Insert VS Code snippet content into the active editor
            insertVSCodeSnippetContent(message.content, message.fieldType, message.taskId);
            break;
        case 'proceedDisableIncludeMode':
            // User confirmed disable include mode in VS Code dialog - proceed with the action
            if (typeof disableColumnIncludeMode === 'function') {
                disableColumnIncludeMode(message.columnId);
            }
            break;
        case 'proceedEnableIncludeMode':
            // User provided file name in VS Code dialog - proceed with enabling include mode
            if (typeof enableColumnIncludeMode === 'function') {
                enableColumnIncludeMode(message.columnId, message.fileName);
            }
            break;
        case 'proceedUpdateIncludeFile':
            // User provided new file name in VS Code dialog - proceed with updating include file
            if (typeof updateColumnIncludeFile === 'function') {
                updateColumnIncludeFile(message.columnId, message.newFileName, message.currentFile);
            }
            break;
        case 'updateColumnContent':
            // Handle targeted column content update for include file changes
            console.log(`[Frontend Debug] Received updateColumnContent for column ${message.columnId}:`, {
                taskCount: message.tasks?.length || 0,
                includeFile: message.includeFile,
                tasks: message.tasks?.map(t => t.title) || []
            });

            // Update the column in cached board
            if (window.cachedBoard && window.cachedBoard.columns) {
                const column = window.cachedBoard.columns.find(c => c.id === message.columnId);
                if (column) {
                    // Update tasks and column metadata
                    column.tasks = message.tasks || [];
                    column.title = message.columnTitle || column.title;
                    column.displayTitle = message.displayTitle || column.displayTitle;
                    column.includeMode = message.includeMode;
                    column.includeFiles = message.includeFiles;

                    console.log(`[Frontend Debug] Updated column ${message.columnId}:`, {
                        taskCount: column.tasks.length,
                        title: column.title,
                        displayTitle: column.displayTitle,
                        includeMode: column.includeMode,
                        includeFiles: column.includeFiles
                    });

                    // Re-render just this column
                    if (typeof renderSingleColumn === 'function') {
                        renderSingleColumn(message.columnId, column);
                        console.log(`[Frontend Debug] Re-rendered column ${message.columnId}`);
                    } else {
                        console.warn(`[Frontend Debug] renderSingleColumn function not available, falling back to full render`);
                        if (typeof window.renderBoard === 'function') {
                            window.renderBoard();
                        }
                    }
                } else {
                    console.warn(`[Frontend Debug] Column ${message.columnId} not found in cached board`);
                }
            } else {
                console.warn(`[Frontend Debug] No cached board available for column update`);
            }
            break;
    }
});

/**
 * Insert VS Code snippet content into the active editor
 */
function insertVSCodeSnippetContent(content, fieldType, taskId) {
    // Find the currently active editor
    const activeEditor = document.querySelector('.task-title-edit:focus, .task-description-edit:focus');

    if (activeEditor && window.taskEditor && window.taskEditor.currentEditor) {
        // Insert the snippet content at cursor position
        const cursorPosition = activeEditor.selectionStart || 0;
        const textBefore = activeEditor.value.substring(0, cursorPosition);
        const textAfter = activeEditor.value.substring(activeEditor.selectionEnd || cursorPosition);

        // Insert the snippet
        activeEditor.value = textBefore + content + textAfter;

        // Position cursor after the snippet
        const newCursorPosition = cursorPosition + content.length;
        activeEditor.setSelectionRange(newCursorPosition, newCursorPosition);

        // Focus back to the editor
        activeEditor.focus();

        // Trigger input event to ensure the change is registered
        activeEditor.dispatchEvent(new Event('input', { bubbles: true }));

        // Auto-resize if needed
        if (typeof autoResize === 'function') {
            autoResize(activeEditor);
        }
    }
}


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

// REMOVED: Duplicate focus handler that was causing board refresh and losing folding state
// The panel reuse mechanism now handles board updates properly

// Card navigation functions
function updateCardList() {
    // Use more flexible selector to handle class name variations
    const allTaskItems = document.querySelectorAll('[class*="task-item"]');
    
    allCards = Array.from(allTaskItems).filter(card => {
        const column = card.closest('.kanban-full-height-column');
        return column && !column.classList.contains('collapsed');
    });
}

function focusCard(card) {
    if (currentFocusedCard) {
        currentFocusedCard.classList.remove('card-focused');
    }
    
    if (card) {
        card.classList.add('card-focused');
        
        // Check if card is larger than viewport
        const cardRect = card.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        
        const cardTallerThanViewport = cardRect.height > viewportHeight;
        const cardWiderThanViewport = cardRect.width > viewportWidth;
        
        // If card is larger than viewport, scroll to show top-left corner
        // Otherwise, center the card
        if (cardTallerThanViewport || cardWiderThanViewport) {
            card.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start',    // Show top of card
                inline: 'start'    // Show left of card
            });
        } else {
            card.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center',   // Center vertically
                inline: 'center'   // Center horizontally
            });
        }
        
        currentFocusedCard = card;
    } else {
        currentFocusedCard = null;
    }
}

function getCurrentCardPosition() {
    if (!currentFocusedCard) {return null;}
    
    const column = currentFocusedCard.closest('.kanban-full-height-column');
    if (!column) {return null;}
    
    const columnCards = Array.from(column.querySelectorAll('[class*="task-item"]'));
    const cardIndex = columnCards.indexOf(currentFocusedCard);
    const columnIndex = Array.from(document.querySelectorAll('.kanban-full-height-column')).indexOf(column);
    
    return { columnIndex, cardIndex, columnCards };
}

function getCardClosestToTopLeft() {
    const viewportRect = {
        top: window.scrollY,
        left: window.scrollX,
        bottom: window.scrollY + window.innerHeight,
        right: window.scrollX + window.innerWidth
    };
    
    let closestCard = null;
    let closestDistance = Infinity;
    
    for (const card of allCards) {
        const cardRect = card.getBoundingClientRect();
        const cardTop = cardRect.top + window.scrollY;
        const cardLeft = cardRect.left + window.scrollX;
        
        // Check if card's top-left corner is within viewport
        if (cardTop >= viewportRect.top && cardTop <= viewportRect.bottom &&
            cardLeft >= viewportRect.left && cardLeft <= viewportRect.right) {
            
            // Calculate distance from viewport's top-left corner
            const distance = Math.sqrt(
                Math.pow(cardTop - viewportRect.top, 2) + 
                Math.pow(cardLeft - viewportRect.left, 2)
            );
            
            if (distance < closestDistance) {
                closestDistance = distance;
                closestCard = card;
            }
        }
    }
    
    // If no card is visible, find the one closest to being visible
    if (!closestCard) {
        for (const card of allCards) {
            const cardRect = card.getBoundingClientRect();
            const cardTop = cardRect.top + window.scrollY;
            const cardLeft = cardRect.left + window.scrollX;
            
            // Calculate distance from viewport's top-left corner regardless of visibility
            const distance = Math.sqrt(
                Math.pow(cardTop - viewportRect.top, 2) + 
                Math.pow(cardLeft - viewportRect.left, 2)
            );
            
            if (distance < closestDistance) {
                closestDistance = distance;
                closestCard = card;
            }
        }
    }
    
    return closestCard || allCards[0];
}

function navigateToCard(direction) {
    updateCardList();
    
    if (allCards.length === 0) {
        return;
    }
    
    if (!currentFocusedCard) {
        // No card focused, focus the one closest to top-left of viewport
        const closestCard = getCardClosestToTopLeft();
        focusCard(closestCard);
        return;
    }
    
    const position = getCurrentCardPosition();
    if (!position) {return;}
    
    const { columnIndex, cardIndex, columnCards } = position;
    const columns = Array.from(document.querySelectorAll('.kanban-full-height-column'));
    
    switch (direction) {
        case 'up':
            if (cardIndex > 0) {
                focusCard(columnCards[cardIndex - 1]);
            }
            break;
            
        case 'down':
            if (cardIndex < columnCards.length - 1) {
                focusCard(columnCards[cardIndex + 1]);
            }
            break;
            
        case 'left':
            if (columnIndex > 0) {
                const prevColumn = columns[columnIndex - 1];
                const prevColumnCards = Array.from(prevColumn.querySelectorAll('[class*="task-item"]'));
                if (prevColumnCards.length > 0) {
                    const targetIndex = Math.min(cardIndex, prevColumnCards.length - 1);
                    focusCard(prevColumnCards[targetIndex]);
                }
            }
            break;
            
        case 'right':
            if (columnIndex < columns.length - 1) {
                const nextColumn = columns[columnIndex + 1];
                const nextColumnCards = Array.from(nextColumn.querySelectorAll('[class*="task-item"]'));
                if (nextColumnCards.length > 0) {
                    const targetIndex = Math.min(cardIndex, nextColumnCards.length - 1);
                    focusCard(nextColumnCards[targetIndex]);
                }
            }
            break;
    }
}

// Keyboard shortcuts for search and navigation
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
    
    // Arrow key navigation when not editing
    if (!isEditing && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        
        const direction = {
            'ArrowUp': 'up',
            'ArrowDown': 'down',
            'ArrowLeft': 'left',
            'ArrowRight': 'right'
        }[e.key];
        
        navigateToCard(direction);
        return;
    }
    
    // Escape to clear card focus
    if (e.key === 'Escape' && !isEditing && currentFocusedCard) {
        focusCard(null);
        return;
    }
    
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
        // Meta+S or Ctrl+S to save cached board to file
        else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            if (typeof saveCachedBoard === 'function') {
                saveCachedBoard();
            }
        }
        // Meta+W or Ctrl+W to close window - check for unsaved changes first
        else if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
            if (typeof hasUnsavedChanges === 'function' && hasUnsavedChanges()) {
                e.preventDefault();
                e.stopPropagation();
                
                // Show confirmation dialog
                const message = `You have unsaved changes. What would you like to do?`;
                
                // Create a custom modal for save confirmation
                const modal = document.createElement('div');
                modal.className = 'modal';
                modal.style.cssText = `
                    display: flex;
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.5);
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                `;
                
                const dialog = document.createElement('div');
                dialog.style.cssText = `
                    background: var(--vscode-dropdown-background);
                    border: 1px solid var(--vscode-dropdown-border);
                    border-radius: 8px;
                    padding: 20px;
                    max-width: 400px;
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
                `;
                
                dialog.innerHTML = `
                    <h3 style="margin: 0 0 15px 0; color: var(--vscode-foreground);">Unsaved Changes</h3>
                    <p style="margin: 0 0 20px 0; color: var(--vscode-descriptionForeground);">${message}</p>
                    <div style="display: flex; gap: 10px; justify-content: flex-end;">
                        <button id="save-and-close" style="
                            padding: 6px 12px;
                            background: var(--vscode-button-background);
                            color: var(--vscode-button-foreground);
                            border: none;
                            border-radius: 4px;
                            cursor: pointer;
                        ">Save & Close</button>
                        <button id="discard-and-close" style="
                            padding: 6px 12px;
                            background: var(--vscode-button-secondaryBackground);
                            color: var(--vscode-button-secondaryForeground);
                            border: 1px solid var(--vscode-button-border);
                            border-radius: 4px;
                            cursor: pointer;
                        ">Discard & Close</button>
                        <button id="cancel-close" style="
                            padding: 6px 12px;
                            background: transparent;
                            color: var(--vscode-foreground);
                            border: 1px solid var(--vscode-panel-border);
                            border-radius: 4px;
                            cursor: pointer;
                        ">Cancel</button>
                    </div>
                `;
                
                modal.appendChild(dialog);
                document.body.appendChild(modal);
                
                // Handle button clicks
                document.getElementById('save-and-close').addEventListener('click', () => {
                    // Save changes first using new cache system
                    if (typeof saveCachedBoard === 'function') {
                        saveCachedBoard();
                    }
                    
                    updateRefreshButtonState('saved');
                    // Remove modal
                    modal.remove();
                    // Let VS Code handle the close
                    vscode.postMessage({ type: 'closeWindow' });
                });
                
                document.getElementById('discard-and-close').addEventListener('click', () => {
                    // Clear unsaved changes flag - discard all changes
                    if (typeof markSavedChanges === 'function') {
                        markSavedChanges();
                    } else {
                        // Fallback if function not available
                        window.hasUnsavedChanges = false;
                        updateRefreshButtonState('default');
                        vscode.postMessage({
                            type: 'markUnsavedChanges',
                            hasUnsavedChanges: false
                        });
                    }
                    
                    // Clear old pending changes (legacy cleanup)
                    if (window.pendingColumnChanges) {window.pendingColumnChanges.clear();}
                    if (window.pendingTaskChanges) {window.pendingTaskChanges.clear();}
                    
                    // Remove modal
                    modal.remove();
                    // Let VS Code handle the close
                    vscode.postMessage({ type: 'closeWindow' });
                });
                
                document.getElementById('cancel-close').addEventListener('click', () => {
                    // Just remove the modal
                    modal.remove();
                });
                
                // Also close on escape key
                const escapeHandler = (e) => {
                    if (e.key === 'Escape') {
                        modal.remove();
                        document.removeEventListener('keydown', escapeHandler);
                    }
                };
                document.addEventListener('keydown', escapeHandler);
            }
        }
    }
});

// Undo/Redo functions
/**
 * Triggers undo operation
 * Purpose: Revert last change
 * Used by: Undo button, Cmd/Ctrl+Z
 * Side effects: Sends undo message to VS Code
 */
function undo() {
    if (canUndo) {
        
        try {
            const message = { type: 'undo' };
            const result = vscode.postMessage(message);
        } catch (error) {
            // Silently handle error
        }
    } else {
    }
}

/**
 * Triggers redo operation
 * Purpose: Reapply undone change
 * Used by: Redo button, Cmd/Ctrl+Shift+Z
 * Side effects: Sends redo message to VS Code
 */
function redo() {
    if (canRedo) {
        vscode.postMessage({ type: 'redo' });
    }
}

// COMPREHENSIVE CLOSE DETECTION - Prevent data loss
// Add beforeunload detection for unsaved changes
window.addEventListener('beforeunload', function(e) {
    if (typeof hasUnsavedChanges === 'function') {
        const hasChanges = hasUnsavedChanges();
        
        if (hasChanges) {
            e.preventDefault();
            e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
            return 'You have unsaved changes. Are you sure you want to leave?';
        } else {
        }
    } else {
        console.error('❌ hasUnsavedChanges function not available');
    }
});

window.addEventListener('unload', function(e) {
    if (typeof hasUnsavedChanges === 'function' && hasUnsavedChanges()) {
    }
});

// Add visibility change detection (tab switching, window minimizing, etc)
// Global flag to prevent auto-save when close prompt is active
let closePromptActive = false;

document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        
        // Always notify backend about page becoming hidden
        // Backend will check its own unsaved changes state and handle accordingly
        
        // Set flag to prevent auto-save while close prompt might be active
        closePromptActive = true;
        
        // Let backend decide what to do based on its own unsaved changes state
        setTimeout(() => {
            vscode.postMessage({
                type: 'pageHiddenWithUnsavedChanges',
                hasUnsavedChanges: true // Backend will use its own state, not this value
            });
        }, 0);
    } else {
        // Reset flag when page becomes visible again
        closePromptActive = false;
    }
});

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
    
    const { fileName, relativePath, isImage } = fileInfo;
    let activeEditor = getActiveTextEditor();
    

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

/**
 * Updates the file info bar with current document details
 * Purpose: Show current file name and path
 * Used by: Document changes, initialization
 * Side effects: Updates DOM elements with file info
 */
function updateFileInfoBar() {
    if (!currentFileInfo) {return;}

    const fileNameElement = document.getElementById('file-name');

    if (fileNameElement) {
        fileNameElement.textContent = currentFileInfo.fileName;
        fileNameElement.title = currentFileInfo.filePath || currentFileInfo.fileName;
    }
    
    // Update undo/redo buttons when file info changes
    updateUndoRedoButtons();
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
    
    document.documentElement.style.setProperty('--whitespace', value);
}

function calculateTaskDescriptionHeight() {
    // Only calculate if we're in height-limited mode
    if (!document.body.classList.contains('task-height-limited')) {
        return;
    }

    const taskHeight = getComputedStyle(document.documentElement).getPropertyValue('--task-height');
    if (!taskHeight || taskHeight === 'auto') {
        return;
    }

    // Get all task items
    document.querySelectorAll('.task-item').forEach(taskItem => {
        const descContainer = taskItem.querySelector('.task-description-container');
        if (!descContainer) {return;}

        // Calculate the total height of other elements in the task-item
        let usedHeight = 0;

        // Add header bars height if present
        const headerBars = taskItem.querySelector('.header-bars-container');
        if (headerBars) {
            usedHeight += headerBars.offsetHeight;
        }

        // Add task header height
        const taskHeader = taskItem.querySelector('.task-header');
        if (taskHeader) {
            usedHeight += taskHeader.offsetHeight;
        }

        // Add footer bars height if present
        const footerBars = taskItem.querySelector('.footer-bars-container');
        if (footerBars) {
            usedHeight += footerBars.offsetHeight;
        }

        // Get the task item's computed styles
        const taskItemStyles = getComputedStyle(taskItem);
        const paddingTop = parseFloat(taskItemStyles.paddingTop) || 0;
        const paddingBottom = parseFloat(taskItemStyles.paddingBottom) || 0;
        const gap = parseFloat(taskItemStyles.gap) || 0;

        // Account for gaps between elements (flexbox gap)
        const gapCount = [headerBars, taskHeader, descContainer, footerBars].filter(el => el).length - 1;
        const totalGap = gap * gapCount;

        // Calculate total used height
        usedHeight += (paddingTop + paddingBottom + totalGap);

        // Parse task height to pixels
        let taskHeightPx = 0;
        if (taskHeight.includes('vh')) {
            const vh = parseFloat(taskHeight);
            taskHeightPx = (vh / 100) * window.innerHeight;
        } else if (taskHeight.includes('px')) {
            taskHeightPx = parseFloat(taskHeight);
        } else if (taskHeight.includes('%')) {
            const percent = parseFloat(taskHeight);
            taskHeightPx = (percent / 100) * window.innerHeight;
        }

        // Calculate available height for description container
        const availableHeight = taskHeightPx - usedHeight;

        // Set the max-height for the description container
        if (availableHeight > 0) {
            descContainer.style.maxHeight = 'calc(' + availableHeight + 'px - var(--whitespace-div2)';
            descContainer.style.overflow = 'auto';
        } else {
            descContainer.style.maxHeight = '';
            descContainer.style.overflow = '';
        }
    });
}

function updateTaskMinHeight(value) {
    // Ensure we have a valid value
    if (!value) {
        value = 'auto';
    }

    // Convert percent values to vh for CSS
    let cssValue = value;
    if (value === '33percent') {
        cssValue = '26.5vh';
    } else if (value === '50percent') {
        cssValue = '43.5vh';
    } else if (value === '100percent') {
        cssValue = '89vh';
    }

    document.documentElement.style.setProperty('--task-height', cssValue);

    // Apply height limitation when value is not 'auto'
    if (value !== 'auto') {
        document.body.classList.add('task-height-limited');
    } else {
        document.body.classList.remove('task-height-limited');
    }

    // Add/remove class for tall task heights that interfere with sticky headers
    const isTallHeight = value === '50percent' || value === '100percent' ||
                         (value.includes('px') && parseInt(value) >= 400);

    if (isTallHeight) {
        document.body.classList.add('tall-task-height');
    } else {
        document.body.classList.remove('tall-task-height');
    }

    // Calculate task description heights after setting the height
    setTimeout(() => {
        calculateTaskDescriptionHeight();
    }, 0);
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
window.calculateTaskDescriptionHeight = calculateTaskDescriptionHeight;

// Make functions globally available
window.toggleFileBarMenu = toggleFileBarMenu;
window.setColumnWidth = setColumnWidth;
window.applyColumnWidth = applyColumnWidth;
window.setLayoutRows = setLayoutRows;
window.setRowHeight = setRowHeight;
window.applyRowHeight = applyRowHeight;
window.currentRowHeight = currentRowHeight;
window.setStickyHeaders = setStickyHeaders;
window.applyStickyHeaders = applyStickyHeaders;
window.currentStickyHeaders = currentStickyHeaders;
window.setTagVisibility = setTagVisibility;
window.applyTagVisibility = applyTagVisibility;
window.currentTagVisibility = currentTagVisibility;
window.filterTagsFromText = filterTagsFromText;
window.filterTagsForExport = filterTagsForExport;
window.setImageFill = setImageFill;
window.applyImageFill = applyImageFill;
window.currentImageFill = currentImageFill;
window.updateColumnRowTag = updateColumnRowTag;
window.getColumnRow = getColumnRow;

window.performSort = performSort;

// Font size functionality
let currentFontSize = '1x'; // Default to 1.0x (current behavior)

// Refactored font size functions using styleManager
function applyFontSize(size) {
    // Remove all font size classes
    fontSizeMultipliers.forEach(multiplier => {
        const safeName = multiplier.toString().replace('.', '_');
        document.body.classList.remove(`font-size-${safeName}x`);
    });

    document.body.classList.remove('small-card-fonts');
    document.body.classList.add(`font-size-${size}`);
    currentFontSize = size;
    window.currentFontSize = size;

    // Also use styleManager for consistency
    const multiplier = size.replace('x', '').replace('_', '.');
    styleManager.applyFontSize(parseFloat(multiplier) * 14);
}

function setFontSize(size) {
    applyFontSize(size);

    vscode.postMessage({
        type: 'setPreference',
        key: 'fontSize',
        value: size
    });

    updateAllMenuIndicators();

    document.querySelectorAll('.file-bar-menu').forEach(m => {
        m.classList.remove('active');
    });
}

// Font family functionality
let currentFontFamily = 'system'; // Default to system fonts

// Refactored font family functions using styleManager
function applyFontFamily(family) {
    // Remove all font family classes
    const families = ['system', 'roboto', 'opensans', 'lato', 'poppins', 'inter', 'helvetica', 'arial', 'georgia', 'times', 'firacode', 'jetbrains', 'sourcecodepro', 'consolas'];
    families.forEach(f => document.body.classList.remove(`font-family-${f}`));

    document.body.classList.add(`font-family-${family}`);
    currentFontFamily = family;
    window.currentFontFamily = family;

    // Map to actual font names for styleManager
    const fontMap = {
        'system': 'var(--vscode-font-family)',
        'roboto': "'Roboto', sans-serif",
        'opensans': "'Open Sans', sans-serif",
        'lato': "'Lato', sans-serif",
        'poppins': "'Poppins', sans-serif",
        'inter': "'Inter', sans-serif",
        'helvetica': "'Helvetica Neue', Helvetica, Arial, sans-serif",
        'arial': "Arial, sans-serif",
        'georgia': "Georgia, serif",
        'times': "'Times New Roman', serif",
        'firacode': "'Fira Code', monospace",
        'jetbrains': "'JetBrains Mono', monospace",
        'sourcecodepro': "'Source Code Pro', monospace",
        'consolas': "Consolas, monospace"
    };

    styleManager.applyFontFamily(fontMap[family] || fontMap['system']);
}

function setFontFamily(family) {
    applyFontFamily(family);

    vscode.postMessage({
        type: 'setPreference',
        key: 'fontFamily',
        value: family
    });

    updateAllMenuIndicators();

    document.querySelectorAll('.file-bar-menu').forEach(m => {
        m.classList.remove('active');
    });
}

// Legacy function for backward compatibility
function toggleCardFontSize() {
    const nextSize = currentFontSize === 'small' ? 'normal' : 'small';
    setFontSize(nextSize);
}

// Open include file function
function openIncludeFile(filePath) {
    if (typeof vscode !== 'undefined') {
        vscode.postMessage({
            type: 'openFileLink',
            href: filePath
        });
    }
}

// Make functions globally available
window.setFontSize = setFontSize;
window.toggleCardFontSize = toggleCardFontSize;
window.openIncludeFile = openIncludeFile;

// Initialize font size on page load
document.addEventListener('DOMContentLoaded', function() {
    // Set default font size to small (maintaining current behavior)
    // Inject dynamic CSS for font sizes
    injectFontSizeCSS();

    setFontSize('1_0x');

    // Recalculate task description heights when window resizes (for vh units)
    window.addEventListener('resize', () => {
        if (document.body.classList.contains('task-height-limited')) {
            calculateTaskDescriptionHeight();
        }
    });

    // Handle clicks on included content icons (::before pseudo-element in top-right)
    document.addEventListener('click', function(e) {
        const includedContent = e.target.closest('.included-content-inline, .included-content-block');
        if (includedContent) {
            // Get the position of the click relative to the element
            const rect = includedContent.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            const iconSize = 20; // Icon area is approximately 20x20px (14px + padding)

            // Check if click is within the icon area (top-right corner)
            if (clickX >= rect.width - iconSize && clickY <= iconSize) {
                const filePath = includedContent.getAttribute('data-include-file');
                if (filePath) {
                    e.preventDefault();
                    e.stopPropagation();
                    openIncludeFile(filePath);
                }
            }
        }
    });

    // Add dynamic title on mousemove to show tooltip only on icon
    document.addEventListener('mousemove', function(e) {
        const includedContent = e.target.closest('.included-content-inline, .included-content-block');
        if (includedContent) {
            const rect = includedContent.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const iconSize = 20;
            const filePath = includedContent.getAttribute('data-include-file');

            // Show title only when hovering over the icon area (top-right corner)
            if (mouseX >= rect.width - iconSize && mouseY <= iconSize && filePath) {
                includedContent.title = `Open ${filePath}`;
            } else {
                includedContent.title = '';
            }
        }
    });

    // Initialize layout presets menu
    initializeLayoutPresetsMenu();
});

/**
 * Initialize the layout presets menu by populating it with preset options
 */
function initializeLayoutPresetsMenu() {
    const dropdown = document.getElementById('layout-presets-dropdown');
    if (!dropdown) return;

    // Clear existing content
    dropdown.innerHTML = '';

    // Add preset items
    Object.entries(layoutPresets).forEach(([presetKey, preset]) => {
        const item = document.createElement('button');
        item.className = 'layout-preset-item';
        item.setAttribute('data-preset', presetKey);
        item.onclick = () => applyLayoutPreset(presetKey);

        const label = document.createElement('div');
        label.className = 'layout-preset-label';
        label.textContent = preset.label;

        const description = document.createElement('div');
        description.className = 'layout-preset-description';
        description.textContent = preset.description;

        item.appendChild(label);
        item.appendChild(description);
        dropdown.appendChild(item);
    });

    // Update active state
    updateLayoutPresetsActiveState();
}

/**
 * Toggle the layout presets dropdown menu
 */
function toggleLayoutPresetsMenu() {
    const dropdown = document.getElementById('layout-presets-dropdown');
    const button = document.getElementById('layout-presets-btn');

    if (!dropdown || !button) return;

    const isVisible = dropdown.classList.contains('show');

    // Close all other menus first
    closeAllMenus();

    if (!isVisible) {
        dropdown.classList.add('show');
        button.classList.add('active');
        updateLayoutPresetsActiveState();

        // Close menu when clicking outside
        setTimeout(() => {
            document.addEventListener('click', function closeOnOutsideClick(e) {
                if (!dropdown.contains(e.target) && !button.contains(e.target)) {
                    dropdown.classList.remove('show');
                    button.classList.remove('active');
                    document.removeEventListener('click', closeOnOutsideClick);
                }
            });
        }, 0);
    }
}

/**
 * Apply a layout preset by setting all its configured options
 * @param {string} presetKey - The key of the preset to apply
 */
function applyLayoutPreset(presetKey) {
    const preset = layoutPresets[presetKey];
    if (!preset) return;

    // Apply each setting in the preset
    Object.entries(preset.settings).forEach(([settingKey, value]) => {
        switch (settingKey) {
            case 'columnWidth':
                setColumnWidth(value);
                break;
            case 'cardHeight':
                setTaskMinHeight(value);
                break;
            case 'fontSize':
                setFontSize(value);
                break;
            case 'fontFamily':
                setFontFamily(value);
                break;
            case 'layoutRows':
                setLayoutRows(value);
                break;
            case 'rowHeight':
                setRowHeight(value);
                break;
            case 'stickyHeaders':
                setStickyHeaders(value);
                break;
            case 'tagVisibility':
                setTagVisibility(value);
                break;
            case 'imageFill':
                setImageFill(value);
                break;
            case 'whitespace':
                setWhitespace(value);
                break;
        }
    });

    // Store the current preset for backend config
    window.currentLayoutPreset = presetKey;

    // Send to backend
    vscode.postMessage({
        type: 'setPreference',
        key: 'layoutPreset',
        value: presetKey
    });

    // Close the menu
    const dropdown = document.getElementById('layout-presets-dropdown');
    const button = document.getElementById('layout-presets-btn');
    if (dropdown && button) {
        dropdown.classList.remove('show');
        button.classList.remove('active');
    }

    // Update all menu indicators
    updateAllMenuIndicators();
    updateLayoutPresetsActiveState();
}

/**
 * Update the active state indicators in the layout presets menu
 */
function updateLayoutPresetsActiveState() {
    const currentPreset = window.currentLayoutPreset || 'normal';

    // Update dropdown items
    const items = document.querySelectorAll('.layout-preset-item');
    items.forEach(item => {
        const presetKey = item.getAttribute('data-preset');
        item.classList.toggle('active', presetKey === currentPreset);
    });

    // Update button text to show current preset
    const button = document.getElementById('layout-presets-btn');
    const textSpan = button?.querySelector('.layout-presets-text');
    if (textSpan && layoutPresets[currentPreset]) {
        textSpan.textContent = layoutPresets[currentPreset].label;
    }
}