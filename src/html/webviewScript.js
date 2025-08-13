const vscode = acquireVsCodeApi()
let currentBoard = null
let expandedTasks = new Set()
let currentEditingTask = null
let currentEditingColumn = null
let isEditMode = false
let currentTagFilter = ''
let currentSort = 'none'

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

// Calculate deadline remaining time
function getDeadlineInfo (dueDate) {
  if (!dueDate) return null

  const today = new Date()
  const deadline = new Date(dueDate)
  const diffTime = deadline - today
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  let status, text
  if (diffDays < 0) {
    status = 'overdue'
    text = `Overdue ${Math.abs(diffDays)} days`
  } else if (diffDays === 0) {
    status = 'urgent'
    text = 'Due today'
  } else if (diffDays === 1) {
    status = 'urgent'
    text = 'Due tomorrow'
  } else if (diffDays <= 3) {
    status = 'upcoming'
    text = `${diffDays} days left`
  } else {
    status = 'normal'
    text = `${diffDays} days left`
  }

  return { status, text, days: diffDays }
}

// Render Kanban board based on filter conditions and sorting settings
function renderBoard () {
  if (!currentBoard) return

  const boardElement = document.getElementById('kanban-board')
  boardElement.innerHTML = ''

  // Separate archived and non-archived columns, maintaining original order
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
  
  // If there are archived columns, create a unified archive column
  if (archivedColumns.length > 0) {
    const unifiedArchiveColumn = createUnifiedArchiveColumn(archivedColumns)
    boardElement.appendChild(unifiedArchiveColumn)
  }

  const controlsContainer = createControlsContainer()
  boardElement.appendChild(controlsContainer)

  setupDragAndDrop()
  setupTaskExpansionEvents()
}

function createControlsContainer() {
  const controlsContainer = document.createElement('div')
  controlsContainer.className = 'board-controls'

  const showFiltersBtn = document.createElement('button')
  showFiltersBtn.className = 'show-filters-btn'
  showFiltersBtn.textContent = 'Show Filters'
  showFiltersBtn.onclick = () => toggleFilters(true)
  showFiltersBtn.id = 'show-filters-dynamic'

  const addColumnBtn = document.createElement('button')
  addColumnBtn.className = 'add-column-btn'
  addColumnBtn.textContent = '+ Add Column'
  addColumnBtn.onclick = () => addColumn()

  controlsContainer.appendChild(showFiltersBtn)
  controlsContainer.appendChild(addColumnBtn)

  const header = document.getElementById('kanban-header')
  if (header?.classList.contains('visible')) {
    showFiltersBtn.style.display = 'none'
  }

  return controlsContainer
}

function createColumnElement (column) {
  const columnDiv = document.createElement('div')
  columnDiv.className = 'kanban-column'
  columnDiv.setAttribute('data-column-id', column.id)

  const filteredTasks = filterTasks(column.tasks)
  const sortedTasks = sortTasks(filteredTasks)

  // Archive columns default to collapsed
  const isArchived = column.archived || false
  const isCollapsed = isArchived
  
  if (isArchived) {
    columnDiv.classList.add('archived')
  }
  if (isCollapsed) {
    columnDiv.classList.add('collapsed')
  }

  columnDiv.innerHTML = `
        <div class="column-header" draggable="true">
            <div class="column-title-section">
                <h3 class="column-title">${column.title}${isArchived ? ' [Archived]' : ''}</h3>
            </div>
            <div class="column-controls-menu">
                <span class="task-count">${sortedTasks.length}</span>
                <button class="archive-toggle-btn" onclick="toggleColumnArchive('${column.id}')" 
                        title="${isArchived ? 'Unarchive' : 'Archive'}">
                    ${isArchived ? '📂' : '📁'}
                </button>
            </div>
        </div>
        <div class="tasks-container" id="tasks-${column.id}">
            ${sortedTasks.map(task => createTaskElement(task, column.id)).join('')}
        </div>
        <button class="add-task-btn" onclick="openTaskModal('${column.id}')">
            + Add Task
        </button>
    `

  return columnDiv
}

