#!/usr/bin/env python3
"""Render SSO UAT Markdown audit docs to self-contained, print-ready HTML.

No external dependencies, no CDN, no JavaScript.
"""
from __future__ import annotations

import datetime as dt
import html
import re
import subprocess
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
SOURCES = [
    ROOT / 'docs/audits/fr-uc-sso-uat-audit.md',
    ROOT / 'docs/audits/fr-uc-sso-uat-runbook-template.md',
]

CSS = r'''
:root {
  color-scheme: light;
  --bg: #f8fafc;
  --panel: #ffffff;
  --ink: #111827;
  --muted: #4b5563;
  --line: #d1d5db;
  --soft-line: #e5e7eb;
  --brand: #0f766e;
  --brand-ink: #0f172a;
  --accent: #2563eb;
  --risk: #b45309;
  --danger: #b91c1c;
  --ok: #047857;
  --partial: #a16207;
  --gap: #b91c1c;
  --blocked: #7c2d12;
  --code-bg: #f1f5f9;
  --shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background: linear-gradient(180deg, #eef2ff 0, var(--bg) 18rem);
  color: var(--ink);
  line-height: 1.62;
}

a { color: var(--accent); text-underline-offset: 0.18em; }
a:hover { color: var(--brand); }
.skip-link {
  position: absolute;
  left: 1rem;
  top: -4rem;
  z-index: 10;
  padding: 0.6rem 0.9rem;
  border-radius: 0.5rem;
  background: var(--ink);
  color: #fff;
}
.skip-link:focus { top: 1rem; }

.page-shell {
  width: min(1180px, calc(100% - 32px));
  margin: 0 auto;
  padding: 2rem 0 4rem;
}

.document-header {
  margin-bottom: 1.4rem;
  padding: 2rem;
  border: 1px solid rgba(15, 118, 110, 0.18);
  border-radius: 1.25rem;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: var(--shadow);
}
.eyebrow {
  margin: 0 0 0.55rem;
  color: var(--brand);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
h1, h2, h3, h4 {
  color: var(--brand-ink);
  line-height: 1.24;
}
h1 {
  margin: 0;
  font-size: clamp(1.8rem, 4vw, 3.1rem);
  letter-spacing: -0.035em;
}
.subtitle {
  margin: 0.85rem 0 0;
  max-width: 74ch;
  color: var(--muted);
  font-size: 1.03rem;
}
.doc-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.7rem;
  margin: 1.2rem 0 0;
  padding: 0;
  list-style: none;
}
.doc-meta li {
  padding: 0.75rem 0.85rem;
  border: 1px solid var(--soft-line);
  border-radius: 0.75rem;
  background: #f8fafc;
  color: var(--muted);
  font-size: 0.9rem;
}
.doc-meta strong { display: block; color: var(--ink); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; }
.front-matter {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 0.7rem;
  margin: 0 0 1.35rem;
}
.front-matter-card {
  padding: 0.75rem 0.85rem;
  border: 1px solid var(--soft-line);
  border-radius: 0.75rem;
  background: #f8fafc;
}
.front-matter-key {
  display: block;
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.front-matter-value { display: block; margin: 0.22rem 0 0; }

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 1.25rem;
  align-items: start;
}
main {
  padding: 1.3rem min(2rem, 4vw);
  border: 1px solid var(--soft-line);
  border-radius: 1rem;
  background: var(--panel);
  box-shadow: var(--shadow);
}
.toc {
  position: sticky;
  top: 1rem;
  max-height: calc(100vh - 2rem);
  overflow: auto;
  padding: 1rem;
  border: 1px solid var(--soft-line);
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: var(--shadow);
}
.toc h2 {
  margin: 0 0 0.7rem;
  font-size: 0.86rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.toc ol {
  margin: 0;
  padding-left: 1.1rem;
}
.toc li { margin: 0.35rem 0; color: var(--muted); font-size: 0.9rem; }
.toc a { color: inherit; text-decoration: none; }
.toc a:hover { color: var(--brand); text-decoration: underline; }

main h2 {
  margin-top: 2.1rem;
  padding-top: 0.9rem;
  border-top: 1px solid var(--soft-line);
  font-size: 1.45rem;
}
main h2:first-child { margin-top: 0; border-top: 0; }
main h3 { margin-top: 1.5rem; font-size: 1.13rem; }
main p, main li { max-width: 86ch; }
ul, ol { padding-left: 1.35rem; }
li + li { margin-top: 0.25rem; }

.table-wrap {
  width: 100%;
  overflow-x: auto;
  margin: 1rem 0 1.35rem;
  border: 1px solid var(--soft-line);
  border-radius: 0.85rem;
  background: #fff;
}
table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  min-width: 720px;
  font-size: 0.92rem;
}
th, td {
  padding: 0.72rem 0.8rem;
  border-bottom: 1px solid var(--soft-line);
  vertical-align: top;
  text-align: left;
}
th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f8fafc;
  color: #1f2937;
  font-weight: 800;
}
tr:last-child td { border-bottom: 0; }
tbody tr:nth-child(even) td { background: #fcfcfd; }

code {
  padding: 0.12rem 0.32rem;
  border: 1px solid #dbe4ee;
  border-radius: 0.35rem;
  background: var(--code-bg);
  color: #0f172a;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 0.88em;
}
pre {
  overflow: auto;
  padding: 1rem;
  border-radius: 0.85rem;
  background: #0f172a;
  color: #e2e8f0;
}
pre code { padding: 0; border: 0; background: transparent; color: inherit; }

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.12rem 0.48rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 800;
  line-height: 1.5;
  white-space: nowrap;
}
.badge-ready, .badge-pass, .badge-ok { background: #dcfce7; color: var(--ok); }
.badge-partial, .badge-risk { background: #fef3c7; color: var(--partial); }
.badge-gap, .badge-fail { background: #fee2e2; color: var(--gap); }
.badge-blocked { background: #ffedd5; color: var(--blocked); }
.badge-api { background: #dbeafe; color: #1d4ed8; }
.callout {
  margin: 1rem 0;
  padding: 0.95rem 1rem;
  border-left: 4px solid var(--brand);
  border-radius: 0.5rem;
  background: #f0fdfa;
}

footer {
  margin-top: 1.4rem;
  color: var(--muted);
  font-size: 0.86rem;
  text-align: center;
}

@media (max-width: 960px) {
  .layout { grid-template-columns: 1fr; }
  .toc { position: static; max-height: none; order: -1; }
  table { min-width: 680px; }
}

@media print {
  :root { --bg: #fff; --panel: #fff; --shadow: none; }
  body { background: #fff; color: #000; font-size: 10.5pt; }
  .page-shell { width: 100%; padding: 0; }
  .document-header, main, .toc { box-shadow: none; border-color: #bbb; }
  .layout { display: block; }
  .toc { position: static; page-break-after: always; }
  a { color: #000; text-decoration: none; }
  h1, h2, h3 { break-after: avoid; }
  table, tr, td, th { break-inside: avoid; }
  th { position: static; }
  .table-wrap { overflow: visible; border: 0; }
  table { min-width: 0; font-size: 8.7pt; }
}
'''

