#!/usr/bin/env bash
# Kiểm chứng ABAC: chaincode cưỡng chế quyền theo vai trò người dùng.
set -uo pipefail
TN=/Users/alex/Project/hyperledger-fabric/fabric-samples/test-network
W=/Users/alex/Project/hyperledger-fabric/app/server/wallet
cd "$TN"
export PATH=${PWD}/../bin:$PATH FABRIC_CFG_PATH=$PWD/../config/ CORE_PEER_TLS_ENABLED=true FABRIC_LOGGING_SPEC=error
ORDERER_CA=${PWD}/organizations/ordererOrganizations/example.com/tlsca/tlsca.example.com-cert.pem
O1=${PWD}/organizations/peerOrganizations/org1.example.com/tlsca/tlsca.org1.example.com-cert.pem
O2=${PWD}/organizations/peerOrganizations/org2.example.com/tlsca/tlsca.org2.example.com-cert.pem

asUser() { export CORE_PEER_LOCALMSPID=Org${1}MSP; case $1 in 1) P=7051;; 2) P=9051;; 3) P=11051;; esac
  export CORE_PEER_ADDRESS=localhost:$P
  export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org${1}.example.com/peers/peer0.org${1}.example.com/tls/ca.crt
  export CORE_PEER_MSPCONFIGPATH=${W}/$2/msp; }

inv() { peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile "$ORDERER_CA" \
  -C mychannel -n produce --peerAddresses localhost:7051 --tlsRootCertFiles "$O1" --peerAddresses localhost:9051 --tlsRootCertFiles "$O2" \
  -c "$1" >/dev/null 2>&1; }

pass=0; fail=0
check() { if [ "$2" = OK ] && [ "$3" -eq 0 ]; then echo "PASS: $1"; pass=$((pass+1));
  elif [ "$2" = DENY ] && [ "$3" -ne 0 ]; then echo "PASS: $1 (bị từ chối)"; pass=$((pass+1));
  else echo "FAIL: $1 (expect $2 rc=$3)"; fail=$((fail+1)); fi; }

A="ABAC-$(date +%s)"
asUser 1 farmerA; inv "{\"function\":\"CreateLot\",\"Args\":[\"$A\",\"Sau rieng\",\"Dak Lak\",\"FARMER-A\",\"2026-06-10\",\"1000\"]}"; check "farmerA tạo lô của mình" OK $?
sleep 2
asUser 2 retailer; inv "{\"function\":\"CreateLot\",\"Args\":[\"${A}-x\",\"X\",\"Y\",\"FARMER-A\",\"2026-06-10\",\"1\"]}"; check "retailer tạo lô" DENY $?
asUser 1 farmerB; inv "{\"function\":\"CreateLot\",\"Args\":[\"${A}-b\",\"X\",\"Y\",\"FARMER-A\",\"2026-06-10\",\"1\"]}"; check "farmerB tạo lô mạo danh FARMER-A" DENY $?
asUser 1 farmerB; inv "{\"function\":\"TransferCustody\",\"Args\":[\"$A\",\"X\",\"PROCESSOR\",\"PROCESSED\",\"loc\",\"n\"]}"; check "farmerB chuyển lô của farmerA" DENY $?
sleep 2
asUser 1 htxStaff; inv "{\"function\":\"TransferCustody\",\"Args\":[\"$A\",\"PACK-1\",\"PROCESSOR\",\"PROCESSED\",\"loc\",\"n\"]}"; check "htxStaff chuyển lô (non-farmer)" OK $?
sleep 2
asUser 3 regulator; inv "{\"function\":\"AddCertification\",\"Args\":[\"$A\",\"VietGAP-X\",\"BoNN\"]}"; check "regulator cấp chứng nhận" OK $?
asUser 2 retailer; inv "{\"function\":\"AddCertification\",\"Args\":[\"$A\",\"FAKE\",\"X\"]}"; check "retailer cấp chứng nhận" DENY $?

echo "----"; echo "PASS=$pass FAIL=$fail"; [ "$fail" -eq 0 ]
