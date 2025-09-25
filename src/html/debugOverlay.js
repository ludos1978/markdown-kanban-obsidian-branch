/**
 * Debug overlay system for tracking file states and conflict management
 */

// Debug overlay state
let debugOverlayVisible = false;
let debugOverlayElement = null;
let trackedFilesData = {};
let refreshCount = 0;

// Hover behavior state
let hoverShowTimer = null;
let hoverHideTimer = null;
let autoRefreshTimer = null;
const HOVER_SHOW_DELAY = 500; // ms
const HOVER_HIDE_DELAY = 300; // ms

/**
 * Create and show the debug overlay
 */
function showDebugOverlay() {
    console.log('[DebugOverlay] showDebugOverlay called');

    if (debugOverlayElement) {
        debugOverlayElement.remove();
    }

    // Check if vscode is available
    if (typeof window.vscode === 'undefined') {
        console.error('[DebugOverlay] vscode API not available, cannot request debug info');
        alert('Debug overlay error: vscode API not available');
        return;
    }

    // Request current file tracking state from backend
    window.vscode.postMessage({ type: 'getTrackedFilesDebugInfo' });

    // Create overlay element
    debugOverlayElement = document.createElement('div');
    debugOverlayElement.id = 'debug-overlay';
    debugOverlayElement.innerHTML = createDebugOverlayContent();

    // Add styles
    const style = document.createElement('style');
    style.textContent = getDebugOverlayStyles();
    document.head.appendChild(style);

    // Add to DOM
    document.body.appendChild(debugOverlayElement);

    debugOverlayVisible = true;

    // Auto-refresh overlay every 2 seconds
    autoRefreshTimer = setInterval(() => {
        if (debugOverlayVisible) {
            refreshDebugOverlay();
        } else {
            clearInterval(autoRefreshTimer);
            autoRefreshTimer = null;
        }
    }, 2000);

    // Handle mouse interactions with the overlay
    debugOverlayElement.addEventListener('mouseenter', () => {
        // Cancel hide timer when mouse enters overlay
        if (hoverHideTimer) {
            clearTimeout(hoverHideTimer);
            hoverHideTimer = null;
        }
    });

    debugOverlayElement.addEventListener('mouseleave', () => {
        // Hide overlay when mouse leaves
        hideDebugOverlayDelayed();
    });

    // Close on click outside
    debugOverlayElement.addEventListener('click', (e) => {
        if (e.target === debugOverlayElement) {
            hideDebugOverlay();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && debugOverlayVisible) {
            hideDebugOverlay();
        }
    });
}

/**
 * Hide and remove the debug overlay
 */
function hideDebugOverlay() {
    // Clear auto-refresh timer when hiding
    if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
    }

    if (debugOverlayElement) {
        debugOverlayElement.remove();
        debugOverlayElement = null;
    }
    debugOverlayVisible = false;
}

/**
 * Schedule showing the debug overlay after hover delay
 */
function scheduleDebugOverlayShow() {
    // Cancel any pending hide
    if (hoverHideTimer) {
        clearTimeout(hoverHideTimer);
        hoverHideTimer = null;
    }

    // If already visible, don't schedule again
    if (debugOverlayVisible) {
        return;
    }

    // Schedule show after delay
    if (!hoverShowTimer) {
        hoverShowTimer = setTimeout(() => {
            showDebugOverlay();
            hoverShowTimer = null;
        }, HOVER_SHOW_DELAY);
    }
}

/**
 * Cancel scheduled debug overlay show
 */
function cancelDebugOverlayShow() {
    if (hoverShowTimer) {
        clearTimeout(hoverShowTimer);
        hoverShowTimer = null;
    }
}

/**
 * Hide debug overlay with delay
 */
function hideDebugOverlayDelayed() {
    // Don't hide if mouse is over the overlay itself
    if (hoverHideTimer) {
        clearTimeout(hoverHideTimer);
    }

    hoverHideTimer = setTimeout(() => {
        hideDebugOverlay();
        hoverHideTimer = null;
    }, HOVER_HIDE_DELAY);
}

/**
 * Update the debug overlay with fresh data
 */
function refreshDebugOverlay() {
    if (!debugOverlayVisible || !debugOverlayElement) {
        return;
    }

    refreshCount++;
    if (window.vscode) {
        window.vscode.postMessage({ type: 'getTrackedFilesDebugInfo' });
    }

    const content = debugOverlayElement.querySelector('.debug-content');
    if (content) {
        content.innerHTML = createDebugContent();
    }
}

/**
 * Update tracked files data from backend
 */
function updateTrackedFilesData(data) {
    trackedFilesData = data;
    if (debugOverlayVisible && debugOverlayElement) {
        const content = debugOverlayElement.querySelector('.debug-content');
        if (content) {
            content.innerHTML = createDebugContent();
        }
    }
}

