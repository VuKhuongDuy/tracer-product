#!/usr/bin/env bash
# Lightweight CLI "explorer" for the network. Hyperledger Explorer does not
# support Fabric 3.x (it still queries the removed lscc system chaincode), so we
# inspect the ledger directly with the peer CLI + configtxlator.
#
# Usage: bash scripts/inspect.sh [blockNumber]   # default: latest block
set -euo pipefail

TN=/Users/alex/Project/hyperledger-fabric/fabric-samples/test-network
cd "$TN"
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=$PWD/../config/
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID=Org1MSP
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051
ORDERER_CA=${PWD}/organizations/ordererOrganizations/example.com/tlsca/tlsca.example.com-cert.pem

echo "================ ĐỒNG THUẬN (BFT / SmartBFT) ================"
docker ps --format "{{.Names}}\t{{.Status}}" | grep -E "orderer[0-9]?\.example" | sort

echo ""
echo "================ THÔNG TIN CHUỖI ================"
INFO=$(peer channel getinfo -c mychannel 2>/dev/null | sed 's/^Blockchain info: //')
echo "$INFO" | jq .
HEIGHT=$(echo "$INFO" | jq -r .height)
LATEST=$((HEIGHT - 1))
BLOCK=${1:-$LATEST}

echo ""
echo "================ BLOCK #$BLOCK ================"
peer channel fetch "$BLOCK" /tmp/_blk.block -c mychannel \
  -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile "$ORDERER_CA" >/dev/null 2>&1
# configtxlator can't write to /dev/stdout on macOS, so decode to a file first.
configtxlator proto_decode --input /tmp/_blk.block --type common.Block --output /tmp/_blk.json
jq '{
  block: .header.number,
  num_tx: (.data.data | length),
  transactions: [ .data.data[].payload.header.channel_header | {tx_id, type, timestamp} ]
}' /tmp/_blk.json

echo ""
echo "================ STATE: CÁC LÔ NÔNG SẢN ================"
peer chaincode query -C mychannel -n produce -c '{"Args":["GetAllLots"]}' 2>/dev/null \
  | jq -r '.[] | "\(.id)  \(.currentStage)  owner=\(.currentOwner)  recalled=\(.recalled)  certs=\(.certifications)"'
