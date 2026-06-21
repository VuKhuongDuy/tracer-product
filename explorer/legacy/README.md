# Explorer cũ (hyperledger/explorer) — đã ngừng dùng

Các file ở đây (`docker-compose.yaml`, `config.json`, `connection-profile/`) chạy
image chính thức `hyperledger/explorer` + `hyperledger/explorer-db`. Image này
**không tương thích tốt với Hyperledger Fabric 3.x** (BFT, fabric-gateway mới).

Đã thay bằng explorer gọn nhẹ tự xây ở `explorer/server` + `explorer/web`:
truy vấn on-demand qua `qscc` bằng `@hyperledger/fabric-gateway`, không cần DB.

Giữ lại thư mục này để tham khảo cấu hình cũ; không dùng trong demo nữa.
