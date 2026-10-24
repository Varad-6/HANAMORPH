const cds = require('@sap/cds');

describe('HanaMorph End-to-End Pipeline Tests', () => {
    let srv;

    beforeAll(async () => {
        const app = await cds.test(__dirname + '/..');
        srv = await cds.connect.to('MigrationService');
    });

    test('1. Source Catalog Discovery (Import CDS and Calc Views)', async () => {
        const catalog = await srv.send('importCatalog', { sourceType: 'ALL' });
        expect(Array.isArray(catalog)).toBe(true);
        expect(catalog.length).toBeGreaterThanOrEqual(2);

        const cdsView = catalog.find(v => v.type === 'CDS');
        const calcView = catalog.find(v => v.type === 'CALC_VIEW');

        expect(cdsView).toBeDefined();
        expect(cdsView.name).toBe('C_PurchaseOrderFs');
        expect(calcView).toBeDefined();
        expect(calcView.name).toBe('CA_SALES_ANALYTICS');
    });

    test('2. Artifact Inspection (Graphical / Table / SQL)', async () => {
        const artifacts = await srv.send('getArtifacts', { viewName: 'C_PurchaseOrderFs' });
        expect(Array.isArray(artifacts)).toBe(true);
        expect(artifacts.length).toBe(3);
        const types = artifacts.map(a => a.artifactType);
        expect(types).toContain('TABLE');
        expect(types).toContain('SQL');
        expect(types).toContain('GRAPHICAL');
    });

    test('3. End-to-End CDS View Pipeline Migration', async () => {
        const job = await srv.send('triggerMigration', {
            sourceViewName: 'C_PurchaseOrderFs',
            sourceViewType: 'CDS',
            targetSpace: 'PURCHASING_SPACE',
            targetViewName: 'PO_OVERVIEW_MIGRATED'
        });

        expect(job).toBeDefined();
        expect(job.status).toBe('PENDING');

        // Wait for pipeline execution
        await new Promise(r => setTimeout(r, 2000));

        const updatedJob = await srv.run(SELECT.one.from('hanamorph.MigrationJobs', job.ID));
        expect(updatedJob.status).toBe('COMPLETED');
        expect(updatedJob.progress).toBe(100);
        expect(updatedJob.csnPayload).toBeDefined();
        expect(updatedJob.generatedSql).toContain('CREATE VIEW "PURCHASING_SPACE"."PO_OVERVIEW_MIGRATED"');
        expect(updatedJob.targetRowCount).toBeGreaterThan(0);
    });

    test('4. End-to-End Calculation View Pipeline Migration', async () => {
        const job = await srv.send('triggerMigration', {
            sourceViewName: 'CA_SALES_ANALYTICS',
            sourceViewType: 'CALC_VIEW',
            targetSpace: 'ANALYTICS_SPACE',
            targetViewName: 'SALES_AGG_MIGRATED'
        });

        expect(job).toBeDefined();

        // Wait for pipeline execution
        await new Promise(r => setTimeout(r, 2000));

        const updatedJob = await srv.run(SELECT.one.from('hanamorph.MigrationJobs', job.ID));
        expect(updatedJob.status).toBe('COMPLETED');
        expect(updatedJob.progress).toBe(100);
        expect(updatedJob.csnPayload).toBeDefined();
        const parsedCsn = JSON.parse(updatedJob.csnPayload);
        expect(parsedCsn.definitions['ANALYTICS_SPACE.SALES_AGG_MIGRATED']['@Analytics.dataCategory']).toBe('#CUBE');
    });
});
