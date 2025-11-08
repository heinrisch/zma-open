export class RegexPatterns {
  static RE_SHORTENED_HREF = () => RegExp(/\[[^\]]+\]\(([a-zA-Z0-9]+)\)/gm);
  static RE_LINKS = () => RegExp(/\[\[([^\]]+)\]\]/gm);
  static RE_HREF = () => RegExp(/\[([^[]+)\]\(([^)]*)\)/gm);
  static RE_HASHTAG = () => RegExp(/(?:^|\s)(#[\w/-]+)/gm);
  static RE_HEADING = () => RegExp(/^(## .+$)/gm);
  static RE_TASK = () => RegExp(/- ((?:TODO|DOING|DONE).+)/gm);
  static RE_TASK_STATUS = () => RegExp(/\s*- (TODO|DOING|DONE).+/gm);
  static RE_TASK_GROUP = () => RegExp(/- ((?:TODO|DOING|DONE)\/(\w+).+)/gm);
  static RE_ALIAS = () => RegExp(/\[\[([^\]]+)\]\]\s*=\s*\[\[([^\]]+)\]\]/g);
  static RE_TAGS = () => RegExp(/^tags::\s*(.+)$/gm);
}
