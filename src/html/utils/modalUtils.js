/**
 * Modal and Dialog Management Utilities
 * Centralizes all modal, dialog, and popup functionality
 */

class ModalUtils {
    constructor() {
        this.activeModals = new Set();
        this.keyHandlers = new Map();
        this.setupGlobalKeyHandler();
    }

    /**
     * Setup global key handler for modal management
     */
    setupGlobalKeyHandler() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.activeModals.size > 0) {
                this.closeTopModal();
            }
        });
    }

    /**
     * Show input modal using existing HTML elements
     * @param {string} title - Modal title
     * @param {string} message - Modal message
     * @param {string} placeholder - Input placeholder
     * @param {Function} onConfirm - Callback when confirmed
     * @param {Function} onCancel - Optional callback when cancelled
     */
    showInputModal(title, message, placeholder, onConfirm, onCancel = null) {
        const modalElement = document.getElementById('input-modal');
        if (!modalElement) {
            console.error('Input modal element not found');
            return;
        }

        // Set up modal content
        document.getElementById('input-modal-title').textContent = title;
        document.getElementById('input-modal-message').textContent = message;

        const inputField = document.getElementById('input-modal-field');
        inputField.placeholder = placeholder;
        inputField.value = '';

        // Show modal
        modalElement.style.display = 'block';
        this.activeModals.add(modalElement);

        // Focus input after a brief delay
        setTimeout(() => inputField.focus(), 100);

        // Set up confirm action
        const confirmAction = () => {
            const value = inputField.value.trim();
            if (value) {
                this.closeInputModal();
                onConfirm(value);
            }
        };

        // Set up cancel action
        const cancelAction = () => {
            this.closeInputModal();
            if (onCancel) onCancel();
        };

        // Bind events
        const okBtn = document.getElementById('input-ok-btn');
        const cancelBtn = document.getElementById('input-cancel-btn');

        // Remove previous listeners to avoid duplicates
        okBtn.onclick = null;
        inputField.onkeydown = null;
        if (cancelBtn) cancelBtn.onclick = null;

        // Add new listeners
        okBtn.onclick = confirmAction;
        if (cancelBtn) cancelBtn.onclick = cancelAction;

        inputField.onkeydown = (e) => {
            if (e.key === 'Enter') {
                confirmAction();
            } else if (e.key === 'Escape') {
                cancelAction();
            }
        };

        // Store handlers for cleanup
        this.keyHandlers.set(modalElement, { confirmAction, cancelAction });
    }

    /**
     * Close input modal
     */
    closeInputModal() {
        const modalElement = document.getElementById('input-modal');
        if (modalElement) {
            modalElement.style.display = 'none';
            this.activeModals.delete(modalElement);
            this.keyHandlers.delete(modalElement);
        }
    }

    /**
     * Create and show a custom confirmation modal
     * @param {string} title - Modal title
     * @param {string} message - Modal message
     * @param {Array} buttons - Array of button objects {text, action, primary, variant}
     * @param {Object} options - Additional options {maxWidth, closeOnOutsideClick}
     */
    showConfirmModal(title, message, buttons = [], options = {}) {
        const {
            maxWidth = '400px',
            closeOnOutsideClick = true,
            className = 'custom-modal'
        } = options;

        // Create modal overlay
        const modal = document.createElement('div');
        modal.className = `modal ${className}`;
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

        // Create dialog
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 8px;
            padding: 20px;
            max-width: ${maxWidth};
            min-width: 280px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
        `;

        // Create content
        const titleElement = document.createElement('h3');
        titleElement.textContent = title;
        titleElement.style.cssText = `
            margin: 0 0 15px 0;
            color: var(--vscode-foreground);
            font-size: 16px;
        `;

        const messageElement = document.createElement('p');
        messageElement.textContent = message;
        messageElement.style.cssText = `
            margin: 0 0 20px 0;
            color: var(--vscode-descriptionForeground);
            line-height: 1.4;
        `;

        // Create button container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            display: flex;
            gap: 10px;
            justify-content: flex-end;
        `;

        // Create buttons
        buttons.forEach((buttonConfig, index) => {
            const button = document.createElement('button');
            button.textContent = buttonConfig.text;
            button.style.cssText = `
                padding: 8px 16px;
                border: 1px solid var(--vscode-button-border);
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                transition: all 0.2s;
            `;

            // Apply button variant styles
            if (buttonConfig.primary || buttonConfig.variant === 'primary') {
                button.style.background = 'var(--vscode-button-background)';
                button.style.color = 'var(--vscode-button-foreground)';
            } else if (buttonConfig.variant === 'danger') {
                button.style.background = 'var(--vscode-errorForeground)';
                button.style.color = 'var(--vscode-button-foreground)';
            } else {
                button.style.background = 'var(--vscode-button-secondaryBackground)';
                button.style.color = 'var(--vscode-button-secondaryForeground)';
            }

            // Add click handler
            button.onclick = () => {
                this.closeModal(modal);
                if (buttonConfig.action) {
                    buttonConfig.action();
                }
            };

            buttonContainer.appendChild(button);
        });

        // Assemble dialog
        dialog.appendChild(titleElement);
        dialog.appendChild(messageElement);
        dialog.appendChild(buttonContainer);
        modal.appendChild(dialog);

        // Add to document
        document.body.appendChild(modal);
        this.activeModals.add(modal);

        // Close on outside click
        if (closeOnOutsideClick) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal(modal);
                }
            });
        }

        return modal;
    }

    /**
     * Show a simple alert modal
     * @param {string} title - Alert title
     * @param {string} message - Alert message
     * @param {Function} onOk - Optional callback when OK is clicked
     */
    showAlert(title, message, onOk = null) {
        return this.showConfirmModal(title, message, [
            {
                text: 'OK',
                primary: true,
                action: onOk
            }
        ]);
    }

    /**
     * Show a simple confirm modal
     * @param {string} title - Confirm title
     * @param {string} message - Confirm message
     * @param {Function} onConfirm - Callback when confirmed
     * @param {Function} onCancel - Optional callback when cancelled
     */
    showConfirm(title, message, onConfirm, onCancel = null) {
        return this.showConfirmModal(title, message, [
            {
                text: 'Cancel',
                action: onCancel
            },
            {
                text: 'OK',
                primary: true,
                action: onConfirm
            }
        ]);
    }

    /**
     * Close a specific modal
     * @param {HTMLElement} modal - Modal element to close
     */
    closeModal(modal) {
        if (modal && modal.parentNode) {
            modal.parentNode.removeChild(modal);
            this.activeModals.delete(modal);
            this.keyHandlers.delete(modal);
        }
    }

    /**
     * Close the topmost modal
     */
    closeTopModal() {
        if (this.activeModals.size > 0) {
            const modals = Array.from(this.activeModals);
            const topModal = modals[modals.length - 1];

            // Try input modal first
            if (topModal.id === 'input-modal') {
                this.closeInputModal();
            } else {
                this.closeModal(topModal);
            }
        }
    }

    /**
     * Close all modals
     */
    closeAllModals() {
        this.activeModals.forEach(modal => {
            this.closeModal(modal);
        });
        this.activeModals.clear();
        this.keyHandlers.clear();
    }

    /**
     * Check if any modal is currently open
     * @returns {boolean} True if any modal is open
     */
    hasOpenModals() {
        return this.activeModals.size > 0;
    }

    /**
     * Show a loading modal
     * @param {string} message - Loading message
     * @returns {HTMLElement} Modal element for later closing
     */
    showLoading(message = 'Loading...') {
        const modal = document.createElement('div');
        modal.className = 'modal loading-modal';
        modal.style.cssText = `
            display: flex;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.3);
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        const spinner = document.createElement('div');
        spinner.style.cssText = `
            background: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 8px;
            padding: 20px;
            display: flex;
            align-items: center;
            gap: 15px;
            color: var(--vscode-foreground);
        `;

        spinner.innerHTML = `
            <div style="
                width: 20px;
                height: 20px;
                border: 2px solid var(--vscode-progressBar-background);
                border-top: 2px solid var(--vscode-progressBar-foreground);
                border-radius: 50%;
                animation: spin 1s linear infinite;
            "></div>
            <span>${message}</span>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        `;

        modal.appendChild(spinner);
        document.body.appendChild(modal);
        this.activeModals.add(modal);

        return modal;
    }
}

// Create singleton instance
const modalUtils = new ModalUtils();

// Make it globally available for compatibility
if (typeof window !== 'undefined') {
    window.ModalUtils = ModalUtils;
    window.modalUtils = modalUtils;

    // Export individual functions for backward compatibility
    window.showInputModal = modalUtils.showInputModal.bind(modalUtils);
    window.closeInputModal = modalUtils.closeInputModal.bind(modalUtils);
    window.showAlert = modalUtils.showAlert.bind(modalUtils);
    window.showConfirm = modalUtils.showConfirm.bind(modalUtils);
    window.showLoading = modalUtils.showLoading.bind(modalUtils);
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = modalUtils;
}