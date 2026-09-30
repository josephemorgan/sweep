import DOMPurify from 'dompurify';
import { Marked, type Tokens } from 'marked';

const SAFE_LINK = /^(?:https?:|mailto:)/i;
const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const escapeHtml = (text: string): string =>
  text.replace(/[<>"']|&(?!#?\w+;)/g, (c) => ESCAPES[c]!);

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'del',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'a',
];

/** Spec §3.4: raw HTML shown escaped, images as alt text, links only for http, https and mailto. */
const marked = new Marked({
  gfm: true,
  renderer: {
    html(token: Tokens.HTML | Tokens.Tag): string {
      return escapeHtml(token.text);
    },
    checkbox(token: Tokens.Checkbox): string {
      return token.checked ? '[x] ' : '[ ] ';
    },
    image(token: Tokens.Image): string {
      return escapeHtml(token.text);
    },
    link(token: Tokens.Link): string {
      const text = this.parser.parseInline(token.tokens);
      if (!SAFE_LINK.test(token.href.trim())) return text;
      return `<a href="${escapeHtml(token.href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
  },
});

/** Guide prose to HTML, then DOMPurify (spec §6.4). Angular's sanitizer runs again on binding. */
export function renderMarkdown(source: string): string {
  const html = marked.parse(source, { async: false });
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['href', 'target', 'rel', 'align'],
    ALLOWED_URI_REGEXP: SAFE_LINK,
    // target, rel and align values are not URIs; without this the URI regexp strips them.
    ADD_URI_SAFE_ATTR: ['target', 'rel', 'align'],
  });
}
