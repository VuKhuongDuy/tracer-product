import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import Layout from './Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import BlockPage from './pages/BlockPage.jsx';
import TxPage from './pages/TxPage.jsx';
import NetworkPage from './pages/NetworkPage.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/block/:number" element={<BlockPage />} />
          <Route path="/tx/:txid" element={<TxPage />} />
          <Route path="/network" element={<NetworkPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
