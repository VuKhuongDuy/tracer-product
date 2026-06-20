# Thiết kế: Frontend UI + Backend cho truy xuất nguồn gốc nông sản (Fabric cưỡng chế quyền)

- **Ngày:** 2026-06-20
- **Nền tảng hiện có:** Hyperledger Fabric 3.1.5, đồng thuận BFT (SmartBFT), 4 orderer, 3 org (Org1, Org2, Org3), channel `mychannel`, chaincode `produce`.
- **Mục tiêu:** UI trực quan cho ứng dụng truy xuất nguồn gốc, trong đó "mỗi bên thấy gì" được **Fabric cưỡng chế thật** (private data collection ở tầng org + ABAC ở tầng user), kèm QR → trang tra cứu hành trình cho người tiêu dùng.

## 1. Mô hình tổ chức & vai trò

| Vai trò (UI) | Org (MSP) | Danh tính backend | Ghi chú |
|---|---|---|---|
| Nông dân A | Org1 | user `farmerA` (attr role=farmer, farmerId=FARMER-A) | đại diện nông dân dưới HTX |
| Nông dân B | Org1 | user `farmerB` (attr role=farmer, farmerId=FARMER-B) | |
| Cán bộ HTX | Org1 | user `htxStaff` (attr role=htx) | thấy mọi lô của Org1 |
| Siêu thị / Bán lẻ | Org2 | user `retailer` (attr role=retailer) | bên mua |
| Cơ quan quản lý (Bộ NN) | Org3 | user `regulator` (attr role=regulator) | cấp chứng nhận, thu hồi |
| Người tiêu dùng | — (public) | không cần danh tính | chỉ đọc dữ liệu công khai qua QR |

**Hai tầng phân quyền:**
- **Org ↔ Org:** private data collection (Fabric mã hóa/giới hạn ở tầng sổ cái).
- **User trong cùng Org:** ABAC — chaincode đọc attribute trong certificate.

## 2. Chaincode `produce-traceability` (làm lại)

### 2.1. Dữ liệu công khai (world state) — ai cũng đọc
```
ProduceLot {
  docType, id, productName, origin, harvestDate,
  certifications[], currentOwner, currentStage, recalled, recallReason,
  history[] (TraceEvent: stage, actor, actorRole, location, note, timestamp)
}
```

### 2.2. Private data collections (`collections_config.json`)
| Collection | memberOrgsPolicy | Nội dung (key = lotId) |
|---|---|---|
| `tradePrice` | OR('Org1MSP.member','Org2MSP.member') | `{ buyPrice, sellPrice, currency, party }` |
| `farmerPII` | OR('Org1MSP.member','Org3MSP.member') | `{ fullName, idNumber, phone, plotLocation }` |

- Dữ liệu mật truyền qua **transient map** khi invoke (không nằm trong args công khai).
- Trên world state công khai chỉ tự sinh **hash** của private data (cơ chế của Fabric) → chứng minh tồn tại & bất biến mà không lộ nội dung.

### 2.3. ABAC (dùng package `github.com/hyperledger/fabric-chaincode-go/v2/pkg/cid`)
- `CreateLot`: yêu cầu `role=farmer`; lấy `farmerId` từ cert, gắn vào lô; ghi `farmerPII` (transient) vào collection; tùy chọn ghi giá ban đầu.
- Nông dân chỉ `TransferCustody`/sửa lô mà `farmerId` của lô == `farmerId` trong cert (trừ `role=htx` thấy toàn bộ Org1).
- `AddCertification`, `RecallLot`: yêu cầu `role=regulator`.
- `TransferCustody`: cho phép chủ hiện tại; nếu kèm giá → ghi `tradePrice` (transient).

### 2.4. Hàm chaincode
| Hàm | Quyền | Mô tả |
|---|---|---|
| `CreateLot` | farmer | tạo lô (public) + PII (transient→farmerPII) + giá đầu (transient→tradePrice) |
| `TransferCustody` | chủ hiện tại | chuyển giao + ghi history; giá kèm (transient) nếu có |
| `AddCertification` | regulator | thêm chứng nhận |
| `RecallLot` | regulator | thu hồi |
| `ReadLotPublic` | mọi danh tính | dữ liệu công khai |
| `ReadPrice` | Org1/Org2 | đọc `tradePrice`; org khác → lỗi/empty |
| `ReadFarmerPII` | Org1/Org3 | đọc `farmerPII`; org khác → lỗi/empty |
| `GetLotProvenance` | mọi danh tính | history công khai |
| `GetAllLots` | mọi danh tính | danh sách lô công khai |

### 2.5. Deploy
- `network.sh deployCC ... --collections-config <path>/collections_config.json`
- Cài + approve cho cả 3 org (Org3 qua `scripts/install-org3.sh`).

## 3. Đăng ký user có attribute — `scripts/register-users.sh`
- Dùng `fabric-ca-client` của từng org (CA đang chạy do mạng `-ca`).
- Ví dụ: `register --id.name farmerA --id.secret pw --id.type client --id.attrs 'role=farmer:ecert,farmerId=FARMER-A:ecert'` rồi `enroll`.
- Lưu certificate + private key vào **wallet** (thư mục `app/server/wallet/<user>/`) theo định dạng fabric-gateway dùng được.
- Users: `farmerA`, `farmerB`, `htxStaff` (Org1); `retailer` (Org2); `regulator` (Org3).

