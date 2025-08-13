const vscode = acquireVsCodeApi()
let currentBoard = null
let expandedTasks = new Set()
let currentEditingTask = null
let currentEditingColumn = null
let isEditMode = false

// Listen for messages from the extension
window.addEventListener('message', event => {
  const message = event.data
  switch (message.type) {
    case 'updateBoard':
      currentBoard = message.board
      renderBoard()
      break
    case 'toggleTaskExpansion':
      toggleTaskExpansion(message.taskId)
      break
  }
})

// Render Kanban board
function renderBoard () {
  if (!currentBoard) return

  const boardElement = document.getElementById('kanban-board')
  boardElement.innerHTML = ''

  // Separate archived and normal columns
  const normalColumns = []
  const archivedColumns = []
  
  currentBoard.columns.forEach(column => {
    if (column.archived) {
      archivedColumns.push(column)
    } else {
      normalColumns.push(column)
    }
  })
  
  // Render normal columns first
  normalColumns.forEach(column => {
    const columnElement = createColumnElement(column)
    boardElement.appendChild(columnElement)
  })
  
  // Create unified archive column if there are archived columns
  if (archivedColumns.length > 0) {
    const unifiedArchiveColumn = createUnifiedArchiveColumn(archivedColumns)
    boardElement.appendChild(unifiedArchiveColumn)
  }

  const addColumnBtn = document.createElement('button')
  addColumnBtn.className = 'add-column-btn'
  addColumnBtn.textContent = '+ Add Column'
  addColumnBtn.onclick = () => addColumn()
  boardElement.appendChild(addColumnBtn)

  setupDragAndDrop()
  setupTaskExpansionEvents()
}

function createColumnElement (column) {
  const columnDiv = document.createElement('div')
  columnDiv.className = 'kanban-column'
  columnDiv.setAttribute('data-column-id', column.id)

  const isArchived = column.archived || false
  const isCollapsed = isArchived
  
  if (isArchived) {
    columnDiv.classList.add('archived')
  }
  if (isCollapsed) {
    columnDiv.classList.add('collapsed')
  }

  // add all tasks to the expaneded list to be open by default
  column.tasks.map(task => expandedTasks.add(task.id))

  columnDiv.innerHTML = `
    <div class="column-header" draggable="true">
      <div class="column-title-section">
        <h3 class="column-title">${column.title}${isArchived ? ' [Archived]' : ''}</h3>
      </div>
      <div class="column-controls-menu">
        <span class="task-count">${column.tasks.length}</span>
        <button class="archive-toggle-btn" onclick="toggleColumnArchive('${column.id}')" 
                title="${isArchived ? 'Unarchive' : 'Archive'}">
          ${isArchived ? '📂' : '📁'}
        </button>
      </div>
    </div>
    <div class="tasks-container" id="tasks-${column.id}">
      ${column.tasks.map(task => createTaskElement(task, column.id)).join('')}
    </div>
    <button class="add-task-btn" onclick="openTaskModal('${column.id}')">
      + Add Task
    </button>
  `

  return columnDiv
}

function createTaskElement (task, columnId) {
  const isExpanded = expandedTasks.has(task.id)

  return `
    <div class="task-item ${isExpanded ? 'expanded' : ''}"
         data-task-id="${task.id}"
         data-column-id="${columnId}">
      <div class="task-header">
        <div class="task-drag-handle" title="Drag to move task">⋮⋮</div>
        <div class="task-title">${task.title}</div>
      </div>

      ${task.description ? `
        <div class="task-details">
          <div class="task-description">${task.description}</div>
        </div>
      ` : ''}

      <div class="task-actions">
        <button class="action-btn" onclick="event.stopPropagation(); editTask('${task.id}', '${columnId}')">Edit</button>
        <button class="action-btn delete" onclick="event.stopPropagation(); deleteTask('${task.id}', '${columnId}')">Delete</button>
      </div>
    </div>
  `
}

