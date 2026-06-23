'use strict';
// Test decode.js bằng fixture block thật (capture từ network) -> chạy không cần Fabric.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { decodeBlockBytes, decodeChainInfo, longToNum } = require('../decode');

const blockBytes = Buffer.from(fs.readFileSync(path.join(__dirname, 'block-105.fixture.b64'), 'utf8'), 'base64');
const chainBytes = Buffer.from(fs.readFileSync(path.join(__dirname, 'chaininfo.fixture.b64'), 'utf8'), 'base64');

test('longToNum xử lý Long-like, number, string', () => {
  assert.strictEqual(longToNum({ low: 105, high: 0 }), 105);
  assert.strictEqual(longToNum(7), 7);
  assert.strictEqual(longToNum('42'), 42);
  assert.strictEqual(longToNum(null), 0);
});

test('decodeChainInfo trả height và hash hex', () => {
  const info = decodeChainInfo(chainBytes);
  assert.ok(info.height > 0, 'height phải > 0');
  assert.match(info.currentBlockHash, /^[0-9a-f]{64}$/, 'currentBlockHash là hex 32 byte');
});

test('decodeBlockBytes map đúng cấu trúc block', () => {
  const b = decodeBlockBytes(blockBytes);
  assert.strictEqual(b.number, 105);
  assert.match(b.dataHash, /^[0-9a-f]{64}$/);
  assert.match(b.previousHash, /^[0-9a-f]{64}$/);
  assert.strictEqual(b.txCount, 1);
  assert.strictEqual(b.transactions.length, 1);
});

test('summarizeTx rút trích trường chung from/to/method/params/stateChanges/status', () => {
  const tx = decodeBlockBytes(blockBytes).transactions[0];
  assert.strictEqual(tx.to, 'produce');
  assert.strictEqual(tx.method, 'RecallLot');
  assert.strictEqual(tx.status, 'Success');
  assert.strictEqual(tx.from, 'regulator');
  assert.ok(Array.isArray(tx.params) && tx.params.length >= 1);
  assert.ok(tx.txId.length === 64);
  // state changes có key được ghi, không lộ namespace nội bộ _lifecycle
  assert.ok(Array.isArray(tx.stateChanges) && tx.stateChanges.length >= 1);
  assert.ok(tx.stateChanges.some((c) => c.key && c.key.length > 0));
  // không rò trường đặc thù Fabric
  assert.strictEqual(tx.chaincode, undefined);
  assert.strictEqual(tx.creatorMSP, undefined);
  assert.strictEqual(tx.endorsers, undefined);
  // giữ nguyên tiếng Việt có dấu trong params
  assert.ok(tx.params.join('').length > 0);
});