function createTaskElement (task, columnId) {
  const isExpanded = getTaskExpansionState(task)
  const priorityClass = task.priority ? `priority-${task.priority}` : ''
  const deadlineInfo = getDeadlineInfo(task.dueDate)

  return `
        <div class="task-item ${isExpanded ? 'expanded' : ''}"
             data-task-id="${task.id}"
             data-column-id="${columnId}">
            <div class="task-header">
                <div class="task-drag-handle" title="Drag to move task">⋮⋮</div>
                <div class="task-title">${task.title}</div>
                <div class="task-meta">
                    ${createPriorityElement(task.priority, priorityClass)}
                </div>
            </div>

            ${createTaskTagsRow(task, deadlineInfo)}
            ${createTaskDetails(task, columnId)}
            ${createTaskActions(task.id, columnId)}
        </div>
    `
}

function getTaskExpansionState(task) {
  let isExpanded = expandedTasks.has(task.id)
  if (!expandedTasks.has(task.id) && !expandedTasks.has(`manually_toggled_${task.id}`)) {
    isExpanded = task.defaultExpanded === true
    if (isExpanded) {
      expandedTasks.add(task.id)
    }
  }
  return isExpanded
}

function createPriorityElement(priority, priorityClass) {
  return priority
    ? `<div class="task-priority ${priorityClass}" title="Priority: ${getPriorityText(priority)}"></div>`
    : ''
}

function createTaskTagsRow(task, deadlineInfo) {
  const hasTagsOrWorkload = task.workload || (task.tags && task.tags.length > 0)
  if (!hasTagsOrWorkload && !deadlineInfo) return ''

  return `
    <div class="task-tags-row">
        ${hasTagsOrWorkload ? createTaskTagsElement(task) : ''}
        ${deadlineInfo ? createDeadlineElement(deadlineInfo, task.dueDate) : ''}
    </div>
  `
}

function createTaskTagsElement(task) {
  const workloadTag = task.workload 
    ? `<span class="task-tag workload-tag workload-${task.workload.toLowerCase()}">${task.workload}</span>`
    : ''
  const tags = task.tags && task.tags.length > 0 
    ? task.tags.map(tag => `<span class="task-tag">${tag}</span>`).join('')
    : ''

  return `<div class="task-tags">${workloadTag}${tags}</div>`
}

function createDeadlineElement(deadlineInfo, dueDate) {
  return `<div class="task-deadline deadline-${deadlineInfo.status}" title="Due date: ${dueDate}">${deadlineInfo.text}</div>`
}

function createTaskDetails(task, columnId) {
  const description = task.description 
    ? `<div class="task-description">${task.description}</div>`
    : ''
  
  const info = createTaskInfoElement(task)

  return `
    <div class="task-details">
        ${description}
        ${info}
    </div>
  `
}

function createTaskInfoElement(task) {
  const dueInfo = task.dueDate
    ? `<div class="task-info-item">
         <span class="task-info-label">Due:</span>
         <span>${task.dueDate}</span>
       </div>`
    : ''

  const workloadInfo = task.workload
    ? `<div class="task-info-item">
         <span class="task-info-label">Workload:</span>
         <span class="task-workload workload-${task.workload.toLowerCase()}">${task.workload}</span>
       </div>`
    : ''

  return `<div class="task-info">${dueInfo}${workloadInfo}</div>`
}

function createTaskActions(taskId, columnId) {
  return `
    <div class="task-actions">
        <button class="action-btn" onclick="event.stopPropagation(); editTask('${taskId}', '${columnId}')">Edit</button>
        <button class="action-btn delete" onclick="event.stopPropagation(); deleteTask('${taskId}', '${columnId}')">Delete</button>
    </div>
  `
}