STATUS_CLASSES = [
    ('PASS-WITH-RISK', 'risk'),
    ('PASS', 'pass'),
    ('FAIL', 'fail'),
    ('BLOCKED', 'blocked'),
    ('Ready', 'ready'),
    ('Implemented', 'ok'),
    ('Partial', 'partial'),
    ('Gap', 'gap'),
    ('API-only', 'api'),
    ('Out of scope', 'blocked'),
    ('In scope', 'ready'),
]


def git_value(args: list[str], fallback: str = 'unknown') -> str:
    try:
        return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip() or fallback
    except Exception:
        return fallback


def slugify(text: str, seen: set[str]) -> str:
    raw = re.sub(r'<[^>]+>', '', text)
    raw = html.unescape(raw).lower()
    slug = re.sub(r'[^a-z0-9]+', '-', raw).strip('-') or 'section'
    base = slug
    i = 2
    while slug in seen:
        slug = f'{base}-{i}'
        i += 1
    seen.add(slug)
    return slug


def inline_md(text: str) -> str:
    placeholders: list[str] = []

    def code_repl(match: re.Match[str]) -> str:
        placeholders.append(f'<code>{html.escape(match.group(1))}</code>')
        return f'\x00{len(placeholders)-1}\x00'

    text = re.sub(r'`([^`]+)`', code_repl, text)
    text = html.escape(text)
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    # Plain URLs are rare here, but make them usable when not inside code.
    text = re.sub(r'(https://[^\s<]+)', r'<a href="\1">\1</a>', text)
    text = decorate_status(text)
    for i, value in enumerate(placeholders):
        text = text.replace(f'\x00{i}\x00', value)
    return text


