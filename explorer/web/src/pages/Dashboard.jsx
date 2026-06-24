import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getChain, getStats, getBlocks, getTxs } from '../api.js';
import TxChart from '../TxChart.jsx';
import { ago, MethodBadge, FromTo, TxLink, BlockLink } from '../util.jsx';

const REFRESH_MS = 2000;

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const [chain, stats, blocks, txs] = await Promise.all([
        getChain(), getStats(20), getBlocks(15), getTxs(8),
      ]);
      setData({ chain, stats, blocks, txs });
      setErr('');
    } catch (e) { setErr(e.message); }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  if (err) return <div className="alert">Lỗi tải dữ liệu: {err}</div>;
  if (!data) return <p className="muted">Đang tải…</p>;

  const { chain, stats, blocks, txs } = data;
  const avg = stats.perBlock.length ? (stats.totalTx / stats.perBlock.length).toFixed(1) : '0';

  return (
    <>
      <div className="cards">
        <div className="stat"><div className="label">Khối mới nhất</div><div className="value">{Math.max(0, chain.height - 1)}</div></div>
        <div className="stat"><div className="label">Giao dịch (20 khối gần nhất)</div><div className="value">{stats.totalTx}</div></div>
        <div className="stat"><div className="label">TB giao dịch / khối</div><div className="value">{avg}</div></div>
      </div>

      {/* <div className="panel">
        <h3>Số giao dịch theo khối (20 khối gần nhất)</h3>
        <TxChart data={stats.perBlock} />
      </div> */}

      <div className="two-col">
        <div className="panel">
          <div className="panel-head"><h3>Khối mới nhất</h3><Link to="/blocks" className="more">Xem tất cả →</Link></div>
          <table>
            <thead><tr><th style={{ width: 90 }}>Khối</th><th style={{ width: 60 }}>Txn</th><th>Thời gian</th></tr></thead>
            <tbody>
              {blocks.map((b) => (
                <tr key={b.number}>
                  <td><BlockLink n={b.number} /></td>
                  <td>{b.txCount}</td>
                  <td className="muted">{ago(b.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <div className="panel-head"><h3>Giao dịch mới nhất</h3><Link to="/txs" className="more">Xem tất cả →</Link></div>
          <table>
            <thead><tr><th>Mã giao dịch</th><th style={{ width: 110 }}>Phương thức</th><th>Từ / Đến</th></tr></thead>
            <tbody>
              {txs.map((t) => (
                <tr key={t.txId}>
                  <td><TxLink txid={t.txId} /></td>
                  <td><MethodBadge method={t.method} /></td>
                  <td><FromTo from={t.from} to={t.to} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
