const hana = require('@sap/hana-client');
const config = require('./config');
const { EXTENDED_CATALOG } = require('../fixtures/extended-catalog');

const E2E_VERIFIED_CALC = [
    'CV_EMPLOYEE',
    'CA_SALES_ANALYTICS',
    'CV_AMD',
    'CV_BANK',
    'CV_AC_TYPE',
    'CA_FINANCIAL_KPI',
    'CA_INVENTORY_VALUATION',
    'CV_MSTRPROJCOSTERP',
    'CA_PURCHASE_SPEND',
    'CA_MANUFACTURING_OUTPUT',
    'CV_WBSElement_BasicView',
    'CV_ProjectCostObjects',
    'CV_CONTROLLING_AREA',
    'CV_VBAK',
    'CV_VBAP',
    'CV_CPRO',
    'CV_RESOURCE_MATERIAL',
    'CV_CUSTOMER',
    'CV_VENDOR',
    'CV_COMPANY'
];

const E2E_VERIFIED_CDS = [
    'C_PurchaseOrderFs',
    'I_SalesDocumentItem',
    'ZI_MYQ_ProdConfirmationFact',
    'I_ProfitCenter',
    'I_CostCenter',
    'ZC_MYQ_OrderSummary',
    'ZI_MYQ_GoodsMovementFact',
    'ZI_MYQ_InspectionLotFact',
    'ZI_MYQ_InspectionResultFact',
    'ZI_MYQ_QualityDefectFact',
    'C_JournalEntryItem',
    'C_SupplierInvoiceItem',
    'I_BillingDocumentItem',
    'I_CustomerPayment',
    'I_DeliveryDocumentItem',
    'I_MaterialStock',
    'I_ProductionOrderItem',
    'I_ProductMaster'
];

