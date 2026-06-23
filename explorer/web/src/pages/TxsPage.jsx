import { useEffect, useState } from 'react';
import { getTxs } from '../api.js';
import { ago, MethodBadge, FromTo, TxLink, BlockLink } from '../util.jsx';

export default function TxsPage() {
  const [count, setCount] = useState(25);
  const [txs, setTxs] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () => getTxs(count).then((t) => alive && setTxs(t)).catch((e) => alive && setErr(e.message));
    load();
    const id = setInterval(load, 2000);
    return () => { alive = false; clearInterval(id); };
  }, [count]);

  if (err) return <div className="alert">{err}</div>;

  return (
    <>
      <h2 className="page-title">Giao dịch</h2>
      <div className="panel">
        {!txs ? <p className="muted">Đang tải…</p> : (
          <table>
            <thead><tr><th>Mã giao dịch</th><th style={{ width: 120 }}>Phương thức</th><th style={{ width: 80 }}>Khối</th><th>Từ / Đến</th></tr></thead>
            <tbody>
              {txs.map((t) => (
                <tr key={t.txId}>
                  <td><TxLink txid={t.txId} /></td>
                  <td><MethodBadge method={t.method} /></td>
                  <td><BlockLink n={t.blockNumber} /></td>
                  <td><FromTo from={t.from} to={t.to} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="toolbar">
        <button className="btn" onClick={() => setCount((c) => Math.min(100, c + 25))}>Tải thêm</button>
      </div>
    </>
  );
}
