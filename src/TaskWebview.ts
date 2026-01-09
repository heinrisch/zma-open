import * as vscode from 'vscode';
import { Task, TaskState, snoozeTask, prioTask, resetSnooze, completeTask, changeCategory } from './Tasks';
import { sharedIndex2 } from './Index2';

export class TaskWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'taskManagementView';
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'changeCategory': {
          const task = this._findTaskById(data.taskId);
          if (task) {
            await changeCategory(task, data.newCategory);
            this.refresh();
          }
          break;
        }
        case 'snooze': {
          await snoozeTask(data.taskId, data.days);
          this.refresh();
          break;
        }
        case 'resetSnooze': {
          await resetSnooze(data.taskId);
          this.refresh();
          break;
        }
        case 'priority': {
          await prioTask(data.taskId, data.value);
          this.refresh();
          break;
        }
        case 'complete': {
          const task = this._findTaskById(data.taskId);
          if (task) {
            await completeTask(task);
            // Don't refresh immediately to allow undo
            setTimeout(() => this.refresh(), 5000);
            // Send temporary update to show completed state
            this._view?.webview.postMessage({
              type: 'taskCompleted',
              taskId: data.taskId
            });
          }
          break;
        }
        case 'undo': {
          // Task is already in TODO state in markdown, just refresh
          this.refresh();
          break;
        }
        case 'openTask': {
          const task = this._findTaskById(data.taskId);
          if (task) {
            const document = await vscode.workspace.openTextDocument(
              vscode.Uri.file(task.location.link.filePath())
            );
            const editor = await vscode.window.showTextDocument(document);
            const position = new vscode.Position(task.location.row, task.location.column);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(
              new vscode.Range(position, position),
              vscode.TextEditorRevealType.InCenter
            );
          }
          break;
        }
      }
    });

    this.refresh();
  }

  private _findTaskById(taskId: string): Task | undefined {
    const allTasks = sharedIndex2().allActiveTasks();
    return allTasks.find(t => t.id === taskId);
  }

  public refresh() {
    if (this._view) {
      this._view.webview.postMessage({ type: 'refresh' });
      this._updateWebviewContent();
    }
  }

  private _updateWebviewContent() {
    if (this._view) {
      const tasks = sharedIndex2().allActiveTasks();
      const groupedTasks = this._groupTasksByCategory(tasks);
      const categories = this._getAllCategories(tasks);
      
      this._view.webview.postMessage({
        type: 'updateTasks',
        tasks: this._serializeTasks(groupedTasks),
        categories: categories
      });
    }
  }

  private _groupTasksByCategory(tasks: Task[]): Map<string, Task[]> {
    const grouped = new Map<string, Task[]>();
    
    tasks.forEach(task => {
      const category = task.getGroup() || 'Uncategorized';
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(task);
    });

    // Sort tasks within each category by priority
    grouped.forEach((taskList) => {
      taskList.sort((a, b) => b.prio() - a.prio());
    });

    return grouped;
  }

  private _getAllCategories(tasks: Task[]): string[] {
    const categories = new Set<string>();
    tasks.forEach(task => {
      const cat = task.getGroup();
      if (cat) {
        categories.add(cat);
      }
    });
    return Array.from(categories).sort();
  }

  private _serializeTasks(groupedTasks: Map<string, Task[]>): any {
    const result: any = {};
    groupedTasks.forEach((tasks, category) => {
      result[category] = tasks.map(task => ({
        id: task.id,
        text: task.taskWithoutState,
        state: task.state,
        category: task.getGroup() || 'Uncategorized',
        priority: Math.round(task.prio() * 10) / 10,
        file: task.location.link.linkName()
      }));
    });
    return result;
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Task Management</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      font-size: 13px;
      line-height: 1.5;
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 8px;
    }

    .header {
      position: sticky;
      top: -8px;
      background-color: var(--vscode-editor-background);
      z-index: 100;
      padding: 8px 0 12px 0;
      margin-bottom: 8px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .header h2 {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--vscode-foreground);
    }

    .stats {
      display: flex;
      gap: 12px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .stat-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .stat-value {
      font-weight: 600;
      color: var(--vscode-foreground);
    }

    .category-group {
      margin-bottom: 16px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      overflow: hidden;
      background-color: var(--vscode-sideBar-background);
    }

    .category-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background-color: var(--vscode-sideBarSectionHeader-background);
      cursor: pointer;
      user-select: none;
      font-weight: 500;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .category-header:hover {
      background-color: var(--vscode-list-hoverBackground);
    }

    .category-title {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
    }

    .category-count {
      background-color: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
    }

    .collapse-icon {
      transition: transform 0.2s;
      font-size: 10px;
    }

    .collapse-icon.collapsed {
      transform: rotate(-90deg);
    }

    .task-list {
      max-height: 600px;
      overflow-y: auto;
    }

    .task-list.collapsed {
      display: none;
    }

    .task-item {
      display: flex;
      flex-direction: column;
      padding: 10px 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
      transition: background-color 0.15s;
      position: relative;
    }

    .task-item:last-child {
      border-bottom: none;
    }

    .task-item:hover {
      background-color: var(--vscode-list-hoverBackground);
    }

    .task-item.completed {
      opacity: 0.6;
    }

    .task-main {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 8px;
    }

    .task-text {
      flex: 1;
      word-break: break-word;
      cursor: pointer;
      padding: 2px 0;
    }

    .task-text:hover {
      color: var(--vscode-textLink-foreground);
    }

    .task-priority {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 32px;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      background-color: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }

    .task-priority.high {
      background-color: #dc2626;
      color: white;
    }

    .task-priority.medium {
      background-color: #f59e0b;
      color: white;
    }

    .task-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 6px;
      padding-left: 40px;
    }

    .task-file {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .task-state {
      padding: 2px 6px;
      border-radius: 3px;
      font-weight: 500;
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .task-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      padding-left: 40px;
    }

    .action-group {
      display: flex;
      gap: 2px;
      background-color: var(--vscode-button-secondaryBackground);
      border-radius: 4px;
      overflow: hidden;
    }

    .btn {
      padding: 3px 8px;
      font-size: 11px;
      border: none;
      background-color: transparent;
      color: var(--vscode-button-secondaryForeground);
      cursor: pointer;
      transition: background-color 0.15s;
      white-space: nowrap;
    }

    .btn:hover {
      background-color: var(--vscode-button-secondaryHoverBackground);
    }

    .btn:active {
      transform: translateY(1px);
    }

    .btn-primary {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      padding: 3px 10px;
      border-radius: 4px;
    }

    .btn-primary:hover {
      background-color: var(--vscode-button-hoverBackground);
    }

    .btn-success {
      background-color: #10b981;
      color: white;
      padding: 3px 10px;
      border-radius: 4px;
    }

    .btn-success:hover {
      background-color: #059669;
    }

    select.category-select {
      padding: 3px 6px;
      font-size: 11px;
      border: 1px solid var(--vscode-input-border);
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 4px;
      cursor: pointer;
      max-width: 120px;
    }

    .undo-banner {
      display: none;
      position: fixed;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      background-color: var(--vscode-notifications-background);
      border: 1px solid var(--vscode-notifications-border);
      border-radius: 6px;
      padding: 12px 16px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 1000;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .undo-banner.show {
      display: flex;
    }

    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: var(--vscode-descriptionForeground);
    }

    .empty-state-icon {
      font-size: 48px;
      margin-bottom: 12px;
      opacity: 0.5;
    }

    /* Scrollbar styling */
    .task-list::-webkit-scrollbar {
      width: 8px;
    }

    .task-list::-webkit-scrollbar-track {
      background: var(--vscode-scrollbarSlider-background);
    }

    .task-list::-webkit-scrollbar-thumb {
      background: var(--vscode-scrollbarSlider-activeBackground);
      border-radius: 4px;
    }

    .task-list::-webkit-scrollbar-thumb:hover {
      background: var(--vscode-scrollbarSlider-hoverBackground);
    }
  </style>
</head>
<body>
  <div class="header">
    <h2>📋 Tasks</h2>
    <div class="stats">
      <div class="stat-item">
        <span>Total:</span>
        <span class="stat-value" id="totalTasks">0</span>
      </div>
      <div class="stat-item">
        <span>Categories:</span>
        <span class="stat-value" id="totalCategories">0</span>
      </div>
    </div>
  </div>

  <div id="taskContainer"></div>

  <div class="undo-banner" id="undoBanner">
    <span>Task completed</span>
    <button class="btn btn-primary" onclick="undoComplete()">Undo</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let allTasks = {};
    let allCategories = [];
    let lastCompletedTaskId = null;
    let undoTimeout = null;

    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
        case 'updateTasks':
          allTasks = message.tasks;
          allCategories = message.categories;
          renderTasks();
          break;
        case 'taskCompleted':
          showUndoBanner(message.taskId);
          break;
      }
    });

    function renderTasks() {
      const container = document.getElementById('taskContainer');
      const categories = Object.keys(allTasks).sort();
      
      let totalTasks = 0;
      categories.forEach(cat => {
        totalTasks += allTasks[cat].length;
      });

      document.getElementById('totalTasks').textContent = totalTasks;
      document.getElementById('totalCategories').textContent = categories.length;

      if (totalTasks === 0) {
        container.innerHTML = \`
          <div class="empty-state">
            <div class="empty-state-icon">✓</div>
            <div>No active tasks</div>
          </div>
        \`;
        return;
      }

      container.innerHTML = '';

      categories.forEach(category => {
        const tasks = allTasks[category];
        const groupDiv = document.createElement('div');
        groupDiv.className = 'category-group';
        groupDiv.innerHTML = \`
          <div class="category-header" onclick="toggleCategory(this)">
            <div class="category-title">
              <span class="collapse-icon">▼</span>
              <span>\${escapeHtml(category)}</span>
              <span class="category-count">\${tasks.length}</span>
            </div>
          </div>
          <div class="task-list">
            \${tasks.map(task => renderTask(task)).join('')}
          </div>
        \`;
        container.appendChild(groupDiv);
      });
    }

    function renderTask(task) {
      const priorityClass = task.priority > 10 ? 'high' : task.priority > 5 ? 'medium' : '';
      
      return \`
        <div class="task-item" data-task-id="\${task.id}">
          <div class="task-main">
            <div class="task-priority \${priorityClass}">\${task.priority}</div>
            <div class="task-text" onclick="openTask('\${task.id}')">\${escapeHtml(task.text)}</div>
          </div>
          <div class="task-meta">
            <span class="task-state">\${task.state}</span>
            <span class="task-file">📄 \${escapeHtml(task.file)}</span>
          </div>
          <div class="task-actions">
            <select class="category-select" onchange="changeCategory('\${task.id}', this.value)">
              <option value="">Move to...</option>
              \${allCategories.filter(c => c !== task.category).map(cat => 
                \`<option value="\${escapeHtml(cat)}">\${escapeHtml(cat)}</option>\`
              ).join('')}
            </select>
            <div class="action-group">
              <button class="btn" onclick="snooze('\${task.id}', 1)">+1d</button>
              <button class="btn" onclick="snooze('\${task.id}', 5)">+5d</button>
              <button class="btn" onclick="snooze('\${task.id}', 7)">+7d</button>
              <button class="btn" onclick="snooze('\${task.id}', 30)">+30d</button>
              <button class="btn" onclick="resetSnooze('\${task.id}')">Reset</button>
            </div>
            <div class="action-group">
              <button class="btn" onclick="priority('\${task.id}', -10)">-10</button>
              <button class="btn" onclick="priority('\${task.id}', -5)">-5</button>
              <button class="btn" onclick="priority('\${task.id}', -1)">-1</button>
              <button class="btn" onclick="priority('\${task.id}', 1)">+1</button>
              <button class="btn" onclick="priority('\${task.id}', 5)">+5</button>
              <button class="btn" onclick="priority('\${task.id}', 10)">+10</button>
              <button class="btn" onclick="priority('\${task.id}', 0)">Reset</button>
            </div>
            <button class="btn btn-success" onclick="complete('\${task.id}')">✓ Complete</button>
          </div>
        </div>
      \`;
    }

    function toggleCategory(header) {
      const icon = header.querySelector('.collapse-icon');
      const taskList = header.nextElementSibling;
      
      icon.classList.toggle('collapsed');
      taskList.classList.toggle('collapsed');
    }

    function changeCategory(taskId, newCategory) {
      if (!newCategory) return;
      vscode.postMessage({
        type: 'changeCategory',
        taskId: taskId,
        newCategory: newCategory
      });
    }

    function snooze(taskId, days) {
      vscode.postMessage({
        type: 'snooze',
        taskId: taskId,
        days: days
      });
    }

    function resetSnooze(taskId) {
      vscode.postMessage({
        type: 'resetSnooze',
        taskId: taskId
      });
    }

    function priority(taskId, value) {
      vscode.postMessage({
        type: 'priority',
        taskId: taskId,
        value: value
      });
    }

    function complete(taskId) {
      lastCompletedTaskId = taskId;
      vscode.postMessage({
        type: 'complete',
        taskId: taskId
      });
    }

    function showUndoBanner(taskId) {
      lastCompletedTaskId = taskId;
      const banner = document.getElementById('undoBanner');
      banner.classList.add('show');

      // Mark task as completed in UI
      const taskElement = document.querySelector(\`[data-task-id="\${taskId}"]\`);
      if (taskElement) {
        taskElement.classList.add('completed');
      }

      if (undoTimeout) {
        clearTimeout(undoTimeout);
      }

      undoTimeout = setTimeout(() => {
        banner.classList.remove('show');
        lastCompletedTaskId = null;
      }, 5000);
    }

    function undoComplete() {
      if (lastCompletedTaskId) {
        vscode.postMessage({
          type: 'undo',
          taskId: lastCompletedTaskId
        });
        
        const banner = document.getElementById('undoBanner');
        banner.classList.remove('show');
        
        if (undoTimeout) {
          clearTimeout(undoTimeout);
        }
        
        lastCompletedTaskId = null;
      }
    }

    function openTask(taskId) {
      vscode.postMessage({
        type: 'openTask',
        taskId: taskId
      });
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  </script>
</body>
</html>`;
  }
}