/**
 * Create the HTML content for the debug overlay
 */
function createDebugOverlayContent() {
    return `
        <div class="debug-panel">
            <div class="debug-header">
                <h3>🔍 File Tracking Debug Info</h3>
                <div class="debug-controls">
                    <button onclick="refreshDebugOverlay()" class="debug-btn">
                        🔄 Refresh (${refreshCount})
                    </button>
                    <button onclick="clearDebugCache()" class="debug-btn">
                        🗑️ Clear Cache
                    </button>
                    <button onclick="hideDebugOverlay()" class="debug-close">
                        ✕
                    </button>
                </div>
            </div>
            <div class="debug-content">
                ${createDebugContent()}
            </div>
        </div>
    `;
}

/**
 * Create the main debug content
 */
function createDebugContent() {
    const now = new Date().toLocaleTimeString();

    return `
        <div class="debug-section">
            <div class="debug-timestamp">Last updated: ${now}</div>

            <div class="debug-stats">
                <div class="stat-item">
                    <span class="stat-label">Refresh Count:</span>
                    <span class="stat-value">${refreshCount}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Overlay Updates:</span>
                    <span class="stat-value">${Math.floor(Date.now() / 1000) % 1000}</span>
                </div>
            </div>

            ${createFileWatcherSection()}
            ${createExternalFileWatcherSection()}
            ${createConflictManagerSection()}
            ${createIncludeFilesSection()}
            ${createPendingChangesSection()}
            ${createSystemHealthSection()}
        </div>
    `;
}

/**
 * Create file watcher status section
 */
function createFileWatcherSection() {
    const mainFile = trackedFilesData.mainFile || 'Unknown';
    const watcherActive = trackedFilesData.fileWatcherActive !== false;

    return `
        <div class="debug-group">
            <h4>📄 Main File Tracking</h4>
            <div class="debug-item">
                <span class="debug-label">File:</span>
                <span class="debug-value file-path" title="${mainFile}">
                    ${mainFile ? mainFile.split('/').pop() : 'None'}
                </span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Watcher:</span>
                <span class="debug-value ${watcherActive ? 'status-good' : 'status-bad'}">
                    ${watcherActive ? '✅ Active' : '❌ Inactive'}
                </span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Last Modified:</span>
                <span class="debug-value">
                    ${trackedFilesData.mainFileLastModified || 'Unknown'}
                </span>
            </div>
        </div>
    `;
}

/**
 * Create external file watcher section
 */
