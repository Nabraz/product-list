/* Runtime Mobile inventory tab, loaded by inventoryAnalytics.js. */
const MOBILE_GROUPS = ['android', 'iphone', 'ipad', 'macbook', 'laptop'];
const MOBILE_WAREHOUSES = [
  { key: 'Jawalakhel B', label: 'LM' },
  { key: 'Jawalakhel A', label: 'AS' },
  { key: 'CITY CENTER WAREHOUSE', label: 'CC' },
  { key: 'NEW ROAD WAREHOUSE', label: 'NW' }
];

function mobileText(value) { return String(value ?? '').trim(); }
function mobileEscape(value) {
  return mobileText(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
function mobileNumber(value) {
  if (value === null || value === undefined || value === '' || value === '-') return 0;
  const parsed = Number.parseFloat(String(value).replace(/,/g, '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}
function mobileFormat(value) {
  return mobileNumber(value).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
function mobileRows(raw) {
  const byCode = new Map();
  (Array.isArray(raw) ? raw : []).forEach(row => {
    const mainGroup = mobileText(row['MAIN GROUP'] || row.mainGroup);
    const groupLower = mainGroup.toLowerCase();
    if (!MOBILE_GROUPS.some(group => groupLower.includes(group))) return;

    const itemCode = mobileText(row['ITEM CODE'] || row.itemCode);
    const itemName = mobileText(row['ITEM NAME'] || row.productName);
    if (!itemCode && !itemName) return;
    const stockByWarehouse = Object.fromEntries(MOBILE_WAREHOUSES.map(warehouse => [warehouse.key, mobileNumber(row[warehouse.key]))]);
    // Exclude products without positive available stock in the selected active branches.
    if (!Object.values(stockByWarehouse).some(quantity => quantity > 0)) return;

    const identity = itemCode || itemName;
    if (!byCode.has(identity)) {
      const appleGroup = /iphone|ipad|macbook/.test(groupLower);
      const firstWord = itemName.split(/\s+/)[0] || 'Unknown';
      byCode.set(identity, {
        itemCode: itemCode || '—', itemName, mainGroup,
        brand: appleGroup ? 'Apple' : firstWord,
        stockByWarehouse: Object.fromEntries(MOBILE_WAREHOUSES.map(warehouse => [warehouse.key, 0]))
      });
    }
    const item = byCode.get(identity);
    MOBILE_WAREHOUSES.forEach(warehouse => { item.stockByWarehouse[warehouse.key] += stockByWarehouse[warehouse.key]; });
  });

  return [...byCode.values()]
    .filter(item => Object.values(item.stockByWarehouse).some(quantity => quantity > 0))
    .sort((a, b) => a.brand.localeCompare(b.brand) || a.itemName.localeCompare(b.itemName));
}

function renderMobileTab(app, query = '', selectedBrand = '') {
  const panel = document.getElementById('mobile-stock-tab');
  if (!panel) return;
  const rows = mobileRows(app.physicalStockProducts);
  const q = query.trim().toLowerCase();
  const brands = [...new Set(rows.map(item => item.brand))].sort((a, b) => a.localeCompare(b));
  const filtered = rows.filter(item => (!selectedBrand || item.brand === selectedBrand) && (!q || `${item.brand} ${item.itemName} ${item.itemCode} ${item.mainGroup}`.toLowerCase().includes(q)));
  const table = document.getElementById('mobileStockRows');
  const count = document.getElementById('mobileStockCount');
  const brandFilter = document.getElementById('mobileBrandFilter');
  if (!table || !count || !brandFilter) return;

  const availableBrands = ['<option value="">All brands</option>', ...brands.map(brand => `<option value="${mobileEscape(brand)}" ${brand === selectedBrand ? 'selected' : ''}>${mobileEscape(brand)}</option>`)];
  brandFilter.innerHTML = availableBrands.join('');
  count.textContent = `${mobileFormat(filtered.length)} stocked products`;
  table.innerHTML = filtered.length ? filtered.map(item => `
    <article class="mobile-stock-card bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <span class="inline-block text-[9px] uppercase tracking-wide font-bold text-indigo-700 bg-indigo-50 rounded px-1.5 py-0.5">${mobileEscape(item.brand)}</span>
          <h3 class="mt-1 text-xs font-bold text-gray-900 break-words">${mobileEscape(item.itemName)}</h3>
          <p class="text-[9px] text-gray-500 font-mono break-all">${mobileEscape(item.itemCode)} · ${mobileEscape(item.mainGroup)}</p>
        </div>
      </div>
      <div class="grid grid-cols-4 gap-1.5 mt-2">
        ${MOBILE_WAREHOUSES.map(warehouse => {
          const quantity = item.stockByWarehouse[warehouse.key];
          return `<div class="rounded-lg border ${quantity > 0 ? 'border-indigo-200 bg-indigo-50' : 'border-gray-100 bg-gray-50'} p-1.5 text-center"><span class="block text-[9px] text-gray-500">${warehouse.label}</span><b class="block text-[11px] ${quantity > 0 ? 'text-indigo-800' : 'text-gray-400'}">${mobileFormat(quantity)}</b></div>`;
        }).join('')}
      </div>
    </article>`).join('') : '<p class="bg-white border border-gray-200 rounded-xl p-5 text-center text-xs text-gray-500">No stocked mobile products match your filters.</p>';
}

function installMobileTab() {
  const appRoot = document.querySelector('[x-data]');
  const nav = document.querySelector('.app-nav > div');
  const main = document.querySelector('.app-shell main');
  if (!appRoot || !nav || !main || document.getElementById('mobile-stock-tab') || !window.Alpine) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'flex-1 flex flex-col items-center justify-center pb-1 gap-0.5 transition-all duration-200';
  button.setAttribute('aria-label', 'Mobile stock');
  button.innerHTML = '<span class="w-12 h-8 flex items-center justify-center rounded-full" data-mobile-icon>📱</span><span class="text-[10px] font-semibold text-gray-400" data-mobile-label>Mobile</span>';
  nav.insertBefore(button, nav.children[2] || null);

  const panel = document.createElement('section');
  panel.id = 'mobile-stock-tab';
  panel.className = 'mobile-stock-layout p-3 space-y-3';
  panel.setAttribute('x-show', "activeTab === 'mobile'");
  panel.style.display = 'none';
  panel.innerHTML = `
    <div class="flex items-end justify-between gap-2">
      <div><h2 class="text-lg font-extrabold text-gray-900">Mobile Stock</h2><p class="text-[10px] text-gray-500">Android, iPhone, iPad, MacBook and Laptop · stocked items only</p></div>
      <span id="mobileStockCount" class="shrink-0 text-[10px] font-semibold text-indigo-700"></span>
    </div>
    <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
      <input id="mobileStockSearch" type="search" class="min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs" placeholder="Search brand, product, or code" aria-label="Search mobile stock">
      <select id="mobileBrandFilter" class="max-w-[130px] rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs" aria-label="Filter by brand"><option value="">All brands</option></select>
    </div>
    <div id="mobileStockRows" class="grid grid-cols-1 gap-2 sm:grid-cols-2"></div>`;
  main.appendChild(panel);
  window.Alpine.initTree(panel);

  const app = window.Alpine.$data(appRoot);
  const input = document.getElementById('mobileStockSearch');
  const brandFilter = document.getElementById('mobileBrandFilter');
  const icon = button.querySelector('[data-mobile-icon]');
  const label = button.querySelector('[data-mobile-label]');
  const activate = () => {
    app.switchTab('mobile');
    renderMobileTab(app, input.value, brandFilter.value);
  };
  button.addEventListener('click', activate);
  input.addEventListener('input', () => renderMobileTab(app, input.value, brandFilter.value));
  brandFilter.addEventListener('change', () => renderMobileTab(app, input.value, brandFilter.value));
  app.$watch('activeTab', tab => {
    const active = tab === 'mobile';
    icon.className = `w-12 h-8 flex items-center justify-center rounded-full ${active ? 'bg-blue-100' : 'bg-transparent'}`;
    label.className = `text-[10px] font-semibold ${active ? 'text-blue-600' : 'text-gray-400'}`;
    if (active) renderMobileTab(app, input.value, brandFilter.value);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installMobileTab, { once: true });
else installMobileTab();
