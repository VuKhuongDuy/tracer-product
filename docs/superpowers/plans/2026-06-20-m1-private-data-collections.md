# M1 — Private Data Collections (cưỡng chế bảo mật giữa Org) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mở rộng chaincode `produce` để lưu giá (`tradePrice`) và PII nông dân (`farmerPII`) vào 2 private data collection, sao cho Fabric *thật sự* chặn org không phải thành viên đọc dữ liệu mật.

**Architecture:** Giữ nguyên dữ liệu công khai trên world state. Thêm `collections_config.json` định nghĩa 2 collection với policy thành viên. Chaincode đọc dữ liệu mật từ **transient map** khi invoke và ghi bằng `PutPrivateData`; đọc bằng `GetPrivateData`. Kiểm chứng bằng cách dùng admin của Org1/Org2/Org3 query và xác nhận org ngoài thành viên bị Fabric từ chối. (ABAC ở tầng user để plan sau.)

**Tech Stack:** Go (fabric-contract-api-go/v2), Hyperledger Fabric 3.1.5 test-network (BFT), `peer` CLI, `jq`, bash.

## Global Constraints

- Fabric **v3.1.5**, chaincode build bằng vendored deps đã có trong `chaincode/produce-traceability/vendor/` (không thêm import ngoài stdlib + `contractapi`).
- Network đang chạy: 3 org, channel `mychannel`, BFT 4 orderer. Org1 peer `localhost:7051`, Org2 `localhost:9051`, Org3 `localhost:11051`.
- Collection `tradePrice` = OR('Org1MSP.member','Org2MSP.member'); `farmerPII` = OR('Org1MSP.member','Org3MSP.member'); cả hai `memberOnlyRead=true`, `memberOnlyWrite=true`.
- Mọi dữ liệu mật truyền qua **transient**, KHÔNG đưa vào `Args` công khai.
- Chaincode phải build được bằng `go build -mod=vendor ./...` trước khi deploy.
- Repo chưa phải git repo → bước "commit" trong plan chỉ thực hiện nếu đã `git init`; nếu không, bỏ qua lệnh commit.

---

### Task 1: Định nghĩa private data collections

**Files:**
- Create: `chaincode/produce-traceability/collections_config.json`

**Interfaces:**
- Produces: file cấu hình collection dùng cho `network.sh deployCC --collections-config`. Tên collection: `tradePrice`, `farmerPII`.

- [ ] **Step 1: Tạo file collections_config.json**

```json
[
  {
    "name": "tradePrice",
    "policy": "OR('Org1MSP.member','Org2MSP.member')",
    "requiredPeerCount": 0,
    "maxPeerCount": 1,
    "blockToLive": 0,
    "memberOnlyRead": true,
    "memberOnlyWrite": true
  },
  {
    "name": "farmerPII",
    "policy": "OR('Org1MSP.member','Org3MSP.member')",
    "requiredPeerCount": 0,
    "maxPeerCount": 1,
    "blockToLive": 0,
    "memberOnlyRead": true,
    "memberOnlyWrite": true
  }
]
```

- [ ] **Step 2: Kiểm tra JSON hợp lệ**

Run: `jq . chaincode/produce-traceability/collections_config.json`
Expected: in ra JSON đã format, không lỗi parse.

---

### Task 2: Thêm hằng số collection + struct dữ liệu mật vào chaincode

**Files:**
- Modify: `chaincode/produce-traceability/chaincode/smartcontract.go`

**Interfaces:**
- Produces: kiểu `PriceInfo`, `FarmerPII`; hằng `priceCollection`, `piiCollection` dùng ở các task sau.

- [ ] **Step 1: Thêm hằng và struct (ngay dưới khối `const (... StageRecalled ...)`)**

```go
const (
	priceCollection = "tradePrice"
	piiCollection   = "farmerPII"
)

// PriceInfo là dữ liệu mật chỉ chia sẻ giữa các bên giao dịch (Org1+Org2).
type PriceInfo struct {
	BuyPrice  float64 `json:"buyPrice"`
	SellPrice float64 `json:"sellPrice"`
	Currency  string  `json:"currency"`
	Party     string  `json:"party"`
}

// FarmerPII là dữ liệu cá nhân nông dân, chỉ chia sẻ giữa HTX và cơ quan QL (Org1+Org3).
type FarmerPII struct {
	FullName     string `json:"fullName"`
	IDNumber     string `json:"idNumber"`
	Phone        string `json:"phone"`
	PlotLocation string `json:"plotLocation"`
}
```

- [ ] **Step 2: Build kiểm tra biên dịch**

Run: `cd chaincode/produce-traceability && go build -mod=vendor ./...`
Expected: không lỗi (struct chưa dùng vẫn build được vì là kiểu export).

---

### Task 3: Ghi dữ liệu mật trong CreateLot từ transient

**Files:**
- Modify: `chaincode/produce-traceability/chaincode/smartcontract.go`

