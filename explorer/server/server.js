'use strict';
const express = require('express');
const cors = require('cors');
const { CHANNEL, getChainInfoBytes, getBlockByNumberBytes, getBlockByTxIDBytes } = require('./fabric');
const { decodeChainInfo, decodeBlockBytes } = require('./decode');
const cache = require('./cache');

const PORT = process.env.PORT || 3001;

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

// Giao dịch hệ thống/cấu hình (lifecycle, config…) bị ẩn khỏi explorer công khai:
// chúng lộ chi tiết nội bộ và không phải hoạt động của người dùng.
const SYSTEM_CC = new Set(['_lifecycle', 'lscc', 'cscc', 'qscc', 'escc', 'vscc']);
const isPublicTx = (t) => !!t.to && !SYSTEM_CC.has(t.to);
const publicTxs = (b) => b.transactions.filter(isPublicTx);

const blockMeta = (b) => ({
  number: b.number, dataHash: b.dataHash, previousHash: b.previousHash,
  txCount: publicTxs(b).length, timestamp: b.timestamp,
});

// Tổng giao dịch và giao dịch trung bình hằng ngày trên toàn bộ chuỗi.
app.get('/api/stats/overview', async (req, res) => {
  try {
    const height = await chainHeight();
    let totalTx = 0;
    let firstTs = null;
    for (let n = 0; n < height; n++) {
      const b = await blockSummary(n);
      const pub = publicTxs(b);
      totalTx += pub.length;
      if (!firstTs && pub.length) firstTs = b.timestamp;
    }
    const days = firstTs ? (Date.now() - new Date(firstTs).getTime()) / 86400000 : 1;
    const dailyAvg = days > 0 ? (totalTx / days).toFixed(1) : '0';
    res.json({ totalTx, dailyAvg: Number(dailyAvg) });
  } catch (e) { res.status(500).json({ error: `Lỗi tính thống kê tổng quan: ${e.message || e}` }); }
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
    const [summary, height] = await Promise.all([blockSummary(n), chainHeight()]);
    const transactions = publicTxs(summary);
    res.json({ ...summary, transactions, txCount: transactions.length, confirmations: Math.max(0, height - n - 1) });
  } catch (e) { res.status(404).json({ error: `Không tìm thấy block ${n}: ${e.message || e}` }); }
});

app.get('/api/tx/:txid', async (req, res) => {
  const txid = (req.params.txid || '').trim();
  if (!txid) return res.status(400).json({ error: 'Thiếu mã giao dịch (tx hash)' });
  try {
    const block = decodeBlockBytes(await getBlockByTxIDBytes(txid));
    const tx = block.transactions.find((t) => t.txId === txid);
    if (!tx) return res.status(404).json({ error: `Không tìm thấy giao dịch ${txid}` });
    const height = await chainHeight();
    const meta = { blockNumber: block.number, confirmations: Math.max(0, height - block.number - 1) };
    // Giao dịch hệ thống: trả về dạng tối giản, không lộ chi tiết nội bộ.
    if (!isPublicTx(tx)) {
      res.json({ txId: tx.txId, status: tx.status, timestamp: tx.timestamp, from: tx.from, to: 'Hệ thống', method: '', params: [], stateChanges: [], ...meta });
    } else {
      res.json({ ...tx, ...meta });
    }
  } catch (e) { res.status(404).json({ error: `Không tìm thấy giao dịch ${txid}: ${e.message || e}` }); }
});

app.get('/api/txs', async (req, res) => {
  try {
    const count = Math.min(Number(req.query.count) || 15, 100);
    const { blocks } = await latestSummaries(Math.min(count, 40));
    const txs = [];
    for (const b of blocks) for (const t of publicTxs(b)) {
      txs.push({ ...t, blockNumber: b.number });
      if (txs.length >= count) break;
    }
    res.json(txs.slice(0, count));
  } catch (e) { res.status(500).json({ error: `Lỗi đọc giao dịch: ${e.message || e}` }); }
});

// Lịch sử giao dịch của một người dùng (theo tên định danh = CN chứng chỉ người gửi).
app.get('/api/users/:name/txs', async (req, res) => {
  const name = (req.params.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Thiếu tên người dùng' });
  try {
    const count = Math.min(Number(req.query.count) || 100, 500);
    const height = await chainHeight();
    const txs = [];
    for (let n = height - 1; n >= 0 && txs.length < count; n--) {
      const b = await blockSummary(n);
      for (const t of publicTxs(b)) {
        if (t.from === name) txs.push({ ...t, blockNumber: b.number });
        if (txs.length >= count) break;
      }
    }
    res.json({ name, count: txs.length, txs });
  } catch (e) { res.status(500).json({ error: `Lỗi đọc lịch sử người dùng: ${e.message || e}` }); }
});

// Lịch sử giao dịch của một hợp đồng thông minh (theo tên contract = đích đến).
app.get('/api/contracts/:name/txs', async (req, res) => {
  const name = (req.params.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Thiếu tên hợp đồng' });
  try {
    const count = Math.min(Number(req.query.count) || 100, 500);
    const height = await chainHeight();
    const txs = [];
    for (let n = height - 1; n >= 0 && txs.length < count; n--) {
      const b = await blockSummary(n);
      for (const t of publicTxs(b)) {
        if (t.to === name) txs.push({ ...t, blockNumber: b.number });
        if (txs.length >= count) break;
      }
    }
    res.json({ name, count: txs.length, txs });
  } catch (e) { res.status(500).json({ error: `Lỗi đọc lịch sử hợp đồng: ${e.message || e}` }); }
});

app.get('/api/stats', async (req, res) => {
  try {
    const count = Math.min(Number(req.query.count) || 20, 100);
    const { height, blocks } = await latestSummaries(count);
    const byContract = {};
    let totalTx = 0;
    for (const b of blocks) for (const t of publicTxs(b)) {
      totalTx += 1;
      byContract[t.to] = (byContract[t.to] || 0) + 1;
    }
    // perBlock theo thứ tự tăng dần block để vẽ biểu đồ trái->phải.
    const perBlock = blocks.map((b) => ({ number: b.number, txCount: publicTxs(b).length })).reverse();
    res.json({ height, totalTx, perBlock, byContract });
  } catch (e) { res.status(500).json({ error: `Lỗi tính thống kê: ${e.message || e}` }); }
});

app.listen(PORT, () => console.log(`explorer server đang chạy ở cổng ${PORT}`));
module.exports = app;
