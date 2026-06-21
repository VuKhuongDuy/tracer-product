// Biểu đồ cột số tx theo block, tự vẽ bằng SVG (không thêm thư viện).
export default function TxChart({ data }) {
  if (!data || !data.length) return <p className="muted">Chưa có dữ liệu.</p>;
  const W = 100, H = 100, pad = 4;
  const max = Math.max(1, ...data.map((d) => d.txCount));
  const bw = (W - pad * 2) / data.length;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <line className="axis" x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} />
      {data.map((d, i) => {
        const h = ((H - pad * 2) * d.txCount) / max;
        return (
          <rect
            key={d.number}
            x={pad + i * bw + bw * 0.1}
            y={H - pad - h}
            width={bw * 0.8}
            height={h}
          >
            <title>Block #{d.number}: {d.txCount} tx</title>
          </rect>
        );
      })}
    </svg>
  );
}
