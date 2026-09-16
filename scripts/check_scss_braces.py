from pathlib import Path

text = Path("frontend/src/static/master.scss").read_text(encoding="utf-8")
stack = []
line = 1
in_str = None
escape = False

for ch in text:
    if ch == "\n":
        line += 1
    elif in_str:
        if escape:
            escape = False
        elif ch == "\\":
            escape = True
        elif ch == in_str:
            in_str = None
    elif ch in ('"', "'"):
        in_str = ch
    elif ch == "{":
        stack.append(line)
    elif ch == "}":
        if stack:
            stack.pop()
        else:
            print(f"extra closing brace at line {line}")

if stack:
    print(f"unclosed brace count: {len(stack)}")
    print("last unclosed opened at lines:", stack[-10:])
else:
    print("braces balanced")
