const hana = require('@sap/hana-client');
const config = require('./config');
const { EXTENDED_CATALOG } = require('../fixtures/extended-catalog');

class HanaConnector {
    constructor() {
        this.client = null;
        this.isConnected = false;
    }

    /**
     * Check if HANA is connected or mock is enabled
     */
    async getStatus() {
        if (config.USE_MOCK) {
            return {
                useMock: true,
                hanaConnected: true,
                mode: 'MOCK DATA',
                datasphereConnected: true
            };
        }

        const isLive = await this.ensureConnected();
        return {
            useMock: false,
            hanaConnected: isLive,
            mode: isLive ? 'LIVE S/4HANA (HDD)' : 'DISCONNECTED',
            datasphereConnected: true
        };
    }

    /**
     * Connect to live HANA DB via direct host/port
     */
    async ensureConnected() {
        if (this.isConnected && this.client) {
            return true;
        }

        const hanaConfig = config.hana;
        if (!hanaConfig.host || !hanaConfig.user || !hanaConfig.password) {
            this.isConnected = false;
            return false;
        }

        try {
            const conn = hana.createConnection();
            await new Promise((resolve, reject) => {
                conn.connect({
                    serverNode: `${hanaConfig.host}:${hanaConfig.port}`,
                    uid: hanaConfig.user,
                    pwd: hanaConfig.password,
                    encrypt: hanaConfig.encrypt,
                    sslValidateCertificate: hanaConfig.sslValidateCertificate
                }, err => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            this.client = conn;
            this.isConnected = true;
            console.log(`[HanaConnector] Connected to live SAP HANA DB at ${hanaConfig.host}:${hanaConfig.port} as ${hanaConfig.user}`);
            return true;
        } catch (err) {
            console.error('[HanaConnector] Live HANA connection failed:', err.message);
            this.isConnected = false;
            return false;
        }
    }

    /**
     * Dynamic Live Search across all 120k+ Views
     * @param {string} query Search text (wildcard supported)
     * @param {string} module Optional filter ('MM', 'SD', 'FI', 'CO', 'PP', 'CUSTOM', 'ALL')
     * @param {string} viewType 'CDS', 'CALC_VIEW', or 'ALL'
     * @param {number} topLimit Max results to return (default: 80)
     */
    async searchViews(query = '', module = 'ALL', viewType = 'ALL', topLimit = 80) {
        if (config.USE_MOCK) {
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
            return filtered.slice(0, topLimit);
        }

        const connected = await this.ensureConnected();
        if (!connected) {
            throw new Error('Live HANA DB is not reachable.');
        }

        const schema = config.hana.schema || 'SAPHANADB';
        const limit = Math.min(topLimit || 80, 200);

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
                return await this._execQuery(calcSql, params);
            } catch (e) {
                console.warn('[HanaConnector] _SYS_REPO calculation view search failed, falling back to BIMC_ALL_CUBES:', e.message);
                const bimcSql = `
                    SELECT DISTINCT TOP ${limit}
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
                return await this._execQuery(bimcSql);
            }
        }

        // 2. S/4HANA CDS Views search against DDDDLSRC
        // Build module filter clause
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

        // Build text search clause
        let searchCondition = '';
        const params = [];
        if (query && query.trim()) {
            const raw = query.trim().toUpperCase().replace(/\*/g, '%');
            const pattern = raw.includes('%') ? raw : `%${raw}%`;
            searchCondition = `AND (UPPER(d.DDLNAME) LIKE ? OR UPPER(d.DDLNAME) LIKE ?)`;
            params.push(pattern, pattern);
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
            ORDER BY d.DDLNAME ASC
        `;

        try {
            return await this._execQuery(sql, params);
        } catch (e) {
            console.error('[HanaConnector] searchViews query error:', e.message);
            return [];
        }
    }

    /**
     * Fetch list of CDS views from ABAP dictionary and HANA catalog
     */
    async listCDSViews() {
        return await this.searchViews('', 'ALL', 'CDS', 100);
    }

    /**
     * Fetch list of Calculation Views from _SYS_REPO.ACTIVE_OBJECT or BIMC
     */
    async listCalcViews() {
        if (config.USE_MOCK) {
            return EXTENDED_CATALOG.filter(v => v.type === 'CALC_VIEW');
        }

        const connected = await this.ensureConnected();
        if (!connected) {
            throw new Error('Cannot list Calculation views: Live HANA DB connection is not reachable.');
        }

        try {
            const sql = `
                SELECT TOP 200
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
            return await this._execQuery(sql);
        } catch (e) {
            console.warn('[HanaConnector] Calculation views from _SYS_REPO failed, querying BIMC_ALL_CUBES:', e.message);
            const bimcSql = `
                SELECT DISTINCT TOP 200
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
            return await this._execQuery(bimcSql);
        }
    }

    /**
     * Get SQL view DDL from DDDDLSRC or SYS.VIEWS
     */
    async getCdsViewDefinition(viewName) {
        if (config.USE_MOCK) {
            const entry = EXTENDED_CATALOG.find(v => v.sqlViewName === viewName || v.name === viewName);
            return entry?.sqlDdl || null;
        }

        const connected = await this.ensureConnected();
        if (!connected) {
            throw new Error(`Cannot get CDS view definition: Live HANA DB connection is not configured.`);
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

        const sql = `SELECT DEFINITION FROM SYS.VIEWS WHERE VIEW_NAME = ?`;
        const res = await this._execQuery(sql, [viewName]);
        return res[0]?.DEFINITION || null;
    }

    /**
     * Get Calculation View XML from _SYS_REPO.ACTIVE_OBJECT
     */
    async getCalcViewXml(objectName) {
        if (config.USE_MOCK) {
            const entry = EXTENDED_CATALOG.find(v => v.name === objectName);
            return entry?.xmlDefinition || null;
        }

        const connected = await this.ensureConnected();
        if (!connected) {
            throw new Error(`Cannot get Calculation view XML: Live HANA DB connection is not configured.`);
        }

        const sql = `SELECT CDATA FROM _SYS_REPO.ACTIVE_OBJECT WHERE OBJECT_NAME = ? AND OBJECT_SUFFIX = 'calculationview'`;
        const res = await this._execQuery(sql, [objectName]);
        return res[0]?.CDATA || null;
    }

    /**
     * Query table dependencies from SYS.OBJECT_DEPENDENCIES
     */
    async getDependencies(viewName) {
        if (config.USE_MOCK) {
            const entry = EXTENDED_CATALOG.find(v => v.name === viewName || v.sqlViewName === viewName);
            return entry?.dependencies || [];
        }

        const connected = await this.ensureConnected();
        if (!connected) return [];

        const sql = `
            SELECT BASE_OBJECT_NAME, BASE_OBJECT_TYPE
            FROM SYS.OBJECT_DEPENDENCIES
            WHERE DEPENDENT_OBJECT_NAME = ?
        `;
        try {
            return await this._execQuery(sql, [viewName]);
        } catch (e) {
            return [];
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
