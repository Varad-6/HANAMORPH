const fs = require('fs');
const path = require('path');

let TABLE_CATALOG = {};
try {
    const catPath = path.join(__dirname, '../fixtures/table-columns-catalog.json');
    if (fs.existsSync(catPath)) {
        TABLE_CATALOG = JSON.parse(fs.readFileSync(catPath, 'utf8'));
    }
} catch (e) {
    console.warn('[TransformService] Failed to load table-columns-catalog.json:', e.message);
}

class TransformService {
    /**
     * Hydrate a base table definition with its full known schema from table catalog
     */
    _hydrateTableWithCatalog(tblName, tblDef) {
        if (!tblDef || tblDef.kind !== 'entity' || tblDef.query) return;
        const cleanName = (tblName || '').replace(/.*?\$\$\$\$/g, '').replace(/\$\$/g, '').replace(/^.*::/, '').replace(/^.*[.\/]/, '').trim();
        const knownSchema = TABLE_CATALOG[cleanName] || TABLE_CATALOG[cleanName.toUpperCase()] || TABLE_CATALOG[tblName];
        if (knownSchema) {
            if (!tblDef.elements) tblDef.elements = {};
            for (const [colName, colInfo] of Object.entries(knownSchema)) {
                if (!tblDef.elements[colName]) {
                    tblDef.elements[colName] = {
                        ...this._toCsnType(colInfo.dataType || 'cds.String(40)'),
                        "@EndUserText.label": colName,
                        ...(colInfo.isKey ? { key: true } : {})
                    };
                }
            }
        }
    }
    /**
     * Transform internal model into Datasphere-ready modular objects:
     * 1. Optimized Pure SQL Query (for Datasphere Data Builder -> New SQL View)
     * 2. Complete SQL DDL Statement (for HANA DB Explorer / SQL Console)
     * 3. Native Table CSN JSON (for Data Builder -> Import CSN)
     * 4. Native View CSN JSON (for Data Builder -> Import CSN)
     * 5. Native Analytic Model CSN JSON (for Business Builder -> Import CSN)
     * 6. Unified CSN Package (Table + View + AM in single CSN)
     * 
     * @param {object} model Internal representation
     * @param {Array} selectedColumns Optional filtered list or array of column mapping objects
     * @param {object} namingConfig Custom technical & business names
     */
    generateModularArtifacts(model, selectedColumns = null, namingConfig = {}) {
        const space = namingConfig.space || 'AIS_HARMONIZATION_';
        const rawBase = model.name || model.viewName || 'VIEW';
        const cleanBase = rawBase.replace(/^[\/\\]+/, '').replace(/[\/\\]+/g, '_').replace(/[^a-zA-Z0-9_]/g, '_');
        const sTechBase = /^[0-9]/.test(cleanBase) ? `_${cleanBase}` : cleanBase;

        const sanitizeTech = (name, fallback) => {
            const raw = name || fallback;
            const cleaned = raw.replace(/^[\/\\]+/, '').replace(/[\/\\]+/g, '_').replace(/[^a-zA-Z0-9_]/g, '_');
            return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned;
        };

        const tableTechName = sanitizeTech(namingConfig.tableName, `${sTechBase}_TBL`);
        const tableBusName = namingConfig.tableBusinessName || `${sTechBase} Base Table`;
        
        // FROM Source Table/View (can be an existing Datasphere table, remote table, or local table)
        const fromSource = sanitizeTech(namingConfig.fromTableName, tableTechName);

        const viewTechName = sanitizeTech(namingConfig.viewNameCustom || namingConfig.viewName, `${sTechBase}_V`);
        const viewBusName = namingConfig.viewBusinessName || `${sTechBase} Analytical View`;
        
        const amTechName = sanitizeTech(namingConfig.amName || namingConfig.analyticModelName, `${sTechBase}_AM`);
        const amBusName = namingConfig.analyticModelBusinessName || `${sTechBase} Consumption Model`;

        // Normalize columns (supports array of strings OR array of mapping objects)
        let normalizedCols = [];
        if (!selectedColumns || selectedColumns.length === 0) {
            normalizedCols = (model.columns || []).map(c => ({
                sourceName: c.name,
                targetName: c.name,
                targetLabel: c.originalName || c.name,
                dataType: c.dataType || 'cds.String(40)',
                isKey: !!c.isKey,
                isMeasure: !!c.isMeasure || this._isMeasure(c.name)
            }));
        } else if (typeof selectedColumns[0] === 'string') {
            normalizedCols = (model.columns || [])
                .filter(c => selectedColumns.includes(c.name))
                .map(c => ({
                    sourceName: c.name,
                    targetName: c.name,
                    targetLabel: c.originalName || c.name,
                    dataType: c.dataType || 'cds.String(40)',
                    isKey: !!c.isKey,
                    isMeasure: !!c.isMeasure || this._isMeasure(c.name)
                }));
        } else {
            // User provided column objects with custom targetName / targetLabel
            normalizedCols = selectedColumns.map(colObj => ({
                sourceName: colObj.sourceName || colObj.name,
                targetName: colObj.targetName || colObj.name || colObj.sourceName,
                targetLabel: colObj.targetLabel || colObj.originalName || colObj.name,
                dataType: colObj.dataType || 'cds.String(40)',
                isKey: !!colObj.isKey,
                isMeasure: colObj.isMeasure !== undefined ? !!colObj.isMeasure : this._isMeasure(colObj.sourceName || colObj.name)
            }));
        }

        // 1. Build Table Definition Elements
        const tableElements = {};
        for (const col of normalizedCols) {
            tableElements[col.sourceName] = {
                ...this._toCsnType(col.dataType),
                "@EndUserText.label": col.targetLabel,
                ...(col.isKey ? { key: true } : {})
            };
        }

        // 2. Build View & Analytic Model Elements
        const viewElements = {};
        const amElements = {};
        const queryColumns = [];
        const sqlSelectCols = [];

        for (const col of normalizedCols) {
            const isNumeric = col.dataType && (col.dataType.includes('Decimal') || col.dataType.includes('Integer'));
            const isMeasure = col.isMeasure || this._isMeasure(col.targetName) || this._isMeasure(col.sourceName);

            viewElements[col.targetName] = {
                ...this._toCsnType(col.dataType),
                "@EndUserText.label": col.targetLabel,
                ...(col.isKey ? { key: true } : {}),
                ...(isMeasure ? {
                    '@Analytics.measure': true,
                    '@Aggregation.default': '#SUM'
                } : {})
            };

            amElements[col.targetName] = {
                ...this._toCsnType(col.dataType),
                "@EndUserText.label": col.targetLabel,
                ...(isMeasure ? {
                    '@Analytics.measure': true,
                    '@Aggregation.default': '#SUM'
                } : {
                    '@Analytics.dimension': true
                })
            };

            // CSN Query column projection
            if (col.targetName !== col.sourceName) {
                queryColumns.push({
                    ref: [col.sourceName],
                    as: col.targetName
                });
            } else {
                queryColumns.push({
                    ref: [col.sourceName]
                });
            }

            // Pure SQL projection with COALESCE on numeric/measures
            if (isMeasure || (isNumeric && !col.isKey)) {
                if (col.targetName !== col.sourceName) {
                    sqlSelectCols.push(`    COALESCE("${col.sourceName}", 0) AS "${col.targetName}"`);
                } else {
                    sqlSelectCols.push(`    COALESCE("${col.sourceName}", 0) AS "${col.sourceName}"`);
                }
            } else {
                if (col.targetName !== col.sourceName) {
                    sqlSelectCols.push(`    "${col.sourceName}" AS "${col.targetName}"`);
                } else {
                    sqlSelectCols.push(`    "${col.sourceName}"`);
                }
            }
        }

        // CSN Definition Objects
        const tableDefinition = {
            kind: "entity",
            "@EndUserText.label": tableBusName,
            elements: tableElements
        };

        // Determine Semantic Category: FACT (#CUBE) requires measures, DIMENSION (#DIMENSION) for master data
        let hasMeasures = normalizedCols.some(c => c.isMeasure || this._isMeasure(c.targetName) || this._isMeasure(c.sourceName));
        let semanticCategory = "#CUBE";
        if (namingConfig.semanticUsage === 'DIMENSION') {
            semanticCategory = "#DIMENSION";
        } else if (namingConfig.semanticUsage === 'RELATIONAL') {
            semanticCategory = null;
        } else if (namingConfig.semanticUsage === 'FACT') {
            semanticCategory = "#CUBE";
        } else {
            // Default: #CUBE for Fact views, #DIMENSION only if explicitly master data without measures
            semanticCategory = hasMeasures ? "#CUBE" : (model.isMasterData ? "#DIMENSION" : "#CUBE");
        }

        // If semanticCategory is #CUBE (Fact View) or Analytic Model is generated, SAP Datasphere strictly requires at least 1 measure!
        if (semanticCategory === "#CUBE" && !hasMeasures) {
            viewElements["RECORD_COUNT"] = {
                type: "cds.Integer",
                "@EndUserText.label": "Record Count",
                "@Analytics.measure": true,
                "@Aggregation.default": "#SUM"
            };
            amElements["RECORD_COUNT"] = {
                type: "cds.Integer",
                "@EndUserText.label": "Record Count",
                "@Analytics.measure": true,
                "@Aggregation.default": "#SUM"
            };
            queryColumns.push({
                val: 1,
                as: "RECORD_COUNT"
            });
            sqlSelectCols.push('    1 AS "RECORD_COUNT"');
            hasMeasures = true;
        } else if (!hasMeasures) {
            // Even in Dimension or Analytic Model, guarantee AM has a counter if user opens Analytic Model
            amElements["RECORD_COUNT"] = {
                type: "cds.Integer",
                "@EndUserText.label": "Record Count",
                "@Analytics.measure": true,
                "@Aggregation.default": "#SUM"
            };
        }

        // Key integrity helper: Datasphere rejects any table/view entity with zero key columns
        const ensureKey = (elements) => {
            if (!elements || Object.keys(elements).length === 0) return;
            const hasKey = Object.values(elements).some(el => el.key);
            if (!hasKey) {
                const candidate = Object.keys(elements).find(k => !elements[k]['@Analytics.measure']) || Object.keys(elements)[0];
                if (candidate) elements[candidate].key = true;
            }
        };
        ensureKey(tableElements);
        ensureKey(viewElements);

        // Build native CQN query structure (supports single source, multi-source joins, and calc views)
        let queryFrom = { ref: [fromSource] };
        let queryCols = queryColumns;

        if (model.joinInfo && model.joinInfo.leftTable && model.joinInfo.rightTable) {
            const leftClean = sanitizeTech(model.joinInfo.leftTable);
            const rightClean = sanitizeTech(model.joinInfo.rightTable);
            const onClause = [];
            const joinAttrs = (model.joinInfo.joinAttrs && model.joinInfo.joinAttrs.length > 0) ? model.joinInfo.joinAttrs : ['MANDT'];

            joinAttrs.forEach((attr, idx) => {
                if (idx > 0) onClause.push("and");
                onClause.push({ ref: ["A", attr] });
                onClause.push("=");
                onClause.push({ ref: ["B", attr] });
            });

            queryFrom = {
                join: model.joinInfo.joinType || "left",
                args: [
                    { ref: [leftClean], as: "A" },
                    { ref: [rightClean], as: "B" }
                ],
                on: onClause
            };

            const leftColSet = new Set((model.sourceColumns?.[model.joinInfo.leftTable] || []).map(c => c.name));
            queryCols = normalizedCols.map(col => {
                const isLeft = leftColSet.has(col.sourceName);
                const tableAlias = isLeft ? "A" : "B";
                return {
                    ref: [tableAlias, col.sourceName],
                    as: col.targetName
                };
            });
            if (viewElements["RECORD_COUNT"]) {
                queryCols.push({ val: 1, as: "RECORD_COUNT" });
            }
        }

        const viewDefinition = {
            kind: "entity",
            "@EndUserText.label": viewBusName,
            ...(semanticCategory ? { "@Analytics.dataCategory": semanticCategory } : {}),
            elements: viewElements,
            query: {
                SELECT: {
                    from: queryFrom,
                    columns: queryCols
                }
            }
        };

        const amDefinition = {
            kind: "analyticModel",
            "@EndUserText.label": amBusName,
            source: {
                ref: [viewTechName]
            },
            elements: amElements
        };

        // 1. Table CSN (Ready for Data Builder -> Tables)
        const isFromSourceView = fromSource.endsWith('_V') || fromSource.endsWith('_DIM_V') || fromSource.endsWith('_FACT_V') || (namingConfig.fromIsView === true);
        const tableDefinitions = {};
        if (!isFromSourceView) {
            tableDefinitions[fromSource] = tableDefinition;
        }
        if (tableTechName && !tableDefinitions[tableTechName] && !tableTechName.endsWith('_V')) {
            tableDefinitions[tableTechName] = tableDefinition;
        }
        // Bundle all physical DataSources referenced by the model with their exact schema (skipping nested calc views)
        for (const src of (model.sources || [])) {
            if (src.isNestedCalcView) continue;
            const sName = sanitizeTech(src.tableName);
            if (sName && !tableDefinitions[sName]) {
                const specificCols = (model.sourceColumns && model.sourceColumns[src.tableName]) || [];
                const srcElements = {};
                if (specificCols.length > 0) {
                    for (const sc of specificCols) {
                        srcElements[sc.name] = {
                            ...this._toCsnType(sc.dataType),
                            "@EndUserText.label": sc.originalName || sc.name,
                            ...(sc.isKey ? { key: true } : {})
                        };
                    }
                } else {
                    Object.assign(srcElements, tableElements);
                }

                ensureKey(srcElements);

                tableDefinitions[sName] = {
                    kind: "entity",
                    "@EndUserText.label": `${sName} Physical Table`,
                    elements: srcElements
                };
                this._hydrateTableWithCatalog(sName, tableDefinitions[sName]);
            }
        }
        // Guarantee all table definitions have at least one key and complete catalog schemas
        for (const [tName, tbl] of Object.entries(tableDefinitions)) {
            this._hydrateTableWithCatalog(tName, tbl);
            ensureKey(tbl.elements);
        }

        const tableCsn = {
            $version: "2.0",
            definitions: tableDefinitions
        };

        // 2. Fact View CSN (Self-Contained: Bundles all base tables so Datasphere never throws missing object errors)
        const viewDefinitions = {
            ...tableDefinitions,
            [viewTechName]: viewDefinition
        };
        const viewCsn = {
            $version: "2.0",
            definitions: viewDefinitions
        };

        // 3. Standalone Direct Fact / Dimension Entity CSN (Single independent entity, zero dependencies on underlying tables)
        const standaloneFactDefinition = {
            kind: "entity",
            "@EndUserText.label": viewBusName,
            ...(semanticCategory ? { "@Analytics.dataCategory": semanticCategory } : {}),
            elements: JSON.parse(JSON.stringify(viewElements))
        };
        const standaloneFactCsn = {
            $version: "2.0",
            definitions: {
                [viewTechName]: standaloneFactDefinition
            }
        };

        // 4. Analytic Model CSN (Self-Contained: Bundles Base Tables + Fact View + Analytic Model)
        const amDefinitions = {
            ...tableDefinitions,
            [viewTechName]: viewDefinition,
            [amTechName]: amDefinition
        };
        const analyticModelCsn = {
            $version: "2.0",
            definitions: amDefinitions
        };

        // 5. Unified CSN Package (Tables + View + Analytic Model in one complete file)
        const packageDefinitions = {
            ...tableDefinitions,
            [viewTechName]: viewDefinition,
            [amTechName]: amDefinition
        };
        const packageCsn = {
            $version: "2.0",
            definitions: packageDefinitions
        };

        // 6. Multi-Tier Visual DAG Package (1:1 Lineage Parity with HANA Studio)
        let multiTierPackageCsn = null;
        let multiTierPackageJsonString = '';
        let tierSqls = [];
        let optimizedQuerySql = '';

        if (model.type === 'CALC_VIEW' && model.nodeHierarchy && model.nodeHierarchy.length > 1) {
            const multiTierRes = this._generateMultiTierDagArtifacts(
                model,
                normalizedCols,
                namingConfig,
                tableDefinitions,
                viewElements,
                amDefinition,
                semanticCategory
            );
            multiTierPackageCsn = multiTierRes.packageCsn;
            multiTierPackageJsonString = JSON.stringify(multiTierPackageCsn, null, 2);
            tierSqls = multiTierRes.tierSqls;
            if (multiTierRes.inlinedPureSql) {
                optimizedQuerySql = multiTierRes.inlinedPureSql;
            } else if (tierSqls && tierSqls.length > 0) {
                // Top root tier SQL is a pure SELECT query without CTE WITH clauses
                optimizedQuerySql = tierSqls[tierSqls.length - 1].sql;
            }
        } else {
            multiTierPackageCsn = packageCsn;
            multiTierPackageJsonString = JSON.stringify(packageCsn, null, 2);
            tierSqls = [{
                tier: 1,
                nodeId: viewTechName,
                viewTechName: viewTechName,
                label: viewBusName,
                sql: `SELECT\n${sqlSelectCols.join(',\n')}\nFROM "${fromSource}"`
            }];
        }

        // Pure SELECT Query (For SAP Datasphere Data Builder -> New SQL View Editor)
        // Strictly guaranteed: Never starts with WITH or CTE statements
        if (!optimizedQuerySql) {
            optimizedQuerySql = `SELECT\n` +
                sqlSelectCols.join(',\n') + `\n` +
                `FROM "${fromSource}"`;
        }

        // Full DDL Statement (For HANA Database Explorer / SQL Console)
        const completeDdlSql = `-- ==========================================================\n` +
            `-- SAP Datasphere SQL DDL Definition\n` +
            `-- Space: ${space}\n` +
            `-- View: ${viewTechName}\n` +
            `-- Source Table: ${tableTechName}\n` +
            `-- Optimizations: Null-safe measures (COALESCE)\n` +
            `-- ==========================================================\n\n` +
            `CREATE VIEW "${viewTechName}" AS\n` +
            optimizedQuerySql + `;`;

        // Replication Flow Definitions (Targeting Local Tables in Datasphere)
        const rfTasksMaster = [{
            sourceObject: fromSource,
            targetObject: tableTechName,
            category: 'MasterData',
            loadType: 'Initial',
            description: `Snapshot replication of ${fromSource} into Local Table ${tableTechName}`
        }];
        const rfTasksDelta = [{
            sourceObject: fromSource,
            targetObject: tableTechName,
            category: 'TransactionalData',
            loadType: 'InitialAndDelta',
            description: `Initial + CDC Delta replication of ${fromSource} into Local Table ${tableTechName}`
        }];

        const rfMaster = this.generateReplicationFlow({
            flowName: `RF_${tableTechName}_MASTER`,
            description: `Replication Flow for ${tableBusName} (Master Snapshot Load)`,
            sourceConnection: namingConfig.sourceConnection || 'S4HANA_SOURCE',
            targetSpace: space,
            tasks: rfTasksMaster
        });

        const rfDelta = this.generateReplicationFlow({
            flowName: `RF_${tableTechName}_DELTA`,
            description: `Replication Flow for ${tableBusName} (Transactional Delta Load)`,
            sourceConnection: namingConfig.sourceConnection || 'S4HANA_SOURCE',
            targetSpace: space,
            tasks: rfTasksDelta
        });

        return {
            // Standard Native CSN (for Web UI Import)
            tableJson: tableCsn,
            tableJsonString: JSON.stringify(tableCsn, null, 2),
            viewJson: viewCsn,
            viewJsonString: JSON.stringify(viewCsn, null, 2),
            standaloneFactJson: standaloneFactCsn,
            standaloneFactJsonString: JSON.stringify(standaloneFactCsn, null, 2),
            analyticModelJson: analyticModelCsn,
            analyticModelJsonString: JSON.stringify(analyticModelCsn, null, 2),
            packageJson: packageCsn,
            packageJsonString: JSON.stringify(packageCsn, null, 2),

            // Multi-Tier Visual DAG CSN Package (1:1 Lineage Parity with HANA Studio)
            multiTierPackageJson: multiTierPackageCsn,
            multiTierPackageJsonString: multiTierPackageJsonString,
            tierSqls: tierSqls,
            tierSqlsJsonString: JSON.stringify(tierSqls, null, 2),
            nodeHierarchy: model.nodeHierarchy || [],
            nodeHierarchyJsonString: JSON.stringify(model.nodeHierarchy || [], null, 2),

            // Replication Flow Artifacts (Targeting Local Tables)
            replicationFlowMasterJsonString: rfMaster.flowJsonString,
            replicationFlowDeltaJsonString: rfDelta.flowJsonString,
            replicationFlowCliCommand: rfDelta.cliDeployCommand,

            // SQL Variants
            optimizedQuerySql, // Specifically for Datasphere New SQL View!
            optimizedSql: optimizedQuerySql, // Default
            completeDdlSql,

            namingConfig: {
                space,
                tableTechName,
                tableBusName,
                viewTechName,
                viewBusName,
                amTechName,
                amBusName
            }
        };
    }

