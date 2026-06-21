'use strict';
// Giải mã bytes protobuf của Fabric 3.x thành JSON gọn cho explorer.
// - Block: dùng fabric-common BlockDecoder (cách A trong spec).
// - BlockchainInfo: dùng fabric-protos.
// Các hàm summarize* là hàm thuần (nhận object đã decode) để unit test bằng fixture.
const { BlockDecoder } = require('fabric-common');
const fabprotos = require('fabric-protos');

// Long-like {low, high} -> Number (đủ cho số block thực tế).
function longToNum(n) {
  if (n == null) return 0;
  if (typeof n === 'number') return n;
  if (typeof n === 'string') return Number(n);
  return (n.high || 0) * 0x100000000 + (n.low >>> 0);
}

function toHex(buf) {
  if (!buf) return '';
  if (buf.type === 'Buffer' && Array.isArray(buf.data)) return Buffer.from(buf.data).toString('hex');
  return Buffer.from(buf).toString('hex');
}

function argsToStrings(args) {
  return (args || []).map((a) => {
    if (a == null) return '';
    if (a.type === 'Buffer' && Array.isArray(a.data)) return Buffer.from(a.data).toString();
    return Buffer.from(a).toString();
  });
}

function validationLabel(code) {
  return code === 0 ? 'VALID' : `INVALID(${code})`;
}

// summarizeTx: 1 envelope (đã decode) -> object giao dịch gọn.
function summarizeTx(envelope, validationCode) {
  const ch = envelope.payload.header.channel_header;
  const sig = envelope.payload.header.signature_header;
  const tx = {
    txId: ch.tx_id || '',
    type: ch.typeString || String(ch.type),
    timestamp: ch.timestamp || '',
    creatorMSP: (sig && sig.creator && sig.creator.mspid) || '',
    chaincode: '',
    function: '',
    args: [],
    endorsers: [],
    validation: validationLabel(validationCode),
  };

  // Chỉ ENDORSER_TRANSACTION (type 3) mới có chaincode/args/endorsers.
  const actions = envelope.payload.data && envelope.payload.data.actions;
  if (Array.isArray(actions) && actions.length) {
    const action = actions[0];
    const spec = action.payload.chaincode_proposal_payload.input.chaincode_spec;
    const ext = action.payload.action.proposal_response_payload.extension;
    tx.chaincode = (spec.chaincode_id && spec.chaincode_id.name) ||
      (ext && ext.chaincode_id && ext.chaincode_id.name) || '';
    const args = argsToStrings(spec.input && spec.input.args);
    tx.function = args[0] || '';
    tx.args = args.slice(1);
    tx.endorsers = (action.payload.action.endorsements || []).map((e) => e.endorser && e.endorser.mspid).filter(Boolean);
  }
  return tx;
}

// summarizeBlock: block (đã decode) -> {number, hashes, txCount, timestamp, transactions[]}.
function summarizeBlock(block) {
  const envelopes = (block.data && block.data.data) || [];
  const validations = (block.metadata && block.metadata.metadata && block.metadata.metadata[2]) || [];
  const transactions = envelopes.map((env, i) => summarizeTx(env, validations[i]));
  return {
    number: longToNum(block.header.number),
    dataHash: toHex(block.header.data_hash),
    previousHash: toHex(block.header.previous_hash),
    txCount: envelopes.length,
    timestamp: transactions.length ? transactions[0].timestamp : '',
    transactions,
  };
}

// --- Wrappers nhận bytes thô ---
function decodeBlockBytes(bytes) {
  return summarizeBlock(BlockDecoder.decode(Buffer.from(bytes)));
}

function decodeChainInfo(bytes) {
  const info = fabprotos.common.BlockchainInfo.decode(Buffer.from(bytes));
  return {
    height: longToNum({ low: info.height.low, high: info.height.high }),
    currentBlockHash: Buffer.from(info.currentBlockHash || []).toString('hex'),
    previousBlockHash: Buffer.from(info.previousBlockHash || []).toString('hex'),
  };
}

module.exports = { longToNum, toHex, argsToStrings, summarizeTx, summarizeBlock, decodeBlockBytes, decodeChainInfo };
