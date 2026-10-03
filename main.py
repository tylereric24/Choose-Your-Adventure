"""Terminal client for Bad Choices. Plays the free stories from content/stories.

    python3 main.py                  # pick a story
    python3 main.py treasure-island  # jump straight in

Uses the same JSON story format as the web app (see public/js/engine.js).
"""

import json
import sys
import textwrap
from pathlib import Path

STORY_DIR = Path(__file__).parent / "content" / "stories"
KIND = {"death": "DEATH", "victory": "VICTORY", "strange": "STRANGE"}


def holds(flags, expr):
    return (expr[1:] not in flags) if expr.startswith("!") else (expr in flags)


def apply(flags, exprs):
    flags = set(flags)
    for e in exprs or []:
        flags.discard(e[1:]) if e.startswith("!") else flags.add(e)
    return flags


def say(text):
    for para in text.split("\n\n"):
        print(textwrap.fill(para, width=79))
        print()


def ask(options):
    while True:
        try:
            raw = input("> ").strip().lower()
        except EOFError:
            sys.exit(0)
        if raw in ("q", "quit", "exit"):
            sys.exit(0)
        if raw.isdigit() and 1 <= int(raw) <= len(options):
            return options[int(raw) - 1]
        # Also accept a word from the option, like the original game ("left", "gold").
        needle = raw.strip('"')
        matches = [o for o in options if needle in o["label"].lower()] if needle else []
        if len(matches) > 1:
            matches = [o for o in matches if o["label"].lower().strip('"').startswith(needle)]
        if len(matches) == 1:
            return matches[0]
        print(f"Pick 1-{len(options)} (or q to quit).")


def play(story):
    if story.get("art"):
        print(story["art"])
    node_id = story["start"]
    flags = apply(set(), story["nodes"][node_id].get("set"))
    while True:
        node = story["nodes"][node_id]
        print()
        say(node["text"])
        if "ending" in node:
            e = node["ending"]
            print(f"*** {KIND[e['kind']]}: {e['title']} ***\n")
            return
        options = [c for c in node["choices"] if all(holds(flags, x) for x in c.get("if", []))]
        for i, c in enumerate(options, 1):
            print(f"  {i}. {c['label']}")
        choice = ask(options)
        node_id = choice["to"]
        flags = apply(apply(flags, choice.get("set")), story["nodes"][node_id].get("set"))


def main():
    stories = {}
    for path in sorted(STORY_DIR.glob("*.json")):
        s = json.loads(path.read_text())
        if not s.get("premium"):
            stories[s["id"]] = s
    if len(sys.argv) > 1:
        story = stories.get(sys.argv[1])
        if not story:
            sys.exit(f"Unknown story. Free stories: {', '.join(stories)}")
    else:
        options = [{"label": s["title"], "story": s} for s in stories.values()]
        for i, o in enumerate(options, 1):
            print(f"  {i}. {o['label']}")
        story = ask(options)["story"]
    while True:
        play(story)
        print("Play again? (y/n)")
        try:
            again = input("> ").strip().lower()
        except EOFError:
            break
        if again not in ("y", "yes"):
            break


if __name__ == "__main__":
    main()
