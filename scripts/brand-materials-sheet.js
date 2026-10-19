// Runs inside every brand-material sheet (copied to public/brand-materials/runtime/sheet.js).
// Finds artboards, hides the designer's presentation notes, fills placeholders, QR codes and
// photo slots, applies text edits and lays artboards out as print pages. API: `window.__rp`.
/* global window, document, getComputedStyle, NodeFilter, MutationObserver, DOMParser */
(() => {
  const VERSION = 2;
  const SKIP = new Set([
    'SCRIPT',
    'STYLE',
    'LINK',
    'META',
    'TEMPLATE',
    'NOSCRIPT',
    'X-DC',
    'HELMET',
  ]);
  const INHERITED = [
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'line-height',
    'letter-spacing',
    'word-spacing',
    'color',
    'text-align',
    'text-transform',
    'white-space',
  ];
  const TOKENS = /\[[^\]\n]{1,80}\]/g;
  const HAS_TOKEN = /\[[^\]\n]{1,80}\]/;
  // Tokens that say nothing on their own; their field is named after the text in front.
  const GENERIC = /^(platzhalter|datum|mm\/jjjj|betrag|wert)$/i;
  const LEADING_FILLER = /^(ihre?|die|der|das|unsere?)$/i;
  const IMAGE_SLOT = /^(foto-platzhalter\b.*|ihr logo|partner-?logo|logo)$/i;
  const docMode = document.documentElement.dataset.rpMode === 'doc';

  let boards = [];
  let names = [];
  let notes = [];
  let qrSlots = [];
  let imageSlots = [];
  let state = { edits: {}, values: {}, qr: {}, images: {} };
  let highlight = true;
  let applying = false;
  let printing = false;
  let picking = false;
  let outlined = null;
  let timer = 0;
  let observer = null;
  let passNodes = null;
  const originals = new WeakMap();
  const slotOriginals = new WeakMap();

  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const rendered = (el) => !SKIP.has(el.tagName) && el.getClientRects().length > 0;
  const size = (el) => {
    const r = el.getBoundingClientRect();
    return { width: Math.round(r.width), height: Math.round(r.height) };
  };
  const boardOf = (node) => boards.findIndex((b) => b.contains(node));
  const inSlot = (node) => !!node.parentElement?.closest('[data-rp-img], svg[data-rp-qr]');

  function rootElement() {
    return [...document.body.children].find(rendered) ?? document.body;
  }

  /** Artboards = outermost elements with a drop shadow; the designs give every print piece one. */
  function findBoards() {
    if (docMode) return [rootElement()];
    const found = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (SKIP.has(el.tagName) || el.closest('x-dc') || el.closest('[data-rp-note]')) continue;
      if (found.some((b) => b.contains(el))) continue;
      if (getComputedStyle(el).boxShadow === 'none') continue;
      const { width, height } = size(el);
      if (width >= 120 && height >= 60) found.push(el);
    }
    return found.length ? found : [rootElement()];
  }

  function hideNotes(el) {
    for (const child of [...el.children]) {
      if (SKIP.has(child.tagName) || child.dataset.rpNote) continue;
      if (boards.includes(child)) continue;
      if (boards.some((b) => child.contains(b))) {
        child.style.setProperty('background', 'transparent', 'important');
        hideNotes(child);
      } else if (rendered(child)) {
        child.dataset.rpNote = '1';
        child.style.setProperty('display', 'none', 'important');
      }
    }
  }

  /** The label the designer put right above an artboard, e.g. "Vorderseite · 85 × 55 mm". */
  function boardName(board) {
    for (let n = board; n && n !== document.body; n = n.parentElement) {
      const prev = n.previousElementSibling;
      if (prev) {
        const text = norm(prev.textContent ?? '');
        return prev.dataset.rpNote && text.length < 80 ? text : null;
      }
    }
    return null;
  }

  function walkText(root, visit) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || SKIP.has(parent.tagName) || parent.closest('style')) continue;
      visit(node);
    }
  }

  /** Photo/logo boxes: the outermost element whose whole text is "Foto-Platzhalter …" or "Ihr Logo". */
  function findImageSlots() {
    for (const board of boards) {
      walkText(board, (node) => {
        const text = norm(originals.get(node) ?? node.data);
        if (!IMAGE_SLOT.test(text) || node.parentElement.closest('[data-rp-img]')) return;
        let el = node.parentElement;
        while (
          el.parentElement &&
          el.parentElement !== board &&
          norm(el.parentElement.textContent ?? '') === text
        ) {
          el = el.parentElement;
        }
        const { width, height } = size(el);
        if (width < 40 || height < 30) return;
        el.dataset.rpImg = /logo/i.test(text) ? 'contain' : 'cover';
        el.dataset.rpImgLabel = text;
        slotOriginals.set(el, el.innerHTML);
      });
    }
    return [...document.querySelectorAll('[data-rp-img]')].filter((el) => boardOf(el) >= 0);
  }

  function textNodes() {
    if (passNodes) return passNodes;
    const out = [];
    for (const board of boards) {
      walkText(board, (node) => {
        if (inSlot(node)) return;
        if (!originals.has(node)) originals.set(node, node.data);
        if (norm(originals.get(node))) out.push(node);
      });
    }
    return out;
  }

  /** Runs `fn` with one text-node scan shared by every lookup inside it. */
  function pass(fn) {
    passNodes = null;
    passNodes = textNodes();
    try {
      return fn(passNodes);
    } finally {
      passNodes = null;
    }
  }

  /** Field name for a token: its own words, or the text in front of it ("USt-IdNr.", "Abo-Rabatt"). */
  function tokenLabel(node, original, index, token) {
    const inner = norm(token.slice(1, -1));
    if (!GENERIC.test(inner)) return null;
    let before = (original.slice(0, index).split(/[·|]/).pop() ?? '').replace(/[:\s]+$/, '').trim();
    if (!before) {
      // Token stands alone: use the nearest text before it (a table label, a heading).
      const nodes = textNodes();
      for (let i = nodes.indexOf(node) - 1; i >= 0 && !before; i--) {
        const text = norm(originals.get(nodes[i]));
        if (text && !HAS_TOKEN.test(text)) before = text.replace(/[:\s]+$/, '');
      }
    }
    const words = before.split(/\s+/).filter(Boolean);
    while (words.length > 1 && LEADING_FILLER.test(words[0])) words.shift();
    if (words.length > 1 && /^als$/i.test(words[words.length - 1])) words.pop();
    return words.slice(-3).join(' ').slice(0, 40) || inner;
  }

  function tokensOf(node) {
    const original = originals.get(node);
    const out = [];
    for (const m of original.matchAll(TOKENS)) {
      const label = tokenLabel(node, original, m.index, m[0]);
      out.push({
        token: m[0],
        index: m.index,
        key: label ? `${label} · ${norm(m[0])}` : norm(m[0]),
        label: label ?? norm(m[0].slice(1, -1)),
      });
    }
    return out;
  }

  function filled(node) {
    const original = originals.get(node);
    let out = '';
    let last = 0;
    for (const t of tokensOf(node)) {
      out += original.slice(last, t.index) + (state.values[t.key] || t.token);
      last = t.index + t.token.length;
    }
    return out + original.slice(last);
  }

  function setQr(slot, markup) {
    if (!slotOriginals.has(slot)) {
      slotOriginals.set(slot, { html: slot.innerHTML, viewBox: slot.getAttribute('viewBox') });
    }
    if (!markup) {
      if (!slot.dataset.rpQrSet) return;
      const o = slotOriginals.get(slot);
      slot.innerHTML = o.html;
      if (o.viewBox) slot.setAttribute('viewBox', o.viewBox);
      delete slot.dataset.rpQrSet;
      return;
    }
    if (slot.dataset.rpQrSet === markup) return;
    const svg = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
    slot.setAttribute('viewBox', svg.getAttribute('viewBox') ?? '0 0 100 100');
    slot.setAttribute('shape-rendering', 'crispEdges');
    slot.innerHTML = svg.innerHTML;
    slot.dataset.rpQrSet = markup;
  }

  function setImage(slot, url) {
    if (!url) {
      if (!slot.dataset.rpImgSet) return;
      slot.innerHTML = slotOriginals.get(slot) ?? '';
      delete slot.dataset.rpImgSet;
      return;
    }
    if (slot.dataset.rpImgSet === url) return;
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    img.style.cssText = `display:block;width:100%;height:100%;object-fit:${slot.dataset.rpImg};`;
    slot.replaceChildren(img);
    slot.style.setProperty('overflow', 'hidden');
    slot.dataset.rpImgSet = url;
  }

  function adoptRewrites(records) {
    // Text the template runtime rewrote (e.g. Angebot → Rechnung) becomes the new original.
    for (const r of records) {
      if (r.type === 'characterData') originals.set(r.target, r.target.data);
    }
  }

  function apply() {
    // Observer callbacks are async: settle queued runtime records, then drop our own writes.
    adoptRewrites(observer?.takeRecords() ?? []);
    applying = true;
    pass((nodes) => {
      for (const node of nodes) {
        const original = originals.get(node);
        const key = norm(original);
        const lead = original.match(/^\s*/)[0];
        const trail = original.match(/\s*$/)[0];
        const want = key in state.edits ? lead + state.edits[key] + trail : filled(node);
        if (node.data !== want) node.data = want;
      }
      // Cue every element that still shows an open token.
      for (const el of document.querySelectorAll('[data-rp-ph]')) delete el.dataset.rpPh;
      for (const node of nodes) {
        if (HAS_TOKEN.test(node.data)) node.parentElement.dataset.rpPh = '1';
      }
    });
    qrSlots.forEach((slot, i) => setQr(slot, state.qr[i]));
    imageSlots.forEach((slot, i) => setImage(slot, state.images[i]));
    observer?.takeRecords();
    applying = false;
  }

  function info() {
    return pass((nodes) => {
      const texts = new Map();
      const placeholders = new Map();
      for (const node of nodes) {
        const board = boardOf(node);
        const key = norm(originals.get(node));
        const text = texts.get(key);
        if (text) text.count += 1;
        else texts.set(key, { key, filled: norm(filled(node)), board, count: 1 });
        for (const t of tokensOf(node)) {
          const ph = placeholders.get(t.key);
          if (ph) ph.count += 1;
          else
            placeholders.set(t.key, {
              key: t.key,
              label: t.label,
              token: norm(t.token),
              board,
              count: 1,
            });
        }
      }
      return {
        version: VERSION,
        boards: boards.map((b, i) => ({ ...size(b), name: names[i] })),
        notes,
        fields: [...texts.values()],
        placeholders: [...placeholders.values()],
        qr: qrSlots.map((slot, i) => ({
          index: i,
          purpose: slot.dataset.rpQr,
          board: boardOf(slot),
          color: slot.getAttribute('fill') || '#000000',
        })),
        images: imageSlots.map((slot, i) => ({
          index: i,
          label: slot.dataset.rpImgLabel,
          fit: slot.dataset.rpImg,
          board: boardOf(slot),
          ...size(slot),
        })),
      };
    });
  }

  function refresh() {
    if (printing) return;
    boards = findBoards();
    if (!docMode) hideNotes(document.body);
    names = boards.map(boardName);
    notes = [...document.querySelectorAll('[data-rp-note]')]
      .map((el) => norm(el.textContent ?? ''))
      .filter(Boolean);
    qrSlots = [...document.querySelectorAll('svg[data-rp-qr]')].filter((s) => boardOf(s) >= 0);
    imageSlots = findImageSlots();
    apply();
    window.dispatchEvent(new window.CustomEvent('rp:update'));
  }

  function schedule() {
    window.clearTimeout(timer);
    timer = window.setTimeout(refresh, 120);
  }

  function onMutations(records) {
    if (applying || printing) return;
    adoptRewrites(records);
    schedule();
  }

  function pickTarget(event) {
    const el = event.target instanceof window.Element ? event.target : null;
    const img = el?.closest('[data-rp-img]');
    if (img) return { el: img, detail: { kind: 'image', index: imageSlots.indexOf(img) } };
    const qr = el?.closest('svg[data-rp-qr]');
    if (qr) return { el: qr, detail: { kind: 'qr', index: qrSlots.indexOf(qr) } };
    const range = document.caretRangeFromPoint?.(event.clientX, event.clientY);
    const node = range?.startContainer;
    if (!node || node.nodeType !== 3 || boardOf(node) < 0 || !originals.has(node)) return null;
    const tokens = pass(() => tokensOf(node));
    const open = tokens.find((t) => !state.values[t.key]) ?? tokens[0];
    const detail = open
      ? { kind: 'placeholder', key: open.key }
      : { kind: 'text', key: norm(originals.get(node)) };
    return { el: node.parentElement, detail };
  }

  function setOutline(el) {
    if (outlined === el) return;
    if (outlined) outlined.style.removeProperty('outline');
    outlined = el;
    if (el) el.style.setProperty('outline', '1.5px dashed rgba(120, 90, 60, 0.75)');
  }

  document.addEventListener('mousemove', (event) => {
    if (picking) setOutline(pickTarget(event)?.el ?? null);
  });
  document.addEventListener('mouseleave', () => setOutline(null));
  document.addEventListener('click', (event) => {
    if (!picking) return;
    const target = pickTarget(event);
    if (!target) return;
    event.preventDefault();
    window.dispatchEvent(new window.CustomEvent('rp:pick', { detail: target.detail }));
  });

  // Screen-only cues for open placeholders and empty photo/QR slots; never printed.
  const cue = document.createElement('style');
  cue.textContent =
    '@media screen{html[data-rp-highlight] [data-rp-ph]{background-color:rgba(255,191,0,.3)!important;' +
    'box-shadow:0 0 0 2px rgba(217,119,6,.55);border-radius:2px;cursor:pointer}' +
    'html[data-rp-highlight] [data-rp-img]:not([data-rp-img-set]){box-shadow:inset 0 0 0 2px rgba(217,119,6,.75);cursor:pointer}' +
    'html[data-rp-highlight] svg[data-rp-qr]:not([data-rp-qr-set]){outline:2px dashed rgba(217,119,6,.85);cursor:pointer}}';

  function syncHighlight() {
    if (highlight && picking) document.documentElement.setAttribute('data-rp-highlight', '');
    else document.documentElement.removeAttribute('data-rp-highlight');
  }

  /**
   * Moves every artboard into its own print page. `pages[i]` is {width, height, unit} for
   * artboard i (mm or px) or null for its on-screen size. Returns a function that undoes it.
   */
  function preparePrint(pages) {
    printing = true;
    setOutline(null);
    const root = document.createElement('div');
    root.id = '__rp-print-root';
    const style = document.createElement('style');
    const restore = [];
    let css = '';
    boards.forEach((board, i) => {
      const { width, height } = size(board);
      const computed = getComputedStyle(board);
      const page = pages?.[i];
      let pageSize = `${width}px ${height}px`;
      let zoom = 1;
      if (page?.unit === 'mm') {
        pageSize = `${page.width}mm ${page.height}mm`;
        zoom = (page.width * 96) / 25.4 / width;
      } else if (page?.unit === 'px') {
        pageSize = `${page.width}px ${page.height}px`;
        zoom = page.width / width;
      }
      css += `@page rp${i}{size:${pageSize};margin:0}`;
      const wrap = document.createElement('div');
      wrap.className = '__rp-p';
      wrap.style.cssText =
        `page:rp${i};width:${width}px;height:${height}px;zoom:${zoom};overflow:hidden;` +
        INHERITED.map((p) => `${p}:${computed.getPropertyValue(p)}`).join(';');
      const mark = document.createComment('rp');
      board.before(mark);
      restore.push({ board, mark, style: board.getAttribute('style') });
      board.style.setProperty('box-shadow', 'none', 'important');
      board.style.setProperty('border-radius', '0', 'important');
      board.style.setProperty('margin', '0', 'important');
      board.style.setProperty('transform', 'none', 'important');
      board.style.setProperty('width', `${width}px`, 'important');
      board.style.setProperty('height', `${height}px`, 'important');
      board.style.setProperty('flex', 'none', 'important');
      wrap.append(board);
      root.append(wrap);
    });
    style.textContent =
      css +
      '@media screen{#__rp-print-root{display:none!important}}' +
      '@media print{html,body{margin:0!important;padding:0!important;background:#fff!important;' +
      '-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      'body>*:not(#__rp-print-root){display:none!important}' +
      '#__rp-print-root>.__rp-p{break-after:page!important}' +
      '#__rp-print-root>.__rp-p:last-child{break-after:auto!important}' +
      '#__rp-print-root .__rp-p *{break-before:auto!important;break-after:auto!important}}';
    document.head.append(style);
    document.body.append(root);
    return () => {
      for (const { board, mark, style: attr } of restore.reverse()) {
        mark.replaceWith(board);
        if (attr === null) board.removeAttribute('style');
        else board.setAttribute('style', attr);
      }
      root.remove();
      style.remove();
      observer?.takeRecords();
      printing = false;
    };
  }

  window.__rp = {
    version: VERSION,
    info,
    boardElement: (i) => boards[i] ?? null,
    /** `{ edits, values, qr: {index: svgMarkup}, images: {index: url} }` — replaces the whole state. */
    setState(next) {
      state = {
        edits: { ...(next?.edits ?? {}) },
        values: { ...(next?.values ?? {}) },
        qr: { ...(next?.qr ?? {}) },
        images: { ...(next?.images ?? {}) },
      };
      apply();
      window.dispatchEvent(new window.CustomEvent('rp:update'));
    },
    setPicking(on) {
      picking = !!on;
      if (!picking) setOutline(null);
      syncHighlight();
    },
    /** Off while exporting PNGs, so the screen cues stay out of the image. */
    setHighlight(on) {
      highlight = !!on;
      if (!highlight) setOutline(null);
      syncHighlight();
    },
    preparePrint,
  };

  const start = () => {
    document.head.append(cue);
    observer = new MutationObserver(onMutations);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    schedule();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
