
class KanbanSearch {
    constructor() {
        this.searchResults = [];
        this.currentResultIndex = -1;
        this.searchTerm = '';
        this.caseSensitive = false;
        this.wholeWords = false;
        this.useRegex = false;
        this.isSearching = false;
        this.highlightedElements = [];
        
        this.initializeSearch();
    }
    
    initializeSearch() {
        // Will be called from webview.js after DOM is ready
    }
    
    openSearch() {
        const searchPanel = document.getElementById('search-panel');
        if (searchPanel) {
            searchPanel.style.display = 'flex';
            const searchInput = document.getElementById('search-input');
            searchInput?.focus();
            searchInput?.select();
            this.isSearching = true;
        }
    }
    
    closeSearch() {
        const searchPanel = document.getElementById('search-panel');
        if (searchPanel) {
            searchPanel.style.display = 'none';
            this.clearHighlights();
            this.searchResults = [];
            this.currentResultIndex = -1;
            this.updateResultCounter();
            this.isSearching = false;
        }
    }
    
    toggleCaseSensitive() {
        this.caseSensitive = !this.caseSensitive;
        const btn = document.getElementById('search-case-btn');
        btn?.classList.toggle('active', this.caseSensitive);
        this.performSearch();
    }
    
    toggleWholeWords() {
        this.wholeWords = !this.wholeWords;
        const btn = document.getElementById('search-word-btn');
        btn?.classList.toggle('active', this.wholeWords);
        this.performSearch();
    }
    
    toggleRegex() {
        this.useRegex = !this.useRegex;
        const btn = document.getElementById('search-regex-btn');
        btn?.classList.toggle('active', this.useRegex);
        this.performSearch();
    }
    
    performSearch() {
        const searchInput = document.getElementById('search-input');
        const searchTerm = searchInput?.value || '';
        
        if (!searchTerm) {
            this.clearHighlights();
            this.searchResults = [];
            this.currentResultIndex = -1;
            this.updateResultCounter();
            return;
        }
        
        this.searchTerm = searchTerm;
        this.searchResults = this.findAllMatches(searchTerm);
        
        if (this.searchResults.length > 0) {
            this.currentResultIndex = 0;
            this.highlightAllResults();
            this.navigateToResult(0);
        } else {
            this.currentResultIndex = -1;
            this.clearHighlights();
        }
        
        this.updateResultCounter();
    }
    
    findAllMatches(searchTerm) {
        const results = [];
        
        if (!currentBoard || !currentBoard.columns) {
            return results;
        }
        
        let searchPattern;
        try {
            if (this.useRegex) {
                searchPattern = new RegExp(searchTerm, this.caseSensitive ? 'g' : 'gi');
            } else if (this.wholeWords) {
                const escapedTerm = window.escapeRegex ? window.escapeRegex(searchTerm) : searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                searchPattern = new RegExp(`\\b${escapedTerm}\\b`, this.caseSensitive ? 'g' : 'gi');
            } else {
                const escapedTerm = window.escapeRegex ? window.escapeRegex(searchTerm) : searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                searchPattern = new RegExp(escapedTerm, this.caseSensitive ? 'g' : 'gi');
            }
        } catch (e) {
            console.error('Invalid search pattern:', e);
            return results;
        }
        
        // Search through columns
        currentBoard.columns.forEach((column, columnIndex) => {
            // Search column titles
            if (column.title && searchPattern.test(column.title)) {
                results.push({
                    type: 'column',
                    columnId: column.id,
                    columnIndex: columnIndex,
                    field: 'title',
                    text: column.title
                });
            }
            
            // Search through tasks
            column.tasks.forEach((task, taskIndex) => {
                // Search task titles
                if (task.title && searchPattern.test(task.title)) {
                    results.push({
                        type: 'task',
                        columnId: column.id,
                        columnIndex: columnIndex,
                        taskId: task.id,
                        taskIndex: taskIndex,
                        field: 'title',
                        text: task.title
                    });
                }
                
                // Search task descriptions
                if (task.description && searchPattern.test(task.description)) {
                    results.push({
                        type: 'task',
                        columnId: column.id,
                        columnIndex: columnIndex,
                        taskId: task.id,
                        taskIndex: taskIndex,
                        field: 'description',
                        text: task.description
                    });
                }
            });
        });
        
        return results;
    }
    
