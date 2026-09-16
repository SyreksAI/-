import re

SCRIPT_STYLE_RE = re.compile(r"<\s*(script|style)[^>]*>.*?<\s*/\s*\1\s*>", re.IGNORECASE | re.DOTALL)
TAG_RE = re.compile(r"<\s*([a-zA-Z0-9]+)([^>]*)>", re.IGNORECASE)
EVENT_HANDLER_RE = re.compile(r"\s(on\w+|style)\s*=\s*([\"']).*?\2", re.IGNORECASE)
JS_URL_RE = re.compile(r"\s(href|src|xlink:href)\s*=\s*([\"'])\s*javascript:.*?\2", re.IGNORECASE)
ALLOWED_TAGS = {
    "p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "h1", "h2", "h3", "h4",
    "blockquote", "code", "pre", "span", "div", "a", "img", "table", "thead", "tbody",
    "tr", "th", "td",
}


def sanitize_html(value: str) -> str:
    if not value:
        return ""

    cleaned = SCRIPT_STYLE_RE.sub("", value)
    cleaned = EVENT_HANDLER_RE.sub("", cleaned)
    cleaned = JS_URL_RE.sub("", cleaned)

    def _replace_tag(match):
        tag = match.group(1).lower()
        if tag not in ALLOWED_TAGS:
            return ""
        return match.group(0)

    return TAG_RE.sub(_replace_tag, cleaned)