    _toCsnType(dt) {
        if (!dt) return { type: 'cds.String', length: 40 };
        const s = String(dt).replace(/^cds\./, '');
        const mStr = s.match(/String\((\d+)\)/i);
        if (mStr) return { type: 'cds.String', length: parseInt(mStr[1], 10) };
        const mDec = s.match(/Decimal\((\d+),\s*(\d+)\)/i);
        if (mDec) return { type: 'cds.Decimal', precision: parseInt(mDec[1], 10), scale: parseInt(mDec[2], 10) };
        if (s.toLowerCase().includes('integer')) return { type: 'cds.Integer' };
        if (s.toLowerCase().includes('date')) return { type: 'cds.Date' };
        if (s.toLowerCase().includes('timestamp')) return { type: 'cds.Timestamp' };
        if (s.toLowerCase().includes('boolean')) return { type: 'cds.Boolean' };
        return { type: 'cds.String', length: 40 };
    }

    _inferColumnDataType(colName) {
        if (!colName) return 'cds.String(40)';
        const upper = String(colName).toUpperCase();
        if (upper.includes('DATE') || upper.endsWith('_AT') || upper.endsWith('BEGDA') || upper.endsWith('ENDDA') || upper.endsWith('AEDAT') || upper.endsWith('ERDAT') || upper.endsWith('DAT') || upper.startsWith('DATE')) return 'cds.Date';
        if (upper.includes('TIME') || upper.endsWith('TIMESTAMP')) return 'cds.Timestamp';
        if (upper.includes('AMOUNT') || upper.includes('PRICE') || upper.includes('COST') || upper.includes('NETWR') || upper.includes('NETPR') || upper.includes('MENGE')) return 'cds.Decimal(15, 2)';
        if (upper.includes('QTY') || upper.includes('COUNT') || upper.includes('QUANTITY')) return 'cds.Integer';
        if (upper.includes('ID') || upper.includes('NUM') || upper.includes('KEY') || upper.includes('PERNR') || upper.includes('MANDT')) return 'cds.String(40)';
        return 'cds.String(100)';
    }

    _isMeasure(colName) {
        if (!colName) return false;
        const u = colName.toUpperCase();
        return u.includes('QUANTITY') || u.includes('QTY') || u.includes('AMOUNT') || 
               u.includes('COUNT') || u.includes('SCRAP') || u.includes('YIELD') || 
               u.includes('REWORK') || u.includes('VALUE') || u.includes('LIMIT');
    }

