import { useState } from 'react';
import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom';

export default function Layout() {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const submit = (e) => {
    e.preventDefault();
    const v = q.trim();
    if (!v) return;
    // Số -> tra cứu khối, còn lại -> tra cứu giao dịch.
    if (/^\d+$/.test(v)) navigate(`/block/${v}`);
    else navigate(`/tx/${encodeURIComponent(v)}`);
    setQ('');
  };
  return (
    <>
      <header className="topbar">
        <div className="inner">
          <Link to="/" className="brand">🔎 HANOI TRACE Explorer</Link>
          <nav className="nav">
            <NavLink to="/" end>Trang chủ</NavLink>
            <NavLink to="/blocks">Khối</NavLink>
            <NavLink to="/txs">Giao dịch</NavLink>
          </nav>
          <form className="search" onSubmit={submit}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo mã giao dịch / số khối…" />
            <button type="submit">Tìm</button>
          </form>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </>
  );
}
