import * as vscode from 'vscode';
import { Task, TaskState, sharedTasks, getTaskData, snoozeTask, prioTask, resetSnooze } from './Tasks';
import { reindex2 } from './Index2';

export class TaskManagerWebViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'zma.taskManagerView';
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
        case 'refresh':
          this.refresh();
          break;
        case 'changeCategory':
          await this._changeCategory(data.taskId, data.newCategory);
          break;
        case 'snooze':
          await this._snoozeTask(data.taskId, data.days);
          break;
        case 'changePriority':
          await this._changePriority(data.taskId, data.delta);
          break;
        case 'complete':
          await this._completeTask(data.taskId);
          break;
        case 'undo':
          await this._undoComplete(data.taskId);
          break;
        case 'openTask':
          await this._openTask(data.taskId);
          break;
      }
    });

    this.refresh();
  }

  public refresh() {
    if (this._view) {
      reindex2().then(() => {
        const tasks = sharedTasks().filter(t => t.state === TaskState.Todo);
        const grouped = this._groupTasksByCategory(tasks);
        const categories = this._extractAllCategories(tasks);
        
        this._view?.webview.postMessage({
          type: 'update',
          data: { grouped, categories }
        });
      });
    }
  }

  private _groupTasksByCategory(tasks: Task[]): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};
    
    tasks.forEach(task => {
      const category = task.getGroup() || 'Uncategorized';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      
      const taskData = getTaskData(task.id);
      grouped[category].push({
        id: task.id,
        text: task.taskWithoutState,
        category: task.parseGroup(),
        priority: task.prio(),
        snoozeUntil: taskData.getSnoozeUntil().toISOString(),
        location: {
          file: task.location.link.linkName(),
          row: task.location.row
        }
      });
    });

    // Sort tasks within each category by priority
    Object.keys(grouped).forEach(category => {
      grouped[category].sort((a, b) => b.priority - a.priority);
    });

    return grouped;
  }

  private _extractAllCategories(tasks: Task[]): string[] {
    const categories = new Set<string>();
    tasks.forEach(task => {
      const cat = task.parseGroup();
      if (cat) categories.add(cat);
    });
    return Array.from(categories).sort();
  }

  private async _changeCategory(taskId: string, newCategory: string) {
    const tasks = sharedTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const uri = vscode.Uri.file(task.location.link.filePath());
    const document = await vscode.workspace.openTextDocument(uri);
    const line = document.lineAt(task.location.row);
    
    const oldText = line.text;
    const newText = oldText.replace(
      /- TODO(\/[^\s]+)?/,
      `- TODO/${newCategory}`
    );

    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, line.range, newText);
    await vscode.workspace.applyEdit(edit);
    await document.save();
    
    this.refresh();
  }

  private async _snoozeTask(taskId: string, days: number) {
    if (days === -99999) {
        resetSnooze(taskId);
    } else {
        snoozeTask(taskId, days);
    }
    this.refresh();
  }

  private async _changePriority(taskId: string, delta: number) {
    // If delta is 0, we treat it as setting priority to 0 (which requires calculating the negation)
    if (delta === 0) {
        // We'll handle this in the webview logic or here properly if needed, 
        // but for now let's assume the button logic in HTML handles the negation or we implement a set function.
        // Actually, let's reuse prioTask with a special handling or just accept that prioTask += 0 does nothing
        // and we need a setPriority function.
        // For now, let's assume the frontend sends the negative of current priority to zero it out, OR we implement logic here.
        // But wait, the frontend sends `-task.priority` which works for zeroing out relative to current.
        // However, if we want a specific "Set to 0" logic, we might need a separate message or function.
        // Let's rely on prioTask for relative changes.
        // If we really want to set to 0, we can read the current prio and subtract it.
         const taskData = getTaskData(taskId);
         prioTask(taskId, -taskData.prio); // Set to 0
    } else {
        prioTask(taskId, delta);
    }
    this.refresh();
  }

  private async _completeTask(taskId: string) {
    const tasks = sharedTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const uri = vscode.Uri.file(task.location.link.filePath());
    const document = await vscode.workspace.openTextDocument(uri);
    const line = document.lineAt(task.location.row);
    
    const oldText = line.text;
    const newText = oldText.replace(/- TODO/, '- DONE');

    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, line.range, newText);
    await vscode.workspace.applyEdit(edit);
    await document.save();
    
    // Don't refresh immediately to allow undo
    setTimeout(() => this.refresh(), 3000);
  }

  private async _undoComplete(taskId: string) {
    // Task has been marked DONE, revert it
    await reindex2();
    const tasks = sharedTasks();
    const task = tasks.find(t => t.id === taskId && t.state === TaskState.Done);
    if (!task) return;

    const uri = vscode.Uri.file(task.location.link.filePath());
    const document = await vscode.workspace.openTextDocument(uri);
    const line = document.lineAt(task.location.row);
    
    const oldText = line.text;
    const newText = oldText.replace(/- DONE/, '- TODO');

    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, line.range, newText);
    await vscode.workspace.applyEdit(edit);
    await document.save();
    
    this.refresh();
  }

  private async _openTask(taskId: string) {
    const tasks = sharedTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const uri = vscode.Uri.file(task.location.link.filePath());
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);
    
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const position = new vscode.Position(task.location.row, task.location.column);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position));
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Task Manager</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 8px;
    }

    .header {
      padding: 12px 8px;
      border-bottom: 1px solid var(--vscode-panel-border);
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .header h2 {
      font-size: 14px;
      font-weight: 600;
    }

    .category-section {
      margin-bottom: 16px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      overflow: hidden;
    }

    .category-header {
      background: var(--vscode-editor-inactiveSelectionBackground);
      padding: 8px 12px;
      font-weight: 600;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      user-select: none;
    }

    .category-header:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .category-count {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
    }

    .task-list {
      max-height: 500px;
      overflow-y: auto;
    }

    .task-item {
      padding: 10px 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
      display: flex;
      flex-direction: column;
      gap: 8px;
      transition: background 0.15s;
    }

    .task-item:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .task-item:last-child {
      border-bottom: none;
    }

    .task-main {
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }

    .task-text {
      flex: 1;
      line-height: 1.5;
      cursor: pointer;
    }

    .task-text:hover {
      color: var(--vscode-textLink-foreground);
    }

    .task-priority {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      min-width: 60px;
      text-align: right;
    }

    .task-actions {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }

    .btn {
      padding: 4px 8px;
      border: 1px solid var(--vscode-button-border);
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      cursor: pointer;
      border-radius: 2px;
      font-size: 11px;
      transition: all 0.15s;
    }

    .btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .btn-primary:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .btn-sm {
      padding: 2px 6px;
      font-size: 10px;
    }

    .dropdown {
      display: inline-block;
      position: relative;
    }

    select {
      padding: 4px 8px;
      border: 1px solid var(--vscode-dropdown-border);
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border-radius: 2px;
      font-size: 11px;
      cursor: pointer;
    }

    .task-meta {
      display: flex;
      gap: 12px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .empty-state {
      padding: 32px;
      text-align: center;
      color: var(--vscode-descriptionForeground);
    }

    .completed-notice {
      padding: 8px 12px;
      background: var(--vscode-inputValidation-infoBackground);
      border-left: 3px solid var(--vscode-inputValidation-infoBorder);
      margin: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-radius: 2px;
    }

    .hidden {
      display: none;
    }

    ::-webkit-scrollbar {
      width: 10px;
    }

    ::-webkit-scrollbar-track {
      background: var(--vscode-scrollbarSlider-background);
    }

    ::-webkit-scrollbar-thumb {
      background: var(--vscode-scrollbarSlider-hoverBackground);
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h2>📋 Task Manager</h2>
    <button class="btn btn-sm" onclick="refresh()">Refresh</button>
  </div>

  <div id="completed-notice" class="completed-notice hidden">
    <span>Task completed!</span>
    <button class="btn btn-sm" onclick="undoComplete()">Undo</button>
  </div>

  <div id="task-container"></div>

  <div id="empty-state" class="empty-state hidden">
    <p>No TODO tasks found</p>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let categories = [];
    let lastCompletedTaskId = null;

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'update') {
        renderTasks(message.data.grouped, message.data.categories);
      }
    });

    function refresh() {
      vscode.postMessage({ type: 'refresh' });
    }

    function renderTasks(grouped, cats) {
      categories = cats;
      const container = document.getElementById('task-container');
      const emptyState = document.getElementById('empty-state');
      
      container.innerHTML = '';
      
      const categoryKeys = Object.keys(grouped).sort();
      
      if (categoryKeys.length === 0) {
        emptyState.classList.remove('hidden');
        return;
      }
      
      emptyState.classList.add('hidden');
      
      categoryKeys.forEach(category => {
        const tasks = grouped[category];
        const section = document.createElement('div');
        section.className = 'category-section';
        
        const header = document.createElement('div');
        header.className = 'category-header';
        header.innerHTML = \`
          <span>\${category}</span>
          <span class="category-count">\${tasks.length}</span>
        \`;
        
        const taskList = document.createElement('div');
        taskList.className = 'task-list';
        
        tasks.forEach(task => {
          const taskEl = document.createElement('div');
          taskEl.className = 'task-item';
          
          const isRecent = new Date(task.snoozeUntil) > new Date();
          const snoozeText = isRecent ? '(Snoozed)' : '';
          
          taskEl.innerHTML = \`
            <div class="task-main">
              <div class="task-text" onclick="openTask('\${task.id}')">
                \${escapeHtml(task.text)} \${snoozeText}
              </div>
              <div class="task-priority">P: \${task.priority.toFixed(1)}</div>
            </div>
            <div class="task-actions">
              <select onchange="changeCategory('\${task.id}', this.value)">
                <option value="">Move to...</option>
                \${categories.map(c => \`<option value="\${c}">\${c}</option>\`).join('')}
              </select>
              <button class="btn btn-sm" onclick="snooze('\${task.id}', 1)">+1d</button>
              <button class="btn btn-sm" onclick="snooze('\${task.id}', 5)">+5d</button>
              <button class="btn btn-sm" onclick="snooze('\${task.id}', 7)">+7d</button>
              <button class="btn btn-sm" onclick="snooze('\${task.id}', 30)">+30d</button>
              <button class="btn btn-sm" onclick="resetSnooze('\${task.id}')">Reset</button>
              <button class="btn btn-sm" onclick="changePriority('\${task.id}', -10)">-10</button>
              <button class="btn btn-sm" onclick="changePriority('\${task.id}', -5)">-5</button>
              <button class="btn btn-sm" onclick="changePriority('\${task.id}', -1)">-1</button>
              <button class="btn btn-sm" onclick="changePriority('\${task.id}', 1)">+1</button>
              <button class="btn btn-sm" onclick="changePriority('\${task.id}', 5)">+5</button>
              <button class="btn btn-sm" onclick="changePriority('\${task.id}', 10)">+10</button>
              <button class="btn btn-sm" onclick="setPriorityZero('\${task.id}')">P=0</button>
              <button class="btn btn-primary btn-sm" onclick="completeTask('\${task.id}')">✓ Done</button>
            </div>
            <div class="task-meta">
              <span>📄 \${task.location.file}</span>
              <span>Line \${task.location.row + 1}</span>
            </div>
          \`;
          
          taskList.appendChild(taskEl);
        });
        
        section.appendChild(header);
        section.appendChild(taskList);
        container.appendChild(section);
      });
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function changeCategory(taskId, newCategory) {
      if (newCategory) {
        vscode.postMessage({ type: 'changeCategory', taskId, newCategory });
      }
    }

    function snooze(taskId, days) {
      vscode.postMessage({ type: 'snooze', taskId, days });
    }

    function resetSnooze(taskId) {
      vscode.postMessage({ type: 'snooze', taskId, days: -99999 });
    }

    function changePriority(taskId, delta) {
      vscode.postMessage({ type: 'changePriority', taskId, delta });
    }

    function setPriorityZero(taskId) {
      // Logic handled in backend to zero out
      vscode.postMessage({ type: 'changePriority', taskId, delta: 0 });
    }

    function completeTask(taskId) {
      lastCompletedTaskId = taskId;
      document.getElementById('completed-notice').classList.remove('hidden');
      vscode.postMessage({ type: 'complete', taskId });
      setTimeout(() => {
        document.getElementById('completed-notice').classList.add('hidden');
        lastCompletedTaskId = null;
      }, 3000);
    }

    function undoComplete() {
      if (lastCompletedTaskId) {
        vscode.postMessage({ type: 'undo', taskId: lastCompletedTaskId });
        document.getElementById('completed-notice').classList.add('hidden');
        lastCompletedTaskId = null;
      }
    }

    function openTask(taskId) {
      vscode.postMessage({ type: 'openTask', taskId });
    }

    // Request initial data
    refresh();
  </script>
</body>
</html>`;
  }
}