    _isMasterData(tableName) {
        const t = (tableName || '').toUpperCase();
        return t === 'MARA' || t === 'MAKT' || t === 'KNA1' || t === 'LFA1' || 
               t === 'BNKA' || t.includes('BANK') || t === 'SKA1' || t === 'SKB1' || t === 'CSKS' ||
               t === 'T001W' || t === 'T001' || t.includes('DIMENSION') || 
               t.includes('MASTER') || t.includes('TEXT');
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

    /**
     * Generate multi-tier CSN and tier-by-tier SQL views mirroring Calculation View DAG
     */
    _generateMultiTierDagArtifacts(model, normalizedCols, namingConfig, tableDefinitions, finalViewElements, amDefinition, semanticCategory) {
        const space = namingConfig.space || 'AIS_HARMONIZATION_';
        const rawBase = model.name || model.viewName || 'VIEW';
        const cleanBase = rawBase.replace(/^[\/\\]+/, '').replace(/[\/\\]+/g, '_').replace(/[^a-zA-Z0-9_]/g, '_');
        const sTechBase = /^[0-9]/.test(cleanBase) ? `_${cleanBase}` : cleanBase;
        const viewTechName = namingConfig.viewNameCustom || namingConfig.viewName || `${sTechBase}_V`;
        const amTechName = namingConfig.amName || namingConfig.analyticModelName || `${sTechBase}_AM`;

        const nodeHierarchy = model.nodeHierarchy || [];
        const rootNode = nodeHierarchy.find(n => n.isRoot) || nodeHierarchy[nodeHierarchy.length - 1];

        const ensureKey = (elements) => {
            if (!elements || Object.keys(elements).length === 0) return;
            const hasKey = Object.values(elements).some(el => el.key);
            if (!hasKey) {
                const candidate = Object.keys(elements).find(k => !elements[k]['@Analytics.measure']) || Object.keys(elements)[0];
                if (candidate) elements[candidate].key = true;
            }
        };

        // 1. Identify trivial single-table wrappers (e.g. p_ac_type on FCLM_BAM_AC_TYPE)
        const collapsedNodes = {};
        for (const node of nodeHierarchy) {
            if (node.type === 'PROJECTION' && !node.isRoot && node.inputs && node.inputs.length === 1) {
                const inputName = node.inputs[0];
                const isPhysical = tableDefinitions[inputName] || (model.sources && model.sources.some(s => s.tableName === inputName));
                const isWrapperId = /^p_/i.test(node.id) || node.id.toLowerCase() === `p_${inputName.toLowerCase()}`;
                if (isPhysical && isWrapperId) {
                    collapsedNodes[node.id] = {
                        targetTable: inputName,
                        mappings: node.mappings || []
                    };
                }
            }
        }

        const cleanNodeId = (id) => {
            if (!id) return '';
            return id.replace(/.*?\$\$\$\$/g, '').replace(/\$\$/g, '').replace(/^.*::/, '').replace(/^.*[.\/]/, '').trim();
        };

        const getNodeTechName = (nodeId) => {
            if (!nodeId) return '';
            const cNodeId = cleanNodeId(nodeId);
            if (collapsedNodes[nodeId]) {
                return collapsedNodes[nodeId].targetTable;
            }
            if (collapsedNodes[cNodeId]) {
                return collapsedNodes[cNodeId].targetTable;
            }
            if (tableDefinitions[nodeId]) {
                return nodeId;
            }
            if (tableDefinitions[cNodeId]) {
                return cNodeId;
            }
            if (model.sources && model.sources.some(s => s.tableName === nodeId || s.tableName === cNodeId)) {
                return cNodeId;
            }
            const found = nodeHierarchy.find(n => n.id === nodeId || n.id === cNodeId);
            if (found && (found.isRoot || found.id === rootNode?.id)) {
                return viewTechName;
            }
            if (found) {
                const clean = (found.id || '').replace(/^[\/\\]+/, '').replace(/[\/\\]+/g, '_').replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
                return `${sTechBase}_${clean}_V`;
            }
            return cNodeId;
        };

        const definitions = { ...tableDefinitions };
        const tierSqls = [];
        let tierIndex = 1;

        const operationalNodes = nodeHierarchy.filter(n => !collapsedNodes[n.id]);

        // Guarantee that ALL physical base tables referenced across all operational nodes are defined in CSN definitions,
        // and populate/merge ALL columns used by any node from that table!
        for (const node of operationalNodes) {
            for (const rawInp of (node.inputs || [])) {
                const cleanInp = cleanNodeId(rawInp);
                const isAnotherNode = nodeHierarchy.some(n => n.id === rawInp || cleanNodeId(n.id) === cleanInp);
                if (!isAnotherNode && cleanInp) {
                    if (!definitions[cleanInp]) {
                        definitions[cleanInp] = {
                            kind: "entity",
                            "@EndUserText.label": `${cleanInp} Physical Table`,
                            elements: {}
                        };
                    }
                    const tblDef = definitions[cleanInp];
                    if (!tblDef.elements) tblDef.elements = {};

                    // First, hydrate with complete schema from catalog if available
                    this._hydrateTableWithCatalog(cleanInp, tblDef);

                    // Merge known source columns
                    const specificCols = (model.sourceColumns && (model.sourceColumns[cleanInp] || model.sourceColumns[rawInp])) || [];
                    for (const sc of specificCols) {
                        if (!tblDef.elements[sc.name]) {
                            tblDef.elements[sc.name] = {
                                ...this._toCsnType(sc.dataType),
                                "@EndUserText.label": sc.originalName || sc.name,
                                ...(sc.isKey ? { key: true } : {})
                            };
                        }
                    }

                    // Merge columns from this node's mappings
                    const nodeMaps = (node.mappings || []).filter(m => m.inputNode === rawInp || cleanNodeId(m.inputNode) === cleanInp || cleanNodeId(m.inputNode) === cleanNodeId(rawInp));
                    for (const m of nodeMaps) {
                        if (m.source && !tblDef.elements[m.source]) {
                            const inferredDt = this._inferColumnDataType(m.source);
                            tblDef.elements[m.source] = {
                                ...this._toCsnType(inferredDt),
                                "@EndUserText.label": m.source
                            };
                        }
                    }

                    // Merge columns from join conditions
                    for (const jc of (node.joinConditions || [])) {
                        if (jc.leftSource && !tblDef.elements[jc.leftSource]) {
                            tblDef.elements[jc.leftSource] = {
                                ...this._toCsnType(this._inferColumnDataType(jc.leftSource)),
                                "@EndUserText.label": jc.leftSource
                            };
                        }
                        if (jc.rightSource && !tblDef.elements[jc.rightSource]) {
                            tblDef.elements[jc.rightSource] = {
                                ...this._toCsnType(this._inferColumnDataType(jc.rightSource)),
                                "@EndUserText.label": jc.rightSource
                            };
                        }
                    }

                    ensureKey(tblDef.elements);
                }
            }
        }

        for (const node of operationalNodes) {
            const isRoot = (node.id === rootNode?.id) || node.isRoot;
            const nodeTech = isRoot ? viewTechName : getNodeTechName(node.id);
            const nodeLabel = isRoot 
                ? (namingConfig.viewBusinessName || `${sTechBase} Analytical View`)
                : `${node.id} Intermediate View`;

            let nodeViewDef = null;
            let nodeSql = '';

            if (node.type === 'JOIN') {
                const rawLeft = node.inputs[0];
                const rawRight = node.inputs[1];
                const leftTech = getNodeTechName(rawLeft);
                const rightTech = getNodeTechName(rawRight);

                const conditions = (node.joinConditions && node.joinConditions.length > 0)
                    ? node.joinConditions
                    : (node.joinAttributes || ['MANDT']).map(attr => {
                        const lm = (node.mappings || []).find(m => (m.inputNode === rawLeft || cleanNodeId(m.inputNode) === cleanNodeId(rawLeft)) && m.target === attr);
                        const rm = (node.mappings || []).find(m => (m.inputNode === rawRight || cleanNodeId(m.inputNode) === cleanNodeId(rawRight)) && m.target === attr);
                        return {
                            targetAttr: attr,
                            leftSource: lm ? lm.source : attr,
                            rightSource: rm ? rm.source : attr
                        };
                    });

                const joinPairs = conditions.map(cond => {
                    let lCol = cond.leftSource;
                    if (collapsedNodes[rawLeft]) {
                        lCol = collapsedNodes[rawLeft].mappings.find(m => m.target === lCol)?.source || lCol;
                    }
                    let rCol = cond.rightSource;
                    if (collapsedNodes[rawRight]) {
                        rCol = collapsedNodes[rawRight].mappings.find(m => m.target === rCol)?.source || rCol;
                    }
                    return { leftCol: lCol, rightCol: rCol };
                });

                const onConditions = joinPairs.map(p => `A."${p.leftCol}" = B."${p.rightCol}"`).join(' AND ') || '1 = 1';
                const onCqn = [];
                joinPairs.forEach((p, idx) => {
                    if (idx > 0) onCqn.push("and");
                    onCqn.push({ ref: ["A", p.leftCol] });
                    onCqn.push("=");
                    onCqn.push({ ref: ["B", p.rightCol] });
                });

                const selectCols = [];
                const cqnCols = [];
                const viewElements = {};
                const seenTargets = new Set();

                for (const m of (node.mappings || [])) {
                    const isLeft = (m.inputNode === rawLeft) || (cleanNodeId(m.inputNode) === cleanNodeId(rawLeft)) || (collapsedNodes[rawLeft] && (m.inputNode === collapsedNodes[rawLeft].targetTable || cleanNodeId(m.inputNode) === cleanNodeId(collapsedNodes[rawLeft].targetTable)));
                    const alias = isLeft ? "A" : "B";
                    const src = m.source;
                    const tgt = m.target;
                    if (seenTargets.has(tgt)) continue;
                    seenTargets.add(tgt);

                    selectCols.push(`    ${alias}."${src}" AS "${tgt}"`);
                    cqnCols.push({ ref: [alias, src], as: tgt });

                    const inferred = (model.columns || []).find(c => c.name === tgt) || {};
                    const isMeas = inferred.isMeasure || this._isMeasure(tgt);
                    const isKey = inferred.isKey || (node.joinAttributes || []).includes(tgt);

                    viewElements[tgt] = {
                        ...this._toCsnType(inferred.dataType || 'cds.String(40)'),
                        "@EndUserText.label": tgt,
                        ...(isKey ? { key: true } : {}),
                        ...(isMeas ? { '@Analytics.measure': true, '@Aggregation.default': '#SUM' } : {})
                    };
                }

                // Add calculated attributes on this JOIN node
                for (const ca of (node.calculatedAttributes || [])) {
                    const colId = ca.id;
                    if (seenTargets.has(colId)) continue;
                    seenTargets.add(colId);

                    const formula = ca.formula || '';
                    const isNullMatch = formula.match(/IF\s*\(\s*ISNULL\s*\(\s*"([^"]+)"\s*\)\s*,\s*(.*?)\s*,\s*"([^"]+)"\s*\)/i);
                    if (isNullMatch) {
                        const targetCol = isNullMatch[1];
                        const fallbackRaw = isNullMatch[2].trim();
                        const fallbackVal = (fallbackRaw === "''" || fallbackRaw === '""') ? "" : (isNaN(Number(fallbackRaw)) ? fallbackRaw : Number(fallbackRaw));
                        const fallbackSql = (fallbackRaw === "''" || fallbackRaw === '""') ? "''" : fallbackRaw;

                        const mapEntry = (node.mappings || []).find(m => m.target === targetCol);
                        if (mapEntry) {
                            const isLeft = (mapEntry.inputNode === rawLeft) || (collapsedNodes[rawLeft] && mapEntry.inputNode === collapsedNodes[rawLeft].targetTable);
                            const alias = isLeft ? "A" : "B";
                            const srcCol = mapEntry.source;
                            selectCols.push(`    COALESCE(${alias}."${srcCol}", ${fallbackSql}) AS "${colId}"`);
                            cqnCols.push({
                                func: "coalesce",
                                args: [
                                    { ref: [alias, srcCol] },
                                    { val: fallbackVal }
                                ],
                                as: colId
                            });
                        } else {
                            selectCols.push(`    COALESCE("${targetCol}", ${fallbackSql}) AS "${colId}"`);
                            cqnCols.push({
                                func: "coalesce",
                                args: [
                                    { ref: [targetCol] },
                                    { val: fallbackVal }
                                ],
                                as: colId
                            });
                        }
                    } else if (/^\d+$/.test(formula.trim())) {
                        const numVal = parseInt(formula.trim(), 10);
                        selectCols.push(`    ${numVal} AS "${colId}"`);
                        cqnCols.push({ val: numVal, as: colId });
                    } else if (/^'.*'$/.test(formula.trim())) {
                        const strVal = formula.trim().slice(1, -1);
                        selectCols.push(`    '${strVal}' AS "${colId}"`);
                        cqnCols.push({ val: strVal, as: colId });
                    } else {
                        selectCols.push(`    ${formula} AS "${colId}"`);
                        const colRefMatch = formula.match(/"([^"]+)"/);
                        if (colRefMatch && colRefMatch[1] && colRefMatch[1] !== colId) {
                            cqnCols.push({ ref: [colRefMatch[1]], as: colId });
                        } else {
                            cqnCols.push({ ref: [colId] });
                        }
                    }

                    const dt = this._mapHanaTypeToCds(ca.dataType, ca.length, ca.precision, ca.scale);
                    const inferred = (model.columns || []).find(c => c.name === colId) || {};
                    const isMeas = inferred.isMeasure || this._isMeasure(colId);

                    viewElements[colId] = {
                        ...this._toCsnType(dt),
                        "@EndUserText.label": colId,
                        ...(isMeas ? { '@Analytics.measure': true, '@Aggregation.default': '#SUM' } : {})
                    };
                }

                if (Object.keys(viewElements).length === 0) {
                    const candidateCols = (model.columns && model.columns.length > 0) ? model.columns : [{ name: 'ID', isKey: true }];
                    for (const c of candidateCols) {
                        viewElements[c.name] = {
                            ...this._toCsnType(c.dataType || 'cds.String(40)'),
                            "@EndUserText.label": c.originalName || c.name,
                            ...(c.isKey ? { key: true } : {}),
                            ...(c.isMeasure ? { '@Analytics.measure': true, '@Aggregation.default': '#SUM' } : {})
                        };
                        selectCols.push(`    "${c.name}"`);
                        cqnCols.push({ ref: [c.name] });
                    }
                }

                if (isRoot && semanticCategory === '#CUBE') {
                    const hasMeasuresInView = Object.values(viewElements).some(el => el['@Analytics.measure']);
                    if (!hasMeasuresInView) {
                        viewElements["RECORD_COUNT"] = {
                            type: "cds.Integer",
                            "@EndUserText.label": "Record Count",
                            "@Analytics.measure": true,
                            "@Aggregation.default": "#SUM"
                        };
                        selectCols.push('    1 AS "RECORD_COUNT"');
                        cqnCols.push({ val: 1, as: "RECORD_COUNT" });
                    }
                }

                ensureKey(viewElements);

                nodeSql = `SELECT\n${selectCols.join(',\n')}\nFROM "${leftTech}" AS A\n${node.joinType || 'LEFT OUTER JOIN'} "${rightTech}" AS B\n  ON ${onConditions}`;

                nodeViewDef = {
                    kind: "entity",
                    "@EndUserText.label": nodeLabel,
                    ...(isRoot && semanticCategory ? { "@Analytics.dataCategory": semanticCategory } : {}),
                    elements: viewElements,
                    query: {
                        SELECT: {
                            from: {
                                join: (node.joinType || '').toUpperCase().includes('INNER') ? "inner" : "left",
                                args: [
                                    { ref: [leftTech], as: "A" },
                                    { ref: [rightTech], as: "B" }
                                ],
                                on: onCqn
                            },
                            columns: cqnCols
                        }
                    }
                };

                tierSqls.push({
                    tier: tierIndex++,
                    nodeId: node.id,
                    viewTechName: nodeTech,
                    label: nodeLabel,
                    sql: nodeSql,
                    inputs: [leftTech, rightTech]
                });

            } else if (node.type === 'PROJECTION') {
                const rawInput = node.inputs[0];
                const srcTech = getNodeTechName(rawInput);

                const selectCols = [];
                const cqnCols = [];
                const viewElements = {};
                const seenTargets = new Set();

                for (const m of (node.mappings || [])) {
                    const src = m.source;
                    const tgt = m.target;
                    if (seenTargets.has(tgt)) continue;
                    seenTargets.add(tgt);

                    if (src === tgt) {
                        selectCols.push(`    "${src}"`);
                        cqnCols.push({ ref: [src] });
                    } else {
                        selectCols.push(`    "${src}" AS "${tgt}"`);
                        cqnCols.push({ ref: [src], as: tgt });
                    }

                    const inferred = (model.columns || []).find(c => c.name === tgt) || {};
                    const isMeas = inferred.isMeasure || this._isMeasure(tgt);
                    const isKey = inferred.isKey || (tgt === 'MANDT');

                    viewElements[tgt] = {
                        ...this._toCsnType(inferred.dataType || 'cds.String(40)'),
                        "@EndUserText.label": tgt,
                        ...(isKey ? { key: true } : {}),
                        ...(isMeas ? { '@Analytics.measure': true, '@Aggregation.default': '#SUM' } : {})
                    };
                }

                // Add calculated attributes on this PROJECTION node
                for (const ca of (node.calculatedAttributes || [])) {
                    const colId = ca.id;
                    if (seenTargets.has(colId)) continue;
                    seenTargets.add(colId);

                    const formula = ca.formula || '';
                    if (/^\d+$/.test(formula.trim())) {
                        const numVal = parseInt(formula.trim(), 10);
                        selectCols.push(`    ${numVal} AS "${colId}"`);
                        cqnCols.push({ val: numVal, as: colId });
                    } else if (/^'.*'$/.test(formula.trim())) {
                        const strVal = formula.trim().slice(1, -1);
                        selectCols.push(`    '${strVal}' AS "${colId}"`);
                        cqnCols.push({ val: strVal, as: colId });
                    } else {
                        selectCols.push(`    ${formula} AS "${colId}"`);
                        const colRefMatch = formula.match(/"([^"]+)"/);
                        if (colRefMatch && colRefMatch[1] && colRefMatch[1] !== colId) {
                            cqnCols.push({ ref: [colRefMatch[1]], as: colId });
                        } else {
                            cqnCols.push({ ref: [colId] });
                        }
                    }

                    const dt = this._mapHanaTypeToCds(ca.dataType, ca.length, ca.precision, ca.scale);
                    const inferred = (model.columns || []).find(c => c.name === colId) || {};
                    const isMeas = inferred.isMeasure || this._isMeasure(colId);

                    viewElements[colId] = {
                        ...this._toCsnType(dt),
                        "@EndUserText.label": colId,
                        ...(isMeas ? { '@Analytics.measure': true, '@Aggregation.default': '#SUM' } : {})
                    };
                }

                if (Object.keys(viewElements).length === 0) {
                    const candidateCols = (model.columns && model.columns.length > 0) ? model.columns : [{ name: 'ID', isKey: true }];
                    for (const c of candidateCols) {
                        viewElements[c.name] = {
                            ...this._toCsnType(c.dataType || 'cds.String(40)'),
                            "@EndUserText.label": c.originalName || c.name,
                            ...(c.isKey ? { key: true } : {}),
                            ...(c.isMeasure ? { '@Analytics.measure': true, '@Aggregation.default': '#SUM' } : {})
                        };
                        selectCols.push(`    "${c.name}"`);
                        cqnCols.push({ ref: [c.name] });
                    }
                }

                if (isRoot && semanticCategory === '#CUBE') {
                    const hasMeasuresInView = Object.values(viewElements).some(el => el['@Analytics.measure']);
                    if (!hasMeasuresInView) {
                        viewElements["RECORD_COUNT"] = {
                            type: "cds.Integer",
                            "@EndUserText.label": "Record Count",
                            "@Analytics.measure": true,
                            "@Aggregation.default": "#SUM"
                        };
                        selectCols.push('    1 AS "RECORD_COUNT"');
                        cqnCols.push({ val: 1, as: "RECORD_COUNT" });
                    }
                }

                ensureKey(viewElements);

                nodeSql = `SELECT\n${selectCols.join(',\n')}\nFROM "${srcTech}"`;

                nodeViewDef = {
                    kind: "entity",
                    "@EndUserText.label": nodeLabel,
                    ...(isRoot && semanticCategory ? { "@Analytics.dataCategory": semanticCategory } : {}),
                    elements: viewElements,
                    query: {
                        SELECT: {
                            from: { ref: [srcTech] },
                            columns: cqnCols
                        }
                    }
                };

                tierSqls.push({
                    tier: tierIndex++,
                    nodeId: node.id,
                    viewTechName: nodeTech,
                    label: nodeLabel,
                    sql: nodeSql,
                    inputs: [srcTech]
                });

            } else if (node.type === 'UNION') {
                const unionSqlBranches = [];
                const unionCqnBranches = [];
                const inputsList = [];

                const unionElements = {};
                for (const col of normalizedCols) {
                    if (col.targetName === 'RECORD_COUNT') continue;
                    const inferred = (model.columns || []).find(c => c.name === col.targetName) || {};
                    const dt = col.dataType || inferred.dataType || 'cds.String(100)';
                    unionElements[col.targetName] = {
                        ...this._toCsnType(dt),
                        "@EndUserText.label": col.targetName,
                        ...(col.isKey ? { key: true } : {})
                    };
                }
                if (isRoot && semanticCategory === '#CUBE') {
                    unionElements["RECORD_COUNT"] = {
                        type: "cds.Integer",
                        "@EndUserText.label": "Record Count",
                        "@Analytics.measure": true,
                        "@Aggregation.default": "#SUM"
                    };
                }
                ensureKey(unionElements);

                for (const rawInput of (node.inputs || [])) {
                    const branchTech = getNodeTechName(rawInput);
                    inputsList.push(branchTech);
                    const branchMappings = (node.mappings || []).filter(m => m.inputNode === rawInput);

                    const branchSelectCols = [];
                    const branchCqnCols = [];

                    for (const col of normalizedCols) {
                        if (col.targetName === 'RECORD_COUNT') continue;
                        const mapEntry = branchMappings.find(m => m.target === col.targetName);
                        if (mapEntry && mapEntry.source) {
                            const src = mapEntry.source;
                            const tgt = mapEntry.target;
                            if (src === tgt) {
                                branchSelectCols.push(`    "${src}"`);
                                branchCqnCols.push({ ref: [src] });
                            } else {
                                branchSelectCols.push(`    "${src}" AS "${tgt}"`);
                                branchCqnCols.push({ ref: [src], as: tgt });
                            }
                        } else {
                            branchSelectCols.push(`    NULL AS "${col.targetName}"`);
                            branchCqnCols.push({ val: null, as: col.targetName });
                        }
                    }

                    if (isRoot && semanticCategory === '#CUBE') {
                        branchSelectCols.push('    1 AS "RECORD_COUNT"');
                        branchCqnCols.push({ val: 1, as: "RECORD_COUNT" });
                    }

                    unionSqlBranches.push(`SELECT\n${branchSelectCols.join(',\n')}\nFROM "${branchTech}"`);
                    unionCqnBranches.push({
                        SELECT: {
                            from: { ref: [branchTech] },
                            columns: branchCqnCols
                        }
                    });
                }

                nodeSql = unionSqlBranches.join('\n\nUNION ALL\n\n');

                nodeViewDef = {
                    kind: "entity",
                    "@EndUserText.label": nodeLabel,
                    ...(isRoot && semanticCategory ? { "@Analytics.dataCategory": semanticCategory } : {}),
                    elements: unionElements,
                    query: {
                        SET: {
                            op: "union",
                            all: true,
                            args: unionCqnBranches
                        }
                    }
                };

                tierSqls.push({
                    tier: tierIndex++,
                    nodeId: node.id,
                    viewTechName: nodeTech,
                    label: nodeLabel,
                    sql: nodeSql,
                    inputs: inputsList
                });
            }

            if (nodeViewDef) {
                definitions[nodeTech] = nodeViewDef;
            }
        }

        definitions[amTechName] = amDefinition;

        // Inlined Pure SELECT Query (Zero CTE WITH clauses, valid for Datasphere SQL View)
        let inlinedPureSql = '';
        if (rootNode && rootNode.type === 'UNION') {
            const inlinedBranches = [];
            for (const rawInput of (rootNode.inputs || [])) {
                const childNode = nodeHierarchy.find(n => n.id === rawInput);
                const branchMappings = (rootNode.mappings || []).filter(m => m.inputNode === rawInput);

                const branchSelectCols = [];
                for (const col of normalizedCols) {
                    if (col.targetName === 'RECORD_COUNT') continue;
                    const mapEntry = branchMappings.find(m => m.target === col.targetName);
                    if (mapEntry && mapEntry.source) {
                        const src = mapEntry.source;
                        const tgt = mapEntry.target;
                        branchSelectCols.push(src === tgt ? `        "${src}"` : `        "${src}" AS "${tgt}"`);
                    } else {
                        branchSelectCols.push(`        NULL AS "${col.targetName}"`);
                    }
                }
                if (semanticCategory === '#CUBE') {
                    branchSelectCols.push('        1 AS "RECORD_COUNT"');
                }

                if (childNode && childNode.type === 'JOIN') {
                    const rawLeft = childNode.inputs[0];
                    const rawRight = childNode.inputs[1];
                    const leftTable = collapsedNodes[rawLeft] ? collapsedNodes[rawLeft].targetTable : rawLeft;
                    const rightTable = collapsedNodes[rawRight] ? collapsedNodes[rawRight].targetTable : rawRight;

                    const joinAttrs = (childNode.joinAttributes && childNode.joinAttributes.length > 0) ? childNode.joinAttributes : ['MANDT'];
                    const onConditions = joinAttrs.map(attr => `A."${attr}" = B."${attr}"`).join(' AND ');

                    const innerCols = [];
                    const seenInner = new Set();
                    for (const m of (childNode.mappings || [])) {
                        const isLeft = (m.inputNode === rawLeft) || (collapsedNodes[rawLeft] && m.inputNode === collapsedNodes[rawLeft].targetTable);
                        const alias = isLeft ? "A" : "B";
                        if (seenInner.has(m.target)) continue;
                        seenInner.add(m.target);
                        innerCols.push(`        ${alias}."${m.source}" AS "${m.target}"`);
                    }

                    inlinedBranches.push(
                        `SELECT\n${branchSelectCols.join(',\n')}\nFROM (\n` +
                        `    SELECT\n${innerCols.join(',\n')}\n` +
                        `    FROM "${leftTable}" AS A\n` +
                        `    ${childNode.joinType || 'LEFT OUTER JOIN'} "${rightTable}" AS B\n` +
                        `      ON ${onConditions}\n` +
                        `) AS "${childNode.id}"`
                    );
                } else if (childNode && childNode.type === 'PROJECTION') {
                    const srcTable = collapsedNodes[childNode.inputs[0]] ? collapsedNodes[childNode.inputs[0]].targetTable : childNode.inputs[0];
                    inlinedBranches.push(
                        `SELECT\n${branchSelectCols.join(',\n')}\nFROM "${srcTable}" AS "${childNode.id}"`
                    );
                } else {
                    const srcTech = getNodeTechName(rawInput);
                    inlinedBranches.push(
                        `SELECT\n${branchSelectCols.join(',\n')}\nFROM "${srcTech}" AS "${rawInput}"`
                    );
                }
            }
            inlinedPureSql = inlinedBranches.join('\n\nUNION ALL\n\n');
        }

        // Auto-Healing Pass: Guarantee every base table defines all columns queried by any intermediate view
        for (const [vName, vDef] of Object.entries(definitions)) {
            if (vDef.kind !== 'entity' || !vDef.query?.SELECT) continue;

            const qSelect = vDef.query.SELECT;
            const fromRef = qSelect.from?.ref?.[0];
            const joinArgs = qSelect.from?.args;

            const ensureTableCol = (targetTable, colName) => {
                if (!targetTable || !colName) return;
                const tbl = definitions[targetTable];
                // Only modify physical base tables (entities without query)
                if (tbl && tbl.kind === 'entity' && !tbl.query) {
                    if (!tbl.elements) tbl.elements = {};
                    if (!tbl.elements[colName]) {
                        const inferredDt = this._inferColumnDataType(colName);
                        tbl.elements[colName] = {
                            ...this._toCsnType(inferredDt),
                            "@EndUserText.label": colName
                        };
                        ensureKey(tbl.elements);
                    }
                }
            };

            // Single source view: e.g. FROM "PA0000"
            if (fromRef) {
                for (const col of (qSelect.columns || [])) {
                    const colName = Array.isArray(col.ref) ? col.ref[col.ref.length - 1] : (typeof col === 'string' ? col : null);
                    if (colName) ensureTableCol(fromRef, colName);
                }
            }

            // Join view: e.g. FROM "A" JOIN "B"
            if (joinArgs && Array.isArray(joinArgs)) {
                const aliasMap = {};
                for (const arg of joinArgs) {
                    if (arg.as && arg.ref?.[0]) {
                        aliasMap[arg.as] = arg.ref[0];
                    }
                }
                for (const col of (qSelect.columns || [])) {
                    if (Array.isArray(col.ref)) {
                        if (col.ref.length >= 2) {
                            const alias = col.ref[0];
                            const colName = col.ref[1];
                            const realTable = aliasMap[alias];
                            if (realTable) ensureTableCol(realTable, colName);
                        } else if (col.ref.length === 1) {
                            const colName = col.ref[0];
                            for (const realTable of Object.values(aliasMap)) {
                                ensureTableCol(realTable, colName);
                            }
                        }
                    }
                }
                // Check join ON conditions
                const checkOnList = (list) => {
                    if (!list || !Array.isArray(list)) return;
                    for (const item of list) {
                        if (item && Array.isArray(item.ref) && item.ref.length >= 2) {
                            const realTable = aliasMap[item.ref[0]];
                            if (realTable) ensureTableCol(realTable, item.ref[1]);
                        }
                    }
                };
                checkOnList(qSelect.from.on);
            }
        }

        // Final pass: Hydrate ALL base physical entities in definitions with complete table catalog
        for (const [tblName, tblDef] of Object.entries(definitions)) {
            if (tblDef.kind === 'entity' && !tblDef.query) {
                this._hydrateTableWithCatalog(tblName, tblDef);
                ensureKey(tblDef.elements);
            }
        }

        return {
            packageCsn: {
                $version: "2.0",
                definitions: definitions
            },
            tierSqls: tierSqls,
            inlinedPureSql: inlinedPureSql
        };
    }

