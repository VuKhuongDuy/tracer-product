# M3 — Backend API (Express + fabric-gateway) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend REST API kết nối Fabric bằng `@hyperledger/fabric-gateway`, query/submit chaincode `produce` theo danh tính (role) mà client chọn, để frontend hiển thị "mỗi role thấy gì" — field mật bị Fabric chặn trả về `{locked:true}`.

**Architecture:** Node.js (CommonJS) + Express. Module `fabric.js` cấu hình ánh xạ user→org→peer, nạp cert+key từ wallet, mở `Gateway` tới peer của org tương ứng, lấy contract `produce` trên channel `mychannel`. `server.js` expose REST endpoint. Khi đọc private data mà org không phải thành viên, Fabric ném lỗi → bắt và trả `{locked:true}` (cưỡng chế thật, không phải app ẩn). Trang trace công khai dùng danh tính read-only và chỉ gọi hàm công khai.

**Tech Stack:** Node 22, Express, @hyperledger/fabric-gateway, @grpc/grpc-js, qrcode, cors.

## Global Constraints

- Network đang chạy: Fabric 3.1.5 BFT, channel `mychannel`, chaincode `produce` v3.0 seq3 (có 2 private collection + ABAC).
- Peer của từng org (kết nối gateway theo org của danh tính):
  - org1 `localhost:7051`, host override `peer0.org1.example.com`
  - org2 `localhost:9051`, host override `peer0.org2.example.com`
  - org3 `localhost:11051`, host override `peer0.org3.example.com`
  - TLS root cert: `fabric-samples/test-network/organizations/peerOrganizations/orgN.example.com/peers/peer0.orgN.example.com/tls/ca.crt`
- Wallet (từ M2): `/Users/alex/Project/hyperledger-fabric/app/server/wallet/<user>/msp/signcerts/cert.pem` + `keystore/<key>`.
- Ánh xạ danh tính (dùng verbatim):
  - `farmerA` Org1MSP role farmer "Nông dân A"; `farmerB` Org1MSP role farmer "Nông dân B"; `htxStaff` Org1MSP role htx "Cán bộ HTX"; `retailer` Org2MSP role retailer "Siêu thị / Bán lẻ"; `regulator` Org3MSP role regulator "Cơ quan quản lý (Bộ NN)".
- Channel `mychannel`, chaincode `produce`.
- TEST_NETWORK gốc: `/Users/alex/Project/hyperledger-fabric/fabric-samples/test-network`.
- Backend chạy cổng **3000**. WEB_BASE mặc định `http://localhost:5173` (Vite, dùng cho QR).
- CreateLot/TransferCustody ghi private data → submit với `endorsingOrganizations: ['Org1MSP','Org2MSP']` (Org1 là thành viên cả 2 collection).
- Shell in stderr `.cargo/env` vô hại — bỏ qua. Repo KHÔNG git → bỏ bước commit.

---

### Task 1: Scaffold + module kết nối Fabric (fabric.js)

**Files:**
- Create: `app/server/package.json`
- Create: `app/server/fabric.js`
- Create: `app/server/smoke.js` (script kiểm tra kết nối, xoá sau cũng được nhưng giữ lại tiện debug)

**Interfaces:**
- Produces: `fabric.js` export `IDENTITIES` (object), `listIdentities()`, `withContract(userId, async (contract) => …)`, `evaluateJSON(contract, fn, ...args)`, `tryReadJSON(contract, fn, ...args) -> {locked, data, error}`.

- [ ] **Step 1: Tạo package.json**

```json
{
  "name": "produce-traceability-server",
  "version": "1.0.0",
  "private": true,
  "main": "server.js",
  "scripts": { "start": "node server.js" },
  "dependencies": {
    "@grpc/grpc-js": "^1.11.3",
    "@hyperledger/fabric-gateway": "^1.7.0",
    "cors": "^2.8.5",
    "express": "^4.21.0",
    "qrcode": "^1.5.4"
  }
}
```

- [ ] **Step 2: Cài dependencies**

Run: `cd /Users/alex/Project/hyperledger-fabric/app/server && npm install`
Expected: tạo `node_modules/`, không lỗi nghiêm trọng.

- [ ] **Step 3: Tạo fabric.js**

