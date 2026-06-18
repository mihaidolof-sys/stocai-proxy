const express = require('express');
const fetch = require('node-fetch');
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const ES_TOKEN = process.env.ES_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ES_BASE = 'https://easy-sales.com/api/v2';
const H = () => ({ 'Authorization': `Bearer ${ES_TOKEN}`, 'Accept': 'application/json', 'Content-Type': 'application/json' });

app.get('/test', (req, res) => res.json({ status: 'ok', ai: !!ANTHROPIC_KEY, es: !!ES_TOKEN }));

// Comenzi - pagina curenta (comenzi noi)
app.get('/orders', async (req, res) => {
  try {
    const r = await fetch(`${ES_BASE}/orders`, { headers: H() });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Istoric - mai multe pagini pentru predictie (ultimele ~N pagini)
app.get('/history', async (req, res) => {
  try {
    const pages = Math.min(parseInt(req.query.pages) || 5, 15);
    let all = [];
    for (let p = 1; p <= pages; p++) {
      const r = await fetch(`${ES_BASE}/orders?page=${p}`, { headers: H() });
      if (!r.ok) break;
      const d = await r.json();
      const list = d.data || d.orders || (Array.isArray(d) ? d : []);
      if (!list.length) break;
      all = all.concat(list);
    }
    res.json({ data: all });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// AI proxy
app.post('/ai', async (req, res) => {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(process.env.PORT || 3000, () => console.log('StocAI Proxy v3 OK'));
