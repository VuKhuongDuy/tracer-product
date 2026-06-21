# Thiết kế: Blockchain Explorer cho Hyperledger Fabric 3.x

Ngày: 2026-06-21

## Bối cảnh & vấn đề

Dự án demo truy xuất nguồn gốc nông sản chạy trên Hyperledger Fabric 3.x (consensus
BFT, 3 org, 4 orderer, channel `mychannel`, chaincode `produce`). Explorer cũ tại
`explorer/` dùng image chính thức `hyperledger/explorer:latest` + `explorer-db`
(Postgres) qua docker-compose, nhưng image này không tương thích Fabric 3.x
(connection profile/SDK đời cũ, không hỗ trợ tốt BFT và fabric-gateway mới).

App hiện tại (`app/server`) đã dùng `@hyperledger/fabric-gateway` — đúng SDK cho
Fabric 3.x. Ta tự xây một explorer gọn nhẹ tái dùng pattern đó thay vì sửa image cũ.

## Mục tiêu (phạm vi đã chốt)

Explorer tập trung 3 nhóm tính năng người dùng chọn:

1. **Danh sách & chi tiết giao dịch** — xem từng tx: tx hash, chaincode, hàm gọi,
   args, MSP người tạo, endorser, thời gian, trạng thái validation.
2. **Tra cứu theo tx hash** — ô search nhập tx hash → nhảy đến chi tiết giao dịch.
   Liên kết trực tiếp với tx hash mà app truy xuất nguồn gốc vừa hiển thị.
3. **Tổng quan mạng & biểu đồ** — số org/peer/orderer/chaincode, ledger height,
   biểu đồ số tx theo block.

Block vẫn được đọc ở tầng dữ liệu (tx nằm trong block) và có trang chi tiết block,
nhưng không làm trang duyệt block cầu kỳ.

## Phi mục tiêu (YAGNI)

- Không indexer/DB chạy nền (dùng truy vấn on-demand).
- Không xác thực người dùng / phân quyền (công cụ nội bộ, chỉ đọc).
- Không sửa hay thay thế image hyperledger/explorer cũ — chỉ dời sang `legacy/`.
- Không lịch sử/thống kê dài hạn vượt ngoài số block đọc theo yêu cầu.

## Kiến trúc

App riêng dưới `explorer/`, cùng stack với app hiện tại (Node/Express + React/Vite):

```
explorer/
  server/
    fabric.js    # rút gọn từ app/server/fabric.js — kết nối qscc, identity read-only (htxStaff)
    decode.js    # bọc fabric-common BlockDecoder → JSON gọn
    cache.js     # cache block đã decode theo số (block bất biến)
    server.js    # các REST endpoint
    package.json
  web/
    src/         # React + Vite
    package.json
    vite.config.js
  legacy/        # docker-compose.yaml, config.json, connection-profile cũ + README
```

- Server cổng **3001**, web dev cổng **5174** (app cũ giữ 3000/5173, không đụng).
- Vite proxy `/api` → `http://localhost:3001`.
- Identity: dùng lại ví `app/server/wallet/htxStaff` (Org1, chỉ đọc). qscc là
  system chaincode nên query được mà không cần quyền đặc biệt.
- Hằng số mạng (TN path, ORGS endpoint, channel) tái dùng từ `app/server/fabric.js`.

## Tầng dữ liệu (server)

### Kết nối Fabric (`fabric.js`)

Rút gọn từ `app/server/fabric.js`: tạo gRPC client tới peer0.org1, `connect()` bằng
identity htxStaff, lấy `getContract('qscc')` trên `mychannel`. Hàm
`withQscc(fn)` mở/đóng gateway quanh mỗi truy vấn (giống `withContract`).

qscc cung cấp:
- `GetChainInfo(channel)` → bytes `common.BlockchainInfo` (height, currentBlockHash, previousBlockHash).
- `GetBlockByNumber(channel, n)` → bytes `common.Block`.
- `GetBlockByTxID(channel, txid)` → bytes `common.Block` chứa tx (cho ô tra cứu).

### Giải mã block (`decode.js`)

Dùng `fabric-common` `BlockDecoder.decode(bytes)` (cách A đã chốt — SDK chính thức,
đã kiểm chứng, format block ổn định nên dùng tốt với Fabric 3.x). `BlockchainInfo`
giải mã bằng `@hyperledger/fabric-protos` (`common.BlockchainInfo.deserializeBinary`).

