const editor = document.getElementById('editor');
const splitEditor = document.getElementById('splitEditor');
const preview = document.getElementById('preview');
const splitPreview = document.getElementById('splitPreview');
const toc = document.getElementById('toc');
const statusEl = document.getElementById('status');
const wordCount = document.getElementById('wordCount');
const schemaEditor = document.getElementById('schemaEditor');
const schemaSummary = document.getElementById('schemaSummary');
const changesSummary = document.getElementById('changesSummary');
const changesBody = document.getElementById('changesBody');
const prdSelect = document.getElementById('prdSelect');
const schemaSelect = document.getElementById('schemaSelect');
const currentPrdLabel = document.getElementById('currentPrdLabel');
const currentSchemaLabel = document.getElementById('currentSchemaLabel');
const main = document.querySelector('.main');
const savePrdBtn = document.getElementById('saveBtn');
const saveAsPrdBtn = document.getElementById('saveAsBtn');
const saveSchemaBtn = document.getElementById('saveSchemaBtn');
const prdDirtyBadge = document.getElementById('prdDirtyBadge');
const schemaDirtyBadge = document.getElementById('schemaDirtyBadge');
const schemaLinkStatus = document.getElementById('schemaLinkStatus');

let currentMarkdown = '';
let savedMarkdown = '';
let currentSchemaContent = '';
let currentPrdFile = '';
let currentSchemaFile = '';
let currentHeadings = [];
let schemaLinks = {};
let isPrdDirty = false;
let isSchemaDirty = false;
let splitPreviewSyncFrame = null;
let suppressSplitPreviewSyncUntil = 0;

marked.setOptions({
  gfm: true,
  breaks: true,
  headerIds: false,
  mangle: false
});

if (window.mermaid) {
  window.mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'default'
  });
}

function addSidebarDocumentIcons() {
  [
    { badge: prdDirtyBadge, className: 'prd-doc-icon' },
    { badge: schemaDirtyBadge, className: 'schema-doc-icon' },
  ].forEach(({ badge, className }) => {
    const label = badge?.closest('.side-label-row')?.querySelector('.side-label');
    if (!label || label.querySelector('.doc-icon')) return;

    const icon = document.createElement('span');
    icon.className = `doc-icon ${className}`;
    icon.setAttribute('aria-hidden', 'true');
    label.prepend(icon);
  });
}

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

