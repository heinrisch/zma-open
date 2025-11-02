import path = require('path');
import * as fs from 'fs';
import { Link } from './Link';
import { RegexPatterns } from './RegexPatterns';
import { regexMatches } from './Index2';
import { Location } from './LinkLocation';

// TaskExplorer and VSCode-specific imports remain in separate file for VSCode extension
// This file contains only the core task functionality needed by Index2

export enum TaskState {
  Todo = 'TODO',
  Doing = 'DOING',
  Done = 'DONE'
}

export class Task {
  public state: TaskState | null = null;
  public taskWithoutState: string = '';
  public id: string;

  constructor(public full: string, public location: Location, private taskDataPath?: string) {
    this.full = full.trim();
    this.location = location;
    this.state = this.parseState();

    const groupPrefix = this.getGroup() ? `/${this.getGroup()}` : '';
    this.taskWithoutState = this.full.trim().replace(`- ${this.state}${groupPrefix} `, '').trim();

    this.id = this.taskWithoutState.replace(new RegExp('[^a-zA-Z0-9]', 'g'), '');
  }

  public getGroup(): string | null {
    const taskData = getTaskData(this.id, this.taskDataPath);
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
    const taskData = getTaskData(this.id, this.taskDataPath);

    const differenceInMilliseconds = new Date().getTime() - taskData.getCreatedAt().getTime();
    const millisecondsPerHour = 1000 * 60 * 60;

    const differenceInHours = differenceInMilliseconds / millisecondsPerHour;

    const doing = this.state === TaskState.Doing ? 3 : 0;

    return taskData.prio + (differenceInHours * 0.33) / 24 + doing;
  }
}

export const findAndCreateTasks = (sourceLink: Link, fileContent: string, taskDataPath?: string): Task[] => {
  const taskMatches = regexMatches(RegexPatterns.RE_TASK(), fileContent);
  return taskMatches.map(match => {
    const full = match.fullMatch;
    const location = new Location(sourceLink, match.row, match.column);

    const task = new Task(full, location, taskDataPath);

    const td = getTaskData(task.id, taskDataPath);
    const differenceInMilliseconds = Math.abs(td.getCreatedAt().getTime() - td.getDoneAt().getTime());
    if(task.state === TaskState.Done && differenceInMilliseconds < 1000*10) {
      setDoneNow(task.id, taskDataPath);
    }

    return task;
  });
};

// Task data management (abstracted to work without vscode)
let taskDatas: TaskData[] = [];

export const getTaskData = (taskId: string, taskDataPath?: string): TaskData => {
  const taskDataFile = getTaskDataFile(taskDataPath);
  
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
  saveTaskData(taskDataPath);

  return taskData;
};

const getTaskDataFile = (taskDataPath?: string): string => {
  if (taskDataPath) {
    return path.join(taskDataPath, 'task-data.json');
  }
  // Fallback for when no path is provided - this will be overridden in vscode environment
  return path.join(process.cwd(), 'task-data.json');
};

const saveTaskData = (taskDataPath?: string) => {
  const taskDataFile = getTaskDataFile(taskDataPath);
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

const resetSnooze = (taskId: string, taskDataPath?: string) => {
  taskDatas = [];
  getTaskData(taskId, taskDataPath);

  taskDatas = taskDatas.map((td) => {
    if (td.taskId === taskId) {
      td.snoozeUntil = new Date().toString();
    }
    return td;
  });

  saveTaskData(taskDataPath);
};

const setDoneNow = (taskId: string, taskDataPath?: string) => {
  taskDatas = [];
  getTaskData(taskId, taskDataPath);

  taskDatas = taskDatas.map((td) => {
    if (td.taskId === taskId) {
      td.doneAt = new Date().toString();
    }
    return td;
  });

  saveTaskData(taskDataPath);
};

const snoozeTask = (taskId: string, days: number, taskDataPath?: string) => {
  // Reload tasks
  taskDatas = [];
  getTaskData(taskId, taskDataPath);

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

  saveTaskData(taskDataPath);
};

const prioTask = (taskId: string, value: number, taskDataPath?: string) => {
  // Reload tasks
  taskDatas = [];
  getTaskData(taskId, taskDataPath);
  taskDatas = taskDatas.map((td) => {
    if (td.taskId === taskId) {
      td.prio += value;
    }
    return td;
  });

  saveTaskData(taskDataPath);
};

// Export utility functions for external use (like VSCode extension)
export { resetSnooze, setDoneNow, snoozeTask, prioTask };