// Create unified archive column
function createUnifiedArchiveColumn(archivedColumns) {
  const columnDiv = document.createElement('div')
  columnDiv.className = 'kanban-column archived unified-archive collapsed'
  columnDiv.setAttribute('data-column-id', 'unified-archive')
  
  const totalArchivedTasks = archivedColumns.reduce((total, column) => {
    return total + column.tasks.length
  }, 0)
  
  columnDiv.innerHTML = `
    <div class="column-header">
      <div class="column-title-section">
        <h3 class="column-title">Archived (${archivedColumns.length})</h3>
        <button class="archive-expand-btn" onclick="toggleUnifiedArchive()" title="Expand/Collapse Archived Content">
          <span class="expand-icon">▶</span>
        </button>
      </div>
      <div class="column-controls-menu">
        <span class="task-count">${totalArchivedTasks}</span>
      </div>
    </div>
    <div class="archive-content" id="archive-content">
      ${createArchiveContent(archivedColumns)}
    </div>
  `
  
  return columnDiv
}

// Create archive content
function createArchiveContent(archivedColumns) {
  let content = ''
  
  archivedColumns.forEach(column => {
    content += `
      <div class="archive-section">
        <div class="archive-section-header">
          <div class="archive-section-info">
            <h4 class="archive-section-title">${column.title}</h4>
            <span class="archive-section-count">${column.tasks.length}</span>
          </div>
          <button class="unarchive-btn" onclick="unarchiveColumn('${column.id}')" title="Unarchive">
            📂
          </button>
        </div>
        ${column.tasks.length > 0 ? `
          <div class="archive-tasks">
            ${column.tasks.map(task => createArchiveTaskElement(task, column.id)).join('')}
          </div>
        ` : `
          <div class="archive-empty-section">No tasks in this column</div>
        `}
      </div>
    `
  })
  
  return content || '<div class="archive-empty">No archived content</div>'
}

// Create archive task element (simplified)
function createArchiveTaskElement(task, columnId) {
  return `
    <div class="archive-task-item" data-task-id="${task.id}" data-column-id="${columnId}">
      <div class="archive-task-header">
        <span class="archive-task-title">${task.title}</span>
      </div>
      ${task.description ? `<div class="archive-task-description">${task.description}</div>` : ''}
    </div>
  `
}

// Toggle unified archive expansion
function toggleUnifiedArchive() {
  const archiveColumn = document.querySelector('.unified-archive')
  const expandIcon = archiveColumn.querySelector('.expand-icon')
  
  if (archiveColumn.classList.contains('collapsed')) {
    archiveColumn.classList.remove('collapsed')
    expandIcon.textContent = '▼'
  } else {
    archiveColumn.classList.add('collapsed')
    expandIcon.textContent = '▶'
  }
}

// Unarchive column
function unarchiveColumn(columnId) {
  vscode.postMessage({
    type: 'toggleColumnArchive',
    columnId: columnId,
    archived: false
  })
}

function toggleTaskExpansion (taskId) {
  if (expandedTasks.has(taskId)) {
    expandedTasks.delete(taskId)
  } else {
    expandedTasks.add(taskId)
  }

  const taskElement = document.querySelector(`[data-task-id="${taskId}"]`)
  if (taskElement) {
    taskElement.classList.toggle('expanded')
  }
}

