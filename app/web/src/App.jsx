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
    try {
      setDetail(await getLot(id, as));
      setQr(await getQr(id));
    } catch (e) {
      console.error('openDetail failed', e);
    }
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
