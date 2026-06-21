const j = async (r) => {
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { throw new Error(text || r.statusText); }
  if (!r.ok) throw new Error(body.error || r.statusText);
  return body;
};

export const getChain = () => fetch('/api/chain').then(j);
export const getBlocks = (count = 20) => fetch(`/api/blocks?count=${count}`).then(j);
export const getBlock = (n) => fetch(`/api/blocks/${n}`).then(j);
export const getTx = (txid) => fetch(`/api/tx/${encodeURIComponent(txid)}`).then(j);
export const getTxs = (count = 15) => fetch(`/api/txs?count=${count}`).then(j);
export const getStats = (count = 20) => fetch(`/api/stats?count=${count}`).then(j);
export const getNetwork = () => fetch('/api/network').then(j);
