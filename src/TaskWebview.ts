import * as vscode from 'vscode';
import { Task, TaskState } from './Tasks';
import { sharedIndex2 } from './Index2';

export class TaskWebviewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    private _view?: vscode.WebviewView;
    private disposables: vscode.Disposable[] = [];

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        this.disposables.push(
            webviewView.webview.onDidReceiveMessage(async (data) => {
                switch (data.type) {
                    case 'refresh':
                        this.refresh();
                        break;
                }
            })
        );

        this.refresh();
    }

    public refresh() {
        if (this._view) {
            const tasks = this._getAllTasks();
            this._view.webview.postMessage({ type: 'update', tasks });
        }
    }

    private _getAllTasks(): any[] {
        const allTasks: Task[] = [];
        const files = sharedIndex2().allFiles();
        
        files.forEach((file: any) => {
            file.tasks.forEach((task: Task) => {
                if (task.state === TaskState.Todo || task.state === TaskState.Doing) {
                    allTasks.push(task);
                }
            });
        });

        // Sort by priority
        allTasks.sort((a, b) => b.prio() - a.prio());

        // Convert to plain objects for serialization
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

    private _getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Tasks</title>
            <style>
                body {
                    padding: 0;
                    margin: 0;
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                }
                .task-list {
                    padding: 8px;
                }
                .task-group {
                    margin-bottom: 12px;
                }
                .group-header {
                    font-weight: bold;
                    padding: 4px 0;
                    margin-bottom: 4px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                .task-item {
                    padding: 2px 0;
                    font-size: 12px;
                    cursor: pointer;
                }
                .task-item:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
            </style>
        </head>
        <body>
            <div class="task-list" id="taskList">Loading...</div>
            <script>
                const vscode = acquireVsCodeApi();

                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.type === 'update') {
                        renderTasks(message.tasks);
                    }
                });

                function renderTasks(tasks) {
                    const taskList = document.getElementById('taskList');
                    if (tasks.length === 0) {
                        taskList.innerHTML = '<div style="padding: 8px;">No tasks</div>';
                        return;
                    }

                    // Group tasks by category
                    const grouped = {};
                    tasks.forEach(task => {
                        const group = task.group || 'No Category';
                        if (!grouped[group]) {
                            grouped[group] = [];
                        }
                        grouped[group].push(task);
                    });

                    let html = '';
                    Object.keys(grouped).sort().forEach(group => {
                        html += '<div class="task-group">';
                        html += '<div class="group-header">' + group + '</div>';
                        grouped[group].forEach(task => {
                            html += '<div class="task-item">';
                            html += task.taskWithoutState;
                            html += '</div>';
                        });
                        html += '</div>';
                    });
                    
                    taskList.innerHTML = html;
                }

                // Request initial data
                vscode.postMessage({ type: 'refresh' });
            </script>
        </body>
        </html>`;
    }

    dispose() {
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
