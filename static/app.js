const editor = document.getElementById('editor');
const splitEditor = document.getElementById('splitEditor');
const preview = document.getElementById('preview');
const splitPreview = document.getElementById('splitPreview');
const toc = document.getElementById('toc');
const statusEl = document.getElementById('status');
const wordCount = document.getElementById('wordCount');
const schemaEditor = document.getElementById('schemaEditor');
const prdSelect = document.getElementById('prdSelect');
const schemaSelect = document.getElementById('schemaSelect');
const currentPrdLabel = document.getElementById('currentPrdLabel');
const currentSchemaLabel = document.getElementById('currentSchemaLabel');
const main = document.querySelector('.main');

let currentMarkdown = '';
let currentSchemaContent = '';
let currentPrdFile = '';
let currentSchemaFile = '';
let currentHeadings = [];
let isPrdDirty = false;
let isSchemaDirty = false;
let splitPreviewSyncFrame = null;

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
    .replace(/[^\u3131-\uD79Da-z0-9\-_]/g, '');
}

function extractHeadings(md) {
  const lines = md.split('\n');
  const result = [];
  const seenIds = new Map();

  lines.forEach((line, lineIndex) => {
    const match = /^(#{1,3})\s+(.+)$/.exec(line.trim());
    if (!match) return;
    const level = match[1].length;
    const text = match[2].replace(/[#`*_]/g, '').trim();
    const baseId = slugify(text) || `heading-${result.length + 1}`;
    const count = seenIds.get(baseId) || 0;
    seenIds.set(baseId, count + 1);
    const id = count === 0 ? baseId : `${baseId}-${count + 1}`;
    result.push({ level, text, id, lineIndex });
  });

  return result;
}

function headingDomId(prefix, heading) {
  return `${prefix}-${heading.id}`;
}

function assignHeadingIds(container, headings, prefix) {
  const headingEls = container.querySelectorAll('h1, h2, h3');
  headingEls.forEach((el, index) => {
    if (headings[index]) el.id = headingDomId(prefix, headings[index]);
  });
}

function renderMarkdown(md) {
  const headings = extractHeadings(md);
  currentHeadings = headings;
  let html = marked.parse(md);
  html = DOMPurify.sanitize(html);

  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;

  preview.innerHTML = wrapper.innerHTML;
  splitPreview.innerHTML = wrapper.innerHTML;
  assignHeadingIds(preview, headings, 'preview');
  assignHeadingIds(splitPreview, headings, 'split');
  renderToc(headings);
  wordCount.textContent = `${md.length.toLocaleString()} chars`;
}

function scrollTextareaToLine(textarea, lineIndex) {
  const style = window.getComputedStyle(textarea);
  const fontSize = parseFloat(style.fontSize) || 15;
  const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.65;
  const targetTop = Math.max(0, lineIndex * lineHeight - 24);
  textarea.scrollTo({
    top: Math.min(targetTop, textarea.scrollHeight - textarea.clientHeight),
    behavior: 'smooth'
  });
}

function getTextareaLineIndex(textarea) {
  const style = window.getComputedStyle(textarea);
  const fontSize = parseFloat(style.fontSize) || 15;
  const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.65;
  return Math.max(0, Math.round(textarea.scrollTop / lineHeight));
}

function scrollPanelToHeading(container, heading, prefix) {
  const target = container.querySelector(`#${CSS.escape(headingDomId(prefix, heading))}`);
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function nearestHeadingForLine(lineIndex) {
  let nearest = currentHeadings[0];
  for (const heading of currentHeadings) {
    if (heading.lineIndex > lineIndex) break;
    nearest = heading;
  }
  return nearest;
}

function currentPreviewLineIndex() {
  if (currentHeadings.length === 0) return 0;

  const topBoundary = document.querySelector('.tabs').getBoundingClientRect().bottom + 16;
  let nearest = currentHeadings[0];

  for (const heading of currentHeadings) {
    const target = preview.querySelector(`#${CSS.escape(headingDomId('preview', heading))}`);
    if (!target) continue;
    if (target.getBoundingClientRect().top <= topBoundary) {
      nearest = heading;
      continue;
    }
    break;
  }

  return nearest.lineIndex;
}

function activeTabName() {
  return document.querySelector('.tab.active')?.dataset.tab || 'preview';
}

function currentScrollContext() {
  const tabName = activeTabName();
  if (tabName === 'preview') return { lineIndex: currentPreviewLineIndex() };
  if (tabName === 'edit') return { lineIndex: getTextareaLineIndex(editor) };
  if (tabName === 'split') return { lineIndex: getTextareaLineIndex(splitEditor) };
  return null;
}

function applyScrollContext(tabName, context) {
  if (!context || !['preview', 'edit', 'split'].includes(tabName)) return;

  const lineIndex = Math.max(0, context.lineIndex || 0);
  const heading = nearestHeadingForLine(lineIndex);

  if (tabName === 'preview') {
    if (heading) scrollPanelToHeading(preview, heading, 'preview');
    return;
  }

  if (tabName === 'edit') {
    scrollTextareaToLine(editor, lineIndex);
    return;
  }

  scrollTextareaToLine(splitEditor, lineIndex);
  if (heading) scrollPanelToHeading(splitPreview, heading, 'split');
}

function scrollToHeading(heading) {
  const isSplitMode = document.getElementById('splitPanel').classList.contains('active');
  const isPreviewMode = document.getElementById('previewPanel').classList.contains('active');

  if (isSplitMode) {
    scrollTextareaToLine(splitEditor, heading.lineIndex);
    scrollPanelToHeading(splitPreview, heading, 'split');
    return;
  }

  if (isPreviewMode) {
    scrollPanelToHeading(preview, heading, 'preview');
  }
}

function syncSplitEditorFromPreview() {
  if (!document.getElementById('splitPanel').classList.contains('active')) return;

  const previewMax = splitPreview.scrollHeight - splitPreview.clientHeight;
  const editorMax = splitEditor.scrollHeight - splitEditor.clientHeight;
  const ratio = previewMax > 0 ? splitPreview.scrollTop / previewMax : 0;
  splitEditor.scrollTop = Math.max(0, editorMax * ratio);
}

function requestSplitPreviewSync() {
  if (splitPreviewSyncFrame !== null) return;
  splitPreviewSyncFrame = requestAnimationFrame(() => {
    splitPreviewSyncFrame = null;
    syncSplitEditorFromPreview();
  });
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
      scrollToHeading(h);
    });
    toc.appendChild(a);
  });
}