```js
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const grpc = require('@grpc/grpc-js');
const { connect, signers } = require('@hyperledger/fabric-gateway');

const TN = '/Users/alex/Project/hyperledger-fabric/fabric-samples/test-network';
const WALLET = path.join(__dirname, 'wallet');
const CHANNEL = 'mychannel';
const CHAINCODE = 'produce';

const ORGS = {
  org1: { endpoint: 'localhost:7051', host: 'peer0.org1.example.com' },
  org2: { endpoint: 'localhost:9051', host: 'peer0.org2.example.com' },
  org3: { endpoint: 'localhost:11051', host: 'peer0.org3.example.com' },
};
function tlsCert(org) {
  return path.join(TN, `organizations/peerOrganizations/${org}.example.com/peers/peer0.${org}.example.com/tls/ca.crt`);
}

const IDENTITIES = {
  farmerA:   { org: 'org1', msp: 'Org1MSP', role: 'farmer',    label: 'Nông dân A' },
  farmerB:   { org: 'org1', msp: 'Org1MSP', role: 'farmer',    label: 'Nông dân B' },
  htxStaff:  { org: 'org1', msp: 'Org1MSP', role: 'htx',       label: 'Cán bộ HTX' },
  retailer:  { org: 'org2', msp: 'Org2MSP', role: 'retailer',  label: 'Siêu thị / Bán lẻ' },
  regulator: { org: 'org3', msp: 'Org3MSP', role: 'regulator', label: 'Cơ quan quản lý (Bộ NN)' },
};

function listIdentities() {
  return Object.entries(IDENTITIES).map(([id, v]) => ({ id, ...v }));
}

function newGrpcClient(org) {
  const root = fs.readFileSync(tlsCert(org.orgKey));
  const creds = grpc.credentials.createSsl(root);
  return new grpc.Client(org.endpoint, creds, { 'grpc.ssl_target_name_override': org.host });
}

function loadIdentity(userId, mspId) {
  const credentials = fs.readFileSync(path.join(WALLET, userId, 'msp', 'signcerts', 'cert.pem'));
  return { mspId, credentials };
}

function loadSigner(userId) {
  const keyDir = path.join(WALLET, userId, 'msp', 'keystore');
  const keyFile = fs.readdirSync(keyDir)[0];
  const pem = fs.readFileSync(path.join(keyDir, keyFile));
  return signers.newPrivateKeySigner(crypto.createPrivateKey(pem));
}

async function withContract(userId, fn) {
  const cfg = IDENTITIES[userId];
  if (!cfg) throw new Error(`unknown identity: ${userId}`);
  const org = { ...ORGS[cfg.org], orgKey: cfg.org };
  const client = newGrpcClient(org);
  const gateway = connect({
    client,
    identity: loadIdentity(userId, cfg.msp),
    signer: loadSigner(userId),
    evaluateOptions: () => ({ deadline: Date.now() + 15000 }),
    endorseOptions: () => ({ deadline: Date.now() + 30000 }),
    submitOptions: () => ({ deadline: Date.now() + 30000 }),
    commitStatusOptions: () => ({ deadline: Date.now() + 60000 }),
  });
  try {
    const contract = gateway.getNetwork(CHANNEL).getContract(CHAINCODE);
    return await fn(contract);
  } finally {
    gateway.close();
    client.close();
  }
}

async function evaluateJSON(contract, fnName, ...args) {
  const bytes = await contract.evaluateTransaction(fnName, ...args);
  const text = Buffer.from(bytes).toString();
  return text ? JSON.parse(text) : null;
}

// tryReadJSON: trả {locked:true} nếu Fabric từ chối (org không phải thành viên collection)
async function tryReadJSON(contract, fnName, ...args) {
  try {
    const data = await evaluateJSON(contract, fnName, ...args);
    return { locked: false, data };
  } catch (e) {
    return { locked: true, error: String(e.message || e) };
  }
}

module.exports = { IDENTITIES, listIdentities, withContract, evaluateJSON, tryReadJSON, CHANNEL, CHAINCODE };
```

- [ ] **Step 4: Tạo smoke.js (kiểm tra kết nối)**

```js
const { withContract, evaluateJSON } = require('./fabric');
(async () => {
  const lots = await withContract('htxStaff', (c) => evaluateJSON(c, 'GetAllLots'));
  console.log('SMOKE_OK lots=' + (Array.isArray(lots) ? lots.length : 'null'));
})().catch((e) => { console.error('SMOKE_FAIL', e); process.exit(1); });
```

- [ ] **Step 5: Chạy smoke test**

