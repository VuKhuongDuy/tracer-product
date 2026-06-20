# Hyperledger Fabric 3.x (BFT) — Demo truy xuất nguồn gốc nông sản

Mạng blockchain permissioned dựng bằng **Hyperledger Fabric 3.1.5** với đồng thuận **BFT (SmartBFT)**. Định hướng ứng dụng: **truy xuất nguồn gốc nông sản**. Theo dõi mạng bằng **CLI** ([scripts/inspect.sh](scripts/inspect.sh)).

> **Vì sao không dùng Hyperledger Explorer?** Explorer (bản mới nhất v2.0.0) **chưa hỗ trợ Fabric 3.x**: khi sync block nó vẫn gọi system chaincode `lscc` đã bị Fabric 3.x gỡ bỏ ([hyperledger/fabric#3983](https://github.com/hyperledger/fabric/issues/3983)) → lỗi `could not launch chaincode lscc.syscc`. Đã thử cả image 1.1.8 và 1.2.0 đều không sync được. Nếu cần giao diện web Explorer, phải hạ xuống Fabric 2.x (Raft).

## Kiến trúc

| Thành phần | Chi tiết |
|---|---|
| Fabric | **v3.1.5**, Fabric CA **v1.5.21** |
| Network | `test-network` — **3 tổ chức**: Org1, Org2, **Org3 (cơ quan quản lý / Bộ NN)** |
| Orderer | **4 orderer, đồng thuận BFT (SmartBFT)** — chịu được 1 node Byzantine (`3f+1`, f=1) |
| CA | 4 Fabric CA (`ca_org1`, `ca_org2`, `ca_org3`, `ca_orderer`) |
| Channel | `mychannel` |
| Chaincode | `produce` — truy xuất nguồn gốc nông sản (Go), endorsement = **đa số (2/3 org)** |
| Theo dõi | CLI ([scripts/inspect.sh](scripts/inspect.sh)) — Explorer chưa hỗ trợ 3.x (xem ghi chú trên) |
| Docker network | `fabric_test` |

```
┌──────────────────────────────────────────────────────────┐
│                    fabric_test (docker)                    │
│                                                            │
│  ca_org1   ca_org2   ca_org3   ca_orderer                  │
│                                                            │
│  peer0.org1     peer0.org2     peer0.org3 (cơ quan QL)     │
│        \            |            /                         │
│         └──── orderer cluster ───┘                         │
│         orderer 1│2│3│4  — BFT (SmartBFT)                  │
│                                                            │
│      channel: mychannel  /  chaincode: produce             │
│      endorsement policy: MAJORITY (2/3 org)                │
└──────────────────────────────────────────────────────────┘
```

### Chaincode truy xuất nguồn gốc (`chaincode/produce-traceability`)

Mô hình hóa vòng đời thật của một lô nông sản. Mỗi lần chuyển giao được ghi thành một **mốc lịch sử bất biến** (`TraceEvent`), nên có thể dựng lại toàn bộ hành trình bất kỳ lúc nào.

| Hàm | Vai trò | Mô tả |
|---|---|---|
| `CreateLot` | Nông dân/HTX | Đăng ký lô mới (mã, sản phẩm, vùng trồng, ngày thu hoạch, khối lượng) |
| `AddCertification` | Cơ quan quản lý | Gắn chứng nhận (VietGAP, kiểm dịch…) |
| `TransferCustody` | Mọi bên | Chuyển sang bên kế tiếp + ghi mốc lịch sử (ai, ở đâu, công đoạn, ghi chú) |
| `RecallLot` | Cơ quan quản lý | Thu hồi lô khi có sự cố ATTP |
| `GetLotProvenance` | — | Trả về **toàn bộ hành trình** của một lô |
| `ReadLot` / `GetAllLots` / `QueryLotsByOwner` | — | Truy vấn trạng thái |

Các bên trong chuỗi (`FARMER → PROCESSOR → DISTRIBUTOR → RETAILER`, cùng `REGULATOR`) được mô hình hóa bằng `actorRole` trong chaincode; Org3 đại diện cơ quan quản lý ở tầng hạ tầng MSP.

## Yêu cầu

- Docker + Docker Compose (Docker Desktop)
- Git, curl, jq
- (Tùy chọn) Go nếu muốn build lại chaincode

## Cài đặt từ đầu

```bash
# 1. Tải Fabric (images + binaries + samples)
curl -sSL https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh -o install-fabric.sh
chmod +x install-fabric.sh
./install-fabric.sh --fabric-version 3.1.5 --ca-version 1.5.21 docker binary samples

# 2. Khởi động network BFT (4 orderer SmartBFT) + tạo channel (kèm Fabric CA)
cd fabric-samples/test-network
./network.sh up createChannel -bft -ca -c mychannel

# 3. Thêm Org3 (cơ quan quản lý) và join channel
cd addOrg3 && ./addOrg3.sh up -c mychannel -ca && cd ..

# 4. Deploy chaincode truy xuất nông sản (install + approve Org1, Org2)
./network.sh deployCC -ccn produce -ccp ../../chaincode/produce-traceability -ccl go -c mychannel

# 5. Install + approve cho Org3 (xem scripts/install-org3.sh để biết chi tiết)
```

> Lệnh `deployCC` của test-network chỉ install/approve cho Org1 & Org2 (đã đủ đa số 2/3 để commit). Để Org3 cũng endorse được, cần install + approve thủ công trên peer0.org3 — các bước này nằm trong [scripts/install-org3.sh](scripts/install-org3.sh).

## Demo vòng đời lô nông sản

Toàn bộ kịch bản (tạo lô → cấp VietGAP → đóng gói → phân phối → bán lẻ, kèm một lô bị thu hồi) gói trong một script:

```bash
bash scripts/demo.sh
```

Kết quả mẫu — truy vết hành trình bất biến của một lô:

```
2026-...T...Z  [FARMER]      HARVESTED   -> FARMER-DK-077       (HTX Dak Lak - Krong Pac)
2026-...T...Z  [REGULATOR]   HARVESTED   -> BoNN-CucBVTV        ()        # cấp VietGAP
2026-...T...Z  [PROCESSOR]   PROCESSED   -> PACKHOUSE-DK-12     (Cu Mgar, Dak Lak)
2026-...T...Z  [DISTRIBUTOR] DISTRIBUTED -> DIST-HCM-03         (Kho lanh Thu Duc)
2026-...T...Z  [RETAILER]    RETAIL      -> RETAIL-WINMART-Q1   (WinMart Quan 1)
```

## Theo dõi mạng (CLI)

Thay cho Hyperledger Explorer (chưa hỗ trợ 3.x), dùng script kiểm tra ledger trực tiếp:

```bash
bash scripts/inspect.sh        # block mới nhất
bash scripts/inspect.sh 7      # xem block số 7
```

Output gồm: trạng thái 4 orderer BFT, chiều cao chuỗi + block hash, nội dung block đã giải mã (tx_id, loại, thời điểm), và state hiện tại của các lô nông sản.

```
================ ĐỒNG THUẬN (BFT / SmartBFT) ================
orderer.example.com    Up
orderer2.example.com   Up
orderer3.example.com   Up
orderer4.example.com   Up
================ THÔNG TIN CHUỖI ================
{ "height": 16, "currentBlockHash": "...", "previousBlockHash": "..." }
================ BLOCK #15 ================
{ "block": "15", "num_tx": 1, "transactions": [ { "tx_id": "b9886c...", "type": 3 } ] }
================ STATE: CÁC LÔ NÔNG SẢN ================
LOT-SR-2026-001  RETAIL    owner=RETAIL-WINMART-Q1  recalled=false  certs=["VietGAP-2026-DK-0091"]
LOT-SR-2026-002  RECALLED  owner=FARMER-DK-099      recalled=true   certs=[]
```

> Thư mục `explorer/` vẫn được giữ lại để dùng khi chạy bản Fabric 2.x (Explorer chạy tốt với 2.x).

## Ứng dụng: UI + API + Fabric cưỡng chế quyền (Cách B)

Tầng ứng dụng minh họa "mỗi bên thấy gì" bằng **cưỡng chế thật của Fabric**, không phải ẩn ở giao diện. Hai tầng phân quyền:

| Tầng | Cơ chế | Minh họa |
|---|---|---|
| Org ↔ Org | **Private data collection** | `tradePrice` (Org1+Org2) · `farmerPII` (Org1+Org3). Siêu thị (Org2) **không đọc được PII**; Bộ (Org3) **không đọc được giá** — peer Fabric từ chối. |
| User trong Org | **ABAC** (attribute trong cert) | Chỉ `role=farmer` tạo lô & chỉ sửa lô của mình; chỉ `role=regulator` cấp chứng nhận/thu hồi. |

**Thành phần:**
- `chaincode/produce-traceability/` — chaincode (v3.0): private data + ABAC, `collections_config.json`.
- `scripts/register-users.sh` — đăng ký user có attribute qua Fabric CA → `app/server/wallet/`.
- `app/server/` — REST API (Express + `@hyperledger/fabric-gateway`): query/submit theo danh tính, field mật trả `{locked:true}` khi Fabric chặn; QR + trang trace công khai.
- `app/web/` — UI React + Vite: chọn role → thấy đúng dữ liệu, badge 🔒 khi bị chặn, QR → trang `/trace/:id` cho người tiêu dùng.

**Chạy ứng dụng:**
```bash
bash scripts/register-users.sh                 # 1 lần: tạo danh tính có attribute
cd app/server && npm install && node server.js  # API :3000
cd app/web && npm install && npm run dev         # UI :5173  (xem app/web/RUN.md)
```

**Kiểm chứng tự động (Fabric thật sự cưỡng chế):**
```bash
bash scripts/verify-confidentiality.sh   # PASS=6  — org-level (private data)
bash scripts/verify-abac.sh              # PASS=7  — user-level (ABAC)
bash app/server/verify-api.sh            # PASS=8  — end-to-end qua HTTP
```

## Dừng / dọn dẹp

```bash
# Dừng network (xóa container, channel, crypto)
cd fabric-samples/test-network && ./network.sh down
```

## Lộ trình

- [x] Chaincode riêng cho truy xuất nông sản (vùng trồng, ngày thu hoạch, chứng nhận, lịch sử chuyển giao).
- [x] Mở rộng mạng lên 3 tổ chức (Org3 = cơ quan quản lý).
- [x] Nâng lên Fabric 3.x + đồng thuận **BFT (SmartBFT)** 4 orderer.
- [x] **Private data collection** cho dữ liệu nhạy cảm (giá mua-bán, PII nông dân).
- [x] **ABAC** phân quyền theo vai trò người dùng (Fabric CA attribute).
- [x] **REST API + frontend React** + QR → trang tra cứu cho người tiêu dùng.
- [ ] Đặt **endorsement policy theo nghiệp vụ** (vd: tạo lô phải có chữ ký Org cơ quan quản lý).
- [ ] zk-STARK: chứng minh điều kiện (vd "đạt chuẩn dư lượng") mà không lộ số liệu gốc.
