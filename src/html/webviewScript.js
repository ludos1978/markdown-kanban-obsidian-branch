const vscode = acquireVsCodeApi()
let currentBoard = null
let editingTask = null

// Listen for messages from the extension
window.addEventListener('message', event => {
  const message = event.data
  switch (message.type) {
    case 'updateBoard':
      currentBoard = message.board
      renderBoard()
      break
  }
})

// Render Kanban board
function renderBoard() {
  if (!currentBoard) return

  const boardElement = document.getElementById('kanban-board')
  boardElement.innerHTML = ''

  // Render columns
  currentBoard.columns.forEach(column => {
    const columnElement = createColumnElement(column)
    boardElement.appendChild(columnElement)
  })

  const addColumnBtn = document.createElement('button')
  addColumnBtn.className = 'add-column-btn'
  addColumnBtn.textContent = '+ Add Column'
  addColumnBtn.onclick = () => addColumn()
  boardElement.appendChild(addColumnBtn)

  setupDragAndDrop()
}

function createColumnElement(column) {
  const columnDiv = document.createElement('div')
  columnDiv.className = 'kanban-column'
  columnDiv.setAttribute('data-column-id', column.id)

  columnDiv.innerHTML = `
    <div class="column-header" draggable="true">
      <div class="column-title-section">
        <h3 class="column-title">${escapeHtml(column.title)}</h3>
      </div>
      <div class="column-controls-menu">
        <span class="task-count">${column.tasks.length}</span>
      </div>
    </div>
    <div class="tasks-container" id="tasks-${column.id}">
      ${column.tasks.map(task => createTaskElement(task, column.id)).join('')}
    </div>
    <button class="add-task-btn" onclick="addTask('${column.id}')">
      + Add Task
    </button>
  `

  return columnDiv
}

function createTaskElement(task, columnId) {
  const renderedDescription = task.description ? renderMarkdown(task.description) : '';
  
  return `
    <div class="task-item" data-task-id="${task.id}" data-column-id="${columnId}">
      <div class="task-header">
        <div class="task-drag-handle" title="Drag to move task">⋮⋮</div>
        <div class="task-title-container">
          <textarea class="task-title" 
                   data-task-id="${task.id}" 
                   data-column-id="${columnId}"
                   data-field="title"
                   placeholder="Task title...">${escapeHtml(task.title || '')}</textarea>
        </div>
      </div>

      <div class="task-description-container">
        <div class="task-description-display markdown-content" 
             data-task-id="${task.id}" 
             data-column-id="${columnId}"
             onclick="editDescription(this)"
             style="${task.description ? '' : 'display: none;'}">${renderedDescription}</div>
        <textarea class="task-description-edit" 
                 data-task-id="${task.id}" 
                 data-column-id="${columnId}"
                 data-field="description"
                 placeholder="Add description (Markdown supported)..."
                 style="display: none;">${escapeHtml(task.description || '')}</textarea>
        ${!task.description ? `<div class="task-description-placeholder" onclick="editDescription(this, '${task.id}', '${columnId}')">Add description (Markdown supported)...</div>` : ''}
      </div>

      <div class="task-actions">
        <button class="action-btn delete" onclick="event.stopPropagation(); deleteTask('${task.id}', '${columnId}')">Delete</button>
      </div>
    </div>
  `
}

function setupDragAndDrop() {
  setupColumnDragAndDrop()
  setupTaskDragAndDrop()
  setupInlineEditing()
}

function setupInlineEditing() {
  // Setup auto-resize and save on blur for title textareas
  document.querySelectorAll('.task-title').forEach(textarea => {
    autoResize(textarea)
    
    // Auto-resize on input
    textarea.addEventListener('input', () => autoResize(textarea))
    
    // Save on blur
    textarea.addEventListener('blur', () => saveTaskField(textarea))
    
    // Save on Enter for title
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        textarea.blur()
      }
    })
    
    // Prevent drag when clicking on textarea
    textarea.addEventListener('mousedown', (e) => e.stopPropagation())
    textarea.addEventListener('click', (e) => e.stopPropagation())
  })
}

