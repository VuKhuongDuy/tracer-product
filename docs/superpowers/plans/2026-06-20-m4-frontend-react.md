# M4 — Frontend React + Vite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** UI React cho ứng dụng truy xuất nguồn gốc: chọn role → thấy đúng dữ liệu role đó được phép (field mật hiện badge 🔒 khi Fabric chặn), tạo/chuyển/chứng nhận/thu hồi lô theo quyền, và QR → trang trace công khai cho người tiêu dùng.

**Architecture:** Vite + React (JS). Dev server cổng 5173, proxy `/api` → backend `localhost:3000` (tránh CORS). Router 2 trang: `/` (app quản lý theo role) và `/trace/:id` (trang công khai cho người tiêu dùng). Mọi dữ liệu lấy qua REST của M3; UI chỉ hiển thị, không tự lọc — `locked` đến từ backend (Fabric cưỡng chế).

**Tech Stack:** Vite 5, React 18, react-router-dom 6.

## Global Constraints

- Backend M3 chạy ở `localhost:3000` với endpoint: `GET /api/identities`, `/api/lots?as=`, `/api/lots/:id?as=`, `/api/trace/:id`, `/api/qrcode/:id`; `POST /api/lots`, `/api/lots/:id/transfer|certify|recall`.
- Vite dev server cổng **5173**, proxy `/api` → `http://localhost:3000`.
- Danh tính (id → label/role) lấy từ `/api/identities`: farmerA, farmerB (role farmer), htxStaff (htx), retailer (retailer), regulator (regulator).
- Field mật trong response lô: `price = {locked, data}` và `pii = {locked, data}`. UI: `locked=true` → badge 🔒 "Fabric chặn"; `locked=false` → hiển thị `data`.
- Hành động theo role: role=farmer → form Tạo lô + nút Chuyển giao (lô của mình); role=htx/retailer → Chuyển giao; role=regulator → Cấp chứng nhận + Thu hồi.
- Trang `/trace/:id` chỉ dùng `/api/trace/:id` (đã loại private ở backend) — KHÔNG gọi endpoint có private.
- Thư mục: `/Users/alex/Project/hyperledger-fabric/app/web`. Node 22 + npm có sẵn.
- Shell in stderr `.cargo/env` vô hại. Repo KHÔNG git → bỏ commit.

---

### Task 1: Scaffold Vite + React + router + API client

**Files:**
- Create: `app/web/package.json`, `app/web/vite.config.js`, `app/web/index.html`, `app/web/src/main.jsx`, `app/web/src/api.js`, `app/web/src/index.css`

**Interfaces:**
- Produces: app Vite build được; `api.js` export `getIdentities, getLots, getLot, getTrace, getQr, createLot, transferLot, certifyLot, recallLot`; router `/` → `App`, `/trace/:id` → `TracePage`.

- [ ] **Step 1: package.json**

```json
{
  "name": "produce-traceability-web",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview --port 5173" },
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1", "react-router-dom": "^6.26.0" },
  "devDependencies": { "@vitejs/plugin-react": "^4.3.1", "vite": "^5.4.0" }
}
```

- [ ] **Step 2: vite.config.js**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
});
```

- [ ] **Step 3: index.html**

```html
<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Truy xuất nguồn gốc nông sản</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 4: src/api.js**

```js
const j = (r) => r.json();
const post = (url, body) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(j);

export const getIdentities = () => fetch('/api/identities').then(j);
export const getLots = (as) => fetch(`/api/lots?as=${encodeURIComponent(as)}`).then(j);
export const getLot = (id, as) => fetch(`/api/lots/${encodeURIComponent(id)}?as=${encodeURIComponent(as)}`).then(j);
export const getTrace = (id) => fetch(`/api/trace/${encodeURIComponent(id)}`).then(j);
export const getQr = (id) => fetch(`/api/qrcode/${encodeURIComponent(id)}`).then(j);
export const createLot = (body) => post('/api/lots', body);
export const transferLot = (id, body) => post(`/api/lots/${encodeURIComponent(id)}/transfer`, body);
export const certifyLot = (id, body) => post(`/api/lots/${encodeURIComponent(id)}/certify`, body);
export const recallLot = (id, body) => post(`/api/lots/${encodeURIComponent(id)}/recall`, body);
```

- [ ] **Step 5: src/main.jsx**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './App.jsx';
import TracePage from './TracePage.jsx';
import './index.css';

