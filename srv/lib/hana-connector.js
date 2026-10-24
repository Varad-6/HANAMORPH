const hana = require('@sap/hana-client');
const { EXTENDED_CATALOG } = require('../fixtures/extended-catalog');

class HanaConnector {
    constructor() {
        this.client = null;
        this.isConnected = false;
    }

    /**
     * Connect to live HANA DB via direct host/port or BTP Destination
     * @param {object} connectionParams 
     */
    async connect(connectionParams = {}) {
        const host = connectionParams.host || process.env.HANA_HOST;
        const port = connectionParams.port || process.env.HANA_PORT;
        const user = connectionParams.user || process.env.HANA_USER;
        const password = connectionParams.password || process.env.HANA_PASSWORD;

        if (!host || !port || !user || !password) {
            this.isConnected = false;
            return false;
        }

        try {
            const conn = hana.createConnection();
            await new Promise((resolve, reject) => {
                conn.connect({
                    serverNode: `${host}:${port}`,
                    uid: user,
                    pwd: password,
                    encrypt: connectionParams.encrypt || true,
                    sslValidateCertificate: connectionParams.sslValidateCertificate || false
                }, err => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            this.client = conn;
            this.isConnected = true;
            return true;
        } catch (err) {
            console.warn('[HanaConnector] Live HANA connection failed, using local/fallback mode:', err.message);
            this.isConnected = false;
            return false;
        }
    }

    /**
     * Fetch list of CDS views from ABAP dictionary and HANA catalog
     */
    async listCDSViews() {
        if (!this.isConnected) {
            return EXTENDED_CATALOG.filter(v => v.type === 'CDS');
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
            LIMIT 100
        `;

        return await this._execQuery(sql);
    }

    /**
     * Fetch list of Calculation Views from _SYS_REPO.ACTIVE_OBJECT
     */
    async listCalcViews() {
        if (!this.isConnected) {
            return EXTENDED_CATALOG.filter(v => v.type === 'CALC_VIEW');
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
            LIMIT 100
        `;

        return await this._execQuery(sql);
    }

    /**
     * Get SQL view DDL from SYS.VIEWS
     */
    async getCdsViewDefinition(sqlViewName) {
        if (!this.isConnected) {
            const entry = EXTENDED_CATALOG.find(v => v.sqlViewName === sqlViewName || v.name === sqlViewName);
            return entry?.sqlDdl || null;
        }

        const sql = `SELECT DEFINITION FROM SYS.VIEWS WHERE VIEW_NAME = ?`;
        const res = await this._execQuery(sql, [sqlViewName]);
        return res[0]?.DEFINITION || null;
    }

    /**
     * Get Calculation View XML from _SYS_REPO.ACTIVE_OBJECT
     */
    async getCalcViewXml(objectName, packageId) {
        if (!this.isConnected) {
            const entry = EXTENDED_CATALOG.find(v => v.name === objectName);
            return entry?.xmlDefinition || null;
        }

        const sql = `SELECT CDATA FROM _SYS_REPO.ACTIVE_OBJECT WHERE OBJECT_NAME = ? AND OBJECT_SUFFIX = 'calculationview'`;
        const res = await this._execQuery(sql, [objectName]);
        return res[0]?.CDATA || null;
    }

    /**
     * Query table dependencies from SYS.OBJECT_DEPENDENCIES
     */
    async getDependencies(viewName) {
        if (!this.isConnected) {
            const entry = EXTENDED_CATALOG.find(v => v.name === viewName || v.sqlViewName === viewName);
            return entry?.dependencies || [];
        }

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