function renderMermaidBlocks(container) {
  const codeBlocks = container.querySelectorAll('pre > code.language-mermaid, pre > code.lang-mermaid');
  codeBlocks.forEach((codeBlock) => {
    const mermaidBlock = document.createElement('div');
    mermaidBlock.className = 'mermaid';
    mermaidBlock.textContent = codeBlock.textContent;
    codeBlock.closest('pre')?.replaceWith(mermaidBlock);
  });

  if (!window.mermaid) return;

  const mermaidBlocks = container.querySelectorAll('.mermaid');
  if (mermaidBlocks.length === 0) return;

  window.mermaid.run({ nodes: mermaidBlocks }).catch((error) => {
    console.error(error);
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
  renderMermaidBlocks(preview);
  renderMermaidBlocks(splitPreview);
  renderToc(headings);
  wordCount.textContent = `${md.length.toLocaleString()} chars`;
}

function lineDiff(oldText, newText) {
  const oldLines = oldText === '' ? [] : oldText.split('\n');
  const newLines = newText === '' ? [] : newText.split('\n');
  const rows = oldLines.length + 1;
  const cols = newLines.length + 1;
  const dp = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = oldLines.length - 1; i >= 0; i -= 1) {
    for (let j = newLines.length - 1; j >= 0; j -= 1) {
      dp[i][j] = oldLines[i] === newLines[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const result = [];
  let i = 0;
  let j = 0;
  while (i < oldLines.length && j < newLines.length) {
    if (oldLines[i] === newLines[j]) {
      result.push({ type: 'same', oldLine: i + 1, newLine: j + 1, text: oldLines[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: 'removed', oldLine: i + 1, newLine: '', text: oldLines[i] });
      i += 1;
    } else {
      result.push({ type: 'added', oldLine: '', newLine: j + 1, text: newLines[j] });
      j += 1;
    }
  }

  while (i < oldLines.length) {
    result.push({ type: 'removed', oldLine: i + 1, newLine: '', text: oldLines[i] });
    i += 1;
  }
  while (j < newLines.length) {
    result.push({ type: 'added', oldLine: '', newLine: j + 1, text: newLines[j] });
    j += 1;
  }

  return result;
}

function appendChangeRow(change) {
  const row = document.createElement('div');
  row.className = `change-row ${change.type}`;

  const marker = document.createElement('span');
  marker.className = 'change-marker';
  marker.textContent = change.type === 'added' ? '+' : change.type === 'removed' ? '-' : ' ';

  const oldLine = document.createElement('span');
  oldLine.className = 'change-line-number';
  oldLine.textContent = change.oldLine;

  const newLine = document.createElement('span');
  newLine.className = 'change-line-number';
  newLine.textContent = change.newLine;

  const text = document.createElement('code');
  text.textContent = change.text || ' ';

  row.append(marker, oldLine, newLine, text);
  changesBody.appendChild(row);
}

function renderChanges() {
  if (!changesSummary || !changesBody) return;

  changesBody.innerHTML = '';
  if (savedMarkdown === currentMarkdown) {
    changesSummary.textContent = 'No changes';
    const empty = document.createElement('div');
    empty.className = 'changes-empty';
    empty.textContent = 'No unsaved MD changes';
    changesBody.appendChild(empty);
    return;
  }

  const changes = lineDiff(savedMarkdown, currentMarkdown);
  const addedCount = changes.filter(change => change.type === 'added').length;
  const removedCount = changes.filter(change => change.type === 'removed').length;
  changesSummary.textContent = `${addedCount} added, ${removedCount} removed`;
  changes.forEach(appendChangeRow);
}

function scrollTextareaToLine(textarea, lineIndex, topOffset = 18) {
  const style = window.getComputedStyle(textarea);
  const fontSize = parseFloat(style.fontSize) || 15;
  const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.65;
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const targetTop = Math.max(0, paddingTop + (lineIndex * lineHeight) - topOffset);
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

function headingViewportOffset() {
  const tabs = document.querySelector('.tabs');
  return (tabs?.getBoundingClientRect().bottom || 0) + 18;
}

function scrollPanelToHeading(container, heading, prefix) {
  const target = container.querySelector(`#${CSS.escape(headingDomId(prefix, heading))}`);
  if (!target) return;

  if (container === splitPreview) {
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const nextTop = container.scrollTop + targetRect.top - containerRect.top - 18;
    container.scrollTo({
      top: Math.max(0, nextTop),
      behavior: 'smooth'
    });
    return;
  }

  window.scrollBy({
    top: target.getBoundingClientRect().top - headingViewportOffset(),
    behavior: 'smooth'
  });
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
  const isEditMode = document.getElementById('editPanel').classList.contains('active');
  const isPreviewMode = document.getElementById('previewPanel').classList.contains('active');

  if (isSplitMode) {
    suppressSplitPreviewSyncUntil = Date.now() + 900;
    scrollTextareaToLine(splitEditor, heading.lineIndex);
    scrollPanelToHeading(splitPreview, heading, 'split');
    window.setTimeout(() => scrollTextareaToLine(splitEditor, heading.lineIndex), 450);
    return;
  }

  if (isEditMode) {
    scrollTextareaToLine(editor, heading.lineIndex);
    editor.focus({ preventScroll: true });
    return;
  }

  if (isPreviewMode) {
    scrollPanelToHeading(preview, heading, 'preview');
  }
}

function syncSplitEditorFromPreview() {
  if (!document.getElementById('splitPanel').classList.contains('active')) return;
  if (Date.now() < suppressSplitPreviewSyncUntil) return;

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
  savedMarkdown = md;
  editor.value = md;
  splitEditor.value = md;
  setPrdDirty(false);
  renderMarkdown(md);
  renderChanges();
}

function syncFromEditor(value) {
  currentMarkdown = value;
  if (editor.value !== value) editor.value = value;
  if (splitEditor.value !== value) splitEditor.value = value;
  setPrdDirty(true);
  statusEl.textContent = currentPrdFile ? `Unsaved changes in ${currentPrdFile}` : 'Unsaved changes';
  renderMarkdown(value);
  renderChanges();
}

function setSchema(content) {
  currentSchemaContent = content;
  schemaEditor.value = content;
  setSchemaDirty(false);
  renderSchemaSummary(content);
}

function syncFromSchemaEditor(value) {
  currentSchemaContent = value;
  setSchemaDirty(true);
  statusEl.textContent = currentSchemaFile ? `Unsaved schema changes in ${currentSchemaFile}` : 'Unsaved schema changes';
  renderSchemaSummary(value);
}

function parseSchemaSummary(content) {
  const tables = [];
  const tablePattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[\w.]+?"?)\s*\(([\s\S]*?)\)\s*;/gi;
  let match;

  while ((match = tablePattern.exec(content)) !== null) {
    const tableName = match[1].replaceAll('"', '');
    const body = match[2];
    const columns = body
      .split('\n')
      .map(line => line.trim().replace(/,$/, ''))
      .filter(line => {
        if (!line) return false;
        return !/^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK|EXCLUDE)\b/i.test(line);
      })
      .map(line => line.split(/\s+/)[0].replaceAll('"', ''));

    tables.push({
      name: tableName,
      columns,
    });
  }

  const indexes = content.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\b/gi) || [];
  return { tables, indexCount: indexes.length };
}

function renderSchemaSummary(content) {
  const summary = parseSchemaSummary(content);
  schemaSummary.innerHTML = '';

  const overview = document.createElement('div');
  overview.className = 'schema-summary-overview';
  overview.textContent = `${summary.tables.length} tables · ${summary.indexCount} indexes`;
  schemaSummary.appendChild(overview);

  if (summary.tables.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'schema-summary-empty';
    empty.textContent = 'No CREATE TABLE statements found';
    schemaSummary.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'schema-summary-list';
  summary.tables.forEach(table => {
    const item = document.createElement('div');
    item.className = 'schema-summary-item';

    const name = document.createElement('strong');
    name.textContent = table.name;

    const meta = document.createElement('span');
    meta.textContent = `${table.columns.length} columns`;

    const columns = document.createElement('small');
    columns.textContent = table.columns.slice(0, 6).join(', ');

    item.append(name, meta, columns);
    list.appendChild(item);
  });
  schemaSummary.appendChild(list);
}

function updateDirtyIndicators() {
  prdDirtyBadge.textContent = isPrdDirty ? 'Modified' : 'Saved';
  prdDirtyBadge.classList.toggle('dirty', isPrdDirty);
  prdDirtyBadge.classList.toggle('clean', !isPrdDirty);
  savePrdBtn.textContent = isPrdDirty ? 'Save MD *' : 'Save MD';
  savePrdBtn.classList.toggle('dirty-action', isPrdDirty);

  schemaDirtyBadge.textContent = isSchemaDirty ? 'Modified' : 'Saved';
  schemaDirtyBadge.classList.toggle('dirty', isSchemaDirty);
  schemaDirtyBadge.classList.toggle('clean', !isSchemaDirty);
  saveSchemaBtn.textContent = isSchemaDirty ? 'Save Schema *' : 'Save Schema';
  saveSchemaBtn.classList.toggle('dirty-action', isSchemaDirty);
}

function setPrdDirty(isDirty) {
  isPrdDirty = isDirty;
  updateDirtyIndicators();
}

function setSchemaDirty(isDirty) {
  isSchemaDirty = isDirty;
  updateDirtyIndicators();
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

function updateSchemaLinkStatus() {
  const linkedSchema = schemaLinks[currentPrdFile];
  schemaLinkStatus.classList.toggle('linked', Boolean(linkedSchema));

  if (!currentPrdFile) {
    schemaLinkStatus.textContent = 'No MD selected';
    return;
  }
  if (!linkedSchema) {
    schemaLinkStatus.textContent = 'No schema linked';
    return;
  }
  if (linkedSchema === currentSchemaFile) {
    schemaLinkStatus.textContent = `Linked: ${linkedSchema}`;
    return;
  }
  schemaLinkStatus.textContent = `Linked: ${linkedSchema} (selected: ${currentSchemaFile || 'none'})`;
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function loadDocuments(options = {}) {
  const data = await fetchJson('/api/documents');
  const documents = data.documents || [];
  schemaLinks = data.links || {};
  setSelectOptions(prdSelect, documents);
  setSelectOptions(schemaSelect, data.schemas);

  if (documents.length > 0) {
    const nextPrd = documents.find(file => file.path === options.prdFile)?.path || documents[0].path;
    await loadPrd(nextPrd, { syncLinkedSchema: false });
  }
  if (data.schemas.length > 0) {
    const linkedSchema = schemaLinks[currentPrdFile];
    const nextSchema = data.schemas.find(file => file.path === options.schemaFile)?.path
      || data.schemas.find(file => file.path === linkedSchema)?.path
      || data.schemas[0].path;
    await loadSchema(nextSchema);
  }
  updateSchemaLinkStatus();
}

async function loadPrd(file = currentPrdFile, options = {}) {
  statusEl.textContent = 'Loading MD...';
  const data = await fetchJson(fileUrl('/api/md', file));
  currentPrdFile = data.path;
  prdSelect.value = data.path;
  currentPrdLabel.textContent = `md/${data.path}`;
  setMarkdown(data.content);
  updateSchemaLinkStatus();

  const linkedSchema = schemaLinks[data.path];
  if (options.syncLinkedSchema !== false && linkedSchema && linkedSchema !== currentSchemaFile) {
    await loadSchema(linkedSchema);
  }

  statusEl.textContent = `Loaded ${data.path}`;
}

async function loadSchema(file = currentSchemaFile) {
  const data = await fetchJson(fileUrl('/api/schema', file));
  currentSchemaFile = data.path;
  schemaSelect.value = data.path;
  currentSchemaLabel.textContent = `schemas/${data.path}`;
  setSchema(data.content);
  updateSchemaLinkStatus();
}

async function savePrd() {
  statusEl.textContent = 'Saving...';
  const data = await fetchJson('/api/md', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file: currentPrdFile,
      content: currentMarkdown
    })
  });
  setPrdDirty(false);
  const backupText = data.backup ? `, backup: ${data.backup}` : '';
  statusEl.textContent = `Saved ${data.path} at ${new Date().toLocaleTimeString()}${backupText}`;
}

async function savePrdAs() {
  const suggestedName = currentPrdFile
    ? currentPrdFile.replace(/(\.[^/.]+)$/, '_copy$1')
    : 'new_document.md';
  const requestedName = prompt('Save MD as', suggestedName);
  if (requestedName === null) return;

  const file = normalizeManagedFileName(requestedName, '.md');
  if (!file) return;

  statusEl.textContent = 'Saving MD as new file...';
  const data = await fetchJson('/api/md/file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file,
      content: currentMarkdown
    })
  });

  await loadDocuments({ prdFile: data.path, schemaFile: currentSchemaFile });
  savedMarkdown = currentMarkdown;
  setPrdDirty(false);
  renderChanges();
  statusEl.textContent = `Saved as ${data.path}`;
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
  setSchemaDirty(false);
  const backupText = data.backup ? `, backup: ${data.backup}` : '';
  statusEl.textContent = `Saved schema ${data.path} at ${new Date().toLocaleTimeString()}${backupText}`;
}

async function saveCurrentDocument() {
  if (activeTabName() === 'schema') {
    if (!isSchemaDirty) {
      statusEl.textContent = 'Schema already saved';
      return;
    }
    await saveSchema();
    return;
  }

  if (!isPrdDirty) {
      statusEl.textContent = 'MD already saved';
    return;
  }
  await savePrd();
}

async function setCurrentSchemaLink(schemaFile) {
  if (!currentPrdFile) {
    statusEl.textContent = 'No MD selected';
    return;
  }

  const data = await fetchJson('/api/md/link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prd_file: currentPrdFile,
      schema_file: schemaFile
    })
  });

  if (data.schema) {
    schemaLinks[data.path] = data.schema;
    statusEl.textContent = `Linked ${data.path} to ${data.schema}`;
  } else {
    delete schemaLinks[data.path];
    statusEl.textContent = `Cleared schema link for ${data.path}`;
  }
  updateSchemaLinkStatus();
}