function editDescription(element, taskId = null, columnId = null) {
  // Get task info from element or parameters
  if (!taskId) {
    taskId = element.dataset.taskId || element.closest('.task-item').dataset.taskId
  }
  if (!columnId) {
    columnId = element.dataset.columnId || element.closest('.task-item').dataset.columnId
  }
  
  const taskItem = document.querySelector(`[data-task-id="${taskId}"]`)
  const displayDiv = taskItem.querySelector('.task-description-display')
  const editTextarea = taskItem.querySelector('.task-description-edit')
  const placeholder = taskItem.querySelector('.task-description-placeholder')
  
  // Hide display elements
  if (displayDiv) displayDiv.style.display = 'none'
  if (placeholder) placeholder.style.display = 'none'
  
  // Show and focus edit textarea
  editTextarea.style.display = 'block'
  autoResize(editTextarea)
  editTextarea.focus()
  
  // Setup save handlers
  const saveAndHide = () => {
    saveTaskFieldAndUpdateDisplay(editTextarea)
    editTextarea.style.display = 'none'
  }
  
  const cancelEdit = () => {
    editTextarea.style.display = 'none'
    if (editTextarea.value.trim()) {
      displayDiv.style.display = 'block'
    } else {
      placeholder.style.display = 'block'
    }
  }
  
  // Remove existing listeners
  editTextarea.onblur = null
  editTextarea.onkeydown = null
  
  // Add new listeners
  editTextarea.addEventListener('blur', saveAndHide)
  editTextarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    }
  })
  
  // Auto-resize on input
  editTextarea.addEventListener('input', () => autoResize(editTextarea))
  
  // Prevent drag when clicking
  editTextarea.addEventListener('mousedown', (e) => e.stopPropagation())
  editTextarea.addEventListener('click', (e) => e.stopPropagation())
}

function autoResize(textarea) {
  textarea.style.height = 'auto'
  textarea.style.height = Math.max(textarea.scrollHeight, textarea.classList.contains('task-title') ? 20 : 60) + 'px'
}

function saveTaskField(textarea) {
  const taskId = textarea.dataset.taskId
  const columnId = textarea.dataset.columnId
  const field = textarea.dataset.field
  const value = textarea.value.trim()

  if (!taskId || !columnId || !field) return

  // Find the current task to compare values
  const column = currentBoard?.columns.find(col => col.id === columnId)
  const task = column?.tasks.find(t => t.id === taskId)
  
  if (!task) return

  // Only save if value changed
  const currentValue = task[field] || ''
  if (currentValue === value) return

  const taskData = { ...task, [field]: value }

  vscode.postMessage({
    type: 'editTask',
    taskId: taskId,
    columnId: columnId,
    taskData: taskData
  })
}

function saveTaskFieldAndUpdateDisplay(textarea) {
  const taskId = textarea.dataset.taskId
  const columnId = textarea.dataset.columnId
  const field = textarea.dataset.field
  const value = textarea.value.trim()

  if (!taskId || !columnId || !field) return

  // Find the current task to compare values
  const column = currentBoard?.columns.find(col => col.id === columnId)
  const task = column?.tasks.find(t => t.id === taskId)
  
  if (!task) return

  // Update local state immediately for better UX
  task[field] = value

  // Update display
  const taskItem = document.querySelector(`[data-task-id="${taskId}"]`)
  if (field === 'description') {
    const displayDiv = taskItem.querySelector('.task-description-display')
    const placeholder = taskItem.querySelector('.task-description-placeholder')
    
    if (value) {
      displayDiv.innerHTML = renderMarkdown(value)
      displayDiv.style.display = 'block'
      if (placeholder) placeholder.style.display = 'none'
    } else {
      displayDiv.style.display = 'none'
      if (placeholder) placeholder.style.display = 'block'
    }
  }

  // Save to backend
  const taskData = { ...task, [field]: value }
  vscode.postMessage({
    type: 'editTask',
    taskId: taskId,
    columnId: columnId,
    taskData: taskData
  })
}

