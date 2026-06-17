const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const ES_TOKEN = process.env.ES_TOKEN;
const ES_API_BASE = 'https://easy-sales.com/api/v1';

app.get('/test', (req, res) => {
  res.json({ status: 'ok', message: 'StocAI Proxy functional!' });
});

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

app.listen(process.env.PORT || 3000);
