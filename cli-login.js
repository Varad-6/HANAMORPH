const axios = require('axios');
const { execSync } = require('child_process');
const cfg = require('./config.json');

async function login() {
    try {
        console.log('[1/2] Fetching OAuth Access Token from SAP Datasphere OAuth Service...');
        const params = new URLSearchParams();
        params.append('grant_type', 'client_credentials');
        params.append('client_id', cfg.datasphere.clientId);
        params.append('client_secret', cfg.datasphere.clientSecret);

        const res = await axios.post(cfg.datasphere.tokenUrl, params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const token = res.data.access_token;
        console.log('[2/2] Logging into @sap/datasphere-cli on host:', cfg.datasphere.host);

        execSync(`npx @sap/datasphere-cli login --host "${cfg.datasphere.host}" --access-token "${token}" -F`, {
            stdio: 'inherit'
        });

        console.log('\n========================================');
        console.log('✔ Datasphere CLI Login Successful!');
        console.log('You can now run commands without entering credentials.');
        console.log('========================================\n');
    } catch (err) {
        console.error('Login error:', err.response ? err.response.data : err.message);
        process.exit(1);
    }
}

login();
