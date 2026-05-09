// Small script to invoke runReconciliation() from execution-engine to capture its logs without restarting the whole service.
// Loads env from repo root and runs the function once.

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../apps/exchange-gateway/.env') });

(async () => {
  try {
    const { runReconciliation } = await import('../apps/execution-engine/dist/reconciliation.js');
    await runReconciliation();
    console.log('Done');
  } catch (err) {
    console.error('Script error:', err);
    process.exit(1);
  }
})();