function setMarkdown(md) {
  currentMarkdown = md;
  editor.value = md;
  splitEditor.value = md;
  isPrdDirty = false;
  renderMarkdown(md);
}

function syncFromEditor(value) {
  currentMarkdown = value;
  if (editor.value !== value) editor.value = value;
  if (splitEditor.value !== value) splitEditor.value = value;
  isPrdDirty = true;
  statusEl.textContent = currentPrdFile ? `Unsaved changes in ${currentPrdFile}` : 'Unsaved changes';
  renderMarkdown(value);
}

function setSchema(content) {
  currentSchemaContent = content;
  schemaEditor.value = content;
  isSchemaDirty = false;
}

function syncFromSchemaEditor(value) {
  currentSchemaContent = value;
  isSchemaDirty = true;
  statusEl.textContent = currentSchemaFile ? `Unsaved schema changes in ${currentSchemaFile}` : 'Unsaved schema changes';
}

function fileUrl(endpoint, file) {
  return file ? `${endpoint}?file=${encodeURIComponent(file)}` : endpoint;
}

function setSelectOptions(select, files) {
  select.innerHTML = '';
  files.forEach(file => {
    const option = document.createElement('option');
    option.value = file.path;
    option.textContent = file.path;
    select.appendChild(option);
  });
  select.disabled = files.length === 0;
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function loadDocuments() {
  const data = await fetchJson('/api/documents');
  setSelectOptions(prdSelect, data.prds);
  setSelectOptions(schemaSelect, data.schemas);

  if (data.prds.length > 0) {
    await loadPrd(data.prds[0].path);
  }
  if (data.schemas.length > 0) {
    await loadSchema(data.schemas[0].path);
  }
}

async function loadPrd(file = currentPrdFile) {
  statusEl.textContent = 'Loading PRD...';
  const data = await fetchJson(fileUrl('/api/prd', file));
  currentPrdFile = data.path;
  prdSelect.value = data.path;
  currentPrdLabel.textContent = `prds/${data.path}`;
  setMarkdown(data.content);
  statusEl.textContent = `Loaded ${data.path}`;
}

async function loadSchema(file = currentSchemaFile) {
  const data = await fetchJson(fileUrl('/api/schema', file));
  currentSchemaFile = data.path;
  schemaSelect.value = data.path;
  currentSchemaLabel.textContent = `schemas/${data.path}`;
  setSchema(data.content);
}

async function savePrd() {
  statusEl.textContent = 'Saving...';
  const data = await fetchJson('/api/prd', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file: currentPrdFile,
      content: currentMarkdown
    })
  });
  isPrdDirty = false;
  statusEl.textContent = `Saved ${data.path} at ${new Date().toLocaleTimeString()}`;
}

