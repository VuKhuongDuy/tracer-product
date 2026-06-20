#!/usr/bin/env bash
# Install + approve the `produce` chaincode on peer0.org3 so Org3 can also
# endorse. test-network's deployCC only handles Org1 and Org2 (already a
# majority), so this step is run separately after deployCC.
#
# Usage: bash scripts/install-org3.sh <version> <sequence>
#   e.g. bash scripts/install-org3.sh 2.0 2
set -euo pipefail

VERSION="${1:-1.0}"
SEQUENCE="${2:-1}"
LABEL="produce_${VERSION}"

TN=/Users/alex/Project/hyperledger-fabric/fabric-samples/test-network
CC=/Users/alex/Project/hyperledger-fabric/chaincode/produce-traceability
cd "$TN"

export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=$PWD/../config/
export CORE_PEER_TLS_ENABLED=true

# Package with a deterministic label so the package ID matches Org1/Org2.
peer lifecycle chaincode package "${LABEL}.tar.gz" --path "$CC" --lang golang --label "$LABEL"

# Switch to Org3 admin.
export CORE_PEER_LOCALMSPID=Org3MSP
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org3.example.com/peers/peer0.org3.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org3.example.com/users/Admin@org3.example.com/msp
export CORE_PEER_ADDRESS=localhost:11051

peer lifecycle chaincode install "${LABEL}.tar.gz"

PKGID=$(peer lifecycle chaincode queryinstalled | sed -n "s/^Package ID: \(${LABEL}:[a-f0-9]*\),.*/\1/p" | head -1)
echo "Package ID: $PKGID"

peer lifecycle chaincode approveformyorg -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls \
  --cafile ${PWD}/organizations/ordererOrganizations/example.com/tlsca/tlsca.example.com-cert.pem \
  --channelID mychannel --name produce --version "$VERSION" --package-id "$PKGID" \
  --collections-config /Users/alex/Project/hyperledger-fabric/chaincode/produce-traceability/collections_config.json \
  --sequence "$SEQUENCE"

echo "== Approvals =="
peer lifecycle chaincode querycommitted --channelID mychannel --name produce
