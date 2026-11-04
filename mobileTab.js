/* Replaces the Accessories tab contents with a mobile-device stock view. */
const MOBILE_GROUPS = ['android', 'iphone', 'ipad', 'macbook', 'laptop'];
const MOBILE_COLUMNS = [
  { key: 'Jawalakhel B', label: 'LM' },
  { key: 'Jawalakhel A', label: 'AS' },
  { key: 'CITY CENTER WAREHOUSE', label: 'CC' },
  { key: 'NEW ROAD WAREHOUSE', label: 'NW' }
];

const mobileText = value => String(value ?? '').trim();
const mobileQty = value => {
  if (value === null || value === undefined || value === '' || value === '-') return 0;
  const number = Number.parseFloat(String(value).replace(/,/g, '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? number : 0;
};
const mobileEscape = value => mobileText(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const mobileFormat = value => mobileQty(value).toLocaleString('en-IN', { maximumFractionDigits: 2 });

function getMobileStock(raw) {
  const byCode = new Map();
  (Array.isArray(raw) ? raw : []).forEach(row => {
    const mainGroup = mobileText(row['MAIN GROUP'] || row.mainGroup);
    const group = mainGroup.toLowerCase();
    if (!MOBILE_GROUPS.some(type => group.includes(type))) return;

    const itemCode = mobileText(row['ITEM CODE'] || row.itemCode);
    const itemName = mobileText(row['ITEM NAME'] || row.productName);
    const identity = itemCode || itemName;
    if (!identity || !itemName) return;

    const quantities = Object.fromEntries(MOBILE_COLUMNS.map(column => [column.key, mobileQty(row[column.key])]));
    // Only items with positive stock in one or more of the four active locations appear.
    if (!Object.values(quantities).some(quantity => quantity > 0)) return;

    const appleProduct = /iphone|ipad|macbook/.test(group);
    const brand = appleProduct ? 'Apple' : (itemName.split(/\s+/)[0] || 'Unknown');
    if (!byCode.has(identity)) {
      byCode.set(identity, { itemCode: itemCode || '—', itemName, mainGroup, brand, quantities: Object.fromEntries(MOBILE_COLUMNS.map(column => [column.key, 0])) });
    }
    const item = byCode.get(identity);
    MOBILE_COLUMNS.forEach(column => { item.quantities[column.key] += quantities[column.key]; });
  });
  return [...byCode.values()]
    .filter(item => Object.values(item.quantities).some(quantity => quantity > 0))
    .sort((a, b) => a.brand.localeCompare(b.brand) || a.itemName.localeCompare(b.itemName));
}

function renderMobileStock(app) {
  const panel = document.getElementById('mobile-stock-panel');
  if (!panel) return;
  const search = panel.querySelector('#mobile-stock-search')?.value.trim().toLowerCase() || '';
  const brandFilter = panel.querySelector('#mobile-stock-brand')?.value || '';
  const allItems = getMobileStock(app.physicalStockProducts);
  const brands = [...new Set(allItems.map(item => item.brand))].sort((a, b) => a.localeCompare(b));
  const brandSelect = panel.querySelector('#mobile-stock-brand');
  const savedBrand = brandFilter;
  brandSelect.innerHTML = `<option value="">All brands</option>${brands.map(brand => `<option value="${mobileEscape(brand)}">${mobileEscape(brand)}</option>`).join('')}`;
  if (brands.includes(savedBrand)) brandSelect.value = savedBrand;

  const filtered = allItems.filter(item => (!brandSelect.value || item.brand === brandSelect.value) &&
    (!search || `${item.brand} ${item.itemName} ${item.itemCode} ${item.mainGroup}`.toLowerCase().includes(search)));
  panel.querySelector('#mobile-stock-count').textContent = `${mobileFormat(filtered.length)} stocked products`;
  const rows = panel.querySelector('#mobile-stock-items');
  rows.innerHTML = filtered.length ? filtered.map(item => `
    <article class="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <span class="inline-block rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-indigo-700">${mobileEscape(item.brand)}</span>
          <h3 class="mt-1 break-words text-xs font-bold text-gray-900">${mobileEscape(item.itemName)}</h3>
          <p class="break-all font-mono text-[9px] text-gray-500">${mobileEscape(item.itemCode)} · ${mobileEscape(item.mainGroup)}</p>
        </div>
      </div>
      <div class="mt-2 grid grid-cols-4 gap-1.5">
        ${MOBILE_COLUMNS.map(column => {
          const quantity = item.quantities[column.key];
          return `<div class="rounded-lg border p-1.5 text-center ${quantity > 0 ? 'border-indigo-200 bg-indigo-50' : 'border-gray-100 bg-gray-50'}"><span class="block text-[9px] text-gray-500">${column.label}</span><b class="block text-[11px] ${quantity > 0 ? 'text-indigo-800' : 'text-gray-400'}">${mobileFormat(quantity)}</b></div>`;
        }).join('')}
      </div>
    </article>`).join('') : '<p class="rounded-xl border border-gray-200 bg-white p-5 text-center text-xs text-gray-500">No stocked mobile products match your filters.</p>';
}

function installMobileTab() {
  const root = document.querySelector('[x-data]');
  const main = document.querySelector('.app-shell main');
  const nav = document.querySelector('.app-nav > div');
  if (!root || !main || !nav || !window.Alpine) return;
  const listSection = [...main.querySelectorAll('[x-show]')].find(element => element.getAttribute('x-show') === "activeTab === 'list'");
  if (!listSection || listSection.dataset.mobileTabInstalled === 'true') return;
  listSection.dataset.mobileTabInstalled = 'true';

  // Keep the existing tab key and nav button, but repurpose Accessories as Mobile.
  const listButton = [...nav.querySelectorAll('button')].find(button => button.getAttribute('@click') === "switchTab('list')");
  if (listButton) {
    const label = listButton.querySelector('span:last-child');
    if (label) label.textContent = 'Mobile';
    const icon = listButton.querySelector('svg');
    if (icon) icon.outerHTML = '<span class="text-lg" aria-hidden="true">📱</span>';
  }
  const heading = document.querySelector('header h1');
  if (heading) {
    const updateHeading = tab => { if (tab === 'list') heading.textContent = 'Mobile Stock'; };
    updateHeading(window.Alpine.$data(root).activeTab);
    window.Alpine.$data(root).$watch('activeTab', updateHeading);
  }

  listSection.innerHTML = `
    <section id="mobile-stock-panel" class="mobile-stock-layout min-w-0 space-y-3 p-3">
      <div class="flex items-end justify-between gap-2">
        <div><h2 class="text-lg font-extrabold text-gray-900">Mobile Stock</h2><p class="text-[10px] text-gray-500">Android, iPhone, iPad, MacBook, Laptop · positive stock only</p></div>
        <span id="mobile-stock-count" class="shrink-0 text-[10px] font-semibold text-indigo-700"></span>
      </div>
      <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <input id="mobile-stock-search" type="search" class="min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs" placeholder="Search brand, product, or code" aria-label="Search mobile stock">
        <select id="mobile-stock-brand" class="max-w-[130px] rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs" aria-label="Filter by brand"><option value="">All brands</option></select>
      </div>
      <div id="mobile-stock-items" class="grid grid-cols-1 gap-2 sm:grid-cols-2"></div>
    </section>`;

  const app = window.Alpine.$data(root);
  const panel = listSection.querySelector('#mobile-stock-panel');
  window.Alpine.initTree(panel);
  panel.querySelector('#mobile-stock-search').addEventListener('input', () => renderMobileStock(app));
  panel.querySelector('#mobile-stock-brand').addEventListener('change', () => renderMobileStock(app));
  app.$watch('physicalStockProducts', () => renderMobileStock(app));
  app.$watch('activeTab', tab => { if (tab === 'list') renderMobileStock(app); });
  renderMobileStock(app);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installMobileTab, { once: true });
else installMobileTab();
