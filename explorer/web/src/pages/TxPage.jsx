import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getTx } from '../api.js';
import { fmtTime, CcBadge, ValidBadge, BlockLink } from '../util.jsx';

export default function TxPage() {
  const { txid } = useParams();
  const [t, setT] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setT(null); setErr('');
    getTx(txid).then(setT).catch((e) => setErr(e.message));
  }, [txid]);

  if (err) return <div className="alert">{err}</div>;
  if (!t) return <p className="muted">Đang tải…</p>;

  return (
    <div className="panel">
      <h2>Chi tiết giao dịch</h2>
      <div className="kv">
        <div className="k">Tx hash</div><div className="v hash">{t.txId}</div>
        <div className="k">Block</div><div className="v"><BlockLink n={t.blockNumber} /></div>
        <div className="k">Loại</div><div className="v">{t.type}</div>
        <div className="k">Trạng thái</div><div className="v"><ValidBadge value={t.validation} /></div>
        <div className="k">Thời gian</div><div className="v">{fmtTime(t.timestamp)}</div>
        <div className="k">Người tạo (MSP)</div><div className="v">{t.creatorMSP || '—'}</div>
        <div className="k">Chaincode</div><div className="v"><CcBadge name={t.chaincode || t.type} /></div>
        <div className="k">Hàm gọi</div><div className="v">{t.function ? <span className="badge fn">{t.function}</span> : <span className="muted">—</span>}</div>
        <div className="k">Tham số (args)</div>
        <div className="v">
          {t.args && t.args.length ? (
            <ol className="mono" style={{ margin: 0, paddingLeft: 18 }}>
              {t.args.map((a, i) => <li key={i}>{a}</li>)}
            </ol>
          ) : <span className="muted">—</span>}
        </div>
        <div className="k">Endorser</div>
        <div className="v">
          {t.endorsers && t.endorsers.length ? (
            <span className="pill-list">{t.endorsers.map((e) => <span key={e} className="badge cc">{e}</span>)}</span>
          ) : <span className="muted">—</span>}
        </div>
      </div>
    </div>
  );
}