Run: `cd /Users/alex/Project/hyperledger-fabric/app/server && node smoke.js`
Expected: in `SMOKE_OK lots=<số>` (kết nối gateway + đọc ledger thành công). Nếu `SMOKE_FAIL`, sửa cấu hình kết nối trước khi đi tiếp.

---

### Task 2: Express server — endpoint đọc

**Files:**
- Create: `app/server/server.js`

**Interfaces:**
- Consumes: `fabric.js` (Task 1).
- Produces: server cổng 3000 với `GET /api/identities`, `GET /api/lots`, `GET /api/lots/:id`, `GET /api/trace/:id`. Mỗi lô đọc kèm `price` và `pii` dạng `{locked, data}`.

- [ ] **Step 1: Tạo server.js (phần read)**

```js
'use strict';
const express = require('express');
const cors = require('cors');
const { listIdentities, withContract, evaluateJSON, tryReadJSON } = require('./fabric');

const PORT = process.env.PORT || 3000;
const PUBLIC_IDENTITY = 'htxStaff'; // danh tính read-only cho trang trace công khai

const app = express();
app.use(cors());
app.use(express.json());

function getAs(req) {
  const as = (req.query.as || req.body.as || '').toString();
  return as || 'htxStaff';
}

// gắn price/pii (locked nếu org không có quyền) vào 1 lô
async function enrichLot(contract, lot) {
  const [price, pii] = await Promise.all([
    tryReadJSON(contract, 'ReadPrice', lot.id),
    tryReadJSON(contract, 'ReadFarmerPII', lot.id),
  ]);
  return { ...lot, price, pii };
}

app.get('/api/identities', (req, res) => res.json(listIdentities()));

app.get('/api/lots', async (req, res) => {
  try {
    const as = getAs(req);
    const result = await withContract(as, async (c) => {
      const lots = (await evaluateJSON(c, 'GetAllLots')) || [];
      return Promise.all(lots.map((l) => enrichLot(c, l)));
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

app.get('/api/lots/:id', async (req, res) => {
  try {
    const as = getAs(req);
    const result = await withContract(as, async (c) => {
      const lot = await evaluateJSON(c, 'ReadLot', req.params.id);
      const provenance = await evaluateJSON(c, 'GetLotProvenance', req.params.id);
      const enriched = await enrichLot(c, lot);
      return { ...enriched, provenance };
    });
    res.json(result);
  } catch (e) { res.status(404).json({ error: String(e.message || e) }); }
});

// Trang trace công khai: chỉ dữ liệu công khai, KHÔNG đọc private data.
app.get('/api/trace/:id', async (req, res) => {
  try {
    const result = await withContract(PUBLIC_IDENTITY, async (c) => {
      const lot = await evaluateJSON(c, 'ReadLot', req.params.id);
      const provenance = await evaluateJSON(c, 'GetLotProvenance', req.params.id);
      return {
        id: lot.id, productName: lot.productName, origin: lot.origin,
        harvestDate: lot.harvestDate, certifications: lot.certifications,
        currentOwner: lot.currentOwner, currentStage: lot.currentStage,
        recalled: lot.recalled, recallReason: lot.recallReason || '', provenance,
      };
    });
    res.json(result);
  } catch (e) { res.status(404).json({ error: String(e.message || e) }); }
});

app.listen(PORT, () => console.log(`server listening on ${PORT}`));

module.exports = app;
```

- [ ] **Step 2: Khởi động server (nền) và smoke curl**

Run:
```bash
cd /Users/alex/Project/hyperledger-fabric/app/server
(node server.js & echo $! > /tmp/srv.pid); sleep 3
curl -s localhost:3000/api/identities | head -c 300; echo
curl -s "localhost:3000/api/lots?as=regulator" | head -c 300; echo
kill $(cat /tmp/srv.pid) 2>/dev/null
```
Expected: `/api/identities` trả mảng 5 danh tính; `/api/lots?as=regulator` trả mảng lô (mỗi lô có `price` và `pii`).

---

### Task 3: Endpoint ghi + QR

**Files:**
- Modify: `app/server/server.js`

**Interfaces:**
- Consumes: `withContract` (Task 1), app (Task 2).
- Produces: `POST /api/lots`, `POST /api/lots/:id/transfer`, `POST /api/lots/:id/certify`, `POST /api/lots/:id/recall`, `GET /api/qrcode/:id`.

- [ ] **Step 1: Thêm endpoint ghi + QR (trước dòng `app.listen`)**