function normalizeManagedFileName(fileName, defaultExtension) {
  const trimmed = fileName.trim().replaceAll('\\', '/');
  if (!trimmed) return '';
  return /\.[^/.]+$/.test(trimmed) ? trimmed : `${trimmed}${defaultExtension}`;
}

function managedFileConfig(kind) {
  if (kind === 'schema') {
    return {
      endpoint: '/api/schema/file',
      currentFile: currentSchemaFile,
      defaultExtension: '.sql',
      label: 'schema',
      canLeave: canLeaveCurrentSchema,
      selectAfter: (path) => loadDocuments({ prdFile: currentPrdFile, schemaFile: path }),
    };
  }

  return {
    endpoint: '/api/md/file',
    currentFile: currentPrdFile,
    defaultExtension: '.md',
    label: 'MD',
    canLeave: canLeaveCurrentPrd,
    selectAfter: (path) => loadDocuments({ prdFile: path, schemaFile: currentSchemaFile }),
  };
}

async function createManagedFile(kind) {
  const config = managedFileConfig(kind);
  const requestedName = prompt(`New ${config.label} file name`, `new_${config.label.toLowerCase()}${config.defaultExtension}`);
  if (requestedName === null) return;

  const file = normalizeManagedFileName(requestedName, config.defaultExtension);
  if (!file) return;

  const data = await fetchJson(config.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file })
  });
  await config.selectAfter(data.path);
  if (kind === 'schema') activateTab('schema');
  statusEl.textContent = `Created ${data.path}`;
}

