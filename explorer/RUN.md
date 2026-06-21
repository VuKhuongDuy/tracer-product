# Fabric 3.x Explorer

Explorer gọn nhẹ cho mạng test-network Hyperledger Fabric 3.x của dự án, thay cho
image `hyperledger/explorer` cũ (không hợp Fabric 3.x — xem `legacy/`).

- **Nguồn dữ liệu:** truy vấn on-demand system chaincode `qscc` qua
  `@hyperledger/fabric-gateway`. Không cần database/container.
- **Decode block:** `fabric-common` BlockDecoder.
- **Tính năng:** chi tiết giao dịch, tra cứu theo tx hash, tổng quan mạng + biểu đồ.

## Yêu cầu
- Mạng test-network đang chạy (peer/orderer Org1-3, channel `mychannel`, chaincode `produce`).
- Ví `app/server/wallet/htxStaff` tồn tại (dùng làm danh tính chỉ đọc).

## Chạy

```bash
# 1) Backend (cổng 3001)
cd explorer/server
npm install
npm start

# 2) Frontend (cổng 5174), terminal khác
cd explorer/web
npm install
npm run dev
```

Mở http://localhost:5174

## Test

```bash
cd explorer/server
npm test          # unit test decode.js bằng fixture block thật
```

## API

| Endpoint | Mô tả |
|---|---|
| `GET /api/chain` | height + hash hiện tại |
| `GET /api/blocks?count=N` | N block mới nhất |
| `GET /api/blocks/:number` | chi tiết block + danh sách tx |
| `GET /api/tx/:txid` | chi tiết giao dịch (tra cứu theo tx hash) |
| `GET /api/txs?count=N` | N giao dịch mới nhất |
| `GET /api/stats?count=N` | thống kê cho biểu đồ |
| `GET /api/network` | org/peer/orderer/chaincode + height |
