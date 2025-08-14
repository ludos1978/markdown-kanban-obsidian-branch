const vscode = acquireVsCodeApi()
let currentBoard = null
let scrollPositions = new Map()

// Listen for messages from the extension
window.addEventListener('message', event => {
  const message = event.data
  switch (message.type) {
    case 'updateBoard':
      currentBoard = message.board
      renderBoard()
      break
    case 'updateBoardPreserveScroll':
      saveAllScrollPositions()
      currentBoard = message.board
      renderBoard()
      restoreAllScrollPositions()
      break
  }
})

// Save scroll positions of all task containers
function saveAllScrollPositions() {
  document.querySelectorAll('.tasks-container').forEach(container => {
    const columnId = container.id.replace('tasks-', '')
    scrollPositions.set(columnId, container.scrollTop)
  })
  
  const boardElement = document.getElementById('kanban-board')
  if (boardElement) {
    scrollPositions.set('board-h', boardElement.scrollLeft)
    scrollPositions.set('board-v', window.scrollY)
  }
}

// Restore scroll positions after rendering
function restoreAllScrollPositions() {
  setTimeout(() => {
    scrollPositions.forEach((scrollTop, columnId) => {
      if (columnId === 'board-h') {
        const boardElement = document.getElementById('kanban-board')
        if (boardElement) boardElement.scrollLeft = scrollTop
      } else if (columnId === 'board-v') {
        window.scrollTo(0, scrollTop)
      } else {
        const container = document.getElementById(`tasks-${columnId}`)
        if (container) container.scrollTop = scrollTop
      }
    })
  }, 0)
}

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

  // Add column button
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

  // Show delete button only for empty columns
  const deleteButton = column.tasks.length === 0 
    ? `<button class="column-delete-btn" onclick="deleteColumn('${column.id}')" title="Delete empty column">×</button>`
    : ''

  columnDiv.innerHTML = `
    <div class="column-header" draggable="true">
      <div class="column-title-section">
        <h3 class="column-title">${escapeHtml(column.title)}</h3>
      </div>
      <div class="column-controls-menu">
        <span class="task-count">${column.tasks.length}</span>
        ${deleteButton}
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
  const renderedDescription = task.description ? renderMarkdown(task.description) : ''
  const renderedTitle = task.title ? renderMarkdown(task.title) : ''
  
  return `
    <div class="task-item" data-task-id="${task.id}" data-column-id="${columnId}">
      <div class="task-header">
        <div class="task-drag-handle" title="Drag to move task">⋮⋮</div>
        <div class="task-title-container">
          <div class="task-title-display markdown-content" 
               data-task-id="${task.id}" 
               data-column-id="${columnId}"
               onclick="editTitle(this)">${renderedTitle || '<span class="task-title-placeholder">Add title...</span>'}</div>
          <textarea class="task-title-edit" 
                   data-task-id="${task.id}" 
                   data-column-id="${columnId}"
                   data-field="title"
                   placeholder="Task title (Markdown supported)..."
                   style="display: none;">${escapeHtml(task.title || '')}</textarea>
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
        ${!task.description ? `<div class="task-description-placeholder" onclick="editDescription(this, '${task.id}', '${columnId}')">Add description...</div>` : ''}
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
}

function editTitle(element, taskId = null, columnId = null) {
  if (!taskId) {
    taskId = element.dataset.taskId || element.closest('.task-item').dataset.taskId
  }
  if (!columnId) {
    columnId = element.dataset.columnId || element.closest('.task-item').dataset.columnId
  }
  
  const taskItem = document.querySelector(`[data-task-id="${taskId}"]`)
  const displayDiv = taskItem.querySelector('.task-title-display')
  const editTextarea = taskItem.querySelector('.task-title-edit')
  
  displayDiv.style.display = 'none'
  editTextarea.style.display = 'block'
  autoResize(editTextarea)
  editTextarea.focus()
  editTextarea.select()
  
  const saveAndHide = () => {
    saveTaskFieldAndUpdateDisplay(editTextarea, false) // Never trigger full update for inline edits
    editTextarea.style.display = 'none'
    displayDiv.style.display = 'block'
  }
  
  const cancelEdit = () => {
    // Restore original value
    const column = currentBoard?.columns.find(col => col.id === columnId)
    const task = column?.tasks.find(t => t.id === taskId)
    if (task) {
      editTextarea.value = task.title || ''
    }
    editTextarea.style.display = 'none'
    displayDiv.style.display = 'block'
  }
  
  editTextarea.onblur = saveAndHide
  editTextarea.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveAndHide()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    }
  }
  
  editTextarea.oninput = () => autoResize(editTextarea)
  editTextarea.onmousedown = (e) => e.stopPropagation()
  editTextarea.onclick = (e) => e.stopPropagation()
}

function editDescription(element, taskId = null, columnId = null) {
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
  
  if (displayDiv) displayDiv.style.display = 'none'
  if (placeholder) placeholder.style.display = 'none'
  
  editTextarea.style.display = 'block'
  autoResize(editTextarea)
  editTextarea.focus()
  
  const saveAndHide = () => {
    saveTaskFieldAndUpdateDisplay(editTextarea, false) // Never trigger full update for inline edits
    editTextarea.style.display = 'none'
  }
  
  const cancelEdit = () => {
    // Restore original value
    const column = currentBoard?.columns.find(col => col.id === columnId)
    const task = column?.tasks.find(t => t.id === taskId)
    if (task) {
      editTextarea.value = task.description || ''
    }
    
    editTextarea.style.display = 'none'
    if (editTextarea.value.trim()) {
      displayDiv.style.display = 'block'
    } else if (placeholder) {
      placeholder.style.display = 'block'
    }
  }
  
  editTextarea.onblur = saveAndHide
  editTextarea.onkeydown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    }
  }
  
  editTextarea.oninput = () => autoResize(editTextarea)
  editTextarea.onmousedown = (e) => e.stopPropagation()
  editTextarea.onclick = (e) => e.stopPropagation()
}

