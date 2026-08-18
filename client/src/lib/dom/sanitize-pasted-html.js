import DOMPurify from 'dompurify';

/**
 * Strip the source formatting from text pasted into a rich-text editor.
 *
 * Client requirement: text copied out of a PDF, Word or a web page must adopt
 * the system's own layout instead of carrying its typeface, sizes and colours
 * along. Only the structure survives — headings, emphasis, lists, links,
 * tables — while every presentation attribute is dropped, so the document
 * keeps one uniform look.
 *
 * The generated PDF already ignores presentation attributes, so this is about
 * what the user sees on screen while editing.
 */

// Structure worth keeping. `span` and `div` are deliberately absent: Word wraps
// everything in them, and dropping the tag while keeping its text (KEEP_CONTENT)
// is exactly what flattens the paste back to plain structure.
const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'blockquote',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'a', 'code', 'pre', 'hr',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
];

// A link needs its target; a table cell needs its spans. Nothing else.
const ALLOWED_ATTR = ['href', 'colspan', 'rowspan'];

export function sanitizePastedHtml(html) {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Everything that carries the source's look, named explicitly so a future
    // change to the allow-list cannot let them back in by accident.
    FORBID_ATTR: [
      'style', 'class', 'color', 'face', 'size',
      'bgcolor', 'background', 'align', 'valign', 'width', 'height',
    ],
    // Office pastes bring their own namespaced markup along.
    FORBID_TAGS: ['style', 'meta', 'link', 'font', 'o:p', 'xml'],
    KEEP_CONTENT: true,
  });
}

export default sanitizePastedHtml;
