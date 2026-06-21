import { useEffect, useState, useCallback, useRef } from 'react';
import { getChain, getStats, getBlocks, getTxs, getNetwork } from '../api.js';
import TxChart from '../TxChart.jsx';
import { fmtTime, CcBadge, TxLink, BlockLink } from '../util.jsx';

const REFRESH_MS = 5000;

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [auto, setAuto] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const [chain, stats, blocks, txs, network] = await Promise.all([
        getChain(), getStats(20), getBlocks(10), getTxs(10), getNetwork(),
      ]);
      setData({ chain, stats, blocks, txs, network });
      setUpdatedAt(new Date());
      setErr('');
    } catch (e) { setErr(e.message); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!auto) return undefined;
    timer.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [auto, load]);

  if (err) return <div className="alert">Lỗi tải dữ liệu: {err}</div>;
  if (!data) return <p className="muted">Đang tải…</p>;

  const { chain, stats, blocks, txs, network } = data;

  return (
    <>
      <div className="toolbar">
        <label className="toggle">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          Tự động làm mới (5s)
        </label>
        <button className="btn" onClick={load}>Làm mới ngay</button>
        {updatedAt && <span className="muted">Cập nhật: {updatedAt.toLocaleTimeString('vi-VN')}</span>}
      </div>

      <div className="cards">
        <div className="stat"><div className="label">Chiều cao chuỗi</div><div className="value">{chain.height}</div></div>
        <div className="stat"><div className="label">Tx (20 block gần nhất)</div><div className="value">{stats.totalTx}</div></div>
        <div className="stat"><div className="label">Tổ chức</div><div className="value">{network.orgs.length}</div></div>
        <div className="stat"><div className="label">Peer / Orderer</div><div className="value">{network.peers.length}/{network.orderers.length}</div></div>
      </div>

      <div className="panel">
        <h3>Số giao dịch theo block (20 block gần nhất)</h3>
        <TxChart data={stats.perBlock} />
      </div>

      <div className="two-col">
        <div className="panel">
          <h3>Block mới nhất</h3>
          <table>
            <thead><tr><th style={{ width: 70 }}>Block</th><th style={{ width: 50 }}>Tx</th><th>Thời gian</th></tr></thead>
            <tbody>
              {blocks.map((b) => (
                <tr key={b.number}>
                  <td><BlockLink n={b.number} /></td>
                  <td>{b.txCount}</td>
                  <td className="muted">{fmtTime(b.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <h3>Giao dịch mới nhất</h3>
          <table>
            <thead><tr><th>Tx hash</th><th style={{ width: 90 }}>Hàm</th><th style={{ width: 60 }}>Block</th></tr></thead>
            <tbody>
              {txs.map((t) => (
                <tr key={t.txId}>
                  <td><TxLink txid={t.txId} /></td>
                  <td>{t.function ? <span className="badge fn">{t.function}</span> : <CcBadge name={t.type} />}</td>
                  <td><BlockLink n={t.blockNumber} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
