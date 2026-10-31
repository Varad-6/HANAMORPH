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
        let preloadedCols = null;

        if (config.USE_MOCK) {
            const view = EXTENDED_CATALOG.find(v => v.name === viewName || v.sqlViewName === viewName);
            ddl = view?.sqlDdl;
            sqlViewName = view?.sqlViewName || viewName;
            preloadedCols = view?.columns;
        } else {
            ddl = await hanaConnector.getCdsViewDefinition(viewName);
        }

        if (!ddl) {
            throw new Error(`CDS View '${viewName}' definition could not be resolved from catalog.`);
        }

        const model = this._parseCdsDdl(viewName, ddl, sqlViewName);
        if (preloadedCols && preloadedCols.length > 0) {
            model.columns = preloadedCols;
        }
        if (config.USE_MOCK) {
            const view = EXTENDED_CATALOG.find(v => v.name === viewName || v.sqlViewName === viewName);
            if (view?.dependencies) {
                model.dependencies = view.dependencies;
                if ((!model.sources || model.sources.length === 0) && view.dependencies.length > 0) {
                    model.sources = view.dependencies.map(d => ({
                        tableName: d.BASE_OBJECT_NAME,
                        alias: '',
                        isBase: true
                    }));
                }
            }
        }
        return model;
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
            throw new Error(`Calculation View '${viewName}' definition could not be resolved from HANA repository.`);
        }

        const parsedXml = this.xmlParser.parse(xmlDef);
        return this._parseCalcViewXml(viewName, parsedXml);
    }

    /**
     * Parse ABAP CDS DDL or SQL DDL of CDS view into common AST
     */
    _parseCdsDdl(viewName, ddl, sqlViewName) {
        // Strip ABAP internal metadata block /*+[internal] ... */
        const cleanDdl = ddl.replace(/\/\*\+\[internal\][\s\S]*?\*\//gi, '').trim();

        const hasJoins = /\bjoin\b/i.test(cleanDdl);
        const hasAssociations = /\bassociation\b/i.test(cleanDdl);

        // 1. Try ABAP CDS syntax: define [root] view [entity] <viewName> as select from <source> { <columns> }
        const abapCdsMatch = cleanDdl.match(/define\s+(?:root\s+)?view\s+(?:entity\s+)?([^\s{]+)[\s\S]*?as\s+select\s+from\s+([^\s{]+)[\s\S]*?\{([\s\S]+?)\}/i);
        if (abapCdsMatch) {
            const definedViewName = abapCdsMatch[1].trim();
            const sourceEntity = abapCdsMatch[2].trim().replace(/["\s]/g, '');
            const body = abapCdsMatch[3].trim();

            const columns = this._parseCdsColumns(body);
            let sources = [{ tableName: sourceEntity.toUpperCase(), alias: sourceEntity, isBase: true }];

            // If there's a join clause before the column block, extract all joined sources
            const fromSelectMatch = cleanDdl.match(/as\s+select\s+from\s+([\s\S]+?)\{/i);
            if (fromSelectMatch && hasJoins) {
                const multiSources = this._extractSources(fromSelectMatch[1]);
                if (multiSources.length > 0) {
                    sources = multiSources;
                }
            }

            const isGraphicalEligible = hasJoins || hasAssociations || sources.length > 1;

            return {
                name: definedViewName || viewName,
                target: sqlViewName || definedViewName || viewName,
                type: 'CDS',
                sources: sources,
                columns: columns,
                dependencies: sources.map(s => ({ BASE_OBJECT_NAME: s.tableName, BASE_OBJECT_TYPE: 'TABLE' })),
                hasJoins,
                hasAssociations,
                isGraphicalEligible,
                rawDdl: cleanDdl
            };
        }

        // 2. Try standard SQL DDL syntax: CREATE VIEW ... SELECT ... FROM ...
        const selectMatch = cleanDdl.match(/SELECT([\s\S]+?)FROM([\s\S]+)/i);
        if (selectMatch) {
            const selectPart = selectMatch[1].trim();
            const fromPart = selectMatch[2].trim();
            const columns = this._parseCdsColumns(selectPart);
            const sources = this._extractSources(fromPart);
            const isGraphicalEligible = hasJoins || hasAssociations || sources.length > 1;

            return {
                name: viewName,
                target: sqlViewName,
                type: 'CDS',
                sources: sources,
                columns: columns,
                dependencies: sources.map(s => ({ BASE_OBJECT_NAME: s.tableName, BASE_OBJECT_TYPE: 'TABLE' })),
                hasJoins,
                hasAssociations,
                isGraphicalEligible,
                rawDdl: cleanDdl
            };
        }

        throw new Error(`Unable to parse DDL syntax for view ${viewName}`);
    }

    _parseCdsColumns(columnBlock) {
        return columnBlock.split(',').map(colStr => {
            const clean = colStr.trim();
            if (!clean) return null;

            const isKey = /^\s*key\s+/i.test(clean);
            const expr = clean.replace(/^\s*key\s+/i, '').trim();

            const asMatch = expr.match(/(?:(?:"?([\w\/]+)"?)\.)?(?:"?([\w\/]+)"?)\s+AS\s+(?:"?([\w\/]+)"?)/i);
            if (asMatch) {
                const colName = asMatch[3].replace(/["\/]/g, '_');
                return {
                    tableAlias: asMatch[1] || '',
                    sourceColumn: asMatch[2],
                    name: colName,
                    originalName: asMatch[3],
                    dataType: this._inferDataType(asMatch[2]),
                    isKey: isKey || this._isKeyColumn(colName),
                    isMeasure: this._isMeasure(colName)
                };
            }

            const simpleCol = expr.split(/\s+/)[0].replace(/["\/]/g, '_');
            return {
                name: simpleCol,
                originalName: expr,
                dataType: this._inferDataType(simpleCol),
                isKey: isKey || this._isKeyColumn(simpleCol),
                isMeasure: this._isMeasure(simpleCol)
            };
        }).filter(Boolean);
    }

    _extractSources(fromClause) {
        const cleaned = fromClause.split(/WHERE|GROUP BY|ORDER BY|\{|\}/i)[0];
        const parts = cleaned.split(/\bJOIN\b|,/i);
        return parts.map(p => {
            const tokens = p.trim().replace(/\bON\b\s+[\s\S]*/i, '').trim().split(/\s+/);
            const raw = tokens[0] ? tokens[0].replace(/["\s]/g, '') : '';
            const tableName = raw.replace(/^(INNER|LEFT|RIGHT|OUTER|CROSS)$/i, '').trim();
            const alias = tokens[1] ? tokens[1].replace(/["\s]/g, '') : tableName;
            return { tableName: tableName.toUpperCase(), alias, isBase: true };
        }).filter(s => s.tableName && !['ON', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'AS', 'CROSS'].includes(s.tableName.toUpperCase()));
    }

    _inferDataType(colName) {
        const upper = (colName || '').toUpperCase();
        if (upper.includes('DATE') || upper.endsWith('_AT') || upper.endsWith('AEDAT') || upper.endsWith('ERDAT')) return 'cds.Date';
        if (upper.includes('TIME') || upper.endsWith('TIMESTAMP')) return 'cds.Timestamp';
        if (upper.includes('AMOUNT') || upper.includes('PRICE') || upper.includes('NETWR') || upper.includes('NETPR') || upper.includes('MENGE')) return 'cds.Decimal(15, 2)';
        if (upper.includes('QTY') || upper.includes('COUNT') || upper.includes('QUANTITY')) return 'cds.Integer';
        if (upper.includes('ID') || upper.includes('NUM') || upper.includes('KEY')) return 'cds.String(40)';
        return 'cds.String(100)';
    }

    _isKeyColumn(colName) {
        const upper = (colName || '').toUpperCase();
        return upper.endsWith('ID') || upper.endsWith('KEY') || upper.endsWith('NUM') || upper.includes('EBELN') || upper.includes('VBELN') || upper.includes('MATNR');
    }

    _isMeasure(colName) {
        const upper = (colName || '').toUpperCase();
        return upper.includes('AMOUNT') || upper.includes('PRICE') || upper.includes('QTY') || upper.includes('QUANTITY') || upper.includes('NETWR') || upper.includes('NETPR');
    }

    _parseCalcViewXml(viewName, xmlObj) {
        const scen = xmlObj['Calculation:scenario'] || xmlObj;
        const dataCategory = scen['@_dataCategory'] || 'CUBE';

        // 1. Extract Real DataSources
        const rawDs = scen.dataSources?.DataSource || [];
        const dsArray = Array.isArray(rawDs) ? rawDs : (rawDs ? [rawDs] : []);
        const sources = dsArray.map(d => ({
            tableName: d['@_id'],
            type: d['@_type'] || 'DATA_BASE_TABLE',
            isBase: true
        })).filter(s => s.tableName);

        // 2. Extract Calculation Nodes with exact types and inputs
        const calcNodes = scen.calculationViews?.calculationView || [];
        const nodeArray = Array.isArray(calcNodes) ? calcNodes : (calcNodes ? [calcNodes] : []);
        const nodes = nodeArray.map(n => {
            const rawType = n['@_xsi:type'] || n['@_type'] || '';
            return {
                id: n['@_id'],
                type: rawType.replace(/^Calculation:/, '').replace(/View$/, '').toUpperCase() || 'PROJECTION'
            };
        });

        // 3. Extract Columns from logicalModel (attributes + measures)
        const columns = [];
        const logicalAttrs = scen.logicalModel?.attributes?.attribute || [];
        const attrArray = Array.isArray(logicalAttrs) ? logicalAttrs : (logicalAttrs ? [logicalAttrs] : []);
        for (const attr of attrArray) {
            const name = attr['@_id'];
            if (!name) continue;
            columns.push({
                name: name,
                originalName: attr.descriptions?.['@_defaultDescription'] || name,
                dataType: this._inferDataType(name),
                isKey: attr['@_isKey'] === 'true' || attr['@_order'] === '1' || this._isKeyColumn(name),
                isMeasure: false
            });
        }

        const logicalMeasures = scen.logicalModel?.baseMeasures?.measure || [];
        const measArray = Array.isArray(logicalMeasures) ? logicalMeasures : (logicalMeasures ? [logicalMeasures] : []);
        for (const m of measArray) {
            const name = m['@_id'];
            if (!name) continue;
            columns.push({
                name: name,
                originalName: m.descriptions?.['@_defaultDescription'] || name,
                dataType: 'cds.Decimal(15, 2)',
                isKey: false,
                isMeasure: true
            });
        }

        // Fallback to viewAttributes if logicalModel was empty
        if (columns.length === 0) {
            const defaultNode = nodeArray.find(n => n['@_id'] === 'defaultView') || nodeArray[0];
            const viewAttributes = defaultNode?.viewAttributes?.viewAttribute || [];
            const attrsArray = Array.isArray(viewAttributes) ? viewAttributes : (viewAttributes ? [viewAttributes] : []);
            for (const attr of attrsArray) {
                const name = attr['@_id'];
                if (!name) continue;
                columns.push({
                    name: name,
                    originalName: name,
                    dataType: this._mapHanaTypeToCds(attr['@_datatype']),
                    isKey: attr['@_isKey'] === 'true' || this._isKeyColumn(name),
                    isMeasure: dataCategory === 'CUBE' && (attr['@_aggregationType'] || this._isMeasure(name))
                });
            }
        }

        const isGraphicalEligible = sources.length > 1 || nodes.length > 1;
        const pipelineSql = this._buildCalcViewPipeline(viewName, scen, nodeArray, sources);

        const sourceColumns = {};
        for (const n of nodeArray) {
            const rawInps = Array.isArray(n.input) ? n.input : (n.input ? [n.input] : []);
            for (const inp of rawInps) {
                const srcId = (inp['@_node'] || '').replace(/^#/, '');
                if (srcId) {
                    if (!sourceColumns[srcId]) sourceColumns[srcId] = [];
                    const rawMaps = Array.isArray(inp.mapping) ? inp.mapping : (inp.mapping ? [inp.mapping] : []);
                    for (const m of rawMaps) {
                        const colName = m['@_source'];
                        if (colName && !sourceColumns[srcId].find(c => c.name === colName)) {
                            sourceColumns[srcId].push({
                                name: colName,
                                originalName: colName,
                                dataType: this._inferDataType(colName),
                                isKey: this._isKeyColumn(colName)
                            });
                        }
                    }
                }
            }
        }

        const nodeInputMap = {};
        for (const n of nodeArray) {
            const id = n['@_id'];
            const inps = Array.isArray(n.input) ? n.input : (n.input ? [n.input] : []);
            nodeInputMap[id] = inps.map(i => (i['@_node'] || '').replace(/^#/, ''));
        }

        const resolveToPhysical = (nodeId) => {
            if (!nodeInputMap[nodeId] || nodeInputMap[nodeId].length === 0) return nodeId;
            return resolveToPhysical(nodeInputMap[nodeId][0]);
        };

        let joinInfo = null;
        const joinNodes = nodeArray.filter(n => (n['@_xsi:type'] || '').includes('JoinView'));
        if (joinNodes.length > 0) {
            const jn = joinNodes[0];
            const rawInputs = Array.isArray(jn.input) ? jn.input : (jn.input ? [jn.input] : []);
            const leftInput = (rawInputs[0]?.['@_node'] || '').replace(/^#/, '');
            const rightInput = (rawInputs[1]?.['@_node'] || '').replace(/^#/, '');
            const leftTable = resolveToPhysical(leftInput);
            const rightTable = resolveToPhysical(rightInput);
            const joinType = (jn['@_joinType'] || 'leftOuter').toUpperCase().includes('INNER') ? 'inner' : 'left';
            const rawAttrs = Array.isArray(jn.joinAttribute) ? jn.joinAttribute : (jn.joinAttribute ? [jn.joinAttribute] : []);
            const joinAttrs = rawAttrs.map(a => a['@_name']);

            joinInfo = {
                joinNodeId: jn['@_id'],
                leftTable,
                rightTable,
                joinType,
                joinAttrs
            };
        }

        // Build rich nodeHierarchy for multi-tier visual DAG in Datasphere
        const nodeHierarchy = [];
        const topNodeId = nodeArray.length > 0 ? nodeArray[nodeArray.length - 1]['@_id'] : null;

        for (const n of nodeArray) {
            const rawType = n['@_xsi:type'] || n['@_type'] || '';
            const nodeType = rawType.replace(/^Calculation:/, '').replace(/View$/, '').toUpperCase() || 'PROJECTION';
            const rawInps = Array.isArray(n.input) ? n.input : (n.input ? [n.input] : []);
            const inputNodes = rawInps.map(i => (i['@_node'] || '').replace(/^#/, ''));
            const mappings = [];
            for (const inp of rawInps) {
                const srcNode = (inp['@_node'] || '').replace(/^#/, '');
                const rawMaps = Array.isArray(inp.mapping) ? inp.mapping : (inp.mapping ? [inp.mapping] : []);
                for (const m of rawMaps) {
                    mappings.push({
                        inputNode: srcNode,
                        source: m['@_source'],
                        target: m['@_target'] || m['@_source']
                    });
                }
            }

            const rawJoinAttrs = Array.isArray(n.joinAttribute) ? n.joinAttribute : (n.joinAttribute ? [n.joinAttribute] : []);
            const joinAttrs = rawJoinAttrs.map(a => a['@_name']);

            const leftInp = rawInps[0];
            const rightInp = rawInps[1];
            const leftMaps = (Array.isArray(leftInp?.mapping) ? leftInp.mapping : [leftInp?.mapping]).filter(Boolean);
            const rightMaps = (Array.isArray(rightInp?.mapping) ? rightInp.mapping : [rightInp?.mapping]).filter(Boolean);

            const joinConditions = joinAttrs.map(attrName => {
                const lm = leftMaps.find(m => (m['@_target'] || m['@_source']) === attrName);
                const rm = rightMaps.find(m => (m['@_target'] || m['@_source']) === attrName);
                return {
                    targetAttr: attrName,
                    leftSource: lm ? lm['@_source'] : attrName,
                    rightSource: rm ? rm['@_source'] : attrName
                };
            });

            const rawCalcAttrs = n.calculatedViewAttributes?.calculatedViewAttribute || [];
            const calcAttrsList = Array.isArray(rawCalcAttrs) ? rawCalcAttrs : (rawCalcAttrs ? [rawCalcAttrs] : []);
            const calculatedAttributes = calcAttrsList.map(ca => ({
                id: ca['@_id'],
                dataType: ca['@_datatype'] || 'NVARCHAR',
                length: ca['@_length'] ? parseInt(ca['@_length'], 10) : undefined,
                scale: ca['@_scale'] ? parseInt(ca['@_scale'], 10) : undefined,
                precision: ca['@_precision'] ? parseInt(ca['@_precision'], 10) : undefined,
                formula: ca.formula || ''
            }));

            nodeHierarchy.push({
                id: n['@_id'],
                type: nodeType,
                inputs: inputNodes,
                isRoot: n['@_id'] === topNodeId,
                joinType: (n['@_joinType'] || 'leftOuter').toUpperCase().includes('INNER') ? 'INNER JOIN' : 'LEFT OUTER JOIN',
                joinAttributes: joinAttrs,
                joinConditions: joinConditions,
                calculatedAttributes: calculatedAttributes,
                mappings: mappings
            });
        }

        return {
            name: viewName,
            target: viewName,
            type: 'CALC_VIEW',
            dataCategory: dataCategory,
            columns: columns,
            sources: sources.length > 0 ? sources : [{ tableName: `${viewName}_SOURCE`, isBase: true }],
            dependencies: sources.map(s => ({ BASE_OBJECT_NAME: s.tableName, BASE_OBJECT_TYPE: s.type || 'TABLE' })),
            nodes: nodes,
            nodeHierarchy: nodeHierarchy,
            sourceColumns: sourceColumns,
            joinInfo: joinInfo,
            isGraphicalEligible: isGraphicalEligible,
            pipelineSql: pipelineSql
        };
    }

    _mapHanaTypeToCds(hanaType, length, precision, scale) {
        switch ((hanaType || '').toUpperCase()) {
            case 'VARCHAR':
            case 'NVARCHAR':
                return length ? `cds.String(${length})` : 'cds.String(100)';
            case 'INTEGER':
                return 'cds.Integer';
            case 'DECIMAL':
                return precision ? `cds.Decimal(${precision}, ${scale || 0})` : 'cds.Decimal(15, 2)';
            case 'DATE':
                return 'cds.Date';
            case 'TIMESTAMP':
                return 'cds.Timestamp';
            default:
                return length ? `cds.String(${length})` : 'cds.String(100)';
        }
    }

    _buildCalcViewPipeline(viewName, scen, nodeArray, sources = [], addRecordCount = true) {
        if (!nodeArray || nodeArray.length === 0) return null;

        const cteBlocks = [];
        const topNode = nodeArray[nodeArray.length - 1];
        const topNodeId = topNode['@_id'];

        for (let i = 0; i < nodeArray.length; i++) {
            const node = nodeArray[i];
            const nodeId = node['@_id'];
            const nodeType = node['@_xsi:type'] || '';
            const isTop = (nodeId === topNodeId);

            let nodeSql = '';

            if (nodeType.includes('ProjectionView')) {
                const inputNode = (node.input?.['@_node'] || '').replace(/^#/, '');
                const rawMappings = node.input?.mapping || [];
                const mappings = Array.isArray(rawMappings) ? rawMappings : (rawMappings ? [rawMappings] : []);

                let selectList = '*';
                if (mappings.length > 0) {
                    const colStrings = mappings.map(m => {
                        const src = m['@_source'];
                        const tgt = m['@_target'];
                        return src === tgt ? `        "${src}"` : `        "${src}" AS "${tgt}"`;
                    });
                    if (isTop && addRecordCount) {
                        colStrings.push('        1 AS "RECORD_COUNT"');
                    }
                    selectList = colStrings.join(',\n');
                } else if (isTop && addRecordCount) {
                    selectList = '        *,\n        1 AS "RECORD_COUNT"';
                }

                nodeSql = `    SELECT\n${selectList}\n    FROM "${inputNode}"`;

            } else if (nodeType.includes('JoinView')) {
                const rawInputs = node.input || [];
                const inputs = Array.isArray(rawInputs) ? rawInputs : (rawInputs ? [rawInputs] : []);
                const leftInput = (inputs[0]?.['@_node'] || '').replace(/^#/, '');
                const rightInput = (inputs[1]?.['@_node'] || '').replace(/^#/, '');

                const rawJoinAttrs = node.joinAttribute || [];
                const joinAttrs = Array.isArray(rawJoinAttrs) ? rawJoinAttrs : (rawJoinAttrs ? [rawJoinAttrs] : []);
                const joinType = (node['@_joinType'] || 'leftOuter').toUpperCase().includes('INNER') ? 'INNER JOIN' : 'LEFT OUTER JOIN';

                const leftMappings = (Array.isArray(inputs[0]?.mapping) ? inputs[0].mapping : [inputs[0]?.mapping]).filter(Boolean);
                const rightMappings = (Array.isArray(inputs[1]?.mapping) ? inputs[1].mapping : [inputs[1]?.mapping]).filter(Boolean);

                const onConditions = joinAttrs.map(j => {
                    const attrName = j['@_name'];
                    const lm = leftMappings.find(m => (m['@_target'] || m['@_source']) === attrName);
                    const rm = rightMappings.find(m => (m['@_target'] || m['@_source']) === attrName);
                    const lCol = lm ? lm['@_source'] : attrName;
                    const rCol = rm ? rm['@_source'] : attrName;
                    return `A."${lCol}" = B."${rCol}"`;
                }).join(' AND ') || '1 = 1';

                const cols = [];
                for (const lm of leftMappings) {
                    cols.push(`        A."${lm['@_source']}" AS "${lm['@_target']}"`);
                }
                for (const rm of rightMappings) {
                    if (!leftMappings.find(lm => lm['@_target'] === rm['@_target'])) {
                        cols.push(`        B."${rm['@_source']}" AS "${rm['@_target']}"`);
                    }
                }

                // Add calculated view attributes
                const rawCalcAttrs = node.calculatedViewAttributes?.calculatedViewAttribute || [];
                const calcAttrsList = Array.isArray(rawCalcAttrs) ? rawCalcAttrs : (rawCalcAttrs ? [rawCalcAttrs] : []);
                for (const ca of calcAttrsList) {
                    const formula = ca.formula || '';
                    const colName = ca['@_id'];
                    const isNullMatch = formula.match(/IF\s*\(\s*ISNULL\s*\(\s*"([^"]+)"\s*\)\s*,\s*(.*?)\s*,\s*"([^"]+)"\s*\)/i);
                    if (isNullMatch) {
                        const targetCol = isNullMatch[1];
                        const fallback = isNullMatch[2] || "''";
                        const lm = leftMappings.find(m => (m['@_target'] || m['@_source']) === targetCol);
                        const rm = rightMappings.find(m => (m['@_target'] || m['@_source']) === targetCol);
                        if (lm) {
                            cols.push(`        COALESCE(A."${lm['@_source']}", ${fallback}) AS "${colName}"`);
                        } else if (rm) {
                            cols.push(`        COALESCE(B."${rm['@_source']}", ${fallback}) AS "${colName}"`);
                        } else {
                            cols.push(`        COALESCE("${targetCol}", ${fallback}) AS "${colName}"`);
                        }
                    } else if (formula) {
                        cols.push(`        ${formula} AS "${colName}"`);
                    }
                }
                if (isTop && addRecordCount) {
                    cols.push('        1 AS "RECORD_COUNT"');
                }

                nodeSql = `    SELECT\n${cols.join(',\n')}\n    FROM "${leftInput}" AS A\n    ${joinType} "${rightInput}" AS B\n      ON ${onConditions}`;

            } else if (nodeType.includes('UnionView')) {
                const rawInputs = node.input || [];
                const inputs = Array.isArray(rawInputs) ? rawInputs : (rawInputs ? [rawInputs] : []);

                const unionBranches = [];
                for (const inp of inputs) {
                    const srcNode = (inp['@_node'] || '').replace(/^#/, '');
                    const rawMappings = inp.mapping || [];
                    const mappings = Array.isArray(rawMappings) ? rawMappings : (rawMappings ? [rawMappings] : []);
                    const cols = mappings.map(m => {
                        const src = m['@_source'];
                        const tgt = m['@_target'];
                        return src === tgt ? `        "${src}"` : `        "${src}" AS "${tgt}"`;
                    });
                    if (isTop && addRecordCount) {
                        cols.push('        1 AS "RECORD_COUNT"');
                    }
                    unionBranches.push(`    SELECT\n${cols.join(',\n')}\n    FROM "${srcNode}"`);
                }

                nodeSql = unionBranches.join('\n\n    UNION ALL\n\n');

            } else if (nodeType.includes('AggregationView')) {
                const inputNode = (node.input?.['@_node'] || '').replace(/^#/, '');
                const rawMappings = node.input?.mapping || [];
                const mappings = Array.isArray(rawMappings) ? rawMappings : (rawMappings ? [rawMappings] : []);
                const attrs = [];
                const meas = [];

                for (const m of mappings) {
                    const src = m['@_source'];
                    const tgt = m['@_target'];
                    if (this._isMeasure(tgt)) {
                        meas.push(`        SUM("${src}") AS "${tgt}"`);
                    } else {
                        attrs.push(`        "${src}" AS "${tgt}"`);
                    }
                }
                if (isTop && addRecordCount) {
                    meas.push('        COUNT(*) AS "RECORD_COUNT"');
                }
                const selectCols = [...attrs, ...meas].join(',\n');
                const groupBy = attrs.length > 0 ? `\n    GROUP BY ${attrs.map(a => a.trim().split(' ')[0]).join(', ')}` : '';
                nodeSql = `    SELECT\n${selectCols}\n    FROM "${inputNode}"${groupBy}`;

            } else {
                const inputNode = (node.input?.['@_node'] || '').replace(/^#/, '');
                nodeSql = `    SELECT * FROM "${inputNode}"`;
            }

            cteBlocks.push(`"${nodeId}" AS (\n${nodeSql}\n)`);
        }

        const cteHeader = `WITH\n` + cteBlocks.join(',\n\n') + `\n\nSELECT * FROM "${topNodeId}"`;
        return cteHeader;
    }
}


module.exports = new ExtractService();
