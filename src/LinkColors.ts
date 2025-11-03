// Link Colors Configuration and Utilities
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { sharedIndex2 } from './Index2';

export interface LinkColorConfig {
  [linkName: string]: string;
}

// Good Tailwind colors for initial configuration
const DEFAULT_COLORS: LinkColorConfig = {
  'work/meetings': '#3b82f6', // blue-500
  'work/tasks': '#10b981', // emerald-500
  'personal/journal': '#f59e0b', // amber-500
  'personal/ideas': '#8b5cf6', // violet-500
  'projects/coding': '#ef4444', // red-500
  'projects/design': '#ec4899', // pink-500
  'research/papers': '#6366f1', // indigo-500
  'research/notes': '#14b8a6', // teal-500
  'health/fitness': '#84cc16', // lime-500
  'finance/budget': '#f97316', // orange-500
};

class LinkColorsManager {
  private _colors: LinkColorConfig = {};
  private _configFilePath: string = '';
  private _watchers: vscode.FileSystemWatcher[] = [];

  constructor() {
    this.updateConfigPath();
    this.loadColors();
    this.setupWatchers();
  }

  private updateConfigPath() {
    if (sharedIndex2().workspaceFilePath) {
      this._configFilePath = path.join(sharedIndex2().workspaceFilePath, '.zma-link-colors.json');
    }
  }

  private setupWatchers() {
    // Watch for workspace changes
    const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.dispose();
      this.updateConfigPath();
      this.loadColors();
      this.setupWatchers();
    });

    // Watch for config file changes if it exists
    if (fs.existsSync(this._configFilePath)) {
      const fileWatcher = vscode.workspace.createFileSystemWatcher(this._configFilePath);
      fileWatcher.onDidChange(() => this.loadColors());
      fileWatcher.onDidCreate(() => this.loadColors());
      fileWatcher.onDidDelete(() => this.loadColors());
      this._watchers.push(fileWatcher);
    }
  }

  private loadColors() {
    if (!this._configFilePath) {
      this.updateConfigPath();
    }

    if (fs.existsSync(this._configFilePath)) {
      try {
        const content = fs.readFileSync(this._configFilePath, 'utf-8');
        this._colors = JSON.parse(content);
        console.log('Loaded link colors from:', this._configFilePath);
      } catch (error) {
        console.warn('Failed to parse link colors config:', error);
        this._colors = {};
      }
    } else {
      // Create default config file
      this.createDefaultConfig();
    }
  }

  private createDefaultConfig() {
    if (!this._configFilePath) {
      return;
    }

    try {
      const configDir = path.dirname(this._configFilePath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      const configContent = JSON.stringify(DEFAULT_COLORS, null, 2);
      fs.writeFileSync(this._configFilePath, configContent, 'utf-8');
      this._colors = { ...DEFAULT_COLORS };
      console.log('Created default link colors config at:', this._configFilePath);
    } catch (error) {
      console.warn('Failed to create default link colors config:', error);
      this._colors = {};
    }
  }

  public getColorForLink(linkName: string): string | undefined {
    return this._colors[linkName];
  }

  public getAllColors(): LinkColorConfig {
    return { ...this._colors };
  }

  public setColorForLink(linkName: string, color: string): void {
    this._colors[linkName] = color;
    this.saveColors();
  }

  public removeColorForLink(linkName: string): void {
    delete this._colors[linkName];
    this.saveColors();
  }

  private saveColors() {
    if (!this._configFilePath) {
      return;
    }

    try {
      const configContent = JSON.stringify(this._colors, null, 2);
      fs.writeFileSync(this._configFilePath, configContent, 'utf-8');
      console.log('Saved link colors to:', this._configFilePath);
    } catch (error) {
      console.warn('Failed to save link colors config:', error);
    }
  }

  public dispose() {
    this._watchers.forEach(watcher => watcher.dispose());
    this._watchers = [];
  }
}

// Singleton instance
let _linkColorsManager: LinkColorsManager | null = null;

export function getLinkColorsManager(): LinkColorsManager {
  if (!_linkColorsManager) {
    _linkColorsManager = new LinkColorsManager();
  }
  return _linkColorsManager;
}

export function disposeLinkColorsManager() {
  if (_linkColorsManager) {
    _linkColorsManager.dispose();
    _linkColorsManager = null;
  }
}

// Utility function to validate hex color
export function isValidHexColor(color: string): boolean {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
}

// Utility function to extract color from text like #DEADBE
export function extractHexColorsFromText(text: string): Array<{ match: string; color: string; startIndex: number; endIndex: number }> {
  const hexColorRegex = /#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})\b/g;
  const results: Array<{ match: string; color: string; startIndex: number; endIndex: number }> = [];
  
  let match;
  while ((match = hexColorRegex.exec(text)) !== null) {
    results.push({
      match: match[0],
      color: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length
    });
  }
  
  return results;
}