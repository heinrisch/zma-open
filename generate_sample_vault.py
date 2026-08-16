#!/usr/bin/env python3
# /// script
# dependencies = [
#   "faker",
#   "tqdm",
# ]
# ///

import shutil
import random
from datetime import datetime, timedelta
from pathlib import Path
from faker import Faker
from tqdm import tqdm

fake = Faker()

# Seed so the sample vault is reproducible (remove for a fresh vault each run).
Faker.seed(42)
random.seed(42)

# Configuration
VAULT_DIR = Path("sample_vault")
PAGES_DIR = VAULT_DIR / "pages"
NUM_YEARS = 3
DAYS_AGO = NUM_YEARS * 365
START_DATE = datetime.now() - timedelta(days=DAYS_AGO)
TOTAL_PAGES = 5000

NUM_PEOPLE = 60
NUM_PROJECTS = 40

TAGS = [
    "work", "personal", "idea", "meeting", "project",
    "archive", "todo", "done", "reading", "health", "travel",
]
EXT_LINKS = [
    "https://google.com",
    "https://github.com",
    "https://wikipedia.org",
    "https://openai.com",
    "https://vscode.dev",
    "https://news.ycombinator.com",
    "https://stackoverflow.com",
]
TASK_STATUSES = ["TODO", "DOING", "DONE"]
TASK_CATEGORIES = ["urgent", "later", "maybe", "waiting", "blocked"]

# Filenames map '/' to '___' and drop apostrophes in this vault's Link model,
# so keep generated names free of both to stay consistent with file paths.
def sanitize_name(name: str) -> str:
    return name.replace("/", "-").replace("'", "").strip()


def make_people(count: int) -> list[str]:
    people: set[str] = set()
    while len(people) < count:
        people.add(sanitize_name(fake.name()))
    return sorted(people)


def make_projects(count: int) -> list[str]:
    projects: set[str] = set()
    while len(projects) < count:
        projects.add(sanitize_name(fake.bs().title()))
    return sorted(projects)


def make_topics(count: int) -> list[str]:
    topics: set[str] = set()
    while len(topics) < count:
        topics.add(f"{fake.word().capitalize()} {fake.word().capitalize()}")
    return sorted(topics)


def make_heading(people: list[str], link_targets: list[str]) -> str:
    roll = random.random()
    if roll < 0.20:
        return f"## Meeting with @[{random.choice(people)}]"
    if roll < 0.40:
        return f"## {fake.sentence(nb_words=random.randint(3, 5)).strip('.')}"
    if roll < 0.55:
        return f"## Project: [[{random.choice(link_targets)}]]"
    if roll < 0.70:
        return f"## {fake.word().capitalize()} Notes"
    return f"## {fake.sentence(nb_words=3).strip('.')}"


def generate_bullet(link_targets: list[str], people: list[str], depth: int = 0) -> list[str]:
    """A bullet of prose plus links, person mentions, hashtags, and a task."""
    indent = "  " * depth

    sentence = fake.sentence(nb_words=random.randint(4, 10)).strip(".")

    refs: list[str] = []
    if random.random() < 0.22:
        refs.append(f"@[{random.choice(people)}]")
    if random.random() < 0.28:
        refs.append(f"[[{random.choice(link_targets)}]]")
    if random.random() < 0.07:
        refs.append(f"[{fake.word()}]({random.choice(EXT_LINKS)})")
    if random.random() < 0.18:
        tag = random.choice(TAGS)
        if random.random() < 0.35:
            tag += f"/{fake.word()}"
        refs.append(f"#{tag}")

    text = " ".join([sentence] + refs)

    if random.random() < 0.25:
        status = random.choice(TASK_STATUSES)
        if random.random() < 0.5:
            status += f"/{random.choice(TASK_CATEGORIES)}"
        line = f"{indent}- {status} {text}"
    else:
        line = f"{indent}- {text}"

    content = [line]

    if depth < 2 and random.random() < 0.5:
        for _ in range(random.randint(1, 3)):
            content.extend(generate_bullet(link_targets, people, depth + 1))

    return content


def generate_note_content(link_targets: list[str], people: list[str]) -> str:
    """A general page: tags header, one or two headed sections, maybe an alias."""
    content: list[str] = []

    if random.random() < 0.6:
        selected = random.sample(TAGS, random.randint(1, 3))
        content.append(f"tags:: {', '.join(selected)}")
        content.append("")

    for _ in range(random.randint(1, 2)):
        content.append(make_heading(people, link_targets))
        content.append("")
        for _ in range(random.randint(1, 3)):
            content.extend(generate_bullet(link_targets, people))
        content.append("")

    # Aliases often point a short name at a person or project.
    if random.random() < 0.1:
        person = random.choice(people)
        first = person.split()[0]
        content.append(f"[[{first}]] = [[{person}]]")

    return "\n".join(content)


def generate_daily_note_content(date_str: str, link_targets: list[str], people: list[str]) -> str:
    """A date-stamped daily note: journal bullets plus a likely meeting block."""
    content: list[str] = []

    content.append(f"tags:: {random.choice(['daily', 'journal', 'work'])}")
    content.append("")

    content.append("## Journal")
    content.append("")
    for _ in range(random.randint(2, 4)):
        content.extend(generate_bullet(link_targets, people))
    content.append("")

    if random.random() < 0.7:
        person = random.choice(people)
        content.append(f"## Meeting with @[{person}]")
        content.append("")
        for _ in range(random.randint(1, 3)):
            content.extend(generate_bullet(link_targets, people))

    return "\n".join(content)


def main() -> None:
    if VAULT_DIR.exists():
        shutil.rmtree(VAULT_DIR)

    VAULT_DIR.mkdir()
    PAGES_DIR.mkdir()

    print(f"Generating improved sample vault in {VAULT_DIR.absolute()}...")

    # Daily note names (weekdays only)
    daily_note_names: list[str] = []
    for i in range(DAYS_AGO):
        d = START_DATE + timedelta(days=i)
        if d.weekday() < 5:  # 0-4 are Monday-Friday
            daily_note_names.append(d.strftime("%Y-%m-%d"))

    num_daily = len(daily_note_names)
    num_general = TOTAL_PAGES - num_daily

    people = make_people(NUM_PEOPLE)
    projects = make_projects(NUM_PROJECTS)
    topics = make_topics(max(0, num_general - len(people) - len(projects)))

    general_names = sorted(set(people) | set(projects) | set(topics))
    all_names = general_names + daily_note_names

    # Create general pages
    print(f"Creating {len(general_names)} general notes in pages/...")
    for name in tqdm(general_names):
        with open(PAGES_DIR / f"{name}.md", "w") as f:
            f.write(generate_note_content(all_names, people))

    # Create daily notes
    print(f"Creating {num_daily} daily notes in pages/...")
    for name in tqdm(daily_note_names):
        with open(PAGES_DIR / f"{name}.md", "w") as f:
            f.write(generate_daily_note_content(name, all_names, people))

    print(
        f"Done! Generated {len(all_names)} files "
        f"({len(people)} people, {len(projects)} projects, "
        f"{len(topics)} topics, {num_daily} daily notes)."
    )


if __name__ == "__main__":
    main()