    navigateToResult(index) {
        if (index < 0 || index >= this.searchResults.length) {
            return;
        }
        
        this.currentResultIndex = index;
        const result = this.searchResults[index];
        
        // Expand column if collapsed
        const columnElement = document.querySelector(`[data-column-id="${result.columnId}"]`);
        if (columnElement && columnElement.classList.contains('collapsed')) {
            toggleColumnCollapse(result.columnId);
        }
        
        if (result.type === 'task') {
            // Expand task if collapsed and searching description
            const taskElement = document.querySelector(`[data-task-id="${result.taskId}"]`);
            if (taskElement && taskElement.classList.contains('collapsed') && result.field === 'description') {
                toggleTaskCollapse(result.taskId);
            }
            
            // Scroll to task
            setTimeout(() => {
                taskElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        } else if (result.type === 'column') {
            // Scroll to column
            setTimeout(() => {
                columnElement?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            }, 100);
        }
        
        this.highlightCurrentResult();
        this.updateResultCounter();
    }
    
    nextResult() {
        if (this.searchResults.length === 0) {return;}
        
        const nextIndex = (this.currentResultIndex + 1) % this.searchResults.length;
        this.navigateToResult(nextIndex);
    }
    
    previousResult() {
        if (this.searchResults.length === 0) {return;}
        
        const prevIndex = this.currentResultIndex - 1 < 0 
            ? this.searchResults.length - 1 
            : this.currentResultIndex - 1;
        this.navigateToResult(prevIndex);
    }
    
    highlightAllResults() {
        this.clearHighlights();
        
        this.searchResults.forEach((result, index) => {
            const isCurrent = index === this.currentResultIndex;
            
            if (result.type === 'column') {
                const columnElement = document.querySelector(`[data-column-id="${result.columnId}"] .column-title`);
                if (columnElement) {
                    this.highlightElement(columnElement, isCurrent);
                }
            } else if (result.type === 'task') {
                if (result.field === 'title') {
                    const titleElement = document.querySelector(`[data-task-id="${result.taskId}"] .task-title-display`);
                    if (titleElement) {
                        this.highlightElement(titleElement, isCurrent);
                    }
                } else if (result.field === 'description') {
                    const descElement = document.querySelector(`[data-task-id="${result.taskId}"] .task-description-display`);
                    if (descElement) {
                        this.highlightElement(descElement, isCurrent);
                    }
                }
            }
        });
    }
    
    highlightCurrentResult() {
        // Remove previous current highlight
        document.querySelectorAll('.search-current-match').forEach(el => {
            el.classList.remove('search-current-match');
        });
        
        if (this.currentResultIndex < 0 || this.currentResultIndex >= this.searchResults.length) {
            return;
        }
        
        const result = this.searchResults[this.currentResultIndex];
        
        if (result.type === 'column') {
            const columnElement = document.querySelector(`[data-column-id="${result.columnId}"] .column-title`);
            if (columnElement) {
                columnElement.classList.add('search-current-match');
            }
        } else if (result.type === 'task') {
            if (result.field === 'title') {
                const titleElement = document.querySelector(`[data-task-id="${result.taskId}"] .task-title-display`);
                if (titleElement) {
                    titleElement.classList.add('search-current-match');
                }
            } else if (result.field === 'description') {
                const descElement = document.querySelector(`[data-task-id="${result.taskId}"] .task-description-display`);
                if (descElement) {
                    descElement.classList.add('search-current-match');
                }
            }
        }
    }
    
    highlightElement(element, isCurrent) {
        element.classList.add('search-match');
        if (isCurrent) {
            element.classList.add('search-current-match');
        }
        this.highlightedElements.push(element);
    }
    
    clearHighlights() {
        document.querySelectorAll('.search-match').forEach(el => {
            el.classList.remove('search-match', 'search-current-match');
        });
        this.highlightedElements = [];
    }
    
    updateResultCounter() {
        const counterElement = document.getElementById('search-counter');
        if (counterElement) {
            if (this.searchResults.length === 0) {
                counterElement.textContent = 'No results';
            } else {
                counterElement.textContent = `${this.currentResultIndex + 1} of ${this.searchResults.length}`;
            }
        }
    }
    
    handleSearchInput(event) {
        // Debounce search
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.performSearch();
        }, 200);
    }
}

// Create global search instance
window.kanbanSearch = new KanbanSearch();