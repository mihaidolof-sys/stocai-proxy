// server.js - StocAI backend complet (24/7)
const express = require('express');
const fetch = require('node-fetch');
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
const H = () => ({ 'Authorization': `Bearer ${ES_TOKEN}`, 'Accept': 'application/json', 'Content-Type': 'application/json' });

// Detecteaza canalul de vanzare din comanda (mapare id-uri marketplace cunoscute)
const MARKETPLACE_NAMES = {
  '1': 'eMAG', '40': 'eMAG', '83': 'Trendyol', '36217': 'eMAG',
};
function detectChannel(o) {
  // Easy Sales foloseste campul 'marketplace' (TrendyolRO, Emag, PepitaRO, etc.)
  if (o.marketplace && typeof o.marketplace === 'string') return o.marketplace;
  // Fallback-uri
  const direct = o.marketplace_name || o.channel_name || o.sales_channel || o.account_name;
  if (direct && typeof direct === 'string') return direct;
  if (o.website && typeof o.website === 'string') return o.website;
  const mid = o.marketplace_id != null ? String(o.marketplace_id) : null;
  if (mid) return 'Marketplace ' + mid;
  return 'necunoscut';
}

// ---- Preia comenzi din Easy Sales (mai multe pagini) ----
async function fetchOrders(pages = 8) {
  let all = [];
  for (let p = 1; p <= pages; p++) {
    const r = await fetch(`${ES_BASE}/orders?page=${p}`, { headers: H() });
    if (!r.ok) break;
    const d = await r.json();
    const list = d.data || d.orders || (Array.isArray(d) ? d : []);
    if (!list.length) break;
    all = all.concat(list);
  }
  return all;
}

// ---- Sincronizare: scade comenzi noi, populeaza sales_log pentru predictie ----
async function sync() {
  if (!ES_TOKEN) { console.log('No ES_TOKEN'); return; }
  let orders;
  try { orders = await fetchOrders(8); }
  catch (e) { console.log('fetch err', e.message); return; }

  const firstRun = !(await db.getMeta('initialized'));
  const now = Date.now();
  let processed = 0;

  for (const o of orders) {
    const id = String(o.order_display_id || o.id || o.order_id);
    if (!id) continue;
    const kind = logic.classify(o.status);
    if (kind === 'ignore') continue;

    const products = logic.extractProducts(o);
    if (!products.length) continue;

    const rawDate = o.order_date || o.created_at || o.date || '';
    const t = Date.parse(rawDate);

    // Rezolva deducerile
    const deductions = {};
    let review = false;
    for (const p of products) {
      const { rules, review: r } = await logic.resolveProduct(p);
      if (r) review = true;
      for (const rule of rules) deductions[rule.key] = (deductions[rule.key] || 0) + rule.qty * p.qty;
    }

    if (kind === 'sale') {
      // Identifica canalul (eMAG/Trendyol/magazin) - incearca mai multe campuri
      const channel = detectChannel(o);
      const orderValue = parseFloat(o.total_value || o.value || 0) || 0;
      // valoarea pe unitate de stoc dedusa (proportional)
      const totalUnits = Object.values(deductions).reduce((a, b) => a + b, 0) || 1;

      // sales_log pentru predictie + business (toate vanzarile cu data valida, fara dubluri)
      if (!isNaN(t) && !(await db.isProcessed(id))) {
        for (const [k, v] of Object.entries(deductions)) {
          const valShare = +(orderValue * (v / totalUnits)).toFixed(2);
          await db.logSale(id, new Date(t).toISOString(), k, v, channel, valShare);
        }
      }

      if (await db.isProcessed(id)) continue;

      if (firstRun) {
        // Prima rulare: marcam tot ce exista ca deja contorizat (stocul actual le reflecta)
        await db.markProcessed(id, 'sale_initial', deductions);
        continue;
      }

      if (review) {
        await db.markProcessed(id, 'review', { products, deductions });
        continue; // nu scadem automat - asteapta verificare
      }

      // Scade din stoc
      for (const [k, v] of Object.entries(deductions)) {
        await db.adjustStock(k, -v);
        const st = db.SEED_STOCK[k];
        await db.addJournal('out', `CMD ${id} → ${st ? st.label : k}`, -v);
      }
      await db.markProcessed(id, 'sale', deductions);
      processed++;
    } else if (kind === 'return') {
      // Retururile NU se adauga automat - se marcheaza pentru decizie manuala
      if (!(await db.isProcessed(id))) {
        const value = parseFloat(o.total_value || o.value || 0) || 0;
        await db.markProcessed(id, 'return_pending', { products, deductions, value });
      }
    }
  }

  if (firstRun) {
    await db.setMeta('initialized', '1');
    await db.setMeta('init_date', new Date().toISOString());
    console.log('First run done - existing orders marked as counted');
  }
  await db.setMeta('last_sync', new Date().toISOString());
  if (processed) console.log(`Sync: ${processed} comenzi noi scazute`);
}

