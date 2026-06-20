# Chạy UI

Cần backend M3 chạy trước:
```
cd app/server && node server.js   # cổng 3000
```
Rồi chạy UI:
```
cd app/web && npm run dev          # http://localhost:5173
```

## Kiểm thử thủ công (acceptance)
1. Mở http://localhost:5173 — chọn **Siêu thị / Bán lẻ (retailer)** → mở một lô có giá: thấy **Giá**, nhưng **PII = 🔒 Fabric chặn**.
2. Chọn **Cơ quan quản lý (regulator)** → cùng lô: thấy **PII**, nhưng **Giá = 🔒**.
3. Chọn **Nông dân A (farmer)** → "Tạo lô mới" được; thử chuyển lô không phải của mình → báo lỗi (ABAC).
4. Mở chi tiết lô → quét **QR** (hoặc bấm link) → trang `/trace/:id`: thấy hành trình + chứng nhận, **không** thấy giá/PII; lô thu hồi hiện cảnh báo đỏ.
