import re
from pathlib import Path

root = Path("frontend/src")
pattern = re.compile(r",?\s*\{\s*['\"]X-User-ID['\"]\s*:\s*String\([^)]+\)\s*\}")
headers_pattern = re.compile(r"headers:\s*\{\s*['\"]X-User-ID['\"]\s*:\s*String\([^)]+\)\s*\}\s*,?\s*")

for path in root.rglob("*"):
    if path.suffix not in {".js", ".jsx"}:
        continue
    text = path.read_text(encoding="utf-8")
    new = pattern.sub("", text)
    new = headers_pattern.sub("", new)
    new = re.sub(r",\s*,", ",", new)
    new = re.sub(r"\(\s*,", "(", new)
    if new != text:
        path.write_text(new, encoding="utf-8")
        print(f"updated {path}")
