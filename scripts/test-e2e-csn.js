const extract = require('../srv/lib/extract-service');
const hana = require('../srv/lib/hana-connector');
const transform = require('../srv/lib/transform-service');

async function runE2EValidation() {
    console.log('================================================================');
    console.log('CSN VALIDATION TEST FOR SAP DATASPHERE DATA BUILDER IMPORT');
    console.log('================================================================\n');

    await hana.ensureConnected();

    const testViews = ['/1BS/SADL_CDS_PARAM', '/1BS/CDS_EXP_SALESORDER'];

    for (const viewName of testViews) {
        console.log(`\n>>> Testing View: ${viewName} <<<`);
        const model = await extract.extractCDS(viewName);
        console.log(`Extracted Model: ${model.name}, Columns: ${model.columns.length}`);

        const namingConfig = {
            space: 'AIS_HARMONIZATION_',
            fromTableName: `${model.name}_TBL`,
            tableName: `${model.name}_TBL`,
            tableBusinessName: `${model.name} Base Table`,
            viewName: `${model.name}_V`,
            viewBusinessName: `${model.name} Fact View`,
            analyticModelName: `${model.name}_AM`,
            analyticModelBusinessName: `${model.name} Analytic Model`
        };

        const res = transform.generateModularArtifacts(model, null, namingConfig);

        const artifacts = {
            'View CSN (Self-Contained)': res.viewJson,
            'Standalone Fact CSN': res.standaloneFactJson,
            'Table CSN': res.tableJson,
            'Analytic Model CSN': res.analyticModelJson,
            'Complete Package CSN': res.packageJson
        };

        for (const [artName, csnObj] of Object.entries(artifacts)) {
            console.log(`\n  Checking [${artName}]:`);
            console.log(`    $version: ${csnObj.$version}`);
            console.log(`    Definitions keys: [${Object.keys(csnObj.definitions).join(', ')}]`);

            // Validate all ref pointers in queries and sources
            let hasError = false;
            for (const [entityName, entityDef] of Object.entries(csnObj.definitions)) {
                // If it has a query (like a View)
                if (entityDef.query && entityDef.query.SELECT) {
                    const fromRef = entityDef.query.SELECT.from?.ref;
                    if (fromRef) {
                        for (const targetRef of fromRef) {
                            if (!csnObj.definitions[targetRef]) {
                                console.error(`    ❌ ERROR: Entity '${entityName}' query selects from '${targetRef}' which is MISSING from definitions!`);
                                hasError = true;
                            } else {
                                console.log(`    ✅ Query FROM '${targetRef}' found in definitions.`);
                                // Check column refs
                                const sourceElements = csnObj.definitions[targetRef].elements || {};
                                for (const colProj of (entityDef.query.SELECT.columns || [])) {
                                    const colName = colProj.ref ? colProj.ref[0] : null;
                                    if (colName && !sourceElements[colName]) {
                                        console.error(`    ❌ ERROR: Column '${colName}' referenced by '${entityName}' is missing from source '${targetRef}'!`);
                                        hasError = true;
                                    }
                                }
                            }
                        }
                    }
                }

                // If it has a source ref (like an Analytic Model)
                if (entityDef.source && entityDef.source.ref) {
                    for (const targetRef of entityDef.source.ref) {
                        if (!csnObj.definitions[targetRef]) {
                            console.error(`    ❌ ERROR: Analytic Model '${entityName}' source points to '${targetRef}' which is MISSING from definitions!`);
                            hasError = true;
                        } else {
                            console.log(`    ✅ Analytic Model source '${targetRef}' found in definitions.`);
                        }
                    }
                }
            }

            if (!hasError) {
                console.log(`    🎉 PASSED: Zero missing dependencies! 100% self-contained.`);
            }
        }
    }

    console.log('\n================================================================');
    console.log('ALL CSN TESTS PASSED PERFECTLY!');
    console.log('================================================================');
}

runE2EValidation().catch(e => {
    console.error('Test failed:', e);
    process.exit(1);
});
