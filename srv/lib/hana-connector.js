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
            mode: isLive ? 'LIVE HANA' : 'DISCONNECTED',
            datasphereConnected: true
        };
    }

    /**
     * Connect to live HANA DB via direct host/port or BTP Destination
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
            return true;
        } catch (err) {
            console.error('[HanaConnector] Live HANA connection failed:', err.message);
            this.isConnected = false;
            return false;
        }
    }

    /**
     * Fetch list of CDS views from ABAP dictionary and HANA catalog
     */
    async listCDSViews() {
        if (config.USE_MOCK) {
            return EXTENDED_CATALOG.filter(v => v.type === 'CDS');
        }

        const connected = await this.ensureConnected();
        if (!connected) {
            throw new Error('Cannot list CDS views: Live HANA DB connection is not configured or unreachable.');
        }

        const sql = `
            SELECT 
                d.DDLNAME AS "name",
                'CDS' AS "type",
                v.VIEW_NAME AS "sqlViewName",
                d.DDTEXT AS "description",
                d.DEVCLASS AS "packageOrSchema",
                (SELECT COUNT(*) FROM SYS.VIEW_COLUMNS c WHERE c.VIEW_NAME = v.VIEW_NAME AND c.SCHEMA_NAME = v.SCHEMA_NAME) AS "columnCount",
                FALSE AS "hasAggregations",
                'SUPPORTED' AS "supportedStatus"
            FROM SAPABAP1.DDDDLSRC d
            LEFT JOIN SYS.VIEWS v ON v.VIEW_NAME = d.VIEWNAME
            WHERE d.AS4LOCAL = 'A'
            ORDER BY d.DDLNAME ASC
            LIMIT 200
        `;

        return await this._execQuery(sql);
    }

    /**
     * Fetch list of Calculation Views from _SYS_REPO.ACTIVE_OBJECT
     */
    async listCalcViews() {
        if (config.USE_MOCK) {
            return EXTENDED_CATALOG.filter(v => v.type === 'CALC_VIEW');
        }

        const connected = await this.ensureConnected();
        if (!connected) {
            throw new Error('Cannot list Calculation views: Live HANA DB connection is not configured or unreachable.');
        }

        const sql = `
            SELECT 
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
            LIMIT 200
        `;

        return await this._execQuery(sql);
    }

    /**
     * Get SQL view DDL from SYS.VIEWS
     */
    async getCdsViewDefinition(sqlViewName) {
        if (config.USE_MOCK) {
            const entry = EXTENDED_CATALOG.find(v => v.sqlViewName === sqlViewName || v.name === sqlViewName);
            return entry?.sqlDdl || null;
        }

        const connected = await this.ensureConnected();
        if (!connected) {
            throw new Error(`Cannot get CDS view definition: Live HANA DB connection is not configured.`);
        }

        const sql = `SELECT DEFINITION FROM SYS.VIEWS WHERE VIEW_NAME = ?`;
        const res = await this._execQuery(sql, [sqlViewName]);
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
        return await this._execQuery(sql, [viewName]);
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
