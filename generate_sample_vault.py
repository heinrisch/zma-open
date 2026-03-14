#!/usr/bin/env python3
# /// script
# dependencies = [
#   "faker",
#   "tqdm",
# ]
# ///

import os
import random
from datetime import datetime, timedelta
from pathlib import Path
from faker import Faker
from tqdm import tqdm

fake = Faker()

# Configuration
VAULT_DIR = Path("sample_vault")
PAGES_DIR = VAULT_DIR / "pages"
NUM_YEARS = 3
DAYS_AGO = NUM_YEARS * 365
START_DATE = datetime.now() - timedelta(days=DAYS_AGO)
TOTAL_PAGES = 5000 # Reduced from 20000

TAGS = ["work", "personal", "idea", "meeting", "project", "archive", "todo", "done"]
EXT_LINKS = ["https://google.com", "https://github.com", "https://wikipedia.org", "https://openai.com", "https://vscode.dev"]

def generate_bullet_content(all_page_names, depth=0):
    """Generates random bulleted content with links, tags, and tasks."""
    indent = "  " * depth
    p = fake.sentence(nb_words=random.randint(5, 12)).strip('.')
    
    # Inject WikiLinks (Reduced probability from 0.4 to 0.1)
    if random.random() > 0.9:
        link_target = random.choice(all_page_names)
        p += f" [[{link_target}]]"
    
    # Inject External Links
    if random.random() > 0.9:
        p += f" [{fake.word()}]({random.choice(EXT_LINKS)})"
    
    # Inject Hashtags (sometimes nested)
    if random.random() > 0.8:
        tag = random.choice(TAGS)
        if random.random() > 0.5:
            tag += f"/{fake.word()}"
        p += f" #{tag}"
        
    line = f"{indent}- {p}"
    
    # Randomly change to a task
    if random.random() > 0.8:
        status = random.choice(["TODO", "DOING", "DONE"])
        if random.random() > 0.7:
            status += f"/{random.choice(['urgent', 'later', 'maybe'])}"
        line = f"{indent}- {status} {p}"

    content = [line]
    
    # Randomly add sub-bullets
    if depth < 2 and random.random() > 0.6:
        num_sub = random.randint(1, 3)
        for _ in range(num_sub):
            content.extend(generate_bullet_content(all_page_names, depth + 1))
            
    return content

def generate_note_content(all_page_names):
    """Generates a full note content structure."""
    content = []
    
    # Tags metadata
    if random.random() > 0.8:
        selected_tags = random.sample(TAGS, random.randint(1, 2))
        content.append(f"tags:: {', '.join(selected_tags)}")
        content.append("")

    # Random Header
    if random.random() > 0.6:
        content.append(f"## {fake.sentence(nb_words=4).strip('.')}")
        content.append("")
    
    # Bullet points
    num_blocks = random.randint(2, 5) # Fewer blocks
    for _ in range(num_blocks):
        content.extend(generate_bullet_content(all_page_names))
        if random.random() > 0.8: # Random spacers
            content.append("")

    # Random Alias (at the end)
    if random.random() > 0.95:
        alias_name = fake.word().capitalize() + "Alias"
        target = random.choice(all_page_names)
        content.append(f"\n[[{alias_name}]] = [[{target}]]")

    return "\n".join(content)

def main():
    if VAULT_DIR.exists():
        import shutil
        shutil.rmtree(VAULT_DIR)
    
    VAULT_DIR.mkdir()
    PAGES_DIR.mkdir()

    print(f"Generating improved sample vault in {VAULT_DIR.absolute()}...")

    # Daily note names (Weekdays only)
    daily_note_names = []
    for i in range(DAYS_AGO):
        date = START_DATE + timedelta(days=i)
        if date.weekday() < 5: # 0-4 are Monday-Friday
            daily_note_names.append(date.strftime("%Y-%m-%d"))

    num_daily = len(daily_note_names)
    num_general = max(0, TOTAL_PAGES - num_daily)

    # Pre-generate page names for linking
    page_names = []
    for i in range(num_general):
        name = fake.word().capitalize()
        page_names.append(f"{name}{i}")
    
    all_names = page_names + daily_note_names

    # Create General Pages
    print(f"Creating {num_general} general notes in pages/...")
    for name in tqdm(page_names):
        note_path = PAGES_DIR / f"{name}.md"
        with open(note_path, "w") as f:
            f.write(generate_note_content(all_names))

    # Create Daily Notes
    print(f"Creating {num_daily} daily notes in pages/...")
    for name in tqdm(daily_note_names):
        note_path = PAGES_DIR / f"{name}.md"
        with open(note_path, "w") as f:
            f.write(generate_note_content(all_names))

    print(f"Done! Generated {len(all_names)} files.")

if __name__ == "__main__":
    main()