    /**
     * Analyze source tables across multiple models to find shared tables and deduplicate dependencies
     * @param {Array} models Array of extracted view models
     */
    rationalizeSources(models = []) {
        const sourceMap = {};

        for (const model of models) {
            const viewName = model.name || model.viewName;
            const sources = (model.sources && model.sources.length > 0) 
                ? model.sources 
                : (model.dependencies && model.dependencies.length > 0)
                    ? model.dependencies.map(d => ({ tableName: d.BASE_OBJECT_NAME }))
                    : [{ tableName: `${viewName}_SOURCE` }];

            for (const src of sources) {
                const tbl = (src.tableName || '').toUpperCase();
                if (!tbl) continue;
                if (!sourceMap[tbl]) {
                    sourceMap[tbl] = {
                        tableName: tbl,
                        views: new Set(),
                        columns: new Set(),
                        isMasterData: this._isMasterData(tbl)
                    };
                }
                sourceMap[tbl].views.add(viewName);

                for (const col of (model.columns || [])) {
                    sourceMap[tbl].columns.add(col.name);
                }
            }
        }

        const overlaps = [];
        let duplicateCount = 0;

        for (const [tbl, data] of Object.entries(sourceMap)) {
            const refViews = Array.from(data.views);
            const isShared = refViews.length > 1;
            if (isShared) duplicateCount++;

            let suggestedLayer = 'DEDICATED_FACT';
            if (data.isMasterData) {
                suggestedLayer = 'SHARED_DIMENSION';
            } else if (isShared) {
                suggestedLayer = 'SHARED_LOCAL_TABLE';
            }

            overlaps.push({
                tableName: tbl,
                referencedByViews: refViews,
                referenceCount: refViews.length,
                suggestedLayer,
                sharedColumns: Array.from(data.columns).slice(0, 30)
            });
        }

        overlaps.sort((a, b) => b.referenceCount - a.referenceCount);

        const recommendations = [];
        if (duplicateCount > 0) {
            recommendations.push(`Found ${duplicateCount} shared source table(s) across ${models.length} views. Deduplicating them eliminates redundant replication.`);
            const sharedTables = overlaps.filter(o => o.referenceCount > 1).map(o => o.tableName);
            recommendations.push(`Create single shared base tables for: ${sharedTables.join(', ')}.`);
            const masterData = overlaps.filter(o => o.suggestedLayer === 'SHARED_DIMENSION').map(o => o.tableName);
            if (masterData.length > 0) {
                recommendations.push(`Convert master data tables (${masterData.join(', ')}) into reusable Dimension Views shared across fact models.`);
            }
        } else {
            recommendations.push('No source overlap detected across the selected views. Each view operates on independent base sources.');
        }

        return {
            totalViewsAnalyzed: models.length,
            uniqueSourcesFound: Object.keys(sourceMap).length,
            duplicateSourceCount: duplicateCount,
            overlaps,
            recommendations
        };
    }

