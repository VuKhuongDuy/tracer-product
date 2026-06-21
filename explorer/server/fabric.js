'use strict';
// Kết nối Fabric 3.x qua fabric-gateway, chỉ để truy vấn system chaincode `qscc`
// (đọc block/tx). Dùng identity read-only htxStaff trong ví của app truy xuất.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const grpc = require('@grpc/grpc-js');
const { connect, signers } = require('@hyperledger/fabric-gateway');

const TN = '/Users/alex/Project/hyperledger-fabric/fabric-samples/test-network';
const WALLET = '/Users/alex/Project/hyperledger-fabric/app/server/wallet';
const CHANNEL = process.env.CHANNEL || 'mychannel';

// Danh tính chỉ đọc dùng để truy vấn qscc.
const USER = 'htxStaff';
const ORG = { key: 'org1', mspId: 'Org1MSP', endpoint: 'localhost:7051', host: 'peer0.org1.example.com' };

function tlsCert() {
  return path.join(TN, `organizations/peerOrganizations/${ORG.key}.example.com/peers/peer0.${ORG.key}.example.com/tls/ca.crt`);
}

function newGrpcClient() {
  const root = fs.readFileSync(tlsCert());
  const creds = grpc.credentials.createSsl(root);
  return new grpc.Client(ORG.endpoint, creds, { 'grpc.ssl_target_name_override': ORG.host });
}

function loadIdentity() {
  const credentials = fs.readFileSync(path.join(WALLET, USER, 'msp', 'signcerts', 'cert.pem'));
  return { mspId: ORG.mspId, credentials };
}

function loadSigner() {
  const keyDir = path.join(WALLET, USER, 'msp', 'keystore');
  const certPath = path.join(WALLET, USER, 'msp', 'signcerts', 'cert.pem');
  const certPub = crypto.createPublicKey(fs.readFileSync(certPath))
    .export({ type: 'spki', format: 'der' }).toString('hex');
  for (const kf of fs.readdirSync(keyDir).filter((f) => f.endsWith('_sk'))) {
    const pk = crypto.createPrivateKey(fs.readFileSync(path.join(keyDir, kf)));
    const pub = crypto.createPublicKey(pk).export({ type: 'spki', format: 'der' }).toString('hex');
    if (pub === certPub) return signers.newPrivateKeySigner(pk);
  }
  throw new Error(`Không tìm thấy khóa riêng khớp cho ${USER}`);
}

// withQscc mở gateway, lấy contract hệ thống qscc, chạy fn rồi đóng kết nối.
async function withQscc(fn) {
  const client = newGrpcClient();
  const gateway = connect({
    client,
    identity: loadIdentity(),
    signer: loadSigner(),
    evaluateOptions: () => ({ deadline: Date.now() + 15000 }),
  });
  try {
    const qscc = gateway.getNetwork(CHANNEL).getContract('qscc');
    return await fn(qscc);
  } finally {
    gateway.close();
    client.close();
  }
}

// Các truy vấn qscc trả về bytes protobuf thô (decode ở decode.js).
const getChainInfoBytes = () => withQscc((q) => q.evaluateTransaction('GetChainInfo', CHANNEL));
const getBlockByNumberBytes = (n) => withQscc((q) => q.evaluateTransaction('GetBlockByNumber', CHANNEL, String(n)));
const getBlockByTxIDBytes = (txid) => withQscc((q) => q.evaluateTransaction('GetBlockByTxID', CHANNEL, txid));

module.exports = { CHANNEL, ORG, getChainInfoBytes, getBlockByNumberBytes, getBlockByTxIDBytes };
