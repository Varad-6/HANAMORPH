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