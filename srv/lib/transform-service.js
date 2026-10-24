class TransformService {
    /**
     * Transform internal model into Datasphere-ready CSN JSON
     * @param {object} model Internal representation
     * @param {string} targetSpace Datasphere target space name
     * @param {string} targetViewName Datasphere target view name
     */
    transformToCSN(model, targetSpace = 'MY_SPACE', targetViewName) {
        const viewName = targetViewName || model.viewName;
        const qualifiedName = `${targetSpace}.${viewName}`;

        const elements = {};
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
        }

        const csn = {
            $version: '2.0',
            meta: {
                creator: 'HanaMorph Migration Engine',
                sourceType: model.viewType,
                sourceView: model.viewName
            },
            definitions: {
                [qualifiedName]: {
                    kind: 'entity',
                    '@EndUserText.label': `Migrated from ${model.viewName} (${model.viewType})`,
                    '@Analytics.dataCategory': model.hasAggregations ? '#CUBE' : '#DIMENSION',
                    elements
                }
            }
        };

        // Also generate the underlying local/remote table stubs needed in Datasphere space
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
            generatedSql
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