    _isMasterData(tableName) {
        if (!tableName) return false;
        const name = tableName.toUpperCase();
        const masterPatterns = [
            'MARA', 'MAKT', 'MARC', 'MARD', 'T001', 'T001W', 'T001K', 'KNA1', 'LFA1', 
            'BNKA', 'BANK', 'SKA1', 'SKB1', 'CSKS',
            'CUSTOMER', 'MATERIAL', 'PLANT', 'COMPANY', 'VENDOR', 'DIM_', 'DIMENSION', 
            'WORK_CENTER', 'WORKCENTER', 'SHIFT', 'CALENDAR', 'TEXT', 'CATEGORY'
        ];
        return masterPatterns.some(p => name.includes(p));
    }

    /**
     * Generate Datasphere Replication Flow definition targeting Local Tables
     * @param {object} options Configuration for replication flow
     */
    generateReplicationFlow(options = {}) {
        const flowName = options.flowName || 'RF_AIS_HARMONIZATION';
        const description = options.description || 'Replication Flow to Datasphere Local Tables';
        const sourceConnection = options.sourceConnection || 'S4HANA_SOURCE';
        const targetSpace = options.targetSpace || 'AIS_HARMONIZATION_';
        const tasks = (options.tasks || []).map(t => {
            const isMaster = t.category === 'MasterData' || (t.loadType === 'Initial') || this._isMasterData(t.sourceObject);
            const loadType = t.loadType || (isMaster ? 'Initial' : 'InitialAndDelta');
            const category = t.category || (isMaster ? 'MasterData' : 'TransactionalData');
            return {
                sourceObject: t.sourceObject,
                targetObject: t.targetObject || `${t.sourceObject}_TBL`,
                category: category,
                loadType: loadType,
                truncate: isMaster,
                status: 'Configured',
                description: t.description || `Replication of ${t.sourceObject} into Local Table ${t.targetObject || `${t.sourceObject}_TBL`}`
            };
        });

        const flowDefinition = {
            $schema: "https://schema.datasphere.cloud.sap/replicationflow/v1/schema.json",
            version: "1.0.0",
            name: flowName,
            description: description,
            source: {
                connection: sourceConnection
            },
            target: {
                connection: "LOCAL",
                containerType: "LocalTable",
                space: targetSpace
            },
            settings: {
                allowMissingDependencies: true,
                autoCreateTargetTables: true
            },
            tasks: tasks
        };

        const cliDeployCommand = `datasphere objects replication-flows create -y ${targetSpace} -f -f ${flowName}.replicationFlow.json`;

        return {
            flowDefinition,
            flowJsonString: JSON.stringify(flowDefinition, null, 2),
            cliDeployCommand,
            taskCount: tasks.length
        };
    }

