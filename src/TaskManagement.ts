import * as vscode from 'vscode';
import { Task, TaskState, prioTask, snoozeTask, completeTask, changeCategory, resetSnooze } from './Tasks';
import { sharedIndex2 } from './Index2';

export const activateTaskManagement = (context: vscode.ExtensionContext) => {
    context.subscriptions.push(
        vscode.commands.registerCommand('zma.openTaskManagement', () => {
            TaskManagementPanel.createOrShow(context.extensionUri);
        })
    );
};

export class TaskManagementPanel {
    public static currentPanel: TaskManagementPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'refresh':
                        this.refresh();
                        break;
                    case 'changeCategory':
                        await this.handleChangeCategory(message.taskId, message.newCategory);
                        break;
                    case 'snooze':
                        if (message.days === 0) {
                            resetSnooze(message.taskId);
                        } else {
                            snoozeTask(message.taskId, message.days);
                        }
                        this.refresh();
                        break;
                    case 'changePriority':
                        prioTask(message.taskId, message.delta);
                        this.refresh();
                        break;
                    case 'setPriority':
                         prioTask(message.taskId, 0);
                         this.refresh();
                         break;
                    case 'complete':
                        await this.handleComplete(message.taskId);
                        break;
                    case 'undoComplete':
                        await this.handleUndoComplete(message.taskId);
                        break;
                    case 'openTask':
                         this.handleOpenTask(message.taskId);
                         break;
                }
            },
            null,
            this._disposables
        );
    }

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (TaskManagementPanel.currentPanel) {
            TaskManagementPanel.currentPanel._panel.reveal(column);
            TaskManagementPanel.currentPanel.refresh();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'zmaTaskManagement',
            'Task Management',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        TaskManagementPanel.currentPanel = new TaskManagementPanel(panel, extensionUri);
    }

    public dispose() {
        TaskManagementPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private refresh() {
        const tasks = this._getAllTasks();
        const categories = this._getAllCategories(tasks);
        this._panel.webview.postMessage({ type: 'update', tasks, categories });
    }
    
    private _getAllCategories(tasks: any[]): string[] {
        const categories = new Set<string>();
        tasks.forEach(t => {
            if (t.group && t.group !== 'Snoozed') {
                categories.add(t.group);
            }
        });
        return Array.from(categories).sort();
    }

    private _getAllTasks(): any[] {
        const allTasks: Task[] = [];
        try {
            const files = sharedIndex2().allFiles();
            files.forEach(file => {
                file.tasks.forEach(task => {
                    if (task.state === TaskState.Todo || task.state === TaskState.Doing) {
                        allTasks.push(task);
                    }
                });
            });
        } catch (e) {
            console.error("Index not ready or error fetching tasks", e);
        }

        allTasks.sort((a, b) => b.prio() - a.prio());

        return allTasks.map(task => {
            const { getTaskData } = require('./Tasks'); 
            const td = getTaskData(task.id);
            const snoozeDate = td.getSnoozeUntil();
            const now = new Date();
            let snoozeStr = '';
            if (snoozeDate > now) {
                snoozeStr = snoozeDate.toISOString().split('T')[0];
            }

            return {
                id: task.id,
                full: task.full,
                state: task.state,
                taskWithoutState: task.taskWithoutState,
                group: task.getGroup(),
                prio: task.prio(),
                snoozeDate: snoozeStr,
                location: {
                    filePath: task.location.link.filePath(),
                    row: task.location.row,
                    column: task.location.column
                }
            };
        });
    }

    private async handleChangeCategory(taskId: string, newCategory: string) {
        const task = this.getTaskById(taskId);
        if (task) {
            await changeCategory(task, newCategory);
        }
    }

    private async handleComplete(taskId: string) {
        const task = this.getTaskById(taskId);
        if (task) {
            await completeTask(task);
        }
    }

    private async handleUndoComplete(taskId: string) {
        const task = this.getTaskById(taskId);
        if (task) {
            const document = await vscode.workspace.openTextDocument(vscode.Uri.file(task.location.link.filePath()));
            const edit = new vscode.WorkspaceEdit();
            const line = document.lineAt(task.location.row);
            const newText = line.text.replace('DONE', 'TODO');
            edit.replace(document.uri, line.range, newText);
            await vscode.workspace.applyEdit(edit);
        }
    }
    
    private handleOpenTask(taskId: string) {
         const task = this.getTaskById(taskId);
         if (task) {
             vscode.workspace.openTextDocument(task.location.link.filePath()).then(doc => {
                 vscode.window.showTextDocument(doc, {
                     selection: new vscode.Range(task.location.row, 0, task.location.row, 0)
                 });
             });
         }
    }

    private getTaskById(taskId: string): Task | undefined {
        const files = sharedIndex2().allFiles();
        for (const file of files) {
            const task = file.tasks.find(t => t.id === taskId);
            if (task) return task;
        }
        return undefined;
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Task Management</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                body {
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    font-family: var(--vscode-font-family);
                }
                ::-webkit-scrollbar {
                    width: 10px;
                    height: 10px;
                }
                ::-webkit-scrollbar-thumb {
                    background: var(--vscode-scrollbarSlider-background);
                    border-radius: 5px;
                }
                ::-webkit-scrollbar-thumb:hover {
                    background: var(--vscode-scrollbarSlider-hoverBackground);
                }
                .task-row {
                    border-bottom: 1px solid var(--vscode-panel-border);
                    transition: background-color 0.1s;
                }
                .task-row:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                .btn-icon {
                    cursor: pointer;
                    padding: 2px 6px;
                    border-radius: 3px;
                }
                .btn-icon:hover {
                    background-color: var(--vscode-button-secondaryHoverBackground);
                }
                select {
                    background-color: var(--vscode-dropdown-background);
                    color: var(--vscode-dropdown-foreground);
                    border: 1px solid var(--vscode-dropdown-border);
                }
                .prio-high { border-left: 3px solid #ef4444; background-color: rgba(239, 68, 68, 0.05); }
                .prio-med { border-left: 3px solid #f59e0b; background-color: rgba(245, 158, 11, 0.05); }
                .prio-low { border-left: 3px solid #3b82f6; background-color: rgba(59, 130, 246, 0.05); }
                .prio-neutral { border-left: 3px solid transparent; }
                
                .group-header {
                    cursor: pointer;
                    user-select: none;
                }
                .group-header:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                .chevron {
                    transition: transform 0.2s;
                }
                .collapsed .chevron {
                    transform: rotate(-90deg);
                }
                .collapsed + .group-content {
                    display: none;
                }
                
                .completed-task {
                    opacity: 0.5;
                    text-decoration: line-through;
                    background-color: rgba(0, 255, 0, 0.05);
                }
                
                .refresh-btn {
                    padding: 4px 8px;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border-radius: 2px;
                    font-size: 12px;
                    cursor: pointer;
                }
                .refresh-btn:hover {
                    background: var(--vscode-button-hoverBackground);
                }
            </style>
        </head>
        <body class="h-screen flex flex-col overflow-hidden">
            <div class="p-4 border-b border-[var(--vscode-panel-border)] flex justify-between items-center bg-[var(--vscode-editor-background)] z-10">
                <div class="flex items-center gap-4">
                    <h1 class="text-xl font-bold">Tasks</h1>
                    <button class="refresh-btn" onclick="vscode.postMessage({ type: 'refresh' })">Refresh</button>
                    <button class="refresh-btn" onclick="toggleAllGroups()">Collapse All</button>
                </div>
                <div class="text-sm opacity-75" id="taskCount">Loading...</div>
            </div>
            
            <div id="taskList" class="flex-1 overflow-y-auto p-4 space-y-6">
                <!-- Groups will be inserted here -->
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                let allTasks = [];
                let allCategories = [];
                let collapsedGroups = new Set();
                let completedTaskIds = new Set();
                let allGroupNames = [];

                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.type === 'update') {
                        allTasks = message.tasks;
                        allCategories = message.categories;
                        
                        const currentIds = new Set(allTasks.map(t => t.id));
                        completedTaskIds = new Set([...completedTaskIds].filter(id => currentIds.has(id)));
                        
                        render();
                    }
                });

                function toggleGroup(groupName) {
                    if (collapsedGroups.has(groupName)) {
                        collapsedGroups.delete(groupName);
                    } else {
                        collapsedGroups.add(groupName);
                    }
                    render();
                }

                function toggleAllGroups() {
                    if (collapsedGroups.size === allGroupNames.length) {
                        // All collapsed, expand all
                        collapsedGroups.clear();
                    } else {
                        // Some or none collapsed, collapse all
                        allGroupNames.forEach(name => collapsedGroups.add(name));
                    }
                    render();
                }

                function render() {
                    const container = document.getElementById('taskList');
                    const countEl = document.getElementById('taskCount');
                    
                    if (allTasks.length === 0) {
                        container.innerHTML = '<div class="text-center opacity-50 mt-10">No tasks found</div>';
                        countEl.innerText = '0 tasks';
                        return;
                    }

                    countEl.innerText = allTasks.length + ' tasks';

                    const groups = {};
                    allTasks.forEach(task => {
                        const g = task.group || 'Inbox';
                        if (!groups[g]) groups[g] = [];
                        groups[g].push(task);
                    });

                    let html = '';
                    const sortedGroups = Object.keys(groups).sort();
                    
                    if (groups['Inbox']) {
                         sortedGroups.splice(sortedGroups.indexOf('Inbox'), 1);
                         sortedGroups.unshift('Inbox');
                    }
                    if (groups['Snoozed']) {
                         sortedGroups.splice(sortedGroups.indexOf('Snoozed'), 1);
                         sortedGroups.push('Snoozed');
                    }

                    allGroupNames = sortedGroups;

                    sortedGroups.forEach(groupName => {
                        const isCollapsed = collapsedGroups.has(groupName);
                        const count = groups[groupName].length;
                        
                        html += \`
                            <div class="group-section">
                                <div class="group-header sticky top-0 bg-[var(--vscode-editor-background)] py-2 mb-2 border-b border-[var(--vscode-focusBorder)] flex items-center gap-2 z-10 \${isCollapsed ? 'collapsed' : ''}" onclick="toggleGroup('\${groupName}')">
                                    <svg class="chevron w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                                    <span class="font-bold text-lg">\${groupName}</span>
                                    <span class="text-xs opacity-50 font-normal">(\${count})</span>
                                </div>
                                <div class="group-content grid gap-1">
                        \`;
                        
                        if (!isCollapsed) {
                            groups[groupName].forEach(task => {
                                const isCompleted = completedTaskIds.has(task.id);
                                const isHighPrio = task.prio > 5;
                                const isMedPrio = task.prio > 0 && task.prio <= 5;
                                const isLowPrio = task.prio < 0;
                                const prioClass = isHighPrio ? 'prio-high' : (isMedPrio ? 'prio-med' : (isLowPrio ? 'prio-low' : 'prio-neutral'));
                                
                                const snoozeInfo = task.snoozeDate ? \`<span class="text-xs text-purple-400 ml-2 border border-purple-400 rounded px-1">Until \${task.snoozeDate}</span>\` : '';

                                html += \`
                                    <div class="task-row grid grid-cols-[1fr_auto] gap-4 p-2 items-center rounded group \${prioClass} \${isCompleted ? 'completed-task' : ''}" data-id="\${task.id}">
                                        <div class="flex flex-col gap-1 min-w-0 cursor-pointer" onclick="openTask('\${task.id}')">
                                            <div class="flex items-center gap-2">
                                                <span class="font-mono text-xs opacity-50 select-none" title="Priority: \${task.prio.toFixed(1)}">[\${task.prio.toFixed(0)}]</span>
                                                <span class="truncate hover:underline font-medium">\${escapeHtml(task.taskWithoutState)}</span>
                                                \${snoozeInfo}
                                            </div>
                                            <div class="text-xs opacity-50 truncate pl-8">\${task.location.filePath.split(/[\\\\/]/).pop()}</div>
                                        </div>
                                        
                                        <div class="action-group flex items-center gap-2">
                                            <select onchange="changeCategory('\${task.id}', this.value)" class="text-xs p-1 rounded max-w-[100px] opacity-90 hover:opacity-100" title="Change Category" \${isCompleted ? 'disabled' : ''}>
                                                <option value="" disabled selected>Move</option>
                                                \${allCategories.map(c => \`<option value="\${c}">\${c}</option>\`).join('')}
                                                <option value="Inbox">Inbox</option>
                                            </select>

                                            <div class="flex items-center bg-[var(--vscode-textBlockQuote-background)] rounded overflow-hidden border border-[var(--vscode-panel-border)]">
                                                <button class="btn-icon text-[10px] text-blue-400 hover:text-blue-300" onclick="changePrio('\${task.id}', -5)" title="-5 Prio" \${isCompleted ? 'disabled' : ''}>--</button>
                                                <button class="btn-icon text-[10px] text-blue-400 hover:text-blue-300" onclick="changePrio('\${task.id}', -1)" title="-1 Prio" \${isCompleted ? 'disabled' : ''}>-</button>
                                                <button class="btn-icon text-[10px] opacity-50 hover:opacity-100" onclick="setPrio('\${task.id}', 0)" title="Reset Prio" \${isCompleted ? 'disabled' : ''}>0</button>
                                                <button class="btn-icon text-[10px] text-red-400 hover:text-red-300" onclick="changePrio('\${task.id}', 1)" title="+1 Prio" \${isCompleted ? 'disabled' : ''}>+</button>
                                                <button class="btn-icon text-[10px] text-red-400 hover:text-red-300" onclick="changePrio('\${task.id}', 5)" title="+5 Prio" \${isCompleted ? 'disabled' : ''}>++</button>
                                            </div>

                                            <div class="flex items-center bg-[var(--vscode-textBlockQuote-background)] rounded overflow-hidden border border-[var(--vscode-panel-border)] ml-1">
                                                <button class="btn-icon text-[10px] text-purple-400 hover:text-purple-300" onclick="snooze('\${task.id}', 1)" title="1 Day" \${isCompleted ? 'disabled' : ''}>1d</button>
                                                <button class="btn-icon text-[10px] text-purple-400 hover:text-purple-300" onclick="snooze('\${task.id}', 5)" title="5 Days" \${isCompleted ? 'disabled' : ''}>5d</button>
                                                <button class="btn-icon text-[10px] text-purple-400 hover:text-purple-300" onclick="snooze('\${task.id}', 7)" title="1 Week" \${isComplapsed ? 'disabled' : ''}>7d</button>
                                                <button class="btn-icon text-[10px] text-purple-400 hover:text-purple-300" onclick="snooze('\${task.id}', 30)" title="1 Month" \${isCompleted ? 'disabled' : ''}>30d</button>
                                                <button class="btn-icon text-[10px] opacity-50 hover:opacity-100" onclick="snooze('\${task.id}', 0)" title="Reset" \${isCompleted ? 'disabled' : ''}>R</button>
                                            </div>

                                            <button class="\${isCompleted ? 'bg-gray-500 hover:bg-gray-600' : 'bg-green-600 hover:bg-green-500'} text-white px-3 py-1 rounded text-xs font-bold shadow-sm ml-2 w-8" 
                                                onclick="\${isCompleted ? \`undoComplete('\${task.id}')\` : \`complete('\${task.id}')\`}"
                                                title="\${isCompleted ? 'Undo Complete' : 'Complete Task'}">
                                                \${isCompleted ? '↩' : '✓'}
                                            </button>
                                        </div>
                                    </div>
                                \`;
                            });
                        }
                        
                        html += \`</div></div>\`;
                    });

                    container.innerHTML = html;
                }

                function escapeHtml(text) {
                    const div = document.createElement('div');
                    div.innerText = text;
                    return div.innerHTML;
                }

                function openTask(id) {
                    vscode.postMessage({ type: 'openTask', taskId: id });
                }

                function changeCategory(id, newCat) {
                    vscode.postMessage({ type: 'changeCategory', taskId: id, newCategory: newCat });
                }

                function changePrio(id, delta) {
                    vscode.postMessage({ type: 'changePriority', taskId: id, delta: delta });
                }
                
                function setPrio(id, val) {
                    vscode.postMessage({ type: 'setPriority', taskId: id });
                }

                function snooze(id, days) {
                    vscode.postMessage({ type: 'snooze', taskId: id, days: days });
                }

                function complete(id) {
                    completedTaskIds.add(id);
                    render();
                    vscode.postMessage({ type: 'complete', taskId: id });
                }

                function undoComplete(id) {
                    completedTaskIds.delete(id);
                    render();
                    vscode.postMessage({ type: 'undoComplete', taskId: id });
                }

                vscode.postMessage({ type: 'refresh' });
            </script>
        </body>
        </html>`;
    }
}
