class TaskEditor {
    constructor() {
        this.currentEditor = null;
        this.isTransitioning = false;
        this.setupGlobalHandlers();
    }

    setupGlobalHandlers() {
        document.addEventListener('keydown', (e) => {
            if (!this.currentEditor) return;
            
            const element = this.currentEditor.element;
            
            if (e.key === 'Tab' && element.classList.contains('task-title-edit')) {
                e.preventDefault();
                this.transitionToDescription();
            } else if (e.key === 'Enter' && !e.shiftKey) {
                if (element.classList.contains('task-title-edit') || 
                    element.classList.contains('column-title-edit')) {
                    e.preventDefault();
                    this.save();
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.cancel();
            }
        });

        document.addEventListener('click', (e) => {
            if (this.currentEditor && this.currentEditor.element && 
                this.currentEditor.element.contains(e.target)) {
                return;
            }
            
            if (!e.target.closest('.donut-menu')) {
                document.querySelectorAll('.donut-menu.active').forEach(menu => {
                    menu.classList.remove('active');
                });
            }
        });

        document.addEventListener('mousedown', (e) => {
            if (this.currentEditor && this.currentEditor.element && 
                this.currentEditor.element.contains(e.target)) {
                return;
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (this.currentEditor && this.currentEditor.element && 
                this.currentEditor.element.contains(e.target)) {
                return;
            }
        });
    }

    startEdit(element, type, taskId = null, columnId = null) {
        if (this.isTransitioning) return;
        
        let displayElement, editElement, containerElement;
        
        if (type === 'task-title') {
            containerElement = element.closest('.task-item') || element;
            displayElement = containerElement.querySelector('.task-title-display');
            editElement = containerElement.querySelector('.task-title-edit');
        } else if (type === 'task-description') {
            containerElement = element.closest('.task-item') || element;
            displayElement = containerElement.querySelector('.task-description-display');
            editElement = containerElement.querySelector('.task-description-edit');
            const placeholder = containerElement.querySelector('.task-description-placeholder');
            if (placeholder) placeholder.style.display = 'none';
        } else if (type === 'column-title') {
            containerElement = element.closest('.kanban-column') || element;
            displayElement = containerElement.querySelector('.column-title');
            editElement = containerElement.querySelector('.column-title-edit');
        }

        if (!editElement) return;

        const isAlreadyEditing = this.currentEditor && 
                                this.currentEditor.element === editElement &&
                                editElement.style.display !== 'none';

        if (isAlreadyEditing) {
            return;
        }

        if (this.currentEditor && !this.isTransitioning) {
            this.save();
        }

        if (displayElement) displayElement.style.display = 'none';
        editElement.style.display = 'block';
        
        this.autoResize(editElement);
        
        editElement.focus();
        editElement.setSelectionRange(editElement.value.length, editElement.value.length);

        this.currentEditor = {
            element: editElement,
            displayElement: displayElement,
            type: type,
            taskId: taskId || editElement.dataset.taskId,
            columnId: columnId || editElement.dataset.columnId,
            originalValue: editElement.value
        };

        editElement.oninput = () => this.autoResize(editElement);
        
        editElement.onblur = (e) => {
            if (!this.isTransitioning) {
                setTimeout(() => {
                    if (document.activeElement !== editElement && !this.isTransitioning) {
                        this.save();
                    }
                }, 50);
            }
        };

        editElement.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });

        editElement.addEventListener('dblclick', (e) => {
            e.stopPropagation();
        });
    }

    transitionToDescription() {
        if (!this.currentEditor || this.currentEditor.type !== 'task-title') return;
        
        this.isTransitioning = true;
        
        const taskId = this.currentEditor.taskId;
        const columnId = this.currentEditor.columnId;
        const taskItem = this.currentEditor.element.closest('.task-item');
        
        const value = this.currentEditor.element.value;
        if (currentBoard && currentBoard.columns) {
            const column = currentBoard.columns.find(c => c.id === columnId);
            const task = column?.tasks.find(t => t.id === taskId);
            if (task) {
                task.title = value;
                if (this.currentEditor.displayElement) {
                    this.currentEditor.displayElement.innerHTML = renderMarkdown(value);
                }
            }
        }
        
        this.currentEditor.element.onblur = null;
        
        this.currentEditor.element.style.display = 'none';
        if (this.currentEditor.displayElement) {
            this.currentEditor.displayElement.style.display = 'block';
        }
        
        this.currentEditor = null;
        
        this.isTransitioning = false;
        const descContainer = taskItem.querySelector('.task-description-container');
        if (descContainer) {
            this.startEdit(descContainer, 'task-description', taskId, columnId);
        }
    }

