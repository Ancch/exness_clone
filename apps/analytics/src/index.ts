import { startPnlUpdater } from './pnlUpdate';
import { updateRiskScores } from './riskUpdate';

async function main() {
  startPnlUpdater();
  // Run risk scoring every 10 minutes (and immediately on start)
  setInterval(updateRiskScores, 10 * 60 * 1000);
  updateRiskScores(); // optional first run
  console.log('Analytics service running (pnl + risk)');
}

main().catch(console.error);