async function saveSchema() {
  statusEl.textContent = 'Saving schema...';
  const data = await fetchJson('/api/schema', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file: currentSchemaFile,
      content: currentSchemaContent
    })
  });
  isSchemaDirty = false;
  statusEl.textContent = `Saved schema ${data.path} at ${new Date().toLocaleTimeString()}`;
}

function canLeaveCurrentPrd() {
  return !isPrdDirty || confirm('저장하지 않은 PRD 변경사항이 있습니다. 다른 PRD로 이동할까요?');
}

function canLeaveCurrentSchema() {
  return !isSchemaDirty || confirm('저장하지 않은 schema 변경사항이 있습니다. 다른 schema로 이동할까요?');
}

function activateTab(tabName, options = {}) {
  const shouldPreserveScroll = options.preserveScroll !== false;
  const scrollContext = shouldPreserveScroll ? currentScrollContext() : null;

  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${tabName}"]`)?.classList.add('active');
  document.getElementById(`${tabName}Panel`)?.classList.add('active');
  main.classList.toggle('split-wide', tabName === 'split');

  requestAnimationFrame(() => applyScrollContext(tabName, scrollContext));
}

editor.addEventListener('input', e => syncFromEditor(e.target.value));
splitEditor.addEventListener('input', e => syncFromEditor(e.target.value));
splitPreview.addEventListener('scroll', requestSplitPreviewSync);
schemaEditor.addEventListener('input', e => syncFromSchemaEditor(e.target.value));

document.getElementById('saveBtn').addEventListener('click', () => {
  savePrd().catch(error => {
    statusEl.textContent = 'Save failed';
    console.error(error);
  });
});

document.getElementById('reloadBtn').addEventListener('click', () => {
  if (!canLeaveCurrentPrd()) return;
  loadPrd(currentPrdFile).catch(error => {
    statusEl.textContent = 'Reload failed';
    console.error(error);
  });
});

prdSelect.addEventListener('change', (e) => {
  const nextFile = e.target.value;
  if (!canLeaveCurrentPrd()) {
    prdSelect.value = currentPrdFile;
    return;
  }
  loadPrd(nextFile).catch(error => {
    statusEl.textContent = 'Load failed';
    prdSelect.value = currentPrdFile;
    console.error(error);
  });
});

schemaSelect.addEventListener('change', (e) => {
  if (!canLeaveCurrentSchema()) {
    schemaSelect.value = currentSchemaFile;
    return;
  }
  activateTab('schema');
  loadSchema(e.target.value).catch(error => {
    schemaEditor.value = 'Schema load failed';
    schemaSelect.value = currentSchemaFile;
    console.error(error);
  });
});

document.getElementById('reloadSchemaBtn').addEventListener('click', () => {
  if (!canLeaveCurrentSchema()) return;
  loadSchema(currentSchemaFile).catch(error => {
    statusEl.textContent = 'Schema reload failed';
    console.error(error);
  });
});

document.getElementById('saveSchemaBtn').addEventListener('click', () => {
  saveSchema().catch(error => {
    statusEl.textContent = 'Schema save failed';
    console.error(error);
  });
});

document.getElementById('themeBtn').addEventListener('click', () => {
  document.body.classList.toggle('dark');
  const isDark = document.body.classList.contains('dark');
  localStorage.setItem('prd-theme', isDark ? 'dark' : 'light');
  document.getElementById('themeBtn').textContent = isDark ? 'Light' : 'Dark';
});

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    activateTab(tab.dataset.tab);
  });
});

window.addEventListener('beforeunload', (event) => {
  if (!isPrdDirty && !isSchemaDirty) return;
  event.preventDefault();
  event.returnValue = '';
});

if (localStorage.getItem('prd-theme') === 'dark') {
  document.body.classList.add('dark');
  document.getElementById('themeBtn').textContent = 'Light';
}

loadDocuments().catch(error => {
  statusEl.textContent = 'Initial load failed';
  console.error(error);
});
