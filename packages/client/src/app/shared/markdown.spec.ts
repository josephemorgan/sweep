import { TestBed } from '@angular/core/testing';
import { renderMarkdown } from './markdown';
import { MarkdownView } from './markdown-view';

function dom(html: string): HTMLDivElement {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

describe('renderMarkdown (spec §3.4, §6.4)', () => {
  it('renders CommonMark plus GFM tables and strikethrough', () => {
    const html = renderMarkdown(
      '## Arrival\n\nBuy a **lantern**.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n~~old~~',
    );
    expect(html).toContain('<h2>Arrival</h2>');
    expect(html).toContain('<strong>lantern</strong>');
    expect(html).toContain('<table>');
    expect(html).toContain('<del>old</del>');
  });

  it('shows raw HTML as text', () => {
    const div = dom(renderMarkdown('Hi <script>alert(1)</script> <b onclick="x()">b</b>'));
    expect(div.querySelector('script, b, [onclick]')).toBeNull();
    expect(div.textContent).toContain('<script>alert(1)</script>');
  });

  it('shows images as their alt text', () => {
    const div = dom(renderMarkdown('![a map](https://x.test/m.png)'));
    expect(div.querySelector('img')).toBeNull();
    expect(div.textContent).toContain('a map');
  });

  it('allows only http, https and mailto links, in a new tab', () => {
    const div = dom(
      renderMarkdown(
        '[ok](https://sweep.test) [mail](mailto:a@b.test) [bad](javascript:alert(1)) [rel](/runs)',
      ),
    );
    const links = [...div.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'https://sweep.test',
      'mailto:a@b.test',
    ]);
    for (const a of links) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    }
    expect(div.textContent).toContain('bad');
    expect(div.textContent).toContain('rel');
  });

  it('keeps GFM table alignment', () => {
    const div = dom(renderMarkdown('| a | b |\n|:-:|--:|\n| 1 | 2 |'));
    expect([...div.querySelectorAll('th')].map((c) => c.getAttribute('align'))).toEqual([
      'center',
      'right',
    ]);
    expect([...div.querySelectorAll('td')].map((c) => c.getAttribute('align'))).toEqual([
      'center',
      'right',
    ]);
  });

  it('does not double-escape character references in link hrefs', () => {
    const a = dom(
      renderMarkdown('[t](https://x.test/?a=1&amp;b=2) [u](https://x.test/?c=1&d=2)'),
    ).querySelectorAll('a');
    expect(a[0]!.getAttribute('href')).toBe('https://x.test/?a=1&b=2');
    expect(a[1]!.getAttribute('href')).toBe('https://x.test/?c=1&d=2');
  });

  it('keeps GFM task list state as text', () => {
    const div = dom(renderMarkdown('- [ ] a\n- [x] b'));
    expect(div.querySelector('input')).toBeNull();
    const items = [...div.querySelectorAll('li')].map((li) => li.textContent?.trim());
    expect(items).toEqual(['[ ] a', '[x] b']);
  });

  it('renders autolinks with the same target and rel', () => {
    const div = dom(renderMarkdown('<https://x.test> www.x.test a@b.test'));
    const links = [...div.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'https://x.test',
      'http://www.x.test',
      'mailto:a@b.test',
    ]);
    for (const a of links) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });

  describe('hostile input', () => {
    const hostile: Record<string, string> = {
      'script tag': '<script>alert(1)</script>',
      'img onerror': '<img src=x onerror=alert(1)>',
      'img onerror in block': 'text\n\n<img src=x onerror="alert(1)">\n\nmore',
      'javascript link': '[x](javascript:alert(1))',
      'mixed-case javascript link': '[x](JaVaScRiPt:alert(1))',
      'data link': '[x](data:text/html,<script>alert(1)</script>)',
      'javascript autolink': '<javascript:alert(1)>',
      'entity-encoded scheme': '[x](&#106;avascript:alert(1))',
      'hex entity scheme': '[x](&#x6A;avascript:alert(1))',
      'tab inside scheme': '[x](java\tscript:alert(1))',
      'vbscript link': '[x](vbscript:msgbox(1))',
      'protocol-relative link': '[x](//evil.test/a)',
      'reference-style javascript link': '[x][r]\n\n[r]: javascript:alert(1)',
      'image with javascript src': '![x](javascript:alert(1))',
      svg: '<svg onload=alert(1)></svg>',
    };

    for (const [name, source] of Object.entries(hostile)) {
      it(`neutralises ${name}`, () => {
        const html = renderMarkdown(source);
        const div = dom(html);
        expect(
          div.querySelector('script, img, svg, iframe, [onerror], [onload], [onclick]'),
        ).toBeNull();
        expect(div.querySelector('a')).toBeNull();
        expect(html).not.toMatch(/href\s*=\s*["']?\s*(?:javascript|data|vbscript):/i);
      });
    }

    it('keeps the visible text of a blocked link', () => {
      expect(dom(renderMarkdown('[click me](javascript:alert(1))')).textContent).toContain(
        'click me',
      );
    });
  });

  it('MarkdownView binds the rendered HTML', async () => {
    const fixture = TestBed.createComponent(MarkdownView);
    fixture.componentRef.setInput('source', 'Take the **lantern**.');
    await fixture.whenStable();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.prose-md strong')?.textContent,
    ).toBe('lantern');
  });
});
