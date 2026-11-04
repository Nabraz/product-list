/** Inventory and catalog Alpine component. Physical stock metrics use the four active warehouse columns only. */
let brandChartInstance = null;
let typeChartInstance = null;
let priceRangeChartInstance = null;
let valueByBrandChartInstance = null;

const ACTIVE_PHYSICAL_WAREHOUSES = [
    { key: 'CITY CENTER WAREHOUSE', label: 'City Center Warehouse' },
    { key: 'Jawalakhel A', label: 'Apple Store JWL' },
    { key: 'Jawalakhel B', label: 'LMC' },
    { key: 'NEW ROAD WAREHOUSE', label: 'New Road Warehouse' }
];

function catalogApp() {
    return {
        products: [], secondHandProducts: [], physicalStockProducts: [],
        physicalStockWarehouses: ACTIVE_PHYSICAL_WAREHOUSES.map(warehouse => warehouse.key),
        _physicalStockReportSource: null, _physicalStockReportCache: null,
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
        isToday(value) {
            if (!value) return false;
            const date = new Date(value), today = new Date();
            return !Number.isNaN(date.getTime()) && date.toDateString() === today.toDateString();
        },
        isCacheStale() { const time = localStorage.getItem(this.cacheKeys.globalTime); return !time || !this.isToday(time); },
        init() {
            this.loadAllCaches();
            if (this.isCacheStale() || !this.products.length || !this.secondHandProducts.length) this.fetchAllData();
            if (this.activeTab === 'analytics') setTimeout(() => this.renderCharts(), 150);
        },
        handleScroll() {
            const y = window.scrollY;
            this.showNav = !(y > this.lastScrollY && y > 60);
            this.lastScrollY = y;
        },
        toggleAllPrices() { this.showAllPrices = !this.showAllPrices; },
        switchTab(tab) {
            this.activeTab = tab;
            if (tab === 'analytics') setTimeout(() => this.renderCharts(), 150);
        },
        loadAllCaches() {
            this.loadAccessoriesFromCache(); this.loadSecondHandFromCache(); this.loadPhysicalStockFromCache();
            this.lastSynced = localStorage.getItem(this.cacheKeys.globalTime) || this.lastSyncedSecondHand || this.lastSyncedAccessories || '';
        },
        loadAccessoriesFromCache() {
            try {
                const data = localStorage.getItem(this.cacheKeys.accessoriesData);
                this.lastSyncedAccessories = localStorage.getItem(this.cacheKeys.accessoriesTime) || '';
                if (data) this.products = (JSON.parse(data) || []).map((p, i) => ({
                    id: p.id ?? i, brand: p.brand || 'Generic', type: p.type || 'General',
                    name: p.name || p.productName || 'Unnamed Item', mrp: this.parseNum(p.mrp), cost: this.parseNum(p.cost)
                }));
            } catch (error) { console.error('Error loading accessories cache:', error); this.products = []; }
        },
        loadSecondHandFromCache() {
            try {
                const data = localStorage.getItem(this.cacheKeys.secondHandData);
                this.lastSyncedSecondHand = localStorage.getItem(this.cacheKeys.secondHandTime) || '';
                if (data) this.secondHandProducts = (JSON.parse(data) || []).map((p, i) => ({
                    id: p.id ?? i, branch: p.branch || 'Main Branch', brand: p.brand || 'iPhone', type: p.type || 'iPhone',
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
            localStorage.setItem(this.cacheKeys.accessoriesData, JSON.stringify(data));
            localStorage.setItem(this.cacheKeys.accessoriesTime, now); localStorage.setItem(this.cacheKeys.globalTime, now);
            this.lastSyncedAccessories = now; this.lastSynced = now;
        },
        saveSecondHandToCache(data) {
            const now = new Date().toLocaleString();
            localStorage.setItem(this.cacheKeys.secondHandData, JSON.stringify(data));
            localStorage.setItem(this.cacheKeys.secondHandTime, now); localStorage.setItem(this.cacheKeys.globalTime, now);
            this.lastSyncedSecondHand = now; this.lastSynced = now;
        },
        savePhysicalStockToCache(data) {
            const now = new Date().toLocaleString();
            localStorage.setItem(this.cacheKeys.physicalStockData, JSON.stringify(data));
            localStorage.setItem(this.cacheKeys.physicalStockTime, now); localStorage.setItem('inv_scan_products', JSON.stringify(data));
            this.lastSyncedPhysicalStock = now; this._physicalStockReportSource = null;
        },
        fetchData() { this.fetchAllData(); },
        fetchAllData() {
            this.loading = true; this.fetchAccessoriesData(); this.fetchSecondHandData(); this.fetchPhysicalStockData();
        },
        fetchAccessoriesData() {
            this.loadingAccessories = true;
            window.processSheetData = json => {
                try {
                    const cols = json.table.cols.map(c => (c?.label || '').trim());
                    const idx = Object.fromEntries(['Brands', 'Product Type', 'Product Name', 'MRP', 'Cost'].map(name => [name, cols.indexOf(name)]));
                    const value = (row, i) => i >= 0 && row.c[i] ? (row.c[i].f ?? row.c[i].v ?? '') : '';
                    this.products = json.table.rows.map((row, id) => {
                        const name = value(row, idx['Product Name']); if (!name) return null;
                        return { id, brand: value(row, idx.Brands) || 'Generic', type: value(row, idx['Product Type']) || 'General', name, mrp: this.parseNum(value(row, idx.MRP)), cost: this.parseNum(value(row, idx.Cost)) };
                    }).filter(Boolean);
                    this.saveAccessoriesToCache(this.products);
                } catch (error) { console.error('Error parsing accessories data:', error); }
                finally { this.loadingAccessories = false; this.checkOverallLoading(); }
            };
            this.loadSheet('1pixGGUak_L7P_Xrz-TE52qXNWZkTZ7Xy-84DvUrJt_I', '', 'processSheetData', 'loadingAccessories');
        },
        fetchSecondHandData() {
            this.loadingSecondHand = true;
            window.processSheet2Data = json => {
                try {
                    const cols = json.table.cols.map(c => (c?.label || '').trim());
                    const find = regex => cols.findIndex(col => regex.test(col));
                    const ix = { branch: find(/^branch$/i), brand: find(/^brand(s)?$/i), type: find(/^type$/i), date: find(/acquired/i), name: find(/product name/i), cost: find(/cost price/i), sale: find(/expected sales/i), imei: find(/imei/i), color: find(/^color$/i), battery: find(/battery/i), info: find(/other info/i) };
                    const value = (row, i) => i > -1 && row.c[i] ? (row.c[i].f ?? row.c[i].v ?? '') : '';
                    this.secondHandProducts = json.table.rows.map((row, id) => {
                        const productName = value(row, ix.name); if (!productName) return null;
                        const acquiredDate = value(row, ix.date);
                        const date = new Date(acquiredDate);
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
                    const headers = json.table.cols.map(c => (c?.label || '').trim());
                    const value = (row, i) => i >= 0 && row.c?.[i] ? (row.c[i].v ?? row.c[i].f ?? '') : '';
                    this.physicalStockProducts = json.table.rows.map((row, id) => {
                        if (!row?.c) return null;
                        const out = { id };
                        headers.forEach((header, i) => {
                            if (!header) return;
                            const raw = value(row, i);
                            out[header] = /warehouse|jawalakhel|stock|qty|rate|value|mrp/i.test(header) ? this.parseNum(raw) : String(raw ?? '').trim();
                        });
                        return out['ITEM CODE'] || out['ITEM NAME'] ? out : null;
                    }).filter(Boolean);
                    this.savePhysicalStockToCache(this.physicalStockProducts);
                    if (this.activeTab === 'analytics') setTimeout(() => this.renderCharts(), 100);
                } catch (error) { console.error('Error parsing physical stock:', error); }
                finally { this.loadingPhysicalStock = false; this.checkOverallLoading(); }
            };
            this.loadSheet('1Bbdlx6P8VoxirhhzivUNtvIWWw9ROhJ3', 'physical stock', 'processPhysicalStockData', 'loadingPhysicalStock');
        },
        loadSheet(sheetId, sheetName, callback, loadingKey) {
            const script = document.createElement('script');
            const sheet = sheetName ? `&sheet=${encodeURIComponent(sheetName)}` : '';
            script.src = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=responseHandler:${callback}${sheet}&_=${Date.now()}`;
            script.onerror = () => { this[loadingKey] = false; this.checkOverallLoading(); };
            document.body.appendChild(script);
        },
        checkOverallLoading() { if (!this.loadingAccessories && !this.loadingSecondHand && !this.loadingPhysicalStock) this.loading = false; },

        get filteredProducts() {
            const q = this.searchQuery.toLowerCase().trim();
            return this.products.filter(p => (!q || p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || p.type.toLowerCase().includes(q)) && (!this.filterBrand || p.brand.toLowerCase() === this.filterBrand.toLowerCase()) && (!this.filterType || p.type.toLowerCase() === this.filterType.toLowerCase()));
        },
        get uniqueBrands() { return [...new Set(this.products.map(p => p.brand))].filter(Boolean).sort(); },
        get uniqueTypes() { return [...new Set(this.products.map(p => p.type))].filter(Boolean).sort(); },
        setBrandFilter(value) { this.filterBrand = value || ''; },
        setTypeFilter(value) { this.filterType = value || ''; },
        clearAllFilters() { this.searchQuery = ''; this.filterBrand = ''; this.filterType = ''; },
        get shFilterOptions() { return [...new Set(this.secondHandProducts.map(p => this.shFilterBy === 'branch' ? p.branch : p.type))].filter(Boolean).sort(); },
        get filteredSecondHand() {
            const q = this.shSearchQuery.toLowerCase().trim();
            return this.secondHandProducts.filter(p => (!q || [p.productName,p.brand,p.type,p.imei,p.color].some(v => String(v).toLowerCase().includes(q))) && (!this.shFilterValue || (this.shFilterBy === 'branch' ? p.branch : p.type) === this.shFilterValue));
        },
        get groupedSecondHand() {
            const groups = new Map();
            this.filteredSecondHand.forEach(item => { const key = this.shGroupBy === 'branch' ? (item.branch || 'Unassigned') : (item.type || 'Uncategorized'); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item); });
            return [...groups].map(([key,items]) => ({key,items})).sort((a,b)=>a.key.localeCompare(b.key));
        },
        get groupedSecondHandByBranch() { return this.groupedSecondHand; },
        get brandStats() { return []; },
        get categoryStats() { return []; },

        /** Aggregate physical inventory. Inactive warehouse columns are never read. */
        get physicalStockReport() {
            if (this._physicalStockReportSource === this.physicalStockProducts && this._physicalStockReportCache) return this._physicalStockReportCache;
            const warehouses = ACTIVE_PHYSICAL_WAREHOUSES;
            const itemMap = new Map(), categories = new Map(), groups = new Map(), suppliers = new Map();
            const branchStats = new Map(warehouses.map(w => [w.key,{name:w.label,quantity:0,value:0,batchCount:0,itemQuantities:new Map()}]));
            const branchCategories = new Map(), branchGroups = new Map(), negativeBalances = [];
            let totalQuantity=0,totalValue=0,negativeBatchCount=0;
            const cleanText = value => String(value ?? '').trim();
            const createAgg = name => ({name,quantity:0,value:0,batchCount:0,items:new Set()});
            const add = (map,key,name,code,qty,value) => {
                if(!map.has(key))map.set(key,createAgg(name)); const agg=map.get(key);
                agg.quantity+=qty;agg.value+=value;agg.batchCount++;if(code)agg.items.add(code);
            };
            this.physicalStockProducts.forEach(row=>{
                const code=cleanText(row['ITEM CODE']||row.itemCode),name=cleanText(row['ITEM NAME']||row.productName)||'Unnamed item';
                const category=cleanText(row.CATEGORY||row.category),mainGroup=cleanText(row['MAIN GROUP']||row.mainGroup),supplier=cleanText(row.SUPPLIER||row.supplier);
                const rate=this.parseNum(row.RATE??row.rate);let activeRowQty=0,activeRowValue=0,hasNegative=false;
                warehouses.forEach(w=>{
                    const qty=this.parseNum(row[w.key]),value=qty*rate,branch=branchStats.get(w.key);
                    activeRowQty+=qty;activeRowValue+=value;branch.quantity+=qty;branch.value+=value;
                    if(qty!==0){branch.batchCount++;branch.itemQuantities.set(code,(branch.itemQuantities.get(code)||0)+qty);
                        if(category)add(branchCategories,`${w.key}\0${category}`,category,code,qty,value);
                        if(mainGroup)add(branchGroups,`${w.key}\0${mainGroup}`,mainGroup,code,qty,value);
                    }
                    if(qty<0){hasNegative=true;negativeBalances.push({branch:w.label,code:code||'—',name,category,batch:cleanText(row.BATCH||row.BATCHID||row.batch)||'—',quantity:qty,value});}
                });
                if(hasNegative)negativeBatchCount++;
                totalQuantity+=activeRowQty;totalValue+=activeRowValue;
                if(category)add(categories,category,category,code,activeRowQty,activeRowValue);
                if(mainGroup)add(groups,mainGroup,mainGroup,code,activeRowQty,activeRowValue);
                if(supplier)add(suppliers,supplier,supplier,code,activeRowQty,activeRowValue);
                const itemKey=code||name;
                if(!itemMap.has(itemKey))itemMap.set(itemKey,{key:itemKey,code:code||'—',name,category,mainGroup,quantity:0,value:0,batchCount:0});
                const item=itemMap.get(itemKey);item.quantity+=activeRowQty;item.value+=activeRowValue;item.batchCount++;
            });
            const finalize=agg=>({name:agg.name,quantity:agg.quantity,value:agg.value,batchCount:agg.batchCount,productCount:agg.items?.size||0});
            const report={
                totals:{productCount:itemMap.size,batchCount:this.physicalStockProducts.length,totalQuantity,totalValue,negativeBatchCount},
                branches:warehouses.map(w=>{const b=branchStats.get(w.key);return {name:b.name,quantity:b.quantity,value:b.value,batchCount:b.batchCount,productCount:[...b.itemQuantities.values()].filter(q=>q!==0).length};}).sort((a,b)=>b.quantity-a.quantity),
                categories:[...categories.values()].map(finalize).sort((a,b)=>b.quantity-a.quantity),
                mainGroups:[...groups.values()].map(finalize).sort((a,b)=>b.quantity-a.quantity),
                suppliers:[...suppliers.values()].map(finalize).sort((a,b)=>b.value-a.value),
                branchCategories:[...branchCategories].map(([key,v])=>({...finalize(v),branch:warehouses.find(w=>key.startsWith(w.key+'\0'))?.label||''})).sort((a,b)=>a.branch.localeCompare(b.branch)||b.quantity-a.quantity),
                branchGroups:[...branchGroups].map(([key,v])=>({...finalize(v),branch:warehouses.find(w=>key.startsWith(w.key+'\0'))?.label||''})).sort((a,b)=>a.branch.localeCompare(b.branch)||b.quantity-a.quantity),
                negativeBalances:negativeBalances.sort((a,b)=>a.quantity-b.quantity),
                topProducts:[...itemMap.values()].sort((a,b)=>b.quantity-a.quantity||b.value-a.value).slice(0,20)
            };
            this._physicalStockReportSource=this.physicalStockProducts;this._physicalStockReportCache=report;return report;
        },
        renderCharts() {
            if(typeof Chart==='undefined')return;
            try {
                [brandChartInstance,typeChartInstance,priceRangeChartInstance,valueByBrandChartInstance].forEach(chart=>chart?.destroy());
                const report=this.physicalStockReport,palette=['#2563eb','#059669','#f59e0b','#dc2626','#0891b2','#65a30d','#7c3aed'];
                const chartOptions={responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{beginAtZero:true}}};
                const createBar=(id,labels,data,color,indexAxis='y')=>{const el=document.getElementById(id);return el?new Chart(el.getContext('2d'),{type:'bar',data:{labels,datasets:[{data,backgroundColor:color}]},options:{...chartOptions,indexAxis}}):null};
                brandChartInstance=createBar('brandChart',report.branches.map(x=>x.name),report.branches.map(x=>x.quantity),palette);
                const categories=report.categories.slice(0,8),other=report.categories.slice(8).reduce((s,x)=>s+x.quantity,0);
                const categoryRows=other?[...categories,{name:'Other',quantity:other}]:categories;
                typeChartInstance=createBar('typeChart',categoryRows.map(x=>x.name),categoryRows.map(x=>x.quantity),palette);
                const groups=report.mainGroups.slice(0,8),otherGroup=report.mainGroups.slice(8).reduce((s,x)=>s+x.quantity,0);
                const groupRows=otherGroup?[...groups,{name:'Other',quantity:otherGroup}]:groups;
                priceRangeChartInstance=createBar('priceRangeChart',groupRows.map(x=>x.name),groupRows.map(x=>x.quantity),'#0d9488');
                valueByBrandChartInstance=createBar('valueByBrandChart',report.branches.map(x=>x.name),report.branches.map(x=>x.value),'#ea580c');
            } catch(error){console.error('Error rendering stock charts:',error);}
        }
    };
}
