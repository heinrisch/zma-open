import * as vscode from 'vscode';
import { Task, TaskState, getTaskData } from './Tasks';
import { sharedIndex2 } from './Index2';


export class TaskProvider implements vscode.TreeDataProvider<TaskLink | TaskGroup> {
  private _onDidChangeTreeData: vscode.EventEmitter<TaskLink | TaskGroup | undefined | void> = new vscode.EventEmitter<
    TaskLink | TaskGroup | undefined | void
  >();
  readonly onDidChangeTreeData: vscode.Event<TaskLink | TaskGroup | undefined | void> = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TaskLink): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TaskLink | TaskGroup): Thenable<TaskLink[] | TaskGroup[]> {
    if (!element) {
      return Promise.resolve(this.createTaskGroups());
    } else {
      return Promise.resolve(this.createTaskLinks((element as TaskGroup).group));
    }
  }

  createTaskGroups(): any {
    const groups: string[] = this.activeTasks()
      .map((task: Task) => task.getGroup())
      .filter((group: string | null) => group !== null) as string[];
    const uniqueGroups = [...new Set(groups)];
    const namedGroups = uniqueGroups.sort().map((group: string) => {
      return new TaskGroup(group, group, vscode.TreeItemCollapsibleState.Collapsed);
    });
    const unnamedGroup = new TaskGroup('General', null, vscode.TreeItemCollapsibleState.Expanded);
    return [unnamedGroup, ...namedGroups];
  }

  private activeTasks(): Task[] {
    return sharedIndex2().allActiveTasks().filter((task: Task) => {
      return task.state === TaskState.Todo || task.state === TaskState.Doing;
    });
  }

  private createTaskLinks(group: string | null): TaskLink[] {
    return this.activeTasks()
      .filter((task: Task) => {
        return task.getGroup() === group;
      })
      .sort((a: Task, b: Task) => {
        return b.prio() - a.prio();
      })
      .map((task: Task) => {
        return new TaskLink(task);
      });
  }
}

export class TaskLink extends vscode.TreeItem {
  public task: Task;

  constructor(task: Task) {
    super(`${task.prio().toFixed(1)} | ${task.taskWithoutState}`, vscode.TreeItemCollapsibleState.None);

    const taskData = getTaskData(task.id);

    this.task = task;

    this.tooltip = `Prio: ${task.prio()}\nSnoozed Until: ${taskData.snoozeUntil}\nCreated At: ${taskData.createdAt}`;
    this.description = task.location.link.linkName();

    this.iconPath = this.getPriorityIcon();

    this.command = {
      title: 'Open File',
      command: 'zma.openfile',
      arguments: [vscode.Uri.file(task.location.link.filePath()), task.full, task.location.row, task.location.column]
    };

    this.resourceUri = vscode.Uri.file(task.location.link.filePath());
  }

  private getPriorityIcon(): vscode.ThemeIcon {
    const prio = this.task.prio();
    if (prio < 1) {
      return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.green'));
    } else if (prio < 2) {
      return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.yellow'));
    } else {
      return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.red'));
    }
  }

  contextValue = 'Tasklink';
}

export class TaskGroup extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly group: string | null,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.group = group;
  }

  contextValue = 'Taskgroup';
}
