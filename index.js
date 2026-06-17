const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const ES_CLIENT_ID     = process.env.ES_CLIENT_ID;
const ES_CLIENT_SECRET = process.env.ES_CLIENT_SECRET;
const ES_API_BASE      = 'https://app.easy-sales.net/api';

async function getToken() {
  const resp = await fetch(`${ES_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: ES_CLIENT_ID,
      client_secret: ES_CLIENT_SECRET
    })
  });
  const data = await resp.json();
  return data.access_token;
}

app.get('/test', (req, res) => {
  res.json({ status: 'ok', message: 'StocAI Proxy functional!' });
});

app.get('/orders', async (req, res) => {
  try {
    const token = await getToken();
    const resp = await fetch(`${ES_API_BASE}/v1/orders?status=new&limit=50`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await resp.json();
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(process.env.PORT || 3000, () => console.log('StocAI Proxy pornit!'));