// Filter tasks
function filterTasks (tasks) {
  if (!currentTagFilter) return tasks

  const filterTags = currentTagFilter
    .toLowerCase()
    .split(',')
    .map(tag => tag.trim())
    .filter(tag => tag)
  
  if (filterTags.length === 0) return tasks

  return tasks.filter(task => {
    const allTags = []
    if (task.workload) {
      allTags.push(task.workload.toLowerCase())
    }
    if (task.tags && task.tags.length > 0) {
      allTags.push(...task.tags.map(tag => tag.toLowerCase()))
    }
    
    if (allTags.length === 0) return false
    
    return filterTags.some(filterTag =>
      allTags.some(taskTag => taskTag.includes(filterTag))
    )
  })
}

// Sort tasks
function sortTasks (tasks) {
  const sorted = [...tasks]
  const priorityOrder = { high: 3, medium: 2, low: 1 }
  const workloadOrder = { Extreme: 4, Hard: 3, Normal: 2, Easy: 1 }

  switch (currentSort) {
    case 'title':
      return sorted.sort((a, b) => a.title.localeCompare(b.title))
    case 'deadline':
      return sorted.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        return new Date(a.dueDate) - new Date(b.dueDate)
      })
    case 'priority':
      return sorted.sort((a, b) => {
        const aPriority = priorityOrder[a.priority] || 0
        const bPriority = priorityOrder[b.priority] || 0
        return bPriority - aPriority
      })
    case 'workload':
      return sorted.sort((a, b) => {
        const aWorkload = workloadOrder[a.workload] || 0
        const bWorkload = workloadOrder[b.workload] || 0
        return bWorkload - aWorkload
      })
    case 'tags':
      return sorted.sort((a, b) => {
        const aTag = a.tags && a.tags[0] ? a.tags[0] : ''
        const bTag = b.tags && b.tags[0] ? b.tags[0] : ''
        return aTag.localeCompare(bTag)
      })
    default:
      return sorted
  }
}

function getPriorityText (priority) {
  const priorityMap = {
    high: 'High',
    medium: 'Medium',
    low: 'Low'
  }
  return priorityMap[priority] || ''
}

