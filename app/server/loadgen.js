'use strict';
//
// loadgen.js — continuous, realistic transaction generator for the `produce`
// traceability chaincode. Submits ~1–2 tx/s using the registered ABAC wallet
// identities (via fabric-gateway). No app server / UI required.
//
//   cd app/server && npm install         # once, for the fabric-gateway deps
//   bash scripts/register-users.sh        # once, creates app/server/wallet/...
//   node loadgen.js                       # run continuously (Ctrl-C to stop)
//   TPS=2 MAX_INFLIGHT=10 node loadgen.js
//
// Env: TPS (default 1.5), INTERVAL_MS (overrides TPS), MAX_INFLIGHT (8),
//      DURATION_SEC (0 = forever), SEED_LOTS (3).
//
const fs = require('fs');
const path = require('path');
const { withContract, IDENTITIES } = require('./fabric');

// ---- config ----
const TPS = Number(process.env.TPS || 1.5);
const INTERVAL_MS = Number(process.env.INTERVAL_MS || Math.max(1, Math.round(1000 / TPS)));
const MAX_INFLIGHT = Number(process.env.MAX_INFLIGHT || 8);
const DURATION_SEC = Number(process.env.DURATION_SEC || 0);
const SEED_LOTS = Number(process.env.SEED_LOTS || 3);
const PRIVATE_ENDORSERS = ['Org1MSP', 'Org2MSP'];

// ---- helpers ----
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const now = () => new Date().toTimeString().slice(0, 8);

// ---- transaction content pools ----
const PRODUCTS = ['Sầu riêng Ri6', 'Cà phê Robusta', 'Bơ 034', 'Chôm chôm nhãn', 'Bơ sáp', 'Tiêu đen'];
const DISTRICTS = ['Krông Pắc', 'Cư M\'gar', 'Buôn Đôn', 'Ea Kar', 'Lắk'];
const FARMER_NAMES = ['Nguyễn Văn An', 'Trần Thị Bình', 'Lê Văn Cường', 'Phạm Thị Dung'];
const CERTS = ['VietGAP', 'GlobalGAP', 'Kiểm dịch thực vật', 'Hữu cơ Organic'];
const RECALL_REASONS = ['Dư lượng thuốc BVTV vượt ngưỡng', 'Sự cố ATTP', 'Nhiễm khuẩn', 'Sai nhãn mác'];

// FARMER → ... lifecycle stages a lot moves through via TransferCustody.
const STAGE_FLOW = [
  { stage: 'PROCESSED',   role: 'PROCESSOR',   owner: () => `PACKHOUSE-DK-${rand(10, 40)}`,   location: () => `Cư M'gar, Đắk Lắk` },
  { stage: 'DISTRIBUTED', role: 'DISTRIBUTOR', owner: () => `DIST-HCM-${String(rand(1, 9)).padStart(2, '0')}`, location: () => 'Kho lạnh Thủ Đức' },
  { stage: 'RETAIL',      role: 'RETAILER',    owner: () => `RETAIL-WINMART-Q${rand(1, 12)}`,  location: () => `WinMart Quận ${rand(1, 12)}` },
];

// ---- in-memory state ----
const lots = [];            // { id, farmerIdentity, farmerID, stageIdx, certified, recalled }
let lotCounter = 0;         // monotonic suffix for unique ids
const stats = { CreateLot: 0, TransferCustody: 0, AddCertification: 0, RecallLot: 0, ok: 0, err: 0 };
let inFlight = 0;
let stopping = false;
let startedAt = Date.now();

const eligibleTransfer = () => lots.filter((l) => !l.recalled && l.stageIdx < STAGE_FLOW.length - 1);
const eligibleCertify  = () => lots.filter((l) => !l.recalled && !l.certified);
const eligibleRecall   = () => lots.filter((l) => !l.recalled);

// ---- transaction builders (return {action, identity, lot, run}) ----
function buildCreateLot() {
  const identity = pick(['farmerA', 'farmerB']);
  const farmerID = identity === 'farmerA' ? 'FARMER-A' : 'FARMER-B';
  const id = `LOT-LG-${Date.now()}-${(++lotCounter).toString().padStart(4, '0')}`;
  const productName = pick(PRODUCTS);
  const origin = `HTX Đắk Lắk – ${pick(DISTRICTS)}`;
  const harvestDate = new Date(Date.now() - rand(0, 10) * 86400000).toISOString().slice(0, 10);
  const quantityKg = rand(500, 3000);
  const price = { buyPrice: rand(30, 60) * 1000, sellPrice: rand(60, 120) * 1000, currency: 'VND', party: 'HTX-Retailer' };
  const pii = { fullName: pick(FARMER_NAMES), idNumber: String(rand(40, 99)), phone: `09${rand(10000000, 99999999)}`, plotLocation: pick(DISTRICTS) };
  const lot = { id, farmerIdentity: identity, farmerID, stageIdx: -1, certified: false, recalled: false };
  return {
    action: 'CreateLot', identity, lot,
    run: (c) => c.submit('CreateLot', {
      arguments: [id, productName, origin, farmerID, harvestDate, String(quantityKg)],
      transientData: { price: Buffer.from(JSON.stringify(price)), pii: Buffer.from(JSON.stringify(pii)) },
      endorsingOrganizations: PRIVATE_ENDORSERS,
    }),
    onCommit: () => lots.push(lot),
  };
}

