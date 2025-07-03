console.log('TEST SCRIPT WORKING')

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
  const priorityOrder = { high: 3, medium: 2, low: 1 }

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

// Calculate steps progress
function getStepsProgress (steps) {
  if (!steps || steps.length === 0) {
    return { completed: 0, total: 0 }
  }
  
  const completed = steps.filter(step => step.completed).length
  return { completed, total: steps.length }
}

// Render Kanban board based on filter conditions and sorting settings
function renderBoard () {
  if (!currentBoard) return

  const boardElement = document.getElementById('kanban-board')
  boardElement.innerHTML = ''

  // Sort columns if needed
  let columns = [...currentBoard.columns]

  columns.forEach(column => {
    const columnElement = createColumnElement(column)
    boardElement.appendChild(columnElement)
  })

  // Add control buttons container
  const controlsContainer = document.createElement('div')
  controlsContainer.className = 'board-controls'

  // Add show filters button
  const showFiltersBtn = document.createElement('button')
  showFiltersBtn.className = 'show-filters-btn'
  showFiltersBtn.textContent = 'Show Filters'
  showFiltersBtn.onclick = () => toggleFilters(true)
  showFiltersBtn.id = 'show-filters-dynamic'

  // Add new column button
  const addColumnBtn = document.createElement('button')
  addColumnBtn.className = 'add-column-btn'
  addColumnBtn.textContent = '+ Add Column'
  addColumnBtn.onclick = () => addColumn()

  controlsContainer.appendChild(showFiltersBtn)
  controlsContainer.appendChild(addColumnBtn)
  boardElement.appendChild(controlsContainer)

  // Check if filters are currently visible and hide button accordingly
  const header = document.getElementById('kanban-header')
  if (header && header.classList.contains('visible')) {
    showFiltersBtn.style.display = 'none'
  }

  // Setup column drag and drop
  setupColumnDragAndDrop()
  
  // Setup steps drag and drop
  setupTaskStepsDragAndDrop()
  
  // Setup task expansion event delegation
  setupTaskExpansionEvents()
}

function createColumnElement (column) {
  const columnDiv = document.createElement('div')
  columnDiv.className = 'kanban-column'
  columnDiv.setAttribute('data-column-id', column.id)

  // Filter and sort tasks
  let filteredTasks = filterTasks(column.tasks)
  let sortedTasks = sortTasks(filteredTasks)

  columnDiv.innerHTML = `
        <div class="column-header" draggable="true">
            <div>
                <h3 class="column-title">${column.title}</h3>
            </div>
            <div class="column-controls-menu">
                <span class="task-count">${sortedTasks.length}</span>
            </div>
        </div>
        <div class="tasks-container" id="tasks-${column.id}">
            ${sortedTasks
              .map(task => createTaskElement(task, column.id))
              .join('')}
        </div>
        <button class="add-task-btn" onclick="openTaskModal('${column.id}')">
            + Add Task
        </button>
    `

  // Add task drag and drop events
  setupTaskDragAndDrop(columnDiv, column.id)
  
  // Setup drag handles for tasks in this column
  columnDiv.querySelectorAll('.task-drag-handle').forEach(handle => {
    setupTaskDragHandle(handle)
  })

  return columnDiv
}

