/**
 * Minimal WebShop search API (no Python/Flask deps).
 * Run from WebShop-master: node search_server.js
 * Serves GET /api/search?q=... using data/tech_products.json.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.WEBSHOP_PORT) || 3000;
const DATA_PATH = path.join(__dirname, 'data', 'tech_products.json');
const SESSION_ID = 'shop_agent';

function search(queryStr) {
  let products = [];
  try {
    products = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  } catch (e) {
    return [];
  }
  const q = (queryStr || '').toLowerCase().trim();
  const words = q ? q.split(/\s+/).filter((w) => w.length > 1) : [];
  const scored = products.map((p) => {
    const name = (p.name || '').toLowerCase();
    const category = (p.category || '').toLowerCase();
    const query = (p.query || '').toLowerCase();
    const text = [name, category, query].join(' ');
    const score = words.length ? words.filter((w) => text.includes(w)).length : 1;
    return { score, p };
  });
  scored.sort((a, b) => b.score - a.score || (a.p.asin > b.p.asin ? 1 : -1));
  return scored
    .filter((x) => x.score > 0)
    .slice(0, 20)
    .map(({ p }) => ({
      asin: p.asin || '',
      product_name: p.name || '',
      price: Number(p.list_price) || 0,
      category: p.category || '',
      link: null, // set per-request with base URL
    }));
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  if (url.pathname === '/api/search') {
    const query = url.searchParams.get('q') || '';
    const results = search(query);
    const host = req.headers.host || `localhost:${PORT}`;
    const base = `http://${host}`.replace(/\/$/, '');
    const encoded = encodeURIComponent(query || '');
    const out = results.map((r) => ({
      ...r,
      link: `${base}/item_page/${SESSION_ID}/${r.asin}/${encoded}/1/{}`,
    }));
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ results: out, query }));
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`WebShop search API: http://localhost:${PORT}`);
  console.log('  GET /api/search?q=...');
});