const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/trace/:id', element: <TracePage /> },
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
```

- [ ] **Step 6: src/index.css**

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: #f5f6f8; color: #1c2330; }
.container { max-width: 1100px; margin: 0 auto; padding: 24px; }
h1, h2, h3 { margin: 0 0 12px; }
.roles { display: flex; gap: 8px; flex-wrap: wrap; margin: 16px 0; }
.role-btn { padding: 10px 14px; border: 1px solid #cfd6e4; background: #fff; border-radius: 10px; cursor: pointer; font-size: 14px; }
.role-btn.active { background: #1f6feb; color: #fff; border-color: #1f6feb; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
.card { background: #fff; border: 1px solid #e6e9f0; border-radius: 12px; padding: 16px; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.badge.stage { background: #e7f0ff; color: #1f6feb; }
.badge.recalled { background: #ffe5e5; color: #c0271d; }
.lock { background: #f0f0f3; color: #8a8f99; padding: 2px 8px; border-radius: 6px; font-size: 12px; }
.val { font-weight: 600; }
button.action { padding: 8px 12px; border-radius: 8px; border: 1px solid #1f6feb; background: #1f6feb; color: #fff; cursor: pointer; margin: 4px 4px 0 0; }
button.ghost { background: #fff; color: #1f6feb; }
input, select { padding: 8px; border: 1px solid #cfd6e4; border-radius: 8px; width: 100%; margin: 4px 0; }
.timeline { border-left: 3px solid #1f6feb; padding-left: 16px; }
.timeline .ev { margin-bottom: 14px; }
.muted { color: #8a8f99; font-size: 13px; }
.row { display: flex; gap: 24px; flex-wrap: wrap; }
.col { flex: 1; min-width: 320px; }
dialog { border: none; border-radius: 12px; padding: 24px; max-width: 520px; width: 90%; }
.qr img { width: 200px; height: 200px; }
.alert { background: #fff3cd; border: 1px solid #ffe08a; padding: 12px; border-radius: 8px; margin: 12px 0; }
.alert.danger { background: #ffe5e5; border-color: #ffb3ad; color: #8a1c14; }
```

- [ ] **Step 7: Cài deps + build kiểm tra (tạm tạo App/TracePage rỗng để build qua)**

Run:
```bash
cd /Users/alex/Project/hyperledger-fabric/app/web
printf 'export default function App(){return null}\n' > src/App.jsx
printf 'export default function TracePage(){return null}\n' > src/TracePage.jsx
npm install && npm run build
```
Expected: `npm install` xong, `vite build` in `✓ built in ...`, tạo `dist/`. (App/TracePage thật sẽ ghi đè ở Task 2-4.)

---

### Task 2: App.jsx — role selector + dashboard + chi tiết lô (read)

**Files:**
- Create (ghi đè): `app/web/src/App.jsx`

**Interfaces:**
- Consumes: `api.js` (Task 1).
- Produces: trang `/` hiển thị thanh chọn role, lưới lô; mỗi lô có badge stage/recalled, price/pii (giá trị hoặc 🔒), nút "Chi tiết" mở panel hành trình + QR. Action sẽ thêm ở Task 3 (để chỗ `<Actions>`).

- [ ] **Step 1: Viết App.jsx**

