import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getBlock } from '../api.js';
import { fmtTime, CcBadge, TxLink } from '../util.jsx';

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
        <Link className="btn" to={`/block/${n - 1}`} style={{ pointerEvents: n <= 0 ? 'none' : 'auto', opacity: n <= 0 ? 0.4 : 1 }}>← Block trước</Link>
        <Link className="btn" to={`/block/${n + 1}`}>Block sau →</Link>
      </div>
      <div className="panel">
        <h2>Block #{b.number}</h2>
        <div className="kv">
          <div className="k">Số giao dịch</div><div className="v">{b.txCount}</div>
          <div className="k">Thời gian</div><div className="v">{fmtTime(b.timestamp)}</div>
          <div className="k">Data hash</div><div className="v hash">{b.dataHash}</div>
          <div className="k">Previous hash</div><div className="v hash">{b.previousHash || '—'}</div>
        </div>
      </div>

      <div className="panel">
        <h3>Giao dịch trong block</h3>
        <table>
          <thead><tr><th>Tx hash</th><th style={{ width: 110 }}>Chaincode</th><th style={{ width: 120 }}>Hàm</th><th style={{ width: 100 }}>Người tạo</th></tr></thead>
          <tbody>
            {b.transactions.map((t) => (
              <tr key={t.txId}>
                <td><TxLink txid={t.txId} /></td>
                <td><CcBadge name={t.chaincode || t.type} /></td>
                <td>{t.function ? <span className="badge fn">{t.function}</span> : <span className="muted">—</span>}</td>
                <td className="mono">{t.creatorMSP}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
