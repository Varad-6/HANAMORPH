const { XMLParser } = require('fast-xml-parser');
const config = require('./config');
const { EXTENDED_CATALOG } = require('../fixtures/extended-catalog');
const hanaConnector = require('./hana-connector');

class ExtractService {
    constructor() {
        this.xmlParser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_'
        });
    }

    /**
     * Extract CDS View definition into the common internal model
     * @param {string} viewName 
     */
    async extractCDS(viewName) {
        let ddl = null;
        let sqlViewName = viewName;

        if (config.USE_MOCK) {
            const view = EXTENDED_CATALOG.find(v => v.name === viewName || v.sqlViewName === viewName);
            ddl = view?.sqlDdl;
            sqlViewName = view?.sqlViewName || viewName;
        } else {
            ddl = await hanaConnector.getCdsViewDefinition(viewName);
        }

        if (!ddl) {
            throw new Error(`CDS View '${viewName}' definition could not be resolved from catalog.`);
        }

        return this._parseCdsDdl(viewName, ddl, sqlViewName);
    }

    /**
     * Extract Calculation View definition into the common internal model
     * @param {string} viewName 
     */
    async extractCalc(viewName) {
        let xmlDef = null;

        if (config.USE_MOCK) {
            const view = EXTENDED_CATALOG.find(v => v.name === viewName);
            xmlDef = view?.xmlDefinition;
        } else {
            xmlDef = await hanaConnector.getCalcViewXml(viewName);
        }

        if (!xmlDef) {
            throw new Error(`Calculation View '${viewName}' definition could not be resolved.`);
        }

        const parsedXml = this.xmlParser.parse(xmlDef);
        return this._parseCalcViewXml(viewName, parsedXml);
    }

    /**
     * Parse SQL DDL of CDS view into common AST
     */
    _parseCdsDdl(viewName, ddl, sqlViewName) {
        const selectMatch = ddl.match(/SELECT([\s\S]+?)FROM([\s\S]+)/i);
        if (!selectMatch) {
            throw new Error(`Unable to parse SELECT clause from DDL for view ${viewName}`);
        }

        const selectPart = selectMatch[1].trim();
        const fromPart = selectMatch[2].trim();

        const columns = selectPart.split(',').map(colStr => {
            const clean = colStr.trim();
            const asMatch = clean.match(/(?:(\w+)\.)?(\w+)\s+AS\s+(\w+)/i);
            if (asMatch) {
                return {
                    tableAlias: asMatch[1] || '',
                    sourceColumn: asMatch[2],
                    name: asMatch[3],
                    dataType: this._inferDataType(asMatch[2]),
                    isKey: this._isKeyColumn(asMatch[3])
                };
            }
            return {
                name: clean.replace(/"/g, ''),
                dataType: 'cds.String(40)',
                isKey: false
            };
        });

        const sources = [];
        const joins = [];

        const fromMatch = fromPart.match(/^"(\w+)"\s+(\w+)/i);
        if (fromMatch) {
            sources.push({
                tableName: fromMatch[1],
                alias: fromMatch[2],
                isBase: true
            });
        }

        const joinRegex = /(INNER JOIN|LEFT OUTER JOIN|RIGHT OUTER JOIN|FULL OUTER JOIN)\s+"(\w+)"\s+(\w+)\s+ON\s+([\w\s.="]+?)(?=(INNER JOIN|LEFT OUTER JOIN|RIGHT OUTER JOIN|FULL OUTER JOIN|$))/gi;
        let match;
        while ((match = joinRegex.exec(fromPart)) !== null) {
            const joinType = match[1].toUpperCase();
            const tableName = match[2];
            const alias = match[3];
            const onClause = match[4].trim();

            sources.push({ tableName, alias, isBase: false });
            joins.push({
                joinType,
                tableName,
                alias,
                onClause
            });
        }

        return {
            viewId: viewName,
            viewName: viewName,
            sqlViewName: sqlViewName,
            viewType: 'CDS',
            hasAggregations: false,
            sources,
            joins,
            columns,
            aggregations: []
        };
    }

    /**
     * Parse Calc View XML into common AST
     */
    _parseCalcViewXml(viewName, xmlObj) {
        const scenario = xmlObj['Calculation:scenario'] || xmlObj;
        const dataSources = scenario.dataSources?.DataSource || [];
        const dsList = Array.isArray(dataSources) ? dataSources : [dataSources];

        const sources = dsList.map(ds => ({
            tableName: ds.resourceUri || ds['@_id'],
            alias: ds['@_id'],
            isBase: true
        }));

        const calcViews = scenario.calculationViews?.calculationView || [];
        const cvList = Array.isArray(calcViews) ? calcViews : [calcViews];

        const joins = [];
        const aggregations = [];
        const columns = [];

        for (const cv of cvList) {
            const cvType = cv['@_xsi:type'] || '';
            if (cvType.includes('JoinView')) {
                joins.push({
                    joinType: cv.joinType || 'INNER',
                    inputs: cv.input,
                    joinAttribute: cv.joinAttribute?.['@_name'] || cv.joinAttribute
                });
            } else if (cvType.includes('AggregationView')) {
                const measures = cv.measures?.measure || [];
                const measureList = Array.isArray(measures) ? measures : [measures];
                for (const m of measureList) {
                    aggregations.push({
                        columnName: m['@_id'],
                        sourceColumn: m['@_sourceColumn'] || m['@_id'],
                        aggregationType: m['@_aggregationType'] || 'SUM'
                    });
                    columns.push({
                        name: m['@_id'],
                        dataType: 'cds.Decimal(15, 2)',
                        isMeasure: true,
                        aggregationType: m['@_aggregationType'] || 'SUM'
                    });
                }

                const viewAttrs = cv.viewAttributes?.viewAttribute || [];
                const attrList = Array.isArray(viewAttrs) ? viewAttrs : [viewAttrs];
                for (const a of attrList) {
                    columns.push({
                        name: a['@_id'],
                        dataType: 'cds.String(40)',
                        isMeasure: false,
                        isKey: true
                    });
                }
            }
        }

        return {
            viewId: viewName,
            viewName: viewName,
            sqlViewName: `_SYS_BIC."${viewName}"`,
            viewType: 'CALC_VIEW',
            hasAggregations: aggregations.length > 0,
            sources,
            joins,
            columns,
            aggregations
        };
    }

    _isKeyColumn(colName) {
        const lower = colName.toLowerCase();
        return lower.includes('client') ||
               lower.includes('mandt') ||
               lower.includes('item') ||
               lower.includes('document') ||
               lower.includes('belnr') ||
               lower.includes('ebeln') ||
               lower.includes('vbeln') ||
               lower.includes('gjahr') ||
               lower.includes('buzei') ||
               lower.includes('docln');
    }

    _inferDataType(columnName) {
        const col = columnName.toUpperCase();
        if (col.includes('DATE') || col.includes('AEDAT') || col.includes('BLDAT') || col.includes('BUDAT') || col.includes('FKDAT') || col.includes('GLTRP') || col.includes('GSTRP')) return 'cds.Date';
        if (col.includes('MENGE') || col.includes('NETPR') || col.includes('NETWR') || col.includes('AMOUNT') || col.includes('QUANTITY') || col.includes('WSL') || col.includes('HSL') || col.includes('WRBTR') || col.includes('LABST') || col.includes('LBKUM') || col.includes('SALK3') || col.includes('PSMNG') || col.includes('WEMNG') || col.includes('FKIMG') || col.includes('LFIMG')) return 'cds.Decimal(15, 2)';
        if (col.includes('ITEM') || col.includes('EBELP') || col.includes('POSNR') || col.includes('GJAHR') || col.includes('BUZEI') || col.includes('DOCLN')) return 'cds.Integer';
        if (col.includes('MANDT') || col.includes('RCLNT')) return 'cds.String(3)';
        return 'cds.String(40)';
    }
}

module.exports = new ExtractService();
