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
                         prioTask(message.taskId, -9999); // Reset logic roughly or need dedicated reset
                         // Tasks.ts logic for set 0: prioTask checks if value is 0 and sets it.
                         prioTask(message.taskId, 0);
                         this.refresh();
                         break;
                    case 'complete':
                        await this.handleComplete(message.taskId);
                        break;
                    case 'openTask':
                         this.handleOpenTask(message.taskId);
                         break;
                }
            },
            null,
            this._disposables
        );
        
        // Listen to workspace changes to update the view
        vscode.workspace.onDidChangeTextDocument(() => {
             // Debounce or just refresh? Since index2 updates on save, maybe wait for save?
        });
        vscode.workspace.onDidSaveTextDocument(() => {
            // Give Index2 a moment to update
            setTimeout(() => this.refresh(), 200);
        });
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
                    // Only TODO and DOING, or recently DONE (handled by frontend if needed)
                    // Requirements say "lists all tasks that are in TODO". 
                    // But also "Grouped in their different categories".
                    if (task.state === TaskState.Todo || task.state === TaskState.Doing) {
                        allTasks.push(task);
                    }
                });
            });
        } catch (e) {
            console.error("Index not ready or error fetching tasks", e);
        }

        // Sort by priority (descending)
        allTasks.sort((a, b) => b.prio() - a.prio());

        return allTasks.map(task => ({
            id: task.id,
            full: task.full,
            state: task.state,
            taskWithoutState: task.taskWithoutState,
            group: task.getGroup(),
            prio: task.prio(),
            location: {
                filePath: task.location.link.filePath(),
                row: task.location.row,
                column: task.location.column
            }
        }));
    }

    private async handleChangeCategory(taskId: string, newCategory: string) {
        const task = this.getTaskById(taskId);
        if (task) {
            await changeCategory(task, newCategory);
            // File watcher will trigger refresh
        }
    }

    private async handleComplete(taskId: string) {
        const task = this.getTaskById(taskId);
        if (task) {
            await completeTask(task);
            // File watcher will trigger refresh
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
                /* Scrollbar styling */
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
                .prio-high { color: #f87171; }
                .prio-med { color: #fbbf24; }
                .prio-low { color: #60a5fa; }
            </style>
        </head>
        <body class="h-screen flex flex-col overflow-hidden">
            <div class="p-4 border-b border-[var(--vscode-panel-border)] flex justify-between items-center bg-[var(--vscode-editor-background)] z-10">
                <h1 class="text-xl font-bold">Tasks</h1>
                <div class="text-sm opacity-75" id="taskCount">Loading...</div>
            </div>
            
            <div id="taskList" class="flex-1 overflow-y-auto p-4 space-y-6">
                <!-- Groups will be inserted here -->
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                let allTasks = [];
                let allCategories = [];
                
                // Undo state
                let completedTasks = []; 

                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.type === 'update') {
                        allTasks = message.tasks;
                        allCategories = message.categories;
                        render();
                    }
                });

                function render() {
                    const container = document.getElementById('taskList');
                    const countEl = document.getElementById('taskCount');
                    
                    if (allTasks.length === 0) {
                        container.innerHTML = '<div class="text-center opacity-50 mt-10">No tasks found</div>';
                        countEl.innerText = '0 tasks';
                        return;
                    }

                    countEl.innerText = allTasks.length + ' tasks';

                    // Group tasks
                    const groups = {};
                    allTasks.forEach(task => {
                        const g = task.group || 'Inbox';
                        if (!groups[g]) groups[g] = [];
                        groups[g].push(task);
                    });

                    let html = '';
                    const sortedGroups = Object.keys(groups).sort();
                    
                    // Move 'Inbox' to top if exists, 'Snoozed' to bottom
                    if (groups['Inbox']) {
                         sortedGroups.splice(sortedGroups.indexOf('Inbox'), 1);
                         sortedGroups.unshift('Inbox');
                    }
                    if (groups['Snoozed']) {
                         sortedGroups.splice(sortedGroups.indexOf('Snoozed'), 1);
                         sortedGroups.push('Snoozed');
                    }

                    sortedGroups.forEach(groupName => {
                        html += \`
                            <div class="group-section">
                                <div class="sticky top-0 bg-[var(--vscode-editor-background)] py-2 mb-2 border-b-2 border-[var(--vscode-focusBorder)] font-bold text-lg flex items-center gap-2 z-0">
                                    <span>\${groupName}</span>
                                    <span class="text-xs opacity-50 font-normal">(\${groups[groupName].length})</span>
                                </div>
                                <div class="grid gap-1">
                        \`;
                        
                        groups[groupName].forEach(task => {
                            const isHighPrio = task.prio > 5;
                            const isLowPrio = task.prio < -5;
                            const prioClass = isHighPrio ? 'prio-high' : (isLowPrio ? 'prio-low' : 'prio-med');
                            
                            html += \`
                                <div class="task-row grid grid-cols-[1fr_auto] gap-4 p-2 items-center rounded group hover:bg-[var(--vscode-list-hoverBackground)]" data-id="\${task.id}">
                                    <div class="flex flex-col gap-1 min-w-0" onclick="openTask('\${task.id}')">
                                        <div class="flex items-center gap-2">
                                            <span class="font-mono text-xs opacity-50 select-none cursor-pointer" title="Priority: \${task.prio.toFixed(1)}">[\${task.prio.toFixed(0)}]</span>
                                            <span class="truncate cursor-pointer hover:underline">\${escapeHtml(task.taskWithoutState)}</span>
                                        </div>
                                        <div class="text-xs opacity-50 truncate pl-8">\${task.location.filePath.split(/[\\\\/]/).pop()}</div>
                                    </div>
                                    
                                    <div class="flex items-center gap-2 opacity-10 group-hover:opacity-100 transition-opacity">
                                        <!-- Category Dropdown -->
                                        <select onchange="changeCategory('\${task.id}', this.value)" class="text-xs p-1 rounded max-w-[100px]" title="Change Category">
                                            <option value="" disabled selected>Move...</option>
                                            \${allCategories.map(c => \`<option value="\${c}">\${c}</option>\`).join('')}
                                            <option value="Inbox">Inbox</option> <!-- Always available -->
                                            <option value="__NEW__">+ New...</option>
                                        </select>

                                        <!-- Priority Controls -->
                                        <div class="flex items-center bg-[var(--vscode-textBlockQuote-background)] rounded overflow-hidden">
                                            <button class="btn-icon text-[10px]" onclick="changePrio('\${task.id}', -5)" title="-5 Prio">--</button>
                                            <button class="btn-icon text-[10px]" onclick="changePrio('\${task.id}', -1)" title="-1 Prio">-</button>
                                            <button class="btn-icon text-[10px]" onclick="setPrio('\${task.id}', 0)" title="Reset Prio">0</button>
                                            <button class="btn-icon text-[10px]" onclick="changePrio('\${task.id}', 1)" title="+1 Prio">+</button>
                                            <button class="btn-icon text-[10px]" onclick="changePrio('\${task.id}', 5)" title="+5 Prio">++</button>
                                        </div>

                                        <!-- Snooze Controls -->
                                        <div class="flex items-center bg-[var(--vscode-textBlockQuote-background)] rounded overflow-hidden ml-1">
                                            <button class="btn-icon text-[10px]" onclick="snooze('\${task.id}', 1)" title="Snooze 1 Day">1d</button>
                                            <button class="btn-icon text-[10px]" onclick="snooze('\${task.id}', 7)" title="Snooze 1 Week">7d</button>
                                            <button class="btn-icon text-[10px]" onclick="snooze('\${task.id}', 0)" title="Reset Snooze">R</button>
                                        </div>

                                        <!-- Complete Button -->
                                        <button class="ml-2 bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs" onclick="complete('\${task.id}')">
                                            Done
                                        </button>
                                    </div>
                                </div>
                            \`;
                        });
                        
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
                    if (newCat === '__NEW__') {
                        // Prompt in vscode not implemented, maybe just ignore or handle via command
                        return;
                    }
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
                    // Optimistic update: Find the row and strike it through or opacity
                    const row = document.querySelector(\`div[data-id="\${id}"]\`);
                    if (row) {
                        row.style.opacity = '0.3';
                        row.style.pointerEvents = 'none';
                        // Add undo button?
                        const btn = row.querySelector('button.bg-green-600');
                        if (btn) btn.innerText = '✓';
                    }
                    vscode.postMessage({ type: 'complete', taskId: id });
                }

                // Initial load
                vscode.postMessage({ type: 'refresh' });
            </script>
        </body>
        </html>`;
    }
}
