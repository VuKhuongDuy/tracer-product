import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getUserTxs } from '../api.js';
import { ago, MethodBadge, TxLink, BlockLink, actorLabel, contractLabel } from '../util.jsx';

export default function UserPage() {
  const { name } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [limit, setLimit] = useState(50);

  useEffect(() => { setLimit(50); }, [name]);
  useEffect(() => {
    setErr('');
    getUserTxs(name, limit).then(setData).catch((e) => setErr(e.message));
  }, [name, limit]);

  if (err) return <div className="alert">{err}</div>;
  if (!data) return <p className="muted">Đang tải…</p>;

  return (
    <>
      <h2 className="page-title">Lịch sử người dùng</h2>

      <div className="panel">
        <div className="kv">
          <div className="k">Người dùng</div><div className="v"><span className="party-lg">{actorLabel(name)}</span></div>
          <div className="k">Định danh</div><div className="v mono">{name}</div>
          <div className="k">Số giao dịch</div><div className="v">{data.count}</div>
        </div>
      </div>

      <div className="panel">
        <h3>Giao dịch</h3>
        {data.txs.length ? (
          <table>
            <thead><tr><th>Mã giao dịch</th><th style={{ width: 150 }}>Phương thức</th><th style={{ width: 70 }}>Khối</th><th>Đến</th><th style={{ width: 130 }}>Thời gian</th></tr></thead>
            <tbody>
              {data.txs.map((t) => (
                <tr key={t.txId}>
                  <td><TxLink txid={t.txId} /></td>
                  <td><MethodBadge method={t.method} /></td>
                  <td><BlockLink n={t.blockNumber} /></td>
                  <td>{contractLabel(t.to)}</td>
                  <td className="muted">{ago(t.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <span className="muted">Người dùng này chưa có giao dịch.</span>}
      </div>

      {data.count >= limit && (
        <div className="toolbar">
          <button className="btn" onClick={() => setLimit((l) => l + 50)}>Tải thêm</button>
        </div>
      )}
    </>
  );
}
