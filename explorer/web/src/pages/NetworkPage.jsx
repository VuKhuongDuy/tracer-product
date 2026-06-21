import { useEffect, useState } from 'react';
import { getNetwork } from '../api.js';

export default function NetworkPage() {
  const [n, setN] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { getNetwork().then(setN).catch((e) => setErr(e.message)); }, []);

  if (err) return <div className="alert">{err}</div>;
  if (!n) return <p className="muted">Đang tải…</p>;

  return (
    <>
      <div className="cards">
        <div className="stat"><div className="label">Channel</div><div className="value" style={{ fontSize: 18 }}>{n.channel}</div></div>
        <div className="stat"><div className="label">Chiều cao chuỗi</div><div className="value">{n.height}</div></div>
        <div className="stat"><div className="label">Consensus</div><div className="value" style={{ fontSize: 18 }}>{n.consensus}</div></div>
      </div>

      <div className="two-col">
        <div className="panel">
          <h3>Tổ chức ({n.orgs.length})</h3>
          <table><tbody>
            {n.orgs.map((o) => <tr key={o.mspId}><td className="mono">{o.mspId}</td><td>{o.name}</td></tr>)}
          </tbody></table>
        </div>
        <div className="panel">
          <h3>Chaincode phát hiện</h3>
          <div className="pill-list">
            {n.chaincodes.length ? n.chaincodes.map((c) => (
              <span key={c} className={`badge ${c.startsWith('_') ? 'sys' : 'cc'}`}>{c}</span>
            )) : <span className="muted">chưa phát hiện</span>}
          </div>
        </div>
      </div>

      <div className="two-col">
        <div className="panel">
          <h3>Peer ({n.peers.length})</h3>
          <table><tbody>
            {n.peers.map((p) => <tr key={p.name}><td>{p.name}</td><td className="mono">{p.url}</td></tr>)}
          </tbody></table>
        </div>
        <div className="panel">
          <h3>Orderer ({n.orderers.length})</h3>
          <table><tbody>
            {n.orderers.map((o) => <tr key={o.name}><td>{o.name}</td><td className="mono">{o.url}</td></tr>)}
          </tbody></table>
        </div>
      </div>
    </>
  );
}
