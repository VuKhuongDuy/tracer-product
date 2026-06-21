import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';

export default function Layout() {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const submit = (e) => {
    e.preventDefault();
    const txid = q.trim();
    if (txid) { navigate(`/tx/${encodeURIComponent(txid)}`); setQ(''); }
  };
  return (
    <>
      <header className="topbar">
        <div className="inner">
          <span className="brand">🔎 Fabric 3.x Explorer</span>
          <nav className="nav">
            <NavLink to="/" end>Tổng quan</NavLink>
            <NavLink to="/network">Mạng lưới</NavLink>
          </nav>
          <form className="search" onSubmit={submit}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tra cứu theo tx hash…" />
            <button type="submit">Tra cứu</button>
          </form>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </>
  );
}
