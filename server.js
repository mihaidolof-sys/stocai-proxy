// server.js - StocAI FINAL CORECT
// Stoc: gestionat de NOI (seed initial + NIR-uri). Easy Sales = doar sursa de comenzi.
// Cand intra o comanda noua -> identificam produsul (SKU/cuvinte cheie/AI) -> SCADEM din stocul nostru.
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

// ============ EASY SALES - DOAR COMENZI ============
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

const RECENT_WINDOW_DAYS = 2; // doar comenzile din ultimele 2 zile se scad automat din stoc

// ============ SINCRONIZARE ============
async function sync() {
  if (!ES_TOKEN) { console.log('No ES_TOKEN'); return; }
  try {
    const orders = await fetchOrders();
    console.log(`Fetched ${orders.length} orders`);
    const firstRun = !(await db.getMeta('initialized'));
    const now = Date.now();
    let autoProcessed = 0;

    for (const o of orders) {
      const id = String(o.order_display_id || o.id || '');
      if (!id) continue;
      const deliveryStatus = o.delivery_status?.description || o.delivery_status?.value || (o.shipments && o.shipments[0] && o.shipments[0].delivery_status && o.shipments[0].delivery_status.description) || '';
      const kind = logic.classify(o.status, deliveryStatus);
      if (kind === 'ignore') continue;

      const rawDate = o.order_date || o.created_at || '';
      const t = Date.parse(rawDate);
      if (isNaN(t)) continue;

      const channel = o.marketplace || 'necunoscut';
      const orderValue = parseFloat(o.value || 0) || 0;
      const products = logic.extractProducts(o);
      if (!products.length) continue;

      // Rezolva deducerile pentru fiecare produs din comanda
      const deductions = {};
      let review = false;
      for (const p of products) {
        const { rules, review: r } = await logic.resolveProduct(p);
        if (r) review = true;
        for (const rule of rules) deductions[rule.key] = (deductions[rule.key] || 0) + rule.qty * p.qty;
      }
      const totalUnits = Object.values(deductions).reduce((a,b)=>a+b, 0) || 1;

      if (kind === 'sale') {
        // Logheaza pentru business/predictii (idempotent, doar o data per order+produs)
        if (!(await db.isProcessed(id))) {
          for (const [k, v] of Object.entries(deductions)) {
            const valShare = +(orderValue * v / totalUnits).toFixed(2);
            await db.logSale(id, new Date(t).toISOString(), k, v, channel, valShare);
          }
        }

        if (await db.isProcessed(id)) continue;

        const isRecent = (now - t) <= RECENT_WINDOW_DAYS * 86400000;

        if (firstRun || !isRecent) {
          // Comanda veche - stocul initial deja o reflecta. Marcam procesata FARA sa scadem.
          await db.markProcessed(id, 'sale_baseline', null);
          continue;
        }

        if (review) {
          await db.markProcessed(id, 'review', { products, deductions, channel, value: orderValue, date: new Date(t).toISOString() });
          continue; // necesita verificare manuala, nu scade automat
        }

        // SCADE din stocul nostru
        for (const [k, v] of Object.entries(deductions)) {
          await db.adjustStock(k, -v);
          const st = db.SEED_STOCK[k] || { label: k };
          await db.addJournal('out', `CMD ${id} → ${st.label}`, -v);
        }
        await db.markProcessed(id, 'sale', { products, deductions, channel, value: orderValue, date: new Date(t).toISOString() });
        autoProcessed++;

      } else if (kind === 'return') {
        if (firstRun) {
          await db.markProcessed(id, 'return_old', null);
          continue;
        }
        if (!(await db.isProcessed(id))) {
          await db.markProcessed(id, 'return_pending', { products, deductions, value: orderValue });
        }
      }
    }

    if (firstRun) {
      await db.setMeta('initialized', '1');
      console.log('First run: comenzi existente marcate ca baseline (stocul initial le reflecta deja)');
    }
    await db.setMeta('last_sync', new Date().toISOString());
    if (autoProcessed) console.log(`${autoProcessed} comenzi noi procesate, stoc scazut`);
  } catch(e) { console.error('Sync error:', e.message); }
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

// NIR / Ajustare manuala stoc (singura cale de a modifica stocul, in afara de vanzari)
app.post('/adjust', async (req, res) => {
  try {
    const { key, delta, note } = req.body;
    if (!key || delta === undefined) return res.status(400).json({ error: 'key si delta sunt obligatorii' });
    await db.adjustStock(key, parseInt(delta));
    const st = db.SEED_STOCK[key] || { label: key };
    await db.addJournal(parseInt(delta) >= 0 ? 'nir' : 'corectie', `${note || 'NIR'} → ${st.label}`, parseInt(delta));
    res.json({ ok: true });
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

// Comenzi recente procesate (vanzari) - ultimele N, cu detalii
app.get('/recent-orders', async (req, res) => {
  try {
    const { rows } = await db.pool.query(
      `SELECT order_id, kind, detail, processed_at FROM processed_orders
       WHERE kind IN ('sale','review') ORDER BY processed_at DESC LIMIT 60`
    );
    res.json({ orders: rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/returns', async (req, res) => {
  try {
    const { rows } = await db.pool.query(`SELECT order_id, detail, processed_at FROM processed_orders WHERE kind='return_pending' ORDER BY processed_at DESC LIMIT 80`);
    res.json({ returns: rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/review', async (req, res) => {
  try {
    const { rows } = await db.pool.query(`SELECT order_id, detail, processed_at FROM processed_orders WHERE kind='review' ORDER BY processed_at DESC LIMIT 50`);
    res.json({ review: rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/return-decision', async (req, res) => {
  try {
    const { orderId, decision } = req.body; // 'restock' | 'olx' | 'scrap'
    const oid = String(orderId);
    const { rows } = await db.pool.query('SELECT detail FROM processed_orders WHERE order_id=$1', [oid]);
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    const detail = rows[0].detail || {};
    const deductions = detail.deductions || {};
    const value = parseFloat(detail.value || 0) || 0;

    if (decision === 'restock') {
      for (const [k, v] of Object.entries(deductions)) {
        await db.adjustStock(k, v);
        const st = db.SEED_STOCK[k] || { label: k };
        await db.addJournal('in', `RETUR→STOC ${oid} → ${st.label}`, v);
      }
    } else if (decision === 'olx') {
      await db.addJournal('olx', `RETUR→OLX ${oid}`, 0);
    } else if (decision === 'scrap') {
      await db.addJournal('scrap', `RETUR→CASARE ${oid} (-${value.toFixed(2)} lei)`, 0);
    } else {
      return res.status(400).json({ error: 'decizie invalida' });
    }

    await db.pool.query(
      `INSERT INTO return_dispositions(order_id,decision,value_lei,detail) VALUES($1,$2,$3,$4)
       ON CONFLICT(order_id) DO UPDATE SET decision=$2,value_lei=$3,decided_at=now()`,
      [oid, decision, value, JSON.stringify(detail)]
    );
    await db.pool.query(`UPDATE processed_orders SET kind='return_done' WHERE order_id=$1`, [oid]);
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

// Curatare completa: reseteaza stocul la baseline, sterge istoricul, resincronizeaza
app.post('/clean', async (req, res) => {
  try {
    await db.pool.query('DELETE FROM sales_log');
    await db.pool.query('DELETE FROM processed_orders');
    await db.pool.query('DELETE FROM journal');
    await db.pool.query('DELETE FROM return_dispositions');
    await db.pool.query('DROP INDEX IF EXISTS sales_log_uniq');
    await db.pool.query('CREATE UNIQUE INDEX sales_log_uniq ON sales_log(order_id, stock_key)');
    // Reseteaza stocul la valorile din SEED_STOCK
    for (const [key, s] of Object.entries(db.SEED_STOCK)) {
      const exists = await db.pool.query('SELECT 1 FROM stock WHERE key=$1', [key]);
      if (exists.rows.length) await db.pool.query('UPDATE stock SET qty=$1 WHERE key=$2', [s.qty, key]);
      else await db.pool.query('INSERT INTO stock(key,label,qty,color) VALUES($1,$2,$3,$4)', [key, s.label, s.qty, s.color]);
    }
    await db.setMeta('initialized', '');
    await sync();
    const check = await db.pool.query(`SELECT COUNT(DISTINCT order_id)::int AS orders, COALESCE(SUM(value_lei),0)::numeric AS total FROM sales_log WHERE sold_at >= date_trunc('month', now())`);
    res.json({ ok:true, juneOrders:check.rows[0].orders, juneRevenue:+check.rows[0].total });
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
    const orders = await fetchOrders(3);
    const stock = await db.getStock();
    const statuses = {}, channels = {}, deliveryStatuses = {};
    orders.forEach(o => {
      statuses[o.status||'?'] = (statuses[o.status||'?']||0)+1;
      const ch = o.marketplace || '?';
      channels[ch] = (channels[ch]||0)+1;
      // Verifica AWB/delivery status (poate fi diferit de status-ul comenzii)
      const ds = o.delivery_status?.description || o.delivery_status?.value || (o.shipments && o.shipments[0] && o.shipments[0].delivery_status && o.shipments[0].delivery_status.description);
      if (ds) deliveryStatuses[ds] = (deliveryStatuses[ds]||0)+1;
    });
    const sampleWithDelivery = orders.find(o => o.delivery_status || (o.shipments && o.shipments[0]));
    res.json({
      ordersLoaded: orders.length, statuses, channels, deliveryStatuses, stockItems: stock.length,
      sampleOrder: orders[0] ? { id: orders[0].order_display_id, status: orders[0].status, marketplace: orders[0].marketplace, value: orders[0].value } : null,
      sampleDeliveryStatus: sampleWithDelivery ? { order: sampleWithDelivery.order_display_id, delivery_status: sampleWithDelivery.delivery_status, shipment_delivery: sampleWithDelivery.shipments?.[0]?.delivery_status, cancel_request: sampleWithDelivery.cancel_request } : null
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
db.init().then(() => {
  app.listen(PORT, () => console.log('StocAI pe port', PORT));
  sync();
  setInterval(sync, 5 * 60 * 1000);
}).catch(e => console.error('DB init failed', e));
