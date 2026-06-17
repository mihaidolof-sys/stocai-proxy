const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, anthropic-version');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const ES_TOKEN        = process.env.ES_TOKEN;
const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY;
const ES_API_BASE     = 'https://easy-sales.com/api/v2';

// Test
app.get('/test', (req, res) => {
  res.json({ status: 'ok', message: 'StocAI Proxy functional!' });
});

// Easy Sales - comenzi
app.get('/orders', async (req, res) => {
  try {
    const resp = await fetch(`${ES_API_BASE}/orders`, {
      headers: {
        'Authorization': `Bearer ${ES_TOKEN}`,
        'Accept': 'application/json'
      }
    });
    const data = await resp.json();
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Anthropic AI proxy
app.post('/ai', async (req, res) => {
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });
    const data = await resp.json();
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(process.env.PORT || 3000, () => console.log('StocAI Proxy pornit!'));
