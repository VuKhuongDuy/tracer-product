import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getBlock } from '../api.js';
import { fmtTime, ago, MethodBadge, FromTo, TxLink } from '../util.jsx';

export default function BlockPage() {
  const { number } = useParams();
  const [b, setB] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setB(null); setErr('');
    getBlock(number).then(setB).catch((e) => setErr(e.message));
  }, [number]);

  if (err) return <div className="alert">{err}</div>;
  if (!b) return <p className="muted">Đang tải…</p>;

  const n = Number(number);
  return (
    <>
      <div className="toolbar">
        <h2 className="page-title">Khối #{b.number}</h2>
        <span style={{ flex: 1 }} />
        <Link className="btn" to={`/block/${n - 1}`} style={{ pointerEvents: n <= 0 ? 'none' : 'auto', opacity: n <= 0 ? 0.4 : 1 }}>← Trước</Link>
        <Link className="btn" to={`/block/${n + 1}`}>Sau →</Link>
      </div>

      <div className="panel">
        <div className="kv">
          <div className="k">Số khối</div><div className="v">{b.number}</div>
          <div className="k">Thời gian</div><div className="v">{fmtTime(b.timestamp)} <span className="muted">({ago(b.timestamp)})</span></div>
          {typeof b.confirmations === 'number' && (<><div className="k">Xác nhận</div><div className="v">{b.confirmations}</div></>)}
          <div className="k">Số giao dịch</div><div className="v">{b.txCount}</div>
          <div className="k">Mã băm khối</div><div className="v hash">{b.dataHash}</div>
          <div className="k">Khối trước</div><div className="v hash">{b.previousHash || '—'}</div>
        </div>
      </div>

      <div className="panel">
        <h3>Giao dịch trong khối</h3>
        {b.transactions.length ? (
          <table>
            <thead><tr><th>Mã giao dịch</th><th style={{ width: 120 }}>Phương thức</th><th>Từ / Đến</th></tr></thead>
            <tbody>
              {b.transactions.map((t) => (
                <tr key={t.txId}>
                  <td><TxLink txid={t.txId} /></td>
                  <td><MethodBadge method={t.method} /></td>
                  <td><FromTo from={t.from} to={t.to} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <span className="muted">Khối không có giao dịch.</span>}
      </div>
    </>
  );
}
