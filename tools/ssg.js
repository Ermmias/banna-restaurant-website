/* Static-site generator for the Banna .dc.html pages.
   Evaluates each page's logic class, expands the template to plain HTML,
   and emits markup that needs no React / Babel / support.js at runtime. */

globalThis.buildPage = function buildPage(src, opts) {
  opts = opts || {};
  const LANGS = ['en', 'es', 'am', 'ti'];

  /* ---------- 1. split source ---------- */
  const scriptRe = /<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/;
  const sm = src.match(scriptRe);
  const js = sm ? sm[1] : '';
  const propsM = src.match(/data-props="([^"]*)"/);
  let props = {};
  if (propsM) {
    const raw = propsM[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    try {
      const spec = JSON.parse(raw);
      for (const k of Object.keys(spec)) if (k[0] !== '$' && spec[k] && 'default' in spec[k]) props[k] = spec[k].default;
    } catch (e) {}
  }

  const headSrc = src.slice(src.indexOf('<head>') + 6, src.indexOf('</head>'));
  const tplAll = src.slice(src.indexOf('<x-dc>') + 6, src.lastIndexOf('</x-dc>'));
  const helmet = tplAll.slice(tplAll.indexOf('<helmet>') + 8, tplAll.indexOf('</helmet>'));
  const body = tplAll.slice(tplAll.indexOf('</helmet>') + 9);

  /* ---------- 2. evaluate logic per language ---------- */
  const React = {
    createRef: () => ({ current: null }),
    createElement: (t, p, ...c) => ({ __el: t, props: p, children: c }),
  };
  class DCLogic {
    constructor() { this.props = {}; }
    setState() {}
    forceUpdate() {}
  }
  const factory = new Function('DCLogic', 'React', js +
    '\nreturn { C: Component,' +
    ' FAV_CATS: typeof FAV_CATS !== "undefined" ? FAV_CATS : null,' +
    ' FAVORITES: typeof FAVORITES !== "undefined" ? FAVORITES : null };');
  const mod = factory(DCLogic, React);

  const valsByLang = {};
  for (const L of LANGS) {
    const inst = new mod.C();
    inst.props = props;
    if (inst.state && 'lang' in inst.state) inst.state.lang = L;
    if (inst.state && 'statCounts' in inst.state) inst.state.statCounts = { families: 15521, years: 2, vegan: 7, scratch: 100 };
    if (inst.state) { const all = {}; for (let n = 0; n < 400; n++) all[n] = true; inst.state.shown = all; }
    valsByLang[L] = inst.renderVals();
  }
  const vals = valsByLang.en;

  /* ---------- 3. helpers ---------- */
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escAttr = (s) => esc(s).replace(/"/g, '&quot;');

  function lookup(path, scope) {
    if (path === 'true') return true;
    if (path === 'false') return false;
    const parts = path.split('.');
    let cur = (parts[0] in scope) ? scope[parts[0]] : undefined;
    for (let i = 1; i < parts.length && cur != null; i++) cur = cur[parts[i]];
    return cur;
  }
  const isHole = (v) => typeof v === 'string' && /^\{\{\s*[^}]+\s*\}\}$/.test(v.trim());
  const holePath = (v) => v.trim().replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '');

  /* translation table: index -> {es, am, ti} where text differs from en */
  const tTable = { es: {}, am: {}, ti: {} };
  let tIdx = 0;
  function translatable(path, scope, enText) {
    const dot = path.indexOf('.');
    // loop-scoped item fields: resolve the same list + index in the other languages
    let listName = null, itemPath = null;
    if (dot !== -1) {
      if (!scope.__loop || !scope.__list) return null;
      if (path.slice(0, dot) !== scope.__as) return null;
      listName = scope.__list;
      itemPath = path.slice(dot + 1);
    } else if (scope.__loop) {
      return null;
    }
    let differs = false;
    const row = {};
    for (const L of ['es', 'am', 'ti']) {
      let v;
      if (listName) {
        const list = valsByLang[L][listName];
        const item = Array.isArray(list) ? list[scope.__idx] : null;
        v = item ? itemPath.split('.').reduce((o, k) => (o == null ? o : o[k]), item) : undefined;
      } else {
        v = valsByLang[L][path];
      }
      if (typeof v !== 'string') return null;
      row[L] = v;
      if (v !== enText) differs = true;
    }
    if (!differs) return null;
    const id = tIdx++;
    for (const L of ['es', 'am', 'ti']) tTable[L][id] = row[L];
    return id;
  }

  const extraScripts = new Set();

  /* hover CSS */
  const hoverRules = [];
  function hoverClass(css) {
    const n = hoverRules.length;
    hoverRules.push(`.hv${n}:hover{${css.replace(/;$/, '')}}`);
    return `hv${n}`;
  }

  /* ---------- 4. block structure (sc-for / sc-if) ---------- */
  function matchBlock(str, from, tag) {
    // returns {openEnd, innerStart, innerEnd, close} for the tag starting at `from`
    const openEnd = str.indexOf('>', from) + 1;
    let depth = 1, i = openEnd;
    const openRe = new RegExp('<' + tag + '[\\s>]', 'g');
    const closeTag = '</' + tag + '>';
    while (depth > 0) {
      openRe.lastIndex = i;
      const nextOpen = openRe.exec(str);
      const nextClose = str.indexOf(closeTag, i);
      if (nextClose === -1) return null;
      if (nextOpen && nextOpen.index < nextClose) { depth++; i = nextOpen.index + 1; }
      else { depth--; i = nextClose + closeTag.length; if (depth === 0) return { openEnd, innerStart: openEnd, innerEnd: nextClose, end: i }; }
    }
    return null;
  }

  function attrsOf(tagStr) {
    const out = {};
    const re = /([a-zA-Z_:@$-][a-zA-Z0-9_:.@$-]*)\s*=\s*"([^"]*)"/g;
    let m;
    while ((m = re.exec(tagStr))) out[m[1]] = m[2];
    return out;
  }

  /* ---------- 5. main renderer ---------- */
  function render(str, scope) {
    let out = '';
    let i = 0;
    while (i < str.length) {
      const lt = str.indexOf('<', i);
      if (lt === -1) { out += text(str.slice(i), scope); break; }
      out += text(str.slice(i, lt), scope);

      if (str.startsWith('<sc-for', lt)) {
        const blk = matchBlock(str, lt, 'sc-for');
        const a = attrsOf(str.slice(lt, blk.openEnd));
        const list = isHole(a.list) ? lookup(holePath(a.list), scope) : [];
        const inner = str.slice(blk.innerStart, blk.innerEnd);
        if (Array.isArray(list)) {
          list.forEach((item, idx) => {
            const s2 = Object.create(scope);
            s2[a.as || 'item'] = item;
            s2.$index = idx;
            s2.__loop = true;
            s2.__as = a.as || 'item';
            s2.__list = isHole(a.list) ? holePath(a.list) : null;
            s2.__idx = idx;
            out += render(inner, s2);
          });
        }
        i = blk.end;
        continue;
      }
      if (str.startsWith('<sc-if', lt)) {
        const blk = matchBlock(str, lt, 'sc-if');
        const a = attrsOf(str.slice(lt, blk.openEnd));
        const v = isHole(a.value) ? lookup(holePath(a.value), scope) : a.value;
        if (v) out += render(str.slice(blk.innerStart, blk.innerEnd), scope);
        i = blk.end;
        continue;
      }
      if (str.startsWith('<x-import', lt)) {
        const blk = matchBlock(str, lt, 'x-import');
        const a = attrsOf(str.slice(lt, blk ? blk.openEnd : str.indexOf('>', lt) + 1));
        const gname = a['component-from-global-scope'] || '';
        if (gname && gname.indexOf('-') !== -1) {
          if (a.from) extraScripts.add(a.from.replace(/^\.\//, '/'));
          const keep = Object.keys(a)
            .filter(k => !/^(component|component-from-global-scope|from|hint-size|dc-props)$/.test(k))
            .map(k => k + '="' + escAttr(a[k]) + '"');
          out += '<' + gname + (keep.length ? ' ' + keep.join(' ') : '') + '></' + gname + '>';
        }
        i = blk ? blk.end : str.indexOf('>', lt) + 1;
        continue;
      }
      if (str.startsWith('<!--', lt)) {
        const e = str.indexOf('-->', lt);
        i = e === -1 ? str.length : e + 3;
        continue;
      }
      // ordinary tag
      const gt = findTagEnd(str, lt);
      const tagStr = str.slice(lt, gt + 1);
      out += tag(tagStr, scope);
      i = gt + 1;
    }
    return out;
  }

  function findTagEnd(str, lt) {
    let i = lt + 1, q = null;
    while (i < str.length) {
      const c = str[i];
      if (q) { if (c === q) q = null; }
      else if (c === '"' || c === "'") q = c;
      else if (c === '>') return i;
      i++;
    }
    return str.length - 1;
  }

  function text(t, scope) {
    if (!t) return '';
    return t.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (m, p) => {
      const v = lookup(p, scope);
      if (v == null || typeof v === 'object' || typeof v === 'function') return '';
      const s = String(v);
      const id = translatable(p, scope, s);
      return id === null ? esc(s) : `<span data-t="${id}">${esc(s)}</span>`;
    });
  }

  const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

  function tag(tagStr, scope) {
    if (tagStr.startsWith('</')) return tagStr;
    const nameM = tagStr.match(/^<([a-zA-Z0-9-]+)/);
    if (!nameM) return tagStr;
    let name = nameM[1];
    const a = attrsOf(tagStr);
    const selfClosed = /\/>$/.test(tagStr);

    // <image-slot> -> <img>
    if (name === 'image-slot') {
      const srcv = isHole(a.src) ? lookup(holePath(a.src), scope) : a.src;
      if (!srcv) return '';
      const alt = a.placeholder || '';
      const st = (a.style || '') + ';object-fit:cover;display:block';
      const eager = opts.eager && opts.eager.indexOf(srcv) !== -1;
      return `<img src="${escAttr(srcv)}" alt="${escAttr(alt)}" style="${escAttr(st)}"` +
        (eager ? ' fetchpriority="high" decoding="async">' : ' loading="lazy" decoding="async">');
    }

    let cls = [];
    let attrs = [];
    let extra = '';
    let inner = null;

    for (const k of Object.keys(a)) {
      let v = a[k];
      if (/^hint-/.test(k)) continue;
      if (k === 'ref') continue;
      if (k === 'style-hover') { cls.push(hoverClass(v)); continue; }
      if (k === 'dangerouslySetInnerHTML') {
        const o = isHole(v) ? lookup(holePath(v), scope) : null;
        if (o && o.__html) inner = o.__html;
        continue;
      }
      if (/^on[A-Z]/.test(k)) {
        // convert known handlers into declarative hooks
        const p = isHole(v) ? holePath(v) : '';
        if (/setLang(En|Es|Am|Ti)/.test(p)) extra += ` data-setlang="${p.slice(-2).toLowerCase()}"`;
        else if (/\.onClick$/.test(p)) {
          const owner = lookup(p.replace(/\.onClick$/, ''), scope);
          const idx = scope.$index;
          if (owner && mod.FAV_CATS && idx != null && mod.FAV_CATS[idx]) extra += ` data-cat="${escAttr(mod.FAV_CATS[idx].key)}"`;
        } else if (/onZoom$/.test(p)) {
          const it = lookup(p.replace(/\.onZoom$/, ''), scope);
          if (it) extra += ' data-zoom="1"';
        } else if (/closeLightbox/.test(p)) extra += ' data-close="1"';
        continue;
      }
      if (isHole(v)) {
        const rv = lookup(holePath(v), scope);
        if (rv == null || typeof rv === 'function') continue;
        if (typeof rv === 'boolean') { if (rv) attrs.push(`${k}="true"`); continue; }
        if (typeof rv === 'object') continue;
        v = String(rv);
      } else if (v.indexOf('{{') !== -1) {
        v = v.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (m, p) => {
          const rv = lookup(p, scope);
          return rv == null || typeof rv === 'object' ? '' : String(rv);
        });
      }
      if (k === 'class') { cls.push(v); continue; }
      attrs.push(`${k}="${escAttr(v)}"`);
    }

    if (cls.length) attrs.unshift(`class="${escAttr(cls.join(' '))}"`);
    const open = `<${name}${attrs.length ? ' ' + attrs.join(' ') : ''}${extra}>`;
    if (VOID.has(name)) return open;
    if (inner != null) return open + inner;
    return selfClosed ? open + `</${name}>` : open;
  }

  /* ---------- 6. build ---------- */
  let bodyHtml = render(body, Object.assign({}, vals));

  // enrich dish cards with data for filtering + lightbox
  var dishList = (opts.dishList && vals[opts.dishList]) || vals.favVisible;
  if (dishList) {
    dishList.forEach((it, i) => {
      const cat = (dishList === vals.favVisible && mod.FAVORITES && mod.FAVORITES[i]) ? mod.FAVORITES[i].cat : null;
      const payload = escAttr(JSON.stringify({
        n: it.name, p: it.price, d: it.desc, s: (opts.base || './') + 'img/' + it.img,
        u: it.url, c: it.cta, h: it.heatLabel || ''
      }));
      bodyHtml = bodyHtml.replace('data-idx="' + i + '"',
        'data-idx="' + i + '"' + (cat ? ' data-cat="' + escAttr(cat) + '"' : '') + ' data-dish="' + payload + '"');
    });
  }

  const eagerFirst = opts.eagerFirst == null ? 8 : opts.eagerFirst;
  let nEager = 0;
  bodyHtml = bodyHtml.replace(/<img ([^>]*?)loading="lazy" /g, (m, pre) =>
    (nEager++ < eagerFirst) ? '<img ' + pre + '' : m);

  let helmetHtml = helmet;
  helmetHtml = helmetHtml.replace(/<x-import[\s\S]*?<\/x-import>/g, '');
  helmetHtml = helmetHtml.replace(/<script[^>]*src="\.?\/?(support|image-slot)\.js"[^>]*><\/script>/g, '');

  const head = headSrc
    .replace(/<script[^>]*src="\.\/(support|image-slot)\.js"[^>]*><\/script>/g, '')
    .trim();

  const css = hoverRules.join('\n') +
    '\n.filter-on{border-color:#A93720!important;background:#C7452B!important;color:#fff!important;box-shadow:0 2px 8px rgba(199,69,43,.3)!important}' +
    '\n[data-t]{display:inline}';
  const hasT = tIdx > 0;

  const doc = `<!DOCTYPE html>
<html lang="en">
<head>
${head}
${helmetHtml.trim()}
<style>${css}</style>
</head>
<body>
${bodyHtml}
${hasT ? `<script id="i18n" type="application/json">${JSON.stringify(tTable)}</script>` : ''}
${[...extraScripts].map(u => `<script src="${u}" defer></script>`).join('\n')}
${[...extraScripts].some(u => /banna-cart\.js/.test(u)) ? '' : `<script src="${opts.base || './'}banna-cart.js" defer></script>`}
<script src="${opts.base || './'}banna-config.js" defer></script>
<script src="${opts.base || './'}banna.js" defer></script>
<script src="${opts.base || './'}banna-pay.js" defer></script>
<script src="${opts.base || './'}banna-addcart.js" defer></script>
</body>
</html>`;

  return { html: doc, holes: (doc.match(/\{\{/g) || []).length, tCount: tIdx, hoverRules: hoverRules.length };
};
