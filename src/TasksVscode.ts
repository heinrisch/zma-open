/**
 * VSCode-specific task functionality
 * This file contains the VSCode extension parts that were abstracted out of Tasks.ts
 */

import * as vscode from 'vscode';
import { TaskProvider } from './TaskExplorer';
import { resetSnooze, setDoneNow, snoozeTask, prioTask } from './Tasks';

// VSCode-specific task activation
export const activateTasks = (): TaskProvider => {
  const tasksNodeProvider = new TaskProvider();
  vscode.window.registerTreeDataProvider('tasks', tasksNodeProvider);

  let timeout: NodeJS.Timeout | null = null;
  const refresh = () => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => tasksNodeProvider.refresh(), 500);
  };

  // Get workspace path for task data
  const getWorkspacePath = (): string => {
    return vscode.workspace.workspaceFolders?.[0].uri.fsPath || '';
  };

  vscode.commands.registerCommand('zma.taskLink.snooze1Day', (task: any) => {
    snoozeTask(task.task.id, 1, getWorkspacePath());
    refresh();
  });

  vscode.commands.registerCommand('zma.taskLink.resetsnooze', (task: any) => {
    resetSnooze(task.task.id, getWorkspacePath());
    refresh();
  });

  vscode.commands.registerCommand('zma.taskLink.plusprio', (task: any) => {
    prioTask(task.task.id, 1, getWorkspacePath());
    refresh();
  });

  vscode.commands.registerCommand('zma.taskLink.minusprio', (task: any) => {
    prioTask(task.task.id, -1, getWorkspacePath());
    refresh();
  });

  return tasksNodeProvider;
};
