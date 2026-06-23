'use strict';
// Giải mã bytes protobuf của Fabric 3.x thành JSON gọn cho explorer.
// - Block: dùng fabric-common BlockDecoder (cách A trong spec).
// - BlockchainInfo: dùng fabric-protos.
// Các hàm summarize* là hàm thuần (nhận object đã decode) để unit test bằng fixture.
const { BlockDecoder } = require('fabric-common');
const fabprotos = require('fabric-protos');
const { X509Certificate } = require('crypto');

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

// Trạng thái giao dịch dạng chung (giấu chi tiết Fabric).
function statusLabel(code) {
  return code === 0 ? 'Success' : 'Failed';
}

// bufFrom: chuẩn hoá Buffer-like ({type:'Buffer',data:[]} hoặc Buffer) -> Buffer.
function bufFrom(b) {
  if (!b) return Buffer.alloc(0);
  if (b.type === 'Buffer' && Array.isArray(b.data)) return Buffer.from(b.data);
  return Buffer.from(b);
}

// senderName: lấy tên thật (CN) từ chứng chỉ của người gửi. Không lộ MSP/Org.
function senderName(creator) {
  try {
    const cert = new X509Certificate(bufFrom(creator && creator.id_bytes));
    const cn = (cert.subject || '').split('\n').find((l) => l.startsWith('CN='));
    return cn ? cn.slice(3).trim() : '';
  } catch {
    return '';
  }
}

// stateChanges: các key được ghi (read-write set) -> [{key, value, isDelete}].
// Bỏ namespace nội bộ `_lifecycle` của Fabric.
function stateChanges(ext) {
  const out = [];
  const nsRwset = (ext && ext.results && ext.results.ns_rwset) || [];
  for (const ns of nsRwset) {
    if (!ns || ns.namespace === '_lifecycle') continue;
    for (const w of (ns.rwset && ns.rwset.writes) || []) {
      out.push({ key: w.key || '', value: bufFrom(w.value).toString(), isDelete: !!w.is_delete });
    }
  }
  return out;
}

// summarizeTx: 1 envelope (đã decode) -> object giao dịch dạng chung (không lộ Fabric).
function summarizeTx(envelope, validationCode) {
  const ch = envelope.payload.header.channel_header;
  const sig = envelope.payload.header.signature_header;
  const tx = {
    txId: ch.tx_id || '',
    timestamp: ch.timestamp || '',
    status: statusLabel(validationCode),
    from: senderName(sig && sig.creator),
    to: '',
    method: '',
    params: [],
    stateChanges: [],
  };

  // Chỉ ENDORSER_TRANSACTION (type 3) mới có contract/method/params.
  const actions = envelope.payload.data && envelope.payload.data.actions;
  if (Array.isArray(actions) && actions.length) {
    const action = actions[0];
    const spec = action.payload.chaincode_proposal_payload.input.chaincode_spec;
    const ext = action.payload.action.proposal_response_payload.extension;
    tx.to = (spec.chaincode_id && spec.chaincode_id.name) ||
      (ext && ext.chaincode_id && ext.chaincode_id.name) || '';
    const args = argsToStrings(spec.input && spec.input.args);
    tx.method = args[0] || '';
    tx.params = args.slice(1);
    tx.stateChanges = stateChanges(ext);
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
