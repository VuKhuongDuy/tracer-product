#!/usr/bin/env bash
# Demo the produce-traceability chaincode: full lifecycle of an agricultural lot
# plus a recall scenario. Each run uses a fresh lot ID (timestamp-based) so the
# script is re-runnable any number of times on the same network.
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
# Silence the verbose grpc INFO logs the Fabric 3.x peer CLI prints by default.
export FABRIC_LOGGING_SPEC=error

WALLET=/Users/alex/Project/hyperledger-fabric/app/server/wallet
asUser() { # $1 = org số (1|2|3), $2 = tên user trong wallet
  export CORE_PEER_LOCALMSPID=Org${1}MSP
  case $1 in 1) PORT=7051;; 2) PORT=9051;; 3) PORT=11051;; esac
  export CORE_PEER_ADDRESS=localhost:$PORT
  export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org${1}.example.com/peers/peer0.org${1}.example.com/tls/ca.crt
  export CORE_PEER_MSPCONFIGPATH=${WALLET}/$2/msp
}

ORDERER_CA=${PWD}/organizations/ordererOrganizations/example.com/tlsca/tlsca.example.com-cert.pem
ORG1_CA=${PWD}/organizations/peerOrganizations/org1.example.com/tlsca/tlsca.org1.example.com-cert.pem
ORG2_CA=${PWD}/organizations/peerOrganizations/org2.example.com/tlsca/tlsca.org2.example.com-cert.pem

# Unique lot IDs per run so re-running never collides with existing state.
STAMP=$(date +%Y%m%d-%H%M%S)
LOT="LOT-SR-${STAMP}"
LOT_BAD="LOT-SR-${STAMP}-B"

invoke() {
  peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile "$ORDERER_CA" \
    -C mychannel -n produce \
    --peerAddresses localhost:7051 --tlsRootCertFiles "$ORG1_CA" \
    --peerAddresses localhost:9051 --tlsRootCertFiles "$ORG2_CA" \
    -c "$1" >/dev/null 2>&1
  sleep 2
}

query() { peer chaincode query -C mychannel -n produce -c "$1" 2>/dev/null; }

echo "Lô demo lần này: $LOT"

echo "==> 1. Nông dân/HTX tạo lô sầu riêng"
asUser 1 farmerA
invoke "{\"function\":\"CreateLot\",\"Args\":[\"$LOT\",\"Sau rieng Ri6\",\"HTX Dak Lak - Krong Pac\",\"FARMER-A\",\"2026-06-10\",\"1500\"]}"

echo "==> 2. Cơ quan quản lý cấp chứng nhận VietGAP"
asUser 3 regulator
invoke "{\"function\":\"AddCertification\",\"Args\":[\"$LOT\",\"VietGAP-2026-DK-0091\",\"BoNN-CucBVTV\"]}"

echo "==> 3. Chuyển cho nhà đóng gói"
asUser 1 htxStaff
invoke "{\"function\":\"TransferCustody\",\"Args\":[\"$LOT\",\"PACKHOUSE-DK-12\",\"PROCESSOR\",\"PROCESSED\",\"Cu Mgar, Dak Lak\",\"Phan loai va dong goi xuat khau\"]}"

echo "==> 4. Chuyển cho nhà phân phối"
asUser 1 htxStaff
invoke "{\"function\":\"TransferCustody\",\"Args\":[\"$LOT\",\"DIST-HCM-03\",\"DISTRIBUTOR\",\"DISTRIBUTED\",\"Kho lanh Thu Duc, TP.HCM\",\"Van chuyen lanh\"]}"

echo "==> 5. Chuyển cho siêu thị bán lẻ"
asUser 1 htxStaff
invoke "{\"function\":\"TransferCustody\",\"Args\":[\"$LOT\",\"RETAIL-WINMART-Q1\",\"RETAILER\",\"RETAIL\",\"WinMart Quan 1, TP.HCM\",\"Len ke ban le\"]}"

echo "==> 6. Lô thứ hai bị thu hồi (kịch bản sự cố ATTP)"
asUser 1 farmerB
invoke "{\"function\":\"CreateLot\",\"Args\":[\"$LOT_BAD\",\"Sau rieng Ri6\",\"HTX Dak Lak - Ea Kar\",\"FARMER-B\",\"2026-06-11\",\"800\"]}"
asUser 3 regulator
invoke "{\"function\":\"RecallLot\",\"Args\":[\"$LOT_BAD\",\"BoNN-CucATTP\",\"Phat hien du luong thuoc BVTV vuot nguong\"]}"

echo ""
# Reset to Org1 admin for queries
export CORE_PEER_LOCALMSPID=Org1MSP
export CORE_PEER_ADDRESS=localhost:7051
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
echo "================ HÀNH TRÌNH LÔ $LOT ================"
query "{\"Args\":[\"GetLotProvenance\",\"$LOT\"]}" | jq -r '.[] | "\(.timestamp)  [\(.actorRole)] \(.stage) -> \(.actor)  (\(.location))"'
echo ""
echo "================ TẤT CẢ CÁC LÔ ================"
query '{"Args":["GetAllLots"]}' | jq -r '.[] | "\(.id)  \(.currentStage)  owner=\(.currentOwner)  recalled=\(.recalled)"'