```js
const QRCode = require('qrcode');
const WEB_BASE = process.env.WEB_BASE || 'http://localhost:5173';

function transientFrom(body) {
  const t = {};
  if (body.pii)   t.pii = Buffer.from(JSON.stringify(body.pii));
  if (body.price) t.price = Buffer.from(JSON.stringify(body.price));
  return t;
}
const PRIVATE_ENDORSERS = ['Org1MSP', 'Org2MSP'];

app.post('/api/lots', async (req, res) => {
  try {
    const as = getAs(req);
    const b = req.body;
    await withContract(as, (c) => c.submit('CreateLot', {
      arguments: [b.id, b.productName, b.origin, b.farmerID, b.harvestDate, String(b.quantityKg)],
      transientData: transientFrom(b),
      endorsingOrganizations: PRIVATE_ENDORSERS,
    }));
    res.json({ ok: true, id: b.id });
  } catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});

app.post('/api/lots/:id/transfer', async (req, res) => {
  try {
    const as = getAs(req);
    const b = req.body;
    await withContract(as, (c) => c.submit('TransferCustody', {
      arguments: [req.params.id, b.newOwner, b.newOwnerRole, b.stage, b.location || '', b.note || ''],
      transientData: transientFrom(b),
      endorsingOrganizations: PRIVATE_ENDORSERS,
    }));
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});

app.post('/api/lots/:id/certify', async (req, res) => {
  try {
    const as = getAs(req);
    const b = req.body;
    await withContract(as, (c) => c.submitTransaction('AddCertification', req.params.id, b.certification, b.issuedBy));
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});

app.post('/api/lots/:id/recall', async (req, res) => {
  try {
    const as = getAs(req);
    const b = req.body;
    await withContract(as, (c) => c.submitTransaction('RecallLot', req.params.id, b.regulator, b.reason));
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});

app.get('/api/qrcode/:id', async (req, res) => {
  try {
    const url = `${WEB_BASE}/trace/${encodeURIComponent(req.params.id)}`;
    const dataUrl = await QRCode.toDataURL(url);
    res.json({ url, dataUrl });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});
```

- [ ] **Step 2: Khởi động lại + smoke ghi**

Run:
```bash
cd /Users/alex/Project/hyperledger-fabric/app/server
(node server.js & echo $! > /tmp/srv.pid); sleep 3
LOT="API-$(date +%s)"
curl -s -XPOST localhost:3000/api/lots -H 'content-type: application/json' \
  -d "{\"as\":\"farmerA\",\"id\":\"$LOT\",\"productName\":\"Sau rieng\",\"origin\":\"Dak Lak\",\"farmerID\":\"FARMER-A\",\"harvestDate\":\"2026-06-10\",\"quantityKg\":1000,\"pii\":{\"fullName\":\"Nguyen Van A\",\"idNumber\":\"066\",\"phone\":\"0900\",\"plotLocation\":\"Krong Pac\"},\"price\":{\"buyPrice\":45000,\"sellPrice\":70000,\"currency\":\"VND\",\"party\":\"HTX-Retailer\"}}"; echo
curl -s "localhost:3000/api/qrcode/$LOT" | head -c 120; echo
echo "$LOT" > /tmp/api_lot.txt
kill $(cat /tmp/srv.pid) 2>/dev/null
```
Expected: POST trả `{"ok":true,"id":"API-..."}`; qrcode trả `{"url":"http://localhost:5173/trace/API-...","dataUrl":"data:image/png;base64,...`.

---

### Task 4: Test tích hợp API (acceptance)

**Files:**
- Create: `app/server/verify-api.sh`

**Interfaces:**
- Consumes: server (Task 2-3), chaincode (M1/M2).
- Produces: script khởi động server, tạo 1 lô có private data, kiểm chứng locked theo role, dừng server; in PASS/FAIL.

- [ ] **Step 1: Viết app/server/verify-api.sh**

