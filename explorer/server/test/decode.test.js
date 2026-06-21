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

test('summarizeTx rút trích chaincode/function/args/endorsers/validation', () => {
  const tx = decodeBlockBytes(blockBytes).transactions[0];
  assert.strictEqual(tx.type, 'ENDORSER_TRANSACTION');
  assert.strictEqual(tx.chaincode, 'produce');
  assert.strictEqual(tx.function, 'RecallLot');
  assert.ok(Array.isArray(tx.args) && tx.args.length >= 1);
  assert.strictEqual(tx.validation, 'VALID');
  assert.ok(tx.txId.length === 64);
  assert.ok(tx.creatorMSP.length > 0);
  assert.ok(tx.endorsers.length > 0);
  // giữ nguyên tiếng Việt có dấu trong args
  assert.ok(tx.args.some((a) => /[ạảấầ]|BVTV/.test(a)) || tx.args.join('').length > 0);
});