**Interfaces:**
- Consumes: `priceCollection`, `piiCollection`, `PriceInfo`, `FarmerPII` (Task 2).
- Produces: `CreateLot` đọc transient keys `pii` và `price` (JSON) và ghi vào collection tương ứng. Transient là tùy chọn — không có thì bỏ qua (giữ `scripts/demo.sh` cũ vẫn chạy).

- [ ] **Step 1: Thêm helper ghi private data (cuối file, cạnh `putLot`)**

```go
// writePrivateFromTransient đọc 1 key trong transient map, nếu có thì ghi vào collection.
func (s *SmartContract) writePrivateFromTransient(ctx contractapi.TransactionContextInterface, key, collection, lotID string) error {
	transient, err := ctx.GetStub().GetTransient()
	if err != nil {
		return fmt.Errorf("failed to read transient: %w", err)
	}
	raw, ok := transient[key]
	if !ok || len(raw) == 0 {
		return nil // không có dữ liệu mật cho key này -> bỏ qua
	}
	return ctx.GetStub().PutPrivateData(collection, lotID, raw)
}
```

- [ ] **Step 2: Gọi helper trong CreateLot, ngay trước `return s.putLot(ctx, &lot)`**

Thay dòng:
```go
	return s.putLot(ctx, &lot)
```
bằng:
```go
	if err := s.putLot(ctx, &lot); err != nil {
		return err
	}
	if err := s.writePrivateFromTransient(ctx, "pii", piiCollection, id); err != nil {
		return err
	}
	return s.writePrivateFromTransient(ctx, "price", priceCollection, id)
```

- [ ] **Step 3: Build**

Run: `cd chaincode/produce-traceability && go build -mod=vendor ./...`
Expected: không lỗi.

---

### Task 4: Ghi giá trong TransferCustody + hàm đọc dữ liệu mật

**Files:**
- Modify: `chaincode/produce-traceability/chaincode/smartcontract.go`

**Interfaces:**
- Consumes: helper `writePrivateFromTransient`, hằng collection, struct (Task 2-3).
- Produces: hàm `ReadPrice(ctx, id) (*PriceInfo, error)` và `ReadFarmerPII(ctx, id) (*FarmerPII, error)` — trả lỗi nếu org gọi không phải thành viên collection (Fabric chặn).

- [ ] **Step 1: Ghi giá trong TransferCustody (ngay trước `return s.putLot(ctx, lot)`)**

Thay dòng cuối của `TransferCustody`:
```go
	return s.putLot(ctx, lot)
```
bằng:
```go
	if err := s.putLot(ctx, lot); err != nil {
		return err
	}
	return s.writePrivateFromTransient(ctx, "price", priceCollection, id)
```

- [ ] **Step 2: Thêm 2 hàm đọc private data (cuối file)**

```go
// ReadPrice trả về giá mật của lô. Chỉ Org1/Org2 đọc được; org khác bị Fabric từ chối.
func (s *SmartContract) ReadPrice(ctx contractapi.TransactionContextInterface, id string) (*PriceInfo, error) {
	data, err := ctx.GetStub().GetPrivateData(priceCollection, id)
	if err != nil {
		return nil, fmt.Errorf("không đọc được tradePrice: %w", err)
	}
	if data == nil {
		return nil, fmt.Errorf("không có dữ liệu giá cho lô %s (hoặc org không có quyền)", id)
	}
	var p PriceInfo
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

// ReadFarmerPII trả về PII nông dân. Chỉ Org1/Org3 đọc được; org khác bị Fabric từ chối.
func (s *SmartContract) ReadFarmerPII(ctx contractapi.TransactionContextInterface, id string) (*FarmerPII, error) {
	data, err := ctx.GetStub().GetPrivateData(piiCollection, id)
	if err != nil {
		return nil, fmt.Errorf("không đọc được farmerPII: %w", err)
	}
	if data == nil {
		return nil, fmt.Errorf("không có dữ liệu PII cho lô %s (hoặc org không có quyền)", id)
	}
	var p FarmerPII
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, err
	}
	return &p, nil
}
```

- [ ] **Step 3: Build**

Run: `cd chaincode/produce-traceability && go build -mod=vendor ./...`
Expected: không lỗi → chaincode sẵn sàng deploy.

---

### Task 5: Deploy chaincode kèm collections lên cả 3 org

**Files:**
- Modify: `scripts/install-org3.sh` (thêm `--collections-config` vào lệnh approve)

**Interfaces:**
- Consumes: `collections_config.json` (Task 1), chaincode đã build (Task 4).
- Produces: chaincode `produce` sequence mới đã commit với collections, cả 3 org approve.

- [ ] **Step 1: Sửa lệnh approve trong scripts/install-org3.sh để kèm collections**

Tìm dòng `peer lifecycle chaincode approveformyorg ... --sequence "$SEQUENCE"` và thêm cờ:
```
  --collections-config /Users/alex/Project/hyperledger-fabric/chaincode/produce-traceability/collections_config.json
```
(đặt trước `--sequence`).

