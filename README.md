# Truy xuất nguồn gốc nông sản trên Hyperledger Fabric 3.x

Giải pháp truy xuất nguồn gốc nông sản trên mạng blockchain permissioned **Hyperledger Fabric 3.1.5** (đồng thuận **BFT / SmartBFT**, 4 orderer, 3 tổ chức). Gồm 3 phần:

- **Mạng Fabric** — chaincode `produce` ghi lại vòng đời lô nông sản (tạo lô → chứng nhận → đóng gói → phân phối → bán lẻ) thành các mốc lịch sử bất biến. Bảo mật dữ liệu nhạy cảm bằng **Private Data** (giá, PII nông dân) và phân quyền người dùng bằng **ABAC**.
- **App truy xuất** (`app/`) — REST API + UI React: chọn vai trò để thấy đúng dữ liệu được phép (Fabric cưỡng chế thật, không ẩn ở giao diện), kèm QR → trang tra cứu công khai cho người tiêu dùng.
- **Explorer** (`explorer/`) — explorer tự build cho Fabric 3.x (qscc + fabric-gateway), thay cho Hyperledger Explorer vốn chưa hỗ trợ Fabric 3.x.

## Ảnh demo

### App truy xuất nguồn gốc

Danh sách lô — chọn vai trò, dữ liệu mật hiển thị 🔒 khi Fabric chặn:

![Danh sách lô](publics/list-lot.png)

Chi tiết lô — hành trình đầy đủ + QR cho người tiêu dùng:

![Chi tiết lô](publics/detail-lot-1.png)
![Chi tiết lô](publics/detail-lot-2.png)

### Blockchain Explorer (Fabric 3.x)

Tổng quan mạng — chiều cao chuỗi, giao dịch theo block, danh sách block & tx mới nhất:

![Explorer tổng quan](publics/explorer-1.png)
![Explorer mạng lưới](publics/explorer-2.png)

Chi tiết giao dịch — tx hash, chaincode, hàm gọi, tham số, endorser:

![Chi tiết giao dịch](publics/explorer-tx-detail.png)

## Chạy nhanh

```bash
# 1. Khởi động mạng BFT + Org3 + deploy chaincode
cd fabric-samples/test-network
./network.sh up createChannel -bft -ca -c mychannel
cd addOrg3 && ./addOrg3.sh up -c mychannel -ca && cd ..
./network.sh deployCC -ccn produce -ccp ../../chaincode/produce-traceability -ccl go -c mychannel

# 2. Tạo danh tính + chạy app
bash scripts/register-users.sh
cd app/server && npm install && node server.js   # API :3000
cd app/web && npm install && npm run dev          # UI  :5173

# 3. Chạy explorer (server :3001 + web :5174)
cd explorer/server && npm install && npm start
cd explorer/web && npm install && npm run dev
```

> Hướng dẫn chi tiết: app xem [app/web/RUN.md](app/web/RUN.md), explorer xem [explorer/RUN.md](explorer/RUN.md).
