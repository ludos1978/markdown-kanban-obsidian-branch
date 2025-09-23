/**
 * Activity Indicator Manager
 * Shows progress bars for long-running backend operations
 */
class ActivityIndicatorManager {
    constructor() {
        this.activeOperations = new Map();
        this.createIndicatorContainer();
    }

    createIndicatorContainer() {
        // Create fixed position indicator area in top-right corner
        const container = document.createElement('div');
        container.id = 'activity-indicators';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 8px;
            pointer-events: none;
            max-width: 280px;
        `;
        document.body.appendChild(container);
        this.container = container;
    }

    startOperation(operationId, type, description) {
        // Remove any existing operation with same ID
        this.endOperation(operationId);

        // Create progress indicator element
        const indicator = document.createElement('div');
        indicator.className = `activity-indicator activity-${type}`;
        indicator.style.cssText = `
            background: var(--vscode-notifications-background);
            border: 1px solid var(--vscode-notifications-border);
            border-radius: 6px;
            padding: 12px 16px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            color: var(--vscode-notifications-foreground);
            font-size: calc(var(--vscode-font-size, 13px) - 1px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            pointer-events: auto;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
            border-left: 3px solid var(--vscode-progressBar-foreground);
        `;

        // Create header with description
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
        `;

        // Add animated spinner
        const spinner = document.createElement('div');
        spinner.style.cssText = `
            width: 14px;
            height: 14px;
            border: 2px solid var(--vscode-progressBar-background);
            border-top: 2px solid var(--vscode-progressBar-foreground);
            border-radius: 50%;
            animation: spin 1s linear infinite;
            flex-shrink: 0;
        `;

        // Add description text
        const text = document.createElement('span');
        text.textContent = description;
        text.style.cssText = `
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-weight: 500;
        `;

        header.appendChild(spinner);
        header.appendChild(text);

        // Create progress bar container
        const progressContainer = document.createElement('div');
        progressContainer.className = 'progress-container';
        progressContainer.style.cssText = `
            height: 4px;
            background: var(--vscode-progressBar-background);
            border-radius: 2px;
            overflow: hidden;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;

        const progressBar = document.createElement('div');
        progressBar.className = 'progress-bar';
        progressBar.style.cssText = `
            height: 100%;
            background: var(--vscode-progressBar-foreground);
            border-radius: 2px;
            width: 0%;
            transition: width 0.3s ease;
        `;

        progressContainer.appendChild(progressBar);
        indicator.appendChild(header);
        indicator.appendChild(progressContainer);

        // Store operation data
        this.activeOperations.set(operationId, {
            element: indicator,
            type,
            description,
            startTime: Date.now(),
            progressContainer,
            progressBar,
            spinner,
            text
        });

        this.container.appendChild(indicator);

        // Animate in
        setTimeout(() => {
            indicator.style.opacity = '1';
            indicator.style.transform = 'translateX(0)';
        }, 10);

        // Safety cleanup after 60 seconds
        setTimeout(() => {
            if (this.activeOperations.has(operationId)) {
                this.endOperation(operationId);
            }
        }, 60000);
    }

    updateProgress(operationId, progress, message) {
        const operation = this.activeOperations.get(operationId);
        if (!operation) { return; }

        // Update description if provided
        if (message) {
            operation.text.textContent = message;
        }

        // Show and update progress bar
        if (progress >= 0 && progress <= 100) {
            operation.progressContainer.style.opacity = '1';
            operation.progressBar.style.width = `${progress}%`;
        }

        // When progress reaches 100%, start fade out after brief delay
        if (progress >= 100) {
            setTimeout(() => {
                this.endOperation(operationId);
            }, 500);
        }
    }

    endOperation(operationId, immediate = false) {
        const operation = this.activeOperations.get(operationId);
        if (!operation) { return; }

        const fadeOut = () => {
            const indicator = operation.element;
            indicator.style.transition = 'all 0.4s ease';
            indicator.style.opacity = '0';
            indicator.style.transform = 'translateX(100%)';

            setTimeout(() => {
                if (indicator.parentNode) {
                    indicator.parentNode.removeChild(indicator);
                }
                this.activeOperations.delete(operationId);
            }, 400);
        };

        if (immediate) {
            fadeOut();
        } else {
            // Brief delay to show completion
            setTimeout(fadeOut, 200);
        }
    }

    // Clean up all active operations
    clear() {
        for (const operationId of this.activeOperations.keys()) {
            this.endOperation(operationId, true);
        }
    }

    // Get count of active operations
    getActiveCount() {
        return this.activeOperations.size;
    }
}

// Add required CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);

// Create singleton instance
const activityManager = new ActivityIndicatorManager();

// Make globally available
if (typeof window !== 'undefined') {
    window.ActivityIndicatorManager = ActivityIndicatorManager;
    window.activityManager = activityManager;
}