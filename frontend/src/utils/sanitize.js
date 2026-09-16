const ALLOWED_TAGS = new Set([
  'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4',
  'BLOCKQUOTE', 'CODE', 'PRE', 'SPAN', 'DIV', 'A', 'IMG', 'TABLE', 'THEAD', 'TBODY',
  'TR', 'TH', 'TD',
]);

export function sanitizeHtml(html) {
  if (!html) return '';

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  doc.querySelectorAll('script, style, iframe, object, embed, form').forEach((node) => node.remove());

  doc.body.querySelectorAll('*').forEach((element) => {
    if (!ALLOWED_TAGS.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      return;
    }

    [...element.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith('on') || (name === 'href' && value.startsWith('javascript:'))) {
        element.removeAttribute(attr.name);
      }
    });
  });

  return doc.body.innerHTML;
}
