const editor = document.getElementById('editor');
const splitEditor = document.getElementById('splitEditor');
const preview = document.getElementById('preview');
const splitPreview = document.getElementById('splitPreview');
const toc = document.getElementById('toc');
const statusEl = document.getElementById('status');
const wordCount = document.getElementById('wordCount');
const schemaView = document.getElementById('schemaView');

let currentMarkdown = '';

marked.setOptions({
  gfm: true,
  breaks: true,
  headerIds: false,
  mangle: false
});

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[\s]+/g, '-')
    .replace(/[^가-힣a-z0-9\-_]/g, '');
}

function extractHeadings(md) {
  const lines = md.split('\n');
  const result = [];
  for (const line of lines) {
    const match = /^(#{1,3})\s+(.+)$/.exec(line.trim());
    if (!match) continue;
    const level = match[1].length;
    const text = match[2].replace(/[#`*_]/g, '').trim();
    result.push({ level, text, id: slugify(text) || `heading-${result.length + 1}` });
  }
  return result;
}

function renderMarkdown(md) {
  const headings = extractHeadings(md);
  let html = marked.parse(md);
  html = DOMPurify.sanitize(html);

  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  const headingEls = wrapper.querySelectorAll('h1, h2, h3');
  headingEls.forEach((el, index) => {
    if (headings[index]) el.id = headings[index].id;
  });

  preview.innerHTML = wrapper.innerHTML;
  splitPreview.innerHTML = wrapper.innerHTML;
  renderToc(headings);
  wordCount.textContent = `${md.length.toLocaleString()} chars`;
}

function renderToc(headings) {
  toc.innerHTML = '';
  if (headings.length === 0) {
    toc.innerHTML = '<span class="muted">목차 없음</span>';
    return;
  }
  headings.forEach(h => {
    const a = document.createElement('a');
    a.href = `#${h.id}`;
    a.textContent = h.text;
    a.className = `level-${h.level}`;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    toc.appendChild(a);
  });
}

function setMarkdown(md) {
  currentMarkdown = md;
  editor.value = md;
  splitEditor.value = md;
  renderMarkdown(md);
}

function syncFromEditor(value) {
  currentMarkdown = value;
  if (editor.value !== value) editor.value = value;
  if (splitEditor.value !== value) splitEditor.value = value;
  renderMarkdown(value);
}

async function loadPrd() {
  statusEl.textContent = 'Loading PRD...';
  const res = await fetch('/api/prd');
  const data = await res.json();
  setMarkdown(data.content);
  statusEl.textContent = 'Loaded';
}

async function loadSchema() {
  const res = await fetch('/api/schema');
  const data = await res.json();
  schemaView.textContent = data.content;
}

async function savePrd() {
  statusEl.textContent = 'Saving...';
  const res = await fetch('/api/prd', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: currentMarkdown })
  });
  if (!res.ok) {
    statusEl.textContent = 'Save failed';
    return;
  }
  statusEl.textContent = `Saved at ${new Date().toLocaleTimeString()}`;
}

editor.addEventListener('input', e => syncFromEditor(e.target.value));
splitEditor.addEventListener('input', e => syncFromEditor(e.target.value));
document.getElementById('saveBtn').addEventListener('click', savePrd);
document.getElementById('reloadBtn').addEventListener('click', loadPrd);

document.getElementById('themeBtn').addEventListener('click', () => {
  document.body.classList.toggle('dark');
  const isDark = document.body.classList.contains('dark');
  localStorage.setItem('prd-theme', isDark ? 'dark' : 'light');
  document.getElementById('themeBtn').textContent = isDark ? '☀️ Light' : '🌙 Dark';
});

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`${tab.dataset.tab}Panel`).classList.add('active');
  });
});

if (localStorage.getItem('prd-theme') === 'dark') {
  document.body.classList.add('dark');
  document.getElementById('themeBtn').textContent = '☀️ Light';
}

loadPrd();
loadSchema();