```jsx
import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getIdentities, getLots, getLot, getQr } from './api.js';
import Actions from './Actions.jsx';

function Secret({ field, label }) {
  if (!field) return <span className="muted">{label}: —</span>;
  if (field.locked) return <span>{label}: <span className="lock">🔒 Fabric chặn</span></span>;
  return <span>{label}: <span className="val">{JSON.stringify(field.data)}</span></span>;
}

function LotCard({ lot, onOpen }) {
  return (
    <div className="card">
      <h3>{lot.productName} <span className="muted">#{lot.id}</span></h3>
      <div>Vùng: {lot.origin}</div>
      <div>
        <span className={'badge stage'}>{lot.currentStage}</span>{' '}
        {lot.recalled && <span className="badge recalled">THU HỒI</span>}
      </div>
      <div style={{ marginTop: 8 }}><Secret field={lot.price} label="Giá" /></div>
      <div><Secret field={lot.pii} label="PII nông dân" /></div>
      <div style={{ marginTop: 10 }}>
        <button className="action ghost" onClick={() => onOpen(lot.id)}>Chi tiết</button>
      </div>
    </div>
  );
}

export default function App() {
  const [identities, setIdentities] = useState([]);
  const [as, setAs] = useState('farmerA');
  const [lots, setLots] = useState([]);
  const [detail, setDetail] = useState(null);
  const [qr, setQr] = useState(null);
  const [loading, setLoading] = useState(false);

  const role = identities.find((i) => i.id === as)?.role;

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setLots(await getLots(as)); } finally { setLoading(false); }
  }, [as]);

  useEffect(() => { getIdentities().then(setIdentities); }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const openDetail = async (id) => {
    setDetail(await getLot(id, as));
    setQr(await getQr(id));
  };

  return (
    <div className="container">
      <h1>🌾 Truy xuất nguồn gốc nông sản</h1>
      <p className="muted">Chọn vai trò — dữ liệu hiển thị do Hyperledger Fabric cưỡng chế (không phải ẩn ở giao diện).</p>

      <div className="roles">
        {identities.map((i) => (
          <button key={i.id} className={'role-btn' + (i.id === as ? ' active' : '')} onClick={() => { setAs(i.id); setDetail(null); }}>
            {i.label} <span className="muted">({i.role})</span>
          </button>
        ))}
      </div>

      <div className="row">
        <div className="col">
          <h2>Danh sách lô {loading && <span className="muted">đang tải…</span>}</h2>
          <div className="grid">
            {lots.map((lot) => <LotCard key={lot.id} lot={lot} onOpen={openDetail} />)}
          </div>
        </div>

        <div className="col">
          {detail ? (
            <div className="card">
              <h2>{detail.productName} <span className="muted">#{detail.id}</span></h2>
              <div>Chủ hiện tại: <b>{detail.currentOwner}</b> · <span className="badge stage">{detail.currentStage}</span></div>
              {detail.recalled && <div className="alert danger">⚠ Lô đã bị thu hồi: {detail.recallReason}</div>}
              <p><Secret field={detail.price} label="Giá" /></p>
              <p><Secret field={detail.pii} label="PII nông dân" /></p>
              <h3>Hành trình</h3>
              <div className="timeline">
                {(detail.provenance || []).map((ev, idx) => (
                  <div className="ev" key={idx}>
                    <div><b>{ev.stage}</b> → {ev.actor} <span className="muted">[{ev.actorRole}]</span></div>
                    <div className="muted">{ev.timestamp} · {ev.location}</div>
                    <div>{ev.note}</div>
                  </div>
                ))}
              </div>
              {qr && (
                <div className="qr">
                  <h3>QR cho người tiêu dùng</h3>
                  <img src={qr.dataUrl} alt="QR" />
                  <div><Link to={`/trace/${detail.id}`} target="_blank">Mở trang tra cứu →</Link></div>
                </div>
              )}
              <Actions as={as} role={role} lot={detail} onDone={async () => { await refresh(); await openDetail(detail.id); }} />
            </div>
          ) : <p className="muted">Chọn một lô để xem chi tiết.</p>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Tạo Actions.jsx tạm rỗng để build qua**

Run:
```bash
cd /Users/alex/Project/hyperledger-fabric/app/web
printf 'export default function Actions(){return null}\n' > src/Actions.jsx
npm run build
```
Expected: build thành công (`✓ built`).

---

### Task 3: Actions.jsx — tạo lô / chuyển giao / chứng nhận / thu hồi theo role

**Files:**
- Create (ghi đè): `app/web/src/Actions.jsx`

**Interfaces:**
- Consumes: `api.js` (createLot, transferLot, certifyLot, recallLot).
- Produces: component `Actions({ as, role, lot, onDone })` render nút/form theo role; gọi API; gọi `onDone()` sau khi xong; hiển thị lỗi (vd ABAC từ chối).

- [ ] **Step 1: Viết Actions.jsx**

```jsx
import { useState } from 'react';
import { createLot, transferLot, certifyLot, recallLot } from './api.js';

