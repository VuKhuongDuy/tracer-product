# M2 — Đăng ký user có attribute (Fabric CA) + ABAC trong chaincode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đăng ký các user có attribute (`role`, `farmerId`) qua Fabric CA và thêm kiểm soát ABAC vào chaincode để chaincode cưỡng chế quyền theo *vai trò người dùng*, không chỉ theo Org.

**Architecture:** Dùng `fabric-ca-client` đăng ký + enroll 5 user vào wallet (`app/server/wallet/`). Chaincode đọc attribute từ certificate người gọi qua `ctx.GetClientIdentity().GetAttributeValue(...)` (không thêm dependency) và áp quy tắc: chỉ `role=farmer` tạo lô và chỉ sửa lô của chính mình; chỉ `role=regulator` cấp chứng nhận/thu hồi. Kiểm chứng bằng các user đó với `peer` CLI.

**Tech Stack:** Fabric CA client 1.5.21, Go (contractapi v2), `peer` CLI, Hyperledger Fabric 3.1.5 test-network (BFT), bash, openssl.

## Global Constraints

- Network đang chạy: 3 org, channel `mychannel`, BFT. Peer: Org1 `localhost:7051`, Org2 `localhost:9051`, Org3 `localhost:11051`. CA: ca-org1 `localhost:7054`, ca-org2 `localhost:8054`, ca-org3 `localhost:11054`. Bootstrap CA admin: `admin:adminpw`.
- Chaincode hiện tại: Version 2.0, Sequence 2 (đã có 2 private collection từ M1). M2 nâng lên **Version 3.0, Sequence 3** (giá trị dùng verbatim).
- ABAC đọc attribute KHÔNG thêm import ngoài: dùng `ctx.GetClientIdentity().GetAttributeValue(name) (string, bool, error)` có sẵn trong contractapi. Build phải qua `go build -mod=vendor ./...`.
- Attribute phải đăng ký với hậu tố `:ecert` để xuất hiện trong enrollment certificate.
- Danh sách user & attribute (dùng verbatim):
  - Org1 (ca-org1): `farmerA` (role=farmer, farmerId=FARMER-A), `farmerB` (role=farmer, farmerId=FARMER-B), `htxStaff` (role=htx)
  - Org2 (ca-org2): `retailer` (role=retailer)
  - Org3 (ca-org3): `regulator` (role=regulator)
- Wallet (MSP enroll) lưu tại: `/Users/alex/Project/hyperledger-fabric/app/server/wallet/<user>/msp`. Mỗi user msp phải có `config.yaml` (copy từ `organizations/peerOrganizations/orgN.example.com/msp/config.yaml`) để NodeOUs hợp lệ.
- Shell in dòng stderr vô hại `/Users/alex/.zshenv:...cargo/env` — bỏ qua.
- Repo KHÔNG phải git → bỏ mọi bước commit.
- TLS cert CA: `organizations/fabric-ca/org1/ca-cert.pem`, `.../org2/ca-cert.pem`; org3 tìm bằng `find organizations -path '*org3*' -name ca-cert.pem`.

---

### Task 1: Script đăng ký + enroll user có attribute → wallet

**Files:**
- Create: `scripts/register-users.sh`

**Interfaces:**
- Produces: thư mục `app/server/wallet/<user>/msp` cho 5 user (`farmerA, farmerB, htxStaff, retailer, regulator`), mỗi cái có `signcerts/cert.pem`, `keystore/`, `config.yaml`. Các script sau trỏ `CORE_PEER_MSPCONFIGPATH` vào đây.

- [ ] **Step 1: Viết scripts/register-users.sh**

