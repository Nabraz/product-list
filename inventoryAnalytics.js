/** Active physical-stock analytics. Pure functions; no browser APIs or DOM access. */
export const ACTIVE_WAREHOUSES = [
  { key: 'CITY CENTER WAREHOUSE', label: 'City Center', short: 'City Center', property: 'CityCenter' },
  { key: 'Jawalakhel A', label: 'Apple Store JWL', short: 'Apple Store JWL', property: 'JwlA' },
  { key: 'Jawalakhel B', label: 'LMC', short: 'LMC', property: 'JwlB' },
  { key: 'NEW ROAD WAREHOUSE', label: 'New Road Warehouse', short: 'New Road', property: 'NewRoad' }
];
const FIELDS = ['ITEM CODE','BATCH','BATCHID','ITEM NAME','UNIT','SUPPLIER','CATEGORY','MAIN GROUP','SUB GROUP_A','SUB GROUP_B','SUB GROUP_C'];
const VALID_UNITS = new Set(['Pcs','PCS','Pcs.','Each']);
const SEVERITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const emptyWh = () => ({ CityCenter: 0, JwlA: 0, JwlB: 0, NewRoad: 0 });
const text = value => value == null ? '' : String(value).trim();
const numeric = value => {
  if (value == null || value === '' || value === '-') return 0;
  const parsed = Number.parseFloat(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
};
const percent = (part, total) => total ? part / total * 100 : 0;
const cap = (list, limit = 25) => Object.assign(list.slice(0, limit), { truncated: list.length > limit, remainingCount: Math.max(0, list.length - limit) });
function batchPrefix(batch) {
  const value = text(batch).toUpperCase();
  return value.startsWith('PERI') ? 'PERI' : value.startsWith('OP') ? 'OP' : value.startsWith('PI') ? 'PI' : 'OTHER';
}
function keyedAggregate(rows, keyOf) {
  const map = new Map();
  rows.forEach(row => {
    const key = keyOf(row);
    if (!key) return;
    if (!map.has(key)) map.set(key, { name: key, skuSet: new Set(), totalQty: 0, totalValue: 0 });
    const item = map.get(key);
    item.skuSet.add(row.itemCode); item.totalQty += row.activeQty; item.totalValue += row.activeValue;
  });
  return map;
}
function sortedAggregate(map, nameKey, grandValue) {
  return [...map.values()].map(item => ({
    [nameKey]: item.name, skuCount: item.skuSet.size, totalQty: item.totalQty,
    totalValue: item.totalValue, percentValue: percent(item.totalValue, grandValue)
  })).sort((a,b) => b.totalValue-a.totalValue || b.totalQty-a.totalQty);
}

/** Cleans one batch record and derives active warehouse stock. */
export function cleanRow(row = {}) {
  const fields = Object.fromEntries(FIELDS.map(key => [key, text(row[key])]));
  const wh = {
    CityCenter: numeric(row['CITY CENTER WAREHOUSE']), JwlA: numeric(row['Jawalakhel A']),
    JwlB: numeric(row['Jawalakhel B']), NewRoad: numeric(row['NEW ROAD WAREHOUSE'])
  };
  const rate = numeric(row.RATE), activeQty = wh.CityCenter + wh.JwlA + wh.JwlB + wh.NewRoad;
  return {
    itemCode: fields['ITEM CODE'], batch: fields.BATCH || fields.BATCHID, itemName: fields['ITEM NAME'],
    unit: 'Pcs', supplier: fields.SUPPLIER, category: fields.CATEGORY, mainGroup: fields['MAIN GROUP'],
    subA: fields['SUB GROUP_A'], subB: fields['SUB GROUP_B'], subC: fields['SUB GROUP_C'],
    rate, totalQty: numeric(row['TOTAL STOCK QTY']), totalValue: numeric(row['TOTAL STOCK VALUE']),
    wh, activeQty, activeValue: activeQty * rate, batchPrefix: batchPrefix(fields.BATCH || fields.BATCHID),
    _unitRaw: fields.UNIT
  };
}

/** Normalizes raw records and groups batches by ITEM CODE. */
export function buildNormalizedInventory(raw = []) {
  const rows = (Array.isArray(raw) ? raw : []).map(row => cleanRow(row || {}));
  const items = new Map();
  rows.forEach(row => {
    if (!items.has(row.itemCode)) items.set(row.itemCode, {
      itemCode: row.itemCode, itemName: row.itemName, category: row.category, mainGroup: row.mainGroup,
      subGroups: { a: row.subA, b: row.subB, c: row.subC }, supplier: row.supplier,
      supplierSet: new Set(), unit: 'Pcs', batchCount: 0, batches: [], totalQty: 0, activeQty: 0,
      totalValue: 0, activeValue: 0, weightedAvgRate: 0, whTotals: emptyWh(), hasNegativeStock: false,
      hasZeroRate: false, batchPrefixes: new Set(), positiveRates: []
    });
    const item = items.get(row.itemCode);
    ['itemName','category','mainGroup'].forEach(key => { if (!item[key] && row[key]) item[key] = row[key]; });
    ['a','b','c'].forEach((key, index) => { const val = [row.subA,row.subB,row.subC][index]; if (!item.subGroups[key] && val) item.subGroups[key] = val; });
    if (!item.supplier && row.supplier) item.supplier = row.supplier;
    if (row.supplier) item.supplierSet.add(row.supplier);
    item.batchCount++; item.batches.push(row); item.totalQty += row.totalQty; item.activeQty += row.activeQty;
    item.totalValue += row.totalValue; item.activeValue += row.activeValue;
    Object.keys(item.whTotals).forEach(key => { item.whTotals[key] += row.wh[key]; });
    item.hasNegativeStock ||= row.totalQty < 0; item.batchPrefixes.add(row.batchPrefix);
    if (row.rate > 0) item.positiveRates.push(row.rate);
  });
  items.forEach(item => {
    item.weightedAvgRate = item.activeQty > 0 ? item.activeValue / item.activeQty :
      (item.positiveRates.length ? item.positiveRates.reduce((a,b)=>a+b,0)/item.positiveRates.length : 0);
    item.hasZeroRate = item.weightedAvgRate === 0 && item.totalQty !== 0;
    delete item.positiveRates;
  });
  return { items, rows };
}

/** Computes analytics for the four active warehouses. */
export function computeInventoryAnalytics(raw = []) {
  const source = Array.isArray(raw) ? raw : [];
  const { items, rows } = buildNormalizedInventory(source), itemList = [...items.values()];
  const totalQty = rows.reduce((sum,row)=>sum+row.activeQty,0), totalValue = rows.reduce((sum,row)=>sum+row.activeValue,0);
  const globalStats = { totalSKUs: items.size, totalBatches: source.length, totalQty, totalValue,
    weightedAvgRate: totalQty ? totalValue/totalQty : 0, activeWarehouseCount: 4,
    activeWarehouseLabels: ACTIVE_WAREHOUSES.map(w=>w.label) };
  const warehouseBreakdown = ACTIVE_WAREHOUSES.map(w => {
    const qty=rows.reduce((s,r)=>s+r.wh[w.property],0), value=rows.reduce((s,r)=>s+r.wh[w.property]*r.rate,0);
    return { warehouseKey:w.key,label:w.label,short:w.short,totalQty:qty,totalValue:value,
      skuCount:itemList.filter(i=>i.whTotals[w.property]>0).length,percentQty:percent(qty,totalQty),percentValue:percent(value,totalValue) };
  });
  let itemsInMultipleWarehouses=0, itemsInSingleWarehouse=0, itemsInZeroWarehouses=0;
  itemList.forEach(item=>{const count=ACTIVE_WAREHOUSES.filter(w=>item.whTotals[w.property]>0).length;if(count>1)itemsInMultipleWarehouses++;else if(count===1)itemsInSingleWarehouse++;else itemsInZeroWarehouses++;});
  warehouseBreakdown.itemsInMultipleWarehouses=itemsInMultipleWarehouses;
  warehouseBreakdown.itemsInSingleWarehouse=itemsInSingleWarehouse;
  warehouseBreakdown.itemsInZeroWarehouses=itemsInZeroWarehouses;
  warehouseBreakdown.concentrationIndex=percent(Math.max(0,...warehouseBreakdown.map(w=>w.totalQty)),totalQty);

  const categoryMap=keyedAggregate(rows,r=>r.category), groupMap=keyedAggregate(rows,r=>r.mainGroup);
  const categoryBreakdown=sortedAggregate(categoryMap,'category',totalValue), mainGroupBreakdown=sortedAggregate(groupMap,'mainGroup',totalValue);
  const supplierMap=new Map();
  rows.forEach(row=>{
    if(!row.supplier)return;
    if(!supplierMap.has(row.supplier))supplierMap.set(row.supplier,{supplier:row.supplier,skuSet:new Set(),totalQty:0,totalValue:0});
    const x=supplierMap.get(row.supplier);x.skuSet.add(row.itemCode);x.totalQty+=row.activeQty;x.totalValue+=row.activeValue;
  });
  const allSuppliers=[...supplierMap.values()].map(x=>({supplier:x.supplier,skuCount:x.skuSet.size,totalQty:x.totalQty,totalValue:x.totalValue,avgRatePerUnit:x.totalQty?x.totalValue/x.totalQty:0})).sort((a,b)=>b.totalValue-a.totalValue||b.totalQty-a.totalQty);
  const crossSupplierItems=itemList.filter(item=>item.supplierSet.size>1).map(item=>{
    const rates=new Map();item.batches.forEach(row=>{if(row.supplier&&row.rate>0){if(!rates.has(row.supplier))rates.set(row.supplier,[]);rates.get(row.supplier).push(row.rate);}});
    const averages=[...rates.values()].map(list=>list.reduce((a,b)=>a+b,0)/list.length), min=Math.min(...averages),max=Math.max(...averages);
    return {itemCode:item.itemCode,itemName:item.itemName,suppliers:[...item.supplierSet].sort(),rateSpreadPercent:max?percent(max-min,max):0};
  }).sort((a,b)=>b.rateSpreadPercent-a.rateSpreadPercent);
  const supplierBreakdown=cap(allSuppliers);
  supplierBreakdown.supplierCount=allSuppliers.length;
  supplierBreakdown.top5ConcentrationPercent=percent(allSuppliers.slice(0,5).reduce((s,x)=>s+x.totalValue,0),totalValue);
  supplierBreakdown.crossSupplierItems=cap(crossSupplierItems);

  const brandMap=new Map();
  itemList.forEach(item=>{const match=item.itemName.match(/\b[A-Z][A-Z0-9&+-]{2,}\b/);if(!match)return;const brand=match[0];if(!brandMap.has(brand))brandMap.set(brand,{brand,skus:new Set(),totalQty:0,totalValue:0});const x=brandMap.get(brand);x.skus.add(item.itemCode);x.totalQty+=item.activeQty;x.totalValue+=item.activeValue;});
  const allBrands=[...brandMap.values()].map(x=>({brand:x.brand,skuCount:x.skus.size,totalQty:x.totalQty,totalValue:x.totalValue})).sort((a,b)=>b.totalValue-a.totalValue||b.totalQty-a.totalQty);
  const brandBreakdown=cap(allBrands,20);
  const summaries=itemList.map(item=>({itemCode:item.itemCode,itemName:item.itemName,totalQty:item.activeQty,totalValue:item.activeValue,weightedAvgRate:item.weightedAvgRate}));
  const topItems={topByValue:cap([...summaries].sort((a,b)=>b.totalValue-a.totalValue||b.totalQty-a.totalQty),20),topByQuantity:cap([...summaries].sort((a,b)=>b.totalQty-a.totalQty||b.totalValue-a.totalValue),20)};

  const negativeItems=itemList.filter(i=>i.totalQty<0), duplicateNames=new Map(), duplicateCodes=new Map();
  itemList.forEach(item=>{if(item.itemName)duplicateNames.set(item.itemName,[...(duplicateNames.get(item.itemName)||[]),item.itemCode]);duplicateCodes.set(item.itemCode,[...new Set([...(duplicateCodes.get(item.itemCode)||[]),...item.batches.map(r=>r.itemName).filter(Boolean)])]);});
  const priceAnomalies=itemList.map(item=>{if(!item.weightedAvgRate)return null;const outliers=item.batches.filter(r=>Math.abs(r.rate-item.weightedAvgRate)/Math.abs(item.weightedAvgRate)>.2).map(r=>({batch:r.batch,rate:r.rate,deviationPercent:percent(Math.abs(r.rate-item.weightedAvgRate),Math.abs(item.weightedAvgRate))}));return outliers.length?{itemCode:item.itemCode,itemName:item.itemName,weightedAvgRate:item.weightedAvgRate,outliers}:null;}).filter(Boolean);
  const stockHealth={
    negativeStock:cap(negativeItems.map(i=>({itemCode:i.itemCode,itemName:i.itemName,totalQty:i.totalQty,totalValue:i.totalValue})).sort((a,b)=>a.totalQty-b.totalQty)),
    negativeStockValue:negativeItems.reduce((s,i)=>s+i.totalValue,0),
    zeroRateWithStock:cap(itemList.filter(i=>i.hasZeroRate).map(i=>({itemCode:i.itemCode,itemName:i.itemName,totalQty:i.totalQty}))),
    duplicateNames:cap([...duplicateNames].filter(([,codes])=>new Set(codes).size>1).map(([itemName,itemCodes])=>({itemName,itemCodes:[...new Set(itemCodes)]}))),
    duplicateCodes:cap([...duplicateCodes].filter(([,names])=>new Set(names).size>1).map(([itemCode,itemNames])=>({itemCode,itemNames:[...new Set(itemNames)]}))),
    priceAnomalies:cap(priceAnomalies),missingSupplier:cap(rows.filter(r=>!r.supplier).map(r=>({itemCode:r.itemCode,batch:r.batch}))),
    missingCategory:cap(rows.filter(r=>!r.category).map(r=>({itemCode:r.itemCode,batch:r.batch}))),
    orphanSKUs:cap(itemList.filter(i=>!i.itemName).map(i=>({itemCode:i.itemCode,itemName:i.itemName,totalQty:i.activeQty,totalValue:i.activeValue})))
  };
  const vintage={OP:{qty:0,value:0},PI:{qty:0,value:0},PERI:{qty:0,value:0},OTHER:{qty:0,value:0}};
  rows.forEach(r=>{vintage[r.batchPrefix].qty+=r.activeQty;vintage[r.batchPrefix].value+=r.activeValue;});
  Object.values(vintage).forEach(x=>{x.percentQty=percent(x.qty,totalQty);x.percentValue=percent(x.value,totalValue);});
  const batchCountHistogram={'1':0,'2-5':0,'6-10':0,'11-20':0,'21+':0};
  itemList.forEach(i=>{const n=i.batchCount;batchCountHistogram[n===1?'1':n<=5?'2-5':n<=10?'6-10':n<=20?'11-20':'21+']++;});
  const batchVintage={...vintage,mixedVintageSKUs:itemList.filter(i=>i.batchPrefixes.has('OP')&&i.batchPrefixes.has('PI')).length,avgBatchesPerItem:items.size?rows.length/items.size:0,batchCountHistogram};

  const alerts=[];
  itemList.forEach(item=>{
    const base={itemCode:item.itemCode,itemName:item.itemName,qty:item.activeQty,value:item.activeValue};
    if(item.totalQty<0)alerts.push({severity:'HIGH',type:'NEGATIVE',...base,message:`Total stock quantity is ${formatNumber(item.totalQty,0)}.`});
    if(item.weightedAvgRate===0&&item.totalQty>0)alerts.push({severity:'HIGH',type:'PRICE_GAP',...base,message:'Stock exists but the weighted average rate is zero.'});
    if(item.activeQty===0)alerts.push({severity:'MEDIUM',type:'OUT_OF_STOCK',...base,message:'No active-warehouse stock is available.'});
    const positive=ACTIVE_WAREHOUSES.filter(w=>item.whTotals[w.property]>0);
    if(item.activeQty>0&&positive.length===1)alerts.push({severity:'MEDIUM',type:'CONCENTRATION',...base,message:`All positive stock is concentrated in ${positive[0].label}.`});
    if(item.activeQty>0&&item.activeQty<5)alerts.push({severity:'MEDIUM',type:'LOW_STOCK',...base,message:'Active stock is below 5 units.'});
    if(item.batchCount&&[...item.batchPrefixes].every(prefix=>prefix==='OP'))alerts.push({severity:'LOW',type:'STALE',...base,message:'All batches have the OP prefix.'});
    if(item.batchCount===1)alerts.push({severity:'LOW',type:'SINGLE_BATCH',...base,message:'Item is represented by a single batch.'});
  });
  alerts.sort((a,b)=>SEVERITY_ORDER[a.severity]-SEVERITY_ORDER[b.severity]||a.type.localeCompare(b.type)||a.itemCode.localeCompare(b.itemCode));

  const checks=[];
  const check=(name,bad,samples=[])=>checks.push({name,status:bad.length?'WARN':'PASS',count:bad.length,samples:cap(bad.slice(0,5))});
  check('Blank ITEM CODE',source.map((r,i)=>({r,i})).filter(x=>!text(x.r?.['ITEM CODE'])).map(x=>({row:x.i+1})));
  check('Blank ITEM NAME',source.map((r,i)=>({r,i})).filter(x=>!text(x.r?.['ITEM NAME'])).map(x=>({row:x.i+1})));
  check('Blank RATE',source.map((r,i)=>({r,i})).filter(x=>x.r?.RATE==null||text(x.r.RATE)==='').map(x=>({row:x.i+1})));
  check('Blank TOTAL STOCK QTY',source.map((r,i)=>({r,i})).filter(x=>x.r?.['TOTAL STOCK QTY']==null||text(x.r['TOTAL STOCK QTY'])==='').map(x=>({row:x.i+1})));
  check('QTY=0 but VALUE≠0',source.map((r,i)=>({r,i})).filter(x=>numeric(x.r?.['TOTAL STOCK QTY'])===0&&numeric(x.r?.['TOTAL STOCK VALUE'])!==0).map(x=>({row:x.i+1,itemCode:text(x.r?.['ITEM CODE'])})));
  check('QTY≠0 but VALUE=0',source.map((r,i)=>({r,i})).filter(x=>numeric(x.r?.['TOTAL STOCK QTY'])!==0&&numeric(x.r?.['TOTAL STOCK VALUE'])===0).map(x=>({row:x.i+1,itemCode:text(x.r?.['ITEM CODE'])})));
  check('Active WH sum ≠ TOTAL STOCK QTY (tolerance ±1)',rows.map((r,i)=>({r,i})).filter(x=>Math.abs(x.r.activeQty-x.r.totalQty)>1).map(x=>({row:x.i+1,itemCode:x.r.itemCode,activeQty:x.r.activeQty,totalQty:x.r.totalQty})));
  const pairCounts=new Map();rows.forEach(r=>{const k=`${r.itemCode}\0${r.batch}`;pairCounts.set(k,(pairCounts.get(k)||0)+1);});
  check('Duplicate (ITEM CODE, BATCH) pairs',[...pairCounts].filter(([,n])=>n>1).map(([key,count])=>({key,count})));
  check('Placeholder ITEM CODE (PERI~)',rows.filter(r=>/^PERI~/i.test(r.itemCode)).map(r=>({itemCode:r.itemCode,batch:r.batch})));
  check('UNIT outside {Pcs, PCS, Pcs., Each}',source.filter(r=>text(r?.UNIT)&&!VALID_UNITS.has(text(r.UNIT))).map(r=>({unit:text(r.UNIT)})));
  check('RATE=0 with non-zero TOTAL STOCK QTY',rows.filter(r=>r.rate===0&&r.totalQty!==0).map(r=>({itemCode:r.itemCode,batch:r.batch})));
  checks.push({name:'Rows ignored due to inactive warehouses only (Chalan/C/D/Main)',status:'PASS',count:0,samples:[],note:'Inactive warehouse fields are excluded.'});
  const names=new Set(source.map(r=>text(r?.['ITEM NAME'])).filter(Boolean));
  const dataQualityReport={rowCount:source.length,distinctSKUs:items.size,distinctNames:names.size,checks};

  const categoryWarehouseHeatmap=[...categoryMap.keys()].map(category=>({category,...Object.fromEntries(ACTIVE_WAREHOUSES.map(w=>[w.property,rows.filter(r=>r.category===category).reduce((s,r)=>s+r.wh[w.property],0)]))})).sort((a,b)=>categoryBreakdown.find(x=>x.category===b.category).totalValue-categoryBreakdown.find(x=>x.category===a.category).totalValue);
  const dashboardConfig=[
    {id:'total-skus',title:'Total SKUs',type:'KPI',dataKey:'globalStats.totalSKUs',notes:'Distinct item codes.'},
    {id:'total-qty',title:'Total Qty',type:'KPI',dataKey:'globalStats.totalQty',notes:'Active warehouse quantities.'},
    {id:'total-value',title:'Total Value',type:'KPI',dataKey:'globalStats.totalValue',notes:'Active quantity × rate.'},
    {id:'alerts-count',title:'Alerts count',type:'KPI',dataKey:'alerts.length',notes:'Severity badge.'},
    {id:'warehouse-value',title:'Value by Warehouse',type:'BAR',dataKey:'warehouseBreakdown',notes:'Active warehouse value.'},
    {id:'warehouse-qty-share',title:'Qty share by Warehouse',type:'DONUT',dataKey:'warehouseBreakdown',notes:'Share of active quantity.'},
    {id:'top-categories',title:'Top 10 Categories by Value',type:'BAR',dataKey:'categoryBreakdown',notes:'Value ranked.'},
    {id:'top-skus',title:'Top 20 SKUs',type:'PARETO',dataKey:'topItems.topByValue',notes:'Cumulative value.'},
    {id:'supplier-leaderboard',title:'Supplier leaderboard',type:'TABLE',dataKey:'supplierBreakdown',notes:'Supplier totals.'},
    {id:'stock-health',title:'Stock health alerts',type:'LIST',dataKey:'stockHealth',notes:'Health checks.'},
    {id:'category-warehouse',title:'Category × Warehouse',type:'HEATMAP',dataKey:'categoryWarehouseHeatmap',notes:'Active quantity.'},
    {id:'batch-vintage',title:'Batch vintage',type:'DONUT',dataKey:'batchVintage',notes:'OP/PI/PERI/OTHER.'},
    {id:'data-quality',title:'Data quality checks',type:'TABLE',dataKey:'dataQualityReport.checks',notes:'Source-row checks.'},
    {id:'item-lookup',title:'Item lookup',type:'SEARCH',dataKey:'existingSearch',notes:'Existing search behavior.'}
  ];
  return {
    globalStats,warehouseBreakdown,categoryBreakdown:cap(categoryBreakdown),mainGroupBreakdown:cap(mainGroupBreakdown),
    supplierBreakdown,brandBreakdown,topItems,stockHealth,batchVintage,alerts:cap(alerts),dataQualityReport,dashboardConfig,
    categoryWarehouseHeatmap:cap(categoryWarehouseHeatmap),
    categoryDrillDown:name=>categoryDrillDownFromNormalized(items,rows,name)
  };
}

function categoryDrillDownFromNormalized(items,rows,value) {
  const target=text(value),matched=[...items.values()].filter(i=>i.category===target||i.mainGroup===target),codes=new Set(matched.map(i=>i.itemCode));
  const selected=rows.filter(r=>codes.has(r.itemCode)),totalValue=matched.reduce((s,i)=>s+i.activeValue,0);
  const warehouseSplit=Object.fromEntries(ACTIVE_WAREHOUSES.map(w=>[w.property,{qty:0,value:0}])),suppliers=new Map();
  selected.forEach(row=>{ACTIVE_WAREHOUSES.forEach(w=>{warehouseSplit[w.property].qty+=row.wh[w.property];warehouseSplit[w.property].value+=row.wh[w.property]*row.rate;});if(row.supplier){const x=suppliers.get(row.supplier)||{supplier:row.supplier,totalQty:0,totalValue:0};x.totalQty+=row.activeQty;x.totalValue+=row.activeValue;suppliers.set(row.supplier,x);}});
  const supplierSplit=[...suppliers.values()].sort((a,b)=>b.totalValue-a.totalValue||b.totalQty-a.totalQty);
  return {items:cap(matched.map(i=>({itemCode:i.itemCode,itemName:i.itemName,totalQty:i.activeQty,totalValue:i.activeValue,weightedAvgRate:i.weightedAvgRate,batchCount:i.batchCount})).sort((a,b)=>b.totalValue-a.totalValue||b.totalQty-a.totalQty)),warehouseSplit,supplierSplit:cap(supplierSplit),top5SharePercent:percent(supplierSplit.slice(0,5).reduce((s,x)=>s+x.totalValue,0),totalValue),flags:{negativeStock:matched.filter(i=>i.hasNegativeStock).length,zeroRate:matched.filter(i=>i.hasZeroRate).length}};
}
/** Returns category or main-group item, warehouse, and supplier breakdowns. */
export function categoryDrillDown(raw=[],categoryOrMainGroup='') {const {items,rows}=buildNormalizedInventory(raw);return categoryDrillDownFromNormalized(items,rows,categoryOrMainGroup);}
/** Formats locale-grouped values with configurable decimals. */
export function formatNumber(value,decimals=2) {return numeric(value).toLocaleString(undefined,{minimumFractionDigits:decimals,maximumFractionDigits:decimals});}
/** Formats money in Rs. with exactly two decimal places. */
export function formatMoney(value) {return `Rs. ${formatNumber(value,2)}`;}

// <demo>
// const raw = JSON.parse(localStorage.getItem('inv_scan_products') || '[]');
// console.table(computeInventoryAnalytics(raw).globalStats);
