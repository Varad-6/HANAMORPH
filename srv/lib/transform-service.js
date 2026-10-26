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
        const baseName = model.name || model.viewName || 'VIEW';
        
        const tableTechName = namingConfig.tableName || `${baseName}_TBL`;
        const tableBusName = namingConfig.tableBusinessName || `${baseName} Base Table`;
        
        // FROM Source Table/View (can be an existing Datasphere table, remote table, or local table)
        const fromSource = namingConfig.fromTableName || namingConfig.tableName || `${baseName}_TBL`;

        const viewTechName = namingConfig.viewName || `${baseName}_V`;
        const viewBusName = namingConfig.viewBusinessName || `${baseName} Analytical Fact View`;
        
        const amTechName = namingConfig.analyticModelName || `${baseName}_AM`;
        const amBusName = namingConfig.analyticModelBusinessName || `${baseName} Consumption Model`;

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

        const viewDefinition = {
            kind: "entity",
            "@EndUserText.label": viewBusName,
            "@Analytics.dataCategory": "#CUBE",
            elements: viewElements,
            query: {
                SELECT: {
                    from: { ref: [fromSource] },
                    columns: queryColumns
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

        // Standard Native CSN Objects (Ready for Data Builder -> Import Objects from CSN/JSON File)
        const tableCsn = {
            $version: "2.0",
            definitions: {
                [fromSource]: tableDefinition
            }
        };

        const viewCsn = {
            $version: "2.0",
            definitions: {
                [viewTechName]: viewDefinition
            }
        };

        const analyticModelCsn = {
            $version: "2.0",
            definitions: {
                [amTechName]: amDefinition
            }
        };

        // Unified CSN Package (Table + View + Analytic Model together)
        const packageDefinitions = {
            [viewTechName]: viewDefinition,
            [amTechName]: amDefinition
        };
        // Always include the table definition so package is self-contained
        packageDefinitions[fromSource] = tableDefinition;
        if (tableTechName !== fromSource) {
            packageDefinitions[tableTechName] = tableDefinition;
        }

        const packageCsn = {
            $version: "2.0",
            definitions: packageDefinitions
        };

        // Pure SELECT Query (For SAP Datasphere Data Builder -> New SQL View Editor)
        const optimizedQuerySql = `SELECT\n` +
            sqlSelectCols.join(',\n') + `\n` +
            `FROM "${fromSource}"`;

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
            analyticModelJson: analyticModelCsn,
            analyticModelJsonString: JSON.stringify(analyticModelCsn, null, 2),
            packageJson: packageCsn,
            packageJsonString: JSON.stringify(packageCsn, null, 2),

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
                viewType: model.viewType || (baseName.startsWith('CA_') ? 'CALC_VIEW' : 'CDS'),
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