function createTaskElement (task, columnId) {
  // 使用 defaultExpanded 字段作为初始展开状态，如果用户没有手动切换过
  let isExpanded = expandedTasks.has(task.id)
  if (!expandedTasks.has(task.id) && !expandedTasks.has(`manually_toggled_${task.id}`)) {
    isExpanded = task.defaultExpanded === true
    if (isExpanded) {
      expandedTasks.add(task.id)
    }
  }
  const priorityClass = task.priority ? `priority-${task.priority}` : ''
  const deadlineInfo = getDeadlineInfo(task.dueDate)
  
  // 计算 steps 进度
  const stepsProgress = getStepsProgress(task.steps)

  return `
        <div class="task-item ${isExpanded ? 'expanded' : ''}"
             data-task-id="${task.id}"
             data-column-id="${columnId}">
            <div class="task-header">
                <div class="task-drag-handle" title="Drag to move task">⋮⋮</div>
                <div class="task-title">${task.title}</div>
                <div class="task-meta">
                    ${
                      stepsProgress.total > 0
                        ? `<div class="task-steps-progress" title="Steps: ${stepsProgress.completed}/${stepsProgress.total}">${stepsProgress.completed}/${stepsProgress.total}</div>`
                        : ''
                    }
                    ${
                      task.priority
                        ? `<div class="task-priority ${priorityClass}" title="Priority: ${getPriorityText(
                            task.priority
                          )}"></div>`
                        : ''
                    }
                </div>
            </div>

            ${
              (task.tags && task.tags.length > 0) || task.workload || deadlineInfo
                ? `
                <div class="task-tags-row">
                    ${
                      (task.workload || (task.tags && task.tags.length > 0))
                        ? `
                        <div class="task-tags">
                            ${task.workload ? `<span class="task-tag workload-tag workload-${task.workload.toLowerCase()}">${task.workload}</span>` : ''}
                            ${task.tags && task.tags.length > 0 
                              ? task.tags.map(tag => `<span class="task-tag">${tag}</span>`).join('')
                              : ''
                            }
                        </div>
                    `
                        : ''
                    }
                    ${
                      deadlineInfo
                        ? `<div class="task-deadline deadline-${deadlineInfo.status}" title="Due date: ${task.dueDate}">${deadlineInfo.text}</div>`
                        : ''
                    }
                </div>
            `
                : ''
            }

            <div class="task-details">
                ${
                  task.description
                    ? `<div class="task-description">${task.description}</div>`
                    : ''
                }
                ${
                  task.steps && task.steps.length > 0
                    ? `
                    <div class="task-steps">
                        <div class="task-steps-header">Steps:</div>
                        <div class="task-steps-list" data-task-id="${task.id}" data-column-id="${columnId}">
                            ${task.steps.map((step, index) => `
                                <div class="task-step-item" data-step-index="${index}">
                                    <div class="step-drag-handle">⋮⋮</div>
                                    <input type="checkbox" 
                                           ${step.completed ? 'checked' : ''} 
                                           onchange="updateTaskStep('${task.id}', '${columnId}', ${index}, this.checked)"
                                           onclick="event.stopPropagation()">
                                    <span class="task-step-text ${step.completed ? 'completed' : ''}">${step.text}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    `
                    : ''
                }
                <div class="task-info">
                    ${
                      task.dueDate
                        ? `
                        <div class="task-info-item">
                            <span class="task-info-label">Due:</span>
                            <span>${task.dueDate}</span>
                        </div>
                    `
                        : ''
                    }
                    ${
                      task.workload
                        ? `
                        <div class="task-info-item">
                            <span class="task-info-label">Workload:</span>
                            <span class="task-workload workload-${task.workload.toLowerCase()}">${task.workload}</span>
                        </div>
                    `
                        : ''
                    }
                </div>
            </div>

            <div class="task-actions">
                <button class="action-btn" onclick="event.stopPropagation(); editTask('${
                  task.id
                }', '${columnId}')">Edit</button>
                <button class="action-btn delete" onclick="event.stopPropagation(); deleteTask('${
                  task.id
                }', '${columnId}')">Delete</button>
            </div>
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
    // 创建包含workload和tags的完整标签列表
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
  // 标记任务已被手动切换
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

// Setup task drag and drop
function setupTaskDragAndDrop (columnElement, columnId) {
  const tasksContainer = columnElement.querySelector('.tasks-container')

  tasksContainer.addEventListener('dragover', e => {
    e.preventDefault()
    columnElement.classList.add('drag-over')
    
    // 显示插入位置预览
    const draggingElement = document.querySelector('.task-item.dragging')
    if (draggingElement) {
      const afterElement = getDragAfterTaskElement(tasksContainer, e.clientY)
      
      // 移除之前的插入预览
      tasksContainer.querySelectorAll('.task-item').forEach(task => {
        task.classList.remove('drag-insert-before', 'drag-insert-after')
      })
      
      if (afterElement == null) {
        // 插入到末尾
        const lastTask = tasksContainer.querySelector('.task-item:last-child')
        if (lastTask && lastTask !== draggingElement) {
          lastTask.classList.add('drag-insert-after')
        }
      } else if (afterElement !== draggingElement) {
        // 插入到指定元素之前
        afterElement.classList.add('drag-insert-before')
      }
    }
  })

  tasksContainer.addEventListener('dragleave', e => {
    if (!columnElement.contains(e.relatedTarget)) {
      columnElement.classList.remove('drag-over')
      // 清除插入预览
      tasksContainer.querySelectorAll('.task-item').forEach(task => {
        task.classList.remove('drag-insert-before', 'drag-insert-after')
      })
    }
  })

  tasksContainer.addEventListener('drop', e => {
    e.preventDefault()
    columnElement.classList.remove('drag-over')
    
    // 清除插入预览
    tasksContainer.querySelectorAll('.task-item').forEach(task => {
      task.classList.remove('drag-insert-before', 'drag-insert-after')
    })

    const taskId = e.dataTransfer.getData('text/plain')
    const fromColumnId = e.dataTransfer.getData('application/column-id')

    if (taskId && fromColumnId) {
      // Calculate the correct drop index based on mouse position
      const tasks = Array.from(tasksContainer.children)
      let dropIndex = tasks.length

      // Find the task element that should be after the dropped task
      for (let i = 0; i < tasks.length; i++) {
        const taskElement = tasks[i]
        const rect = taskElement.getBoundingClientRect()
        const taskCenter = rect.top + rect.height / 2

        if (e.clientY < taskCenter) {
          dropIndex = i
          break
        }
      }

      // If dragging within the same column, adjust the index
      if (fromColumnId === columnId) {
        const draggedTaskElement = tasksContainer.querySelector(
          '[data-task-id="' + taskId + '"]'
        )
        if (draggedTaskElement) {
          const currentIndex = Array.from(tasks).indexOf(draggedTaskElement)
          // If dropping after the current position, decrease the index by 1
          if (dropIndex > currentIndex) {
            dropIndex--
          }
        }
      }

      vscode.postMessage({
        type: 'moveTask',
        taskId: taskId,
        fromColumnId: fromColumnId,
        toColumnId: columnId,
        newIndex: dropIndex
      })
    }
  })


}

// Setup task expansion event delegation
function setupTaskExpansionEvents() {
  const boardElement = document.getElementById('kanban-board')
  
  // 移除之前的事件监听器（如果存在）
  boardElement.removeEventListener('click', handleTaskClick)
  
  // 添加事件委托
  boardElement.addEventListener('click', handleTaskClick)
}

function handleTaskClick(e) {
  // 检查点击的元素是否应该被忽略
  const ignoredSelectors = [
    '.task-drag-handle',
    '.step-drag-handle', 
    '.action-btn',
    '.task-step-item',  // 整个步骤项都被忽略
    '.task-steps',      // 整个步骤区域都被忽略
    'input[type="checkbox"]',
    '.task-step-text'
  ]
  
  // 如果点击的是需要忽略的元素，直接返回
  for (const selector of ignoredSelectors) {
    if (e.target.matches(selector) || e.target.closest(selector)) {
      return
    }
  }
  
  // 查找最近的task-item
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
      e.stopPropagation() // 防止触发列拖拽
      e.dataTransfer.setData('text/plain', taskItem.dataset.taskId)
      e.dataTransfer.setData('application/column-id', taskItem.dataset.columnId)
      e.dataTransfer.effectAllowed = 'move'
      
      // 创建拖拽预览图像
      const dragImage = taskItem.cloneNode(true)
      dragImage.style.transform = 'rotate(3deg)'
      dragImage.style.opacity = '0.8'
      dragImage.style.position = 'absolute'
      dragImage.style.top = '-1000px'
      dragImage.style.width = taskItem.offsetWidth + 'px'
      document.body.appendChild(dragImage)
      e.dataTransfer.setDragImage(dragImage, e.offsetX, e.offsetY)
      
      // 清理临时元素
      setTimeout(() => document.body.removeChild(dragImage), 0)
      
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
    // 阻止点击事件冒泡，避免触发任务展开，但不阻止拖拽
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
  const columns = boardElement.querySelectorAll('.kanban-column')
  let draggedColumnIndex = -1

  columns.forEach((column, index) => {
    const columnHeader = column.querySelector('.column-header')

    // Column drag start - listen on header
    columnHeader.addEventListener('dragstart', e => {
      draggedColumnIndex = index
      e.dataTransfer.setData('text/plain', index.toString())
      e.dataTransfer.effectAllowed = 'move'
      column.classList.add('column-dragging')
    })

    // Column drag end - listen on header
    columnHeader.addEventListener('dragend', e => {
      column.classList.remove('column-dragging')
      draggedColumnIndex = -1
      // Remove drag-over class from all columns
      columns.forEach(col => col.classList.remove('drag-over'))
    })

    // Column drag over - listen on column for drop zone
    column.addEventListener('dragover', e => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (draggedColumnIndex !== -1 && draggedColumnIndex !== index) {
        column.classList.add('drag-over')
      }
    })

    // Column drag leave
    column.addEventListener('dragleave', e => {
      if (!column.contains(e.relatedTarget)) {
        column.classList.remove('drag-over')
      }
    })

    // Column drop - listen on column
    column.addEventListener('drop', e => {
      e.preventDefault()
      column.classList.remove('drag-over')

      const fromIndex = draggedColumnIndex
      const toIndex = index

      if (fromIndex !== -1 && fromIndex !== toIndex) {
        vscode.postMessage({
          type: 'moveColumn',
          fromIndex: fromIndex,
          toIndex: toIndex
        })
      }
    })
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
    const column = currentBoard.columns.find(col => col.id === columnId)
    const task = column?.tasks.find(t => t.id === taskId)

    if (task) {
      document.getElementById('task-title').value = task.title || ''
      document.getElementById('task-description').value = task.description || ''
      document.getElementById('task-priority').value = task.priority || ''
      document.getElementById('task-workload').value = task.workload || ''
      document.getElementById('task-due-date').value = task.dueDate || ''
      document.getElementById('task-default-expanded').checked = task.defaultExpanded || false

      // Set tags
      const tagsContainer = document.getElementById('tags-container')
      const tagsInput = document.getElementById('tags-input')

      // Clear existing tags
      tagsContainer.querySelectorAll('.tag-item').forEach(tag => tag.remove())

      // Add existing tags
      if (task.tags) {
        task.tags.forEach(tag => addTagToContainer(tag))
      }

      // Clear existing steps
      const stepsList = document.getElementById('steps-list')
      stepsList.innerHTML = ''

      // Add existing steps
      if (task.steps) {
        task.steps.forEach(step => addStepToContainer(step.text, step.completed))
      }
    }
  } else {
    form.reset()
    // Clear tags
    const tagsContainer = document.getElementById('tags-container')
    tagsContainer.querySelectorAll('.tag-item').forEach(tag => tag.remove())
    
    // Clear steps
    const stepsList = document.getElementById('steps-list')
    stepsList.innerHTML = ''
  }

  // Setup modal steps drag and drop
  setTimeout(() => setupModalStepsDragAndDrop(), 100)

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

function updateTaskStep (taskId, columnId, stepIndex, completed) {
  vscode.postMessage({
    type: 'updateTaskStep',
    taskId: taskId,
    columnId: columnId,
    stepIndex: stepIndex,
    completed: completed
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

  // Focus on input field
  setTimeout(() => inputField.focus(), 100)

  const confirmBtn = document.getElementById('input-ok-btn')
  confirmBtn.onclick = () => {
    const value = inputField.value.trim()
    if (value) {
      closeInputModal()
      onConfirm(value)
    }
  }

  // Handle Enter key
  inputField.onkeydown = e => {
    if (e.key === 'Enter') {
      const value = inputField.value.trim()
      if (value) {
        closeInputModal()
        onConfirm(value)
      }
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

// Tag input handling
function setupTagsInput () {
  const tagsInput = document.getElementById('tags-input')
  const tagsContainer = document.getElementById('tags-container')

  // 创建自动补全下拉列表
  const autocompleteList = document.createElement('div')
  autocompleteList.className = 'tags-autocomplete-list'
  autocompleteList.style.display = 'none'
  tagsContainer.appendChild(autocompleteList)

  let selectedIndex = -1
  let filteredSuggestions = []

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
      
      // 如果有选中的建议，使用建议
      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        const selectedTag = suggestions[selectedIndex].textContent
        addTagToContainer(selectedTag)
        tagsInput.value = ''
        hideAutocompleteSuggestions(autocompleteList)
        selectedIndex = -1
      } else {
        // 否则使用输入的值
        const tag = tagsInput.value.trim()
        if (tag) {
          addTagToContainer(tag)
          tagsInput.value = ''
          hideAutocompleteSuggestions(autocompleteList)
        }
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

  // 点击外部时隐藏补全列表
  document.addEventListener('click', e => {
    if (!tagsContainer.contains(e.target)) {
      hideAutocompleteSuggestions(autocompleteList)
      selectedIndex = -1
    }
  })
}

// 收集当前看板中所有已存在的标签
function getAllExistingTags() {
  const allTags = new Set()
  
  if (currentBoard && currentBoard.columns) {
    currentBoard.columns.forEach(column => {
      column.tasks.forEach(task => {
        if (task.tags && task.tags.length > 0) {
          task.tags.forEach(tag => {
            if (tag && tag.trim()) {
              allTags.add(tag.trim())
            }
          })
        }
      })
    })
  }
  
  return Array.from(allTags).sort()
}

// 显示自动补全建议
function showAutocompleteSuggestions(inputValue, autocompleteList, tagsInput) {
  const allTags = getAllExistingTags()
  const currentTags = getFormTags() // 获取当前已添加的标签
  
  // 过滤出匹配的标签（前缀匹配，且不包括已添加的标签）
  const filteredTags = allTags.filter(tag => 
    tag.toLowerCase().startsWith(inputValue.toLowerCase()) && 
    !currentTags.includes(tag)
  )
  
  if (filteredTags.length === 0) {
    hideAutocompleteSuggestions(autocompleteList)
    return
  }
  
  // 清空之前的建议
  autocompleteList.innerHTML = ''
  
  // 创建建议项
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
  
  // 显示建议列表
  autocompleteList.style.display = 'block'
}

// 隐藏自动补全建议
function hideAutocompleteSuggestions(autocompleteList) {
  autocompleteList.style.display = 'none'
  autocompleteList.innerHTML = ''
}

// 更新选中的建议项样式
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

// Steps handling functions
function addStep () {
  const stepsInput = document.getElementById('steps-input')
  const stepText = stepsInput.value.trim()
  
  if (stepText) {
    addStepToContainer(stepText, false)
    stepsInput.value = ''
  }
}

function addStepToContainer (stepText, completed = false) {
  const stepsList = document.getElementById('steps-list')
  
  const stepElement = document.createElement('div')
  stepElement.className = 'step-item'
  stepElement.draggable = true
  stepElement.innerHTML = `
    <div class="step-drag-handle">⋮⋮</div>
    <input type="checkbox" ${completed ? 'checked' : ''} onchange="updateStepStatus(this)">
    <span class="step-text ${completed ? 'completed' : ''}">${stepText}</span>
    <button type="button" class="step-remove" onclick="removeStep(this)">×</button>
  `
  
  // 为整个步骤项添加事件阻止
  stepElement.addEventListener('click', e => {
    e.stopPropagation()
  })
  
  stepElement.addEventListener('mousedown', e => {
    e.stopPropagation()
  })
  
  stepsList.appendChild(stepElement)
  
  // Setup drag and drop for the new step
  setupStepDragAndDrop(stepElement)
}

function removeStep (button) {
  button.parentElement.remove()
}

function updateStepStatus (checkbox) {
  const stepText = checkbox.nextElementSibling
  if (checkbox.checked) {
    stepText.classList.add('completed')
  } else {
    stepText.classList.remove('completed')
  }
}

function getFormSteps () {
  const stepsList = document.getElementById('steps-list')
  return Array.from(stepsList.querySelectorAll('.step-item')).map(stepItem => {
    const checkbox = stepItem.querySelector('input[type="checkbox"]')
    const text = stepItem.querySelector('.step-text').textContent.trim()
    return { text, completed: checkbox.checked }
  })
}

// Setup step drag and drop for individual step items
function setupStepDragAndDrop(stepElement) {
  let longPressTimer = null
  let isDragReady = false
  
  // 长按检测
  stepElement.addEventListener('mousedown', e => {
    // 如果点击的是复选框或删除按钮，不启动拖拽
    if (e.target.matches('input[type="checkbox"]') || e.target.matches('.step-remove')) {
      return
    }
    
    e.stopPropagation()
    
    longPressTimer = setTimeout(() => {
      isDragReady = true
      stepElement.draggable = true
      stepElement.style.cursor = 'grabbing'
      // 添加视觉反馈
      stepElement.classList.add('drag-ready')
    }, 300) // 300ms长按
  })
  
  stepElement.addEventListener('mouseup', e => {
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      longPressTimer = null
    }
    
    if (!isDragReady) {
      stepElement.draggable = false
      stepElement.style.cursor = ''
      stepElement.classList.remove('drag-ready')
    }
  })
  
  stepElement.addEventListener('mouseleave', e => {
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      longPressTimer = null
    }
    
    if (!isDragReady) {
      stepElement.draggable = false
      stepElement.style.cursor = ''
      stepElement.classList.remove('drag-ready')
    }
  })
  
  stepElement.addEventListener('dragstart', e => {
    if (!isDragReady) {
      e.preventDefault()
      return
    }
    
    e.stopPropagation()
    e.dataTransfer.setData('text/plain', stepElement.dataset.stepIndex || Array.from(stepElement.parentNode.children).indexOf(stepElement))
    e.dataTransfer.setData('application/step-element', 'true')
    e.dataTransfer.effectAllowed = 'move'
    
    // 创建拖拽预览图像
    const dragImage = stepElement.cloneNode(true)
    dragImage.style.transform = 'rotate(2deg)'
    dragImage.style.opacity = '0.8'
    dragImage.style.position = 'absolute'
    dragImage.style.top = '-1000px'
    dragImage.style.width = stepElement.offsetWidth + 'px'
    document.body.appendChild(dragImage)
    e.dataTransfer.setDragImage(dragImage, e.offsetX, e.offsetY)
    
    // 清理临时元素
    setTimeout(() => document.body.removeChild(dragImage), 0)
    
    stepElement.classList.add('dragging')
    stepElement.classList.remove('drag-ready')
  })

  stepElement.addEventListener('dragend', e => {
    stepElement.classList.remove('dragging', 'drag-ready')
    stepElement.draggable = false
    stepElement.style.cursor = ''
    isDragReady = false
  })
  
  // 拖拽手柄的特殊处理 - 立即启动拖拽
  const dragHandle = stepElement.querySelector('.step-drag-handle')
  if (dragHandle) {
    dragHandle.addEventListener('mousedown', e => {
      e.stopPropagation()
      // 立即启动拖拽模式
      isDragReady = true
      stepElement.draggable = true
      stepElement.style.cursor = 'grabbing'
      stepElement.classList.add('drag-ready')
    })
    
    dragHandle.addEventListener('click', e => {
      e.stopPropagation()
      e.preventDefault()
    })
  }
}

// Setup steps list drag and drop for task details view
function setupTaskStepsDragAndDrop() {
  document.querySelectorAll('.task-steps-list').forEach(stepsList => {
    const taskId = stepsList.dataset.taskId
    const columnId = stepsList.dataset.columnId
    
    stepsList.addEventListener('dragover', e => {
      e.preventDefault()
      const draggingElement = stepsList.querySelector('.dragging')
      if (!draggingElement) return
      
      // 清除之前的插入预览
      stepsList.querySelectorAll('.task-step-item').forEach(item => {
        item.classList.remove('drag-insert-before', 'drag-insert-after')
      })
      
      const afterElement = getDragAfterElement(stepsList, e.clientY)
      if (afterElement == null) {
        // 插入到末尾
        const lastStep = stepsList.querySelector('.task-step-item:last-child')
        if (lastStep && lastStep !== draggingElement) {
          lastStep.classList.add('drag-insert-after')
        }
      } else if (afterElement !== draggingElement) {
        // 插入到指定元素之前
        afterElement.classList.add('drag-insert-before')
      }
    })

    stepsList.addEventListener('drop', e => {
      e.preventDefault()
      e.stopPropagation()
      
      // 清除插入预览
      stepsList.querySelectorAll('.task-step-item').forEach(item => {
        item.classList.remove('drag-insert-before', 'drag-insert-after')
      })
      
      // 实际移动元素
      const draggingElement = stepsList.querySelector('.dragging')
      if (draggingElement) {
        const afterElement = getDragAfterElement(stepsList, e.clientY)
        if (afterElement == null) {
          stepsList.appendChild(draggingElement)
        } else {
          stepsList.insertBefore(draggingElement, afterElement)
        }
      }
      
      // Recalculate step indices and send update to backend
      const stepItems = Array.from(stepsList.querySelectorAll('.task-step-item'))
      const newStepsOrder = []
      
      stepItems.forEach((item, newIndex) => {
        const oldIndex = parseInt(item.dataset.stepIndex)
        newStepsOrder.push(oldIndex)
        item.dataset.stepIndex = newIndex
        // Update the onchange handler with new index
        const checkbox = item.querySelector('input[type="checkbox"]')
        checkbox.setAttribute('onchange', `updateTaskStep('${taskId}', '${columnId}', ${newIndex}, this.checked)`)
      })
      
      // Send reorder message to backend
      vscode.postMessage({
        type: 'reorderTaskSteps',
        taskId: taskId,
        columnId: columnId,
        newOrder: newStepsOrder
      })
    })

    // Setup drag and drop for existing step items
    stepsList.querySelectorAll('.task-step-item').forEach(setupStepDragAndDrop)
  })
}

// Setup steps list drag and drop for modal form
function setupModalStepsDragAndDrop() {
  const stepsList = document.getElementById('steps-list')
  if (!stepsList) return

  stepsList.addEventListener('dragover', e => {
    e.preventDefault()
    const draggingElement = stepsList.querySelector('.dragging')
    if (!draggingElement) return
    
    // 清除之前的插入预览
    stepsList.querySelectorAll('.step-item').forEach(item => {
      item.classList.remove('drag-insert-before', 'drag-insert-after')
    })
    
    const afterElement = getDragAfterElement(stepsList, e.clientY)
    if (afterElement == null) {
      // 插入到末尾
      const lastStep = stepsList.querySelector('.step-item:last-child')
      if (lastStep && lastStep !== draggingElement) {
        lastStep.classList.add('drag-insert-after')
      }
    } else if (afterElement !== draggingElement) {
      // 插入到指定元素之前
      afterElement.classList.add('drag-insert-before')
    }
  })

  stepsList.addEventListener('drop', e => {
    e.preventDefault()
    
    // 清除插入预览
    stepsList.querySelectorAll('.step-item').forEach(item => {
      item.classList.remove('drag-insert-before', 'drag-insert-after')
    })
    
    // 实际移动元素
    const draggingElement = stepsList.querySelector('.dragging')
    if (draggingElement) {
      const afterElement = getDragAfterElement(stepsList, e.clientY)
      if (afterElement == null) {
        stepsList.appendChild(draggingElement)
      } else {
        stepsList.insertBefore(draggingElement, afterElement)
      }
    }
    
    // No need to send backend message for modal, will be handled on form submit
  })

  // Setup drag and drop for existing step items in modal
  stepsList.querySelectorAll('.step-item').forEach(setupStepDragAndDrop)
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

// Helper function to determine drop position for steps
function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.task-step-item:not(.dragging), .step-item:not(.dragging)')]
  
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

// Setup steps input handling
function setupStepsInput () {
  const stepsInput = document.getElementById('steps-input')

  stepsInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addStep()
    }
  })
}

// Filter and sort event listeners
document.addEventListener('DOMContentLoaded', () => {
  setupTagsInput()
  setupStepsInput()

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
    tags: getFormTags(),
    steps: getFormSteps()
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
