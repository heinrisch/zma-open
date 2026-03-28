import * as vscode from 'vscode';

export class ReindexStatus {
  private static instance: ReindexStatus;
  private statusBarItem: vscode.StatusBarItem;
  private resetTimeout: NodeJS.Timeout | undefined;

  private constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, -100);
    this.statusBarItem.command = 'zma.reindex';
    this.setIdle();
    this.statusBarItem.show();
  }

  public static getInstance(): ReindexStatus {
    if (!ReindexStatus.instance) {
      ReindexStatus.instance = new ReindexStatus();
    }
    return ReindexStatus.instance;
  }

  public setIdle() {
    this.statusBarItem.text = `$(search) ZMA`;
    this.statusBarItem.tooltip = `ZMA: Reindex internal data`;
    this.statusBarItem.color = '#22c55e';
    this.statusBarItem.backgroundColor = undefined;
  }

  public setReindexing() {
    this.statusBarItem.text = `$(sync~spin)`;
    this.statusBarItem.tooltip = `ZMA: Reindexing...`;
    this.statusBarItem.color = '#ef4444';
    this.statusBarItem.backgroundColor = undefined;
    clearTimeout(this.resetTimeout);
  }

  public setCompleted(timeMs: number) {
    const seconds = (timeMs / 1000).toFixed(1);
    this.statusBarItem.text = `$(check) ${seconds}s`;
    this.statusBarItem.tooltip = `ZMA: Reindexed in ${seconds}s`;
    this.statusBarItem.color = '#22c55e';
    this.statusBarItem.backgroundColor = undefined;

    this.resetTimeout = setTimeout(() => {
      this.setIdle();
    }, 5000);
  }

  public setError() {
    this.statusBarItem.text = `$(error)`;
    this.statusBarItem.tooltip = `ZMA: Reindex failed!`;
    this.statusBarItem.color = '#ef4444';
    this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    
    this.resetTimeout = setTimeout(() => {
      this.setIdle();
    }, 5000);
  }
}