## 4. Backend — `app/server` (Node.js + Express + @hyperledger/fabric-gateway)
- Khởi tạo: nạp danh tính từ wallet; với mỗi org, biết endpoint peer + TLS cert (Org1 `localhost:7051`, Org2 `localhost:9051`, Org3 `localhost:11051`).
- Tạo `Gateway` connection theo danh tính được chọn (`as` query param ↔ user).
- Endpoint:
  - `GET /api/identities` → danh sách role/user.
  - `GET /api/lots?as=<user>` → gọi `GetAllLots`; với mỗi lô thử `ReadPrice`/`ReadFarmerPII` bằng danh tính đó, field nào Fabric từ chối → `{locked:true}`.
  - `GET /api/lots/:id?as=<user>` → chi tiết tương tự.
  - `POST /api/lots` (as farmer) → CreateLot, PII/giá đưa vào transient.
  - `POST /api/lots/:id/transfer` (chủ hiện tại), `/certify` (regulator), `/recall` (regulator).
  - `GET /api/trace/:id` → public provenance (không cần danh tính; dùng 1 danh tính read-only mặc định, chỉ trả dữ liệu công khai).
  - `GET /api/qrcode/:id` → data-URL/PNG QR trỏ tới `<webBaseUrl>/trace/:id`.
- Xử lý lỗi: bắt lỗi authz của Fabric → trả `{locked:true}` thay vì 500; hành động sai role → 403.

## 5. Frontend — `app/web` (React + Vite)
- **Thanh chọn role/user** (tab/dropdown) ở đầu trang → đổi `as` cho mọi request.
- **Dashboard**: danh sách lô; mỗi lô hiện field công khai; **Giá** & **PII** hiện giá trị nếu có quyền, ngược lại badge **🔒 "Fabric chặn — <collection> không cho org này"**.
- **Hành động theo role**: nông dân → form tạo lô; chủ hiện tại → chuyển giao; Bộ → cấp chứng nhận / thu hồi.
- **QR**: mỗi lô hiển thị ảnh QR; có nút mở `/trace/:id`.
- **Trang `/trace/:id`** (trải nghiệm người tiêu dùng): timeline hành trình (stage, bên liên quan, địa điểm, thời gian), danh sách chứng nhận, mã tx làm bằng chứng; cảnh báo nếu lô `recalled`. Không hiển thị giá/PII.

## 6. Cấu trúc thư mục
```
chaincode/produce-traceability/      # làm lại: private data + ABAC
  collections_config.json
app/
  server/                            # Express + fabric-gateway
    wallet/                          # danh tính enroll (gitignore)
  web/                               # React + Vite
scripts/
  register-users.sh                  # đăng ký user + attribute, ghi wallet
  install-org3.sh / demo.sh / inspect.sh   # đã có, cập nhật nếu cần
```

## 7. Lộ trình theo mốc
- **M1 — Chaincode:** viết lại với 2 collection + ABAC; `collections_config.json`; deploy 3 org; script kiểm thử invoke/query theo từng danh tính (xác minh Fabric thật sự chặn).
- **M2 — Danh tính:** `register-users.sh` tạo user có attribute + wallet; xác minh enroll.
- **M3 — Backend:** Express + fabric-gateway; các endpoint; map role→danh tính; xử lý locked/403.
- **M4 — Frontend:** React UI, role selector, dashboard có badge khóa, QR, trang trace.

## 8. Tiêu chí hoàn thành (acceptance)
1. Chọn **Siêu thị (Org2)** xem một lô: **giá hiển thị**, **PII = 🔒** (Fabric từ chối, không phải ẩn UI).
2. Chọn **Cơ quan QL (Org3)**: **PII hiển thị**, **giá = 🔒**.
3. Chọn **Nông dân A**: chỉ thao tác được lô của A; thử sửa lô của B → bị chaincode từ chối.
4. Quét **QR** một lô → trang trace hiện hành trình + chứng nhận + tx, **không** lộ giá/PII.
5. Lô bị **thu hồi** hiển thị cảnh báo rõ trên trang trace.

## 9. Rủi ro / lưu ý
- fabric-gateway cần đúng TLS cert peer + danh tính MSP; sai đường dẫn `_sk` (đổi mỗi lần dựng lại mạng) sẽ lỗi kết nối.
- Image chạy emulation amd64 trên máy ARM → chậm hơn, cần timeout rộng khi deploy.
- ABAC: attribute phải enroll với hậu tố `:ecert` để xuất hiện trong enrollment certificate.
- Private data đòi hỏi org đích có peer đã join channel & cài chaincode để lưu collection.
- Người tiêu dùng (public) đọc qua một danh tính read-only mặc định (vd `htxStaff` Org1) nhưng endpoint trace **chỉ** gọi hàm công khai (`ReadLotPublic`, `GetLotProvenance`), tuyệt đối không gọi hàm đọc private data.
