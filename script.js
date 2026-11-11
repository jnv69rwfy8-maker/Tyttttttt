/* The Logic Matrix v3.0 — Full Featured */
(function () {
  'use strict';

  const STORAGE_KEY = 'logicMatrix_v3';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  // ---------- State ----------
  let state = {
    level: 1, solved: 0, unlocked: false, storyProgress: 15,
    notes: '', workspaceBlocks: [], codeEditor: '', promptText: '',
    theme: 'dark', fontSize: 16, animations: true, watermark: true, autosave: true,
    nodePositions: {}, zoom: 1, pan: { x: 0, y: 0 },
    terminalHistory: [], historyIndex: -1,
  };

  let dragNode = null, isPanning = false, panStart = { x: 0, y: 0 };
  let pyVars = {};

  // ---------- Storage ----------
  function save() {
    if (!state.autosave) return;
    try {
      const data = {
        level: state.level, solved: state.solved, unlocked: state.unlocked,
        storyProgress: state.storyProgress, notes: state.notes,
        workspaceBlocks: state.workspaceBlocks, codeEditor: state.codeEditor,
        promptText: state.promptText, theme: state.theme, fontSize: state.fontSize,
        animations: state.animations, watermark: state.watermark, autosave: state.autosave,
        savedAt: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      const el = $('#last-save-time');
      if (el) el.textContent = new Date().toLocaleTimeString('ar-EG');
      const ind = $('#save-indicator');
      if (ind) { ind.textContent = '● محفوظ'; ind.style.color = 'var(--green)'; }
    } catch (e) { console.warn('Save failed', e); }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      Object.assign(state, {
        level: data.level ?? 1, solved: data.solved ?? 0, unlocked: data.unlocked ?? false,
        storyProgress: data.storyProgress ?? 15, notes: data.notes ?? '',
        workspaceBlocks: data.workspaceBlocks ?? [], codeEditor: data.codeEditor ?? '',
        promptText: data.promptText ?? '', theme: data.theme ?? 'dark',
        fontSize: data.fontSize ?? 16, animations: data.animations ?? true,
        watermark: data.watermark ?? true, autosave: data.autosave ?? true,
      });
      if (data.savedAt) {
        const el = $('#last-save-time');
        if (el) el.textContent = new Date(data.savedAt).toLocaleString('ar-EG');
      }
    } catch (e) { console.warn('Load failed', e); }
  }

  function debounce(fn, ms) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }
  const debouncedSave = debounce(save, 600);

  // ---------- Theme ----------
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    document.documentElement.style.fontSize = state.fontSize + 'px';
    const wm = $('.watermark');
    if (wm) wm.classList.toggle('hidden', !state.watermark);
    $$('[data-theme-set]').forEach((b) => b.classList.toggle('active', b.dataset.themeSet === state.theme));
    $$('[data-fontsize]').forEach((b) => b.classList.toggle('active', +b.dataset.fontsize === state.fontSize));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = state.theme === 'dark' ? '#1a110a' : '#ebe4d8';
  }

  // ---------- Toast ----------
  function showToast(msg, type = '') {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast show ' + type;
    setTimeout(() => el.classList.remove('show'), 2500);
  }

  // ---------- Status UI ----------
  function updateStatusUI() {
    $('#current-level').textContent = state.level + ' / 3';
    $('#solved-count').textContent = state.solved;
    const access = $('#access-status');
    const dot = $('#status-dot');
    const sys = $('#system-status');
    if (state.unlocked) {
      access.textContent = 'مفتوح'; access.className = 'value unlocked';
      dot.classList.add('unlocked'); sys.textContent = 'SYSTEM UNLOCKED';
      const badge = $('#console-badge'); if (badge) { badge.textContent = 'OPEN'; badge.style.background = 'var(--green-soft)'; badge.style.color = 'var(--green)'; }
    } else {
      access.textContent = 'مقفل'; access.className = 'value locked';
      dot.classList.remove('unlocked'); sys.textContent = 'SYSTEM LOCKED';
    }
    $('#story-progress').style.width = state.storyProgress + '%';
    const hints = [
      'استخدم الخريطة الذهنية ثم مختبر المنطق لفك الشفرات.',
      'النص معكوس — جرب بلوك العكس ثم Uppercase.',
      'المرحلة الأخيرة: جرب abogallab أو 4-2-2-2',
    ];
    $('#current-hint').textContent = hints[Math.min(state.level - 1, 2)];
  }

  // ---------- Navigation ----------
  function switchPanel(name) {
    $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.panel === name));
    $$('.panel').forEach((p) => {
      p.classList.remove('active');
      if (!state.animations) p.classList.add('no-anim');
      else p.classList.remove('no-anim');
    });
    const panel = $('#panel-' + name);
    if (panel) {
      // force reflow for animation restart
      void panel.offsetWidth;
      panel.classList.add('active');
    }
    if (name === 'mindmap') setTimeout(renderMindmap, 40);
  }

  $$('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchPanel(btn.dataset.panel));
  });

  // ---------- Terminal ----------
  const terminalOutput = $('#terminal-output');
  const terminalInput = $('#terminal-input');

  function printLine(text, type = '') {
    const line = document.createElement('div');
    line.className = 'line' + (type ? ' ' + type : '');
    line.textContent = text;
    terminalOutput.appendChild(line);
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
  }
  function printStory(text) {
    const line = document.createElement('div');
    line.className = 'line story';
    line.textContent = text;
    terminalOutput.appendChild(line);
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
  }

  function bootTerminal() {
    const intro = [
      { t: 'system', m: '═══════════════════════════════════' },
      { t: 'system', m: '  LOGIC MATRIX v3.0 — ONLINE' },
      { t: 'system', m: '═══════════════════════════════════' },
      { t: 'story', m: 'أنت داخل نظام قديم اسمه "The Logic Matrix". النظام مقفول، ومفيش حد قدر يفك شفرته بسهولة.' },
      { t: 'story', m: '"المفتاح مش في الكود... المفتاح في الطريقة اللي بتفكر بيها."' },
      { t: 'system', m: 'اكتب help للأوامر — أو ابدأ بالخريطة الذهنية.' },
    ];
    intro.forEach((item, i) => {
      setTimeout(() => item.t === 'story' ? printStory(item.m) : printLine(item.m, item.t), i * 150);
    });
  }

  const encrypted = {
    1: 'MSG-X7: ALPHA-9921-BETA-4480-GAMMA',
    2: 'kcatS eht ni deirrub si yek eht',
  };

  function processCommand(raw) {
    const cmd = raw.trim();
    if (!cmd) return;
    printLine('root@matrix:~$ ' + cmd, 'prompt-echo');
    state.terminalHistory.push(cmd);
    state.historyIndex = state.terminalHistory.length;
    const lower = cmd.toLowerCase();

    if (lower === 'abogallab' || lower === '4-2-2-2' || lower === '4222') {
      if (!state.unlocked) {
        state.unlocked = true; state.level = 3; state.solved = 3; state.storyProgress = 100;
        updateStatusUI(); save();
        printLine('>>> ACCESS GRANTED <<<', 'success');
        printStory('النظام اتفتح.\n"المنطق مش قواعد جامدة... المنطق هو الطريقة اللي بتشوف بيها العالم."\nمبروك — حليت The Logic Matrix.');
        showToast('تم فتح النظام!', 'success');
      } else printLine('النظام مفتوح بالفعل.', 'system');
      return;
    }
    if (lower === 'help' || lower === 'مساعدة') {
      printLine('الأوامر: help | status | decrypt | message | hint | clear | matrix', 'system');
      return;
    }
    if (lower === 'clear' || lower === 'cls') { terminalOutput.innerHTML = ''; return; }
    if (lower === 'status') {
      printLine(`المستوى: ${state.level}/3 | المحلول: ${state.solved} | ${state.unlocked ? 'مفتوح' : 'مقفل'}`, 'system');
      return;
    }
    if (lower === 'hint') {
      printLine($('#current-hint').textContent, 'system');
      return;
    }
    if (lower === 'message') {
      if (state.level <= 2) printLine(encrypted[state.level] || encrypted[2], 'story');
      else printLine('لا رسائل إضافية. جرب كلمة المرور النهائية.', 'system');
      return;
    }
    if (lower === 'matrix') {
      printLine('The Logic Matrix — صُمم ليختبر طريقة تفكيرك.', 'system');
      return;
    }
    if (lower === 'decrypt' || lower.startsWith('decrypt')) {
      if (state.level === 1) {
        printLine('الرسالة تحتوي أرقامًا مخفية. استخرجها من مختبر المنطق أو اكتب 99214480', 'system');
        printLine(encrypted[1], 'story');
      } else if (state.level === 2) {
        printLine('النص معكوس. استخدم بلوك العكس.', 'system');
        printLine(encrypted[2], 'story');
      } else printLine('كل الشفرات محلولة.', 'system');
      return;
    }
    if (state.level === 1 && (cmd === '99214480' || cmd === '9921-4480')) {
      state.level = 2; state.solved = 1; state.storyProgress = 45;
      updateStatusUI(); save();
      printLine('✓ Level 1 Complete', 'success');
      printStory('كويس. رسالة Level 2:\n' + encrypted[2]);
      showToast('المستوى 1 اكتمل!', 'success');
      return;
    }
    if (state.level === 2 && (lower === 'the key is buried in the stack' || lower.replace(/\s/g, '') === 'thekeyisburiedinthestack')) {
      state.level = 3; state.solved = 2; state.storyProgress = 75;
      updateStatusUI(); save();
      printLine('✓ Level 2 Complete', 'success');
      printStory('فاضل المفتاح الأخير. جرب abogallab أو 4-2-2-2');
      showToast('المستوى 2 اكتمل!', 'success');
      return;
    }
    printLine('أمر غير معروف: ' + cmd, 'error');
  }

  terminalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { processCommand(terminalInput.value); terminalInput.value = ''; }
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (state.historyIndex > 0) { state.historyIndex--; terminalInput.value = state.terminalHistory[state.historyIndex] || ''; }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (state.historyIndex < state.terminalHistory.length - 1) { state.historyIndex++; terminalInput.value = state.terminalHistory[state.historyIndex] || ''; }
      else { state.historyIndex = state.terminalHistory.length; terminalInput.value = ''; }
    }
  });

  // ---------- Mind Map ----------
  const notesInput = $('#notes-input');
  const mindmapSvg = $('#mindmap-svg');
  const mindmapCanvas = $('#mindmap-canvas');

  function parseNotesToTree(text) {
    const lines = text.split('\n').filter((l) => l.trim());
    const root = { id: 'root', text: 'The Logic Matrix', children: [], depth: 0 };
    const stack = [{ node: root, indent: -1 }];
    lines.forEach((line, idx) => {
      let content = line.trimStart();
      if (/^[•\-\*]\s*/.test(content)) content = content.replace(/^[•\-\*]\s*/, '');
      else if (/^\d+[\.\)]\s*/.test(content)) content = content.replace(/^\d+[\.\)]\s*/, '');
      if (!content) return;
      const indent = line.length - line.trimStart().length;
      const node = { id: 'n' + idx, text: content.slice(0, 55), children: [], depth: 0 };
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
      const parent = stack[stack.length - 1].node;
      node.depth = parent.depth + 1;
      parent.children.push(node);
      stack.push({ node, indent });
    });
    return root;
  }

  function flattenTree(node, nodes = [], links = [], parentId = null) {
    nodes.push(node);
    if (parentId) links.push({ source: parentId, target: node.id });
    node.children.forEach((c) => flattenTree(c, nodes, links, node.id));
    return { nodes, links };
  }

  function layoutTree(root) {
    const { nodes, links } = flattenTree(root);
    const levels = {};
    nodes.forEach((n) => { if (!levels[n.depth]) levels[n.depth] = []; levels[n.depth].push(n); });
    Object.keys(levels).forEach((d) => {
      const arr = levels[d];
      const totalH = arr.length * 54;
      const startY = -totalH / 2 + 27;
      arr.forEach((n, i) => {
        if (!state.nodePositions[n.id]) state.nodePositions[n.id] = { x: 70 + (+d) * 130, y: startY + i * 54 + 180 };
      });
    });
    return { nodes, links };
  }

  function renderMindmap() {
    const tree = parseNotesToTree(notesInput.value || '');
    const { nodes, links } = layoutTree(tree);
    const w = mindmapCanvas.clientWidth || 500;
    const h = mindmapCanvas.clientHeight || 360;
    mindmapSvg.setAttribute('viewBox', `${-state.pan.x / state.zoom} ${-state.pan.y / state.zoom} ${w / state.zoom} ${h / state.zoom}`);
    mindmapSvg.innerHTML = '';

    const gL = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    links.forEach((l) => {
      const s = state.nodePositions[l.source], t = state.nodePositions[l.target];
      if (!s || !t) return;
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const mx = (s.x + t.x) / 2;
      p.setAttribute('d', `M ${s.x + 65} ${s.y} C ${mx} ${s.y}, ${mx} ${t.y}, ${t.x - 8} ${t.y}`);
      p.setAttribute('class', 'mind-link');
      gL.appendChild(p);
    });
    mindmapSvg.appendChild(gL);

    const gN = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    nodes.forEach((n) => {
      const pos = state.nodePositions[n.id] || { x: 80, y: 100 };
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'mind-node' + (n.id === 'root' ? ' root' : ''));
      g.setAttribute('data-id', n.id);
      g.setAttribute('transform', `translate(${pos.x},${pos.y})`);
      const boxW = Math.max(80, Math.min(n.text.length, 26) * 7.5 + 20);
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', -8); rect.setAttribute('y', -17); rect.setAttribute('width', boxW); rect.setAttribute('height', 34);
      g.appendChild(rect);
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', boxW / 2 - 8); text.setAttribute('y', 1);
      text.textContent = n.text.length > 26 ? n.text.slice(0, 24) + '…' : n.text;
      g.appendChild(text);
      g.addEventListener('pointerdown', (e) => { e.stopPropagation(); dragNode = n.id; g.setPointerCapture(e.pointerId); });
      gN.appendChild(g);
    });
    mindmapSvg.appendChild(gN);
    $('#node-count').textContent = nodes.length + ' عقدة';
  }

  notesInput.addEventListener('input', () => {
    state.notes = notesInput.value;
    renderMindmap();
    debouncedSave();
    const st = $('#notes-save-status');
    if (st) st.textContent = 'جاري الحفظ...';
    setTimeout(() => { if (st) st.textContent = 'محفوظ'; }, 700);
  });

  mindmapCanvas.addEventListener('pointerdown', (e) => {
    if (dragNode) return;
    isPanning = true;
    panStart = { x: e.clientX - state.pan.x, y: e.clientY - state.pan.y };
    mindmapCanvas.setPointerCapture(e.pointerId);
  });
  mindmapCanvas.addEventListener('pointermove', (e) => {
    if (dragNode) {
      const rect = mindmapCanvas.getBoundingClientRect();
      state.nodePositions[dragNode] = {
        x: (e.clientX - rect.left - state.pan.x) / state.zoom,
        y: (e.clientY - rect.top - state.pan.y) / state.zoom,
      };
      renderMindmap();
      return;
    }
    if (isPanning) {
      state.pan.x = e.clientX - panStart.x;
      state.pan.y = e.clientY - panStart.y;
      renderMindmap();
    }
  });
  mindmapCanvas.addEventListener('pointerup', () => { dragNode = null; isPanning = false; });
  mindmapCanvas.addEventListener('pointercancel', () => { dragNode = null; isPanning = false; });

  $('#zoom-in').addEventListener('click', () => { state.zoom = Math.min(2, state.zoom + 0.15); $('#zoom-level').textContent = Math.round(state.zoom * 100) + '%'; renderMindmap(); });
  $('#zoom-out').addEventListener('click', () => { state.zoom = Math.max(0.4, state.zoom - 0.15); $('#zoom-level').textContent = Math.round(state.zoom * 100) + '%'; renderMindmap(); });
  $('#center-map').addEventListener('click', () => { state.pan = { x: 0, y: 0 }; state.zoom = 1; $('#zoom-level').textContent = '100%'; renderMindmap(); });
  $('#reset-positions').addEventListener('click', () => { state.nodePositions = {}; renderMindmap(); showToast('تم إعادة الترتيب'); });
  $('#clear-notes').addEventListener('click', () => { notesInput.value = ''; state.notes = ''; state.nodePositions = {}; renderMindmap(); save(); });
  $('#load-sample').addEventListener('click', () => {
    notesInput.value = `• الرسالة Level 1\n  • MSG-X7: ALPHA-9921-BETA-4480-GAMMA\n  • استخراج الأرقام\n• الرسالة Level 2\n  • kcatS eht ni deirrub si yek eht\n  • النص معكوس\n• المفتاح النهائي\n  • abogallab\n  • 4-2-2-2`;
    state.notes = notesInput.value;
    state.nodePositions = {};
    renderMindmap();
    save();
    showToast('تم تحميل العينة');
  });

  // ---------- Logic Blocks (click + drag) ----------
  const dropZone = $('#drop-zone');

  function getBlockValues(el) {
    return Array.from(el.querySelectorAll('.block-input, .block-select')).map((i) => i.value);
  }

  function blockLabel(type, vals) {
    const map = {
      'if-starts': `إذا بدأ بـ "${vals[0] || '?'}"`,
      'if-contains': `إذا احتوى "${vals[0] || '?'}"`,
      'if-length': `الطول ${vals[0] || '>'} ${vals[1] || '?'}`,
      extract: 'استخرج الأرقام', reverse: 'اعكس النص', uppercase: 'Uppercase',
      replace: `استبدل "${vals[0] || '?'}" → "${vals[1] || '?'}"`,
      repeat: `كرر ×${vals[0] || 2}`,
    };
    return map[type] || type;
  }

  function addBlock(type, values) {
    state.workspaceBlocks.push({ id: 'b' + Date.now() + Math.random().toString(36).slice(2, 5), type, values: values || [] });
    renderWorkspace();
    generateCode();
    debouncedSave();
  }

  function renderWorkspace() {
    dropZone.classList.toggle('has-blocks', state.workspaceBlocks.length > 0);
    $$('.workspace-block').forEach((e) => e.remove());
    state.workspaceBlocks.forEach((b) => {
      const div = document.createElement('div');
      div.className = 'workspace-block';
      div.innerHTML = `<span class="block-icon">◈</span><span>${blockLabel(b.type, b.values)}</span><button class="remove-btn">×</button>`;
      div.querySelector('.remove-btn').onclick = () => {
        state.workspaceBlocks = state.workspaceBlocks.filter((x) => x.id !== b.id);
        renderWorkspace(); generateCode(); debouncedSave();
      };
      dropZone.appendChild(div);
    });
  }

  function generateCode() {
    if (!state.workspaceBlocks.length) {
      $('#generated-code').innerHTML = '<code>// أضف بلوكات...</code>';
      $('#flowchart').innerHTML = '<div class="flow-empty">—</div>';
      return;
    }
    const lines = ['function process(input) {', '  let result = input;'];
    let flow = '<div class="flow-node start">input</div><div class="flow-arrow">↓</div>';
    state.workspaceBlocks.forEach((b) => {
      const v = b.values;
      switch (b.type) {
        case 'if-starts': lines.push(`  if (result.startsWith("${v[0] || ''}")) { /* ok */ }`); flow += `<div class="flow-node condition">يبدأ "${v[0] || '?'}"؟</div><div class="flow-arrow">↓</div>`; break;
        case 'if-contains': lines.push(`  if (result.includes("${v[0] || ''}")) { /* ok */ }`); flow += `<div class="flow-node condition">يحتوي "${v[0] || '?'}"؟</div><div class="flow-arrow">↓</div>`; break;
        case 'if-length': lines.push(`  if (result.length ${v[0] || '>'} ${v[1] || 0}) { /* ok */ }`); flow += `<div class="flow-node condition">طول ${v[0] || '>'} ${v[1] || '?'}</div><div class="flow-arrow">↓</div>`; break;
        case 'extract': lines.push(`  result = result.replace(/\\D/g, '');`); flow += `<div class="flow-node action">استخرج الأرقام</div><div class="flow-arrow">↓</div>`; break;
        case 'reverse': lines.push(`  result = result.split('').reverse().join('');`); flow += `<div class="flow-node action">اعكس</div><div class="flow-arrow">↓</div>`; break;
        case 'uppercase': lines.push(`  result = result.toUpperCase();`); flow += `<div class="flow-node action">Uppercase</div><div class="flow-arrow">↓</div>`; break;
        case 'replace': lines.push(`  result = result.split("${v[0] || ''}").join("${v[1] || ''}");`); flow += `<div class="flow-node action">استبدل</div><div class="flow-arrow">↓</div>`; break;
        case 'repeat': lines.push(`  result = result.repeat(${parseInt(v[0], 10) || 2});`); flow += `<div class="flow-node action">×${v[0] || 2}</div><div class="flow-arrow">↓</div>`; break;
      }
    });
    lines.push('  return result;', '}');
    $('#generated-code').innerHTML = '<code>' + lines.join('\n') + '</code>';
    flow += '<div class="flow-node end">result</div>';
    $('#flowchart').innerHTML = flow;
  }

  // Click to add (more reliable than drag on mobile)
  $$('.block').forEach((block) => {
    block.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      addBlock(block.dataset.type, getBlockValues(block));
      showToast('تمت الإضافة');
    });
    // Also support HTML5 drag for desktop
    block.setAttribute('draggable', 'true');
    block.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', block.dataset.type);
      e.dataTransfer.setData('values', JSON.stringify(getBlockValues(block)));
    });
  });

  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const type = e.dataTransfer.getData('text/plain');
    let values = [];
    try { values = JSON.parse(e.dataTransfer.getData('values') || '[]'); } catch (_) {}
    if (type) addBlock(type, values);
  });

  $('#clear-workspace').addEventListener('click', () => { state.workspaceBlocks = []; renderWorkspace(); generateCode(); save(); });
  $('#copy-code').addEventListener('click', () => {
    navigator.clipboard.writeText($('#generated-code').textContent).then(() => showToast('تم النسخ', 'success')).catch(() => showToast('فشل النسخ', 'error'));
  });

  // ---------- Code Lab (safe JS) ----------
  const snippets = [
    { title: 'FizzBuzz', lang: 'javascript', code: 'for (let i = 1; i <= 15; i++) {\n  if (i % 15 === 0) console.log("FizzBuzz");\n  else if (i % 3 === 0) console.log("Fizz");\n  else if (i % 5 === 0) console.log("Buzz");\n  else console.log(i);\n}' },
    { title: 'عكس نص', lang: 'javascript', code: 'function reverse(s) {\n  return s.split("").reverse().join("");\n}\nconsole.log(reverse("Logic Matrix"));' },
    { title: 'فلترة أرقام', lang: 'javascript', code: 'const msg = "ALPHA-9921-BETA-4480";\nconsole.log(msg.replace(/\\D/g, ""));' },
    { title: 'قائمة بايثون', lang: 'python', code: 'nums = [3, 1, 4, 1, 5]\nprint(sorted(nums))\nprint(sum(nums))' },
    { title: 'قاموس', lang: 'python', code: 'user = {"name": "Mohamed", "role": "Student"}\nprint(user["name"])\nprint(user.get("role"))' },
    { title: 'بطاقة HTML', lang: 'html', code: '<div class="card">\n  <h2>Logic Matrix</h2>\n  <p>بيئة العمل</p>\n</div>' },
    { title: 'Glass CSS', lang: 'css', code: '.glass {\n  background: rgba(42,28,18,0.45);\n  backdrop-filter: blur(20px);\n  border-radius: 16px;\n}' },
  ];

  function initCodeLab() {
    const list = $('#snippet-list');
    list.innerHTML = '';
    snippets.forEach((s) => {
      const el = document.createElement('div');
      el.className = 'snippet-item';
      el.innerHTML = `${s.title}<span class="snip-lang">${s.lang}</span>`;
      el.onclick = () => {
        $$('.snippet-item').forEach((i) => i.classList.remove('active'));
        el.classList.add('active');
        $('#snippet-title').textContent = s.title;
        $('#code-editor').value = s.code;
        $('#code-lang').value = s.lang;
        state.codeEditor = s.code;
        debouncedSave();
      };
      list.appendChild(el);
    });

    $('#code-editor').addEventListener('input', () => { state.codeEditor = $('#code-editor').value; debouncedSave(); });

    $('#copy-snippet').onclick = () => {
      navigator.clipboard.writeText($('#code-editor').value).then(() => showToast('تم النسخ', 'success'));
    };
    $('#clear-code-output').onclick = () => { $('#code-result').textContent = 'جاهز للتشغيل...'; };

    $('#run-snippet').onclick = () => {
      const code = $('#code-editor').value;
      const lang = $('#code-lang').value;
      const out = $('#code-result');
      if (lang === 'javascript') {
        try {
          const logs = [];
          const fakeConsole = { log: (...a) => logs.push(a.map(String).join(' ')), warn: (...a) => logs.push('[warn] ' + a.join(' ')), error: (...a) => logs.push('[error] ' + a.join(' ')) };
          // Safer than raw eval: Function constructor in isolated scope
          const fn = new Function('console', '"use strict";\n' + code);
          fn(fakeConsole);
          out.textContent = logs.length ? logs.join('\n') : '(تم بدون خرج)';
        } catch (err) {
          out.textContent = 'خطأ: ' + err.message;
        }
      } else if (lang === 'python') {
        out.textContent = runPython(code);
      } else {
        out.textContent = 'معاينة ' + lang.toUpperCase() + ':\n\n' + code;
      }
    };
  }

  // ---------- Prompts (Business focused) ----------
  const promptTemplates = [
    { cat: 'إدارة أعمال', items: [
      { title: 'تحليل SWOT', body: 'أنت مستشار إداري. اعمل تحليل SWOT كامل لـ: {{topic}}\nالمستوى: {{level}}\nاللغة: {{lang}}\nقدّم نقاط واضحة لكل ربع مع توصيات عملية.' },
      { title: 'خطة تسويق', body: 'صمم خطة تسويق مختصرة لـ: {{topic}}\nالجمهور المستهدف، القنوات، الميزانية التقريبية، ومؤشرات النجاح.\nالمستوى: {{level}} | اللغة: {{lang}}' },
      { title: 'دراسة جدوى مبسطة', body: 'اكتب دراسة جدوى أولية لمشروع: {{topic}}\nشمل: الفكرة، السوق، التكاليف التقديرية، الإيرادات المتوقعة، والمخاطر.\nاللغة: {{lang}}' },
      { title: 'تحليل منافسين', body: 'حلل المنافسين الرئيسيين في مجال: {{topic}}\nقارن نقاط القوة والضعف والتسعير والتموضع.\nالمستوى: {{level}}' },
    ]},
    { cat: 'محاسبة ومالية', items: [
      { title: 'شرح مفهوم محاسبي', body: 'اشرح مفهوم "{{topic}}" بطريقة بسيطة لطالب بكالوريوس إدارة أعمال.\nاستخدم مثال رقمي واضح.\nاللغة: {{lang}}' },
      { title: 'تحليل قوائم مالية', body: 'كيف أحلل قائمة الدخل والميزانية لشركة في قطاع: {{topic}}؟\nاذكر النسب المالية الأهم ومعنى كل نسبة.\nالمستوى: {{level}}' },
    ]},
    { cat: 'برمجة', items: [
      { title: 'شرح كود', body: 'اشرح الكود التالي باللهجة المصرية مع توضيح كل جزء:\n```\n{{topic}}\n```\nالمستوى: {{level}} | اللغة: {{lang}}' },
      { title: 'توليد دالة', body: 'اكتب دالة {{lang}} تقوم بـ: {{topic}}\nكود نظيف + تعليقات + مثال استخدام.\nالمستوى: {{level}}' },
    ]},
    { cat: 'دراسة وامتحانات', items: [
      { title: 'تلخيص محاضرة', body: 'لخّص الموضوع التالي في نقاط مرتبة وسهلة الحفظ:\n{{topic}}\nالمستوى: {{level}} | اللغة: {{lang}}' },
      { title: 'أسئلة مراجعة', body: 'ولّد 10 أسئلة مراجعة (مع إجاباتها المختصرة) عن: {{topic}}\nنوع الأسئلة: مفاهيم + تطبيق.\nالمستوى: {{level}}' },
      { title: 'خطة مذاكرة', body: 'ضع خطة مذاكرة لأسبوع لموضوع: {{topic}}\nوزّع الوقت يوميًا وحدد أولويات.\nالمستوى: {{level}}' },
    ]},
  ];

  function initPrompts() {
    const box = $('#prompt-categories');
    box.innerHTML = '';
    promptTemplates.forEach((cat) => {
      const t = document.createElement('div');
      t.className = 'prompt-cat-title';
      t.textContent = cat.cat;
      box.appendChild(t);
      cat.items.forEach((item) => {
        const el = document.createElement('div');
        el.className = 'prompt-item';
        el.textContent = item.title;
        el.onclick = () => {
          $$('.prompt-item').forEach((i) => i.classList.remove('active'));
          el.classList.add('active');
          $('#prompt-title').textContent = item.title;
          $('#prompt-editor').value = item.body;
          state.promptText = item.body;
          debouncedSave();
        };
        box.appendChild(el);
      });
    });
    $('#prompt-editor').addEventListener('input', () => { state.promptText = $('#prompt-editor').value; debouncedSave(); });
    $('#copy-prompt').onclick = () => navigator.clipboard.writeText($('#prompt-editor').value).then(() => showToast('تم النسخ', 'success'));
    $('#clear-prompt').onclick = () => { $('#prompt-editor').value = ''; state.promptText = ''; $('#prompt-title').textContent = 'مختبر البرومبت'; save(); };
    $('#apply-vars').onclick = () => {
      let t = $('#prompt-editor').value;
      t = t.replaceAll('{{topic}}', $('#var-topic').value || '{{topic}}')
           .replaceAll('{{level}}', $('#var-level').value || '{{level}}')
           .replaceAll('{{lang}}', $('#var-lang').value || '{{lang}}');
      $('#prompt-editor').value = t;
      state.promptText = t;
      showToast('تم التطبيق');
      debouncedSave();
    };
  }

  // ---------- Python Engine (improved) ----------
  function runPython(code) {
    const lines = code.split('\n');
    const output = [];
    const vars = { ...pyVars };

    function evalExpr(expr) {
      expr = expr.trim();
      // strings
      if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'"))) return expr.slice(1, -1);
      // numbers
      if (!isNaN(Number(expr)) && expr !== '') return Number(expr);
      // variables
      if (vars.hasOwnProperty(expr)) return vars[expr];
      // list literal
      if (expr.startsWith('[') && expr.endsWith(']')) {
        try { return expr.slice(1, -1).split(',').map((x) => evalExpr(x.trim())); } catch { return expr; }
      }
      // dict simple
      if (expr.startsWith('{') && expr.endsWith('}')) return expr;
      // function calls
      if (expr.startsWith('len(') && expr.endsWith(')')) {
        const inner = evalExpr(expr.slice(4, -1));
        return Array.isArray(inner) || typeof inner === 'string' ? inner.length : 0;
      }
      if (expr.startsWith('sum(') && expr.endsWith(')')) {
        const inner = evalExpr(expr.slice(4, -1));
        return Array.isArray(inner) ? inner.reduce((a, b) => a + Number(b), 0) : 0;
      }
      if (expr.startsWith('sorted(') && expr.endsWith(')')) {
        const inner = evalExpr(expr.slice(7, -1));
        return Array.isArray(inner) ? [...inner].sort((a, b) => a - b) : inner;
      }
      if (expr.startsWith('str(') && expr.endsWith(')')) return String(evalExpr(expr.slice(4, -1)));
      if (expr.startsWith('int(') && expr.endsWith(')')) return parseInt(evalExpr(expr.slice(4, -1)), 10) || 0;
      if (expr.includes('.upper()')) {
        const base = expr.replace('.upper()', '');
        return String(evalExpr(base)).toUpperCase();
      }
      if (expr.includes('.lower()')) {
        const base = expr.replace('.lower()', '');
        return String(evalExpr(base)).toLowerCase();
      }
      if (expr.includes('.append(')) return expr; // handled in assign context
      // simple math
      try {
        if (/^[\d\s+\-*/.()]+$/.test(expr)) return Function('"use strict"; return (' + expr + ')')();
      } catch {}
      return expr;
    }

    try {
      for (let raw of lines) {
        let line = raw.trim();
        if (!line || line.startsWith('#')) continue;

        // print(...)
        if (line.startsWith('print(') && line.endsWith(')')) {
          const inner = line.slice(6, -1);
          // handle multiple args roughly
          const parts = inner.split(',').map((p) => {
            const v = evalExpr(p.trim());
            return Array.isArray(v) ? '[' + v.join(', ') + ']' : String(v);
          });
          output.push(parts.join(' '));
          continue;
        }

        // for i in range(n):
        const forMatch = line.match(/^for\s+(\w+)\s+in\s+range\s*\(\s*(\d+)\s*\)\s*:/);
        if (forMatch) {
          // only support single following print for simplicity in one-liners stored as multi
          continue;
        }

        // assignment
        const eq = line.indexOf('=');
        if (eq > 0 && !line.includes('==') && !line.startsWith('if') && !line.startsWith('while')) {
          const name = line.slice(0, eq).trim();
          const val = evalExpr(line.slice(eq + 1));
          if (/^\w+$/.test(name)) vars[name] = val;
          continue;
        }

        // bare expression
        const result = evalExpr(line);
        if (result !== line) output.push(String(result));
      }
      pyVars = vars;
    } catch (e) {
      return 'خطأ: ' + e.message;
    }
    return output.length ? output.join('\n') : '(لا خرج — استخدم print())';
  }

  function initPython() {
    const cmds = [
      { c: 'print("Hello")', d: 'طباعة' },
      { c: 'x = [1, 2, 3, 4]', d: 'قائمة' },
      { c: 'print(len(x))', d: 'طول' },
      { c: 'print(sum(x))', d: 'مجموع' },
      { c: 'print(sorted(x))', d: 'ترتيب' },
      { c: 'name = "Mohamed"', d: 'نص' },
      { c: 'print(name.upper())', d: 'حروف كبيرة' },
      { c: 'print(2 + 3 * 4)', d: 'حساب' },
      { c: 'd = {"a": 1}', d: 'قاموس' },
      { c: 'print(str(42))', d: 'تحويل لنص' },
    ];
    const list = $('#py-commands');
    list.innerHTML = '';
    cmds.forEach((item) => {
      const el = document.createElement('div');
      el.className = 'py-cmd';
      el.innerHTML = `${item.c}<small>${item.d}</small>`;
      el.onclick = () => { $('#py-input').value = item.c; $('#py-input').focus(); };
      list.appendChild(el);
    });

    const pyOut = $('#py-output');
    function pyPrint(t, type = '') {
      const d = document.createElement('div');
      d.className = 'line' + (type ? ' ' + type : '');
      d.textContent = t;
      pyOut.appendChild(d);
      pyOut.scrollTop = pyOut.scrollHeight;
    }
    pyPrint('Python Engine v3 — Logic Matrix', 'system');
    pyPrint('اكتب أوامر بايثون بسيطة (print, متغيرات, قوائم, len, sum...)', 'system');

    $('#py-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const code = $('#py-input').value.trim();
        if (!code) return;
        pyPrint('>>> ' + code, 'prompt-echo');
        const res = runPython(code);
        res.split('\n').forEach((l) => pyPrint(l));
        $('#py-input').value = '';
      }
    });
  }

  // ---------- Settings ----------
  function initSettings() {
    $('#theme-toggle').onclick = () => {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      applyTheme(); save();
      showToast(state.theme === 'dark' ? 'الوضع الداكن' : 'الوضع الفاتح');
    };

    $$('[data-theme-set]').forEach((b) => {
      b.onclick = () => { state.theme = b.dataset.themeSet; applyTheme(); save(); };
    });
    $$('[data-fontsize]').forEach((b) => {
      b.onclick = () => { state.fontSize = +b.dataset.fontsize; applyTheme(); save(); };
    });

    $('#setting-animations').onchange = (e) => { state.animations = e.target.checked; save(); };
    $('#setting-watermark').onchange = (e) => { state.watermark = e.target.checked; applyTheme(); save(); };
    $('#setting-autosave').onchange = (e) => { state.autosave = e.target.checked; if (state.autosave) save(); };

    // sync checkboxes
    $('#setting-animations').checked = state.animations;
    $('#setting-watermark').checked = state.watermark;
    $('#setting-autosave').checked = state.autosave;

    $('#export-data').onclick = () => {
      const data = localStorage.getItem(STORAGE_KEY) || '{}';
      const blob = new Blob([data], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'logic-matrix-backup.json';
      a.click();
      showToast('تم التصدير', 'success');
    };

    $('#import-data').onclick = () => $('#import-file').click();
    $('#import-file').onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          localStorage.setItem(STORAGE_KEY, reader.result);
          load();
          applyTheme();
          notesInput.value = state.notes;
          $('#code-editor').value = state.codeEditor;
          $('#prompt-editor').value = state.promptText;
          renderWorkspace();
          generateCode();
          updateStatusUI();
          showToast('تم الاستيراد', 'success');
        } catch { showToast('ملف غير صالح', 'error'); }
      };
      reader.readAsText(file);
    };

    $('#reset-all').onclick = () => {
      if (!confirm('هل أنت متأكد؟ سيتم مسح كل البيانات.')) return;
      localStorage.removeItem(STORAGE_KEY);
      state = { level: 1, solved: 0, unlocked: false, storyProgress: 15, notes: '', workspaceBlocks: [], codeEditor: '', promptText: '', theme: 'dark', fontSize: 16, animations: true, watermark: true, autosave: true, nodePositions: {}, zoom: 1, pan: { x: 0, y: 0 }, terminalHistory: [], historyIndex: -1 };
      applyTheme();
      notesInput.value = '';
      $('#code-editor').value = '';
      $('#prompt-editor').value = '';
      renderWorkspace();
      generateCode();
      updateStatusUI();
      terminalOutput.innerHTML = '';
      bootTerminal();
      showToast('تمت إعادة الضبط');
    };
  }

  // ---------- Init ----------
  function init() {
    load();
    applyTheme();
    updateStatusUI();
    notesInput.value = state.notes;
    if (state.codeEditor) $('#code-editor').value = state.codeEditor;
    if (state.promptText) $('#prompt-editor').value = state.promptText;
    renderWorkspace();
    generateCode();
    bootTerminal();
    renderMindmap();
    initCodeLab();
    initPrompts();
    initPython();
    initSettings();
    setTimeout(() => terminalInput.focus(), 200);
    window.addEventListener('resize', () => {
      if ($('#panel-mindmap').classList.contains('active')) renderMindmap();
    });
  }

  init();
})();
