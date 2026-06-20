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

app.listen(PORT, () => console.log(`server listening on ${PORT}`));

module.exports = app;
