import { Link } from 'react-router-dom';

export const shortHash = (h, n = 10) => (h ? `${h.slice(0, n)}…${h.slice(-6)}` : '—');
export const fmtTime = (t) => (t ? new Date(t).toLocaleString('vi-VN') : '—');

export function CcBadge({ name }) {
  if (!name) return <span className="muted">—</span>;
  const sys = name.startsWith('_');
  return <span className={`badge ${sys ? 'sys' : 'cc'}`}>{name}</span>;
}

export function ValidBadge({ value }) {
  const ok = value === 'VALID';
  return <span className={`badge ${ok ? 'valid' : 'invalid'}`}>{value}</span>;
}

export const TxLink = ({ txid }) => <Link to={`/tx/${txid}`} className="hash">{shortHash(txid, 12)}</Link>;
export const BlockLink = ({ n }) => <Link to={`/block/${n}`}>#{n}</Link>;
