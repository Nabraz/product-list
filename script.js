/**
 * Inventory & Catalog Alpine.js Component
 * Handles:
 * - Accessories MRP Tracking (Sheet1 -> products)
 * - Second Hand Stock (Sheet2 -> secondHandProducts)
 * - Physical Stock / Barcode Data ("physical stock" -> physicalStockProducts)
 * - Auto-sync if last sync date is not today
 */

let brandChartInstance = null;
let typeChartInstance = null;
let priceRangeChartInstance = null;
let valueByBrandChartInstance = null;

function catalogApp() {
    return {
        // --- 1. STATE MANAGEMENT ---
        products: [],               // Accessories (MRP Tracking)
        secondHandProducts: [],     // Used / Second-Hand Stock
        physicalStockProducts: [],  // Actual Physical Stock
        _physicalStockReportSource: null,
        _physicalStockReportCache: null,
        physicalStockWarehouses: [
            'Chalan Warehouse',
            'CITY CENTER WAREHOUSE',
            'Jawalakhel A',
            'Jawalakhel B',
            'Jawalakhel C',
            'Jawalakhel D',
            'Main Warehouse'
        ],

        loading: false,
        loadingAccessories: false,
        loadingSecondHand: false,
        loadingPhysicalStock: false,

        lastSynced: '',
        lastSyncedAccessories: '',
        lastSyncedSecondHand: '',
        lastSyncedPhysicalStock: '',

        activeTab: 'summary',    // Default active tab ('secondhand', 'list', 'analytics', 'summary')
        showAllPrices: false,
        showNav: true,
        lastScrollY: 0,

        cacheKeys: {
            accessoriesData: 'catalog_accessories_data',
            accessoriesTime: 'catalog_accessories_time',
            secondHandData:  'catalog_secondhand_data',
            secondHandTime:  'catalog_secondhand_time',
            physicalStockData: 'catalog_physicalstock_data',
            physicalStockTime: 'catalog_physicalstock_time',
            globalTime:        'catalog_global_time'
        },

        // Filters
        searchQuery: '',
        filterBrand: '',
        filterType: '',

        shSearchQuery: '',
        shFilterBy: 'branch',
        shFilterValue: '',
        shGroupBy: 'branch',

        // --- 2. UTILITY & PARSING HELPERS ---
        parseNum(val) {
            if (val === null || val === undefined || val === '' || val === '-') return 0;
            const clean = String(val).replace(/[^0-9.-]+/g, '');
            const num = parseFloat(clean);
            return isNaN(num) ? 0 : num;
        },

        formatCurrency(val) {
            const num = this.parseNum(val);
            return 'Rs. ' + num.toLocaleString('en-IN', { maximumFractionDigits: 0 });
        },

        formatStockValue(val) {
            return 'Rs. ' + this.parseNum(val).toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        },

        cleanCurrencyText(val) {
            if (!val || val === '-') return 'Rs. 0';
            const num = this.parseNum(val);
            return 'Rs. ' + num.toLocaleString('en-IN', { maximumFractionDigits: 0 });
        },

        isToday(dateStr) {
            if (!dateStr) return false;
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return false;
            const today = new Date();
            return d.getDate() === today.getDate() &&
                   d.getMonth() === today.getMonth() &&
                   d.getFullYear() === today.getFullYear();
        },

        isCacheStale() {
            const globalTime = localStorage.getItem(this.cacheKeys.globalTime);
            if (!globalTime) return true;
            return !this.isToday(globalTime);
        },

        // --- 3. LIFECYCLE & INITIALIZATION ---
        init() {
            this.loadAllCaches();

            // Auto-pull from Google Sheets if cache is empty or last sync is not today
            if (this.isCacheStale() || this.products.length === 0 || this.secondHandProducts.length === 0) {
                console.log('Cache stale or missing data. Auto-fetching fresh Google Sheet data...');
                this.fetchAllData();
            } else {
                console.log('Cache is up-to-date for today.');
            }

            if (this.activeTab === 'analytics') {
                setTimeout(() => this.renderCharts(), 150);
            }
        },

        handleScroll() {
            const currentScrollY = window.scrollY;
            if (currentScrollY > this.lastScrollY && currentScrollY > 60) {
                this.showNav = false;
            } else {
                this.showNav = true;
            }
            this.lastScrollY = currentScrollY;
        },

        toggleAllPrices() {
            this.showAllPrices = !this.showAllPrices;
        },

        switchTab(tabName) {
            this.activeTab = tabName;
            if (tabName === 'analytics') {
                setTimeout(() => this.renderCharts(), 150);
            }
        },

        // --- 4. CACHE OPERATIONS ---
        loadAllCaches() {
            this.loadAccessoriesFromCache();
            this.loadSecondHandFromCache();
            this.loadPhysicalStockFromCache();
            this.lastSynced = localStorage.getItem(this.cacheKeys.globalTime) || this.lastSyncedSecondHand || this.lastSyncedAccessories || '';
        },

        loadAccessoriesFromCache() {
            try {
                const data = localStorage.getItem(this.cacheKeys.accessoriesData);
                const time = localStorage.getItem(this.cacheKeys.accessoriesTime);
                if (data) {
                    const parsed = JSON.parse(data);
                    this.products = (Array.isArray(parsed) ? parsed : []).map(p => ({
                        id: p.id,
                        brand: p.brand || 'Generic',
                        type: p.type || 'General',
                        name: p.name || p.productName || 'Unnamed Item',
                        mrp: this.parseNum(p.mrp),
                        cost: this.parseNum(p.cost)
                    }));
                    this.lastSyncedAccessories = time || '';
                }
            } catch (err) {
                console.error('Error loading Accessories cache:', err);
                this.products = [];
            }
        },

        saveAccessoriesToCache(data) {
            try {
                const now = new Date().toLocaleString();
                localStorage.setItem(this.cacheKeys.accessoriesData, JSON.stringify(data));
                localStorage.setItem(this.cacheKeys.accessoriesTime, now);
                localStorage.setItem(this.cacheKeys.globalTime, now);
                this.lastSyncedAccessories = now;
                this.lastSynced = now;
            } catch (err) {
                console.error('Error saving Accessories cache:', err);
            }
        },

        loadSecondHandFromCache() {
            try {
                const data = localStorage.getItem(this.cacheKeys.secondHandData);
                const time = localStorage.getItem(this.cacheKeys.secondHandTime);
                if (data) {
                    const parsed = JSON.parse(data);
                    this.secondHandProducts = (Array.isArray(parsed) ? parsed : []).map(p => ({
                        id: p.id,
                        branch: p.branch || 'Main Branch',
                        brand: p.brand || 'iPhone',
                        type: p.type || 'iPhone',
                        acquiredDate: p.acquiredDate || '-',
                        age: p.age !== undefined ? p.age : '',
                        productName: p.productName || p.name || 'Device',
                        costPrice: this.parseNum(p.costPrice),
                        expectedSalesPrice: this.parseNum(p.expectedSalesPrice),
                        imei: p.imei || '-',
                        color: p.color || '',
                        batteryHealth: this.parseNum(p.batteryHealth),
                        otherInfo: p.otherInfo || ''
                    }));
                    this.lastSyncedSecondHand = time || '';
                }
            } catch (err) {
                console.error('Error loading Second Hand cache:', err);
                this.secondHandProducts = [];
            }
        },

        saveSecondHandToCache(data) {
            try {
                const now = new Date().toLocaleString();
                localStorage.setItem(this.cacheKeys.secondHandData, JSON.stringify(data));
                localStorage.setItem(this.cacheKeys.secondHandTime, now);
                localStorage.setItem(this.cacheKeys.globalTime, now);
                this.lastSyncedSecondHand = now;
                this.lastSynced = now;
            } catch (err) {
                console.error('Error saving Second Hand cache:', err);
            }
        },

        loadPhysicalStockFromCache() {
            try {
                const data = localStorage.getItem(this.cacheKeys.physicalStockData) ||
                    localStorage.getItem('inv_scan_products') ||
                    localStorage.getItem('inv_scan_product') ||
                    localStorage.getItem('physicalStock');
                const time = localStorage.getItem(this.cacheKeys.physicalStockTime);
                if (data) {
                    this.physicalStockProducts = JSON.parse(data) || [];
                    this.lastSyncedPhysicalStock = time || '';
                }
            } catch (err) {
                console.error('Error loading Physical Stock cache:', err);
                this.physicalStockProducts = [];
            }
        },

        savePhysicalStockToCache(data) {
            try {
                const now = new Date().toLocaleString();
                localStorage.setItem(this.cacheKeys.physicalStockData, JSON.stringify(data));
                localStorage.setItem(this.cacheKeys.physicalStockTime, now);
                localStorage.setItem('inv_scan_products', JSON.stringify(data));
                this.lastSyncedPhysicalStock = now;
            } catch (err) {
                console.error('Error saving Physical Stock cache:', err);
            }
        },

        // --- 5. GOOGLE SHEET FETCHERS ---
        fetchData() {
            this.fetchAllData();
        },

        fetchAllData() {
            this.loading = true;
            this.fetchAccessoriesData();
            this.fetchSecondHandData();
            this.fetchPhysicalStockData();
        },

        fetchAccessoriesData() {
            this.loadingAccessories = true;

            window.processSheetData = (json) => {
                try {
                    if (!json || !json.table || !json.table.cols || !json.table.rows) {
                        throw new Error('Invalid Accessories JSON format');
                    }

                    const cols = json.table.cols.map(c => c ? (c.label || '').trim() : '');
                    const brandIdx = cols.indexOf('Brands');
                    const typeIdx = cols.indexOf('Product Type');
                    const nameIdx = cols.indexOf('Product Name');
                    const mrpIdx = cols.indexOf('MRP');
                    const costIdx = cols.indexOf('Cost');

                    const getVal = (row, idx) => (idx > -1 && row.c[idx]) ? (row.c[idx].f || row.c[idx].v || '') : '';

                    this.products = json.table.rows.map((row, index) => {
                        const name = getVal(row, nameIdx);
                        if (!name) return null;
                        return {
                            id: index,
                            brand: getVal(row, brandIdx) || 'Generic',
                            type: getVal(row, typeIdx) || 'General',
                            name: name,
                            mrp: this.parseNum(getVal(row, mrpIdx)),
                            cost: this.parseNum(getVal(row, costIdx))
                        };
                    }).filter(Boolean);

                    this.saveAccessoriesToCache(this.products);
                    if (this.activeTab === 'analytics') {
                        setTimeout(() => this.renderCharts(), 100);
                    }
                } catch (err) {
                    console.error('Error parsing Accessories data:', err);
                } finally {
                    this.loadingAccessories = false;
                    this.checkOverallLoading();
                }
            };

            const script = document.createElement('script');
            const sheetId = '1pixGGUak_L7P_Xrz-TE52qXNWZkTZ7Xy-84DvUrJt_I';
            const nocache = new Date().getTime();
            script.src = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=responseHandler:processSheetData&_=${nocache}`;
            script.onerror = () => { this.loadingAccessories = false; this.checkOverallLoading(); };
            document.body.appendChild(script);
        },

        fetchSecondHandData() {
            this.loadingSecondHand = true;

            window.processSheet2Data = (json) => {
                try {
                    if (!json || !json.table || !json.table.cols || !json.table.rows) {
                        throw new Error('Invalid Second-Hand JSON format');
                    }

                    const cols = json.table.cols.map(c => c ? (c.label || '').trim() : '');
                    const branchIdx = cols.findIndex(c => /^branch$/i.test(c));
                    const brandIdx  = cols.findIndex(c => /^brand(s)?$/i.test(c));
                    const typeIdx   = cols.findIndex(c => /^type$/i.test(c));
                    const dateIdx   = cols.findIndex(c => /acquired/i.test(c));
                    const nameIdx   = cols.findIndex(c => /product name/i.test(c));
                    const costIdx   = cols.findIndex(c => /cost price/i.test(c));
                    const saleIdx   = cols.findIndex(c => /expected sales/i.test(c));
                    const imeiIdx   = cols.findIndex(c => /imei/i.test(c));
                    const colorIdx  = cols.findIndex(c => /^color$/i.test(c));
                    const batteryIdx= cols.findIndex(c => /battery/i.test(c));
                    const otherIdx  = cols.findIndex(c => /other info/i.test(c));

                    const getVal = (row, idx) => (idx > -1 && row.c[idx]) ? (row.c[idx].f || row.c[idx].v || '') : '';

                    this.secondHandProducts = json.table.rows.map((row, index) => {
                        const name = getVal(row, nameIdx);
                        if (!name) return null;

                        let acqDateStr = getVal(row, dateIdx);
                        let ageVal = '';
                        if (acqDateStr) {
                            let d = new Date(acqDateStr);
                            if (!isNaN(d.getTime())) {
                                let diff = Math.floor((new Date() - d) / (1000 * 60 * 60 * 24));
                                ageVal = diff >= 0 ? diff : 0;
                            }
                        }

                        return {
                            id: index,
                            branch: getVal(row, branchIdx) || 'Main Branch',
                            brand: getVal(row, brandIdx) || 'iPhone',
                            type: getVal(row, typeIdx) || 'iPhone',
                            acquiredDate: acqDateStr || '-',
                            age: ageVal,
                            productName: name,
                            costPrice: this.parseNum(getVal(row, costIdx)),
                            expectedSalesPrice: this.parseNum(getVal(row, saleIdx)),
                            imei: getVal(row, imeiIdx) || '-',
                            color: getVal(row, colorIdx) || '',
                            batteryHealth: this.parseNum(getVal(row, batteryIdx)),
                            otherInfo: getVal(row, otherIdx) || ''
                        };
                    }).filter(Boolean);

                    this.saveSecondHandToCache(this.secondHandProducts);
                } catch (err) {
                    console.error('Error parsing Second-Hand data:', err);
                } finally {
                    this.loadingSecondHand = false;
                    this.checkOverallLoading();
                }
            };

            const script = document.createElement('script');
            const sheetId = '1pixGGUak_L7P_Xrz-TE52qXNWZkTZ7Xy-84DvUrJt_I';
            const nocache = new Date().getTime();
            script.src = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=responseHandler:processSheet2Data&sheet=Sheet2&_=${nocache}`;
            script.onerror = () => { this.loadingSecondHand = false; this.checkOverallLoading(); };
            document.body.appendChild(script);
        },

        fetchPhysicalStockData() {
            this.loadingPhysicalStock = true;

            window.processPhysicalStockData = (json) => {
                try {
                    if (!json || !json.table || !json.table.cols || !json.table.rows) return;
                    const headers = json.table.cols.map(c => c ? (c.label || '').trim() : '');

                    const getVal = (row, idx) => (idx > -1 && row.c && row.c[idx]) ? (row.c[idx].v ?? row.c[idx].f ?? '') : '';

                    this.physicalStockProducts = json.table.rows.map((row, index) => {
                        if (!row || !row.c) return null;
                        const rowObj = { id: index };
                        headers.forEach((header, idx) => {
                            if (!header) return;
                            const rawVal = getVal(row, idx);
                            if (/warehouse|jawalakhel|stock|qty|rate|value|mrp/i.test(header)) {
                                rowObj[header] = this.parseNum(rawVal);
                            } else {
                                rowObj[header] = String(rawVal).trim();
                            }
                        });

                        const itemCode = String(rowObj['ITEM CODE'] || '').trim();
                        const itemName = String(rowObj['ITEM NAME'] || '').trim();
                        if (!itemCode && !itemName) return null;

                        return rowObj;
                    }).filter(Boolean);

                    this.savePhysicalStockToCache(this.physicalStockProducts);
                    if (this.activeTab === 'analytics') {
                        setTimeout(() => this.renderCharts(), 100);
                    }
                } catch (err) {
                    console.error('Error parsing physical stock:', err);
                } finally {
                    this.loadingPhysicalStock = false;
                    this.checkOverallLoading();
                }
            };

            const script = document.createElement('script');
            const sheetId = '1Bbdlx6P8VoxirhhzivUNtvIWWw9ROhJ3';
            const nocache = new Date().getTime();
            script.src = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=responseHandler:processPhysicalStockData&sheet=physical%20stock&_=${nocache}`;
            script.onerror = () => { this.loadingPhysicalStock = false; this.checkOverallLoading(); };
            document.body.appendChild(script);
        },

        checkOverallLoading() {
            if (!this.loadingAccessories && !this.loadingSecondHand && !this.loadingPhysicalStock) {
                this.loading = false;
            }
        },

        // --- 6. COMPUTED PROPERTIES (ACCESSORIES & TAB 1) ---
        get filteredProducts() {
            const q = this.searchQuery.toLowerCase().trim();
            return this.products.filter(p => {
                const matchSearch = !q ||
                    p.name.toLowerCase().includes(q) ||
                    p.brand.toLowerCase().includes(q) ||
                    p.type.toLowerCase().includes(q);
                const matchBrand = !this.filterBrand || p.brand.toLowerCase() === this.filterBrand.toLowerCase();
                const matchType = !this.filterType || p.type.toLowerCase() === this.filterType.toLowerCase();
                return matchSearch && matchBrand && matchType;
            });
        },

        get uniqueBrands() {
            return [...new Set(this.products.map(p => p.brand))].filter(Boolean).sort();
        },

        get uniqueTypes() {
            return [...new Set(this.products.map(p => p.type))].filter(Boolean).sort();
        },

        setBrandFilter(brand) {
            this.filterBrand = brand || '';
        },

        setTypeFilter(type) {
            this.filterType = type || '';
        },

        clearAllFilters() {
            this.searchQuery = '';
            this.filterBrand = '';
            this.filterType = '';
        },

        // --- 7. COMPUTED PROPERTIES (ANALYTICS) ---
        get totalMrpValue() {
            return this.products.reduce((sum, p) => sum + (p.mrp || 0), 0);
        },

        get totalCostValue() {
            return this.products.reduce((sum, p) => sum + (p.cost || 0), 0);
        },

        get totalProfit() {
            return this.totalMrpValue - this.totalCostValue;
        },

        get avgMarginPercent() {
            if (this.totalMrpValue <= 0) return 0;
            return (this.totalProfit / this.totalMrpValue) * 100;
        },

        get topBrand() {
            if (this.products.length === 0) return null;
            const counts = {};
            this.products.forEach(p => counts[p.brand] = (counts[p.brand] || 0) + 1);
            let topName = '';
            let maxCount = 0;
            Object.entries(counts).forEach(([brand, count]) => {
                if (count > maxCount) {
                    maxCount = count;
                    topName = brand;
                }
            });
            return { name: topName, count: maxCount };
        },

        get highestPricedProduct() {
            if (this.products.length === 0) return null;
            return [...this.products].sort((a, b) => b.mrp - a.mrp)[0];
        },

        // --- 8. COMPUTED PROPERTIES (SECOND HAND) ---
        get shFilterOptions() {
            if (this.shFilterBy === 'branch') {
                return [...new Set(this.secondHandProducts.map(p => p.branch))].filter(Boolean).sort();
            }
            return [...new Set(this.secondHandProducts.map(p => p.type))].filter(Boolean).sort();
        },

        get filteredSecondHand() {
            const q = this.shSearchQuery.toLowerCase().trim();
            return this.secondHandProducts.filter(p => {
                const matchSearch = !q ||
                    p.productName.toLowerCase().includes(q) ||
                    p.brand.toLowerCase().includes(q) ||
                    p.type.toLowerCase().includes(q) ||
                    p.imei.toLowerCase().includes(q) ||
                    p.color.toLowerCase().includes(q);

                const filterTarget = this.shFilterBy === 'branch' ? p.branch : p.type;
                const matchFilter = !this.shFilterValue || filterTarget === this.shFilterValue;

                return matchSearch && matchFilter;
            });
        },

        get groupedSecondHand() {
            const grouped = {};
            this.filteredSecondHand.forEach(item => {
                const groupKey = this.shGroupBy === 'branch' ? (item.branch || 'Unassigned') : (item.type || 'Uncategorized');
                if (!grouped[groupKey]) grouped[groupKey] = [];
                grouped[groupKey].push(item);
            });

            return Object.entries(grouped).map(([key, items]) => ({
                key,
                items
            })).sort((a, b) => a.key.localeCompare(b.key));
        },

        get groupedSecondHandByBranch() {
            const grouped = {};
            this.secondHandProducts.forEach(item => {
                const branch = item.branch || 'Unassigned';
                const type = item.type || 'Uncategorized';
                if (!grouped[branch]) grouped[branch] = {};
                if (!grouped[branch][type]) grouped[branch][type] = [];
                grouped[branch][type].push(item);
            });

            return Object.entries(grouped).map(([branch, types]) => ({
                branch,
                types: Object.entries(types).map(([type, items]) => ({ type, items }))
            })).sort((a, b) => a.branch.localeCompare(b.branch));
        },

        // --- 9. COMPUTED PROPERTIES (SUMMARY TAB) ---
        get brandStats() {
            const map = {};
            this.products.forEach(p => {
                const b = p.brand || 'Generic';
                if (!map[b]) map[b] = { count: 0, totalCost: 0, totalMrp: 0 };
                map[b].count++;
                map[b].totalCost += p.cost || 0;
                map[b].totalMrp += p.mrp || 0;
            });

            return Object.entries(map).map(([name, data]) => {
                const avgCost = data.count > 0 ? data.totalCost / data.count : 0;
                const avgMrp  = data.count > 0 ? data.totalMrp / data.count : 0;
                const margin  = avgCost > 0 ? ((avgMrp - avgCost) / avgCost) * 100 : 0;
                return { name, count: data.count, avgCost, avgMrp, margin };
            }).sort((a, b) => b.count - a.count);
        },

        get categoryStats() {
            const map = {};
            this.products.forEach(p => {
                const cat = p.type || 'General';
                if (!map[cat]) map[cat] = { count: 0, totalCost: 0, totalMrp: 0, items: [] };
                map[cat].count++;
                map[cat].totalCost += p.cost || 0;
                map[cat].totalMrp += p.mrp || 0;
                map[cat].items.push(p);
            });

            return Object.entries(map).map(([name, data]) => {
                const avgCost = data.count > 0 ? data.totalCost / data.count : 0;
                const avgMrp  = data.count > 0 ? data.totalMrp / data.count : 0;
                const margin  = avgCost > 0 ? ((avgMrp - avgCost) / avgCost) * 100 : 0;
                return { name, count: data.count, avgCost, avgMrp, margin, items: data.items };
            }).sort((a, b) => b.count - a.count);
        },

        get physicalStockReport() {
            if (this._physicalStockReportSource === this.physicalStockProducts && this._physicalStockReportCache) {
                return this._physicalStockReportCache;
            }

            const warehouses = this.physicalStockWarehouses;
            const branchMap = new Map();
            const categoryMap = new Map();
            const groupMap = new Map();
            const supplierMap = new Map();
            const branchCategoryMap = new Map();
            const branchGroupMap = new Map();
            const productMap = new Map();
            const negativeBalances = [];
            let totalQuantity = 0;
            let totalValue = 0;
            let negativeBatchCount = 0;

            const makeAggregate = (name, countNetItems = false) => ({
                name,
                quantity: 0,
                value: 0,
                batchCount: 0,
                itemQuantities: new Map(),
                itemKeys: new Set(),
                countNetItems
            });

            const addToAggregate = (aggregate, productKey, quantity, value) => {
                aggregate.quantity += quantity;
                aggregate.value += value;
                aggregate.batchCount++;
                if (productKey) {
                    aggregate.itemKeys.add(productKey);
                    aggregate.itemQuantities.set(
                        productKey,
                        (aggregate.itemQuantities.get(productKey) || 0) + quantity
                    );
                }
            };

            this.physicalStockProducts.forEach((row) => {
                const code = String(row['ITEM CODE'] || row.itemCode || '').trim();
                const name = String(row['ITEM NAME'] || row.productName || 'Unnamed item').trim();
                const productKey = code || name;
                const category = String(row.CATEGORY || row.category || 'Uncategorized').trim() || 'Uncategorized';
                const mainGroup = String(row['MAIN GROUP'] || row.mainGroup || 'Unassigned').trim() || 'Unassigned';
                const supplier = String(row.SUPPLIER || row.supplier || 'Unassigned').trim() || 'Unassigned';
                const rate = this.parseNum(row.RATE ?? row.rate);
                let rowQuantity = 0;
                let rowValue = 0;
                let hasNegativeBalance = false;

                warehouses.forEach((warehouse) => {
                    const quantity = this.parseNum(row[warehouse]);
                    const value = quantity * rate;
                    rowQuantity += quantity;
                    rowValue += value;

                    if (!branchMap.has(warehouse)) branchMap.set(warehouse, makeAggregate(warehouse, true));
                    if (quantity !== 0) {
                        addToAggregate(branchMap.get(warehouse), productKey, quantity, value);

                        const branchCategoryKey = `${warehouse}\u0000${category}`;
                        if (!branchCategoryMap.has(branchCategoryKey)) {
                            branchCategoryMap.set(branchCategoryKey, {
                                ...makeAggregate(category, true),
                                branch: warehouse
                            });
                        }
                        addToAggregate(branchCategoryMap.get(branchCategoryKey), productKey, quantity, value);

                        const branchGroupKey = `${warehouse}\u0000${mainGroup}`;
                        if (!branchGroupMap.has(branchGroupKey)) {
                            branchGroupMap.set(branchGroupKey, {
                                ...makeAggregate(mainGroup, true),
                                branch: warehouse
                            });
                        }
                        addToAggregate(branchGroupMap.get(branchGroupKey), productKey, quantity, value);
                    }
                    if (quantity < 0) {
                        hasNegativeBalance = true;
                        negativeBalances.push({
                            branch: warehouse,
                            code: code || '—',
                            name,
                            category,
                            batch: String(row.BATCH || row.BATCHID || row.batch || '—'),
                            quantity,
                            value
                        });
                    }
                });

                if (hasNegativeBalance) negativeBatchCount++;
                totalQuantity += rowQuantity;
                totalValue += rowValue;

                if (!categoryMap.has(category)) categoryMap.set(category, makeAggregate(category));
                addToAggregate(categoryMap.get(category), productKey, rowQuantity, rowValue);
                if (!groupMap.has(mainGroup)) groupMap.set(mainGroup, makeAggregate(mainGroup));
                addToAggregate(groupMap.get(mainGroup), productKey, rowQuantity, rowValue);
                if (!supplierMap.has(supplier)) supplierMap.set(supplier, makeAggregate(supplier));
                addToAggregate(supplierMap.get(supplier), productKey, rowQuantity, rowValue);

                if (!productMap.has(productKey)) {
                    productMap.set(productKey, {
                        key: productKey,
                        code: code || '—',
                        name,
                        category,
                        mainGroup,
                        quantity: 0,
                        value: 0,
                        batchCount: 0
                    });
                }
                const product = productMap.get(productKey);
                product.quantity += rowQuantity;
                product.value += rowValue;
                product.batchCount++;
            });

            const finalize = (aggregate) => ({
                ...aggregate,
                productCount: aggregate.countNetItems
                    ? [...aggregate.itemQuantities.values()].filter(quantity => quantity !== 0).length
                    : aggregate.itemKeys.size,
                itemQuantities: undefined,
                itemKeys: undefined,
                countNetItems: undefined
            });
            const report = {
                totals: {
                    productCount: productMap.size,
                    batchCount: this.physicalStockProducts.length,
                    totalQuantity,
                    totalValue,
                    negativeBatchCount
                },
                branches: warehouses.map((name) => finalize(branchMap.get(name) || makeAggregate(name)))
                    .sort((a, b) => b.quantity - a.quantity),
                categories: [...categoryMap.values()].map(finalize).sort((a, b) => b.quantity - a.quantity),
                mainGroups: [...groupMap.values()].map(finalize).sort((a, b) => b.quantity - a.quantity),
                suppliers: [...supplierMap.values()].map(finalize).sort((a, b) => b.value - a.value),
                branchCategories: [...branchCategoryMap.values()].map(finalize)
                    .sort((a, b) => a.branch.localeCompare(b.branch) || b.quantity - a.quantity),
                branchGroups: [...branchGroupMap.values()].map(finalize)
                    .sort((a, b) => a.branch.localeCompare(b.branch) || b.quantity - a.quantity),
                negativeBalances: negativeBalances.sort((a, b) => a.quantity - b.quantity),
                topProducts: [...productMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 20)
            };

            this._physicalStockReportSource = this.physicalStockProducts;
            this._physicalStockReportCache = report;
            return report;
        },

        // --- 10. CHARTS RENDERING ---
        renderCharts() {
            if (typeof Chart === 'undefined') return;

            try {
                if (brandChartInstance) brandChartInstance.destroy();
                if (typeChartInstance) typeChartInstance.destroy();
                if (priceRangeChartInstance) priceRangeChartInstance.destroy();
                if (valueByBrandChartInstance) valueByBrandChartInstance.destroy();

                const report = this.physicalStockReport;
                const palette = ['#2563eb', '#059669', '#f59e0b', '#dc2626', '#0891b2', '#65a30d', '#7c3aed'];
                const topCategories = report.categories.slice(0, 8);
                const otherCategoryQuantity = report.categories.slice(8).reduce((sum, category) => sum + category.quantity, 0);
                const categoryChartRows = otherCategoryQuantity
                    ? [...topCategories, { name: 'Other', quantity: otherCategoryQuantity }]
                    : topCategories;
                const topGroups = report.mainGroups.slice(0, 8);
                const otherGroupQuantity = report.mainGroups.slice(8).reduce((sum, group) => sum + group.quantity, 0);
                const groupChartRows = otherGroupQuantity
                    ? [...topGroups, { name: 'Other', quantity: otherGroupQuantity }]
                    : topGroups;
                const chartOptions = {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { x: { beginAtZero: true } }
                };

                const elBrand = document.getElementById('brandChart');
                if (elBrand) {
                    brandChartInstance = new Chart(elBrand.getContext('2d'), {
                        type: 'bar',
                        data: {
                            labels: report.branches.map(branch => branch.name),
                            datasets: [{ label: 'Net Quantity', data: report.branches.map(branch => branch.quantity), backgroundColor: palette }]
                        },
                        options: { ...chartOptions, indexAxis: 'y' }
                    });
                }

                const elType = document.getElementById('typeChart');
                if (elType) {
                    typeChartInstance = new Chart(elType.getContext('2d'), {
                        type: 'bar',
                        data: {
                            labels: categoryChartRows.map(category => category.name),
                            datasets: [{ label: 'Net Quantity', data: categoryChartRows.map(category => category.quantity), backgroundColor: palette }]
                        },
                        options: { ...chartOptions, indexAxis: 'y' }
                    });
                }

                const elPriceRange = document.getElementById('priceRangeChart');
                if (elPriceRange) {
                    priceRangeChartInstance = new Chart(elPriceRange.getContext('2d'), {
                        type: 'bar',
                        data: {
                            labels: groupChartRows.map(group => group.name),
                            datasets: [{ label: 'Net Quantity', data: groupChartRows.map(group => group.quantity), backgroundColor: '#0d9488' }]
                        },
                        options: { ...chartOptions, indexAxis: 'y' }
                    });
                }

                const elValueByBranch = document.getElementById('valueByBrandChart');
                if (elValueByBranch) {
                    valueByBrandChartInstance = new Chart(elValueByBranch.getContext('2d'), {
                        type: 'bar',
                        data: {
                            labels: report.branches.map(branch => branch.name),
                            datasets: [{ label: 'Stock Value (Rs.)', data: report.branches.map(branch => branch.value), backgroundColor: '#ea580c' }]
                        },
                        options: { ...chartOptions, indexAxis: 'y' }
                    });
                }
            } catch (e) {
                console.error('Error rendering charts:', e);
            }
        }
    };
}