    /**
     * Generate a single Master CSN Bundle containing all deduplicated tables, views, and AMs
     * @param {Array} models Array of extracted view models
     * @param {object} options Configuration (space, namingPattern, deduplicationDecisions)
     */
    generateBulkArtifacts(models = [], options = {}) {
        const space = options.space || 'AIS_HARMONIZATION_';
        const namingPattern = options.namingPattern || 'DEFAULT';
        const sourceConnection = options.sourceConnection || 'S4HANA_SOURCE';
        
        let decisions = {};
        if (typeof options.deduplicationDecisions === 'string') {
            try {
                decisions = JSON.parse(options.deduplicationDecisions);
            } catch (e) {
                decisions = {};
            }
        } else if (typeof options.deduplicationDecisions === 'object' && options.deduplicationDecisions !== null) {
            decisions = options.deduplicationDecisions;
        }

        const masterDefinitions = {};
        const sqlStatements = [];
        const processedViews = [];
        const replicationTasks = [];

        // 1. Analyze and build deduplicated base tables
        const rationalization = this.rationalizeSources(models);

        for (const overlap of rationalization.overlaps) {
            const tableTechName = overlap.tableName;
            // Decision: BLOCK = merge into 1 shared table. KEEP = keep duplicates per view.
            const decision = decisions[tableTechName] || 'BLOCK';
            if (decision === 'BLOCK') {
                const elements = {};
                for (const colName of overlap.sharedColumns) {
                    elements[colName] = {
                        type: 'cds.String',
                        length: 40,
                        '@EndUserText.label': colName
                    };
                }
                masterDefinitions[tableTechName] = {
                    kind: 'entity',
                    '@EndUserText.label': `${tableTechName} Shared Base Table`,
                    elements
                };

                const isMaster = this._isMasterData(tableTechName);
                replicationTasks.push({
                    sourceObject: tableTechName,
                    targetObject: tableTechName,
                    category: isMaster ? 'MasterData' : 'TransactionalData',
                    loadType: isMaster ? 'Initial' : 'InitialAndDelta',
                    description: `${isMaster ? 'Master Data Snapshot' : 'Transactional Delta'} replication for shared ${tableTechName}`
                });
            }
        }

        // 2. Generate each view projecting from deduplicated (or isolated) tables
        for (const model of models) {
            const baseName = model.name || model.viewName;
            const viewTechName = `${baseName}_V`;
            const amTechName = `${baseName}_AM`;

            const rawFirstSource = (model.sources && model.sources[0]?.tableName) || 
                                   (model.dependencies && model.dependencies[0]?.BASE_OBJECT_NAME) || 
                                   `${baseName}_SOURCE`;
            const upperSource = rawFirstSource.toUpperCase();

            // Check if decision for upperSource is KEEP duplicate
            let fromSource = upperSource;
            const decision = decisions[upperSource] || 'BLOCK';
            if (decision === 'KEEP') {
                fromSource = `${baseName}_${upperSource}`;
            }

            if (!masterDefinitions[fromSource]) {
                const elements = {};
                for (const c of (model.columns || [])) {
                    elements[c.name] = {
                        ...this._toCsnType(c.dataType),
                        '@EndUserText.label': c.originalName || c.name,
                        ...(c.isKey ? { key: true } : {})
                    };
                }
                masterDefinitions[fromSource] = {
                    kind: 'entity',
                    '@EndUserText.label': `${fromSource} Base Table`,
                    elements
                };

                const isMaster = this._isMasterData(fromSource);
                replicationTasks.push({
                    sourceObject: upperSource,
                    targetObject: fromSource,
                    category: isMaster ? 'MasterData' : 'TransactionalData',
                    loadType: isMaster ? 'Initial' : 'InitialAndDelta',
                    description: `Replication of ${upperSource} into Local Table ${fromSource}`
                });
            }

            const viewElements = {};
            const amElements = {};
            const queryColumns = [];
            const sqlSelectCols = [];

            for (const col of (model.columns || [])) {
                let targetName = col.name;
                if (namingPattern === 'PASCAL') {
                    targetName = targetName.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase()).replace(/^[a-z]/, ch => ch.toUpperCase());
                } else if (namingPattern === 'UPPER_SNAKE') {
                    targetName = targetName.replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[\s\-]+/g, '_').toUpperCase();
                }

                const isNumeric = col.dataType && (col.dataType.includes('Decimal') || col.dataType.includes('Integer'));
                const isMeasure = col.isMeasure || this._isMeasure(col.name);

                viewElements[targetName] = {
                    ...this._toCsnType(col.dataType),
                    '@EndUserText.label': col.originalName || targetName,
                    ...(col.isKey ? { key: true } : {}),
                    ...(isMeasure ? { '@Analytics.measure': true, '@Aggregation.default': '#SUM' } : {})
                };

                amElements[targetName] = {
                    ...this._toCsnType(col.dataType),
                    '@EndUserText.label': col.originalName || targetName,
                    ...(isMeasure ? { '@Analytics.measure': true, '@Aggregation.default': '#SUM' } : { '@Analytics.dimension': true })
                };

                queryColumns.push(targetName !== col.name ? { ref: [col.name], as: targetName } : { ref: [col.name] });

                if (isMeasure || (isNumeric && !col.isKey)) {
                    sqlSelectCols.push(`    COALESCE("${col.name}", 0) AS "${targetName}"`);
                } else {
                    sqlSelectCols.push(targetName !== col.name ? `    "${col.name}" AS "${targetName}"` : `    "${col.name}"`);
                }
            }

            masterDefinitions[viewTechName] = {
                kind: 'entity',
                '@EndUserText.label': `${baseName} Analytical Fact View`,
                '@Analytics.dataCategory': '#CUBE',
                elements: viewElements,
                query: {
                    SELECT: {
                        from: { ref: [fromSource] },
                        columns: queryColumns
                    }
                }
            };

            masterDefinitions[amTechName] = {
                kind: 'analyticModel',
                '@EndUserText.label': `${baseName} Consumption Model`,
                source: { ref: [viewTechName] },
                elements: amElements
            };

            const viewQuerySql = `SELECT\n` + sqlSelectCols.join(',\n') + `\nFROM "${fromSource}"`;
            sqlStatements.push(`-- ==========================================================\n-- View: ${viewTechName} (Target: New SQL View in Datasphere)\n-- Source: ${fromSource}\n-- ==========================================================\n${viewQuerySql};\n`);

