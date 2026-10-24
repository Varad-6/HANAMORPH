const cds = require('@sap/cds');
const extractService = require('./lib/extract-service');
const transformService = require('./lib/transform-service');
const deployService = require('./lib/deploy-service');
const hanaConnector = require('./lib/hana-connector');
const { EXTENDED_CATALOG } = require('./fixtures/extended-catalog');

module.exports = cds.service.impl(async function () {
    const { SourceCatalog, ViewArtifacts, MigrationJobs, JobLogs } = this.entities;

    // Auto-seed catalog if empty on initial query
    this.on('READ', 'SourceCatalog', async (req, next) => {
        const count = await SELECT.from(SourceCatalog).columns('count(*) as count');
        if (!count || count[0]?.count === 0) {
            await this.send('importCatalog', { sourceType: 'ALL' });
        }
        return next();
    });

    /**
     * Action: importCatalog
     */
    this.on('importCatalog', async req => {
        const { sourceType = 'ALL' } = req.data;
        let cdsViews = [];
        let calcViews = [];

        if (sourceType === 'ALL' || sourceType === 'CDS') {
            cdsViews = await hanaConnector.listCDSViews();
        }

        if (sourceType === 'ALL' || sourceType === 'CALC_VIEW') {
            calcViews = await hanaConnector.listCalcViews();
        }

        const allEntries = [...cdsViews, ...calcViews];

        for (const entry of allEntries) {
            await UPSERT.into(SourceCatalog).entries({
                name: entry.name,
                type: entry.type,
                sqlViewName: entry.sqlViewName,
                description: entry.description,
                packageOrSchema: entry.packageOrSchema,
                columnCount: entry.columnCount || 0,
                hasAggregations: !!entry.hasAggregations,
                supportedStatus: entry.supportedStatus || 'SUPPORTED',
                unsupportedReasons: entry.unsupportedReasons || null
            });
        }

        return await SELECT.from(SourceCatalog);
    });

    /**
     * Function: getArtifacts
     */
    this.on('getArtifacts', async req => {
        const { viewName } = req.data;
        if (!viewName) return [];

        const view = EXTENDED_CATALOG.find(v => v.name === viewName || v.sqlViewName === viewName);
        const artifacts = [];

        if (view) {
            const isCds = view.type === 'CDS';
            const depNames = (view.dependencies || []).map(d => d.BASE_OBJECT_NAME).join(', ') || 'N/A';

            // 1. Table Artifact
            artifacts.push({
                id: cds.utils.uuid(),
                viewName,
                artifactType: 'TABLE',
                name: `Underlying Tables (${depNames})`,
                columnCount: view.columnCount,
                details: isCds 
                    ? `Physical tables referenced by CDS view: ${depNames}`
                    : `Base DataSources in calculation scenario: ${depNames}`
            });

            // 2. SQL / XML Artifact
            artifacts.push({
                id: cds.utils.uuid(),
                viewName,
                artifactType: 'SQL',
                name: isCds ? `Catalog SQL View (${view.sqlViewName})` : `Calc View XML Definition`,
                columnCount: view.columnCount,
                details: isCds ? view.sqlDdl : view.xmlDefinition
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
     * Action: triggerMigration
     */
    this.on('triggerMigration', async req => {
        const { sourceViewName, sourceViewType, targetSpace = 'MIGRATION_SPACE', targetViewName } = req.data;
        const finalTargetView = targetViewName || sourceViewName;

        const jobId = cds.utils.uuid();
        const job = {
            ID: jobId,
            sourceViewName,
            sourceViewType,
            targetSpace,
            targetViewName: finalTargetView,
            status: 'PENDING',
            progress: 0
        };

        await INSERT.into(MigrationJobs).entries(job);

        // Async execution of pipeline stages
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
                // STEP 1: EXTRACTING (20%)
                await UPDATE(MigrationJobs, jobId).with({ status: 'EXTRACTING', progress: 20 });
                await addLog('INFO', `Starting extraction for ${sourceViewType} view '${sourceViewName}'...`);

                let internalModel;
                if (sourceViewType === 'CDS') {
                    internalModel = await extractService.extractCDS(sourceViewName);
                } else {
                    internalModel = await extractService.extractCalc(sourceViewName);
                }
                await addLog('INFO', `Extracted internal model: ${internalModel.columns.length} columns, ${internalModel.sources.length} sources, ${internalModel.joins.length} joins.`);

                // STEP 2: TRANSFORMING (50%)
                await UPDATE(MigrationJobs, jobId).with({ status: 'TRANSFORMING', progress: 50 });
                await addLog('INFO', `Transforming internal model to Datasphere CSN JSON & SQL...`);

                const transformResult = transformService.transformToCSN(internalModel, targetSpace, finalTargetView);
                await UPDATE(MigrationJobs, jobId).with({
                    csnPayload: transformResult.csnString,
                    generatedSql: transformResult.generatedSql
                });
                await addLog('INFO', `Datasphere CSN generated successfully with ${Object.keys(transformResult.csn.definitions).length} entities.`);

                // STEP 3: DEPLOYING (75%)
                await UPDATE(MigrationJobs, jobId).with({ status: 'DEPLOYING', progress: 75 });
                await deployService.deployCSN(targetSpace, transformResult.csnString, addLog);

                // STEP 4: LOADING (90%)
                await UPDATE(MigrationJobs, jobId).with({ status: 'LOADING', progress: 90 });
                const loadResult = await deployService.triggerDataLoad(targetSpace, finalTargetView, addLog);

                // STEP 5: COMPLETED (100%)
                await UPDATE(MigrationJobs, jobId).with({
                    status: 'COMPLETED',
                    progress: 100,
                    sourceRowCount: loadResult.rowCount,
                    targetRowCount: loadResult.rowCount
                });
                await addLog('INFO', `Migration successfully finished! View is ready in Datasphere space '${targetSpace}'.`);
            } catch (err) {
                await UPDATE(MigrationJobs, jobId).with({
                    status: 'FAILED',
                    errorMessage: err.message
                });
                await addLog('ERROR', `Pipeline error: ${err.message}`);
            }
        }, 50);

        return await SELECT.one.from(MigrationJobs, jobId);
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
