import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getTx } from '../api.js';
import { fmtTime, ago, StatusBadge, BlockLink, actorLabel, contractLabel, methodLabel } from '../util.jsx';

// Nút sao chép nhỏ kiểu Blockscout.
function Copy({ text }) {
  const [done, setDone] = useState(false);
  if (!text) return null;
  const copy = () => {
    navigator.clipboard?.writeText(text);
    setDone(true);
    setTimeout(() => setDone(false), 1200);
  };
  return <button className="copy" onClick={copy} title="Sao chép">{done ? '✓' : '⧉'}</button>;
}

// Một hàng nhãn-trái / giá trị-phải.
function Row({ label, children }) {
  return (
    <div className="drow">
      <div className="dlabel">{label}</div>
      <div className="dval">{children}</div>
    </div>
  );
}

export default function TxPage() {
  const { txid } = useParams();
  const [t, setT] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('details');

  useEffect(() => {
    setT(null); setErr(''); setTab('details');
    getTx(txid).then(setT).catch((e) => setErr(e.message));
  }, [txid]);

  if (err) return <div className="alert">{err}</div>;
  if (!t) return <p className="muted">Đang tải dữ liệu giao dịch…</p>;

  const changes = t.stateChanges || [];

  return (
    <>
      <h2 className="page-title">Chi tiết giao dịch</h2>

      <div className="panel">
        <div className="tabs">
          <button className={`tab ${tab === 'details' ? 'active' : ''}`} onClick={() => setTab('details')}>Chi tiết</button>
          <button className={`tab ${tab === 'logs' ? 'active' : ''}`} onClick={() => setTab('logs')}>
            Nhật ký hệ thống{changes.length ? ` (${changes.length})` : ''}
          </button>
        </div>

        {tab === 'details' ? (
          <div className="drows">
            <Row label="Mã giao dịch">
              <span className="hash">{t.txId}</span><Copy text={t.txId} />
            </Row>
            <Row label="Trạng thái"><StatusBadge status={t.status} /></Row>
            <Row label="Khối">
              <BlockLink n={t.blockNumber} />
              {typeof t.confirmations === 'number' && <span className="confirm">{t.confirmations} xác nhận</span>}
            </Row>
            <Row label="Dấu thời gian">
              <span className="muted">🕒 {ago(t.timestamp)}</span> <span>({fmtTime(t.timestamp)})</span>
            </Row>

            <div className="ddivider" />

            <Row label="Từ"><span className="party-lg">{actorLabel(t.from)}</span><Copy text={t.from} /></Row>
            <Row label="Đến"><span className="party-lg">{contractLabel(t.to)}</span><Copy text={t.to} /></Row>
            <Row label="Phương thức">
              {t.method ? <span className="method-chip">{methodLabel(t.method)}</span> : <span className="muted">—</span>}
            </Row>

            <div className="ddivider" />

            <Row label="Dữ liệu đầu vào">
              {t.params && t.params.length ? (
                <ol className="params">
                  {t.params.map((p, i) => <li key={i}><span className="mono">{p}</span></li>)}
                </ol>
              ) : <span className="muted">Không có tham số.</span>}
            </Row>
          </div>
        ) : (
          changes.length ? (
            <table>
              <thead><tr><th style={{ width: 220 }}>Khoá</th><th>Giá trị</th></tr></thead>
              <tbody>
                {changes.map((c, i) => (
                  <tr key={i}>
                    <td className="mono">{c.key}</td>
                    <td>{c.isDelete ? <span className="badge invalid">đã xoá</span> : <span className="mono statev">{c.value}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <span className="muted">Giao dịch này không thay đổi trạng thái.</span>
        )}
      </div>
    </>
  );
}
