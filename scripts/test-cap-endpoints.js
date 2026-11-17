const http = require('http');

function postJson(path, payload) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(payload);
        const req = http.request({
            hostname: 'localhost',
            port: 4004,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        }, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    resolve({ status: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: body });
                }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function run() {
    console.log('Testing /odata/v4/migration/extractAndDeduplicateTables...');
    const res1 = await postJson('/odata/v4/migration/extractAndDeduplicateTables', {
        viewNames: ['CV_AC_TYPE', 'CV_BANK']
    });
    console.log('Response 1 Status:', res1.status);
    console.log('Tables extracted:', res1.data?.value?.map(t => ({
        source: t.sourceTable,
        target: t.targetTable,
        views: t.referencingViews,
        cols: t.columnCount
    })));

    console.log('\nTesting /odata/v4/migration/generateDeduplicatedReplicationPackage...');
    const res2 = await postJson('/odata/v4/migration/generateDeduplicatedReplicationPackage', {
        viewNames: ['CV_AC_TYPE', 'CV_BANK'],
        space: 'AIS_INBOUND',
        flowName: 'RF_INTEGRATION_TEST',
        tableOverridesJson: JSON.stringify({
            FCLM_BAM_AC_TYPE: {
                targetTable: 'S4H_AC_TYPE_LOCAL',
                businessName: 'Account Types Master'
            }
        })
    });
    console.log('Response 2 Status:', res2.status);
    console.log('Flow Name:', res2.data?.flowName);
    console.log('Table Count:', res2.data?.tableCount);
    console.log('Task Count:', res2.data?.taskCount);
    const flowJson = JSON.parse(res2.data?.replicationFlowJsonString || '{}');
    const csnJson = JSON.parse(res2.data?.targetTablesCsn || '{}');
    console.log('Replication Flow Tasks:', flowJson.tasks?.map(t => `${t.sourceObject} -> ${t.targetObject}`));
    console.log('CSN Table Definitions:', Object.keys(csnJson.definitions || {}));
}

run().catch(console.error);
