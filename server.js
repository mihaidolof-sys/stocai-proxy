// server.js - StocAI FINAL
// Stocul fizic de baze: citit initial din Easy Sales products API, apoi scazut din comenzi
// Business: din comenzi (venituri, canale, top produse)
// Predictii: din istoricul de vanzari
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const db = require('./db');
const logic = require('./logic');

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
const H = () => ({ 'Authorization': `Bearer ${ES_TOKEN}`, 'Accept': 'application/json' });

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public-dashboard.html')));
app.get('/test', (req, res) => res.json({ status: 'ok', ai: !!ANTHROPIC_KEY, es: !!ES_TOKEN, db: !!process.env.DATABASE_URL }));

// ============ EASY SALES API ============
async function fetchProducts() {
  let all = [];
  for (let p = 1; p <= 30; p++) {
    const r = await fetch(`${ES_BASE}/products?per_page=100&page=${p}`, { headers: H() });
    if (!r.ok) break;
    const d = await r.json();
    const list = d.data || (Array.isArray(d) ? d : []);
    if (!list.length) break;
    all = all.concat(list);
    if (list.length < 100) break;
  }
  return all;
}

async function fetchOrders(maxPages) {
  let all = [], prevId = null;
  for (let p = 1; p <= (maxPages||120); p++) {
    const r = await fetch(`${ES_BASE}/orders?page=${p}`, { headers: H() });
    if (!r.ok) break;
    const d = await r.json();
    const list = d.data || d.orders || (Array.isArray(d) ? d : []);
    if (!list.length) break;
    const fid = String(list[0].id||'');
    if (fid && fid === prevId) break;
    prevId = fid;
    all = all.concat(list);
  }
  return all;
}

// ============ CALCUL STOC FIZIC DIN PRODUSE EASY SALES ============
// Citeste produsele din ES si calculeaza stocul fizic de baze
// Ex: "Set 2x200+1x160" cu stoc 285 = 570 bariere fizice 200cm + 285 bariere 160cm
async function computePhysicalStock() {
  const products = await fetchProducts();
  console.log(`Fetched ${products.length} products`);
  
  const physical = {};
  // Initializeaza categoriile cunoscute
  for (const key of Object.keys(db.SEED_STOCK)) {
    physical[key] = { label: db.SEED_STOCK[key].label, qty: 0, color: db.SEED_STOCK[key].color };
  }
  
  for (const p of products) {
    const sku = p.sku || '';
    const name = p.name || '';
    const stock = parseInt(p.stock) || 0;
    if (stock <= 0) continue;
    
    // Ce reguli de compozitie are acest produs?
    let rules = db.SKU_MAP[sku];
    if (!rules) {
      const learned = await db.getLearned(sku);
      if (learned) rules = learned;
    }
    if (!rules) {
      const kw = logic.inferFromName(name);
      if (kw.length) rules = kw;
    }
    
    if (rules && rules.length > 0) {
      // Produs compus sau mapat: inmulteste stocul ES cu multiplicatorul
      for (const rule of rules) {
        if (!physical[rule.key]) {
          physical[rule.key] = { label: rule.key, qty: 0, color: '#64748b' };
        }
        physical[rule.key].qty += stock * rule.qty;
      }
    } else if (stock > 0) {
      // Produs simplu nemapat: creeaza categorie proprie
      const autoKey = 'p_' + sku.replace(/[^a-zA-Z0-9]/g, '_');
      if (!physical[autoKey]) {
        physical[autoKey] = { label: name.substring(0, 50), qty: 0, color: '#64748b' };
      }
      physical[autoKey].qty += stock;
    }
  }
  
  return physical;
}

// ============ SINCRONIZARE ============
async function sync() {
  if (!ES_TOKEN) { console.log('No ES_TOKEN'); return; }
  
  // 1. STOC: calculeaza din produse Easy Sales
  try {
    const physical = await computePhysicalStock();
    for (const [key, s] of Object.entries(physical)) {
      const exists = await db.pool.query('SELECT 1 FROM stock WHERE key=$1', [key]);
      if (exists.rows.length) {
        await db.pool.query('UPDATE stock SET qty=$1, label=$2, color=$3 WHERE key=$4', [s.qty, s.label, s.color, key]);
      } else {
        await db.pool.query('INSERT INTO stock(key,label,qty,color) VALUES($1,$2,$3,$4)', [key, s.label, s.qty, s.color]);
      }
    }
    await db.setMeta('last_stock_sync', new Date().toISOString());
    console.log('Stock synced from Easy Sales');
  } catch(e) { console.error('Stock sync error:', e.message); }
  
  // 2. COMENZI: pentru business metrics
  try {
    const orders = await fetchOrders();
    console.log(`Fetched ${orders.length} orders`);
    
    for (const o of orders) {
      const id = String(o.order_display_id || o.id || '');
      if (!id) continue;
      const kind = logic.classify(o.status);
      if (kind === 'ignore') continue;
      
      const rawDate = o.order_date || o.created_at || '';
      const t = Date.parse(rawDate);
      if (isNaN(t)) continue;
      
      const channel = o.marketplace || 'necunoscut';
      const orderValue = parseFloat(o.value || 0) || 0;
      const products = logic.extractProducts(o);
      if (!products.length) continue;
      
      if (kind === 'sale') {
        const deductions = {};
        for (const p of products) {
          const { rules } = await logic.resolveProduct(p);
          for (const rule of rules) {
            deductions[rule.key] = (deductions[rule.key] || 0) + rule.qty * p.qty;
          }
        }
        const totalUnits = Object.values(deductions).reduce((a,b)=>a+b, 0) || 1;
        for (const [k, v] of Object.entries(deductions)) {
          const valShare = +(orderValue * v / totalUnits).toFixed(2);
          await db.logSale(id, new Date(t).toISOString(), k, v, channel, valShare);
        }
      } else if (kind === 'return') {
        if (!(await db.isProcessed(id))) {
          await db.markProcessed(id, 'return_pending', { products, value: parseFloat(o.value||0)||0 });
        }
      }
    }
    await db.setMeta('last_sync', new Date().toISOString());
  } catch(e) { console.error('Orders sync error:', e.message); }
}

