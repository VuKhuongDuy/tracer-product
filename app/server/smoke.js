const { withContract, evaluateJSON } = require('./fabric');
(async () => {
  const lots = await withContract('htxStaff', (c) => evaluateJSON(c, 'GetAllLots'));
  console.log('SMOKE_OK lots=' + (Array.isArray(lots) ? lots.length : 'null'));
})().catch((e) => { console.error('SMOKE_FAIL', e); process.exit(1); });
