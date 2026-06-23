import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import Layout from './Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import BlocksPage from './pages/BlocksPage.jsx';
import BlockPage from './pages/BlockPage.jsx';
import TxsPage from './pages/TxsPage.jsx';
import TxPage from './pages/TxPage.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/blocks" element={<BlocksPage />} />
          <Route path="/block/:number" element={<BlockPage />} />
          <Route path="/txs" element={<TxsPage />} />
          <Route path="/tx/:txid" element={<TxPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
