'use strict';
const express = require('express');
const cors = require('cors');
const { CHANNEL, getChainInfoBytes, getBlockByNumberBytes, getBlockByTxIDBytes } = require('./fabric');
const { decodeChainInfo, decodeBlockBytes } = require('./decode');
const cache = require('./cache');

const PORT = process.env.PORT || 3001;

// Topology mạng test-network (qscc không cung cấp, nên khai báo tĩnh).
const NETWORK = {
  channel: CHANNEL,
  orgs: [
    { mspId: 'Org1MSP', name: 'HTX / Nông dân (Org1)' },
    { mspId: 'Org2MSP', name: 'Siêu thị / Bán lẻ (Org2)' },
    { mspId: 'Org3MSP', name: 'Cơ quan quản lý (Org3)' },
  ],
  peers: [
    { name: 'peer0.org1.example.com', url: 'localhost:7051' },
    { name: 'peer0.org2.example.com', url: 'localhost:9051' },
    { name: 'peer0.org3.example.com', url: 'localhost:11051' },
  ],
  orderers: [
    { name: 'orderer.example.com', url: 'localhost:7050' },
    { name: 'orderer2.example.com', url: 'localhost:7052' },
    { name: 'orderer3.example.com', url: 'localhost:7056' },
    { name: 'orderer4.example.com', url: 'localhost:7058' },
  ],
  consensus: 'BFT (smartbft)',
};

const app = express();
app.use(cors());

// Lấy chiều cao chuỗi hiện tại.
async function chainHeight() {
  return decodeChainInfo(await getChainInfoBytes()).height;
}

// Tóm tắt 1 block (có cache vì block bất biến).
async function blockSummary(n) {
  if (cache.has(n)) return cache.get(n);
  const summary = decodeBlockBytes(await getBlockByNumberBytes(n));
  cache.set(n, summary);
  return summary;
}

// Tóm tắt N block mới nhất (mới -> cũ).
async function latestSummaries(count) {
  const height = await chainHeight();
  const start = height - 1;
  const end = Math.max(0, height - count);
  const out = [];
  for (let n = start; n >= end; n--) out.push(await blockSummary(n));
  return { height, blocks: out };
}

const blockMeta = (b) => ({
  number: b.number, dataHash: b.dataHash, previousHash: b.previousHash,
  txCount: b.txCount, timestamp: b.timestamp,
});

app.get('/api/chain', async (req, res) => {
  try {
    const info = decodeChainInfo(await getChainInfoBytes());
    res.json({ channel: CHANNEL, ...info });
  } catch (e) { res.status(500).json({ error: `Lỗi đọc thông tin chuỗi: ${e.message || e}` }); }
});

app.get('/api/blocks', async (req, res) => {
  try {
    const count = Math.min(Number(req.query.count) || 20, 100);
    const { blocks } = await latestSummaries(count);
    res.json(blocks.map(blockMeta));
  } catch (e) { res.status(500).json({ error: `Lỗi đọc danh sách block: ${e.message || e}` }); }
});

app.get('/api/blocks/:number', async (req, res) => {
  const n = Number(req.params.number);
  if (!Number.isInteger(n) || n < 0) return res.status(400).json({ error: 'Số block không hợp lệ' });
  try {
    res.json(await blockSummary(n));
  } catch (e) { res.status(404).json({ error: `Không tìm thấy block ${n}: ${e.message || e}` }); }
});

app.get('/api/tx/:txid', async (req, res) => {
  const txid = (req.params.txid || '').trim();
  if (!txid) return res.status(400).json({ error: 'Thiếu mã giao dịch (tx hash)' });
  try {
    const block = decodeBlockBytes(await getBlockByTxIDBytes(txid));
    const tx = block.transactions.find((t) => t.txId === txid);
    if (!tx) return res.status(404).json({ error: `Không tìm thấy giao dịch ${txid}` });
    res.json({ ...tx, blockNumber: block.number });
  } catch (e) { res.status(404).json({ error: `Không tìm thấy giao dịch ${txid}: ${e.message || e}` }); }
});

app.get('/api/txs', async (req, res) => {
  try {
    const count = Math.min(Number(req.query.count) || 15, 100);
    const { blocks } = await latestSummaries(Math.min(count, 40));
    const txs = [];
    for (const b of blocks) for (const t of b.transactions) {
      txs.push({ ...t, blockNumber: b.number });
      if (txs.length >= count) break;
    }
    res.json(txs.slice(0, count));
  } catch (e) { res.status(500).json({ error: `Lỗi đọc giao dịch: ${e.message || e}` }); }
});

app.get('/api/stats', async (req, res) => {
  try {
    const count = Math.min(Number(req.query.count) || 20, 100);
    const { height, blocks } = await latestSummaries(count);
    const byChaincode = {};
    let totalTx = 0;
    for (const b of blocks) for (const t of b.transactions) {
      totalTx += 1;
      const key = t.chaincode || t.type;
      byChaincode[key] = (byChaincode[key] || 0) + 1;
    }
    // perBlock theo thứ tự tăng dần block để vẽ biểu đồ trái->phải.
    const perBlock = blocks.map((b) => ({ number: b.number, txCount: b.txCount })).reverse();
    res.json({ height, totalTx, perBlock, byChaincode });
  } catch (e) { res.status(500).json({ error: `Lỗi tính thống kê: ${e.message || e}` }); }
});

app.get('/api/network', async (req, res) => {
  try {
    const { height, blocks } = await latestSummaries(40);
    const chaincodes = [...new Set(blocks.flatMap((b) => b.transactions.map((t) => t.chaincode).filter(Boolean)))];
    res.json({ ...NETWORK, height, chaincodes });
  } catch (e) { res.status(500).json({ error: `Lỗi đọc thông tin mạng: ${e.message || e}` }); }
});

app.listen(PORT, () => console.log(`explorer server đang chạy ở cổng ${PORT}`));
module.exports = app;
