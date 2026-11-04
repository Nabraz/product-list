/** Active physical-stock analytics. Pure functions; no browser APIs or DOM access. */
export const ACTIVE_WAREHOUSES = [
  { key: 'CITY CENTER WAREHOUSE', label: 'City Center', short: 'City Center', property: 'CityCenter' },
  { key: 'Jawalakhel A', label: 'Jawalakhel A', short: 'JWL A', property: 'JwlA' },
  { key: 'Jawalakhel B', label: 'Jawalakhel B', short: 'JWL B', property: 'JwlB' },
  { key: 'NEW ROAD WAREHOUSE', label: 'New Road Warehouse', short: 'New Road', property: 'NewRoad' }
];

const EMPTY_WAREHOUSE_TOTALS = () => ({ CityCenter: 0, JwlA: 0, JwlB: 0, NewRoad: 0 });
const STRING_FIELDS = ['ITEM CODE', 'BATCH', 'BATCHID', 'ITEM NAME', 'UNIT', 'SUPPLIER', 'CATEGORY', 'MAIN GROUP', 'SUB GROUP_A', 'SUB GROUP_B', 'SUB GROUP_C'];
const VALID_UNITS = new Set(['Pcs', 'PCS', 'Pcs.', 'Each']);
const SEVERITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };

