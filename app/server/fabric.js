'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const grpc = require('@grpc/grpc-js');
const { connect, signers } = require('@hyperledger/fabric-gateway');

const TN = process.env.TEST_NETWORK || path.resolve(__dirname, '../../fabric-samples/test-network');
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
  const certPath = path.join(WALLET, userId, 'msp', 'signcerts', 'cert.pem');
  const certPub = crypto.createPublicKey(fs.readFileSync(certPath))
    .export({ type: 'spki', format: 'der' }).toString('hex');
  const keyFiles = fs.readdirSync(keyDir).filter(f => f.endsWith('_sk'));
  for (const kf of keyFiles) {
    const pem = fs.readFileSync(path.join(keyDir, kf));
    const pk = crypto.createPrivateKey(pem);
    const pub = crypto.createPublicKey(pk).export({ type: 'spki', format: 'der' }).toString('hex');
    if (pub === certPub) return signers.newPrivateKeySigner(pk);
  }
  throw new Error(`No matching private key found for ${userId}`);
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
