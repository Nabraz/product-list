/* Inventory & Catalog Alpine component. */
let brandChartInstance = null, typeChartInstance = null, priceRangeChartInstance = null, valueByBrandChartInstance = null;
const ACTIVE_PHYSICAL_WAREHOUSES = [
    { key: 'CITY CENTER WAREHOUSE', label: 'City Center Warehouse' },
    { key: 'Jawalakhel A', label: 'Apple Store JWL' },
    { key: 'Jawalakhel B', label: 'LMC' },
    { key: 'NEW ROAD WAREHOUSE', label: 'New Road Warehouse' }
];

// Install the replacement Mobile view after document markup is available.
// This dynamic load leaves the existing analytics module unchanged.
function loadMobileTabIntegration() {
    import('./mobileTab.js').catch(error => console.error('Unable to load Mobile stock tab:', error));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadMobileTabIntegration, { once: true });
else loadMobileTabIntegration();

function catalogApp() {
    return {
        products: [], secondHandProducts: [], physicalStockProducts: [],
        physicalStockWarehouses: ACTIVE_PHYSICAL_WAREHOUSES.map(warehouse => warehouse.key),
        _physicalStockReportSource: null, _physicalStockReportCache: null,
        inventoryAnalytics: null, analyticsEngine: null,
        loading: false, loadingAccessories: false, loadingSecondHand: false, loadingPhysicalStock: false,
        lastSynced: '', lastSyncedAccessories: '', lastSyncedSecondHand: '', lastSyncedPhysicalStock: '',
        activeTab: 'summary', showAllPrices: false, showNav: true, lastScrollY: 0,
        cacheKeys: {
            accessoriesData: 'catalog_accessories_data', accessoriesTime: 'catalog_accessories_time',
            secondHandData: 'catalog_secondhand_data', secondHandTime: 'catalog_secondhand_time',
            physicalStockData: 'catalog_physicalstock_data', physicalStockTime: 'catalog_physicalstock_time',
            globalTime: 'catalog_global_time'
        },
        searchQuery: '', filterBrand: '', filterType: '',
        shSearchQuery: '', shFilterBy: 'branch', shFilterValue: '', shGroupBy: 'branch',

        parseNum(value) {
            if (value === null || value === undefined || value === '' || value === '-') return 0;
            const parsed = Number.parseFloat(String(value).replace(/,/g, '').replace(/[^0-9.-]/g, ''));
            return Number.isFinite(parsed) ? parsed : 0;
        },
        formatCurrency(value) { return 'Rs. ' + this.parseNum(value).toLocaleString('en-IN', { maximumFractionDigits: 0 }); },
        formatStockValue(value) { return 'Rs. ' + this.parseNum(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
        cleanCurrencyText(value) { return this.formatCurrency(value); },
        isToday(value) { if (!value) return false; const date = new Date(value); return !Number.isNaN(date.getTime()) && date.toDateString() === new Date().toDateString(); },
        isCacheStale() { const time = localStorage.getItem(this.cacheKeys.globalTime); return !time || !this.isToday(time); },

        init() {
            this.loadAllCaches();
            import('./inventoryAnalytics.js').then(module => {
                this.analyticsEngine = module;
                this.refreshInventoryAnalytics();
            }).catch(error => console.error('Unable to load inventory analytics module:', error));
            if (this.isCacheStale() || !this.products.length || !this.secondHandProducts.length) this.fetchAllData();
            if (this.activeTab === 'analytics') setTimeout(() => this.renderCharts(), 150);
        },
        handleScroll() { const y = window.scrollY; this.showNav = !(y > this.lastScrollY && y > 60); this.lastScrollY = y; },
        toggleAllPrices() { this.showAllPrices = !this.showAllPrices; },
        switchTab(tab) { this.activeTab = tab; if (tab === 'analytics') setTimeout(() => this.renderCharts(), 150); },

        loadAllCaches() {
            this.loadAccessoriesFromCache(); this.loadSecondHandFromCache(); this.loadPhysicalStockFromCache();
            this.lastSynced = localStorage.getItem(this.cacheKeys.globalTime) || this.lastSyncedSecondHand || this.lastSyncedAccessories || '';
        },
        loadAccessoriesFromCache() {
            try {
                const data = localStorage.getItem(this.cacheKeys.accessoriesData);
                this.lastSyncedAccessories = localStorage.getItem(this.cacheKeys.accessoriesTime) || '';
                if (data) this.products = (JSON.parse(data) || []).map((p, index) => ({
                    id: p.id ?? index, brand: p.brand || 'Generic', type: p.type || 'General',
                    name: p.name || p.productName || 'Unnamed Item', mrp: this.parseNum(p.mrp), cost: this.parseNum(p.cost)
                }));
            } catch (error) { console.error('Error loading accessories cache:', error); this.products = []; }
        },
        loadSecondHandFromCache() {
            try {
                const data = localStorage.getItem(this.cacheKeys.secondHandData);
                this.lastSyncedSecondHand = localStorage.getItem(this.cacheKeys.secondHandTime) || '';
                if (data) this.secondHandProducts = (JSON.parse(data) || []).map((p, index) => ({
                    id: p.id ?? index, branch: p.branch || 'Main Branch', brand: p.brand || 'iPhone', type: p.type || 'iPhone',
                    acquiredDate: p.acquiredDate || '-', age: p.age ?? '', productName: p.productName || p.name || 'Device',
                    costPrice: this.parseNum(p.costPrice), expectedSalesPrice: this.parseNum(p.expectedSalesPrice),
                    imei: p.imei || '-', color: p.color || '', batteryHealth: this.parseNum(p.batteryHealth), otherInfo: p.otherInfo || ''
                }));
            } catch (error) { console.error('Error loading second-hand cache:', error); this.secondHandProducts = []; }
        },
        loadPhysicalStockFromCache() {
            try {
                const data = localStorage.getItem(this.cacheKeys.physicalStockData) || localStorage.getItem('inv_scan_products') || localStorage.getItem('inv_scan_product') || localStorage.getItem('physicalStock');
                this.lastSyncedPhysicalStock = localStorage.getItem(this.cacheKeys.physicalStockTime) || '';
                if (data) this.physicalStockProducts = JSON.parse(data) || [];
            } catch (error) { console.error('Error loading physical stock cache:', error); this.physicalStockProducts = []; }
        },
        saveAccessoriesToCache(data) {
            const now = new Date().toLocaleString();
            localStorage.setItem(this.cacheKeys.accessoriesData, JSON.stringify(data)); localStorage.setItem(this.cacheKeys.accessoriesTime, now); localStorage.setItem(this.cacheKeys.globalTime, now);
            this.lastSyncedAccessories = now; this.lastSynced = now;
        },
        saveSecondHandToCache(data) {
            const now = new Date().toLocaleString();
            localStorage.setItem(this.cacheKeys.secondHandData, JSON.stringify(data)); localStorage.setItem(this.cacheKeys.secondHandTime, now); localStorage.setItem(this.cacheKeys.globalTime, now);
            this.lastSyncedSecondHand = now; this.lastSynced = now;
        },
        savePhysicalStockToCache(data) {
            const now = new Date().toLocaleString();
            localStorage.setItem(this.cacheKeys.physicalStockData, JSON.stringify(data)); localStorage.setItem(this.cacheKeys.physicalStockTime, now); localStorage.setItem('inv_scan_products', JSON.stringify(data));
            this.lastSyncedPhysicalStock = now; this._physicalStockReportSource = null; this.refreshInventoryAnalytics();
        },

        fetchData() { this.fetchAllData(); },
        fetchAllData() { this.loading = true; this.fetchAccessoriesData(); this.fetchSecondHandData(); this.fetchPhysicalStockData(); },
        loadSheet(id, sheetName, callback, loadingKey) {
            const script = document.createElement('script'), sheet = sheetName ? `&sheet=${encodeURIComponent(sheetName)}` : '';
            script.src = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=responseHandler:${callback}${sheet}&_=${Date.now()}`;
            script.onerror = () => { this[loadingKey] = false; this.checkOverallLoading(); };
            document.body.appendChild(script);
        },
        fetchAccessoriesData() {
            this.loadingAccessories = true;
            window.processSheetData = json => {
                try {
                    const cols = json.table.cols.map(c => (c?.label || '').trim());
                    const indexes = { brand: cols.indexOf('Brands'), type: cols.indexOf('Product Type'), name: cols.indexOf('Product Name'), mrp: cols.indexOf('MRP'), cost: cols.indexOf('Cost') };
                    const value = (row, index) => index >= 0 && row.c[index] ? (row.c[index].f ?? row.c[index].v ?? '') : '';
                    this.products = json.table.rows.map((row, id) => {
                        const name = value(row, indexes.name);
                        return name ? { id, brand: value(row, indexes.brand) || 'Generic', type: value(row, indexes.type) || 'General', name, mrp: this.parseNum(value(row, indexes.mrp)), cost: this.parseNum(value(row, indexes.cost)) } : null;
                    }).filter(Boolean);
                    this.saveAccessoriesToCache(this.products);
                } catch (error) { console.error('Error parsing accessories:', error); }
                finally { this.loadingAccessories = false; this.checkOverallLoading(); }
            };
            this.loadSheet('1pixGGUak_L7P_Xrz-TE52qXNWZkTZ7Xy-84DvUrJt_I', '', 'processSheetData', 'loadingAccessories');
        },
        fetchSecondHandData() {
            this.loadingSecondHand = true;
            window.processSheet2Data = json => {
                try {
                    const cols = json.table.cols.map(c => (c?.label || '').trim()), find = regex => cols.findIndex(c => regex.test(c));
                    const ix = { branch: find(/^branch$/i), brand: find(/^brand(s)?$/i), type: find(/^type$/i), date: find(/acquired/i), name: find(/product name/i), cost: find(/cost price/i), sale: find(/expected sales/i), imei: find(/imei/i), color: find(/^color$/i), battery: find(/battery/i), info: find(/other info/i) };
                    const value = (row, index) => index > -1 && row.c[index] ? (row.c[index].f ?? row.c[index].v ?? '') : '';
                    this.secondHandProducts = json.table.rows.map((row, id) => {
                        const productName = value(row, ix.name); if (!productName) return null;
                        const acquiredDate = value(row, ix.date), date = new Date(acquiredDate);
                        const age = acquiredDate && !Number.isNaN(date.getTime()) ? Math.max(0, Math.floor((Date.now() - date) / 86400000)) : '';
                        return { id, branch: value(row, ix.branch) || 'Main Branch', brand: value(row, ix.brand) || 'iPhone', type: value(row, ix.type) || 'iPhone', acquiredDate: acquiredDate || '-', age, productName, costPrice: this.parseNum(value(row, ix.cost)), expectedSalesPrice: this.parseNum(value(row, ix.sale)), imei: value(row, ix.imei) || '-', color: value(row, ix.color), batteryHealth: this.parseNum(value(row, ix.battery)), otherInfo: value(row, ix.info) };
                    }).filter(Boolean);
                    this.saveSecondHandToCache(this.secondHandProducts);
                } catch (error) { console.error('Error parsing second-hand data:', error); }
                finally { this.loadingSecondHand = false; this.checkOverallLoading(); }
            };
            this.loadSheet('1pixGGUak_L7P_Xrz-TE52qXNWZkTZ7Xy-84DvUrJt_I', 'Sheet2', 'processSheet2Data', 'loadingSecondHand');
        },
        fetchPhysicalStockData() {
            this.loadingPhysicalStock = true;
            window.processPhysicalStockData = json => {
                try {
                    const headers = json.table.cols.map(c => (c?.label || '').trim()), value = (row, index) => index >= 0 && row.c?.[index] ? (row.c[index].v ?? row.c[index].f ?? '') : '';
                    this.physicalStockProducts = json.table.rows.map((row, id) => {
                        if (!row?.c) return null;
                        const product = { id };
                        headers.forEach((header, index) => {
                            if (!header) return;
                            const raw = value(row, index);
                            product[header] = /warehouse|jawalakhel|stock|qty|rate|value|mrp/i.test(header) ? this.parseNum(raw) : String(raw ?? '').trim();
                        });
                        return product['ITEM CODE'] || product['ITEM NAME'] ? product : null;
                    }).filter(Boolean);
                    this.savePhysicalStockToCache(this.physicalStockProducts);
                    if (this.activeTab === 'analytics') setTimeout(() => this.renderCharts(), 100);
                } catch (error) { console.error('Error parsing physical stock:', error); }
                finally { this.loadingPhysicalStock = false; this.checkOverallLoading(); }
            };
            this.loadSheet('1Bbdlx6P8VoxirhhzivUNtvIWWw9ROhJ3', 'physical stock', 'processPhysicalStockData', 'loadingPhysicalStock');
        },
        checkOverallLoading() { if (!this.loadingAccessories && !this.loadingSecondHand && !this.loadingPhysicalStock) this.loading = false; },
        get filteredProducts() {
            const q = this.searchQuery.toLowerCase().trim();
            return this.products.filter(p => (!q || p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || p.type.toLowerCase().includes(q)) && (!this.filterBrand || p.brand.toLowerCase() === this.filterBrand.toLowerCase()) && (!this.filterType || p.type.toLowerCase() === this.filterType.toLowerCase()));
        },
        get uniqueBrands() { return [...new Set(this.products.map(p => p.brand))].filter(Boolean).sort(); },
        get uniqueTypes() { return [...new Set(this.products.map(p => p.type))].filter(Boolean).sort(); },
        setBrandFilter(value) { this.filterBrand = value || ''; }, setTypeFilter(value) { this.filterType = value || ''; },
        clearAllFilters() { this.searchQuery = ''; this.filterBrand = ''; this.filterType = ''; },
        get shFilterOptions() { return [...new Set(this.secondHandProducts.map(p => this.shFilterBy === 'branch' ? p.branch : p.type))].filter(Boolean).sort(); },
        get filteredSecondHand() {
            const q = this.shSearchQuery.toLowerCase().trim();
            return this.secondHandProducts.filter(p => (!q || [p.productName,p.brand,p.type,p.imei,p.color].some(v => String(v).toLowerCase().includes(q))) && (!this.shFilterValue || (this.shFilterBy === 'branch' ? p.branch : p.type) === this.shFilterValue));
        },
        get groupedSecondHand() {
            const groups = new Map();
            this.filteredSecondHand.forEach(item => { const key = this.shGroupBy === 'branch' ? (item.branch || 'Unassigned') : (item.type || 'Uncategorized'); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item); });
            return [...groups].map(([key,items]) => ({key,items})).sort((a,b) => a.key.localeCompare(b.key));
        },
        get groupedSecondHandByBranch() { return this.groupedSecondHand; },
        get totalMrpValue() { return this.products.reduce((sum,p) => sum + (p.mrp || 0), 0); },
        get totalCostValue() { return this.products.reduce((sum,p) => sum + (p.cost || 0), 0); },
        get totalProfit() { return this.totalMrpValue - this.totalCostValue; },
        get avgMarginPercent() { return this.totalMrpValue > 0 ? this.totalProfit / this.totalMrpValue * 100 : 0; },
        get topBrand() { const counts = new Map(); this.products.forEach(p => counts.set(p.brand,(counts.get(p.brand)||0)+1)); const top=[...counts].sort((a,b)=>b[1]-a[1])[0]; return top?{name:top[0],count:top[1]}:null; },
        get highestPricedProduct() { return [...this.products].sort((a,b)=>b.mrp-a.mrp)[0] || null; },
        get brandStats() {
            const map = new Map(); this.products.forEach(p => { const x=map.get(p.brand)||{name:p.brand,count:0,totalCost:0,totalMrp:0}; x.count++;x.totalCost+=p.cost||0;x.totalMrp+=p.mrp||0;map.set(p.brand,x); });
            return [...map.values()].map(x=>({name:x.name,count:x.count,avgCost:x.totalCost/x.count,avgMrp:x.totalMrp/x.count,margin:x.totalCost?((x.totalMrp-x.totalCost)/x.totalCost)*100:0})).sort((a,b)=>b.count-a.count);
        },
        get categoryStats() {
            const map = new Map(); this.products.forEach(p => { const x=map.get(p.type)||{name:p.type,count:0,totalCost:0,totalMrp:0,items:[]}; x.count++;x.totalCost+=p.cost||0;x.totalMrp+=p.mrp||0;x.items.push(p);map.set(p.type,x); });
            return [...map.values()].map(x=>({...x,avgCost:x.totalCost/x.count,avgMrp:x.totalMrp/x.count,margin:x.totalCost?((x.totalMrp-x.totalCost)/x.totalCost)*100:0})).sort((a,b)=>b.count-a.count);
        },
        get physicalStockReport() {
            if (this._physicalStockReportSource === this.physicalStockProducts && this._physicalStockReportCache) return this._physicalStockReportCache;
            const itemMap=new Map(),categoryMap=new Map(),groupMap=new Map(),supplierMap=new Map(),branchCategoryMap=new Map(),branchGroupMap=new Map(),negativeBalances=[];
            const branches=new Map(ACTIVE_PHYSICAL_WAREHOUSES.map(w=>[w.key,{name:w.label,quantity:0,value:0,batchCount:0,itemQty:new Map()}]));
            let totalQuantity=0,totalValue=0,negativeBatchCount=0;
            const add=(map,key,name,code,quantity,value)=>{if(!map.has(key))map.set(key,{name,quantity:0,value:0,batchCount:0,items:new Set()});const x=map.get(key);x.quantity+=quantity;x.value+=value;x.batchCount++;if(code)x.items.add(code);};
            this.physicalStockProducts.forEach(row=>{
                const code=String(row['ITEM CODE']||row.itemCode||'').trim(),name=String(row['ITEM NAME']||row.productName||'Unnamed item').trim();
                const category=String(row.CATEGORY||row.category||'').trim(),mainGroup=String(row['MAIN GROUP']||row.mainGroup||'').trim(),supplier=String(row.SUPPLIER||row.supplier||'').trim(),rate=this.parseNum(row.RATE??row.rate);
                let rowQty=0,rowValue=0,hasNegative=false;
                ACTIVE_PHYSICAL_WAREHOUSES.forEach(w=>{const quantity=this.parseNum(row[w.key]),value=quantity*rate,branch=branches.get(w.key);rowQty+=quantity;rowValue+=value;branch.quantity+=quantity;branch.value+=value;
                    if(quantity!==0){branch.batchCount++;branch.itemQty.set(code,(branch.itemQty.get(code)||0)+quantity);if(category)add(branchCategoryMap,`${w.key}\0${category}`,category,code,quantity,value);if(mainGroup)add(branchGroupMap,`${w.key}\0${mainGroup}`,mainGroup,code,quantity,value);}
                    if(quantity<0){hasNegative=true;negativeBalances.push({branch:w.label,code:code||'—',name,category,batch:String(row.BATCH||row.BATCHID||row.batch||'—'),quantity,value});}
                });
                if(hasNegative)negativeBatchCount++;totalQuantity+=rowQty;totalValue+=rowValue;
                if(category)add(categoryMap,category,category,code,rowQty,rowValue);if(mainGroup)add(groupMap,mainGroup,mainGroup,code,rowQty,rowValue);if(supplier)add(supplierMap,supplier,supplier,code,rowQty,rowValue);
                const key=code||name;if(!itemMap.has(key))itemMap.set(key,{key,code:code||'—',name,category,mainGroup,quantity:0,value:0,batchCount:0});
                const item=itemMap.get(key);item.quantity+=rowQty;item.value+=rowValue;item.batchCount++;
            });
            const finalize=x=>({name:x.name,quantity:x.quantity,value:x.value,batchCount:x.batchCount,productCount:x.items.size});
            const report={totals:{productCount:itemMap.size,batchCount:this.physicalStockProducts.length,totalQuantity,totalValue,negativeBatchCount},
                branches:ACTIVE_PHYSICAL_WAREHOUSES.map(w=>{const b=branches.get(w.key);return{name:b.name,quantity:b.quantity,value:b.value,batchCount:b.batchCount,productCount:[...b.itemQty.values()].filter(q=>q!==0).length};}).sort((a,b)=>b.quantity-a.quantity),
                categories:[...categoryMap.values()].map(finalize).sort((a,b)=>b.quantity-a.quantity),mainGroups:[...groupMap.values()].map(finalize).sort((a,b)=>b.quantity-a.quantity),suppliers:[...supplierMap.values()].map(finalize).sort((a,b)=>b.value-a.value),
                branchCategories:[...branchCategoryMap].map(([key,x])=>({...finalize(x),branch:ACTIVE_PHYSICAL_WAREHOUSES.find(w=>key.startsWith(w.key+'\0'))?.label||''})).sort((a,b)=>a.branch.localeCompare(b.branch)||b.quantity-a.quantity),
                branchGroups:[...branchGroupMap].map(([key,x])=>({...finalize(x),branch:ACTIVE_PHYSICAL_WAREHOUSES.find(w=>key.startsWith(w.key+'\0'))?.label||''})).sort((a,b)=>a.branch.localeCompare(b.branch)||b.quantity-a.quantity),
                negativeBalances:negativeBalances.sort((a,b)=>a.quantity-b.quantity),topProducts:[...itemMap.values()].sort((a,b)=>b.quantity-a.quantity||b.value-a.value).slice(0,20)};
            this._physicalStockReportSource=this.physicalStockProducts;this._physicalStockReportCache=report;return report;
        },
        refreshInventoryAnalytics() { if(!this.analyticsEngine)return;try{this.inventoryAnalytics=this.analyticsEngine.computeInventoryAnalytics(this.physicalStockProducts);this.renderEnhancedDashboard();}catch(error){console.error('Error computing inventory analytics:',error);} },
        escapeDashboard(value) { return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); },
        fmtDashboard(value,decimals=0) { return this.analyticsEngine?this.analyticsEngine.formatNumber(value,decimals):this.parseNum(value).toLocaleString('en-IN',{maximumFractionDigits:decimals}); },
        moneyDashboard(value) { return this.analyticsEngine?this.analyticsEngine.formatMoney(value):this.formatStockValue(value); },
        renderEnhancedDashboard() {
            const a=this.inventoryAnalytics;if(!a)return;const money=v=>this.moneyDashboard(v),num=v=>this.fmtDashboard(v),esc=v=>this.escapeDashboard(v);
            const card=(title,value,color='blue')=>`<div class="bg-white border border-gray-200 rounded-xl p-3 shadow-sm"><p class="text-[9px] uppercase font-semibold text-gray-500">${title}</p><p class="mt-1 text-base font-extrabold text-${color}-700 break-words">${value}</p></div>`;
            const list=(items,render,empty='No data available.')=>items.length?items.map(render).join(''):`<p class="p-3 text-xs text-gray-500">${empty}</p>`;
            const summary=document.querySelector('.summary-layout');
            if(summary){summary.innerHTML=`<div class="space-y-3 min-w-0"><div><h2 class="text-lg font-extrabold text-gray-900">Physical Stock Overview</h2><p class="text-[10px] text-gray-500">Active warehouses only · ${num(a.globalStats.totalBatches)} batch records</p></div><div class="grid grid-cols-2 gap-2">${card('Unique SKUs',num(a.globalStats.totalSKUs))}${card('Net Stock Quantity',`${num(a.globalStats.totalQty)} units`,'emerald')}${card('Inventory Value',money(a.globalStats.totalValue),'orange')}${card('Weighted Avg. Rate',money(a.globalStats.weightedAvgRate),'indigo')}</div><section class="bg-gray-50 rounded-xl p-3"><h3 class="font-bold text-sm mb-2">Stock by Active Warehouse</h3><div class="grid grid-cols-2 gap-2">${a.warehouseBreakdown.map(w=>`<article class="rounded-xl border bg-white p-3"><b class="text-xs">${esc(w.label)}</b><p class="mt-1 text-sm font-bold text-indigo-700">${num(w.totalQty)} units</p><p class="text-[11px] text-gray-600">${money(w.totalValue)}</p><p class="text-[10px] text-gray-500">${num(w.skuCount)} SKUs · ${num(w.percentQty,1)}%</p></article>`).join('')}</div><p class="mt-2 text-[10px] text-gray-500">${num(a.warehouseBreakdown.itemsInMultipleWarehouses)} in multiple warehouses · ${num(a.warehouseBreakdown.itemsInSingleWarehouse)} in one · ${num(a.warehouseBreakdown.itemsInZeroWarehouses)} with zero active stock</p></section><section class="bg-white border rounded-xl overflow-hidden"><h3 class="p-3 font-bold text-sm border-b">Highest Value Items</h3>${list(a.topItems.topByValue.slice(0,10),(item,index)=>`<div class="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2 px-3 py-2 border-b"><span class="text-[10px] text-gray-400">${index+1}</span><div class="min-w-0"><b class="block text-xs break-words">${esc(item.itemName)}</b><span class="text-[10px] font-mono text-gray-500 break-all">${esc(item.itemCode)}</span></div><div class="text-right text-xs"><b>${num(item.totalQty)}</b><span class="block text-[10px] text-emerald-700">${money(item.totalValue)}</span></div></div>` )}</section><section class="bg-white border rounded-xl overflow-hidden"><h3 class="p-3 font-bold text-sm border-b">Stock Health Alerts · ${num(a.alerts.length)}</h3>${list(a.alerts.slice(0,15),alert=>`<article class="p-3 border-b"><div class="flex justify-between gap-2"><b class="text-[10px] ${alert.severity==='HIGH'?'text-red-700':alert.severity==='MEDIUM'?'text-amber-700':'text-gray-600'}">${esc(alert.severity)} · ${esc(alert.type)}</b><span class="font-mono text-[10px]">${esc(alert.itemCode)}</span></div><p class="mt-1 text-xs">${esc(alert.itemName)}</p><p class="text-[10px] text-gray-500">${esc(alert.message)}</p></article>`,'No stock alerts.')}</section><section class="bg-white border rounded-xl overflow-hidden"><h3 class="p-3 font-bold text-sm border-b">Data Quality Checks</h3>${a.dataQualityReport.checks.map(check=>`<div class="flex justify-between gap-2 px-3 py-2 border-b"><span class="text-[10px]">${esc(check.name)}</span><b class="text-[10px] ${check.status==='PASS'?'text-emerald-700':'text-amber-700'}">${esc(check.status)} · ${num(check.count)}</b></div>`).join('')}</section></div>`;}
            const metrics=document.querySelector('.analytics-layout');
            if(metrics){metrics.innerHTML=`<div class="space-y-3 min-w-0"><div><h2 class="text-lg font-extrabold text-gray-900">Inventory Metrics</h2><p class="text-[10px] text-gray-500">Only City Center, Apple Store JWL, LMC, and New Road Warehouse.</p></div><div class="grid grid-cols-2 gap-2">${card('Active SKUs',num(a.globalStats.totalSKUs))}${card('Active Quantity',`${num(a.globalStats.totalQty)} units`,'emerald')}${card('Active Stock Value',money(a.globalStats.totalValue),'orange')}${card('Negative Batch Records',num(this.physicalStockReport.totals.negativeBatchCount),'red')}</div><div class="analytics-charts grid grid-cols-1 gap-3 lg:grid-cols-2"><section class="bg-white p-3 rounded-xl shadow-sm min-w-0"><h3 class="font-bold text-xs mb-2">Quantity by Active Warehouse</h3><canvas id="brandChart"></canvas></section><section class="bg-white p-3 rounded-xl shadow-sm min-w-0"><h3 class="font-bold text-xs mb-2">Value by Active Warehouse</h3><canvas id="valueByBrandChart"></canvas></section><section class="bg-white p-3 rounded-xl shadow-sm min-w-0"><h3 class="font-bold text-xs mb-2">Top Categories by Quantity</h3><canvas id="typeChart"></canvas></section><section class="bg-white p-3 rounded-xl shadow-sm min-w-0"><h3 class="font-bold text-xs mb-2">Top Main Groups by Quantity</h3><canvas id="priceRangeChart"></canvas></section></div><section class="bg-white border rounded-xl overflow-hidden"><h3 class="p-3 font-bold text-sm border-b">Category Breakdown</h3>${list(a.categoryBreakdown.slice(0,10),x=>`<div class="grid grid-cols-[minmax(0,1fr)_auto] gap-2 p-3 border-b"><div><b class="text-xs break-words">${esc(x.category)}</b><p class="text-[10px] text-gray-500">${num(x.skuCount)} SKUs · ${num(x.percentValue,1)}%</p></div><div class="text-right text-xs"><b>${num(x.totalQty)}</b><span class="block text-[10px]">${money(x.totalValue)}</span></div></div>`)}</section><section class="bg-white border rounded-xl overflow-hidden"><h3 class="p-3 font-bold text-sm border-b">Supplier Leaderboard</h3>${list(a.supplierBreakdown.slice(0,10),x=>`<div class="grid grid-cols-[minmax(0,1fr)_auto] gap-2 p-3 border-b"><div><b class="text-xs break-words">${esc(x.supplier)}</b><p class="text-[10px] text-gray-500">${num(x.skuCount)} SKUs</p></div><div class="text-right text-xs"><b>${money(x.totalValue)}</b><span class="block text-[10px]">${num(x.totalQty)} units</span></div></div>`)}</section><section class="bg-white border rounded-xl overflow-hidden"><h3 class="p-3 font-bold text-sm border-b">Batch Vintage</h3><div class="grid grid-cols-2 gap-2 p-3">${['OP','PI','PERI','OTHER'].map(key=>`<article class="rounded-lg bg-gray-50 p-2"><b class="text-xs">${key}</b><p class="text-xs">${num(a.batchVintage[key].qty)} units</p><p class="text-[10px] text-gray-500">${num(a.batchVintage[key].percentQty,1)}% · ${money(a.batchVintage[key].value)}</p></article>`).join('')}</div></section><section class="bg-white border rounded-xl overflow-hidden"><h3 class="p-3 font-bold text-sm border-b">Stock Health</h3><div class="grid grid-cols-2 gap-2 p-3">${[['Negative stock',a.stockHealth.negativeStock.length],['Zero-rate stock',a.stockHealth.zeroRateWithStock.length],['Price anomalies',a.stockHealth.priceAnomalies.length],['Missing supplier',a.stockHealth.missingSupplier.length],['Missing category',a.stockHealth.missingCategory.length],['Duplicate names',a.stockHealth.duplicateNames.length]].map(([label,count])=>`<article class="rounded-lg bg-gray-50 p-2"><span class="text-[10px] text-gray-500">${label}</span><b class="block text-sm">${num(count)}</b></article>`).join('')}</div></section></div>`;setTimeout(()=>this.renderCharts(),50);}
        },
        renderCharts() {
            if(typeof Chart==='undefined'||!this.inventoryAnalytics)return;
            try {
                [brandChartInstance,typeChartInstance,priceRangeChartInstance,valueByBrandChartInstance].forEach(chart=>chart?.destroy());
                const a=this.inventoryAnalytics,palette=['#2563eb','#059669','#f59e0b','#dc2626'];
                const makeChart=(id,labels,data,color)=>{const canvas=document.getElementById(id);return canvas?new Chart(canvas.getContext('2d'),{type:'bar',data:{labels,datasets:[{data,backgroundColor:color}]},options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{beginAtZero:true}}}}):null;};
                brandChartInstance=makeChart('brandChart',a.warehouseBreakdown.map(x=>x.label),a.warehouseBreakdown.map(x=>x.totalQty),palette);
                valueByBrandChartInstance=makeChart('valueByBrandChart',a.warehouseBreakdown.map(x=>x.label),a.warehouseBreakdown.map(x=>x.totalValue),'#ea580c');
                const categories=a.categoryBreakdown.slice(0,8),groups=a.mainGroupBreakdown.slice(0,8);
                typeChartInstance=makeChart('typeChart',categories.map(x=>x.category),categories.map(x=>x.totalQty),palette);
                priceRangeChartInstance=makeChart('priceRangeChart',groups.map(x=>x.mainGroup),groups.map(x=>x.totalQty),'#0d9488');
            } catch(error) { console.error('Error rendering stock charts:',error); }
        }
    };
}