def decorate_status(fragment: str) -> str:
    # Decorate standalone status-ish phrases, without touching code blocks.
    for label, klass in STATUS_CLASSES:
        escaped = html.escape(label)
        pattern = rf'(?<![\w-]){re.escape(escaped)}(?![\w-])'
        fragment = re.sub(pattern, f'<span class="badge badge-{klass}">{escaped}</span>', fragment)
    return fragment


def split_table_row(line: str) -> list[str]:
    row = line.strip()
    if row.startswith('|'):
        row = row[1:]
    if row.endswith('|'):
        row = row[:-1]
    # Docs do not use escaped pipes outside inline code; preserve simple split.
    return [cell.strip() for cell in row.split('|')]


def is_table_sep(line: str) -> bool:
    cells = split_table_row(line)
    return bool(cells) and all(re.fullmatch(r':?-{3,}:?', c.strip()) for c in cells)


def render_table(lines: list[str]) -> str:
    header = split_table_row(lines[0])
    body_lines = lines[2:] if len(lines) > 1 and is_table_sep(lines[1]) else lines[1:]
    out = ['<div class="table-wrap" role="region" aria-label="Scrollable table" tabindex="0"><table>']
    out.append('<thead><tr>')
    out.extend(f'<th scope="col">{inline_md(cell)}</th>' for cell in header)
    out.append('</tr></thead>')
    out.append('<tbody>')
    for row_line in body_lines:
        cells = split_table_row(row_line)
        if len(cells) < len(header):
            cells += [''] * (len(header) - len(cells))
        out.append('<tr>')
        out.extend(f'<td>{inline_md(cell)}</td>' for cell in cells[:len(header)])
        out.append('</tr>')
    out.append('</tbody></table></div>')
    return '\n'.join(out)


def flush_paragraph(buf: list[str], out: list[str]) -> None:
    if not buf:
        return
    text = ' '.join(part.strip() for part in buf).strip()
    if text:
        if text.lower().startswith('note:') or text.lower().startswith('warning:'):
            out.append(f'<div class="callout">{inline_md(text)}</div>')
        else:
            out.append(f'<p>{inline_md(text)}</p>')
    buf.clear()


def render_front_matter(lines: list[str]) -> str:
    rows: list[str] = []
    for line in lines:
        match = re.match(r'^\*\*(.+?):\*\*\s*(.+)$', line.strip())
        if not match:
            continue
        key, value = match.groups()
        rows.append(f'<div class="front-matter-card"><span class="front-matter-key">{inline_md(key)}</span><span class="front-matter-value">{inline_md(value)}</span></div>')
    if not rows:
        return ''
    return '<section class="front-matter" aria-label="Document front matter">\n' + '\n'.join(rows) + '\n</section>'


def render_markdown(md: str) -> tuple[str, list[tuple[int, str, str]]]:
    lines = md.splitlines()
    out: list[str] = []
    toc: list[tuple[int, str, str]] = []
    para: list[str] = []
    seen: set[str] = set()
    i = 0
    list_stack: list[str] = []

    def close_lists() -> None:
        while list_stack:
            out.append(f'</{list_stack.pop()}>')

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            flush_paragraph(para, out)
            close_lists()
            i += 1
            continue

        if stripped.startswith('|') and i + 1 < len(lines) and is_table_sep(lines[i + 1]):
            flush_paragraph(para, out)
            close_lists()
            table_lines = [line, lines[i + 1]]
            i += 2
            while i < len(lines) and lines[i].strip().startswith('|'):
                table_lines.append(lines[i])
                i += 1
            out.append(render_table(table_lines))
            continue

        if stripped.startswith('```'):
            flush_paragraph(para, out)
            close_lists()
            fence = stripped[3:].strip()
            i += 1
            code_lines: list[str] = []
            while i < len(lines) and not lines[i].strip().startswith('```'):
                code_lines.append(lines[i])
                i += 1
            if i < len(lines):
                i += 1
            klass = f' class="language-{html.escape(fence)}"' if fence else ''
            out.append(f'<pre><code{klass}>{html.escape(chr(10).join(code_lines))}</code></pre>')
            continue

        heading = re.match(r'^(#{1,4})\s+(.+)$', stripped)
        if heading:
            flush_paragraph(para, out)
            close_lists()
            level = len(heading.group(1))
            label = inline_md(heading.group(2).strip())
            slug = slugify(label, seen)
            toc.append((level, re.sub(r'<[^>]+>', '', label), slug))
            out.append(f'<h{level} id="{slug}"><a class="anchor" href="#{slug}" aria-label="Permalink to this section">#</a> {label}</h{level}>')
            i += 1
            continue

        bullet = re.match(r'^[-*]\s+(.+)$', stripped)
        ordered = re.match(r'^\d+[.]\s+(.+)$', stripped)
        if bullet or ordered:
            flush_paragraph(para, out)
            tag = 'ul' if bullet else 'ol'
            if not list_stack or list_stack[-1] != tag:
                close_lists()
                list_stack.append(tag)
                out.append(f'<{tag}>')
            content = bullet.group(1) if bullet else ordered.group(1)
            out.append(f'<li>{inline_md(content)}</li>')
            i += 1
            continue

        close_lists()
        para.append(line)
        i += 1

    flush_paragraph(para, out)
    close_lists()
    return '\n'.join(out), toc


