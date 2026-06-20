const j = async (r) => {
  if (!r.ok) {
    const text = await r.text();
    try { return JSON.parse(text); } catch { throw new Error(text || r.statusText); }
  }
  return r.json();
};
const post = (url, body) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(j);

export const getIdentities = () => fetch('/api/identities').then(j);
export const getLots = (as) => fetch(`/api/lots?as=${encodeURIComponent(as)}`).then(j);
export const getLot = (id, as) => fetch(`/api/lots/${encodeURIComponent(id)}?as=${encodeURIComponent(as)}`).then(j);
export const getTrace = (id) => fetch(`/api/trace/${encodeURIComponent(id)}`).then(j);
export const getQr = (id) => fetch(`/api/qrcode/${encodeURIComponent(id)}`).then(j);
export const createLot = (body) => post('/api/lots', body);
export const transferLot = (id, body) => post(`/api/lots/${encodeURIComponent(id)}/transfer`, body);
export const certifyLot = (id, body) => post(`/api/lots/${encodeURIComponent(id)}/certify`, body);
export const recallLot = (id, body) => post(`/api/lots/${encodeURIComponent(id)}/recall`, body);
