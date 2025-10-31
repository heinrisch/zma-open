import os
import re

def restore_links():
    """
    Restores shortened links in all markdown files in the workspace.
    """
    href_inventory_path = 'hrefInventory.txt'
    if not os.path.exists(href_inventory_path):
        print(f"Error: {href_inventory_path} not found.")
        return

    with open(href_inventory_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    short_to_href = {}
    for line in lines:
        if '||' in line:
            short, href = line.strip().split('||')
            short_to_href[short] = href

    for root, _, files in os.walk('.'):
        for file in files:
            if file.endswith('.md'):
                file_path = os.path.join(root, file)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                except Exception as e:
                    print(f"Could not read file {file_path}: {e}")
                    continue

                new_content = content
                for short, href in short_to_href.items():
                    # Regex to find the shortened link in markdown format: [text](short)
                    pattern = re.compile(r'(\[.*?\])\(' + re.escape(short) + r'\)')
                    new_content = pattern.sub(r'\1(' + href + ')', new_content)

                if new_content != content:
                    try:
                        with open(file_path, 'w', encoding='utf-8') as f:
                            f.write(new_content)
                        print(f"Restored links in {file_path}")
                    except Exception as e:
                        print(f"Could not write to file {file_path}: {e}")


if __name__ == '__main__':
    restore_links()
