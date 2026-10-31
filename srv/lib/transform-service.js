class TransformService {
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
        const tableDefinitions = {
            [fromSource]: tableDefinition
        };
        if (tableTechName !== fromSource && !tableDefinitions[tableTechName]) {
            tableDefinitions[tableTechName] = tableDefinition;
        }
        // Bundle all physical DataSources referenced by the model with their exact schema
        for (const src of (model.sources || [])) {
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
            }
        }
        // Guarantee all table definitions have at least one key
        for (const tbl of Object.values(tableDefinitions)) {
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
        if (!optimizedQuerySql) {
            if (model.type === 'CALC_VIEW' && model.pipelineSql) {
                optimizedQuerySql = model.pipelineSql;
            } else {
                optimizedQuerySql = `SELECT\n` +
                    sqlSelectCols.join(',\n') + `\n` +
                    `FROM "${fromSource}"`;
            }
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

        const getNodeTechName = (nodeId) => {
            if (collapsedNodes[nodeId]) {
                return collapsedNodes[nodeId].targetTable;
            }
            if (tableDefinitions[nodeId] || (model.sources && model.sources.some(s => s.tableName === nodeId))) {
                return nodeId;
            }
            const found = nodeHierarchy.find(n => n.id === nodeId);
            if (found && (found.isRoot || found.id === rootNode?.id)) {
                return viewTechName;
            }
            const clean = (nodeId || '').replace(/^[\/\\]+/, '').replace(/[\/\\]+/g, '_').replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
            return `${sTechBase}_${clean}_V`;
        };

        const definitions = { ...tableDefinitions };
        const tierSqls = [];
        let tierIndex = 1;

        const operationalNodes = nodeHierarchy.filter(n => !collapsedNodes[n.id]);

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
                        const lm = (node.mappings || []).find(m => m.inputNode === rawLeft && m.target === attr);
                        const rm = (node.mappings || []).find(m => m.inputNode === rawRight && m.target === attr);
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
                    const isLeft = (m.inputNode === rawLeft) || (collapsedNodes[rawLeft] && m.inputNode === collapsedNodes[rawLeft].targetTable);
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
                        cqnCols.push({ ref: [colId] });
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

                ensureKey(viewElements);

                nodeSql = `SELECT\n${selectCols.join(',\n')}\nFROM "${leftTech}" AS A\n${node.joinType || 'LEFT OUTER JOIN'} "${rightTech}" AS B\n  ON ${onConditions}`;

                nodeViewDef = {
                    kind: "entity",
                    "@EndUserText.label": nodeLabel,
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
                        cqnCols.push({ ref: [colId] });
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

                ensureKey(viewElements);

                nodeSql = `SELECT\n${selectCols.join(',\n')}\nFROM "${srcTech}"`;

                nodeViewDef = {
                    kind: "entity",
                    "@EndUserText.label": nodeLabel,
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

                for (const rawInput of (node.inputs || [])) {
                    const branchTech = getNodeTechName(rawInput);
                    inputsList.push(branchTech);
                    const branchMappings = (node.mappings || []).filter(m => m.inputNode === rawInput);

                    const branchSelectCols = [];
                    const branchCqnCols = [];

                    for (const col of normalizedCols) {
                        const mapEntry = branchMappings.find(m => m.target === col.targetName);
                        if (mapEntry) {
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
                    elements: isRoot ? finalViewElements : finalViewElements,
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
                    const mapEntry = branchMappings.find(m => m.target === col.targetName);
                    if (mapEntry) {
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