import { Link } from 'react-router-dom';

export const shortHash = (h, n = 14) => (h ? `${h.slice(0, n)}…${h.slice(-6)}` : '—');
export const fmtTime = (t) => (t ? new Date(t).toLocaleString('vi-VN') : '—');

// ago: thời gian tương đối kiểu "x phút trước".
export function ago(t) {
  if (!t) return '';
  const s = Math.max(0, Math.floor((Date.now() - new Date(t).getTime()) / 1000));
  if (s < 60) return `${s} giây trước`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.floor(h / 24)} ngày trước`;
}

export function StatusBadge({ status }) {
  const ok = status === 'Success';
  return <span className={`badge ${ok ? 'valid' : 'invalid'}`}>{ok ? '✓ Thành công' : '✗ Thất bại'}</span>;
}

// Ánh xạ nhãn kỹ thuật -> tên tiếng Việt thân thiện cho người xem (lãnh đạo, demo).
const ACTOR_LABELS = {
  farmerA: 'Nông dân A (HTX Đắk Lắk)',
  farmerB: 'Nông dân B (HTX Đắk Lắk)',
  htxStaff: 'Cán bộ HTX',
  regulator: 'Cơ quan quản lý (Bộ NN&PTNT)',
  retailer: 'Siêu thị / Bán lẻ',
};
const CONTRACT_LABELS = { produce: 'Hệ thống Truy xuất nông sản' };
const METHOD_LABELS = {
  CreateLot: 'Tạo lô',
  TransferCustody: 'Chuyển giao',
  AddCertification: 'Cấp chứng nhận',
  RecallLot: 'Thu hồi',
  ReadLot: 'Đọc lô',
  GetAllLots: 'Xem tất cả lô',
  GetLotProvenance: 'Truy vết nguồn gốc',
  QueryLotsByOwner: 'Tra lô theo chủ',
};
export const actorLabel = (cn) => ACTOR_LABELS[cn] || cn || '—';
export const contractLabel = (name) => CONTRACT_LABELS[name] || name || '—';
export const methodLabel = (m) => METHOD_LABELS[m] || m;

export function MethodBadge({ method }) {
  if (!method) return <span className="muted">—</span>;
  return <span className="badge fn">{methodLabel(method)}</span>;
}

// FromTo: cặp người gửi → người nhận/contract, kiểu danh sách tx của BSCscan.
export function FromTo({ from, to }) {
  return (
    <span className="fromto">
      <span className="party">{actorLabel(from)}</span>
      <span className="arrow">→</span>
      <span className="party">{contractLabel(to)}</span>
    </span>
  );
}

export const TxLink = ({ txid }) => <Link to={`/tx/${txid}`} className="hash">{shortHash(txid, 18)}</Link>;
export const BlockLink = ({ n }) => <Link to={`/block/${n}`}>{n}</Link>;
