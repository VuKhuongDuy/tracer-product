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