function createExternalFileWatcherSection() {
    const watchers = trackedFilesData.externalWatchers || [];

    return `
        <div class="debug-group">
            <h4>🔍 External File Watchers</h4>
            <div class="debug-item">
                <span class="debug-label">Total Watchers:</span>
                <span class="debug-value">${watchers.length}</span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Status:</span>
                <span class="debug-value ${watchers.length > 0 ? 'status-good' : 'status-warn'}">
                    ${watchers.length > 0 ? '✅ Monitoring' : '⚠️ No watchers'}
                </span>
            </div>
            <div class="watcher-list">
                ${watchers.map(w => `
                    <div class="watcher-item">
                        <span class="watcher-file" title="${w.path}">${w.path.split('/').pop()}</span>
                        <span class="watcher-type ${w.type}">${w.type}</span>
                        <span class="watcher-status ${w.active ? 'active' : 'inactive'}">
                            ${w.active ? '🟢' : '🔴'}
                        </span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

/**
 * Create conflict manager section
 */
function createConflictManagerSection() {
    const conflicts = trackedFilesData.conflictManager || {};

    return `
        <div class="debug-group">
            <h4>⚡ Conflict Management</h4>
            <div class="debug-item">
                <span class="debug-label">System Status:</span>
                <span class="debug-value ${conflicts.healthy ? 'status-good' : 'status-bad'}">
                    ${conflicts.healthy ? '✅ Healthy' : '❌ Issues Detected'}
                </span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Tracked Files:</span>
                <span class="debug-value">${conflicts.trackedFiles || 0}</span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Pending Conflicts:</span>
                <span class="debug-value ${(conflicts.pendingConflicts || 0) > 0 ? 'status-warn' : 'status-good'}">
                    ${conflicts.pendingConflicts || 0}
                </span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Watcher Failures:</span>
                <span class="debug-value ${(conflicts.watcherFailures || 0) > 0 ? 'status-bad' : 'status-good'}">
                    ${conflicts.watcherFailures || 0}
                </span>
            </div>
        </div>
    `;
}

/**
 * Create include files section
 */
function createIncludeFilesSection() {
    const includeFiles = trackedFilesData.includeFiles || [];

    return `
        <div class="debug-group">
            <h4>📎 Include Files</h4>
            <div class="debug-item">
                <span class="debug-label">Total Includes:</span>
                <span class="debug-value">${includeFiles.length}</span>
            </div>
            <div class="include-list">
                ${includeFiles.map(file => `
                    <div class="include-item">
                        <div class="include-header">
                            <span class="include-file" title="${file.path}">${file.path.split('/').pop()}</span>
                            <span class="include-type ${file.type}">${file.type}</span>
                            <span class="include-status ${file.exists ? 'exists' : 'missing'}">
                                ${file.exists ? '📄' : '❌'}
                            </span>
                        </div>
                        <div class="include-details">
                            <span class="detail-item">Modified: ${file.lastModified || 'Unknown'}</span>
                            <span class="detail-item">Size: ${file.size || 'Unknown'}</span>
                            <span class="detail-item ${file.hasUnsavedChanges ? 'unsaved' : 'saved'}">
                                ${file.hasUnsavedChanges ? '🟡 Unsaved' : '🟢 Saved'}
                            </span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

/**
 * Create pending changes section
 */
function createPendingChangesSection() {
    const columnChanges = window.pendingColumnChanges?.size || 0;
    const taskChanges = window.pendingTaskChanges?.size || 0;
    const totalChanges = columnChanges + taskChanges;

    return `
        <div class="debug-group">
            <h4>💾 Pending Changes</h4>
            <div class="debug-item">
                <span class="debug-label">Total Pending:</span>
                <span class="debug-value ${totalChanges > 0 ? 'status-warn' : 'status-good'}">
                    ${totalChanges}
                </span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Column Changes:</span>
                <span class="debug-value">${columnChanges}</span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Task Changes:</span>
                <span class="debug-value">${taskChanges}</span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Unsaved Status:</span>
                <span class="debug-value ${trackedFilesData.hasUnsavedChanges ? 'status-warn' : 'status-good'}">
                    ${trackedFilesData.hasUnsavedChanges ? '🟡 Has Unsaved' : '🟢 All Saved'}
                </span>
            </div>
        </div>
    `;
}

/**
 * Create system health section
 */
function createSystemHealthSection() {
    const health = trackedFilesData.systemHealth || {};

    return `
        <div class="debug-group">
            <h4>🏥 System Health</h4>
            <div class="debug-item">
                <span class="debug-label">Overall Status:</span>
                <span class="debug-value ${health.overall || 'status-unknown'}">
                    ${health.overall === 'good' ? '✅ Good' :
                      health.overall === 'warn' ? '⚠️ Warning' :
                      health.overall === 'bad' ? '❌ Critical' : '❓ Unknown'}
                </span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Extension State:</span>
                <span class="debug-value">${health.extensionState || 'Unknown'}</span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Memory Usage:</span>
                <span class="debug-value">${health.memoryUsage || 'Unknown'}</span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Last Error:</span>
                <span class="debug-value ${health.lastError ? 'status-bad' : 'status-good'}">
                    ${health.lastError || 'None'}
                </span>
            </div>
        </div>
    `;
}

/**
 * Clear debug cache and request fresh data
 */
function clearDebugCache() {
    trackedFilesData = {};
    refreshCount = 0;
    if (window.vscode) {
        window.vscode.postMessage({ type: 'clearTrackedFilesCache' });
    }
    refreshDebugOverlay();
}

/**
 * CSS styles for the debug overlay
 */
function getDebugOverlayStyles() {
    return `
        #debug-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.4);
            z-index: 10000;
            display: flex;
            align-items: flex-start;
            justify-content: flex-end;
            padding: 60px 20px 20px 20px;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            pointer-events: none;
        }

        .debug-panel {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            max-width: 500px;
            max-height: 70vh;
            width: 450px;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            pointer-events: auto;
            animation: slideInFromRight 0.2s ease-out;
        }

        @keyframes slideInFromRight {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }

        .debug-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 20px;
            border-bottom: 1px solid var(--vscode-panel-border);
            background: var(--vscode-titleBar-activeBackground);
        }

        .debug-header h3 {
            margin: 0;
            color: var(--vscode-titleBar-activeForeground);
        }

        .debug-controls {
            display: flex;
            gap: 8px;
            align-items: center;
        }

        .debug-btn, .debug-close {
            padding: 6px 12px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }

        .debug-btn:hover, .debug-close:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .debug-close {
            background: var(--vscode-errorForeground);
            color: white;
            font-weight: bold;
        }

        .debug-content {
            padding: 16px 20px;
            overflow-y: auto;
            flex: 1;
        }

        .debug-timestamp {
            text-align: right;
            color: var(--vscode-descriptionForeground);
            font-size: 11px;
            margin-bottom: 16px;
        }

        .debug-stats {
            display: flex;
            gap: 20px;
            margin-bottom: 20px;
            padding: 12px;
            background: var(--vscode-textBlockQuote-background);
            border-radius: 4px;
        }

        .stat-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
        }

        .stat-label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .stat-value {
            font-weight: bold;
            color: var(--vscode-foreground);
        }

        .debug-group {
            margin-bottom: 24px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            overflow: hidden;
        }

        .debug-group h4 {
            margin: 0;
            padding: 12px 16px;
            background: var(--vscode-sideBar-background);
            color: var(--vscode-sideBar-foreground);
            font-size: 13px;
            font-weight: 600;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .debug-item {
            display: flex;
            justify-content: space-between;
            padding: 8px 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .debug-item:last-child {
            border-bottom: none;
        }

        .debug-label {
            font-weight: 500;
            color: var(--vscode-foreground);
        }

        .debug-value {
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
        }

        .status-good { color: var(--vscode-gitDecoration-addedResourceForeground); }
        .status-warn { color: var(--vscode-gitDecoration-modifiedResourceForeground); }
        .status-bad { color: var(--vscode-gitDecoration-deletedResourceForeground); }
        .status-unknown { color: var(--vscode-descriptionForeground); }

        .file-path {
            font-family: var(--vscode-editor-font-family);
            font-size: 11px;
            max-width: 300px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .watcher-list, .include-list {
            padding: 8px;
        }

        .watcher-item, .include-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 6px 8px;
            margin: 4px 0;
            background: var(--vscode-list-inactiveSelectionBackground);
            border-radius: 4px;
            font-size: 12px;
        }

        .include-item {
            flex-direction: column;
            align-items: stretch;
        }

        .include-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 4px;
        }

        .include-details {
            display: flex;
            gap: 12px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .watcher-type, .include-type {
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: bold;
            text-transform: uppercase;
        }

        .watcher-type.main, .include-type.main {
            background: var(--vscode-gitDecoration-addedResourceForeground);
            color: white;
        }
        .watcher-type.include, .include-type.include {
            background: var(--vscode-gitDecoration-modifiedResourceForeground);
            color: white;
        }
        .watcher-type.dependency, .include-type.dependency {
            background: var(--vscode-gitDecoration-untrackedResourceForeground);
            color: white;
        }

        .watcher-status.active { color: var(--vscode-gitDecoration-addedResourceForeground); }
        .watcher-status.inactive { color: var(--vscode-gitDecoration-deletedResourceForeground); }

        .detail-item.unsaved { color: var(--vscode-gitDecoration-modifiedResourceForeground); }
        .detail-item.saved { color: var(--vscode-gitDecoration-addedResourceForeground); }
    `;
}

/**
 * Enhanced manual refresh with debug overlay toggle
 */
function enhancedManualRefresh(showDebug = false) {
    // Show debug overlay if requested
    if (showDebug) {
        showDebugOverlay();
        return;
    }

    // Call original manual refresh
    if (typeof originalManualRefresh === 'function') {
        originalManualRefresh();
    }
}

// Store original function (will be done after DOM ready)
let originalManualRefresh = null;

// Keyboard shortcut removed - now using hover behavior

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeDebugOverlay);
} else {
    initializeDebugOverlay();
}