function renderMarkdown(text) {
  if (!text) return ''
  
  try {
    // Configure marked for safer rendering
    marked.setOptions({
      breaks: true,
      gfm: true,
      sanitize: false // We trust the content since it's user's own markdown
    })
    
    return marked.parse(text)
  } catch (error) {
    console.error('Error rendering markdown:', error)
    return escapeHtml(text)
  }
}

function setupTaskDragAndDrop() {
  document.querySelectorAll('.kanban-column').forEach(columnElement => {
    const columnId = columnElement.dataset.columnId
    const tasksContainer = columnElement.querySelector('.tasks-container')

    if (!tasksContainer) return

    tasksContainer.addEventListener('dragover', e => {
      e.preventDefault()
      columnElement.classList.add('drag-over')
      
      const draggingElement = document.querySelector('.task-item.dragging')
      if (draggingElement) {
        const afterElement = getDragAfterTaskElement(tasksContainer, e.clientY)
        
        tasksContainer.querySelectorAll('.task-item').forEach(task => {
          task.classList.remove('drag-insert-before', 'drag-insert-after')
        })
        
        if (afterElement == null) {
          const lastTask = tasksContainer.querySelector('.task-item:last-child')
          if (lastTask && lastTask !== draggingElement) {
            lastTask.classList.add('drag-insert-after')
          }
        } else if (afterElement !== draggingElement) {
          afterElement.classList.add('drag-insert-before')
        }
      }
    })

    tasksContainer.addEventListener('dragleave', e => {
      if (!columnElement.contains(e.relatedTarget)) {
        columnElement.classList.remove('drag-over')
        tasksContainer.querySelectorAll('.task-item').forEach(task => {
          task.classList.remove('drag-insert-before', 'drag-insert-after')
        })
      }
    })

    tasksContainer.addEventListener('drop', e => {
      e.preventDefault()
      columnElement.classList.remove('drag-over')
      
      tasksContainer.querySelectorAll('.task-item').forEach(task => {
        task.classList.remove('drag-insert-before', 'drag-insert-after')
      })

      const taskId = e.dataTransfer.getData('text/plain')
      const fromColumnId = e.dataTransfer.getData('application/column-id')

      if (taskId && fromColumnId) {
        const dropIndex = calculateDropIndex(tasksContainer, e.clientY)
        
        vscode.postMessage({
          type: 'moveTask',
          taskId: taskId,
          fromColumnId: fromColumnId,
          toColumnId: columnId,
          newIndex: dropIndex
        })
      }
    })

    columnElement.querySelectorAll('.task-drag-handle').forEach(handle => {
      setupTaskDragHandle(handle)
    })
  })
}

function calculateDropIndex(tasksContainer, clientY) {
  const tasks = Array.from(tasksContainer.children)
  let dropIndex = tasks.length

  for (let i = 0; i < tasks.length; i++) {
    const taskElement = tasks[i]
    const rect = taskElement.getBoundingClientRect()
    const taskCenter = rect.top + rect.height / 2

    if (clientY < taskCenter) {
      dropIndex = i
      break
    }
  }

  return dropIndex
}

// Setup task drag handle
function setupTaskDragHandle(handle) {
  handle.draggable = true
  
  handle.addEventListener('dragstart', e => {
    const taskItem = e.target.closest('.task-item')
    if (taskItem) {
      e.stopPropagation()
      e.dataTransfer.setData('text/plain', taskItem.dataset.taskId)
      e.dataTransfer.setData('application/column-id', taskItem.dataset.columnId)
      e.dataTransfer.effectAllowed = 'move'
      taskItem.classList.add('dragging')
    }
  })

  handle.addEventListener('dragend', e => {
    const taskItem = e.target.closest('.task-item')
    if (taskItem) {
      taskItem.classList.remove('dragging')
    }
  })

  handle.addEventListener('mousedown', e => {
    e.stopPropagation()
  })
  
  handle.addEventListener('click', e => {
    e.stopPropagation()
    e.preventDefault()
  })
}

