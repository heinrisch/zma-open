# Link Tagging Feature

## Overview

The link tagging feature allows you to add multiple tags to links in your ZMA workspace. Tags help organize and categorize links, making it easier to find related content.

## How It Works

### For Links with Files

When a link has an associated markdown file, tags are stored directly in the file using a `tags::` header at the beginning of the file:

```markdown
tags:: productivity, tools, vscode

# Your Content Here
```

### For Links without Files

For links that don't have associated files yet, tags are stored in a `tags.txt` file in your workspace root. This file uses a simple format:

```
link-name;,;tag1,tag2,tag3
another-link;,;tag4,tag5
```

### Automatic Migration

When you create a file for a link that has tags stored in `tags.txt`, the reindex process automatically:
1. Moves the tags from `tags.txt` to the file's `tags::` header
2. Removes the entry from `tags.txt`
3. Ensures tags only exist in one place (file takes priority)

## Usage

### Adding Tags to a Link

1. Open a markdown file
2. Run command: `ZMA: Add Tags to Current Link`
3. Enter tags separated by commas
4. Tags will be added to the `tags::` header

### Viewing Links by Tag

1. Run command: `ZMA: Show Links with Tag`
2. Select a tag from the list
3. Choose a link from the filtered results
4. The link's file will be opened

### Manual Tag Management

You can manually edit tags in files by modifying the `tags::` header:

```markdown
tags:: old-tag, new-tag, another-tag
```

For links without files, you can edit `tags.txt` directly, but it's recommended to use the commands.

## Commands

- `zma.addTagsToCurrentLink` - Add or edit tags for the current link
- `zma.showLinksWithTag` - Browse links filtered by tag

## Implementation Details

### Files Modified

- `src/TagHandler.ts` - Core tag management functionality
- `src/RegexPatterns.ts` - Added `RE_TAGS` pattern
- `src/Index2.ts` - Integrated tag parsing and migration
- `src/Commands.ts` - Added tag management commands

### Tag Storage Priority

1. **File** (primary): `tags::` header in markdown files
2. **tags.txt** (fallback): For links without files

When a file exists, tags are ALWAYS stored in the file, never in `tags.txt`.

### Reindexing

During reindex (`ZMA: Reindex`):
1. Reads `tags.txt`
2. Parses `tags::` headers from all markdown files
3. For any link with both file tags and `tags.txt` tags:
   - Merges the tags
   - Writes merged tags to file
   - Removes from `tags.txt`

## Example Workflow

1. Create a link without a file: `[[My New Link]]`
2. Add tags using `ZMA: Add Tags to Current Link`: `todo, research`
3. Tags stored in `tags.txt`: `My New Link;,;todo,research`
4. Create file for the link
5. Run `ZMA: Reindex`
6. File now contains: `tags:: todo, research`
7. Entry removed from `tags.txt`

## Benefits

- **Human-readable**: Tags are visible and editable in files
- **Portable**: Tags move with files
- **Flexible**: Works for links with and without files
- **Automatic**: Migration happens during reindex
- **No duplication**: Tags exist in only one place
