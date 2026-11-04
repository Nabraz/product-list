

// ─── Configuration ────────────────────────────────────────────────────────────
const MOBILE_GROUPS = ['android', 'iphone', 'ipad', 'macbook', 'laptop'];

const MAIN_GROUP_LABELS = {
  android: 'Android',
  iphone:  'iPhone',
  ipad:    'iPad',
  macbook: 'MacBook',
  laptop:  'Laptop'
};

// Raw MAIN GROUP values that map to each key (handles "Andorid" typo in source data)
const MAIN_GROUP_ALIASES = {
  android: ['android', 'andorid'],
  iphone:  ['iphone'],
  ipad:    ['ipad'],
  macbook: ['macbook', 'imac'],
  laptop:  ['laptop']
};

// Only these main groups get sub-grouped by the first word of the product name
const SUBGROUPED_MAIN_GROUPS = new Set(['android', 'laptop']);

// The 4 active warehouse columns and their short labels
const MOBILE_COLUMNS = [
  { key: 'Jawalakhel B',         label: 'LM' },
  { key: 'Jawalakhel A',         label: 'AS' },
  { key: 'CITY CENTER WAREHOUSE',label: 'CC' },
  { key: 'NEW ROAD WAREHOUSE',   label: 'NW' }
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const mobileText = v => String(v ?? '').trim();
const mobileQty = v => {
  if (v === null || v === undefined || v === '' || v === '-') return 0;
  const n = Number.parseFloat(String(v).replace(/,/g, '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const mobileEscape = v => mobileText(v).replace(/[&<>"']/g, c =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const mobileFormat = v => mobileQty(v).toLocaleString('en-IN', { maximumFractionDigits: 2 });

// Map a raw MAIN GROUP value to a known mobile key, or null
function matchMainGroup(rawMainGroup) {
  const group = mobileText(rawMainGroup).toLowerCase();
  if (!group) return null;
  for (const [key, aliases] of Object.entries(MAIN_GROUP_ALIASES)) {
    if (aliases.some(a => group === a || group.includes(a))) return key;
  }
  return null;
}

// Sub-group key = first word of the product name
function firstWord(itemName) {
  return mobileText(itemName).split(/\s+/)[0] || 'Other';
}

// ─── Data builder ─────────────────────────────────────────────────────────────
function getMobileStock(raw) {
  const byCode = new Map();
  (Array.isArray(raw) ? raw : []).forEach(row => {
    const mainGroupKey = matchMainGroup(row['MAIN GROUP'] || row.mainGroup);
    if (!mainGroupKey) return;

    const itemCode = mobileText(row['ITEM CODE'] || row.itemCode);
    const itemName = mobileText(row['ITEM NAME'] || row.productName);
    const identity = itemCode || itemName;
    if (!identity || !itemName) return;

    const quantities = Object.fromEntries(
      MOBILE_COLUMNS.map(c => [c.key, mobileQty(row[c.key])])
    );
    // Only include items with positive stock in one of the 4 active warehouses
    if (!Object.values(quantities).some(q => q > 0)) return;

    if (!byCode.has(identity)) {
      byCode.set(identity, {
        itemCode:        itemCode || '—',
        itemName,
        mainGroupKey,
        mainGroupLabel:  MAIN_GROUP_LABELS[mainGroupKey],
        subGroupKey:     firstWord(itemName),
        quantities:      Object.fromEntries(MOBILE_COLUMNS.map(c => [c.key, 0]))
      });
    }
    const item = byCode.get(identity);
    MOBILE_COLUMNS.forEach(c => { item.quantities[c.key] += quantities[c.key]; });
  });
  return [...byCode.values()];
}

// Build nested tree: [{ mainGroup, label, totalItems, subGroups:[{ key, label, items }] }]
function groupMobileStock(items) {
  const buckets = new Map();
  MOBILE_GROUPS.forEach(mg => buckets.set(mg, new Map()));

  items.forEach(item => {
    const mg = item.mainGroupKey;
    if (!buckets.has(mg)) buckets.set(mg, new Map());
    const subMap = buckets.get(mg);
    const subKey = SUBGROUPED_MAIN_GROUPS.has(mg) ? item.subGroupKey : '__flat__';
    if (!subMap.has(subKey)) subMap.set(subKey, []);
    subMap.get(subKey).push(item);
  });

  const tree = [];
  MOBILE_GROUPS.forEach(mg => {
    const subMap = buckets.get(mg);
    if (!subMap || subMap.size === 0) return;

    const subGroups = [];
    let totalItems = 0;

    [...subMap.keys()]
      .sort((a, b) => (a === '__flat__' ? -1 : b === '__flat__' ? 1 : a.localeCompare(b)))
      .forEach(subKey => {
        const list = subMap.get(subKey).sort((a, b) => a.itemName.localeCompare(b.itemName));
        if (!list.length) return;
        subGroups.push({
          key:   subKey,
          label: subKey === '__flat__' ? null : subKey,
          items: list
        });
        totalItems += list.length;
      });

    if (!subGroups.length) return;
    tree.push({ key: mg, label: MAIN_GROUP_LABELS[mg], subGroups, totalItems });
  });

  return tree;
}

// ─── Rendering ────────────────────────────────────────────────────────────────
function renderMobileCard(item) {
  return `
    <article class="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div class="min-w-0">
        <h3 class="break-words text-xs font-bold text-gray-900">${mobileEscape(item.itemName)}</h3>
        <p class="break-all font-mono text-[9px] text-gray-500">
          ${mobileEscape(item.itemCode)} · ${mobileEscape(item.mainGroupLabel)}${item.subGroupKey && item.subGroupKey !== '__flat__' ? ' · ' + mobileEscape(item.subGroupKey) : ''}
        </p>
      </div>
      <div class="mt-2 grid grid-cols-4 gap-1.5">
        ${MOBILE_COLUMNS.map(c => {
          const q = item.quantities[c.key];
          const on = q > 0;
          return `<div class="rounded-lg border p-1.5 text-center ${on ? 'border-indigo-200 bg-indigo-50' : 'border-gray-100 bg-gray-50'}">
            <span class="block text-[9px] text-gray-500">${c.label}</span>
            <b class="block text-[11px] ${on ? 'text-indigo-800' : 'text-gray-400'}">${mobileFormat(q)}</b>
          </div>`;
        }).join('')}
      </div>
    </article>`;
}

function renderMobileTree(tree) {
  if (!tree.length) {
    return `<p class="rounded-xl border border-gray-200 bg-white p-5 text-center text-xs text-gray-500">No stocked mobile products match your filters.</p>`;
  }
  return tree.map(mg => `
    <section class="space-y-2">
      <div class="flex items-center justify-between border-b-2 border-indigo-200 pb-1.5">
        <h3 class="text-sm font-bold uppercase tracking-wider text-indigo-800">${mobileEscape(mg.label)}</h3>
        <span class="text-[10px] font-semibold text-indigo-600">${mg.totalItems} item${mg.totalItems === 1 ? '' : 's'}</span>
      </div>
      ${mg.subGroups.map(sub => `
        <div class="space-y-1.5">
          ${sub.label
            ? `<h4 class="mt-2 text-[10px] font-bold uppercase tracking-wider text-gray-600">
                 ${mobileEscape(sub.label)}
                 <span class="text-gray-400 font-normal">(${sub.items.length})</span>
               </h4>`
            : ''}
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            ${sub.items.map(renderMobileCard).join('')}
          </div>
        </div>`).join('')}
    </section>`).join('');
}

function renderMobileStock(app) {
  const panel = document.getElementById('mobile-stock-panel');
  if (!panel) return;

  const search       = panel.querySelector('#mobile-stock-search')?.value.trim().toLowerCase() || '';
  const mainSelect   = panel.querySelector('#mobile-stock-main-group');
  const subSelect    = panel.querySelector('#mobile-stock-subgroup');
  const subWrap      = panel.querySelector('#mobile-stock-subgroup-wrap');
  const currentMain  = mainSelect?.value || '';
  const currentSub   = subSelect?.value || '';

  const raw = app.physicalStockProducts || app.physicalStock || [];
  const allItems = getMobileStock(raw);

  // 1. Populate main group dropdown (only groups with stock)
  const presentMain = new Set(allItems.map(i => i.mainGroupKey));
  mainSelect.innerHTML = `<option value="">All main groups</option>` +
    MOBILE_GROUPS.filter(k => presentMain.has(k))
      .map(k => `<option value="${k}">${MAIN_GROUP_LABELS[k]}</option>`).join('');
  if (MOBILE_GROUPS.includes(currentMain)) mainSelect.value = currentMain;

  // 2. Sub-group dropdown — only for Android / Laptop
  const showSub = SUBGROUPED_MAIN_GROUPS.has(mainSelect.value);
  if (subWrap) subWrap.classList.toggle('hidden', !showSub);
  if (showSub) {
    const subsPresent = [...new Set(
      allItems.filter(i => i.mainGroupKey === mainSelect.value).map(i => i.subGroupKey)
    )].sort((a, b) => a.localeCompare(b));
    subSelect.innerHTML = `<option value="">All ${MAIN_GROUP_LABELS[mainSelect.value]} brands</option>` +
      subsPresent.map(s => `<option value="${mobileEscape(s)}">${mobileEscape(s)}</option>`).join('');
    subSelect.value = subsPresent.includes(currentSub) ? currentSub : '';
  }

  // 3. Apply filters
  const filtered = allItems.filter(item => {
    if (mainSelect.value && item.mainGroupKey !== mainSelect.value) return false;
    if (showSub && subSelect.value && item.subGroupKey !== subSelect.value) return false;
    if (search) {
      const hay = `${item.itemName} ${item.itemCode} ${item.mainGroupLabel} ${item.subGroupKey}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  // 4. Render
  const tree = groupMobileStock(filtered);
  const total = tree.reduce((s, g) => s + g.totalItems, 0);
  panel.querySelector('#mobile-stock-count').textContent =
    `${mobileFormat(total)} stocked product${total === 1 ? '' : 's'}`;
  panel.querySelector('#mobile-stock-items').innerHTML = renderMobileTree(tree);
}

// ─── Install ──────────────────────────────────────────────────────────────────
function installMobileTab() {
  const root = document.querySelector('[x-data]');
  const main = document.querySelector('.app-shell main');
  const nav  = document.querySelector('.app-nav > div');
  if (!root || !main || !nav || !window.Alpine) return;

  const listSection = [...main.querySelectorAll('[x-show]')]
    .find(el => el.getAttribute('x-show') === "activeTab === 'list'");
  if (!listSection || listSection.dataset.mobileTabInstalled === 'true') return;
  listSection.dataset.mobileTabInstalled = 'true';

  // Repurpose the Accessories nav button as Mobile
  const listButton = [...nav.querySelectorAll('button')]
    .find(b => b.getAttribute('@click') === "switchTab('list')");
  if (listButton) {
    const label = listButton.querySelector('span:last-child');
    if (label) label.textContent = 'Mobile';
    const icon = listButton.querySelector('svg');
    if (icon) icon.outerHTML = '<span class="text-lg" aria-hidden="true">📱</span>';
  }

  // Page heading follows active tab
  const heading = document.querySelector('header h1');
  if (heading) {
    const data = window.Alpine.$data(root);
    const updateHeading = tab => { if (tab === 'list') heading.textContent = 'Mobile Stock'; };
    updateHeading(data.activeTab);
    data.$watch('activeTab', updateHeading);
  }

  listSection.innerHTML = `
    <section id="mobile-stock-panel" class="mobile-stock-layout min-w-0 space-y-3 p-3">
      <div class="flex items-end justify-between gap-2">
        <div>
          <h2 class="text-lg font-extrabold text-gray-900">Mobile Stock</h2>
          <p class="text-[10px] text-gray-500">Main group → brand sub-group · positive stock only</p>
        </div>
        <span id="mobile-stock-count" class="shrink-0 text-[10px] font-semibold text-indigo-700"></span>
      </div>

      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label class="mb-1 block text-[9px] font-bold uppercase tracking-wider text-gray-500">Main Group</label>
          <select id="mobile-stock-main-group" class="w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs" aria-label="Filter by main group">
            <option value="">All main groups</option>
          </select>
        </div>
        <div id="mobile-stock-subgroup-wrap" class="hidden">
          <label class="mb-1 block text-[9px] font-bold uppercase tracking-wider text-gray-500">Brand (sub-group)</label>
          <select id="mobile-stock-subgroup" class="w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs" aria-label="Filter by brand">
            <option value="">All brands</option>
          </select>
        </div>
      </div>

      <div>
        <input id="mobile-stock-search" type="search"
          class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs"
          placeholder="Search brand, product, or code" aria-label="Search mobile stock">
      </div>

      <div id="mobile-stock-items" class="space-y-4"></div>
    </section>
  `;

  const app   = window.Alpine.$data(root);
  const panel = listSection.querySelector('#mobile-stock-panel');
  window.Alpine.initTree(panel);

  panel.querySelector('#mobile-stock-main-group').addEventListener('change', () => renderMobileStock(app));
  panel.querySelector('#mobile-stock-subgroup').addEventListener('change',  () => renderMobileStock(app));
  panel.querySelector('#mobile-stock-search').addEventListener('input',      () => renderMobileStock(app));

  app.$watch('physicalStockProducts', () => renderMobileStock(app));
  app.$watch('activeTab', tab => { if (tab === 'list') renderMobileStock(app); });
  renderMobileStock(app);
}

if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', installMobileTab, { once: true });
else
  installMobileTab();