    save() {
        if (!this.currentEditor || this.isTransitioning) return;
        
        this.saveCurrentField();
        this.closeEditor();
    }

    cancel() {
        if (!this.currentEditor || this.isTransitioning) return;
        
        this.currentEditor.element.value = this.currentEditor.originalValue;
        this.closeEditor();
    }

    saveCurrentField() {
        if (!this.currentEditor) return;
        
        const { element, type, taskId, columnId } = this.currentEditor;
        const value = element.value;

        if (currentBoard && currentBoard.columns) {
            if (type === 'column-title') {
                const column = currentBoard.columns.find(c => c.id === columnId);
                if (column) {
                    const currentRow = getColumnRow(column.title);
                    
                    let cleanValue = value
                        .replace(/#row\d+\b/gi, '')
                        .replace(/\s+#row\d+/gi, '')
                        .replace(/#row\d+\s+/gi, '')
                        .replace(/\s{2,}/g, ' ')
                        .trim();
                    
                    if (currentRow > 1) {
                        column.title = cleanValue + ` #row${currentRow}`;
                    } else {
                        column.title = cleanValue;
                    }
                    
                    if (this.currentEditor.displayElement) {
                        const displayTitle = column.title.replace(/#row\d+/gi, '').trim();
                        this.currentEditor.displayElement.innerHTML = renderMarkdown(displayTitle);
                        
                        if (window.showRowTags && currentRow > 1) {
                            this.currentEditor.displayElement.innerHTML += `<span class="column-row-tag">Row ${currentRow}</span>`;
                        }
                    }
                    
                    vscode.postMessage({
                        type: 'editColumnTitle',
                        columnId: columnId,
                        title: cleanValue
                    });
                }
            } else if (type === 'task-title' || type === 'task-description') {
                const column = currentBoard.columns.find(c => c.id === columnId);
                const task = column?.tasks.find(t => t.id === taskId);
                
                if (task) {
                    const field = type === 'task-title' ? 'title' : 'description';
                    task[field] = value;
                    
                    if (this.currentEditor.displayElement) {
                        if (value.trim()) {
                            this.currentEditor.displayElement.innerHTML = renderMarkdown(value);
                            this.currentEditor.displayElement.style.display = 'block';
                        } else if (type === 'task-description') {
                            this.currentEditor.displayElement.style.display = 'none';
                            const placeholder = element.closest('.task-description-container')
                                ?.querySelector('.task-description-placeholder');
                            if (placeholder) placeholder.style.display = 'block';
                        }
                    }
                    
                    vscode.postMessage({
                        type: 'editTask',
                        taskId: taskId,
                        columnId: columnId,
                        taskData: task
                    });
                }
            }
        }
    }

    closeEditor() {
        if (!this.currentEditor) return;
        
        const { element, displayElement, type } = this.currentEditor;
        
        element.onblur = null;
        element.oninput = null;
        element.removeEventListener('mousedown', this._handleMouseDown);
        element.removeEventListener('dblclick', this._handleDblClick);
        
        element.style.display = 'none';
        
        if (displayElement) {
            displayElement.style.display = 'block';
        } else if (type === 'task-description') {
            const container = element.closest('.task-description-container');
            const placeholder = container?.querySelector('.task-description-placeholder');
            if (placeholder && !element.value.trim()) {
                placeholder.style.display = 'block';
            }
        }
        
        this.currentEditor = null;
    }

    autoResize(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    }
}

const taskEditor = new TaskEditor();
window.taskEditor = taskEditor;

function editTitle(element, taskId, columnId) {
    if (taskEditor.currentEditor && 
        taskEditor.currentEditor.type === 'task-title' &&
        taskEditor.currentEditor.taskId === taskId &&
        taskEditor.currentEditor.columnId === columnId) {
        return;
    }
    taskEditor.startEdit(element, 'task-title', taskId, columnId);
}

function editDescription(element, taskId, columnId) {
    if (taskEditor.currentEditor && 
        taskEditor.currentEditor.type === 'task-description' &&
        taskEditor.currentEditor.taskId === taskId &&
        taskEditor.currentEditor.columnId === columnId) {
        return;
    }
    const container = element.closest('.task-description-container') || element;
    taskEditor.startEdit(container, 'task-description', taskId, columnId);
}

function editColumnTitle(columnId) {
    if (taskEditor.currentEditor && 
        taskEditor.currentEditor.type === 'column-title' &&
        taskEditor.currentEditor.columnId === columnId) {
        return;
    }
    const column = document.querySelector(`[data-column-id="${columnId}"]`);
    if (column && !column.classList.contains('collapsed')) {
        taskEditor.startEdit(column, 'column-title', null, columnId);
    }
}