            processedViews.push({
                viewName: baseName,
                viewType: model.viewType || ((baseName.startsWith('CA_') || baseName.startsWith('CV_')) ? 'CALC_VIEW' : 'CDS'),
                columns: (model.columns || []).length
            });
        }

        const ensureKey = (elements) => {
            if (!elements || Object.keys(elements).length === 0) return;
            const hasKey = Object.values(elements).some(el => el.key);
            if (!hasKey) {
                const candidate = Object.keys(elements).find(k => !elements[k]['@Analytics.measure']) || Object.keys(elements)[0];
                if (candidate) elements[candidate].key = true;
            }
        };

        for (const def of Object.values(masterDefinitions)) {
            if (def.kind === 'entity' && def.elements) {
                ensureKey(def.elements);
            }
        }

        const masterCsn = {
            $version: "2.0",
            definitions: masterDefinitions
        };

        const tableCount = Object.values(masterDefinitions).filter(d => d.kind === 'entity' && !d.query).length;
        const viewCount = Object.values(masterDefinitions).filter(d => d.kind === 'entity' && d.query).length;

        // Generate enterprise replication flow targeting local tables
        const rfResult = this.generateReplicationFlow({
            flowName: 'RF_AIS_HARMONIZATION_ENTERPRISE',
            description: `Enterprise Replication Flow for ${processedViews.length} views (${tableCount} Local Tables in ${space})`,
            sourceConnection: sourceConnection,
            targetSpace: space,
            tasks: replicationTasks
        });

        return {
            masterCsn,
            masterCsnJsonString: JSON.stringify(masterCsn, null, 2),
            aggregatedSql: sqlStatements.join('\n'),
            replicationFlowJsonString: rfResult.flowJsonString,
            replicationFlowCliCommand: rfResult.cliDeployCommand,
            processedViewCount: processedViews.length,
            tableCount,
            viewCount,
            views: processedViews
        };
    }

    /**
     * Extract underlying base tables from multiple models and deduplicate them into canonical tables
     * with merged superset columns and delta key harmonization.
     * 
     * @param {Array} models Array of extracted view/table models
     * @returns {Array} Deduplicated table summaries
     */
    extractAndDeduplicateTables(models = []) {
        const tableMap = {};

        const sanitizeTech = (name) => {
            const raw = (name || '').trim().replace(/^[\/\\]+/, '').replace(/[\/\\]+/g, '_').replace(/[^a-zA-Z0-9_]/g, '_');
            return /^[0-9]/.test(raw) ? `_${raw}` : raw;
        };

        for (const model of models) {
            const viewName = model.name || model.viewName || 'VIEW';
            
            // 1. Collect all underlying physical table sources for this model
            const physicalSources = new Set();

            if (model.type === 'TABLE') {
                physicalSources.add(viewName.toUpperCase());
            }

            if (Array.isArray(model.sources) && model.sources.length > 0) {
                for (const s of model.sources) {
                    const srcTable = (s.tableName || s.name || '').toUpperCase().trim();
                    if (srcTable && srcTable !== 'DUMMY') {
                        // Strip schema prefix if any (e.g. SAPHANADB.ACDOCA -> ACDOCA)
                        const cleanTbl = srcTable.includes('.') ? srcTable.split('.').pop() : srcTable;
                        physicalSources.add(cleanTbl);
                    }
                }
            }

            if (Array.isArray(model.nodeHierarchy) && model.nodeHierarchy.length > 0) {
                for (const node of model.nodeHierarchy) {
                    if (node.type === 'DATA_SOURCE' || node.type === 'PROJECTION') {
                        if (node.inputs && Array.isArray(node.inputs)) {
                            for (const input of node.inputs) {
                                const cleanInput = (input || '').toUpperCase().trim();
                                if (cleanInput && !cleanInput.startsWith('P_') && cleanInput !== 'DUMMY') {
                                    const cleanTbl = cleanInput.includes('.') ? cleanInput.split('.').pop() : cleanInput;
                                    physicalSources.add(cleanTbl);
                                }
                            }
                        }
                    }
                }
            }

            if (Array.isArray(model.dependencies) && model.dependencies.length > 0) {
                for (const dep of model.dependencies) {
                    if (dep.BASE_OBJECT_TYPE === 'TABLE' || !dep.BASE_OBJECT_TYPE) {
                        const depTbl = (dep.BASE_OBJECT_NAME || '').toUpperCase().trim();
                        if (depTbl && depTbl !== 'DUMMY') {
                            const cleanTbl = depTbl.includes('.') ? depTbl.split('.').pop() : depTbl;
                            physicalSources.add(cleanTbl);
                        }
                    }
                }
            }

            // Fallback: If no underlying source tables were discovered, treat the view name itself as base
            if (physicalSources.size === 0) {
                const clean = viewName.toUpperCase().replace(/^CV_|^CA_|^V_/, '');
                physicalSources.add(clean || viewName.toUpperCase());
            }

            // 2. Associate referencing views & merge column superset for each base table
            const modelCols = Array.isArray(model.columns) ? model.columns : [];

            for (const rawTbl of physicalSources) {
                const tbl = rawTbl.toUpperCase();
                if (!tableMap[tbl]) {
                    const sClean = sanitizeTech(tbl);
                    const isMaster = this._isMasterData(tbl);
                    tableMap[tbl] = {
                        sourceTable: tbl,
                        targetTable: `${sClean}_TBL`,
                        businessName: `${sClean} Local Table`,
                        category: isMaster ? 'MasterData' : 'TransactionalData',
                        loadType: isMaster ? 'Initial' : 'InitialAndDelta',
                        referencingViews: new Set(),
                        columnsMap: {}
                    };
                }

                tableMap[tbl].referencingViews.add(viewName);

                // Merge column definitions into superset
                for (const col of modelCols) {
                    const colName = col.name || col.sourceName;
                    if (!colName) continue;

                    const uCol = colName.toUpperCase();
                    const isColKey = Boolean(col.isKey) || uCol === 'MANDT' || uCol === 'CLIENT' || uCol === 'ID';
                    const isColMeasure = Boolean(col.isMeasure) || this._isMeasure(colName);
                    const dt = col.dataType || 'cds.String(40)';
                    const label = col.originalName || col.targetLabel || col.name;

                    if (!tableMap[tbl].columnsMap[colName]) {
                        tableMap[tbl].columnsMap[colName] = {
                            sourceName: colName,
                            targetName: colName,
                            targetLabel: label,
                            dataType: dt,
                            isKey: isColKey,
                            isMeasure: isColMeasure
                        };
                    } else {
                        // Merge attributes
                        const existing = tableMap[tbl].columnsMap[colName];
                        if (isColKey) existing.isKey = true;
                        if (isColMeasure) existing.isMeasure = true;
                        if (label && (!existing.targetLabel || existing.targetLabel === colName)) {
                            existing.targetLabel = label;
                        }
                        if (dt && dt !== 'cds.String(40)' && existing.dataType === 'cds.String(40)') {
                            existing.dataType = dt;
                        }
                    }
                }
            }
        }

        // Convert tableMap into formatted output array
        const result = Object.values(tableMap).map(t => {
            const refViews = Array.from(t.referencingViews);
            const cols = Object.values(t.columnsMap);

            // Sort columns: primary keys first, then alphabetical
            cols.sort((a, b) => {
                if (a.isKey && !b.isKey) return -1;
                if (!a.isKey && b.isKey) return 1;
                return a.sourceName.localeCompare(b.sourceName);
            });

            // Ensure at least one key if keys are missing
            if (cols.length > 0 && !cols.some(c => c.isKey)) {
                const mandt = cols.find(c => c.sourceName.toUpperCase() === 'MANDT');
                if (mandt) mandt.isKey = true;
                else cols[0].isKey = true;
            }

            return {
                sourceTable: t.sourceTable,
                targetTable: t.targetTable,
                businessName: t.businessName,
                category: t.category,
                loadType: t.loadType,
                referencingViews: refViews,
                referencingViewCount: refViews.length,
                columnCount: cols.length,
                columns: cols,
                isDeduplicated: refViews.length > 1
            };
        });

        // Sort deduplicated/most-shared tables first
        result.sort((a, b) => b.referencingViewCount - a.referencingViewCount || a.sourceTable.localeCompare(b.sourceTable));
        return result;
    }

    /**
     * Generate complete Deduplicated Multi-Table Replication Package:
     * - Synchronized Table CSN Bundle ($version: "2.0")
     * - Synchronized Native Datasphere Replication Flow JSON
     * - Guaranteed 100% technical name parity across all artifacts
     * 
     * @param {Array} models Array of extracted view models
     * @param {object} options Configuration (space, sourceConnection, flowName, tableOverrides)
     */
    generateDeduplicatedMultiTableReplicationPackage(models = [], options = {}) {
        const space = (options.space || 'AIS_INBOUND').trim();
        const sourceConnection = (options.sourceConnection || 'S4HANA_SOURCE').trim();
        const flowName = (options.flowName || 'RF_DEDUPLICATED_ENTERPRISE').trim();
        const flowDescription = options.flowDescription || `Enterprise Deduplicated Replication Flow targeting Local Tables in ${space}`;

        // 1. Extract deduplicated base tables and superset columns
        const deduplicatedTables = this.extractAndDeduplicateTables(models);

        // Parse tableOverrides if string
        let overrides = {};
        if (typeof options.tableOverrides === 'string') {
            try {
                overrides = JSON.parse(options.tableOverrides);
            } catch (e) {
                overrides = {};
            }
        } else if (typeof options.tableOverrides === 'object' && options.tableOverrides !== null) {
            overrides = options.tableOverrides;
        }

        // Support overrides either as { "BNKA": { ... } } or [ { sourceTable: "BNKA", ... } ]
        const overrideMap = {};
        if (Array.isArray(overrides)) {
            for (const o of overrides) {
                if (o.sourceTable) overrideMap[o.sourceTable.toUpperCase()] = o;
            }
        } else {
            for (const [k, v] of Object.entries(overrides)) {
                overrideMap[k.toUpperCase()] = v;
            }
        }

        const sanitizeTech = (name, fallback) => {
            const raw = (name || fallback || '').trim().replace(/^[\/\\]+/, '').replace(/[\/\\]+/g, '_').replace(/[^a-zA-Z0-9_]/g, '_');
            return /^[0-9]/.test(raw) ? `_${raw}` : raw;
        };

        const targetTableDefinitions = {};
        const replicationTasks = [];
        const processedTables = [];
        const individualTableCsns = {};

        for (const tbl of deduplicatedTables) {
            const override = overrideMap[tbl.sourceTable.toUpperCase()] || {};

            // If explicitly excluded by user, skip
            if (override.selected === false) continue;

            const finalTargetTechName = sanitizeTech(override.targetTable || tbl.targetTable, `${tbl.sourceTable}_TBL`);
            const finalBusinessName = override.businessName || tbl.businessName || `${tbl.sourceTable} Local Table`;
            const finalLoadType = override.loadType || tbl.loadType || 'Initial';
            const finalCategory = override.category || tbl.category || (finalLoadType === 'Initial' ? 'MasterData' : 'TransactionalData');

            // Columns to include (use override columns if present, otherwise default superset)
            const activeCols = (override.columns && Array.isArray(override.columns) && override.columns.length > 0)
                ? override.columns.filter(c => c.selected !== false)
                : tbl.columns;

            // Build CSN Elements
            const elements = {};
            for (const col of activeCols) {
                const targetColName = sanitizeTech(col.targetName || col.sourceName, col.sourceName);
                const isKey = Boolean(col.isKey);
                elements[targetColName] = {
                    ...this._toCsnType(col.dataType),
                    '@EndUserText.label': col.targetLabel || col.sourceName,
                    ...(isKey ? { key: true } : {})
                };
            }

            // Ensure at least 1 key element
            const hasKey = Object.values(elements).some(el => el.key);
            if (!hasKey && Object.keys(elements).length > 0) {
                const mandtKey = Object.keys(elements).find(k => k.toUpperCase() === 'MANDT') || Object.keys(elements)[0];
                elements[mandtKey].key = true;
            }

            // 1. Add to CSN Bundle (Keyed by the exact finalTargetTechName!)
            targetTableDefinitions[finalTargetTechName] = {
                kind: "entity",
                "@EndUserText.label": finalBusinessName,
                elements: elements
            };

            // Individual Table CSN for single-table CLI or import
            individualTableCsns[finalTargetTechName] = {
                $version: "2.0",
                definitions: {
                    [finalTargetTechName]: targetTableDefinitions[finalTargetTechName]
                }
            };

            // 2. Add to Replication Flow Task (Target is the exact same finalTargetTechName!)
            const isMaster = finalLoadType === 'Initial' || finalCategory === 'MasterData';
            replicationTasks.push({
                sourceObject: tbl.sourceTable,
                targetObject: finalTargetTechName,
                category: finalCategory,
                loadType: finalLoadType,
                truncate: isMaster,
                status: 'Configured',
                description: `Replication of ${tbl.sourceTable} into Local Table ${finalTargetTechName}`
            });

            processedTables.push({
                sourceTable: tbl.sourceTable,
                targetTable: finalTargetTechName,
                businessName: finalBusinessName,
                category: finalCategory,
                loadType: finalLoadType,
                referencingViews: tbl.referencingViews,
                referencingViewCount: tbl.referencingViewCount,
                columnCount: Object.keys(elements).length,
                columns: activeCols,
                isDeduplicated: tbl.isDeduplicated
            });
        }

        // Master Target Tables CSN
        const targetTablesCsn = {
            $version: "2.0",
            definitions: targetTableDefinitions
        };

        // Native Datasphere Replication Flow JSON
        const flowDefinition = {
            $schema: "https://schema.datasphere.cloud.sap/replicationflow/v1/schema.json",
            version: "1.0.0",
            name: flowName,
            description: flowDescription,
            source: {
                connection: sourceConnection
            },
            target: {
                connection: "LOCAL",
                containerType: "LocalTable",
                space: space
            },
            settings: {
                allowMissingDependencies: true,
                autoCreateTargetTables: true
            },
            tasks: replicationTasks
        };

        const cliDeployFlowCommand = `datasphere objects replication-flows create -y ${space} -f ${flowName}.replicationFlow.json`;
        const cliDeployTablesCommand = processedTables.map(t => 
            `datasphere objects local-tables create -y ${space} -f ${t.targetTable}.table.json`
        ).join('\n');

        return {
            flowName,
            space,
            sourceConnection,
            tableCount: processedTables.length,
            taskCount: replicationTasks.length,
            targetTablesCsn: JSON.stringify(targetTablesCsn, null, 2),
            replicationFlowJsonString: JSON.stringify(flowDefinition, null, 2),
            flowDefinition,
            targetTablesCsnObject: targetTablesCsn,
            individualTableCsns,
            cliDeployFlowCommand,
            cliDeployTablesCommand,
            tables: processedTables
        };
    }

    /**
     * Generate Enterprise Star Schema CSN Package with Native CDS Associations (Tareeqa 2)
     * Central Fact View (@Analytics.dataCategory: "#CUBE") linked to
     * Dimension Views (@Analytics.dataCategory: "#DIMENSION") via native cds.Association.
     * 
     * @param {object} factModel Parsed internal model of Central Fact View
     * @param {Array<object>} dimensionModels Array of parsed internal models of Dimension Views
     * @param {object} options Options (space, customMappings, factNaming, dimNamings)
     */
    generateStarSchemaPackage(factModel, dimensionModels = [], options = {}) {
        if (!factModel) {
            throw new Error('factModel is required to generate a Star Schema package.');
        }

        const space = options.space || 'AIS_INBOUND';
        const definitions = {};
        const sqlStatements = [];
        const associationsList = [];

        const sanitizeTech = (name, fallback = '') => {
            const raw = name || fallback || '';
            const cleaned = String(raw)
                .replace(/.*?\$\$\$\$/g, '')
                .replace(/\$\$/g, '')
                .replace(/^.*::/, '')
                .replace(/^.*[.\/]/, '')
                .replace(/^[\/\\]+/, '')
                .replace(/[\/\\]+/g, '_')
                .replace(/[^a-zA-Z0-9_]/g, '_')
                .trim();
            return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned;
        };

        const ensureKey = (elements) => {
            if (!elements || Object.keys(elements).length === 0) return;
            const hasKey = Object.values(elements).some(el => el.key);
            if (!hasKey) {
                const candidate = Object.keys(elements).find(k => !elements[k]['@Analytics.measure']) || Object.keys(elements)[0];
                if (candidate) elements[candidate].key = true;
            }
        };

        // Standard SAP Domain key synonyms for automatic association mapping
        const domainSynonyms = [
            ['MANDT', 'CLIENT'],
            ['CUSTOMER', 'KUNNR', 'SOLD_TO_PARTY', 'SOLDTOPARTY', 'CUSTOMER_ID', 'KUNNR_ANA'],
            ['MATERIAL', 'MATNR', 'PRODUCT', 'PRODUCT_ID'],
            ['COMPANY_CODE', 'BUKRS', 'COMP_CODE'],
            ['SUPPLIER', 'LIFNR', 'VENDOR'],
            ['PLANT', 'WERKS'],
            ['SALES_ORG', 'VKORG'],
            ['PROFIT_CENTER', 'PRCTR'],
            ['COST_CENTER', 'KOSTL'],
            ['PROJECT_ID', 'PS_PSP_PNR', 'POSID', 'PROJECT']
        ];

        // 1. Process and Generate Dimension Entities
        const dimViewTechNames = [];
        const dimCatalog = [];

        for (const dimModel of dimensionModels) {
            const dimBase = sanitizeTech(dimModel.name || dimModel.viewName || 'DIM');
            const dimViewTech = sanitizeTech(dimModel.viewTechName, `${dimBase}_DIM_V`);
            const dimTableTech = sanitizeTech(dimModel.tableTechName, `${dimBase}_TBL`);
            dimViewTechNames.push(dimViewTech);

            // A. Dimension Base Table
            const dimTableElements = {};
            for (const col of (dimModel.columns || [])) {
                dimTableElements[col.name] = {
                    ...this._toCsnType(col.dataType),
                    "@EndUserText.label": col.originalName || col.name,
                    ...(col.isKey ? { key: true } : {})
                };
            }
            ensureKey(dimTableElements);
            definitions[dimTableTech] = {
                kind: "entity",
                "@EndUserText.label": `${dimBase} Base Table`,
                elements: dimTableElements
            };

            // B. Dimension View (@Analytics.dataCategory: "#DIMENSION")
            const dimViewElements = {};
            const dimQueryCols = [];
            const dimSqlCols = [];

            for (const col of (dimModel.columns || [])) {
                dimViewElements[col.name] = {
                    ...this._toCsnType(col.dataType),
                    "@EndUserText.label": col.originalName || col.name,
                    ...(col.isKey ? { key: true } : {})
                };
                dimQueryCols.push({ ref: [col.name] });
                dimSqlCols.push(`    "${col.name}"`);
            }
            ensureKey(dimViewElements);

            definitions[dimViewTech] = {
                kind: "entity",
                "@EndUserText.label": `${dimBase} Dimension View`,
                "@Analytics.dataCategory": "#DIMENSION",
                elements: dimViewElements,
                query: {
                    SELECT: {
                        from: { ref: [dimTableTech] },
                        columns: dimQueryCols
                    }
                }
            };

            const dimSql = `-- ==========================================================\n-- Dimension View: ${dimViewTech} (@Analytics.dataCategory: #DIMENSION)\n-- Source Base Table: ${dimTableTech}\n-- ==========================================================\nCREATE VIEW "${dimViewTech}" AS\nSELECT\n${dimSqlCols.join(',\n')}\nFROM "${dimTableTech}";\n`;
            sqlStatements.push(dimSql);

            dimCatalog.push({
                dimBase,
                dimViewTech,
                dimTableTech,
                columns: dimModel.columns || []
            });
        }

        // 2. Process Central Fact Model
        const factBase = sanitizeTech(factModel.name || factModel.viewName || 'FACT');
        const factViewTech = sanitizeTech(options.factViewTechName, `${factBase}_FACT_V`);
        const factTableTech = sanitizeTech(options.factBaseTable, `${factBase}_TBL`);
        const amTech = sanitizeTech(options.analyticModelTechName, `${factBase}_AM`);

        const factTableElements = {};
        const factViewElements = {};
        const amElements = {};
        const factQueryCols = [];
        const factSqlCols = [];
        let hasMeasures = false;

        for (const col of (factModel.columns || [])) {
            const isNumeric = col.dataType && (col.dataType.includes('Decimal') || col.dataType.includes('Integer'));
            const isMeasure = col.isMeasure || this._isMeasure(col.name);
            if (isMeasure) hasMeasures = true;

            factTableElements[col.name] = {
                ...this._toCsnType(col.dataType),
                "@EndUserText.label": col.originalName || col.name,
                ...(col.isKey ? { key: true } : {})
            };

            factViewElements[col.name] = {
                ...this._toCsnType(col.dataType),
                "@EndUserText.label": col.originalName || col.name,
                ...(col.isKey ? { key: true } : {}),
                ...(isMeasure ? {
                    '@Analytics.measure': true,
                    '@Aggregation.default': '#SUM'
                } : {})
            };

            amElements[col.name] = {
                ...this._toCsnType(col.dataType),
                "@EndUserText.label": col.originalName || col.name,
                ...(isMeasure ? {
                    '@Analytics.measure': true,
                    '@Aggregation.default': '#SUM'
                } : {
                    '@Analytics.dimension': true
                })
            };

            factQueryCols.push({ ref: [col.name] });
            if (isMeasure || (isNumeric && !col.isKey)) {
                factSqlCols.push(`    COALESCE("${col.name}", 0) AS "${col.name}"`);
            } else {
                factSqlCols.push(`    "${col.name}"`);
            }
        }

        // Guarantee at least 1 measure for Datasphere Fact View (#CUBE)
        if (!hasMeasures) {
            factViewElements["RECORD_COUNT"] = {
                type: "cds.Integer",
                "@EndUserText.label": "Record Count",
                "@Analytics.measure": true,
                "@Aggregation.default": "#SUM"
            };
            amElements["RECORD_COUNT"] = {
                type: "cds.Integer",
                "@EndUserText.label": "Record Count",
                "@Analytics.measure": true,
                "@Aggregation.default": "#SUM"
            };
            factQueryCols.push({ val: 1, as: "RECORD_COUNT" });
            factSqlCols.push('    1 AS "RECORD_COUNT"');
        }

        ensureKey(factTableElements);
        ensureKey(factViewElements);

        definitions[factTableTech] = {
            kind: "entity",
            "@EndUserText.label": `${factBase} Base Table`,
            elements: factTableElements
        };

        // 3. Build Native CDS Associations (cds.Association) between Fact and Dimensions
        const customMappings = options.customMappings || {};

        for (const dim of dimCatalog) {
            let matchedPairs = [];

            // Check custom join keys
            const customKeys = customMappings[dim.dimBase]?.joinKeys || customMappings[dim.dimViewTech]?.joinKeys;
            if (customKeys && Array.isArray(customKeys) && customKeys.length > 0) {
                matchedPairs = customKeys.map(k => ({
                    factCol: k.factCol || k.fact,
                    dimCol: k.dimCol || k.dim
                }));
            } else {
                // Auto-detect matching keys
                const factCols = factModel.columns || [];
                const dimCols = dim.columns;

                // 1. Mandatory client join: MANDT / CLIENT if present in both
                const factMandt = factCols.find(c => c.name.toUpperCase() === 'MANDT' || c.name.toUpperCase() === 'CLIENT');
                const dimMandt = dimCols.find(c => c.name.toUpperCase() === 'MANDT' || c.name.toUpperCase() === 'CLIENT');
                if (factMandt && dimMandt) {
                    matchedPairs.push({ factCol: factMandt.name, dimCol: dimMandt.name });
                }

                // 2. Look for exact name match on business key (case-insensitive)
                for (const dc of dimCols) {
                    if (dc.name.toUpperCase() === 'MANDT' || dc.name.toUpperCase() === 'CLIENT') continue;
                    const fc = factCols.find(f => f.name.toUpperCase() === dc.name.toUpperCase());
                    if (fc) {
                        matchedPairs.push({ factCol: fc.name, dimCol: dc.name });
                        break;
                    }
                }

                // 3. If still no non-mandt match, check synonym groups
                if (matchedPairs.filter(p => p.dimCol.toUpperCase() !== 'MANDT').length === 0) {
                    for (const group of domainSynonyms) {
                        const dimMatch = dimCols.find(dc => group.includes(dc.name.toUpperCase()));
                        const factMatch = factCols.find(fc => group.includes(fc.name.toUpperCase()));
                        if (dimMatch && factMatch) {
                            matchedPairs.push({ factCol: factMatch.name, dimCol: dimMatch.name });
                            break;
                        }
                    }
                }

                // 4. Fallback: match primary key of dimension
                if (matchedPairs.filter(p => p.dimCol.toUpperCase() !== 'MANDT').length === 0) {
                    const dimKey = dimCols.find(c => c.isKey && c.name.toUpperCase() !== 'MANDT') || dimCols[0];
                    if (dimKey) {
                        const factMatch = factCols.find(fc => !fc.isMeasure && fc.dataType === dimKey.dataType) || factCols[0];
                        if (factMatch) {
                            matchedPairs.push({ factCol: factMatch.name, dimCol: dimKey.name });
                        }
                    }
                }
            }

            // Generate clean association element name: e.g. CV_CUSTOMER -> to_Customer
            let cleanAssocPart = dim.dimBase.replace(/^(CV_|CA_|I_|C_|Z_)/i, '');
            cleanAssocPart = cleanAssocPart.charAt(0).toUpperCase() + cleanAssocPart.slice(1).toLowerCase();
            const assocName = `to_${cleanAssocPart}`;

            // Build CQN 'on' expression
            const onClause = [];
            matchedPairs.forEach((pair, idx) => {
                if (idx > 0) onClause.push("and");
                onClause.push({ ref: [pair.factCol] });
                onClause.push("=");
                onClause.push({ ref: [assocName, pair.dimCol] });
            });

            // Add Association to Fact View
            factViewElements[assocName] = {
                type: "cds.Association",
                target: dim.dimViewTech,
                cardinality: { max: "1" },
                on: onClause
            };

            // Add Association reference to Analytic Model
            amElements[assocName] = {
                type: "cds.Association",
                target: dim.dimViewTech
            };

            associationsList.push({
                associationName: assocName,
                targetDimension: dim.dimViewTech,
                joinKeys: matchedPairs.map(p => `${p.factCol} = ${p.dimCol}`)
            });
        }

        // 4. Central Fact View Entity Definition (@Analytics.dataCategory: "#CUBE")
        definitions[factViewTech] = {
            kind: "entity",
            "@EndUserText.label": `${factBase} Central Fact View`,
            "@Analytics.dataCategory": "#CUBE",
            elements: factViewElements,
            query: {
                SELECT: {
                    from: { ref: [factTableTech] },
                    columns: factQueryCols
                }
            }
        };

        // 5. Unified Analytic Consumption Model
        definitions[amTech] = {
            kind: "analyticModel",
            "@EndUserText.label": `${factBase} Star Schema Consumption Model`,
            source: { ref: [factViewTech] },
            elements: amElements
        };

        const factSql = `-- ==========================================================\n-- Central Fact View: ${factViewTech} (@Analytics.dataCategory: #CUBE)\n-- Source Base Table: ${factTableTech}\n-- Associated Dimensions: ${dimViewTechNames.join(', ') || 'None'}\n-- ==========================================================\nCREATE VIEW "${factViewTech}" AS\nSELECT\n${factSqlCols.join(',\n')}\nFROM "${factTableTech}";\n`;
        sqlStatements.push(factSql);

        const packageCsn = {
            $version: "2.0",
            definitions
        };

        return {
            packageCsn,
            csnJsonString: JSON.stringify(packageCsn, null, 2),
            factViewName: factViewTech,
            factBaseTable: factTableTech,
            dimensionViewNames: dimViewTechNames,
            associationCount: associationsList.length,
            associations: associationsList,
            completeSql: sqlStatements.join('\n'),
            cliDeployCommand: `datasphere objects csn create -y ${space} -f ${factBase}_STAR_SCHEMA.csn.json`
        };
    }

    /**
     * Backward-compatible transformToCSN method
     */
    transformToCSN(model, targetSpace = 'AIS_HARMONIZATION_', targetViewName) {
        const res = this.generateModularArtifacts(model, null, {
            space: targetSpace,
            viewName: targetViewName
        });
        return {
            csn: res.viewJson,
            csnString: res.viewJsonString,
            generatedSql: res.optimizedQuerySql,
            viewName: res.namingConfig.viewTechName,
            analyticModelName: res.namingConfig.amTechName
        };
    }
}

module.exports = new TransformService();