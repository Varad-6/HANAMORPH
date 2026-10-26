const cds = require('@sap/cds');
const config = require('./lib/config');
const extractService = require('./lib/extract-service');
const transformService = require('./lib/transform-service');
const deployService = require('./lib/deploy-service');
const hanaConnector = require('./lib/hana-connector');
const { EXTENDED_CATALOG } = require('./fixtures/extended-catalog');

module.exports = cds.service.impl(async function () {
    const { SourceCatalog, ViewArtifacts, MigrationJobs, JobLogs } = this.entities;

    /**
     * Function: getSystemInfo
     */
    this.on('getSystemInfo', async () => {
        return await hanaConnector.getStatus();
    });

    /**
     * Function: listCDSViews
     * Direct user-specified CAP endpoint
     */
    this.on('listCDSViews', async () => {
        const views = await hanaConnector.listCDSViews();
        // Sync into DB for catalog reference
        for (const v of views) {
            await UPSERT.into(SourceCatalog).entries({
                name: v.name,
                type: 'CDS',
                sqlViewName: v.sqlViewName,
                description: v.description,
                packageOrSchema: v.packageOrSchema,
                columnCount: v.columnCount || 0,
                hasAggregations: false,
                supportedStatus: v.supportedStatus || 'SUPPORTED',
                unsupportedReasons: v.unsupportedReasons || null
            });
        }
        return views;
    });

    /**
     * Function: listCalcViews
     * Direct user-specified CAP endpoint
     */
    this.on('listCalcViews', async () => {
        const views = await hanaConnector.listCalcViews();
        // Sync into DB for catalog reference
        for (const v of views) {
            await UPSERT.into(SourceCatalog).entries({
                name: v.name,
                type: 'CALC_VIEW',
                sqlViewName: v.sqlViewName,
                description: v.description,
                packageOrSchema: v.packageOrSchema,
                columnCount: v.columnCount || 0,
                hasAggregations: true,
                supportedStatus: v.supportedStatus || 'SUPPORTED',
                unsupportedReasons: v.unsupportedReasons || null
            });
        }
        return views;
    });

    /**
     * Function: getArtifacts(viewName)
     * Direct user-specified CAP endpoint
     */
    this.on('getArtifacts', async req => {
        const { viewName } = req.data;
        if (!viewName) return [];

        let view = null;
        if (config.USE_MOCK) {
            view = EXTENDED_CATALOG.find(v => v.name === viewName || v.sqlViewName === viewName);
        } else {
            // Live query catalog
            const deps = await hanaConnector.getDependencies(viewName);
            view = {
                name: viewName,
                type: viewName.startsWith('CA_') ? 'CALC_VIEW' : 'CDS',
                sqlViewName: viewName,
                columnCount: 20,
                dependencies: deps
            };
        }

        const artifacts = [];
        if (view) {
            const isCds = view.type === 'CDS';
            const depNames = (view.dependencies || []).map(d => d.BASE_OBJECT_NAME).join(', ') || 'Source Tables';

            // 1. Table Artifact
            artifacts.push({
                id: cds.utils.uuid(),
                viewName,
                artifactType: 'TABLE',
                name: `Underlying Tables (${depNames})`,
                columnCount: view.columnCount,
                details: isCds 
                    ? `Physical tables referenced by view: ${depNames}`
                    : `Base DataSources in calculation scenario: ${depNames}`
            });

            // 2. SQL / XML Artifact
            artifacts.push({
                id: cds.utils.uuid(),
                viewName,
                artifactType: 'SQL',
                name: isCds ? `Catalog SQL View (${view.sqlViewName})` : `Calc View XML Definition`,
                columnCount: view.columnCount,
                details: isCds ? (view.sqlDdl || 'SQL DDL definition') : (view.xmlDefinition || 'XML scenario definition')
            });

            // 3. Graphical Artifact
            artifacts.push({
                id: cds.utils.uuid(),
                viewName,
                artifactType: 'GRAPHICAL',
                name: isCds ? `Entity Join Graph (${view.name})` : `Calculation Scenario Graph (${view.name})`,
                columnCount: view.columnCount,
                details: isCds 
                    ? `Relational Join Diagram: ${depNames} connected via Foreign Key attributes`
                    : `Node Pipeline: DataSources -> Join Views -> Aggregation Views -> Measures`
            });
        }

        return artifacts;
    });

    /**
     * Function: getColumns(viewName)
     */
    this.on('getColumns', async req => {
        const { viewName } = req.data;
        if (!viewName) return [];
        try {
            const isCalc = viewName.startsWith('CA_');
            const model = isCalc 
                ? await extractService.extractCalc(viewName)
                : await extractService.extractCDS(viewName);
            return (model.columns || []).map(c => ({
                name: c.name,
                dataType: c.dataType || 'cds.String(40)',
                isKey: !!c.isKey,
                isMeasure: !!c.isMeasure,
                originalName: c.originalName || c.name
            }));
        } catch (err) {
            console.error('[getColumns error]', err);
            return [];
        }
    });

    /**
     * Action: generateModularArtifacts
     */
    this.on('generateModularArtifacts', async req => {
        const {
            viewName,
            selectedColumns = [],
            columnsJson,
            space = config.datasphere.defaultSpace,
            fromTableName,
            tableName,
            tableBusinessName,
            viewNameCustom,
            viewBusinessName,
            amName,
            amBusinessName
        } = req.data;

        if (!viewName) {
            req.reject(400, 'viewName is required');
        }

        const isCalc = viewName.startsWith('CA_');
        const model = isCalc 
            ? await extractService.extractCalc(viewName)
            : await extractService.extractCDS(viewName);

        const namingConfig = {
            space: space || config.datasphere.defaultSpace || 'AIS_HARMONIZATION_',
            fromTableName: fromTableName || tableName || `${viewName}_TBL`,
            tableName: tableName || `${viewName}_TBL`,
            tableBusinessName: tableBusinessName || `${viewName} Base Table`,
            viewName: viewNameCustom || `${viewName}_V`,
            viewBusinessName: viewBusinessName || `${viewName} Fact View`,
            analyticModelName: amName || `${viewName}_AM`,
            analyticModelBusinessName: amBusinessName || `${viewName} Analytical Model`
        };

        let colsInput = selectedColumns;
        if (columnsJson) {
            try {
                colsInput = JSON.parse(columnsJson);
            } catch (e) {
                console.warn('Failed to parse columnsJson, falling back to selectedColumns', e);
            }
        }

        const result = transformService.generateModularArtifacts(
            model,
            colsInput && colsInput.length > 0 ? colsInput : null,
            namingConfig
        );

        return {
            tableJsonString: result.tableJsonString,
            viewJsonString: result.viewJsonString,
            analyticModelJsonString: result.analyticModelJsonString,
            packageJsonString: result.packageJsonString,
            optimizedSql: result.optimizedQuerySql, // Pure SELECT query for Datasphere New SQL View
            completeDdlSql: result.completeDdlSql,
            replicationFlowMasterJsonString: result.replicationFlowMasterJsonString,
            replicationFlowDeltaJsonString: result.replicationFlowDeltaJsonString,
            replicationFlowCliCommand: result.replicationFlowCliCommand,
            tableName: namingConfig.tableName,
            viewName: namingConfig.viewName,
            amName: namingConfig.analyticModelName
        };
    });

    /**
     * Helper to extract a list of view models
     */
    const _extractModels = async (viewNames = []) => {
        const models = [];
        for (const name of viewNames) {
            try {
                const isCalc = name.startsWith('CA_');
                const model = isCalc 
                    ? await extractService.extractCalc(name)
                    : await extractService.extractCDS(name);
                models.push(model);
            } catch (err) {
                console.warn(`[extractModels] Failed to extract ${name}:`, err.message);
            }
        }
        return models;
    };

    /**
     * Function: rationalizeSources
     */
    this.on('rationalizeSources', async req => {
        let { viewNames = [] } = req.data;
        if (!viewNames || viewNames.length === 0) {
            const allCds = await hanaConnector.listCDSViews();
            const allCalc = await hanaConnector.listCalcViews();
            viewNames = [...allCds.map(v => v.name), ...allCalc.map(v => v.name)];
        }
        const models = await _extractModels(viewNames);
        return transformService.rationalizeSources(models);
    });

    /**
     * Action: generateBulkArtifacts
     */
    this.on('generateBulkArtifacts', async req => {
        const {
            viewNames = [],
            space = config.datasphere.defaultSpace,
            namingPattern = 'DEFAULT',
            deduplicationDecisions = null
        } = req.data;
        if (!viewNames || viewNames.length === 0) {
            req.reject(400, 'viewNames array is required for bulk generation');
        }
        const models = await _extractModels(viewNames);
        const result = transformService.generateBulkArtifacts(models, {
            space,
            namingPattern,
            deduplicationDecisions
        });
        return {
            masterCsnJsonString: result.masterCsnJsonString,
            aggregatedSql: result.aggregatedSql,
            replicationFlowJsonString: result.replicationFlowJsonString,
            replicationFlowCliCommand: result.replicationFlowCliCommand,
            processedViewCount: result.processedViewCount,
            tableCount: result.tableCount,
            viewCount: result.viewCount,
            views: result.views
        };
    });

    /**
     * Action: startJob(viewName, viewType, artifacts, targetSpace)
     * Direct user-specified CAP endpoint
     */
    this.on('startJob', async req => {
        const { viewName, viewType = 'CDS', artifacts = [], targetSpace = config.datasphere.defaultSpace } = req.data;
        const targetViewName = `${viewName}_DS`;

        const jobId = cds.utils.uuid();
        const job = {
            ID: jobId,
            sourceViewName: viewName,
            sourceViewType: viewType,
            targetSpace,
            targetViewName,
            status: 'PENDING',
            progress: 0
        };

        await INSERT.into(MigrationJobs).entries(job);

        // Async execution of the 4 pipeline stages: Extracting -> Transforming -> Deploying -> Loading -> Done
        setTimeout(async () => {
            const addLog = async (level, message) => {
                await INSERT.into(JobLogs).entries({
                    ID: cds.utils.uuid(),
                    job_ID: jobId,
                    timestamp: new Date().toISOString(),
                    level,
                    message
                });
            };

            try {
                // STAGE 1: Extracting
                await UPDATE(MigrationJobs, jobId).with({ status: 'EXTRACTING', progress: 20 });
                await addLog('INFO', `[Stage 1: Extracting] Fetching definition and metadata for ${viewType} '${viewName}'...`);

                let internalModel;
                if (viewType === 'CDS') {
                    internalModel = await extractService.extractCDS(viewName);
                } else {
                    internalModel = await extractService.extractCalc(viewName);
                }
                await addLog('INFO', `Extracted model with ${internalModel.columns.length} columns and ${internalModel.sources.length} sources.`);

                // STAGE 2: Transforming
                await UPDATE(MigrationJobs, jobId).with({ status: 'TRANSFORMING', progress: 45 });
                await addLog('INFO', `[Stage 2: Transforming] Generating Datasphere CSN JSON & SQL representation...`);

                const transformResult = transformService.transformToCSN(internalModel, targetSpace, targetViewName);
                await UPDATE(MigrationJobs, jobId).with({
                    csnPayload: transformResult.csnString,
                    generatedSql: transformResult.generatedSql
                });
                await addLog('INFO', `CSN schema generated with ${Object.keys(transformResult.csn.definitions).length} entities.`);

                // STAGE 3: Deploying
                await UPDATE(MigrationJobs, jobId).with({ status: 'DEPLOYING', progress: 70 });
                await addLog('INFO', `[Stage 3: Deploying] Deploying view to Datasphere space '${targetSpace}'...`);
                await deployService.deployCSN(targetSpace, transformResult.csnString, addLog);

                // STAGE 4: Loading
                await UPDATE(MigrationJobs, jobId).with({ status: 'LOADING', progress: 90 });
                await addLog('INFO', `[Stage 4: Loading] Triggering data replication for '${targetViewName}'...`);
                const loadResult = await deployService.triggerDataLoad(targetSpace, targetViewName, addLog);

                // STAGE 5: Done
                await UPDATE(MigrationJobs, jobId).with({
                    status: 'COMPLETED',
                    progress: 100,
                    sourceRowCount: loadResult.rowCount,
                    targetRowCount: loadResult.rowCount
                });
                await addLog('INFO', `[Done] Migration and replication completed successfully. Replicated ${loadResult.rowCount} rows.`);
            } catch (err) {
                console.error('[Job Failed]', err);
                await UPDATE(MigrationJobs, jobId).with({
                    status: 'FAILED',
                    errorMessage: err.message
                });
                await addLog('ERROR', `Pipeline failed: ${err.message}`);
            }
        }, 50);

        return await SELECT.one.from(MigrationJobs, jobId);
    });

    /**
     * Function: getJobStatus(jobId)
     * Direct user-specified CAP endpoint
     */
    this.on('getJobStatus', async req => {
        const { jobId } = req.data;
        const job = await SELECT.one.from(MigrationJobs, jobId);
        if (!job) {
            req.reject(404, `Job '${jobId}' not found.`);
        }
        const logs = await SELECT.from(JobLogs).where({ job_ID: jobId }).orderBy('timestamp asc');
        return {
            ...job,
            logs
        };
    });

    /**
     * Function: exportCsn
     */
    this.on('exportCsn', async req => {
        const { jobId } = req.data;
        const job = await SELECT.one.from(MigrationJobs, jobId).columns('csnPayload');
        if (!job || !job.csnPayload) {
            req.reject(404, `No CSN found for job ID: ${jobId}`);
        }
        return job.csnPayload;
    });
});
