/* global location, document, DOMParser */
// Capture an HTML FAQ's sub-pages from inside the FAQ page itself.
//
// Paste the function (everything after `export default`) as the `function` of
// mcp__sweep-chrome__evaluate_script while the FAQ's index page (…/faqs/<id>) or any of its
// sub-pages is open, with
//   waitForStableDom: false
//   filePath: <source dir>/capture-NN.json        (NN = 01, 02, … per batch)
// Edit SLUGS to the next batch of TOC slugs (20 or fewer per call, so the call doesn't time
// out). The same origin, cookies included, is what keeps Cloudflare quiet: don't move this
// to Node, curl or another tab.
//
// Output: { capturedAt, base, pages: [{ slug, url, status, title, challenge, html, md }] }.
// `html` is the raw `#faqwrap` element; `md` is a Markdown rendering of the same DOM.
// On the first page without `#faqwrap` the loop stops (challenge: true means Turnstile).
export default async () => {
  const SLUGS = [];
  const DELAY_MS = 1000;
  const base = location.origin + location.pathname.match(/^.*\/faqs\/\d+/)[0] + '/';

  const md = (root) => {
    const esc = (s) => s.replace(/\s+/g, ' ');
    const inline = (n) =>
      [...n.childNodes]
        .map((c) => {
          if (c.nodeType === 3) return esc(c.textContent);
          if (c.nodeType !== 1) return '';
          const t = c.tagName;
          if (t === 'BR') return '\n';
          if (t === 'IMG') return c.alt ? `[${c.alt}]` : '';
          if (t === 'STRONG' || t === 'B') return `**${inline(c).trim()}**`;
          if (t === 'EM' || t === 'I') return `*${inline(c).trim()}*`;
          if (t === 'CODE') return '`' + inline(c) + '`';
          if (t === 'SPAN' && c.classList.contains('fspoiler'))
            return `(spoiler: ${inline(c).trim()})`;
          return inline(c);
        })
        .join('');
    const isList = (x) => x.nodeType === 1 && /^(UL|OL)$/.test(x.tagName);
    const block = (n, depth = 0) => {
      const out = [];
      for (const c of n.children) {
        const t = c.tagName;
        if (c.classList.contains('ftoc')) continue; // the page's own table of contents
        if (/^H[1-6]$/.test(t)) out.push('#'.repeat(+t[1]) + ' ' + inline(c).trim());
        else if (t === 'P') {
          const s = inline(c).trim();
          if (s) out.push(s);
        } else if (t === 'PRE') out.push('```\n' + c.textContent.replace(/\n$/, '') + '\n```');
        else if (t === 'HR') out.push('---');
        else if (t === 'BLOCKQUOTE') out.push(block(c, depth).replace(/^/gm, '> '));
        else if (t === 'UL' || t === 'OL') {
          [...c.children].forEach((li, i) => {
            const mark = t === 'OL' ? `${i + 1}.` : '-';
            const own = document.createElement('li');
            [...li.childNodes]
              .filter((x) => !isList(x))
              .forEach((x) => own.appendChild(x.cloneNode(true)));
            out.push('  '.repeat(depth) + mark + ' ' + inline(own).trim());
            for (const s of [...li.children].filter(isList))
              out.push(block({ children: [s] }, depth + 1));
          });
        } else if (t === 'TABLE') {
          const rows = [...c.querySelectorAll('tr')].map((tr) =>
            [...tr.children].map((td) => inline(td).trim().replace(/\|/g, '\\|')),
          );
          if (rows.length) {
            const w = Math.max(...rows.map((r) => r.length));
            const pad = (r) => {
              while (r.length < w) r.push('');
              return '| ' + r.join(' | ') + ' |';
            };
            out.push(
              [pad(rows[0]), '|' + ' --- |'.repeat(w), ...rows.slice(1).map(pad)].join('\n'),
            );
          }
        } else if (c.children.length && !['A', 'SPAN', 'STRONG', 'B', 'EM', 'I'].includes(t)) {
          const inner = block(c, depth);
          if (inner) out.push(inner);
        } else {
          const s = inline(c).trim();
          if (s) out.push(s);
        }
      }
      return out.join('\n\n');
    };
    return block(root);
  };

  const pages = [];
  for (let i = 0; i < SLUGS.length; i++) {
    if (i) await new Promise((r) => setTimeout(r, DELAY_MS));
    const url = base + SLUGS[i];
    try {
      const res = await fetch(url, { credentials: 'include' });
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const wrap = doc.querySelector('#faqwrap');
      const challenge = !wrap && /verify you are human|challenge-platform|cf-turnstile/i.test(html);
      pages.push({
        slug: SLUGS[i],
        url,
        status: res.status,
        title: doc.title,
        challenge,
        html: wrap ? wrap.outerHTML : null,
        md: wrap ? md(wrap) : null,
      });
      if (!wrap) break;
    } catch (e) {
      pages.push({ slug: SLUGS[i], url, error: String(e) });
      break;
    }
  }
  return { capturedAt: new Date().toISOString(), base, pages };
};