export default function Actions({ as, role, lot, onDone }) {
  const [open, setOpen] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({});
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const run = async (fn) => {
    setMsg('Đang gửi giao dịch…');
    try {
      const r = await fn();
      setMsg(r.error ? `❌ ${r.error}` : '✅ Thành công');
      if (!r.error) { setOpen(''); setForm({}); await onDone(); }
    } catch (e) { setMsg(`❌ ${e.message}`); }
  };

  return (
    <div style={{ marginTop: 16 }}>
      <h3>Hành động ({role})</h3>

      {role === 'farmer' && <button className="action" onClick={() => setOpen('create')}>Tạo lô mới</button>}
      {(role === 'farmer' || role === 'htx' || role === 'retailer') &&
        <button className="action" onClick={() => setOpen('transfer')}>Chuyển giao</button>}
      {role === 'regulator' && <>
        <button className="action" onClick={() => setOpen('certify')}>Cấp chứng nhận</button>
        <button className="action" onClick={() => setOpen('recall')}>Thu hồi</button>
      </>}

      {open === 'create' && (
        <div className="card" style={{ marginTop: 10 }}>
          <h4>Tạo lô (nông dân)</h4>
          <input placeholder="Mã lô" onChange={set('id')} />
          <input placeholder="Tên sản phẩm" onChange={set('productName')} />
          <input placeholder="Vùng trồng" onChange={set('origin')} />
          <input placeholder="farmerID (vd FARMER-A)" onChange={set('farmerID')} />
          <input placeholder="Ngày thu hoạch (2026-06-10)" onChange={set('harvestDate')} />
          <input placeholder="Khối lượng (kg)" onChange={set('quantityKg')} />
          <input placeholder="PII: Họ tên" onChange={set('piiName')} />
          <input placeholder="PII: CCCD" onChange={set('piiId')} />
          <input placeholder="Giá mua" onChange={set('buy')} />
          <input placeholder="Giá bán" onChange={set('sell')} />
          <button className="action" onClick={() => run(() => createLot({
            as, id: form.id, productName: form.productName, origin: form.origin, farmerID: form.farmerID,
            harvestDate: form.harvestDate, quantityKg: Number(form.quantityKg || 0),
            pii: { fullName: form.piiName || '', idNumber: form.piiId || '', phone: '', plotLocation: form.origin || '' },
            price: { buyPrice: Number(form.buy || 0), sellPrice: Number(form.sell || 0), currency: 'VND', party: as },
          }))}>Gửi</button>
        </div>
      )}

      {open === 'transfer' && (
        <div className="card" style={{ marginTop: 10 }}>
          <h4>Chuyển giao lô #{lot.id}</h4>
          <input placeholder="Chủ mới" onChange={set('newOwner')} />
          <input placeholder="Vai trò chủ mới (PROCESSOR/DISTRIBUTOR/RETAILER)" onChange={set('newOwnerRole')} />
          <input placeholder="Công đoạn (PROCESSED/DISTRIBUTED/RETAIL)" onChange={set('stage')} />
          <input placeholder="Địa điểm" onChange={set('location')} />
          <input placeholder="Ghi chú" onChange={set('note')} />
          <button className="action" onClick={() => run(() => transferLot(lot.id, {
            as, newOwner: form.newOwner, newOwnerRole: form.newOwnerRole, stage: form.stage,
            location: form.location, note: form.note,
          }))}>Gửi</button>
        </div>
      )}

      {open === 'certify' && (
        <div className="card" style={{ marginTop: 10 }}>
          <h4>Cấp chứng nhận #{lot.id}</h4>
          <input placeholder="Chứng nhận (vd VietGAP-2026)" onChange={set('cert')} />
          <input placeholder="Đơn vị cấp" onChange={set('issuer')} />
          <button className="action" onClick={() => run(() => certifyLot(lot.id, { as, certification: form.cert, issuedBy: form.issuer }))}>Gửi</button>
        </div>
      )}

      {open === 'recall' && (
        <div className="card" style={{ marginTop: 10 }}>
          <h4>Thu hồi #{lot.id}</h4>
          <input placeholder="Lý do" onChange={set('reason')} />
          <button className="action" onClick={() => run(() => recallLot(lot.id, { as, regulator: as, reason: form.reason }))}>Gửi</button>
        </div>
      )}

      {msg && <p className="muted">{msg}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `cd /Users/alex/Project/hyperledger-fabric/app/web && npm run build`
Expected: `✓ built`.

---

### Task 4: TracePage.jsx — trang công khai cho người tiêu dùng

**Files:**
- Create (ghi đè): `app/web/src/TracePage.jsx`

**Interfaces:**
- Consumes: `api.js` (getTrace).
- Produces: trang `/trace/:id` hiển thị sản phẩm, vùng trồng, ngày thu hoạch, chứng nhận, hành trình; cảnh báo nếu thu hồi. KHÔNG hiển thị giá/PII.

- [ ] **Step 1: Viết TracePage.jsx**

```jsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getTrace } from './api.js';

export default function TracePage() {
  const { id } = useParams();
  const [t, setT] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    getTrace(id).then((r) => (r.error ? setErr(r.error) : setT(r))).catch((e) => setErr(e.message));
  }, [id]);

  if (err) return <div className="container"><h2>Không tìm thấy lô</h2><p className="muted">{err}</p></div>;
  if (!t) return <div className="container"><p className="muted">Đang tải…</p></div>;

  return (
    <div className="container">
      <h1>🌾 Hành trình sản phẩm</h1>
      <div className="card">
        <h2>{t.productName} <span className="muted">#{t.id}</span></h2>
        {t.recalled && <div className="alert danger">⚠ SẢN PHẨM ĐÃ BỊ THU HỒI: {t.recallReason}</div>}
        <div>Vùng trồng: <b>{t.origin}</b></div>
        <div>Ngày thu hoạch: <b>{t.harvestDate}</b></div>
        <div>Chứng nhận: {t.certifications && t.certifications.length
          ? t.certifications.map((c) => <span key={c} className="badge stage" style={{ marginRight: 6 }}>{c}</span>)
          : <span className="muted">chưa có</span>}</div>
        <div>Trạng thái: <span className="badge stage">{t.currentStage}</span></div>
      </div>

      <h2 style={{ marginTop: 20 }}>Các chặng (bất biến trên blockchain)</h2>
      <div className="timeline">
        {(t.provenance || []).map((ev, i) => (
          <div className="ev" key={i}>
            <div><b>{ev.stage}</b> — {ev.actor} <span className="muted">[{ev.actorRole}]</span></div>
            <div className="muted">{ev.timestamp} · {ev.location}</div>
            <div>{ev.note}</div>
          </div>
        ))}
      </div>
      <p className="muted">Trang công khai — không hiển thị giá hay thông tin cá nhân (được Fabric bảo vệ trong private data collection).</p>
    </div>
  );
}
```

- [ ] **Step 2: Build cuối**

Run: `cd /Users/alex/Project/hyperledger-fabric/app/web && npm run build`
Expected: `✓ built`, có `dist/`.

---

### Task 5: Smoke chạy thật + tài liệu kiểm thử thủ công

**Files:**
- Create: `app/web/RUN.md`

**Interfaces:**
- Produces: hướng dẫn chạy + xác nhận dev server phục vụ app và proxy API hoạt động.

- [ ] **Step 1: Viết app/web/RUN.md**

```markdown
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
```

- [ ] **Step 2: Smoke chạy thật (backend + vite cùng lúc), kiểm tra phục vụ + proxy**

Run:
```bash
cd /Users/alex/Project/hyperledger-fabric/app/server && (node server.js & echo $! > /tmp/srv.pid); sleep 3
cd /Users/alex/Project/hyperledger-fabric/app/web && (npm run dev > /tmp/vite.log 2>&1 & echo $! > /tmp/vite.pid); sleep 6
echo "--- index.html phục vụ? ---"; curl -s localhost:5173/ | grep -o '<div id="root">' | head -1
echo "--- proxy /api hoạt động? ---"; curl -s localhost:5173/api/identities | head -c 200; echo
kill $(cat /tmp/vite.pid) $(cat /tmp/srv.pid) 2>/dev/null
```
Expected: in `<div id="root">` (Vite phục vụ app) và `/api/identities` qua proxy trả mảng 5 danh tính. Dừng cả 2 tiến trình sau khi xong.

---

## Self-Review

**Spec coverage (mục §5 spec):**
- Tab chọn role đổi `as` mọi request → App.jsx role selector. ✓
- Dashboard hiện field công khai + price/pii (badge 🔒 khi locked) → `Secret` + LotCard (Task 2). ✓
- Hành động theo role (farmer tạo; htx/retailer chuyển; regulator chứng nhận/thu hồi) → Actions.jsx (Task 3). ✓
- QR + trang `/trace/:id` công khai không lộ private → App QR + TracePage (Task 2, 4). ✓
- Cảnh báo thu hồi → App detail + TracePage. ✓
- Acceptance §8 #1,#2 (retailer/regulator thấy khác nhau), #4,#5 (QR trace, recall) → RUN.md kiểm thử thủ công + locked đến từ backend M3 (đã test PASS ở M3). ✓

**Placeholder scan:** code đầy đủ; App/Actions/TracePage thật ghi đè bản rỗng tạm. ✓

**Type consistency:** field `price/pii = {locked,data}`, `provenance[]` (stage/actor/actorRole/location/note/timestamp), endpoint khớp M3; props `Actions({as,role,lot,onDone})` khớp App. ✓

**Rủi ро:** (1) UI là SPA — xác nhận cuối là *thủ công/trực quan* (Task 5 chỉ smoke phục vụ+proxy); không có e2e headless. (2) Cần backend chạy song song khi dev. (3) `npm run dev`/`node` chạy nền trong smoke — nhớ kill PID.

## Execution Handoff

Thực thi bằng subagent-driven-development. Xem cuối hội thoại.