function initializeDebugOverlay() {
    console.log('[DebugOverlay] Initializing debug overlay system...');

    // Make functions globally available immediately
    window.showDebugOverlay = showDebugOverlay;
    window.hideDebugOverlay = hideDebugOverlay;
    window.updateTrackedFilesData = updateTrackedFilesData;
    window.clearDebugCache = clearDebugCache;
    window.scheduleDebugOverlayShow = scheduleDebugOverlayShow;
    window.cancelDebugOverlayShow = cancelDebugOverlayShow;
    window.hideDebugOverlayDelayed = hideDebugOverlayDelayed;

    // Store original manual refresh function
    if (typeof window.manualRefresh === 'function') {
        originalManualRefresh = window.manualRefresh;
        window.manualRefresh = enhancedManualRefresh;
        console.log('[DebugOverlay] Enhanced manual refresh function');
    } else {
        console.log('[DebugOverlay] manualRefresh not available yet, will try later');
        // Try again after a short delay
        setTimeout(() => {
            if (typeof window.manualRefresh === 'function' && !originalManualRefresh) {
                originalManualRefresh = window.manualRefresh;
                window.manualRefresh = enhancedManualRefresh;
                console.log('[DebugOverlay] Enhanced manual refresh function (delayed)');
            }
        }, 1000);
    }

    console.log('[DebugOverlay] Debug overlay system loaded. Press Ctrl+Shift+D or right-click refresh button to open.');
    console.log('[DebugOverlay] Functions available:', {
        showDebugOverlay: typeof window.showDebugOverlay,
        hideDebugOverlay: typeof window.hideDebugOverlay,
        vscode: typeof window.vscode
    });
}

console.log('[DebugOverlay] Script loaded');