function text(value) { return value == null ? '' : String(value).trim(); }
function numeric(value) {
  if (value == null || value === '' || value === '-') return 0;
  const parsed = Number.parseFloat(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}
function nonEmpty(...values) { return values.map(text).find(Boolean) || ''; }
function prefixFor(batch) {
  const value = text(batch).toUpperCase();
  if (value.startsWith('PERI')) return 'PERI';
  if (value.startsWith('OP')) return 'OP';
  if (value.startsWith('PI')) return 'PI';
  return 'OTHER';
}
function capped(list, limit = 25) {
  const out = list.slice(0, limit);
  out.truncated = list.length > limit;
  out.remainingCount = Math.max(0, list.length - limit);
  return out;
}
function safePercent(numerator, denominator) { return denominator === 0 ? 0 : (numerator / denominator) * 100; }
function aggregateKeyed(rows, keyFn) {
  const map = new Map();
  rows.forEach(row => {
    const key = keyFn(row);
    if (!key) return;
    if (!map.has(key)) map.set(key, { name: key, skuSet: new Set(), totalQty: 0, totalValue: 0, rates: [], supplierSet: new Set() });
    const entry = map.get(key);
    entry.skuSet.add(row.itemCode);
    entry.totalQty += row.activeQty;
    entry.totalValue += row.activeValue;
    if (row.rate > 0) entry.rates.push(row.rate);
    if (row.supplier) entry.supplierSet.add(row.supplier);
  });
  return map;
}
function sortedMetricList(values) {
  return values.map(row => ({ ...row, skuCount: row.skuSet.size, skuSet: undefined, rates: undefined, supplierSet: undefined }))
    .sort((a, b) => b.totalValue - a.totalValue || b.totalQty - a.totalQty);
}
function summaryItems(items) {
  return [...items.values()].map(item => ({
    itemCode: item.itemCode, itemName: item.itemName, totalQty: item.activeQty,
    totalValue: item.activeValue, weightedAvgRate: item.weightedAvgRate
  }));
}

/** Cleans one raw batch row and derives active-warehouse quantities and value. */
export function cleanRow(row = {}) {
  const strings = Object.fromEntries(STRING_FIELDS.map(key => [key, text(row[key])]));
  const itemCode = strings['ITEM CODE'];
  const batch = nonEmpty(strings.BATCH, strings.BATCHID);
  const unitRaw = strings.UNIT;
  const wh = {
    CityCenter: numeric(row['CITY CENTER WAREHOUSE']),
    JwlA: numeric(row['Jawalakhel A']),
    JwlB: numeric(row['Jawalakhel B']),
    NewRoad: numeric(row['NEW ROAD WAREHOUSE'])
  };
  const rate = numeric(row.RATE);
  const activeQty = wh.CityCenter + wh.JwlA + wh.JwlB + wh.NewRoad;
  return {
    itemCode, batch, itemName: strings['ITEM NAME'], unit: unitRaw ? 'Pcs' : 'Pcs',
    supplier: strings.SUPPLIER, category: strings.CATEGORY, mainGroup: strings['MAIN GROUP'],
    subA: strings['SUB GROUP_A'], subB: strings['SUB GROUP_B'], subC: strings['SUB GROUP_C'],
    rate, totalQty: numeric(row['TOTAL STOCK QTY']), totalValue: numeric(row['TOTAL STOCK VALUE']),
    wh, activeQty, activeValue: activeQty * rate, batchPrefix: prefixFor(batch),
    _unitRaw: unitRaw
  };
}

/** Normalizes raw batch records and groups them by ITEM CODE using a Map. */
export function buildNormalizedInventory(raw = []) {
  const source = Array.isArray(raw) ? raw : [];
  const rows = source.map(row => cleanRow(row || {}));
  const items = new Map();
  rows.forEach(row => {
    const key = row.itemCode;
    if (!items.has(key)) {
      items.set(key, {
        itemCode: key, itemName: row.itemName, category: row.category, mainGroup: row.mainGroup,
        subGroups: { a: row.subA, b: row.subB, c: row.subC }, supplier: row.supplier,
        supplierSet: new Set(), unit: 'Pcs', batchCount: 0, batches: [], totalQty: 0,
        activeQty: 0, totalValue: 0, activeValue: 0, weightedAvgRate: 0,
        whTotals: EMPTY_WAREHOUSE_TOTALS(), hasNegativeStock: false, hasZeroRate: false,
        batchPrefixes: new Set(), _positiveRates: []
      });
    }
    const item = items.get(key);
    if (!item.itemName && row.itemName) item.itemName = row.itemName;
    if (!item.category && row.category) item.category = row.category;
    if (!item.mainGroup && row.mainGroup) item.mainGroup = row.mainGroup;
    if (!item.subGroups.a && row.subA) item.subGroups.a = row.subA;
    if (!item.subGroups.b && row.subB) item.subGroups.b = row.subB;
    if (!item.subGroups.c && row.subC) item.subGroups.c = row.subC;
    if (!item.supplier && row.supplier) item.supplier = row.supplier;
    if (row.supplier) item.supplierSet.add(row.supplier);
    item.batchCount++;
    item.batches.push(row);
    item.totalQty += row.totalQty;
    item.activeQty += row.activeQty;
    item.totalValue += row.totalValue;
    item.activeValue += row.activeValue;
    Object.keys(item.whTotals).forEach(keyName => { item.whTotals[keyName] += row.wh[keyName]; });
    item.hasNegativeStock ||= row.totalQty < 0;
    item.batchPrefixes.add(row.batchPrefix);
    if (row.rate > 0) item._positiveRates.push(row.rate);
  });
  items.forEach(item => {
    item.weightedAvgRate = item.activeQty > 0
      ? item.activeValue / item.activeQty
      : (item._positiveRates.length ? item._positiveRates.reduce((a, b) => a + b, 0) / item._positiveRates.length : 0);
    item.hasZeroRate = item.weightedAvgRate === 0 && item.totalQty !== 0;
    delete item._positiveRates;
  });
  return { items, rows };
}

/** Computes the complete active-warehouse analytics report from raw batch rows. */
export function computeInventoryAnalytics(raw = []) {
  const source = Array.isArray(raw) ? raw : [];
  const { items, rows } = buildNormalizedInventory(source);
  const itemList = [...items.values()];
  const totalQty = rows.reduce((sum, row) => sum + row.activeQty, 0);
  const totalValue = rows.reduce((sum, row) => sum + row.activeValue, 0);
  const globalStats = {
    totalSKUs: items.size, totalBatches: source.length, totalQty, totalValue,
    weightedAvgRate: totalQty === 0 ? 0 : totalValue / totalQty,
    activeWarehouseCount: ACTIVE_WAREHOUSES.length,
    activeWarehouseLabels: ACTIVE_WAREHOUSES.map(warehouse => warehouse.label)
  };

  const warehouseBreakdown = ACTIVE_WAREHOUSES.map(warehouse => {
    const quantity = rows.reduce((sum, row) => sum + row.wh[warehouse.property], 0);
    const value = rows.reduce((sum, row) => sum + row.wh[warehouse.property] * row.rate, 0);
    const skuCount = itemList.filter(item => item.whTotals[warehouse.property] > 0).length;
    return {
      warehouseKey: warehouse.key, label: warehouse.label, short: warehouse.short,
      totalQty: quantity, totalValue: value, skuCount,
      percentQty: safePercent(quantity, totalQty), percentValue: safePercent(value, totalValue)
    };
  });
  let itemsInMultipleWarehouses = 0, itemsInSingleWarehouse = 0, itemsInZeroWarehouses = 0;
  itemList.forEach(item => {
    const count = ACTIVE_WAREHOUSES.filter(w => item.whTotals[w.property] > 0).length;
    if (count > 1) itemsInMultipleWarehouses++;
    else if (count === 1) itemsInSingleWarehouse++;
    else itemsInZeroWarehouses++;
  });
  const maxWarehouseQty = Math.max(0, ...warehouseBreakdown.map(warehouse => warehouse.totalQty));
  warehouseBreakdown.itemsInMultipleWarehouses = itemsInMultipleWarehouses;
  warehouseBreakdown.itemsInSingleWarehouse = itemsInSingleWarehouse;
  warehouseBreakdown.itemsInZeroWarehouses = itemsInZeroWarehouses;
  warehouseBreakdown.concentrationIndex = safePercent(maxWarehouseQty, totalQty);

  const categories = aggregateKeyed(rows, row => row.category);
  const categoryBreakdown = sortedMetricList([...categories.values()].map(row => ({
    category: row.name, skuSet: row.skuSet, totalQty: row.totalQty, totalValue: row.totalValue,
    percentValue: safePercent(row.totalValue, totalValue)
  })));
  const mainGroups = aggregateKeyed(rows, row => row.mainGroup);
  const mainGroupBreakdown = sortedMetricList([...mainGroups.values()].map(row => ({
    mainGroup: row.name, skuSet: row.skuSet, totalQty: row.totalQty, totalValue: row.totalValue,
    percentValue: safePercent(row.totalValue, totalValue)
  })));

  const supplierMap = new Map();
  rows.forEach(row => {
    if (!row.supplier) return;
    if (!supplierMap.has(row.supplier)) supplierMap.set(row.supplier, { supplier: row.supplier, skuSet: new Set(), totalQty: 0, totalValue: 0, rateQty: 0, rateValue: 0 });
    const supplierRow = supplierMap.get(row.supplier);
    supplierRow.skuSet.add(row.itemCode);
    supplierRow.totalQty += row.activeQty;
    supplierRow.totalValue += row.activeValue;
    supplierRow.rateQty += row.activeQty;
    supplierRow.rateValue += row.activeValue;
  });
  const supplierRows = [...supplierMap.values()].map(row => ({
    supplier: row.supplier, skuCount: row.skuSet.size, totalQty: row.totalQty,
    totalValue: row.totalValue, avgRatePerUnit: row.rateQty === 0 ? 0 : row.rateValue / row.rateQty
  })).sort((a, b) => b.totalValue - a.totalValue || b.totalQty - a.totalQty);
  const supplierCount = supplierRows.length;
  const top5ConcentrationPercent = safePercent(supplierRows.slice(0, 5).reduce((sum, row) => sum + row.totalValue, 0), totalValue);
  const crossSupplierItems = itemList.filter(item => item.supplierSet.size > 1).map(item => {
    const rates = new Map();
    item.batches.forEach(row => { if (row.supplier && row.rate > 0) rates.set(row.supplier, [...(rates.get(row.supplier) || []), row.rate]); });
    const averages = [...rates.values()].map(list => list.reduce((a, b) => a + b, 0) / list.length);
    const min = Math.min(...averages), max = Math.max(...averages);
    return { itemCode: item.itemCode, itemName: item.itemName, suppliers: [...item.supplierSet].sort(), rateSpreadPercent: max === 0 ? 0 : ((max - min) / max) * 100 };
  }).sort((a, b) => b.rateSpreadPercent - a.rateSpreadPercent);
  supplierRows.truncated = supplierRows.length > 25;
  supplierRows.remainingCount = Math.max(0, supplierRows.length - 25);
  supplierRows.splice(25);
  supplierRows.supplierCount = supplierCount;
  supplierRows.top5ConcentrationPercent = top5ConcentrationPercent;
  supplierRows.crossSupplierItems = capped(crossSupplierItems);

  const brandMap = new Map();
  itemList.forEach(item => {
    const match = item.itemName.match(/\b[A-Z][A-Z0-9&+-]{2,}\b/);
    if (!match) return;
    const brand = match[0];
    if (!brandMap.has(brand)) brandMap.set(brand, { brand, skuSet: new Set(), totalQty: 0, totalValue: 0 });
    const entry = brandMap.get(brand);
    entry.skuSet.add(item.itemCode); entry.totalQty += item.activeQty; entry.totalValue += item.activeValue;
  });
  const brandBreakdown = [...brandMap.values()].map(row => ({ brand: row.brand, skuCount: row.skuSet.size, totalQty: row.totalQty, totalValue: row.totalValue }))
    .sort((a, b) => b.totalValue - a.totalValue || b.totalQty - a.totalQty);
  brandBreakdown.truncated = brandBreakdown.length > 20;
  brandBreakdown.remainingCount = Math.max(0, brandBreakdown.length - 20);
  brandBreakdown.splice(20);

  const allItemSummaries = summaryItems(items);
  const topItems = {
    topByValue: capped([...allItemSummaries].sort((a, b) => b.totalValue - a.totalValue || b.totalQty - a.totalQty), 20),
    topByQuantity: capped([...allItemSummaries].sort((a, b) => b.totalQty - a.totalQty || b.totalValue - a.totalValue), 20)
  };

  const negativeItems = itemList.filter(item => item.totalQty < 0);
  const duplicateNameMap = new Map(), duplicateCodeMap = new Map();
  itemList.forEach(item => {
    if (item.itemName) duplicateNameMap.set(item.itemName, [...(duplicateNameMap.get(item.itemName) || []), item.itemCode]);
    duplicateCodeMap.set(item.itemCode, [...(duplicateCodeMap.get(item.itemCode) || []), ...new Set(item.batches.map(row => row.itemName).filter(Boolean))]);
  });
  const priceAnomalies = itemList.map(item => {
    if (item.weightedAvgRate === 0) return null;
    const outliers = item.batches.filter(row => Math.abs(row.rate - item.weightedAvgRate) / Math.abs(item.weightedAvgRate) > .2)
      .map(row => ({ batch: row.batch, rate: row.rate, deviationPercent: Math.abs(row.rate - item.weightedAvgRate) / Math.abs(item.weightedAvgRate) * 100 }));
    return outliers.length ? { itemCode: item.itemCode, itemName: item.itemName, weightedAvgRate: item.weightedAvgRate, outliers } : null;
  }).filter(Boolean);
  const quality = qualityReport(source, rows, itemList, duplicateCodeMap);
  const stockHealth = {
    negativeStock: capped(negativeItems.map(item => ({ itemCode: item.itemCode, itemName: item.itemName, totalQty: item.totalQty, totalValue: item.totalValue })).sort((a,b)=>a.totalQty-b.totalQty)),
    negativeStockValue: negativeItems.reduce((sum, item) => sum + item.totalValue, 0),
    zeroRateWithStock: capped(itemList.filter(item => item.hasZeroRate).map(item => ({ itemCode: item.itemCode, itemName: item.itemName, totalQty: item.totalQty }))),
    duplicateNames: capped([...duplicateNameMap].filter(([,codes]) => new Set(codes).size > 1).map(([itemName,codes]) => ({ itemName, itemCodes: [...new Set(codes)] }))),
    duplicateCodes: capped([...duplicateCodeMap].filter(([,names]) => new Set(names).size > 1).map(([itemCode,names]) => ({ itemCode, itemNames: [...new Set(names)] }))),
    priceAnomalies: capped(priceAnomalies),
    missingSupplier: capped(rows.filter(row => !row.supplier).map(row => ({ itemCode: row.itemCode, batch: row.batch }))),
    missingCategory: capped(rows.filter(row => !row.category).map(row => ({ itemCode: row.itemCode, batch: row.batch }))),
    orphanSKUs: capped(itemList.filter(item => !item.itemName).map(item => ({ itemCode: item.itemCode, itemName: item.itemName, totalQty: item.activeQty, totalValue: item.activeValue })))
  };

  const vintage = { OP: { qty: 0, value: 0 }, PI: { qty: 0, value: 0 }, PERI: { qty: 0, value: 0 }, OTHER: { qty: 0, value: 0 } };
  rows.forEach(row => { vintage[row.batchPrefix].qty += row.activeQty; vintage[row.batchPrefix].value += row.activeValue; });
  Object.values(vintage).forEach(group => { group.percentQty = safePercent(group.qty, totalQty); group.percentValue = safePercent(group.value, totalValue); });
  const histogram = { '1': 0, '2-5': 0, '6-10': 0, '11-20': 0, '21+': 0 };
  itemList.forEach(item => { const count = item.batchCount; if (count === 1) histogram['1']++; else if (count <= 5) histogram['2-5']++; else if (count <= 10) histogram['6-10']++; else if (count <= 20) histogram['11-20']++; else histogram['21+']++; });
  const batchVintage = {
    ...vintage,
    mixedVintageSKUs: itemList.filter(item => item.batchPrefixes.has('OP') && item.batchPrefixes.has('PI')).length,
    avgBatchesPerItem: itemList.length ? rows.length / itemList.length : 0,
    batchCountHistogram: histogram
  };

  const alerts = [];
  itemList.forEach(item => {
    const base = { itemCode: item.itemCode, itemName: item.itemName, qty: item.activeQty, value: item.activeValue };
    if (item.totalQty < 0) alerts.push({ severity: 'HIGH', type: 'NEGATIVE', ...base, message: `Total stock quantity is ${formatNumber(item.totalQty, 0)}.` });
    if (item.weightedAvgRate === 0 && item.totalQty > 0) alerts.push({ severity: 'HIGH', type: 'PRICE_GAP', ...base, message: 'Stock exists but the weighted average rate is zero.' });
    if (item.activeQty === 0) alerts.push({ severity: 'MEDIUM', type: 'OUT_OF_STOCK', ...base, message: 'No active-warehouse stock is available.' });
    const positiveWarehouses = ACTIVE_WAREHOUSES.filter(w => item.whTotals[w.property] > 0);
    if (item.activeQty > 0 && positiveWarehouses.length === 1) alerts.push({ severity: 'MEDIUM', type: 'CONCENTRATION', ...base, message: `All positive stock is concentrated in ${positiveWarehouses[0].label}.` });
    if (item.activeQty > 0 && item.activeQty < 5) alerts.push({ severity: 'MEDIUM', type: 'LOW_STOCK', ...base, message: 'Active stock is below 5 units.' });
    if (item.batchCount && [...item.batchPrefixes].every(prefix => prefix === 'OP')) alerts.push({ severity: 'LOW', type: 'STALE', ...base, message: 'All batches have the OP prefix.' });
    if (item.batchCount === 1) alerts.push({ severity: 'LOW', type: 'SINGLE_BATCH', ...base, message: 'Item is represented by a single batch.' });
  });
  alerts.sort((a,b)=>SEVERITY_ORDER[a.severity]-SEVERITY_ORDER[b.severity] || a.type.localeCompare(b.type) || a.itemCode.localeCompare(b.itemCode));
  const limitedAlerts = capped(alerts);

  const categoryWarehouseHeatmap = [...categories.keys()].map(category => {
    const qtyByWarehouse = Object.fromEntries(ACTIVE_WAREHOUSES.map(w => [w.property, rows.filter(row => row.category === category).reduce((sum,row)=>sum+row.wh[w.property],0)]));
    return { category, ...qtyByWarehouse };
  }).sort((a,b)=>categoryBreakdown.find(x=>x.category===b.category).totalValue-categoryBreakdown.find(x=>x.category===a.category).totalValue);
  const dashboardConfig = [
    { id: 'total-skus', title: 'Total SKUs', type: 'KPI', dataKey: 'globalStats.totalSKUs', notes: 'Distinct ITEM CODE values.' },
    { id: 'total-qty', title: 'Total Qty', type: 'KPI', dataKey: 'globalStats.totalQty', notes: 'Sum of active warehouse quantities.' },
    { id: 'total-value', title: 'Total Value', type: 'KPI', dataKey: 'globalStats.totalValue', notes: 'Active quantity multiplied by batch rate.' },
    { id: 'alerts-count', title: 'Alerts count', type: 'KPI', dataKey: 'alerts.length', notes: 'Badge uses HIGH, MEDIUM, and LOW severity.' },
    { id: 'warehouse-value', title: 'Value by Warehouse', type: 'BAR', dataKey: 'warehouseBreakdown', notes: 'Active warehouse value only.' },
    { id: 'warehouse-qty-share', title: 'Qty share by Warehouse', type: 'DONUT', dataKey: 'warehouseBreakdown', notes: 'Percentage of active quantity.' },
    { id: 'top-categories', title: 'Top 10 Categories by Value', type: 'BAR', dataKey: 'categoryBreakdown', notes: 'Sorted by active stock value.' },
    { id: 'top-skus', title: 'Top 20 SKUs', type: 'PARETO', dataKey: 'topItems.topByValue', notes: 'Bars with cumulative value percentage.' },
    { id: 'supplier-leaderboard', title: 'Supplier leaderboard', type: 'TABLE', dataKey: 'supplierBreakdown', notes: 'Supplier totals and average rate.' },
    { id: 'stock-health', title: 'Stock health alerts', type: 'LIST', dataKey: 'stockHealth', notes: 'Negative stock, rates, duplicates, and missing fields.' },
    { id: 'category-warehouse', title: 'Category × Warehouse', type: 'HEATMAP', dataKey: 'categoryWarehouseHeatmap', notes: 'Active quantity by category and warehouse.' },
    { id: 'batch-vintage', title: 'Batch vintage', type: 'DONUT', dataKey: 'batchVintage', notes: 'OP, PI, PERI, and OTHER batch prefixes.' },
    { id: 'data-quality', title: 'Data quality checks', type: 'TABLE', dataKey: 'dataQualityReport.checks', notes: 'Raw-row validation results.' },
    { id: 'item-lookup', title: 'Item lookup', type: 'SEARCH', dataKey: 'existingSearch', notes: 'Retains the existing item search behavior.' }
  ];

  return {
    globalStats, warehouseBreakdown, categoryBreakdown: capped(categoryBreakdown),
    mainGroupBreakdown: capped(mainGroupBreakdown), supplierBreakdown: supplierRows,
    brandBreakdown, topItems, stockHealth, batchVintage, alerts: limitedAlerts,
    dataQualityReport: quality, dashboardConfig,
    categoryWarehouseHeatmap: capped(categoryWarehouseHeatmap),
    categoryDrillDown: name => categoryDrillDownFromNormalized(items, rows, name)
  };
}

function qualityReport(source, rows, items, duplicateCodeMap) {
  const blank = (row, key) => !text(row?.[key]);
  const checks = [];
  const addCheck = (name, count, samples = [], status = count ? 'WARN' : 'PASS', note) => checks.push({ name, status, count, samples: capped(samples), ...(note ? { note } : {}) });
  const named = [
    ['Blank ITEM CODE', 'ITEM CODE'], ['Blank ITEM NAME', 'ITEM NAME'],
    ['Blank RATE', 'RATE'], ['Blank TOTAL STOCK QTY', 'TOTAL STOCK QTY']
  ];
  named.forEach(([label,key]) => { const bad=source.map((r,i)=>({r,i})).filter(({r})=>blank(r,key)); addCheck(label,bad.length,bad.slice(0,5).map(({r,i})=>({row:i+1,value:text(r?.[key])}))); });
  const zeroQtyValue = source.map((r,i)=>({r,i})).filter(({r})=>numeric(r?.['TOTAL STOCK QTY'])===0&&numeric(r?.['TOTAL STOCK VALUE'])!==0);
  const nonzeroQtyZeroValue = source.map((r,i)=>({r,i})).filter(({r})=>numeric(r?.['TOTAL STOCK QTY'])!==0&&numeric(r?.['TOTAL STOCK VALUE'])===0);
  addCheck('QTY=0 but VALUE≠0',zeroQtyValue.length,zeroQtyValue.slice(0,5).map(({r,i})=>({row:i+1,itemCode:text(r?.['ITEM CODE'])})));
  addCheck('QTY≠0 but VALUE=0',nonzeroQtyZeroValue.length,nonzeroQtyZeroValue.slice(0,5).map(({r,i})=>({row:i+1,itemCode:text(r?.['ITEM CODE'])})));
  const qtyMismatch=rows.map((r,i)=>({r,i})).filter(({r})=>Math.abs(r.activeQty-r.totalQty)>1);
  addCheck('Active WH sum ≠ TOTAL STOCK QTY (tolerance ±1)',qtyMismatch.length,qtyMismatch.slice(0,5).map(({r,i})=>({row:i+1,itemCode:r.itemCode,activeQty:r.activeQty,totalQty:r.totalQty})));
  const pairCounts=new Map();rows.forEach(r=>{const key=`${r.itemCode}\u0000${r.batch}`;pairCounts.set(key,(pairCounts.get(key)||0)+1)});
  const duplicates=[...pairCounts].filter(([,n])=>n>1);
  addCheck('Duplicate (ITEM CODE, BATCH) pairs',duplicates.length,duplicates.slice(0,5).map(([key,count])=>({itemCode:key.split('\u0000')[0],batch:key.split('\u0000')[1],count})));
  const placeholders=rows.map((r,i)=>({r,i})).filter(({r})=>/^PERI~/i.test(r.itemCode));
  addCheck('Placeholder ITEM CODE (PERI~)',placeholders.length,placeholders.slice(0,5).map(({r})=>({itemCode:r.itemCode,batch:r.batch})));
  const oddUnits=source.map((r,i)=>({r,i})).filter(({r})=>text(r?.UNIT)&&!VALID_UNITS.has(text(r.UNIT)));
  addCheck('UNIT outside {Pcs, PCS, Pcs., Each}',oddUnits.length,oddUnits.slice(0,5).map(({r})=>({row:iSafe(r),unit:text(r.UNIT)})));
  const zeroRate=rows.map((r,i)=>({r,i})).filter(({r})=>r.rate===0&&r.totalQty!==0);
  addCheck('RATE=0 with non-zero TOTAL STOCK QTY',zeroRate.length,zeroRate.slice(0,5).map(({r})=>({itemCode:r.itemCode,batch:r.batch,totalQty:r.totalQty})));
  addCheck('Rows ignored due to inactive warehouses only (Chalan/C/D/Main)',0,[],'PASS','Not assessed; inactive-warehouse fields are excluded from this analytics module.');
  const names=new Set(source.map(r=>text(r?.['ITEM NAME'])).filter(Boolean));
  return { rowCount: source.length, distinctSKUs: items.length, distinctNames: names.size, checks };
}
function iSafe(row) { return row && row.UNIT; }
function categoryDrillDownFromNormalized(items, rows, categoryOrMainGroup) {
  const target=text(categoryOrMainGroup);
  const matchedItems=[...items.values()].filter(item=>item.category===target||item.mainGroup===target);
  const matchedCodes=new Set(matchedItems.map(item=>item.itemCode));
  const matchedRows=rows.filter(row=>matchedCodes.has(row.itemCode));
  const value=matchedItems.reduce((sum,item)=>sum+item.activeValue,0);
  const warehouseSplit=Object.fromEntries(ACTIVE_WAREHOUSES.map(w=>[w.property,{qty:0,value:0}]));
  const supplierMap=new Map();
  matchedRows.forEach(row=>{
    ACTIVE_WAREHOUSES.forEach(w=>{warehouseSplit[w.property].qty+=row.wh[w.property];warehouseSplit[w.property].value+=row.wh[w.property]*row.rate});
    if(row.supplier){const agg=supplierMap.get(row.supplier)||{supplier:row.supplier,totalQty:0,totalValue:0};agg.totalQty+=row.activeQty;agg.totalValue+=row.activeValue;supplierMap.set(row.supplier,agg)}
  });
  const suppliers=[...supplierMap.values()].sort((a,b)=>b.totalValue-a.totalValue||b.totalQty-a.totalQty);
  return {
    items: capped(matchedItems.map(item=>({itemCode:item.itemCode,itemName:item.itemName,totalQty:item.activeQty,totalValue:item.activeValue,weightedAvgRate:item.weightedAvgRate,batchCount:item.batchCount})).sort((a,b)=>b.totalValue-a.totalValue||b.totalQty-a.totalQty)),
    warehouseSplit, supplierSplit:capped(suppliers),
    top5SharePercent:safePercent(suppliers.slice(0,5).reduce((sum,row)=>sum+row.totalValue,0),value),
    flags:{negativeStock:matchedItems.filter(item=>item.hasNegativeStock).length,zeroRate:matchedItems.filter(item=>item.hasZeroRate).length}
  };
}

/** Returns a category-or-main-group drill-down using only active warehouses. */
export function categoryDrillDown(raw = [], categoryOrMainGroup = '') {
  const { items, rows } = buildNormalizedInventory(raw);
  return categoryDrillDownFromNormalized(items, rows, categoryOrMainGroup);
}

/** Formats a number with locale grouping and a configurable decimal count. */
export function formatNumber(value, decimals = 2) {
  const number = numeric(value);
  return number.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Formats a monetary amount with a currency prefix and exactly two decimals. */
export function formatMoney(value) { return `Rs. ${formatNumber(value, 2)}`; }

/**
 * Builds row-level data-quality checks while retaining source row positions.
 * This helper is intentionally private to keep analytics functions side-effect free.
 */

// <demo>
// const raw = JSON.parse(localStorage.getItem('inv_scan_products') || '[]');
// console.table(computeInventoryAnalytics(raw).globalStats);