function autoResize(textarea) {
  textarea.style.height = 'auto'
  const minHeight = textarea.classList.contains('task-title-edit') ? 30 : 60
  textarea.style.height = Math.max(textarea.scrollHeight, minHeight) + 'px'
}

function saveTaskFieldAndUpdateDisplay(textarea, triggerFullUpdate = true) {
  const taskId = textarea.dataset.taskId
  const columnId = textarea.dataset.columnId
  const field = textarea.dataset.field
  const value = textarea.value.trim()

  if (!taskId || !columnId || !field) return

  const column = currentBoard?.columns.find(col => col.id === columnId)
  const task = column?.tasks.find(t => t.id === taskId)
  if (!task) return

  // Check if value actually changed
  const oldValue = task[field] || ''
  if (oldValue === value) return // No change, no need to save

  // Update local state immediately
  task[field] = value

  // Update display immediately (no waiting for backend)
  const taskItem = document.querySelector(`[data-task-id="${taskId}"]`)
  
  if (field === 'title') {
    const displayDiv = taskItem.querySelector('.task-title-display')
    displayDiv.innerHTML = value ? renderMarkdown(value) : '<span class="task-title-placeholder">Add title...</span>'
  } else if (field === 'description') {
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

  // Save to backend silently (no UI update needed since we already updated locally)
  vscode.postMessage({
    type: 'editTaskNoUpdate',
    taskId: taskId,
    columnId: columnId,
    taskData: { ...task }
  })
}

function renderMarkdown(text) {
  if (!text) return ''
  
  try {
    marked.setOptions({
      breaks: true,
      gfm: true,
      sanitize: false
    })
    
    const rendered = marked.parse(text)
    
    // For single line content, remove wrapping <p> tags
    if (!text.includes('\n') && rendered.startsWith('<p>') && rendered.endsWith('</p>\n')) {
      return rendered.slice(3, -5)
    }
    
    return rendered
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
  
  for (let i = 0; i < tasks.length; i++) {
    const rect = tasks[i].getBoundingClientRect()
    if (clientY < rect.top + rect.height / 2) {
      return i
    }
  }
  
  return tasks.length
}

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

  handle.addEventListener('mousedown', e => e.stopPropagation())
  handle.addEventListener('click', e => {
    e.stopPropagation()
    e.preventDefault()
  })
}

function setupColumnDragAndDrop() {
  const boardElement = document.getElementById('kanban-board')
  const columns = boardElement.querySelectorAll('.kanban-column')
  let draggedColumnId = null

  columns.forEach(column => {
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

      if (draggedColumnId && draggedColumnId !== columnId) {
        const fromIndex = getOriginalColumnIndex(draggedColumnId)
        const toIndex = getOriginalColumnIndex(columnId)
        
        if (fromIndex !== -1 && toIndex !== -1) {
          vscode.postMessage({
            type: 'moveColumn',
            fromIndex: fromIndex,
            toIndex: toIndex
          })
        }
      }
    })
  })
}

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

function getOriginalColumnIndex(columnId) {
  if (!currentBoard) return -1
  return currentBoard.columns.findIndex(col => col.id === columnId)
}

function addTask(columnId) {
  const taskData = {
    title: '',
    description: ''
  }

  vscode.postMessage({
    type: 'addTask',
    columnId: columnId,
    taskData: taskData
  })

  // Focus on the new task's title after it's created
  setTimeout(() => {
    const column = document.querySelector(`[data-column-id="${columnId}"]`)
    const lastTask = column?.querySelector('.task-item:last-child .task-title-display')
    if (lastTask) {
      lastTask.click()
    }
  }, 100)
}

function deleteTask(taskId, columnId) {
  if (confirm('Delete this task? (You can undo with Ctrl+Z)')) {
    vscode.postMessage({
      type: 'deleteTask',
      taskId: taskId,
      columnId: columnId
    })
  }
}

function deleteColumn(columnId) {
  const column = currentBoard?.columns.find(col => col.id === columnId)
  if (column && column.tasks.length === 0) {
    if (confirm(`Delete empty column "${column.title}"? (You can undo with Ctrl+Z)`)) {
      vscode.postMessage({
        type: 'deleteColumn',
        columnId: columnId
      })
    }
  }
}

function addColumn() {
  showInputModal(
    'Add Column',
    'Enter column title:',
    'Column title...',
    title => {
      vscode.postMessage({
        type: 'addColumn',
        title: title
      })
    }
  )
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
    } else if (e.key === 'Escape') {
      closeInputModal()
    }
  }
}

function closeInputModal() {
  document.getElementById('input-modal').style.display = 'none'
}

// Close modal when clicking outside
document.getElementById('input-modal').addEventListener('click', e => {
  if (e.target.id === 'input-modal') {
    closeInputModal()
  }
})

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}