```bash
#!/usr/bin/env bash
# Đăng ký + enroll user có attribute (ABAC) vào wallet cho backend & script test.
set -euo pipefail
TN=/Users/alex/Project/hyperledger-fabric/fabric-samples/test-network
WALLET=/Users/alex/Project/hyperledger-fabric/app/server/wallet
cd "$TN"
export PATH=${PWD}/../bin:$PATH
mkdir -p "$WALLET"

ORG3_CA=$(find "${PWD}/organizations" -path '*org3*' -name ca-cert.pem | head -1)

# enrollUser <caname> <port> <caTlsCert> <orgMspConfig> <user> <secret> <attrs>
enrollUser() {
  local caname=$1 port=$2 catls=$3 orgcfg=$4 user=$5 secret=$6 attrs=$7
  export FABRIC_CA_CLIENT_HOME=${PWD}/organizations/peerOrganizations/${orgcfg}/
  fabric-ca-client register --caname "$caname" --id.name "$user" --id.secret "$secret" \
    --id.type client --id.attrs "$attrs" --tls.certfiles "$catls" 2>/dev/null || true   # đã tồn tại thì bỏ qua
  fabric-ca-client enroll -u "https://${user}:${secret}@localhost:${port}" --caname "$caname" \
    -M "${WALLET}/${user}/msp" --tls.certfiles "$catls"
  cp "${PWD}/organizations/peerOrganizations/${orgcfg}/msp/config.yaml" "${WALLET}/${user}/msp/config.yaml"
  echo "enrolled: $user"
}

O1=${PWD}/organizations/fabric-ca/org1/ca-cert.pem
O2=${PWD}/organizations/fabric-ca/org2/ca-cert.pem

enrollUser ca-org1 7054  "$O1" org1.example.com farmerA  farmerApw  'role=farmer:ecert,farmerId=FARMER-A:ecert'
enrollUser ca-org1 7054  "$O1" org1.example.com farmerB  farmerBpw  'role=farmer:ecert,farmerId=FARMER-B:ecert'
enrollUser ca-org1 7054  "$O1" org1.example.com htxStaff htxStaffpw 'role=htx:ecert'
enrollUser ca-org2 8054  "$O2" org2.example.com retailer retailerpw 'role=retailer:ecert'
enrollUser ca-org3 11054 "$ORG3_CA" org3.example.com regulator regulatorpw 'role=regulator:ecert'

echo "== wallet =="
ls -1 "$WALLET"
```

- [ ] **Step 2: Chạy script**

Run: `bash /Users/alex/Project/hyperledger-fabric/scripts/register-users.sh`
Expected: 5 dòng `enrolled: <user>`, rồi liệt kê 5 thư mục user.

- [ ] **Step 3: Xác minh enroll cert tồn tại + có attribute**

Run:
```bash
W=/Users/alex/Project/hyperledger-fabric/app/server/wallet
for u in farmerA farmerB htxStaff retailer regulator; do
  test -f "$W/$u/msp/signcerts/cert.pem" && echo "$u: cert OK" || echo "$u: MISSING";
done
openssl x509 -in "$W/farmerA/msp/signcerts/cert.pem" -text -noout | grep -o 'role.farmer' | head -1
```
Expected: 5 dòng `cert OK`, và dòng cuối in `role":"farmer` hoặc tương đương (chứng tỏ attribute nằm trong cert). Nếu openssl không in JSON rõ, chấp nhận — Task 5 sẽ chứng minh attribute hoạt động bằng hành vi.

---

### Task 2: Thêm ABAC vào chaincode

**Files:**
- Modify: `chaincode/produce-traceability/chaincode/smartcontract.go`

**Interfaces:**
- Consumes: `ctx.GetClientIdentity().GetAttributeValue` (contractapi).
- Produces: helper `clientRole`, `clientFarmerID`, `requireRole`; enforcement trong `CreateLot`, `TransferCustody`, `AddCertification`, `RecallLot`.

- [ ] **Step 1: Thêm helper ABAC (cuối file, cạnh `putLot`)**

```go
// clientRole đọc attribute "role" trong certificate người gọi.
func (s *SmartContract) clientRole(ctx contractapi.TransactionContextInterface) (string, error) {
	role, found, err := ctx.GetClientIdentity().GetAttributeValue("role")
	if err != nil {
		return "", fmt.Errorf("failed to read role attribute: %w", err)
	}
	if !found {
		return "", fmt.Errorf("access denied: identity has no 'role' attribute")
	}
	return role, nil
}

// clientFarmerID đọc attribute "farmerId" trong certificate người gọi.
func (s *SmartContract) clientFarmerID(ctx contractapi.TransactionContextInterface) (string, error) {
	id, found, err := ctx.GetClientIdentity().GetAttributeValue("farmerId")
	if err != nil {
		return "", fmt.Errorf("failed to read farmerId attribute: %w", err)
	}
	if !found {
		return "", fmt.Errorf("access denied: identity has no 'farmerId' attribute")
	}
	return id, nil
}

// requireRole trả lỗi nếu role người gọi khác giá trị yêu cầu.
func (s *SmartContract) requireRole(ctx contractapi.TransactionContextInterface, want string) error {
	role, err := s.clientRole(ctx)
	if err != nil {
		return err
	}
	if role != want {
		return fmt.Errorf("access denied: requires role=%s, caller role=%s", want, role)
	}
	return nil
}
```