function buildTransfer(lot) {
  const next = STAGE_FLOW[lot.stageIdx + 1];
  const newOwner = next.owner();
  return {
    action: 'TransferCustody', identity: 'htxStaff', lot,
    run: (c) => c.submitTransaction('TransferCustody', lot.id, newOwner, next.role, next.stage, next.location(), `Chuyển sang ${next.role}`),
    onCommit: () => { lot.stageIdx += 1; },
  };
}

function buildCertify(lot) {
  const cert = `${pick(CERTS)}-2026-DK-${String(rand(1, 999)).padStart(4, '0')}`;
  return {
    action: 'AddCertification', identity: 'regulator', lot,
    run: (c) => c.submitTransaction('AddCertification', lot.id, cert, 'BoNN-CucBVTV'),
    onCommit: () => { lot.certified = true; },
  };
}

function buildRecall(lot) {
  return {
    action: 'RecallLot', identity: 'regulator', lot,
    run: (c) => c.submitTransaction('RecallLot', lot.id, 'BoNN-CucBVTV', pick(RECALL_REASONS)),
    onCommit: () => { lot.recalled = true; },
  };
}

// Weighted action selection with graceful fallback to CreateLot.
function nextTransaction() {
  const r = Math.random();
  if (r < 0.40) return buildCreateLot();
  if (r < 0.80) { const e = eligibleTransfer(); if (e.length) return buildTransfer(pick(e)); }
  if (r < 0.95) { const e = eligibleCertify();  if (e.length) return buildCertify(pick(e)); }
  else          { const e = eligibleRecall();   if (e.length) return buildRecall(pick(e)); }
  return buildCreateLot();
}

// ---- execution ----
async function fire(tx) {
  inFlight += 1;
  const t0 = Date.now();
  try {
    await withContract(tx.identity, tx.run);
    if (tx.onCommit) tx.onCommit();
    stats[tx.action] += 1; stats.ok += 1;
    console.log(`${now()} [${tx.action.padEnd(15)}] as=${tx.identity.padEnd(9)} lot=${tx.lot.id} ${Date.now() - t0}ms`);
  } catch (e) {
    stats.err += 1;
    console.log(`${now()} [${tx.action.padEnd(15)}] as=${tx.identity.padEnd(9)} lot=${tx.lot.id} ERR ${String(e.message || e).split('\n')[0]}`);
  } finally {
    inFlight -= 1;
  }
}

function tick() {
  if (stopping) return;
  if (inFlight < MAX_INFLIGHT) fire(nextTransaction());
  setTimeout(tick, INTERVAL_MS);
}

function printSummary(tag = '') {
  const secs = (Date.now() - startedAt) / 1000;
  const tps = (stats.ok / secs).toFixed(2);
  console.log(`${now()} ── summary${tag} ── ok=${stats.ok} err=${stats.err} | ` +
    `create=${stats.CreateLot} transfer=${stats.TransferCustody} certify=${stats.AddCertification} recall=${stats.RecallLot} | ` +
    `active=${eligibleRecall().length}/${lots.length} | inflight=${inFlight} | ~${tps} tx/s`);
}

// ---- preflight ----
function preflight() {
  const needed = ['farmerA', 'farmerB', 'htxStaff', 'regulator'];
  const missing = needed.filter((id) => {
    const cert = path.join(__dirname, 'wallet', id, 'msp', 'signcerts', 'cert.pem');
    return !fs.existsSync(cert);
  });
  if (missing.length) {
    console.error(`\nMissing wallet identities: ${missing.join(', ')}`);
    console.error('Create them first (network must be up):');
    console.error('  bash scripts/register-users.sh\n');
    process.exit(1);
  }
  for (const id of needed) {
    if (!IDENTITIES[id]) { console.error(`identity ${id} not defined in fabric.js`); process.exit(1); }
  }
}

async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log(`\n${now()} stopping — draining ${inFlight} in-flight tx...`);
  const deadline = Date.now() + 30000;
  while (inFlight > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
  printSummary(' (final)');
  process.exit(0);
}

async function main() {
  preflight();
  console.log(`loadgen: TPS≈${(1000 / INTERVAL_MS).toFixed(2)} (interval ${INTERVAL_MS}ms), max-inflight ${MAX_INFLIGHT}` +
    (DURATION_SEC ? `, duration ${DURATION_SEC}s` : ', running forever (Ctrl-C to stop)'));

  // Seed a few lots so transfers/certs/recalls have something to act on.
  for (let i = 0; i < SEED_LOTS; i++) await fire(buildCreateLot());

  startedAt = Date.now();
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  const summaryTimer = setInterval(() => printSummary(), 10000);
  if (DURATION_SEC) setTimeout(() => { clearInterval(summaryTimer); shutdown(); }, DURATION_SEC * 1000);
  tick();
}

main().catch((e) => { console.error('fatal:', e); process.exit(1); });
