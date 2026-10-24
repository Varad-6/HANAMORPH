class TransformService {
    /**
     * Transform internal model into Datasphere-ready CSN JSON
     * Generates BOTH:
     * 1. Datasphere View (HANA Fact View equivalent with @Analytics.dataCategory: #CUBE or #DIMENSION)
     * 2. Datasphere Analytic Model (consumption-ready for SAC/BI)
     * 
     * @param {object} model Internal representation
     * @param {string} targetSpace Datasphere target space name
     * @param {string} targetViewName Datasphere target view name
     */
    transformToCSN(model, targetSpace = 'AIS_HARMONIZATION_', targetViewName) {
        const viewName = targetViewName || `${model.viewName}_DS`;
        const analyticModelName = `${viewName}_AM`;
        const qualifiedViewName = `${targetSpace}.${viewName}`;
        const qualifiedAmName = `${targetSpace}.${analyticModelName}`;

        const elements = {};
        const amElements = {};

        for (const col of model.columns) {
            const elem = {
                type: col.dataType.startsWith('cds.') ? col.dataType : `cds.${col.dataType}`
            };

            if (col.isKey) {
                elem.key = true;
            }

            if (col.isMeasure) {
                elem['@Analytics.measure'] = true;
                elem['@Aggregation.default'] = `#${col.aggregationType || 'SUM'}`;
            }

            elements[col.name] = elem;

            // Analytic Model elements
            amElements[col.name] = {
                type: elem.type,
                ...(col.isMeasure ? {
                    '@Analytics.measure': true,
                    '@Aggregation.default': `#${col.aggregationType || 'SUM'}`
                } : {
                    '@Analytics.dimension': true
                })
            };
        }

        const csn = {
            $version: '2.0',
            meta: {
                creator: 'HanaMorph Migration Engine',
                sourceType: model.viewType,
                sourceView: model.viewName,
                targetSpace: targetSpace
            },
            definitions: {
                // 1. DATA LAYER: Datasphere View (HANA Fact / Dimension View)
                [qualifiedViewName]: {
                    kind: 'entity',
                    '@EndUserText.label': `HANA View: ${model.viewName} (${model.viewType})`,
                    '@Analytics.dataCategory': model.hasAggregations ? '#CUBE' : '#DIMENSION',
                    elements
                },

                // 2. CONSUMPTION LAYER: Datasphere Analytic Model
                [qualifiedAmName]: {
                    kind: 'analyticModel',
                    '@EndUserText.label': `Analytic Model: ${model.viewName}`,
                    source: {
                        ref: [qualifiedViewName]
                    },
                    elements: amElements
                }
            }
        };

        // Companion definitions for referenced source tables
        for (const src of model.sources) {
            const tableQualifiedName = `${targetSpace}.${src.tableName}`;
            if (!csn.definitions[tableQualifiedName]) {
                csn.definitions[tableQualifiedName] = {
                    kind: 'entity',
                    '@EndUserText.label': `Source Table ${src.tableName}`,
                    elements: {
                        ID: { key: true, type: 'cds.UUID' }
                    }
                };
            }
        }

        const generatedSql = this.generateDatasphereSQL(model, targetSpace, viewName);

        return {
            csn,
            csnString: JSON.stringify(csn, null, 2),
            generatedSql,
            viewName,
            analyticModelName
        };
    }

    /**
     * Generate standard SQL statement for Datasphere view definition
     */
    generateDatasphereSQL(model, targetSpace, viewName) {
        if (model.hasAggregations) {
            const dimensions = model.columns.filter(c => !c.isMeasure).map(c => `"${c.name}"`);
            const measures = model.aggregations.map(a => `${a.aggregationType}("${a.sourceColumn}") AS "${a.columnName}"`);
            const selectCols = [...dimensions, ...measures].join(',\n    ');
            const groupBy = dimensions.length ? `\nGROUP BY ${dimensions.join(', ')}` : '';
            const baseTable = model.sources[0]?.tableName || 'SOURCE_TABLE';

            return `CREATE VIEW "${targetSpace}"."${viewName}" AS\nSELECT\n    ${selectCols}\nFROM "${targetSpace}"."${baseTable}"${groupBy};`;
        }

        const selectCols = model.columns.map(c => {
            const prefix = c.tableAlias ? `"${c.tableAlias}".` : '';
            const src = c.sourceColumn || c.name;
            return `${prefix}"${src}" AS "${c.name}"`;
        }).join(',\n    ');

        let sql = `CREATE VIEW "${targetSpace}"."${viewName}" AS\nSELECT\n    ${selectCols}\nFROM `;

        if (model.sources.length > 0) {
            const base = model.sources.find(s => s.isBase) || model.sources[0];
            sql += `"${targetSpace}"."${base.tableName}" "${base.alias}"`;
        }

        for (const j of model.joins) {
            sql += `\n${j.joinType} "${targetSpace}"."${j.tableName}" "${j.alias}" ON ${j.onClause}`;
        }

        sql += ';';
        return sql;
    }
}

module.exports = new TransformService();
