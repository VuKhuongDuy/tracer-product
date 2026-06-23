# Design: Periodic transaction generator (loadgen)

**Date:** 2026-06-23
**Status:** Approved (design phase)

## Goal

A standalone Node.js script that continuously submits realistic transactions to
the `produce` chaincode at ~1–2 tx/s, to keep the network/explorer populated with
lifelike traffic. No app server or UI required.

## Constraints discovered

- The chaincode enforces **ABAC**: `CreateLot` needs `role=farmer` and the passed
  `farmerID` must equal the cert's `farmerId` attribute; `AddCertification` and
  `RecallLot` need `role=regulator`. So transactions must be signed with the
  registered **wallet identities** (farmerA/farmerB/regulator/...), not the peer
  CLI admin. Reuse `app/server/fabric.js`'s `withContract`.
- Private data via **transient**: `CreateLot` writes `price` (collection
  `tradePrice`: Org1/Org2) and `pii` (collection `farmerPII`: Org1/Org3).
  Endorsers `['Org1MSP','Org2MSP']` satisfy both (Org1 covers farmerPII).
- `fabric.js` currently hardcodes the test-network path to
  `/Users/alex/Project/...` — broken on any other machine. Must be made portable.

## Components

### 1. `app/server/fabric.js` (fixed)

Replace the hardcoded `TN` constant with a portable value:
`process.env.TEST_NETWORK || path.resolve(__dirname, '../../fabric-samples/test-network')`.
No other behavior change. This also fixes the app itself.

### 2. `app/server/loadgen.js` (new)

Reuses `fabric.js` (`withContract`, `IDENTITIES`) and `app/server/node_modules`.

**State:** an in-memory pool of active lots:
`{ id, farmerIdentity, stage, certified, recalled }`. Stages advance
`HARVESTED → PROCESSED → DISTRIBUTED → RETAIL`.

**Action picker (weighted random):**

| Action | Weight | Identity | Notes |
|--------|--------|----------|-------|
| CreateLot | 40% | farmerA or farmerB | new id; `farmerID` = FARMER-A/B; transient price+PII; endorsers Org1+Org2 |
| TransferCustody | 40% | htxStaff (role≠farmer, no ownership check) | pick active lot not at RETAIL; advance stage; new owner string per stage |
| AddCertification | 15% | regulator | pick active, non-recalled, non-certified lot; cert "VietGAP-..." |
| RecallLot | 5% | regulator | pick active lot; mark recalled, drop from active pool |

If a chosen action has no eligible lot, fall back to CreateLot.

**Transaction content:**
- products: ["Sầu riêng Ri6","Cà phê Robusta","Bơ 034","Chôm chôm","Bơ sáp"]; origin "HTX Đắk Lắk – <huyện>"; harvestDate recent; quantityKg random 500–3000.
- price `{buyPrice,sellPrice,currency:"VND",party}`; pii `{fullName,idNumber,phone,plotLocation}` — same shape the app uses (`transientFrom`).

**Rate + batching:** each tick fires a BURST of `BATCH_SIZE` (default 3)
transactions near-simultaneously, WITHOUT awaiting commit. Because the orderer
cuts a block at `MaxMessageCount=10` or `BatchTimeout=2s`, a burst of N (N≤10)
arriving together lands in ONE block — this is how we get multiple tx/block.
`INTERVAL_MS` defaults to `BATCH_SIZE*1000/TPS` so throughput stays ≈ TPS.
Within a burst, the same lot is not targeted twice (avoids MVCC_READ_CONFLICT).
In-flight submissions are capped by `MAX_INFLIGHT` (default `max(8, 2*BATCH_SIZE)`).

**Persistent connections:** the generator opens ONE gateway connection per
identity (`fabric.openGateway`) and reuses it for all submits. Opening/closing a
connection per tx (as `withContract` does) causes severe latency under bursts
(observed ~40s); reuse keeps commit latency ~150ms.

**Config (env):** `TPS` (1.5), `BATCH_SIZE` (3), `INTERVAL_MS` (overrides),
`MAX_INFLIGHT`, `DURATION_SEC` (0 = forever), `SEED_LOTS` (3).

**Preflight:** verify `app/server/wallet/<id>/msp/signcerts/cert.pem` exists for
the identities used; if missing, exit with a message telling the user to run
`bash scripts/register-users.sh`. Verify fabric-gateway module loads (npm install).

**Logging:** per completed tx → `HH:MM:SS [action] as=<id> lot=<id> stage=<s> ok (Nms)`
or `... ERR <msg>`. Every 10s print a summary: counts per action, ok/err totals,
effective tx/s, active-lot count.

**Shutdown:** on SIGINT/SIGTERM stop scheduling, wait for in-flight to drain (with
a timeout), print final summary, exit 0.

## Error handling

- Each transaction is independently try/caught; failures are logged and the loop
  continues. Expected transient errors (MVCC conflicts under load, a lot recalled
  between selection and submit) are non-fatal.
- A lot that errors on transfer is left in the pool; repeated failures are just
  logged (no special handling — YAGNI).

## Operation (server has no wallet yet)

1. Network up (`scripts/setup-network.sh`).
2. `bash scripts/register-users.sh` → creates `app/server/wallet/...`.
3. `cd app/server && npm install`.
4. `node loadgen.js` (or `TPS=2 node loadgen.js`).

## Out of scope

- Reading/verifying private data back (the app already demonstrates that).
- Persisting the active-lot pool across restarts (in-memory only; on restart it
  seeds fresh lots and can also transfer/cert/recall any lots it created this run).
- Distributed/multi-process load. Single process is enough for 1–2 tx/s.