async function renameManagedFile(kind) {
  const config = managedFileConfig(kind);
  if (!config.currentFile || !config.canLeave()) return;

  const requestedName = prompt(`Rename ${config.label} file`, config.currentFile);
  if (requestedName === null) return;

  const newFile = normalizeManagedFileName(requestedName, config.defaultExtension);
  if (!newFile || newFile === config.currentFile) return;

  const data = await fetchJson(config.endpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file: config.currentFile,
      new_file: newFile
    })
  });
  await config.selectAfter(data.path);
  if (kind === 'schema') activateTab('schema');
  statusEl.textContent = `Renamed to ${data.path}`;
}

async function deleteManagedFile(kind) {
  const config = managedFileConfig(kind);
  if (!config.currentFile || !config.canLeave()) return;

  const confirmed = confirm(`Delete ${config.label} file "${config.currentFile}"?`);
  if (!confirmed) return;

  const data = await fetchJson(config.endpoint, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: config.currentFile })
  });
  await loadDocuments({
    prdFile: kind === 'prd' ? '' : currentPrdFile,
    schemaFile: kind === 'schema' ? '' : currentSchemaFile,
  });
  statusEl.textContent = `Deleted ${data.path}`;
}

function canLeaveCurrentPrd() {
  return !isPrdDirty || confirm('저장하지 않은 MD 변경사항이 있습니다. 다른 문서로 이동할까요?');
}