def toc_html(toc: Iterable[tuple[int, str, str]]) -> str:
    items = []
    for level, label, slug in toc:
        if level <= 3:
            indent = ' style="margin-left: %.1frem"' % max(0, (level - 2) * 0.8)
            items.append(f'<li{indent}><a href="#{slug}">{html.escape(label)}</a></li>')
    return '<ol>\n' + '\n'.join(items) + '\n</ol>'


def title_from_md(md: str, fallback: str) -> str:
    for line in md.splitlines():
        if line.startswith('# '):
            return line[2:].strip()
    return fallback


def subtitle_for(path: Path) -> str:
    if path.name.endswith('audit.md'):
        return 'Traceability, readiness status, evidence map, risks, and UAT scenarios for SSO FR/UC coverage.'
    return 'Reusable execution log, evidence checklist, defect register, and stakeholder signoff template.'


def build_page(path: Path) -> None:
    md = path.read_text()
    title = title_from_md(md, path.stem)
    body_md = re.sub(r'^# .+\n+', '', md, count=1)
    first_section = re.search(r'(?m)^##\s+', body_md)
    front_lines: list[str] = []
    if first_section:
        preface = body_md[:first_section.start()].strip('\n')
        if preface and all(re.match(r'^\*\*.+?:\*\*\s+.+$', ln.strip()) for ln in preface.splitlines() if ln.strip()):
            front_lines = [ln for ln in preface.splitlines() if ln.strip()]
            body_md = body_md[first_section.start():]
    body, toc = render_markdown(body_md)
    front_html = render_front_matter(front_lines)
    if front_html:
        body = front_html + '\n' + body
    now = dt.datetime.now().astimezone().strftime('%Y-%m-%d %H:%M %Z')
    commit = git_value(['log', '-1', '--format=%h', '--', str(path.relative_to(ROOT))])
    branch = git_value(['branch', '--show-current'])
    rel = path.relative_to(ROOT)
    out_path = path.with_suffix('.html')
    page = f'''<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>{html.escape(title)}</title>
  <style>{CSS}</style>
</head>
<body>
  <a class="skip-link" href="#content">Skip to content</a>
  <div class="page-shell">
    <header class="document-header">
      <p class="eyebrow">SSO UAT Documentation</p>
      <h1>{inline_md(title)}</h1>
      <p class="subtitle">{html.escape(subtitle_for(path))}</p>
      <ul class="doc-meta" aria-label="Document metadata">
        <li><strong>Source</strong><code>{html.escape(str(rel))}</code></li>
        <li><strong>Generated</strong>{html.escape(now)}</li>
        <li><strong>Branch</strong><code>{html.escape(branch)}</code></li>
        <li><strong>Source docs commit</strong><code>{html.escape(commit)}</code></li>
      </ul>
    </header>
    <div class="layout">
      <main id="content" tabindex="-1">
{body}
      </main>
      <aside class="toc" aria-label="Table of contents">
        <h2>Contents</h2>
        {toc_html(toc)}
      </aside>
    </div>
    <footer>
      Self-contained HTML. No external assets. Print-ready. Security artifacts must remain redacted.
    </footer>
  </div>
</body>
</html>
'''
    out_path.write_text(page)
    print(out_path.relative_to(ROOT))


for source in SOURCES:
    build_page(source)