// Setup column drag and drop
function setupColumnDragAndDrop() {
  const boardElement = document.getElementById('kanban-board')
  const columns = boardElement.querySelectorAll('.kanban-column')
  let draggedColumnId = null

  columns.forEach((column, displayIndex) => {
    const columnHeader = column.querySelector('.column-header')
    const columnId = column.getAttribute('data-column-id')

    columnHeader.addEventListener('dragstart', e => {
      draggedColumnId = columnId
      e.dataTransfer.setData('text/plain', columnId)
      e.dataTransfer.effectAllowed = 'move'
      column.classList.add('column-dragging')
    })

    columnHeader.addEventListener('dragend', e => {
      column.classList.remove('column-dragging')
      draggedColumnId = null
      columns.forEach(col => col.classList.remove('drag-over'))
    })

    column.addEventListener('dragover', e => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (draggedColumnId && draggedColumnId !== columnId) {
        column.classList.add('drag-over')
      }
    })

    column.addEventListener('dragleave', e => {
      if (!column.contains(e.relatedTarget)) {
        column.classList.remove('drag-over')
      }
    })

    column.addEventListener('drop', e => {
      e.preventDefault()
      column.classList.remove('drag-over')

      const targetColumnId = columnId

      if (draggedColumnId && draggedColumnId !== targetColumnId) {
        const fromOriginalIndex = getOriginalColumnIndex(draggedColumnId)
        const toOriginalIndex = getOriginalColumnIndex(targetColumnId)
        
        if (fromOriginalIndex !== -1 && toOriginalIndex !== -1) {
          vscode.postMessage({
            type: 'moveColumn',
            fromIndex: fromOriginalIndex,
            toIndex: toOriginalIndex
          })
        }
      }
    })
  })
}

// Get column index in original data
function getOriginalColumnIndex(columnId) {
  if (!currentBoard) return -1
  return currentBoard.columns.findIndex(col => col.id === columnId)
}

// Helper function to determine drop position for tasks
function getDragAfterTaskElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.task-item:not(.dragging)')]
  
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect()
    const offset = y - box.top - box.height / 2
    
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child }
    } else {
      return closest
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element
}

function addTask(columnId) {
  const taskData = {
    title: 'New Task',
    description: ''
  }

  vscode.postMessage({
    type: 'addTask',
    columnId: columnId,
    taskData: taskData
  })
}

function deleteTask(taskId, columnId) {
  if (confirm('Are you sure you want to delete this task?')) {
    vscode.postMessage({
      type: 'deleteTask',
      taskId: taskId,
      columnId: columnId
    })
  }
}

function showInputModal(title, message, placeholder, onConfirm) {
  document.getElementById('input-modal-title').textContent = title
  document.getElementById('input-modal-message').textContent = message
  const inputField = document.getElementById('input-modal-field')
  inputField.placeholder = placeholder
  inputField.value = ''
  document.getElementById('input-modal').style.display = 'block'

  setTimeout(() => inputField.focus(), 100)

  const confirmAction = () => {
    const value = inputField.value.trim()
    if (value) {
      closeInputModal()
      onConfirm(value)
    }
  }

  const confirmBtn = document.getElementById('input-ok-btn')
  confirmBtn.onclick = confirmAction

  inputField.onkeydown = e => {
    if (e.key === 'Enter') {
      confirmAction()
    }
  }
}

function closeInputModal() {
  document.getElementById('input-modal').style.display = 'none'
}

function addColumn() {
  showInputModal(
    'Add Column',
    'Please enter column title:',
    'Enter column title...',
    title => {
      vscode.postMessage({
        type: 'addColumn',
        title: title
      })
    }
  )
}

// Close input modal when clicking outside
document.getElementById('input-modal').addEventListener('click', e => {
  if (e.target.id === 'input-modal') {
    closeInputModal()
  }
})

// Utility function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}