// ============ API pentru aplicatie ============
app.get('/test', (req, res) => res.json({ status: 'ok', ai: !!ANTHROPIC_KEY, es: !!ES_TOKEN, db: !!process.env.DATABASE_URL }));

// Situatia completa pentru dashboard
app.get('/state', async (req, res) => {
  try {
    const stock = await db.getStock();
    const vel = await db.getVelocity(30);
    const journal = await db.getJournal(40);
    const lastSync = await db.getMeta('last_sync');

    const stockWithPred = stock.map(s => {
      const sold30 = vel[s.key] || 0;
      const perDay = sold30 / 30;
      const daysLeft = perDay > 0 ? Math.floor(s.qty / perDay) : null;
      return { ...s, sold30, perDay: +perDay.toFixed(2), daysLeft };
    });

    res.json({ stock: stockWithPred, journal, lastSync });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Retururi in asteptare (cu valoare)
app.get('/returns', async (req, res) => {
  try {
    const { rows } = await db.pool.query(
      `SELECT order_id, detail, processed_at FROM processed_orders WHERE kind='return_pending' ORDER BY processed_at DESC LIMIT 80`
    );
    res.json({ returns: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Decizie retur: restock | olx | scrap
app.post('/return-decision', async (req, res) => {
  try {
    const { orderId, decision } = req.body; // decision: 'restock' | 'olx' | 'scrap'
    const oid = String(orderId);
    const { rows } = await db.pool.query('SELECT detail FROM processed_orders WHERE order_id=$1', [oid]);
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    const detail = rows[0].detail || {};
    const deductions = detail.deductions || {};
    const value = parseFloat(detail.value || 0) || 0;

    if (decision === 'restock') {
      // Produs bun -> inapoi in stoc
      for (const [k, v] of Object.entries(deductions)) {
        await db.adjustStock(k, v);
        const st = db.SEED_STOCK[k];
        await db.addJournal('in', `RETUR→STOC ${oid} → ${st ? st.label : k}`, v);
      }
    } else if (decision === 'olx') {
      // Revanzare OLX - NU intra in stocul principal, doar evidenta
      await db.addJournal('olx', `RETUR→OLX ${oid} (revanzare)`, 0);
    } else if (decision === 'scrap') {
      // Casare - pierdere cu valoare
      await db.addJournal('scrap', `RETUR→CASARE ${oid} (-${value.toFixed(2)} lei)`, 0);
    } else {
      return res.status(400).json({ error: 'decizie invalida' });
    }

    await db.pool.query(
      `INSERT INTO return_dispositions(order_id, decision, value_lei, detail)
       VALUES($1,$2,$3,$4) ON CONFLICT (order_id) DO UPDATE SET decision=$2, value_lei=$3, decided_at=now()`,
      [oid, decision, value, JSON.stringify(detail)]
    );
    await db.markRestocked(oid);
    await db.pool.query(`UPDATE processed_orders SET kind='return_done' WHERE order_id=$1`, [oid]);
    res.json({ ok: true, decision });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Raport casare + OLX
app.get('/reports', async (req, res) => {
  try {
    const scrap = await db.pool.query(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(value_lei),0)::numeric AS total FROM return_dispositions WHERE decision='scrap'`
    );
    const olx = await db.pool.query(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(value_lei),0)::numeric AS total FROM return_dispositions WHERE decision='olx'`
    );
    const restocked = await db.pool.query(
      `SELECT COUNT(*)::int AS n FROM return_dispositions WHERE decision='restock'`
    );
    const recentScrap = await db.pool.query(
      `SELECT order_id, value_lei, detail, decided_at FROM return_dispositions WHERE decision='scrap' ORDER BY decided_at DESC LIMIT 20`
    );
    const recentOlx = await db.pool.query(
      `SELECT order_id, detail, decided_at FROM return_dispositions WHERE decision='olx' ORDER BY decided_at DESC LIMIT 20`
    );
    res.json({
      scrap: { count: scrap.rows[0].n, valueLei: +scrap.rows[0].total },
      olx: { count: olx.rows[0].n, valueLei: +olx.rows[0].total },
      restocked: { count: restocked.rows[0].n },
      recentScrap: recentScrap.rows,
      recentOlx: recentOlx.rows
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Comenzi de verificat (AI nesigur)
app.get('/review', async (req, res) => {
  try {
    const { rows } = await db.pool.query(
      `SELECT order_id, detail, processed_at FROM processed_orders WHERE kind='review' ORDER BY processed_at DESC LIMIT 50`
    );
    res.json({ review: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Ajustare manuala stoc (NIR / corectie)
app.post('/adjust', async (req, res) => {
  try {
    const { key, delta, note } = req.body;
    await db.adjustStock(key, parseInt(delta));
    const st = db.SEED_STOCK[key];
    await db.addJournal(delta >= 0 ? 'in' : 'out', `${note || 'Ajustare manuală'} → ${st ? st.label : key}`, parseInt(delta));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// AI chat proxy (cu context stoc)
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

// Forteaza sync manual
app.post('/sync', async (req, res) => { await sync(); res.json({ ok: true }); });

// RESET sales_log si re-sincronizare (pentru a repopula canal+valoare corect)
app.post('/reset-sales', async (req, res) => {
  try {
    await db.pool.query('DELETE FROM sales_log');
    // Stergem marcajul de "procesat" doar pentru vanzari, ca sa reintre in sales_log
    // (NU atingem stocul - doar repopulam istoricul de analiza)
    await db.pool.query(`DELETE FROM processed_orders WHERE kind IN ('sale_initial')`);
    await db.setMeta('initialized', '');  // forteaza re-marcarea ca "initial" fara scadere
    await sync();
    res.json({ ok: true, msg: 'Sales resetate si resincronizate' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// METRICI DE BUSINESS - pentru dashboard si AI
app.get('/business', async (req, res) => {
  try {
    const [sum7, sum30, top30, channels30, daily30, prices, stock] = await Promise.all([
      db.getSalesSummary(7), db.getSalesSummary(30),
      db.getTopProducts(30, 10), db.getChannelStats(30),
      db.getDailyOrders(30), db.getAvgPrices(), db.getStock()
    ]);
    // Valoarea stocului = qty * pret mediu de vanzare
    let stockValue = 0;
    const stockValued = stock.map(s => {
      const price = prices[s.key] || 0;
      const val = +(s.qty * price).toFixed(2);
      stockValue += val;
      return { key: s.key, label: s.label, qty: s.qty, avgPrice: price, value: val };
    });
    // Adauga label la top produse
    const labelMap = {}; stock.forEach(s => labelMap[s.key] = s.label);
    const topLabeled = top30.map(t => ({ ...t, label: labelMap[t.key] || t.key }));

    res.json({
      sales7: sum7, sales30: sum30,
      topProducts: topLabeled,
      channels: channels30,
      daily: daily30,
      stockValue: +stockValue.toFixed(2),
      stockValued
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DIAGNOZA: arata structura unei comenzi reale (ca sa identific canalul)
app.get('/inspect', async (req, res) => {
  try {
    const orders = await fetchOrders(1);
    if (!orders.length) return res.json({ msg: 'nicio comanda' });
    const o = orders[0];
    // Extrage doar campurile relevante pentru canal/valoare
    const sample = {
      toate_cheile: Object.keys(o),
      marketplace_id: o.marketplace_id,
      marketplace: o.marketplace,
      website: o.website,
      channel: o.channel,
      sales_channel: o.sales_channel,
      account: o.account,
      account_name: o.account_name,
      value: o.value,
      total_value: o.total_value,
      order_date: o.order_date,
      status: o.status
    };
    // Statistica: ce valori de canal apar in toate comenzile
    const channels = {};
    const statuses = {};
    for (const ord of orders) {
      const ch = detectChannel(ord);
      channels[ch] = (channels[ch] || 0) + 1;
      const st = ord.status || 'fara_status';
      statuses[st] = (statuses[st] || 0) + 1;
    }
    res.json({ sample, channels_gasite: channels, statusuri_gasite: statuses });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- Pornire ----
const PORT = process.env.PORT || 3000;
db.init().then(() => {
  app.listen(PORT, () => console.log('StocAI server pornit pe', PORT));
  // Sync imediat + la fiecare 5 minute
  sync();
  setInterval(sync, 5 * 60 * 1000);
}).catch(e => console.error('DB init failed', e));