function setupDragAndDrop() {
  setupColumnDragAndDrop()
  setupTaskDragAndDrop()
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

// Setup task expansion event delegation
function setupTaskExpansionEvents() {
  const boardElement = document.getElementById('kanban-board')
  boardElement.removeEventListener('click', handleTaskClick)
  boardElement.addEventListener('click', handleTaskClick)
}

function handleTaskClick(e) {
  const ignoredSelectors = ['.task-drag-handle', '.action-btn']
  
  for (const selector of ignoredSelectors) {
    if (e.target.matches(selector) || e.target.closest(selector)) {
      return
    }
  }
  
  const taskItem = e.target.closest('.task-item')
  if (taskItem) {
    const taskId = taskItem.dataset.taskId
    if (taskId) {
      toggleTaskExpansion(taskId)
    }
  }
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
function setupColumnDragAndDrop () {
  const boardElement = document.getElementById('kanban-board')
  const columns = boardElement.querySelectorAll('.kanban-column:not(.unified-archive)')
  let draggedColumnId = null

  columns.forEach((column, displayIndex) => {
    const columnHeader = column.querySelector('.column-header')
    const columnId = column.getAttribute('data-column-id')

    if (columnId === 'unified-archive') return

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
        const draggedColumn = currentBoard.columns.find(col => col.id === draggedColumnId)
        const targetColumn = currentBoard.columns.find(col => col.id === columnId)
        
        if (draggedColumn && targetColumn && 
            !draggedColumn.archived && !targetColumn.archived) {
          column.classList.add('drag-over')
        }
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
        const draggedColumn = currentBoard.columns.find(col => col.id === draggedColumnId)
        const targetColumn = currentBoard.columns.find(col => col.id === targetColumnId)
        
        if (draggedColumn && targetColumn && 
            !draggedColumn.archived && !targetColumn.archived) {
          
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

function openTaskModal (columnId, taskId = null) {
  currentEditingColumn = columnId
  currentEditingTask = taskId
  isEditMode = !!taskId

  const modal = document.getElementById('task-modal')
  const modalTitle = document.getElementById('modal-title')
  const form = document.getElementById('task-form')

  modalTitle.textContent = isEditMode ? 'Edit Task' : 'Add Task'

  if (isEditMode && currentBoard) {
    const column = currentBoard.columns.find(col => col.id === columnId)
    const task = column?.tasks.find(t => t.id === taskId)

    if (task) {
      document.getElementById('task-title').value = task.title || ''
      document.getElementById('task-description').value = task.description || ''
    }
  } else {
    form.reset()
  }

  modal.style.display = 'block'
  document.getElementById('task-title').focus()
}

function closeTaskModal () {
  document.getElementById('task-modal').style.display = 'none'
  currentEditingTask = null
  currentEditingColumn = null
  isEditMode = false
}

function editTask (taskId, columnId) {
  openTaskModal(columnId, taskId)
}

function deleteTask (taskId, columnId) {
  showConfirmModal('Are you sure you want to delete this task?', () => {
    vscode.postMessage({
      type: 'deleteTask',
      taskId: taskId,
      columnId: columnId
    })
  })
}

function showConfirmModal (message, onConfirm) {
  document.getElementById('confirm-message').textContent = message
  document.getElementById('confirm-modal').style.display = 'block'

  const confirmBtn = document.getElementById('confirm-ok-btn')
  confirmBtn.onclick = () => {
    closeConfirmModal()
    onConfirm()
  }
}

function closeConfirmModal () {
  document.getElementById('confirm-modal').style.display = 'none'
}

function showInputModal (title, message, placeholder, onConfirm) {
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

function closeInputModal () {
  document.getElementById('input-modal').style.display = 'none'
}

function addColumn () {
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

function toggleColumnArchive(columnId) {
  if (columnId === 'unified-archive') return
  
  const column = currentBoard.columns.find(col => col.id === columnId)
  if (!column) return

  const newArchivedState = !column.archived
  
  vscode.postMessage({
    type: 'toggleColumnArchive',
    columnId: columnId,
    archived: newArchivedState
  })
}

// Form submission handling
document.getElementById('task-form').addEventListener('submit', e => {
  e.preventDefault()

  const taskData = {
    title: document.getElementById('task-title').value.trim(),
    description: document.getElementById('task-description').value.trim()
  }

  if (!taskData.title) {
    alert('Please enter a task title')
    return
  }

  if (isEditMode) {
    vscode.postMessage({
      type: 'editTask',
      taskId: currentEditingTask,
      columnId: currentEditingColumn,
      taskData: taskData
    })
  } else {
    vscode.postMessage({
      type: 'addTask',
      columnId: currentEditingColumn,
      taskData: taskData
    })
  }

  closeTaskModal()
})

// Close modal when clicking outside
document.getElementById('task-modal').addEventListener('click', e => {
  if (e.target.id === 'task-modal') {
    closeTaskModal()
  }
})

// Close confirm modal when clicking outside
document.getElementById('confirm-modal').addEventListener('click', e => {
  if (e.target.id === 'confirm-modal') {
    closeConfirmModal()
  }
})

// Close input modal when clicking outside
document.getElementById('input-modal').addEventListener('click', e => {
  if (e.target.id === 'input-modal') {
    closeInputModal()
  }
})