function toggleTaskExpansion (taskId) {
  expandedTasks.add(`manually_toggled_${taskId}`)
  
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
        const dropIndex = calculateDropIndex(tasksContainer, e.clientY, fromColumnId, columnId)
        
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

function calculateDropIndex(tasksContainer, clientY, fromColumnId, toColumnId) {
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

  if (fromColumnId === toColumnId) {
    const draggedTaskElement = tasksContainer.querySelector('[data-task-id="' + e.dataTransfer.getData('text/plain') + '"]')
    if (draggedTaskElement) {
      const currentIndex = Array.from(tasks).indexOf(draggedTaskElement)
      if (dropIndex > currentIndex) {
        dropIndex--
      }
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
  const ignoredSelectors = [
    '.task-drag-handle',
    '.action-btn',
    'input[type="checkbox"]'
  ]
  
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
      
      const dragImage = createDragImage(taskItem, e.offsetX, e.offsetY)
      e.dataTransfer.setDragImage(dragImage, e.offsetX, e.offsetY)
      
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

function createDragImage(taskItem, offsetX, offsetY) {
  const dragImage = taskItem.cloneNode(true)
  dragImage.style.transform = 'rotate(3deg)'
  dragImage.style.opacity = '0.8'
  dragImage.style.position = 'absolute'
  dragImage.style.top = '-1000px'
  dragImage.style.width = taskItem.offsetWidth + 'px'
  document.body.appendChild(dragImage)
  
  setTimeout(() => document.body.removeChild(dragImage), 0)
  
  return dragImage
}

// Setup column drag and drop
function setupColumnDragAndDrop () {
  const boardElement = document.getElementById('kanban-board')
  const columns = boardElement.querySelectorAll('.kanban-column:not(.unified-archive)')
  let draggedColumnId = null
  let draggedColumnIndex = -1

  columns.forEach((column, displayIndex) => {
    const columnHeader = column.querySelector('.column-header')
    const columnId = column.getAttribute('data-column-id')

    // Skip unified archive column
    if (columnId === 'unified-archive') return

    columnHeader.addEventListener('dragstart', e => {
      draggedColumnId = columnId
      draggedColumnIndex = displayIndex
      e.dataTransfer.setData('text/plain', columnId)
      e.dataTransfer.effectAllowed = 'move'
      column.classList.add('column-dragging')
    })

    columnHeader.addEventListener('dragend', e => {
      column.classList.remove('column-dragging')
      draggedColumnId = null
      draggedColumnIndex = -1
      columns.forEach(col => col.classList.remove('drag-over'))
    })

    column.addEventListener('dragover', e => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (draggedColumnId && draggedColumnId !== columnId) {
        // Only allow dragging between normal columns (since archived columns are now unified)
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
      const targetDisplayIndex = displayIndex

      if (draggedColumnId && draggedColumnId !== targetColumnId) {
        // Only allow dragging between normal columns
        const draggedColumn = currentBoard.columns.find(col => col.id === draggedColumnId)
        const targetColumn = currentBoard.columns.find(col => col.id === targetColumnId)
        
        if (draggedColumn && targetColumn && 
            !draggedColumn.archived && !targetColumn.archived) {
          
          // Convert display index to original data index
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

// Get column's index in original data
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

// Create unified archive column
function createUnifiedArchiveColumn(archivedColumns) {
  const columnDiv = document.createElement('div')
  columnDiv.className = 'kanban-column archived unified-archive'
  columnDiv.setAttribute('data-column-id', 'unified-archive')
  
  // Count all archived tasks
  const totalArchivedTasks = archivedColumns.reduce((total, column) => {
    return total + filterTasks(column.tasks).length
  }, 0)
  
  // Default to collapsed state
  columnDiv.classList.add('collapsed')
  
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
    const filteredTasks = filterTasks(column.tasks)
    const sortedTasks = sortTasks(filteredTasks)
    
    // Show all archived columns, whether they have tasks or not
    content += `
      <div class="archive-section">
        <div class="archive-section-header">
          <div class="archive-section-info">
            <h4 class="archive-section-title">${column.title}</h4>
            <span class="archive-section-count">${sortedTasks.length}</span>
          </div>
          <button class="unarchive-btn" onclick="unarchiveColumn('${column.id}')" title="Unarchive">
            📂
          </button>
        </div>
        ${sortedTasks.length > 0 ? `
          <div class="archive-tasks">
            ${sortedTasks.map(task => createArchiveTaskElement(task, column.id)).join('')}
          </div>
        ` : `
          <div class="archive-empty-section">No tasks in this column</div>
        `}
      </div>
    `
  })
  
  return content || '<div class="archive-empty">No archived content</div>'
}

// Create archive task element (simplified version)
function createArchiveTaskElement(task, columnId) {
  const priorityClass = task.priority ? `priority-${task.priority}` : ''
  const deadlineInfo = getDeadlineInfo(task.dueDate)
  
  return `
    <div class="archive-task-item" data-task-id="${task.id}" data-column-id="${columnId}">
      <div class="archive-task-header">
        <span class="archive-task-title">${task.title}</span>
        ${task.priority ? `<span class="task-priority ${priorityClass}" title="Priority: ${getPriorityText(task.priority)}"></span>` : ''}
      </div>
      ${deadlineInfo ? `<div class="archive-task-deadline deadline-${deadlineInfo.status}">${deadlineInfo.text}</div>` : ''}
      ${task.tags && task.tags.length > 0 ? `<div class="archive-task-tags">${task.tags.map(tag => `<span class="archive-tag">${tag}</span>`).join('')}</div>` : ''}
    </div>
  `
}

// Toggle unified archive column expand/collapse state
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
  const column = currentBoard.columns.find(col => col.id === columnId)
  if (!column) return

  vscode.postMessage({
    type: 'toggleColumnArchive',
    columnId: columnId,
    archived: false
  })
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
    populateTaskForm(columnId, taskId)
  } else {
    clearTaskForm(form)
  }

  modal.style.display = 'block'
  document.getElementById('task-title').focus()
}

function populateTaskForm(columnId, taskId) {
  const column = currentBoard.columns.find(col => col.id === columnId)
  const task = column?.tasks.find(t => t.id === taskId)

  if (!task) return

  document.getElementById('task-title').value = task.title || ''
  document.getElementById('task-description').value = task.description || ''
  document.getElementById('task-priority').value = task.priority || ''
  document.getElementById('task-workload').value = task.workload || ''
  document.getElementById('task-due-date').value = task.dueDate || ''
  document.getElementById('task-default-expanded').checked = task.defaultExpanded || false

  clearAndPopulateTags(task.tags)
}

function clearTaskForm(form) {
  form.reset()
  clearAndPopulateTags([])
}

function clearAndPopulateTags(tags) {
  const tagsContainer = document.getElementById('tags-container')
  tagsContainer.querySelectorAll('.tag-item').forEach(tag => tag.remove())
  
  if (tags) {
    tags.forEach(tag => addTagToContainer(tag))
  }
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

function toggleFilters (show) {
  const header = document.getElementById('kanban-header')
  const staticShowBtn = document.getElementById('show-filters')
  const dynamicShowBtn = document.getElementById('show-filters-dynamic')
  const body = document.body

  if (show) {
    header.classList.add('visible')
    body.classList.add('filters-visible')
    if (staticShowBtn) staticShowBtn.style.display = 'none'
    if (dynamicShowBtn) dynamicShowBtn.style.display = 'none'
  } else {
    header.classList.remove('visible')
    body.classList.remove('filters-visible')
    if (staticShowBtn) staticShowBtn.style.display = 'block'
    if (dynamicShowBtn) dynamicShowBtn.style.display = 'block'
  }
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
  // If it's the unified archive column, don't allow toggling
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

// Tag input handling
function setupTagsInput () {
  const tagsInput = document.getElementById('tags-input')
  const tagsContainer = document.getElementById('tags-container')

  const autocompleteList = document.createElement('div')
  autocompleteList.className = 'tags-autocomplete-list'
  autocompleteList.style.display = 'none'
  tagsContainer.appendChild(autocompleteList)

  let selectedIndex = -1

  tagsInput.addEventListener('input', e => {
    const inputValue = e.target.value.trim()
    if (inputValue.length > 0) {
      showAutocompleteSuggestions(inputValue, autocompleteList, tagsInput)
    } else {
      hideAutocompleteSuggestions(autocompleteList)
    }
    selectedIndex = -1
  })

  tagsInput.addEventListener('keydown', e => {
    const suggestions = autocompleteList.querySelectorAll('.autocomplete-item')
    
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      
      let tagToAdd = ''
      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        tagToAdd = suggestions[selectedIndex].textContent
      } else {
        tagToAdd = tagsInput.value.trim()
      }
      
      if (tagToAdd) {
        addTagToContainer(tagToAdd)
        tagsInput.value = ''
        hideAutocompleteSuggestions(autocompleteList)
        selectedIndex = -1
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (suggestions.length > 0) {
        selectedIndex = Math.min(selectedIndex + 1, suggestions.length - 1)
        updateSelectedSuggestion(suggestions, selectedIndex)
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (suggestions.length > 0) {
        selectedIndex = Math.max(selectedIndex - 1, -1)
        updateSelectedSuggestion(suggestions, selectedIndex)
      }
    } else if (e.key === 'Escape') {
      hideAutocompleteSuggestions(autocompleteList)
      selectedIndex = -1
    }
  })

  document.addEventListener('click', e => {
    if (!tagsContainer.contains(e.target)) {
      hideAutocompleteSuggestions(autocompleteList)
      selectedIndex = -1
    }
  })
}

function getAllExistingTags() {
  const allTags = new Set()
  
  if (currentBoard?.columns) {
    currentBoard.columns.forEach(column => {
      column.tasks.forEach(task => {
        if (task.tags?.length > 0) {
          task.tags.forEach(tag => {
            if (tag?.trim()) {
              allTags.add(tag.trim())
            }
          })
        }
      })
    })
  }
  
  return Array.from(allTags).sort()
}

function showAutocompleteSuggestions(inputValue, autocompleteList, tagsInput) {
  const allTags = getAllExistingTags()
  const currentTags = getFormTags()
  
  const filteredTags = allTags.filter(tag => 
    tag.toLowerCase().startsWith(inputValue.toLowerCase()) && 
    !currentTags.includes(tag)
  )
  
  if (filteredTags.length === 0) {
    hideAutocompleteSuggestions(autocompleteList)
    return
  }
  
  autocompleteList.innerHTML = ''
  
  filteredTags.forEach((tag, index) => {
    const item = document.createElement('div')
    item.className = 'autocomplete-item'
    item.textContent = tag
    item.addEventListener('click', () => {
      addTagToContainer(tag)
      tagsInput.value = ''
      hideAutocompleteSuggestions(autocompleteList)
    })
    autocompleteList.appendChild(item)
  })
  
  autocompleteList.style.display = 'block'
}

function hideAutocompleteSuggestions(autocompleteList) {
  autocompleteList.style.display = 'none'
  autocompleteList.innerHTML = ''
}

function updateSelectedSuggestion(suggestions, selectedIndex) {
  suggestions.forEach((item, index) => {
    if (index === selectedIndex) {
      item.classList.add('selected')
    } else {
      item.classList.remove('selected')
    }
  })
}

function addTagToContainer (tagText) {
  const tagsContainer = document.getElementById('tags-container')
  const tagsInput = document.getElementById('tags-input')

  // Check if tag already exists
  const existingTags = Array.from(
    tagsContainer.querySelectorAll('.tag-item')
  ).map(tag => tag.textContent.replace('×', '').trim())

  if (existingTags.includes(tagText)) {
    return
  }

  const tagElement = document.createElement('div')
  tagElement.className = 'tag-item'
  tagElement.innerHTML = `
        ${tagText}
        <button type="button" class="tag-remove" onclick="removeTag(this)">×</button>
    `

  tagsContainer.insertBefore(tagElement, tagsInput)
}

function removeTag (button) {
  button.parentElement.remove()
}

function getFormTags () {
  const tagsContainer = document.getElementById('tags-container')
  return Array.from(tagsContainer.querySelectorAll('.tag-item')).map(tag =>
    tag.textContent.replace('×', '').trim()
  )
}

// Filter and sort event listeners
document.addEventListener('DOMContentLoaded', () => {
  setupTagsInput()

  // Tag filtering
  document.getElementById('tag-filter').addEventListener('input', e => {
    currentTagFilter = e.target.value
    renderBoard()
  })

  // Sorting
  document.getElementById('sort-select').addEventListener('change', e => {
    currentSort = e.target.value
    renderBoard()
  })

  // Clear filters
  document.getElementById('clear-filters').addEventListener('click', () => {
    document.getElementById('tag-filter').value = ''
    document.getElementById('sort-select').value = 'none'
    currentTagFilter = ''
    currentSort = 'none'
    renderBoard()
  })

  // Show filters (using event delegation for dynamically created button)
  document.addEventListener('click', e => {
    if (e.target && e.target.id === 'show-filters-dynamic') {
      toggleFilters(true)
    }
  })

  // Hide filters
  document.getElementById('hide-filters').addEventListener('click', () => {
    toggleFilters(false)
  })
})

// Form submission handling
document.getElementById('task-form').addEventListener('submit', e => {
  e.preventDefault()

  const taskData = {
    title: document.getElementById('task-title').value.trim(),
    description: document.getElementById('task-description').value.trim(),
    priority: document.getElementById('task-priority').value || undefined,
    workload: document.getElementById('task-workload').value || undefined,
    dueDate: document.getElementById('task-due-date').value || undefined,
    defaultExpanded: document.getElementById('task-default-expanded').checked,
    tags: getFormTags()
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