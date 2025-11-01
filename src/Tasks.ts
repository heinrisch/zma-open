import path = require('path');
import * as fs from 'fs';
import * as vscode from 'vscode';
import { Link } from './Link';
import { RegexPatterns } from './RegexPatterns';
import { TaskLink, TaskProvider } from './TaskExplorer';
import { regexMatches, sharedIndex2 } from './Index2';
import { Location } from './LinkLocation';

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


  vscode.commands.registerCommand('zma.taskLink.snooze1Day', (task: TaskLink) => {
    snoozeTask(task.task.id, 1);
    refresh();
  });

  vscode.commands.registerCommand('zma.taskLink.resetsnooze', (task: TaskLink) => {
    resetSnooze(task.task.id);
    refresh();
  });

  vscode.commands.registerCommand('zma.taskLink.plusprio', (task: TaskLink) => {
    prioTask(task.task.id, 1);
    refresh();
  });

  vscode.commands.registerCommand('zma.taskLink.minusprio', (task: TaskLink) => {
    prioTask(task.task.id, -1);
    refresh();
  });

  return tasksNodeProvider;
};

export enum TaskState {
  Todo = 'TODO',
  Doing = 'DOING',
  Done = 'DONE'
}

export class Task {
  public state: TaskState | null = null;
  public taskWithoutState: string = '';
  public id: string;

  constructor(public full: string, public location: Location) {
    this.full = full.trim();
    this.location = location;
    this.state = this.parseState();

    const groupPrefix = this.getGroup() ? `/${this.getGroup()}` : '';
    this.taskWithoutState = this.full.trim().replace(`- ${this.state}${groupPrefix} `, '').trim();

    this.id = this.taskWithoutState.replace(new RegExp('[^a-zA-Z0-9]', 'g'), '');
  }

  public getGroup(): string | null {
    const taskData = getTaskData(this.id);
    if (taskData.getSnoozeUntil() > new Date()) {
      return 'Snoozed';
    } else {
      return this.parseGroup();
    }
  }

  public parseState(): TaskState | null {
    const match = RegexPatterns.RE_TASK_STATUS().exec(this.full.trim());
    if (match && match?.length > 1) {
      const state = match[1];
      return state.toUpperCase() as TaskState;
    } else {
      return null;
    }
  }

  public parseGroup(): string | null {
    const match = RegexPatterns.RE_TASK_GROUP().exec(this.full.trim());
    if (match && match?.length > 2) {
      const group = match[2];
      return group;
    } else {
      return null;
    }
  }

  public prio(): number {
    const taskData = getTaskData(this.id);

    const differenceInMilliseconds = new Date().getTime() - taskData.getCreatedAt().getTime();
    const millisecondsPerHour = 1000 * 60 * 60;

    const differenceInHours = differenceInMilliseconds / millisecondsPerHour;

    const doing = this.state === TaskState.Doing ? 3 : 0;

    return taskData.prio + (differenceInHours * 0.33) / 24 + doing;
  }
}

export const findAndCreateTasks = (sourceLink: Link, fileContent: string): Task[] => {
  const taskMatches = regexMatches(RegexPatterns.RE_TASK(), fileContent);
  return taskMatches.map(match => {
    const full = match.fullMatch;
    const location = new Location(sourceLink, match.row, match.column);

    const task = new Task(full, location);

    const td = getTaskData(task.id);
    const differenceInMilliseconds = Math.abs(td.getCreatedAt().getTime() - td.getDoneAt().getTime());
    if(task.state === TaskState.Done && differenceInMilliseconds < 1000*10) {
      setDoneNow(task.id);
    }

    return task;
  });
};

// Snooze
const taskDataFile = path.join(vscode.workspace.workspaceFolders?.[0].uri.fsPath || '', 'task-data.json');
let taskDatas: TaskData[] = [];

export const getTaskData = (taskId: string): TaskData => {
  if (taskDatas.length === 0) {
    if (fs.existsSync(taskDataFile)) {
      const content = fs.readFileSync(taskDataFile, 'utf-8');
      taskDatas = JSON.parse(content).map(
        (data: any) => new TaskData(data.taskId, data.snoozeUntil, data.createdAt, data.doneAt, data.prio)
      );
    }
  }

  let result = taskDatas.filter((ss) => ss.taskId === taskId);
  if (result.length > 0) {
    return result[0];
  }

  const taskData = new TaskData(taskId);
  taskDatas.push(taskData);
  saveTaskData();

  return taskData;
};

const saveTaskData = () => {
  fs.writeFileSync(taskDataFile, JSON.stringify(taskDatas));

  taskDatas = [];
};

class TaskData {
  constructor(
    public readonly taskId: string,
    public snoozeUntil: string = new Date().toString(),
    public createdAt: string = new Date().toString(),
    public doneAt: string = new Date().toString(),
    public prio: number = 0
  ) {}

  getSnoozeUntil(): Date {
    return new Date(this.snoozeUntil);
  }

  getCreatedAt(): Date {
    return new Date(this.createdAt);
  }

  getDoneAt(): Date {
    return new Date(this.doneAt);
  }
}

const resetSnooze = (taskId: string) => {
  taskDatas = [];
  getTaskData(taskId);

  taskDatas = taskDatas.map((td) => {
    if (td.taskId === taskId) {
      td.snoozeUntil = new Date().toString();
    }
    return td;
  });

  saveTaskData();
};

const setDoneNow = (taskId: string) => {
  taskDatas = [];
  getTaskData(taskId);

  taskDatas = taskDatas.map((td) => {
    if (td.taskId === taskId) {
      td.doneAt = new Date().toString();
    }
    return td;
  });

  saveTaskData();
};

const snoozeTask = (taskId: string, days: number) => {
  // Reload tasks
  taskDatas = [];
  getTaskData(taskId);

  taskDatas = taskDatas.map((td) => {
    if (td.taskId === taskId) {
      const current = td.getSnoozeUntil();
      const now = new Date();
      const start = now > current ? now : current;
      const future = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
      future.setHours(0, 0, 0, 0);
      td.snoozeUntil = future.toString();
    }
    return td;
  });

  saveTaskData();
};

const prioTask = (taskId: string, value: number) => {
  // Reload tasks
  taskDatas = [];
  getTaskData(taskId);
  taskDatas = taskDatas.map((td) => {
    if (td.taskId === taskId) {
      td.prio += value;
    }
    return td;
  });

  saveTaskData();
};
