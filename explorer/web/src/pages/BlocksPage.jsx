import { useEffect, useState } from 'react';
import { getBlocks } from '../api.js';
import { ago, BlockLink } from '../util.jsx';

export default function BlocksPage() {
  const [count, setCount] = useState(25);
  const [blocks, setBlocks] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () => getBlocks(count).then((b) => alive && setBlocks(b)).catch((e) => alive && setErr(e.message));
    load();
    const id = setInterval(load, 2000);
    return () => { alive = false; clearInterval(id); };
  }, [count]);

  if (err) return <div className="alert">{err}</div>;

  return (
    <>
      <h2 className="page-title">Khối</h2>
      <div className="panel">
        {!blocks ? <p className="muted">Đang tải…</p> : (
          <table>
            <thead><tr><th style={{ width: 120 }}>Khối</th><th style={{ width: 80 }}>Txn</th><th>Thời gian</th></tr></thead>
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
        )}
      </div>
      <div className="toolbar">
        <button className="btn" onClick={() => setCount((c) => c + 25)}>Tải thêm</button>
      </div>
    </>
  );
}