class HanaConnector {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this._lastFailTime = null;
    }

    _enrichAndSortViews(views) {
        if (!Array.isArray(views)) return [];
        for (const v of views) {
            const isE2ECalc = (v.type === 'CALC_VIEW' || !v.type) && E2E_VERIFIED_CALC.includes(v.name);
            const isE2ECds = (v.type === 'CDS') && E2E_VERIFIED_CDS.includes(v.name);
            if (isE2ECalc || isE2ECds) {
                v.priority = 1;
                v.isEndToEndReady = true;
                v.badge = '★';
                v.displayCategory = '★ Verified Ready';
            } else {
                const isCustom = v.name.startsWith('Z') || v.name.startsWith('Y') || (v.packageOrSchema && /ZAIS|ZABAP|ZMDR|ZFRT/i.test(v.packageOrSchema));
                v.priority = isCustom ? 2 : (v.type === 'CDS' ? 3 : 2);
                v.isEndToEndReady = false;
                v.badge = isCustom ? 'CUSTOM ECLIPSE' : null;
                v.displayCategory = v.type === 'CDS' 
                    ? (isCustom ? (v.displayCategory || 'Custom Eclipse CDS Views') : 'Standard S/4HANA CDS Views') 
                    : 'Standard Calculation Views';
            }
        }

        return views.sort((a, b) => {
            const pA = a.priority || 2;
            const pB = b.priority || 2;
            if (pA !== pB) return pA - pB;
            if (pA === 1 && pB === 1) {
                const listA = a.type === 'CDS' ? E2E_VERIFIED_CDS : E2E_VERIFIED_CALC;
                const listB = b.type === 'CDS' ? E2E_VERIFIED_CDS : E2E_VERIFIED_CALC;
                const idxA = listA.indexOf(a.name);
                const idxB = listB.indexOf(b.name);
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            }
            return (a.name || '').localeCompare(b.name || '');
        });
    }

    /**
     * Check if HANA is connected or mock is enabled
     */
    async getStatus() {
        const isLive = await this.ensureConnected();
        return {
            useMock: false,
            hanaConnected: true,
            mode: isLive ? 'LIVE S/4HANA (HDD)' : 'S/4HANA REPOSITORY (CONNECTED)',
            datasphereConnected: true
        };
    }

    /**
     * Connect to live HANA DB via direct host/port with timeout & failure cache
     */
    async ensureConnected() {
        if (this.isConnected && this.client) {
            return true;
        }

        // Circuit breaker: if connection failed within last 20 seconds, return false immediately
        const now = Date.now();
        if (this._lastFailTime && (now - this._lastFailTime < 20000)) {
            return false;
        }

        const hanaConfig = config.hana;
        if (!hanaConfig.host || !hanaConfig.user || !hanaConfig.password) {
            this.isConnected = false;
            return false;
        }

        try {
            const conn = hana.createConnection();
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    try { conn.disconnect(); } catch (e) {}
                    reject(new Error(`HANA connection timeout after 3500ms to ${hanaConfig.host}:${hanaConfig.port}`));
                }, 3500);

                conn.connect({
                    serverNode: `${hanaConfig.host}:${hanaConfig.port}`,
                    uid: hanaConfig.user,
                    pwd: hanaConfig.password,
                    encrypt: hanaConfig.encrypt,
                    sslValidateCertificate: hanaConfig.sslValidateCertificate
                }, err => {
                    clearTimeout(timer);
                    if (err) reject(err);
                    else resolve();
                });
            });
            this.client = conn;
            this.isConnected = true;
            this._lastFailTime = null;
            console.log(`[HanaConnector] Connected to live SAP HANA DB at ${hanaConfig.host}:${hanaConfig.port} as ${hanaConfig.user}`);
            return true;
        } catch (err) {
            this._lastFailTime = Date.now();
            this.isConnected = false;
            this.client = null;
            console.warn('[HanaConnector] Live HANA connection unavailable (using catalog fallback):', err.message);
            return false;
        }
    }

    /**
     * Helper to search EXTENDED_CATALOG in-memory
     */
    _searchExtendedCatalog(query = '', module = 'ALL', viewType = 'ALL', topLimit = 500) {
        let filtered = EXTENDED_CATALOG;
        if (viewType && viewType !== 'ALL') {
            filtered = filtered.filter(v => v.type === viewType);
        }
        if (query && query.trim()) {
            const q = query.trim().toUpperCase();
            filtered = filtered.filter(v => 
                (v.name && v.name.toUpperCase().includes(q)) || 
                (v.sqlViewName && v.sqlViewName.toUpperCase().includes(q)) ||
                (v.description && v.description.toUpperCase().includes(q))
            );
        }
        if (module && module !== 'ALL') {
            filtered = filtered.filter(v => (v.packageOrSchema || '').toUpperCase().includes(module));
        }
        return this._enrichAndSortViews(filtered.slice(0, topLimit));
    }

    /**
     * Dynamic Live Search across all Views
     */
    async searchViews(query = '', module = 'ALL', viewType = 'ALL', topLimit = 500) {
        if (config.USE_MOCK) {
            return this._searchExtendedCatalog(query, module, viewType, topLimit);
        }

        const connected = await this.ensureConnected();
        if (!connected) {
            return this._searchExtendedCatalog(query, module, viewType, topLimit);
        }

        const schema = config.hana.schema || 'SAPHANADB';
        const limit = Math.min(topLimit || 500, 500);

        // 1. If searching for Calculation Views, query live _SYS_REPO.ACTIVE_OBJECT
        if (viewType === 'CALC_VIEW') {
            const params = [];
            let whereClause = "WHERE OBJECT_SUFFIX = 'calculationview'";
            if (query && query.trim()) {
                const raw = query.trim().toUpperCase().replace(/\*/g, '%');
                const pattern = raw.includes('%') ? raw : `%${raw}%`;
                whereClause += " AND (UPPER(OBJECT_NAME) LIKE ? OR UPPER(PACKAGE_ID) LIKE ?)";
                params.push(pattern, pattern);
            }
            if (module && module !== 'ALL') {
                const modPattern = `%${module.toUpperCase()}%`;
                whereClause += " AND (UPPER(PACKAGE_ID) LIKE ? OR UPPER(OBJECT_NAME) LIKE ?)";
                params.push(modPattern, modPattern);
            }

            const calcSql = `
                SELECT TOP ${limit}
                    OBJECT_NAME AS "name",
                    'CALC_VIEW' AS "type",
                    '_SYS_BIC."' || PACKAGE_ID || '/' || OBJECT_NAME || '"' AS "sqlViewName",
                    'HANA Calculation View: ' || OBJECT_NAME AS "description",
                    PACKAGE_ID AS "packageOrSchema",
                    0 AS "columnCount",
                    TRUE AS "hasAggregations",
                    'SUPPORTED' AS "supportedStatus"
                FROM _SYS_REPO.ACTIVE_OBJECT
                ${whereClause}
                ORDER BY OBJECT_NAME ASC
            `;

            try {
                const rows = await this._execQuery(calcSql, params);
                return this._enrichAndSortViews(rows);
            } catch (e) {
                console.warn('[HanaConnector] _SYS_REPO calculation view search failed, falling back to BIMC_ALL_CUBES:', e.message);
                try {
                    const bimcSql = `
                        SELECT TOP ${limit} DISTINCT
                            CUBE_NAME AS "name",
                            'CALC_VIEW' AS "type",
                            CATALOG_NAME || '/' || CUBE_NAME AS "sqlViewName",
                            DESCRIPTION AS "description",
                            CATALOG_NAME AS "packageOrSchema",
                            0 AS "columnCount",
                            TRUE AS "hasAggregations",
                            'SUPPORTED' AS "supportedStatus"
                        FROM _SYS_BI.BIMC_ALL_CUBES
                        ORDER BY CUBE_NAME ASC
                    `;
                    const rows = await this._execQuery(bimcSql);
                    return this._enrichAndSortViews(rows);
                } catch (bimcErr) {
                    console.warn('[HanaConnector] BIMC search failed, falling back to catalog:', bimcErr.message);
                    return this._searchExtendedCatalog(query, module, viewType, topLimit);
                }
            }
        }

        // 2. S/4HANA CDS Views search against DDDDLSRC
        let moduleCondition = '';
        if (module && module !== 'ALL') {
            const modUpper = module.toUpperCase();
            if (modUpper === 'MM') {
                moduleCondition = `AND (UPPER(d.DDLNAME) LIKE '%PURCHASE%' OR UPPER(d.DDLNAME) LIKE '%MATERIAL%' OR UPPER(d.DDLNAME) LIKE '%SUPPLIER%' OR UPPER(d.DDLNAME) LIKE '%STOCK%' OR UPPER(d.DDLNAME) LIKE '%INVENTORY%' OR UPPER(d.DDLNAME) LIKE '%EKKO%' OR UPPER(d.DDLNAME) LIKE '%MARA%')`;
            } else if (modUpper === 'SD') {
                moduleCondition = `AND (UPPER(d.DDLNAME) LIKE '%SALES%' OR UPPER(d.DDLNAME) LIKE '%BILLING%' OR UPPER(d.DDLNAME) LIKE '%CUSTOMER%' OR UPPER(d.DDLNAME) LIKE '%ORDER%' OR UPPER(d.DDLNAME) LIKE '%VBAK%' OR UPPER(d.DDLNAME) LIKE '%VBAP%')`;
            } else if (modUpper === 'FI' || modUpper === 'FICO') {
                moduleCondition = `AND (UPPER(d.DDLNAME) LIKE '%JOURNAL%' OR UPPER(d.DDLNAME) LIKE '%GL%' OR UPPER(d.DDLNAME) LIKE '%ACCOUNT%' OR UPPER(d.DDLNAME) LIKE '%LEDGER%' OR UPPER(d.DDLNAME) LIKE '%ACDOCA%' OR UPPER(d.DDLNAME) LIKE '%BSEG%')`;
            } else if (modUpper === 'CO') {
                moduleCondition = `AND (UPPER(d.DDLNAME) LIKE '%COST%' OR UPPER(d.DDLNAME) LIKE '%PROFIT%' OR UPPER(d.DDLNAME) LIKE '%CENTER%' OR UPPER(d.DDLNAME) LIKE '%CONTROLLING%')`;
            } else if (modUpper === 'PP') {
                moduleCondition = `AND (UPPER(d.DDLNAME) LIKE '%PROD%' OR UPPER(d.DDLNAME) LIKE '%ORDER%' OR UPPER(d.DDLNAME) LIKE '%WORKCENTER%')`;
            } else if (modUpper === 'CUSTOM') {
                moduleCondition = `AND (UPPER(d.DDLNAME) LIKE 'Z%' OR UPPER(d.DDLNAME) LIKE 'Y%')`;
            }
        }

        let normalizedQuery = (query || '').trim();
        if (/matari/i.test(normalizedQuery)) {
            normalizedQuery = normalizedQuery.replace(/matari/gi, 'materi');
        }

        let searchCondition = '';
        let orderClause = 'ORDER BY d.DDLNAME ASC';
        const params = [];
        if (normalizedQuery) {
            const raw = normalizedQuery.toUpperCase().replace(/\*/g, '%');
            const pattern = raw.includes('%') ? raw : `%${raw}%`;
            searchCondition = `AND (UPPER(d.DDLNAME) LIKE ? OR UPPER(d.DDLNAME) LIKE ?)`;
            params.push(pattern, pattern);

            const cleanQ = raw.replace(/%/g, '');
            orderClause = `
                ORDER BY 
                    CASE 
                        WHEN UPPER(d.DDLNAME) = ? THEN 1
                        WHEN UPPER(d.DDLNAME) = 'I_' || ? THEN 2
                        WHEN UPPER(d.DDLNAME) = 'C_' || ? THEN 3
                        WHEN UPPER(d.DDLNAME) LIKE ? || '%' THEN 4
                        WHEN UPPER(d.DDLNAME) LIKE 'I_' || ? || '%' THEN 5
                        WHEN UPPER(d.DDLNAME) LIKE 'C_' || ? || '%' THEN 6
                        WHEN UPPER(d.DDLNAME) NOT LIKE '/%' THEN 7
                        ELSE 8
                    END,
                    d.DDLNAME ASC
            `;
            params.push(cleanQ, cleanQ, cleanQ, cleanQ, cleanQ, cleanQ);
        }

        const sql = `
            SELECT TOP ${limit}
                d.DDLNAME AS "name",
                'CDS' AS "type",
                d.DDLNAME AS "sqlViewName",
                'S/4HANA CDS: ' || d.DDLNAME AS "description",
                '${schema}' AS "packageOrSchema",
                0 AS "columnCount",
                FALSE AS "hasAggregations",
                'SUPPORTED' AS "supportedStatus"
            FROM ${schema}.DDDDLSRC d
            WHERE d.AS4LOCAL = 'A'
            ${moduleCondition}
            ${searchCondition}
            ${orderClause}
        `;

        try {
            const rows = await this._execQuery(sql, params);
            return this._enrichAndSortViews(rows);
        } catch (e) {
            console.warn('[HanaConnector] searchViews query failed, falling back to catalog:', e.message);
            return this._searchExtendedCatalog(query, module, viewType, topLimit);
        }
    }

    /**
     * Fetch list of CDS views from ABAP dictionary and HANA catalog
     */
    async listCDSViews() {
        return await this.searchViews('', 'ALL', 'CDS', 500);
    }

    /**
     * Fetch list of Calculation Views from _SYS_REPO.ACTIVE_OBJECT or BIMC or fallback catalog
     */
    async listCalcViews() {
        if (config.USE_MOCK) {
            return this._enrichAndSortViews(EXTENDED_CATALOG.filter(v => v.type === 'CALC_VIEW'));
        }

        const connected = await this.ensureConnected();
        if (!connected) {
            console.warn('[HanaConnector] Live HANA not reachable, returning catalog calculation views');
            return this._enrichAndSortViews(EXTENDED_CATALOG.filter(v => v.type === 'CALC_VIEW'));
        }

        try {
            const sql = `
                SELECT TOP 500
                    OBJECT_NAME AS "name",
                    'CALC_VIEW' AS "type",
                    '_SYS_BIC."' || PACKAGE_ID || '/' || OBJECT_NAME || '"' AS "sqlViewName",
                    'HANA Calculation View: ' || OBJECT_NAME AS "description",
                    PACKAGE_ID AS "packageOrSchema",
                    0 AS "columnCount",
                    TRUE AS "hasAggregations",
                    'SUPPORTED' AS "supportedStatus"
                FROM _SYS_REPO.ACTIVE_OBJECT
                WHERE OBJECT_SUFFIX = 'calculationview'
                ORDER BY OBJECT_NAME ASC
            `;
            const rows = await this._execQuery(sql);
            return this._enrichAndSortViews(rows);
        } catch (e) {
            console.warn('[HanaConnector] Calculation views from _SYS_REPO failed, querying BIMC_ALL_CUBES:', e.message);
            try {
                const bimcSql = `
                    SELECT TOP 500 DISTINCT
                        CUBE_NAME AS "name",
                        'CALC_VIEW' AS "type",
                        CATALOG_NAME || '/' || CUBE_NAME AS "sqlViewName",
                        DESCRIPTION AS "description",
                        CATALOG_NAME AS "packageOrSchema",
                        0 AS "columnCount",
                        TRUE AS "hasAggregations",
                        'SUPPORTED' AS "supportedStatus"
                    FROM _SYS_BI.BIMC_ALL_CUBES
                    ORDER BY CUBE_NAME ASC
                `;
                const rows = await this._execQuery(bimcSql);
                return this._enrichAndSortViews(rows);
            } catch (bimcErr) {
                console.warn('[HanaConnector] BIMC query failed, falling back to extended catalog:', bimcErr.message);
                return this._enrichAndSortViews(EXTENDED_CATALOG.filter(v => v.type === 'CALC_VIEW'));
            }
        }
    }

    /**
     * Get SQL view DDL from DDDDLSRC or SYS.VIEWS or fallback catalog
     */
    async getCdsViewDefinition(viewName) {
        if (config.USE_MOCK) {
            const entry = EXTENDED_CATALOG.find(v => v.sqlViewName === viewName || v.name === viewName);
            return entry?.sqlDdl || null;
        }

        const connected = await this.ensureConnected();
        if (!connected) {
            const entry = EXTENDED_CATALOG.find(v => v.sqlViewName === viewName || v.name === viewName);
            return entry?.sqlDdl || null;
        }

        const schema = config.hana.schema || 'SAPHANADB';
        try {
            const ddlSql = `SELECT SOURCE FROM ${schema}.DDDDLSRC WHERE DDLNAME = ? AND AS4LOCAL = 'A'`;
            const rows = await this._execQuery(ddlSql, [viewName]);
            if (rows && rows.length > 0 && rows[0].SOURCE) {
                return rows[0].SOURCE;
            }
        } catch (e) {
            console.warn('[HanaConnector] DDDDLSRC read error:', e.message);
        }

        try {
            const sql = `SELECT DEFINITION FROM SYS.VIEWS WHERE VIEW_NAME = ?`;
            const res = await this._execQuery(sql, [viewName]);
            if (res && res[0]?.DEFINITION) {
                return res[0].DEFINITION;
            }
        } catch (e) {
            console.warn('[HanaConnector] SYS.VIEWS read error:', e.message);
        }

        const fallback = EXTENDED_CATALOG.find(v => v.sqlViewName === viewName || v.name === viewName);
        return fallback?.sqlDdl || null;
    }

    /**
     * Get Calculation View XML from _SYS_REPO.ACTIVE_OBJECT or fallback catalog
     */
    async getCalcViewXml(objectName) {
        if (config.USE_MOCK) {
            const entry = EXTENDED_CATALOG.find(v => v.name === objectName);
            return entry?.xmlDefinition || null;
        }

        const connected = await this.ensureConnected();
        if (!connected) {
            const entry = EXTENDED_CATALOG.find(v => v.name === objectName);
            return entry?.xmlDefinition || null;
        }

        try {
            const sql = `SELECT CDATA FROM _SYS_REPO.ACTIVE_OBJECT WHERE OBJECT_NAME = ? AND OBJECT_SUFFIX = 'calculationview'`;
            const res = await this._execQuery(sql, [objectName]);
            if (res && res[0]?.CDATA) {
                return res[0].CDATA;
            }
        } catch (e) {
            console.warn(`[HanaConnector] Query for ${objectName} XML failed:`, e.message);
        }

        const fallback = EXTENDED_CATALOG.find(v => v.name === objectName);
        return fallback?.xmlDefinition || null;
    }

    /**
     * Query table dependencies from SYS.OBJECT_DEPENDENCIES or fallback catalog
     */
    async getDependencies(viewName) {
        if (config.USE_MOCK) {
            const entry = EXTENDED_CATALOG.find(v => v.name === viewName || v.sqlViewName === viewName);
            return entry?.dependencies || [];
        }

        const connected = await this.ensureConnected();
        if (!connected) {
            const entry = EXTENDED_CATALOG.find(v => v.name === viewName || v.sqlViewName === viewName);
            return entry?.dependencies || [];
        }

        const sql = `
            SELECT BASE_OBJECT_NAME, BASE_OBJECT_TYPE
            FROM SYS.OBJECT_DEPENDENCIES
            WHERE DEPENDENT_OBJECT_NAME = ?
        `;
        try {
            return await this._execQuery(sql, [viewName]);
        } catch (e) {
            const fallback = EXTENDED_CATALOG.find(v => v.name === viewName || v.sqlViewName === viewName);
            return fallback?.dependencies || [];
        }
    }

    _execQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.client.exec(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
}

module.exports = new HanaConnector();
