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
  # --waitForEvent: chờ ĐÚNG đến khi giao dịch được commit (thay vì chỉ gửi tới
  #   orderer rồi trả về ngay — đó là lý do bản cũ phải "sleep 2" và vẫn dễ lỗi
  #   "lot does not exist" khi bước sau đọc trước lúc bước trước kịp commit).
  # --waitForEventTimeout 30s: nếu orderer BFT bị kẹt, lệnh fail nhanh kèm thông
  #   báo thay vì treo vô hạn. Lỗi được in ra và dừng script (không bị che mã thoát).
  local out
  if ! out=$(peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile "$ORDERER_CA" \
      -C mychannel -n produce \
      --peerAddresses localhost:7051 --tlsRootCertFiles "$ORG1_CA" \
      --peerAddresses localhost:9051 --tlsRootCertFiles "$ORG2_CA" \
      --waitForEvent --waitForEventTimeout 30s \
      -c "$1" 2>&1); then
    echo "❌ Giao dịch thất bại:" >&2
    echo "$out" >&2
    echo "" >&2
    echo "👉 Nguyên nhân thường gặp: cụm orderer BFT bị kẹt (sau khi máy ngủ / Docker tạm dừng)." >&2
    echo "   Khắc phục: bash scripts/restart-orderers.sh   rồi chạy lại demo." >&2
    exit 1
  fi
}

query() { peer chaincode query -C mychannel -n produce -c "$1" 2>/dev/null; }

echo "Lô demo lần này: $LOT"

echo "==> 1. Nông dân/HTX tạo lô sầu riêng"
asUser 1 farmerA
invoke "{\"function\":\"CreateLot\",\"Args\":[\"$LOT\",\"Sầu riêng Ri6\",\"HTX Đắk Lắk - Krông Pắc\",\"FARMER-A\",\"2026-06-10\",\"1500\"]}"

echo "==> 2. Cơ quan quản lý cấp chứng nhận VietGAP"
asUser 3 regulator
invoke "{\"function\":\"AddCertification\",\"Args\":[\"$LOT\",\"VietGAP-2026-DK-0091\",\"Bộ NN - Cục BVTV\"]}"

echo "==> 3. Chuyển cho nhà đóng gói"
asUser 1 htxStaff
invoke "{\"function\":\"TransferCustody\",\"Args\":[\"$LOT\",\"PACKHOUSE-DK-12\",\"PROCESSOR\",\"PROCESSED\",\"Cư M'gar, Đắk Lắk\",\"Phân loại và đóng gói xuất khẩu\"]}"

echo "==> 4. Chuyển cho nhà phân phối"
asUser 1 htxStaff
invoke "{\"function\":\"TransferCustody\",\"Args\":[\"$LOT\",\"DIST-HCM-03\",\"DISTRIBUTOR\",\"DISTRIBUTED\",\"Kho lạnh Thủ Đức, TP.HCM\",\"Vận chuyển lạnh\"]}"

echo "==> 5. Chuyển cho siêu thị bán lẻ"
asUser 1 htxStaff
invoke "{\"function\":\"TransferCustody\",\"Args\":[\"$LOT\",\"RETAIL-WINMART-Q1\",\"RETAILER\",\"RETAIL\",\"WinMart Quận 1, TP.HCM\",\"Lên kệ bán lẻ\"]}"

echo "==> 6. Lô thứ hai bị thu hồi (kịch bản sự cố ATTP)"
asUser 1 farmerB
invoke "{\"function\":\"CreateLot\",\"Args\":[\"$LOT_BAD\",\"Sầu riêng Ri6\",\"HTX Đắk Lắk - Ea Kar\",\"FARMER-B\",\"2026-06-11\",\"800\"]}"
asUser 3 regulator
invoke "{\"function\":\"RecallLot\",\"Args\":[\"$LOT_BAD\",\"Bộ NN - Cục ATTP\",\"Phát hiện dư lượng thuốc BVTV vượt ngưỡng\"]}"

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