function canLeaveCurrentSchema() {
  return !isSchemaDirty || confirm('저장하지 않은 schema 변경사항이 있습니다. 다른 schema로 이동할까요?');
}

function activateTab(tabName, options = {}) {
  const shouldPreserveScroll = options.preserveScroll !== false;
  const scrollContext = shouldPreserveScroll ? currentScrollContext() : null;

  if (tabName === 'changes') renderChanges();

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

savePrdBtn.addEventListener('click', () => {
  savePrd().catch(error => {
    statusEl.textContent = 'Save failed';
    console.error(error);
  });
});

saveAsPrdBtn.addEventListener('click', () => {
  savePrdAs().catch(error => {
    statusEl.textContent = 'Save as failed';
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

saveSchemaBtn.addEventListener('click', () => {
  saveSchema().catch(error => {
    statusEl.textContent = 'Schema save failed';
    console.error(error);
  });
});

document.getElementById('newPrdBtn').addEventListener('click', () => {
  createManagedFile('prd').catch(error => {
    statusEl.textContent = 'Create MD failed';
    console.error(error);
  });
});

document.getElementById('renamePrdBtn').addEventListener('click', () => {
  renameManagedFile('prd').catch(error => {
    statusEl.textContent = 'Rename MD failed';
    console.error(error);
  });
});

document.getElementById('deletePrdBtn').addEventListener('click', () => {
  deleteManagedFile('prd').catch(error => {
    statusEl.textContent = 'Delete MD failed';
    console.error(error);
  });
});

document.getElementById('newSchemaBtn').addEventListener('click', () => {
  createManagedFile('schema').catch(error => {
    statusEl.textContent = 'Create schema failed';
    console.error(error);
  });
});

document.getElementById('renameSchemaBtn').addEventListener('click', () => {
  renameManagedFile('schema').catch(error => {
    statusEl.textContent = 'Rename schema failed';
    console.error(error);
  });
});

document.getElementById('deleteSchemaBtn').addEventListener('click', () => {
  deleteManagedFile('schema').catch(error => {
    statusEl.textContent = 'Delete schema failed';
    console.error(error);
  });
});

document.getElementById('linkSchemaBtn').addEventListener('click', () => {
  setCurrentSchemaLink(currentSchemaFile).catch(error => {
    statusEl.textContent = 'Schema link failed';
    console.error(error);
  });
});

document.getElementById('clearSchemaLinkBtn').addEventListener('click', () => {
  setCurrentSchemaLink(null).catch(error => {
    statusEl.textContent = 'Clear schema link failed';
    console.error(error);
  });
});

document.addEventListener('keydown', (event) => {
  const isSaveShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's';
  if (!isSaveShortcut) return;

  event.preventDefault();
  saveCurrentDocument().catch(error => {
    statusEl.textContent = 'Save failed';
    console.error(error);
  });
});

document.getElementById('themeBtn').addEventListener('click', () => {
  document.body.classList.toggle('dark');
  const isDark = document.body.classList.contains('dark');
  localStorage.setItem('md-theme', isDark ? 'dark' : 'light');
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

if (localStorage.getItem('md-theme') === 'dark' || localStorage.getItem('prd-theme') === 'dark') {
  document.body.classList.add('dark');
  document.getElementById('themeBtn').textContent = 'Light';
}

addSidebarDocumentIcons();

loadDocuments().catch(error => {
  statusEl.textContent = 'Initial load failed';
  console.error(error);
});