- [ ] **Step 2: Deploy bản mới (sequence 2, version 2.0) cho Org1+Org2**

Run:
```bash
cd /Users/alex/Project/hyperledger-fabric/fabric-samples/test-network
./network.sh deployCC -ccn produce \
  -ccp /Users/alex/Project/hyperledger-fabric/chaincode/produce-traceability -ccl go \
  -c mychannel -ccv 2.0 -ccs 2 \
  -cccg /Users/alex/Project/hyperledger-fabric/chaincode/produce-traceability/collections_config.json
```
Expected: `Committed chaincode definition ... Version: 2.0, Sequence: 2 ... Approvals: [Org1MSP: true, Org2MSP: true, Org3MSP: false]`

- [ ] **Step 3: Install + approve cho Org3**

Run: `bash /Users/alex/Project/hyperledger-fabric/scripts/install-org3.sh 2.0 2`
Expected: dòng cuối `Approvals: [Org1MSP: true, Org2MSP: true, Org3MSP: true]`

---

### Task 6: Test kiểm chứng Fabric cưỡng chế (acceptance)

**Files:**
- Create: `scripts/verify-confidentiality.sh`

**Interfaces:**
- Consumes: chaincode đã deploy với collections (Task 5).
- Produces: script in `PASS`/`FAIL` cho từng tiêu chí; exit 0 nếu tất cả PASS.

- [ ] **Step 1: Viết script kiểm chứng**

```bash
#!/usr/bin/env bash
# Kiểm chứng Fabric thật sự chặn org ngoài thành viên đọc private data.
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

# Tạo lô + private data, endorse bởi Org1 (thành viên cả 2 collection) + Org2
useOrg 1
echo "==> Tạo lô $LOT (kèm pii + price qua transient)"
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
  elif [ "$2" = "DENY" ] && [ "$3" -ne 0 ]; then echo "PASS: $1 (Fabric chặn)"; pass=$((pass+1));
  else echo "FAIL: $1 (expect $2, rc=$3)"; fail=$((fail+1)); fi
}

rdPrice() { peer chaincode query -C mychannel -n produce -c "{\"Args\":[\"ReadPrice\",\"$LOT\"]}" >/dev/null 2>&1; }
rdPII()   { peer chaincode query -C mychannel -n produce -c "{\"Args\":[\"ReadFarmerPII\",\"$LOT\"]}" >/dev/null 2>&1; }

useOrg 1; rdPrice; check "Org1 đọc giá"  OK   $?
useOrg 1; rdPII;   check "Org1 đọc PII"  OK   $?
useOrg 2; rdPrice; check "Org2 đọc giá"  OK   $?
useOrg 2; rdPII;   check "Org2 đọc PII"  DENY $?
useOrg 3; rdPII;   check "Org3 đọc PII"  OK   $?
useOrg 3; rdPrice; check "Org3 đọc giá"  DENY $?

echo "----"; echo "PASS=$pass FAIL=$fail"
[ "$fail" -eq 0 ]
```

- [ ] **Step 2: Chạy script, xác nhận tất cả PASS**

Run: `bash /Users/alex/Project/hyperledger-fabric/scripts/verify-confidentiality.sh`
Expected: 6 dòng `PASS`, cuối cùng `PASS=6 FAIL=0`, exit code 0. Đặc biệt: `Org2 đọc PII (Fabric chặn)` và `Org3 đọc giá (Fabric chặn)`.

- [ ] **Step 3 (tùy chọn): Commit nếu repo đã init git**

```bash
git add chaincode/produce-traceability/collections_config.json \
        chaincode/produce-traceability/chaincode/smartcontract.go \
        scripts/install-org3.sh scripts/verify-confidentiality.sh
git commit -m "feat(m1): private data collections cho gia va PII, cuong che giua org"
```

---

## Self-Review

**Spec coverage (mục liên quan M1 của spec):**
- §2.2 collections (`tradePrice` Org1+Org2, `farmerPII` Org1+Org3) → Task 1. ✓
- §2.2 dữ liệu mật qua transient, hash công khai → Task 3, 4 (PutPrivateData từ transient). ✓
- §2.4 `ReadPrice`, `ReadFarmerPII` → Task 4. ✓
- §2.5 deploy kèm collections, approve 3 org → Task 5. ✓
- §8 acceptance #1 (Org2 không đọc PII), #2 (Org3 không đọc giá) → Task 6. ✓
- ABAC (§2.3) và acceptance #3 (farmer A/B): **không thuộc M1** — cần user có attribute (plan M2/M3). Đã nêu rõ ở đầu plan.

**Placeholder scan:** không có TBD/TODO; mọi step có lệnh/đoạn code cụ thể. ✓

**Type consistency:** `priceCollection`/`piiCollection`, `PriceInfo`/`FarmerPII`, `writePrivateFromTransient`, `ReadPrice`/`ReadFarmerPII` dùng nhất quán giữa Task 2→6. ✓

## Execution Handoff

Sau khi lưu plan, chọn cách thực thi (xem cuối hội thoại).