- [ ] **Step 2: Enforcement trong CreateLot** — thêm ngay sau dòng mở hàm `func (s *SmartContract) CreateLot(...) error {`, TRƯỚC khối `exists, err := s.LotExists(...)`:

```go
	if err := s.requireRole(ctx, "farmer"); err != nil {
		return err
	}
	certFarmer, err := s.clientFarmerID(ctx)
	if err != nil {
		return err
	}
	if farmerID != certFarmer {
		return fmt.Errorf("access denied: farmerID %q không khớp danh tính %q", farmerID, certFarmer)
	}
```

- [ ] **Step 3: Enforcement trong TransferCustody** — thêm ngay sau khi load lô và check recalled (sau khối `if lot.Recalled { ... }`), TRƯỚC `ts, err := s.txTimestamp(ctx)`:

```go
	role, err := s.clientRole(ctx)
	if err != nil {
		return err
	}
	if role == "farmer" {
		certFarmer, err := s.clientFarmerID(ctx)
		if err != nil {
			return err
		}
		if lot.FarmerID != certFarmer {
			return fmt.Errorf("access denied: nông dân %q không thể chuyển lô của %q", certFarmer, lot.FarmerID)
		}
	}
```

- [ ] **Step 4: Enforcement trong AddCertification và RecallLot** — thêm dòng đầu mỗi hàm (sau dấu `{` mở hàm):

Trong `AddCertification`:
```go
	if err := s.requireRole(ctx, "regulator"); err != nil {
		return err
	}
```
Trong `RecallLot`:
```go
	if err := s.requireRole(ctx, "regulator"); err != nil {
		return err
	}
```

- [ ] **Step 5: Build**

Run: `cd /Users/alex/Project/hyperledger-fabric/chaincode/produce-traceability && go build -mod=vendor ./...`
Expected: không lỗi. (Chú ý: nếu `err` đã khai báo trước trong hàm, dùng `=` thay vì `:=` để tránh "declared and not used"/"no new variables" — sửa cho biên dịch sạch.)

---

### Task 3: Deploy chaincode v3.0 seq3 lên 3 org

**Files:** (không tạo file; chạy lệnh)

**Interfaces:**
- Consumes: chaincode ABAC đã build (Task 2), `collections_config.json` (M1).
- Produces: `produce` Version 3.0, Sequence 3, cả 3 org approve, vẫn kèm collections.

- [ ] **Step 1: Deploy Org1+Org2**

Run:
```bash
cd /Users/alex/Project/hyperledger-fabric/fabric-samples/test-network
./network.sh deployCC -ccn produce \
  -ccp /Users/alex/Project/hyperledger-fabric/chaincode/produce-traceability -ccl go \
  -c mychannel -ccv 3.0 -ccs 3 \
  -cccg /Users/alex/Project/hyperledger-fabric/chaincode/produce-traceability/collections_config.json
```
Expected: `... Version: 3.0, Sequence: 3 ... Approvals: [Org1MSP: true, Org2MSP: true, Org3MSP: false]`

- [ ] **Step 2: Install + approve Org3**

Run: `bash /Users/alex/Project/hyperledger-fabric/scripts/install-org3.sh 3.0 3`
Expected: dòng cuối `Approvals: [Org1MSP: true, Org2MSP: true, Org3MSP: true]`

---

### Task 4: Cập nhật demo.sh & verify-confidentiality.sh dùng danh tính ABAC

**Files:**
- Modify: `scripts/verify-confidentiality.sh`
- Modify: `scripts/demo.sh`

**Interfaces:**
- Consumes: wallet user (Task 1), chaincode ABAC (Task 3).
- Produces: 2 script chạy lại được dưới ABAC (CreateLot bằng farmer, cấp chứng nhận/thu hồi bằng regulator, chuyển giao bằng htxStaff).

- [ ] **Step 1: Trong verify-confidentiality.sh — đổi danh tính tạo lô sang farmerA**

Tìm khối tạo lô (sau `useOrg 1` đầu tiên, trước `peer chaincode invoke ... CreateLot`). Thêm 2 dòng để dùng MSP của farmerA thay admin (giữ nguyên MSPID Org1MSP, peer Org1):
```bash
export CORE_PEER_MSPCONFIGPATH=/Users/alex/Project/hyperledger-fabric/app/server/wallet/farmerA/msp
```
(đặt ngay sau `useOrg 1` và trước lệnh CreateLot). Và sửa đối số farmerID trong lệnh CreateLot từ `FARMER-A` cho khớp attribute (Args thứ 4 = `"FARMER-A"`). Các bước đọc (`useOrg 2/3` + ReadPrice/ReadFarmerPII) GIỮ NGUYÊN dùng admin — đọc không bị ABAC, chỉ bị collection chặn.

