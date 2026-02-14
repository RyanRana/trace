import React, { useState, useEffect, useRef } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
  ReferenceLine,
} from 'recharts';

const API = (typeof import.meta !== 'undefined' && import.meta.env?.DEV)
  ? 'http://localhost:3001/api'
  : '/api';

async function parseJsonResponse(r) {
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const text = await r.text();
    if (text.trimStart().startsWith('<!')) {
      throw new Error('Server returned HTML instead of JSON. Is the shop-agent API running on port 3001?');
    }
    throw new Error(r.ok ? 'Invalid response format' : `API error ${r.status}`);
  }
  return r.json();
}

async function apiGet(path) {
  const r = await fetch(`${API}${path}`);
  return parseJsonResponse(r);
}

function SearchBar({ value, onChange, placeholder }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = Math.min(ref.current.scrollHeight, 200) + 'px';
  }, [value]);
  return (
    <textarea
      ref={ref}
      className="search-bar"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={2}
    />
  );
}

function Dashboard() {
  const [forecast, setForecast] = useState({ products: [], horizon: 30 });
  const [series, setSeries] = useState({ products: [], days: 90 });
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [horizon, setHorizon] = useState(30);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiGet(`/dashboard/forecast?horizon=${horizon}&days_back=90`),
      apiGet('/dashboard/series?days=90'),
    ])
      .then(([f, s]) => {
        setForecast(f);
        setSeries(s);
        if (!selectedProduct && s.products?.length) setSelectedProduct(s.products[0].asin);
      })
      .catch((e) => setForecast({ products: [], error: e.message }))
      .finally(() => setLoading(false));
  }, [horizon]);

  const forecastProduct = forecast.products?.find((p) => p.asin === selectedProduct) || forecast.products?.[0];
  const seriesProduct = series.products?.find((p) => p.asin === selectedProduct) || series.products?.[0];

  const chartData = [];
  let lastHistoricalDate = null;
  if (seriesProduct?.series?.length) {
    seriesProduct.series.forEach((p) => {
      lastHistoricalDate = p.date;
      chartData.push({
        date: p.date.slice(5, 10),
        actual: p.quantity_on_hand,
        forecast: null,
      });
    });
  }
  if (forecastProduct?.forecast?.length && lastHistoricalDate) {
    const base = new Date(lastHistoricalDate + 'T12:00:00');
    forecastProduct.forecast.forEach((v, k) => {
      const d = new Date(base);
      d.setDate(d.getDate() + k + 1);
      chartData.push({
        date: d.toISOString().slice(5, 10),
        actual: null,
        forecast: v,
      });
    });
  }

  if (loading) return <div className="card">Loading dashboard…</div>;
  if (forecast.error) return <div className="card" style={{ color: 'var(--red)' }}>{forecast.error}</div>;

  return (
    <div className="dashboard">
      <h2>Inventory &amp; Forecasting</h2>
      <p className="sub">Holt double exponential smoothing (level + trend). Forecast horizon: {horizon} days.</p>

      <div className="card dashboard-controls">
        <label>Product</label>
        <select
          value={selectedProduct || ''}
          onChange={(e) => setSelectedProduct(e.target.value)}
          className="dashboard-select"
        >
          {(forecast.products || []).map((p) => (
            <option key={p.asin} value={p.asin}>{p.product_name}</option>
          ))}
        </select>
        <label style={{ marginLeft: '1rem' }}>Forecast horizon (days)</label>
        <input
          type="number"
          min="7"
          max="90"
          value={horizon}
          onChange={(e) => setHorizon(Number(e.target.value) || 30)}
          style={{ width: '60px', marginLeft: '0.5rem' }}
        />
      </div>

      <div className="card dashboard-chart-wrap">
        <h3>Stock level: actual vs forecast</h3>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #333)" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--muted)" />
            <Tooltip
              contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
              labelStyle={{ color: 'var(--text)' }}
            />
            <Legend />
            <ReferenceLine
              y={forecastProduct?.reorder_point}
              stroke="var(--red, #f44336)"
              strokeDasharray="4 4"
              label={{ value: 'Reorder point', position: 'right', fill: 'var(--red)' }}
            />
            <Area type="monotone" dataKey="actual" name="Actual stock" stroke="var(--accent, #0a7ea4)" fill="var(--accent)" fillOpacity={0.3} />
            <Line type="monotone" dataKey="forecast" name="Forecast" stroke="var(--green, #4caf50)" strokeDasharray="4 4" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="card dashboard-insights">
        <h3>Forecasting insights</h3>
        <p className="meta" style={{ marginBottom: '1rem' }}>Model: {forecastProduct?.model ?? 'Holt (level + trend)'}</p>
        <div className="insight-grid">
          {(forecast.products || []).map((p) => (
            <div key={p.asin} className="insight-card">
              <strong>{p.product_name}</strong>
              <div className="insight-row"><span>Current level</span><span>{p.last_quantity}</span></div>
              <div className="insight-row"><span>Trend (units/day)</span><span style={{ color: p.trend < 0 ? 'var(--red)' : 'var(--green)' }}>{p.trend?.toFixed(2) ?? '—'}</span></div>
              <div className="insight-row"><span>Reorder point</span><span>{p.reorder_point || '—'}</span></div>
              <div className="insight-row"><span>Days until reorder</span><span className={p.days_until_reorder != null ? 'warning' : ''}>{p.days_until_reorder != null ? p.days_until_reorder : '—'}</span></div>
              <div className="insight-row"><span>Forecast (day {forecast.horizon})</span><span>{p.forecast?.[forecast.horizon - 1] ?? '—'}</span></div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>All products: level &amp; trend</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Last qty</th>
                <th>Trend</th>
                <th>Reorder pt</th>
                <th>Days to reorder</th>
              </tr>
            </thead>
            <tbody>
              {(forecast.products || []).map((p) => (
                <tr key={p.asin}>
                  <td>{p.product_name}</td>
                  <td>{p.category}</td>
                  <td>{p.last_quantity}</td>
                  <td style={{ color: p.trend < 0 ? 'var(--red)' : 'var(--green)' }}>{(p.trend ?? 0).toFixed(2)}/day</td>
                  <td>{p.reorder_point ?? '—'}</td>
                  <td className={p.days_until_reorder != null ? 'warning' : ''}>{p.days_until_reorder != null ? p.days_until_reorder : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('shop');
  const [prompt, setPrompt] = useState('');
  const [fundsSource, setFundsSource] = useState('crypto');
  const [fundsAmount, setFundsAmount] = useState('200');
  const [inventory, setInventory] = useState({ snapshotDate: '', products: [] });
  const [recommendation, setRecommendation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiGet('/inventory')
      .then(setInventory)
      .catch((e) => setInventory({ snapshotDate: '', products: [], error: e.message }));
  }, []);

  const [forecastDays, setForecastDays] = useState('30');

  const runRecommend = () => {
    setError(null);
    setRecommendation(null);
    setLoading(true);
    fetch(`${API}/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: prompt.trim() || 'Suggest restock based on current inventory.',
        fundsCrypto: fundsAmount,
        forecastHorizon: parseInt(forecastDays) || 30,
      }),
    })
      .then((r) => parseJsonResponse(r))
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setRecommendation(data);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  return (
    <div className="app">
      <h1>Shop Agent</h1>
      <div className="app-tabs">
        <button type="button" className={activeTab === 'shop' ? 'active' : ''} onClick={() => setActiveTab('shop')}>Shop</button>
        <button type="button" className={activeTab === 'dashboard' ? 'active' : ''} onClick={() => setActiveTab('dashboard')}>Dashboard</button>
      </div>

      {activeTab === 'dashboard' ? (
        <Dashboard />
      ) : (
        <>
      <p className="sub">Add funds, attach live inventory, and get a transparent buy list. Money is converted to crypto and controlled by the agent.</p>

      <div className="card search-wrap">
        <label>What should the agent buy? (prompt)</label>
        <SearchBar
          value={prompt}
          onChange={setPrompt}
          placeholder="e.g. Restock headphones and cables for the holiday rush"
        />
      </div>

      <div className="card funds-wrap">
        <label>Add funds</label>
        <div className="funds-tabs">
          <button
            type="button"
            className={fundsSource === 'card' ? 'active' : ''}
            onClick={() => setFundsSource('card')}
          >
            Card
          </button>
          <button
            type="button"
            className={fundsSource === 'crypto' ? 'active' : ''}
            onClick={() => setFundsSource('crypto')}
          >
            Crypto
          </button>
        </div>
        <div className="funds-row">
          <input
            type="text"
            inputMode="decimal"
            placeholder="Amount (USD)"
            value={fundsAmount}
            onChange={(e) => setFundsAmount(e.target.value)}
          />
        </div>
        <p className="funds-note">Converted to crypto — the agent controls this balance for purchasing.</p>
        <div className="funds-row" style={{ marginTop: '0.5rem' }}>
          <label style={{ fontSize: '0.85rem', marginRight: '0.5rem' }}>Forecast horizon</label>
          <input
            type="number"
            min="1"
            max="365"
            placeholder="Days"
            value={forecastDays}
            onChange={(e) => setForecastDays(e.target.value)}
            style={{ width: '80px' }}
          />
          <span style={{ fontSize: '0.85rem', marginLeft: '0.5rem', opacity: 0.7 }}>days</span>
        </div>
      </div>

      <div className="card inventory-wrap">
        <h3>Live inventory (attached)</h3>
        <p className="sub" style={{ marginBottom: '0.5rem' }}>
          Snapshot: {inventory.snapshotDate || 'Loading…'} · {inventory.products?.length ?? 0} products
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ASIN</th>
                <th>Product</th>
                <th>Category</th>
                <th>Qty on hand</th>
                <th>List price</th>
              </tr>
            </thead>
            <tbody>
              {(inventory.products || []).map((p) => (
                <tr key={p.asin}>
                  <td>{p.asin}</td>
                  <td>{p.product_name}</td>
                  <td>{p.category}</td>
                  <td>{p.quantity_on_hand}</td>
                  <td>${Number(p.list_price).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <button
          type="button"
          className="btn-recommend"
          onClick={runRecommend}
          disabled={loading}
        >
          {loading ? 'Getting recommendation…' : 'Get agent recommendation'}
        </button>
      </div>

      {error && <div className="card" style={{ color: 'var(--red)' }}>{error}</div>}

      {recommendation && (
        <>
          <div className="card result-wrap">
            <h3>WebShop Results & Cost Breakdown</h3>
            <p className="meta source-badge">
              {recommendation.source === 'grok' ? 'Powered by Grok' : recommendation.source === 'webshop' ? 'Found via WebShop search' : 'Rule-based fallback (Grok unavailable)'}
              {recommendation.llmError && (
                <span className="llm-error"> — {recommendation.llmError}</span>
              )}
            </p>
            <div className="reasoning">{recommendation.recommendation?.reasoning ?? '—'}</div>

            <div className="table-wrap" style={{ marginTop: '1rem' }}>
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>ASIN</th>
                    <th>Qty</th>
                    <th>Unit Price</th>
                    <th>Line Total</th>
                    <th>Link</th>
                  </tr>
                </thead>
                <tbody>
                  {(recommendation.recommendation?.items ?? []).map((item, i) => (
                    <tr key={i}>
                      <td>
                        <strong>{item.product_name}</strong>
                        <div className="item-reason" style={{ fontSize: '0.8rem', opacity: 0.7 }}>{item.reason}</div>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{item.asin}</td>
                      <td>{Number(item.quantity).toLocaleString()}</td>
                      <td>${Number(item.unit_price).toFixed(2)}</td>
                      <td><strong>${(item.quantity * item.unit_price).toFixed(2)}</strong></td>
                      <td>
                        {item.link && (
                          <a href={item.link} target="_blank" rel="noopener noreferrer" className="item-link">View</a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border, #333)', fontWeight: 'bold' }}>
                    <td colSpan={4} style={{ textAlign: 'right' }}>Estimated Total:</td>
                    <td>${(recommendation.totalCost ?? (recommendation.recommendation?.items ?? []).reduce((s, i) => s + i.quantity * i.unit_price, 0)).toFixed(2)}</td>
                    <td></td>
                  </tr>
                  <tr style={{ opacity: 0.7 }}>
                    <td colSpan={4} style={{ textAlign: 'right' }}>Budget:</td>
                    <td>${Number(fundsAmount || 0).toFixed(2)}</td>
                    <td></td>
                  </tr>
                  <tr style={{ color: (Number(fundsAmount) - (recommendation.totalCost ?? 0)) >= 0 ? 'var(--green, #4caf50)' : 'var(--red, #f44336)' }}>
                    <td colSpan={4} style={{ textAlign: 'right' }}>Remaining:</td>
                    <td>${(Number(fundsAmount) - (recommendation.totalCost ?? 0)).toFixed(2)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
        </>
      )}
    </div>
  );
}