`decode.js` xuất 2 hàm thuần (không I/O, dễ test):
- `decodeChainInfo(bytes)` → `{ height, currentBlockHash, previousBlockHash }`.
- `summarizeBlock(decodedBlock)` → rút trích:
  - Block: `number`, `dataHash`, `previousHash`, `txCount`, `timestamp` (từ tx đầu).
  - Mỗi tx: `txId`, `type` (ENDORSER_TRANSACTION/CONFIG/...), `timestamp`,
    `creatorMSP`, `chaincode` (tên), `function`, `args` (mảng string),
    `endorsers` (MSP list), `validationCode` (VALID/...).

Hàm nhận block đã decode để unit test bằng fixture không cần network.

### Cache (`cache.js`)

`Map<number, summarizedBlock>`. Block bất biến nên cache vĩnh viễn trong RAM (không
TTL). Chain height luôn lấy mới ở `/api/chain` và `/api/stats`. Giảm decode lặp khi
vẽ biểu đồ / duyệt danh sách.

## REST endpoints

| Endpoint | Trả về |
|---|---|
| `GET /api/chain` | `{ channel, height, currentBlockHash, previousBlockHash }` |
| `GET /api/blocks?count=N` | N block mới nhất (mặc định 20): mảng tóm tắt block (số, txCount, dataHash, prevHash, timestamp) |
| `GET /api/blocks/:number` | chi tiết 1 block + danh sách tx đã tóm tắt |
| `GET /api/tx/:txid` | chi tiết 1 giao dịch (qua GetBlockByTxID, lọc đúng tx) |
| `GET /api/stats?count=N` | `{ totalTx, perBlock: [{number, txCount}], byChaincode: {name: count} }` từ N block mới nhất |
| `GET /api/network` | `{ orgs, peers, orderers, chaincodes, height, channel }` — org/peer/orderer từ config test-network; chaincodes phát hiện từ tx trong N block gần nhất |

- `/api/blocks` lấy height từ GetChainInfo rồi đọc từ `height-1` xuống tối đa N block.
- Server trả JSON; mọi thông điệp lỗi tiếng Việt có dấu.

## Giao diện (web)

Stack: React + react-router + Vite. CSS thuần (theo `app/web/src/index.css`), xử lý
tràn text cho hash dài ngay từ đầu (`overflow-wrap`, `word-break`).

- **Dashboard `/`**: thẻ tổng quan (height, tổng tx, #org/peer/orderer) + ô **tra cứu
  tx hash** ở đầu (submit → điều hướng `/tx/:txid`) + biểu đồ tx/block (SVG tự vẽ,
  không thêm lib nặng) + bảng block mới nhất + bảng tx mới nhất.
- **Trang block `/block/:n`**: header block (số, hash, prevHash, thời gian) + danh
  sách tx, mỗi tx link sang chi tiết.
- **Trang tx `/tx/:txid`**: đầy đủ — txId, chaincode, hàm + args, creatorMSP,
  endorser, thời gian, trạng thái. Khớp với tx hash hiển thị trong app truy xuất.
- **Trang network `/network`**: liệt kê org/peer/orderer/chaincode + height.

## Xử lý lỗi

- Không thấy block/tx → HTTP 404 + thông điệp tiếng Việt.
- Lỗi kết nối Fabric/gateway → HTTP 500 + thông điệp.
- txid sai định dạng / rỗng → 400.
- Web hiển thị trạng thái đang tải và thông báo lỗi rõ ràng.

## Kiểm thử

- **Unit test `decode.js`**: lưu 1 block bytes thật (capture từ network qua qscc) làm
  fixture; assert `summarizeBlock`/`decodeChainInfo` map ra đúng txId, chaincode,
  args, height. Chạy không cần network.
- **End-to-end thủ công**: chạy server với network đang chạy; curl từng endpoint;
  đối chiếu một txId đã biết (vd lô `LOT-SR-20260621-074009`) khớp giữa app và explorer.

## Edge case

- Block 0 (genesis): không có tx ứng dụng / chỉ có config tx → UI hiển thị hợp lý.
- Tx loại CONFIG (không phải ENDORSER_TRANSACTION): không có chaincode/args → hiển thị nhãn loại.
- height = 0 hoặc network mới: danh sách rỗng, không lỗi.
- txid không tồn tại: 404 thân thiện.
- count > height: chỉ đọc tới block 0, không lỗi.

## Quyết định đã chốt

- Cách lấy dữ liệu: **on-demand qua qscc** (không DB/indexer).
- Decode block: **fabric-common BlockDecoder** (cách A).
- Vị trí: **app riêng** dưới `explorer/`; dời explorer cũ vào `explorer/legacy/`.
- Tính năng: tx list/detail, tra cứu tx hash, tổng quan mạng + biểu đồ.
