#!/usr/bin/env bash
# Verify that Fabric actually blocks non-member orgs from reading private data.
set -uo pipefail
TN=/Users/alex/Project/hyperledger-fabric/fabric-samples/test-network
cd "$TN"
export PATH=${PWD}/../bin:$PATH FABRIC_CFG_PATH=$PWD/../config/ CORE_PEER_TLS_ENABLED=true
export FABRIC_LOGGING_SPEC=error
ORDERER_CA=${PWD}/organizations/ordererOrganizations/example.com/tlsca/tlsca.example.com-cert.pem
O1=${PWD}/organizations/peerOrganizations/org1.example.com/tlsca/tlsca.org1.example.com-cert.pem
O2=${PWD}/organizations/peerOrganizations/org2.example.com/tlsca/tlsca.org2.example.com-cert.pem
O3=${PWD}/organizations/peerOrganizations/org3.example.com/tlsca/tlsca.org3.example.com-cert.pem

useOrg() { # $1 = 1|2|3
  local n=$1
  export CORE_PEER_LOCALMSPID=Org${n}MSP
  case $n in
    1) P=7051;;
    2) P=9051;;
    3) P=11051;;
  esac
  export CORE_PEER_ADDRESS=localhost:$P
  export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org${n}.example.com/peers/peer0.org${n}.example.com/tls/ca.crt
  export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org${n}.example.com/users/Admin@org${n}.example.com/msp
}

LOT="PDC-$(date +%s)"
PII_B64=$(echo -n '{"fullName":"Nguyen Van A","idNumber":"066...","phone":"0900...","plotLocation":"Krong Pac"}' | base64)
PRICE_B64=$(echo -n '{"buyPrice":45000,"sellPrice":70000,"currency":"VND","party":"HTX-Retailer"}' | base64)

# Create lot + private data, endorsed by Org1 (member of both collections) + Org2
useOrg 1
export CORE_PEER_MSPCONFIGPATH=/Users/alex/Project/hyperledger-fabric/app/server/wallet/farmerA/msp
echo "==> Creating lot $LOT (with pii + price via transient)"
peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile "$ORDERER_CA" \
  -C mychannel -n produce \
  --peerAddresses localhost:7051 --tlsRootCertFiles "$O1" \
  --peerAddresses localhost:9051 --tlsRootCertFiles "$O2" \
  -c "{\"function\":\"CreateLot\",\"Args\":[\"$LOT\",\"Sau rieng\",\"Dak Lak\",\"FARMER-A\",\"2026-06-10\",\"1000\"]}" \
  --transient "{\"pii\":\"$PII_B64\",\"price\":\"$PRICE_B64\"}" >/dev/null 2>&1
sleep 3

pass=0; fail=0
check() { # $1 desc  $2 expect(OK|DENY)  $3 actual_rc
  if [ "$2" = "OK" ] && [ "$3" -eq 0 ]; then echo "PASS: $1"; pass=$((pass+1));
  elif [ "$2" = "DENY" ] && [ "$3" -ne 0 ]; then echo "PASS: $1 (Fabric blocked)"; pass=$((pass+1));
  else echo "FAIL: $1 (expect $2, rc=$3)"; fail=$((fail+1)); fi
}

rdPrice() { peer chaincode query -C mychannel -n produce -c "{\"Args\":[\"ReadPrice\",\"$LOT\"]}" >/dev/null 2>&1; }
rdPII()   { peer chaincode query -C mychannel -n produce -c "{\"Args\":[\"ReadFarmerPII\",\"$LOT\"]}" >/dev/null 2>&1; }

useOrg 1; rdPrice; check "Org1 read price"  OK   $?
useOrg 1; rdPII;   check "Org1 read PII"  OK   $?
useOrg 2; rdPrice; check "Org2 read price"  OK   $?
useOrg 2; rdPII;   check "Org2 read PII"  DENY $?
useOrg 3; rdPII;   check "Org3 read PII"  OK   $?
useOrg 3; rdPrice; check "Org3 read price"  DENY $?

echo "----"; echo "PASS=$pass FAIL=$fail"
[ "$fail" -eq 0 ]