- [ ] **Step 2: Chạy lại verify-confidentiality.sh, xác nhận vẫn PASS=6**

Run: `bash /Users/alex/Project/hyperledger-fabric/scripts/verify-confidentiality.sh`
Expected: `PASS=6 FAIL=0`.

- [ ] **Step 3: Trong demo.sh — thêm hàm đổi danh tính và áp cho từng bước**

Sau khối export env (sau dòng `export FABRIC_LOGGING_SPEC=error`), thêm:
```bash
WALLET=/Users/alex/Project/hyperledger-fabric/app/server/wallet
asUser() { # $1 = org số (1|2|3), $2 = tên user trong wallet
  export CORE_PEER_LOCALMSPID=Org${1}MSP
  case $1 in 1) PORT=7051;; 2) PORT=9051;; 3) PORT=11051;; esac
  export CORE_PEER_ADDRESS=localhost:$PORT
  export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org${1}.example.com/peers/peer0.org${1}.example.com/tls/ca.crt
  export CORE_PEER_MSPCONFIGPATH=${WALLET}/$2/msp
}
```
Sửa farmerID trong CreateLot (cả lô chính và lô bị thu hồi) thành `FARMER-A` / `FARMER-B` cho khớp; đặt `asUser 1 farmerA` trước CreateLot lô chính, `asUser 1 farmerB` trước CreateLot lô thu hồi, `asUser 3 regulator` trước AddCertification và RecallLot, `asUser 1 htxStaff` trước các TransferCustody. (Endorse vẫn trên peer Org1+Org2 như cũ.)

- [ ] **Step 4: Chạy lại demo.sh, xác nhận EXIT=0 và in đủ hành trình**

Run: `bash /Users/alex/Project/hyperledger-fabric/scripts/demo.sh; echo EXIT=$?`
Expected: in đủ 6 bước + bảng hành trình, `EXIT=0`.

---

### Task 5: Test kiểm chứng ABAC (acceptance)

**Files:**
- Create: `scripts/verify-abac.sh`

**Interfaces:**
- Consumes: wallet user (Task 1), chaincode ABAC (Task 3).
- Produces: script in PASS/FAIL từng tiêu chí; exit 0 nếu tất cả PASS.

- [ ] **Step 1: Viết scripts/verify-abac.sh**

```bash
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
```

- [ ] **Step 2: Chạy, xác nhận tất cả PASS**

Run: `bash /Users/alex/Project/hyperledger-fabric/scripts/verify-abac.sh`
Expected: 7 dòng PASS, `PASS=7 FAIL=0`, exit 0. Gồm `retailer tạo lô (bị từ chối)`, `farmerB chuyển lô của farmerA (bị từ chối)`, `retailer cấp chứng nhận (bị từ chối)`.

---

## Self-Review

**Spec coverage (mục liên quan M2 của spec):**
- §1 ánh xạ user→org + attribute → Task 1 (đúng danh sách). ✓
- §2.3 ABAC: CreateLot cần farmer, farmer chỉ sửa lô của mình, AddCertification/RecallLot cần regulator → Task 2. ✓
- §3 register-users.sh + wallet → Task 1. ✓
- §8 acceptance #3 (farmer A chỉ thao tác lô của A; farmer khác bị từ chối) → Task 5. ✓
- Backward-compat demo.sh/verify M1 dưới ABAC → Task 4. ✓

**Placeholder scan:** không có TBD/TODO; mọi step có lệnh/đoạn code cụ thể. ✓

**Type consistency:** `clientRole`/`clientFarmerID`/`requireRole`, attribute `role`/`farmerId`, user `farmerA/farmerB/htxStaff/retailer/regulator`, version 3.0 seq 3, đường dẫn wallet — nhất quán giữa các task. ✓

**Lưu ý rủi ro:** (1) `:=` vs `=` cho biến `err`/`role` trong các hàm đã có `err` — Task 2 Step 5 nhắc sửa để build sạch. (2) Lần invoke đầu sau deploy seq3 có thể chậm do container khởi động — script test có `sleep`; nếu lỗi timeout lần đầu, chạy lại. (3) org3 CA cert path dò bằng `find`.

## Execution Handoff

Thực thi bằng subagent-driven-development (mỗi task: implementer → review). Xem cuối hội thoại để chọn.
