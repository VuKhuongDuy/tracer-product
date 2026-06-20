import { useState, useEffect } from 'react';
import { createLot, transferLot, certifyLot, recallLot } from './api.js';

export default function Actions({ as, role, lot, onDone }) {
  const [open, setOpen] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({});
  const set = (k) => (e) => setForm((prev) => ({ ...prev, [k]: e.target.value }));
  useEffect(() => { setOpen(''); setMsg(''); }, [as]);

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