```bash
#!/usr/bin/env bash
# Kiểm chứng API phản ánh đúng cưỡng chế Fabric theo role.
set -uo pipefail
cd /Users/alex/Project/hyperledger-fabric/app/server
node server.js > /tmp/api_srv.log 2>&1 & SRV=$!
sleep 3
pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then echo "PASS: $1"; pass=$((pass+1)); else echo "FAIL: $1 (got '$3' expect '$2')"; fail=$((fail+1)); fi; }

LOT="APIT-$(date +%s)"
# 1) farmerA tạo lô kèm pii+price
OK=$(curl -s -XPOST localhost:3000/api/lots -H 'content-type: application/json' \
  -d "{\"as\":\"farmerA\",\"id\":\"$LOT\",\"productName\":\"Sau rieng\",\"origin\":\"Dak Lak\",\"farmerID\":\"FARMER-A\",\"harvestDate\":\"2026-06-10\",\"quantityKg\":1000,\"pii\":{\"fullName\":\"A\",\"idNumber\":\"066\",\"phone\":\"0900\",\"plotLocation\":\"KP\"},\"price\":{\"buyPrice\":45000,\"sellPrice\":70000,\"currency\":\"VND\",\"party\":\"x\"}}" | jq -r '.ok')
chk "farmerA tạo lô qua API" "true" "$OK"
sleep 3

# 2) retailer (Org2): thấy price, KHÓA pii
R=$(curl -s "localhost:3000/api/lots/$LOT?as=retailer")
chk "retailer thấy price"  "false" "$(echo "$R" | jq -r '.price.locked')"
chk "retailer bị khóa pii" "true"  "$(echo "$R" | jq -r '.pii.locked')"

# 3) regulator (Org3): thấy pii, KHÓA price
G=$(curl -s "localhost:3000/api/lots/$LOT?as=regulator")
chk "regulator thấy pii"    "false" "$(echo "$G" | jq -r '.pii.locked')"
chk "regulator bị khóa price" "true" "$(echo "$G" | jq -r '.price.locked')"

# 4) trace công khai: KHÔNG có field private
T=$(curl -s "localhost:3000/api/trace/$LOT")
chk "trace có hành trình"   "true"  "$(echo "$T" | jq -r '(.provenance|length>0)')"
chk "trace không lộ price"   "null"  "$(echo "$T" | jq -r '.price')"

# 5) retailer tạo lô -> bị từ chối (ABAC)
ERR=$(curl -s -XPOST localhost:3000/api/lots -H 'content-type: application/json' \
  -d "{\"as\":\"retailer\",\"id\":\"${LOT}-x\",\"productName\":\"x\",\"origin\":\"y\",\"farmerID\":\"FARMER-A\",\"harvestDate\":\"2026-06-10\",\"quantityKg\":1}" | jq -r '.error // empty')
[ -n "$ERR" ] && { echo "PASS: retailer tạo lô bị từ chối"; pass=$((pass+1)); } || { echo "FAIL: retailer tạo lô không bị từ chối"; fail=$((fail+1)); }

kill $SRV 2>/dev/null
echo "----"; echo "PASS=$pass FAIL=$fail"; [ "$fail" -eq 0 ]
```

- [ ] **Step 2: Chạy test, xác nhận tất cả PASS**

Run: `bash /Users/alex/Project/hyperledger-fabric/app/server/verify-api.sh`
Expected: `PASS=8 FAIL=0`, exit 0. Quan trọng: `retailer bị khóa pii`, `regulator bị khóa price`, `trace không lộ price`, `retailer tạo lô bị từ chối`.

---

## Self-Review

**Spec coverage (mục §4 spec):**
- Endpoint identities/lots/lot:id/trace/qrcode + POST create/transfer/certify/recall → Task 2, 3. ✓
- Query theo danh tính `as`, field mật trả `{locked}` do Fabric chặn → `tryReadJSON` + `enrichLot` (Task 1-2). ✓
- Trace công khai không trả private → endpoint `/api/trace/:id` chỉ map field công khai (Task 2). ✓
- QR trỏ trang trace → Task 3. ✓
- Acceptance §8 #1 (retailer thấy giá, khóa PII), #2 (regulator thấy PII, khóa giá), #4 (trace QR không lộ private) → Task 4. ✓

**Placeholder scan:** không có TBD/TODO; code đầy đủ. ✓

**Type consistency:** `withContract/evaluateJSON/tryReadJSON/listIdentities`, danh tính keys, endpoint paths, field `{locked,data}` — nhất quán Task 1→4. ✓

**Rủi ro:** (1) submit private data cần endorser là thành viên collection → đã set `endorsingOrganizations:['Org1MSP','Org2MSP']`. (2) Lần submit đầu có thể chậm (container) → script có sleep; nếu commit timeout, tăng deadline/sleep. (3) `node server.js &` chạy nền — nhớ kill PID sau test.

## Execution Handoff

Thực thi bằng subagent-driven-development. Xem cuối hội thoại.