// ============ API DASHBOARD ============
app.get('/state', async (req, res) => {
  try {
    const stock = await db.getStock();
    const vel = await db.getVelocity(30);
    const lastSync = await db.getMeta('last_sync');
    const stockWithPred = stock.map(s => {
      const sold30 = vel[s.key] || 0;
      const perDay = sold30 / 30;
      const daysLeft = perDay > 0 ? Math.floor(s.qty / perDay) : null;
      return { ...s, sold30, perDay: +perDay.toFixed(2), daysLeft };
    });
    res.json({ stock: stockWithPred, lastSync });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/business', async (req, res) => {
  try {
    const [month, daily, topMonth, channelsMonth, sum7, prices, stock] = await Promise.all([
      db.getMonthSummary(), db.getDailyThisMonth(),
      db.getTopProductsMonth(10), db.getChannelStatsMonth(),
      db.getSalesSummary(7), db.getAvgPrices(), db.getStock()
    ]);
    let stockValue = 0;
    const stockValued = stock.map(s => {
      const price = prices[s.key] || 0;
      const val = +(s.qty * price).toFixed(2);
      stockValue += val;
      return { ...s, avgPrice: price, value: val };
    });
    const labelMap = {}; stock.forEach(s => labelMap[s.key] = s.label);
    const topLabeled = topMonth.map(t => ({ ...t, label: labelMap[t.key] || t.key }));
    res.json({ monthName: new Date().toLocaleDateString('ro-RO',{month:'long',year:'numeric'}), month, sales7: sum7, daily, topProducts: topLabeled, channels: channelsMonth, stockValue: +stockValue.toFixed(2) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/returns', async (req, res) => {
  try {
    const { rows } = await db.pool.query(`SELECT order_id, detail, processed_at FROM processed_orders WHERE kind='return_pending' ORDER BY processed_at DESC LIMIT 80`);
    res.json({ returns: rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/return-decision', async (req, res) => {
  try {
    const { orderId, decision } = req.body;
    const { rows } = await db.pool.query('SELECT detail FROM processed_orders WHERE order_id=$1', [String(orderId)]);
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    const value = parseFloat((rows[0].detail||{}).value || 0) || 0;
    await db.addJournal(decision, `RETUR ${decision} ${orderId}`, 0);
    await db.pool.query(`INSERT INTO return_dispositions(order_id,decision,value_lei,detail) VALUES($1,$2,$3,$4) ON CONFLICT(order_id) DO UPDATE SET decision=$2,value_lei=$3,decided_at=now()`, [String(orderId), decision, value, JSON.stringify(rows[0].detail)]);
    await db.pool.query(`UPDATE processed_orders SET kind='return_done' WHERE order_id=$1`, [String(orderId)]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/reports', async (req, res) => {
  try {
    const scrap = await db.pool.query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(value_lei),0)::numeric AS total FROM return_dispositions WHERE decision='scrap'`);
    const olx = await db.pool.query(`SELECT COUNT(*)::int AS n FROM return_dispositions WHERE decision='olx'`);
    const restocked = await db.pool.query(`SELECT COUNT(*)::int AS n FROM return_dispositions WHERE decision='restock'`);
    res.json({ scrap:{count:scrap.rows[0].n, valueLei:+scrap.rows[0].total}, olx:{count:olx.rows[0].n, valueLei:0}, restocked:{count:restocked.rows[0].n} });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Curatare + resync complet
app.post('/clean', async (req, res) => {
  try {
    await db.pool.query('DELETE FROM sales_log');
    await db.pool.query('DELETE FROM processed_orders');
    await db.pool.query('DELETE FROM journal');
    await db.pool.query('DROP INDEX IF EXISTS sales_log_uniq');
    await db.pool.query('CREATE UNIQUE INDEX sales_log_uniq ON sales_log(order_id, stock_key)');
    await sync();
    const check = await db.pool.query(`SELECT COUNT(DISTINCT order_id)::int AS orders, COALESCE(SUM(value_lei),0)::numeric AS total FROM sales_log WHERE sold_at >= date_trunc('month', now())`);
    const stock = await db.getStock();
    res.json({ ok:true, juneOrders:check.rows[0].orders, juneRevenue:+check.rows[0].total, stockItems:stock.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/sync', async (req, res) => { await sync(); res.json({ ok: true }); });

app.post('/ai', async (req, res) => {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST', headers:{'Content-Type':'application/json','x-api-key':ANTHROPIC_KEY,'anthropic-version':'2023-06-01'},
      body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/inspect', async (req, res) => {
  try {
    const products = await fetchProducts();
    const physical = await computePhysicalStock();
    const topPhysical = Object.entries(physical).sort((a,b)=>b[1].qty-a[1].qty).slice(0,15).map(([k,v])=>({key:k, label:v.label, qty:v.qty}));
    res.json({ totalESProducts: products.length, withStock: products.filter(p=>(parseInt(p.stock)||0)>0).length, physicalCategories: Object.keys(physical).length, topPhysicalStock: topPhysical });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
db.init().then(() => {
  app.listen(PORT, () => console.log('StocAI FINAL pe port', PORT));
  sync();
  setInterval(sync, 5 * 60 * 1000);
}).catch(e => console.error('DB init failed', e));
