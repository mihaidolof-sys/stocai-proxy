// db.js - PostgreSQL layer for StocAI
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Stocul fizic initial de baze (calculat din export-ul Easy Sales)
const SEED_STOCK = {
  bariere_200: { label: 'Bariere 200cm', qty: 0, color: '#38bdf8' },
  bariere_160: { label: 'Bariere 160cm', qty: 0, color: '#4ade80' },
  bariere_180: { label: 'Bariere 180cm', qty: 0, color: '#a78bfa' },
  bariere_140: { label: 'Bariere 140cm', qty: 0, color: '#fb923c' },
  scaune_gaming_negru_rosu: { label: 'Scaun Gaming Negru/Roșu', qty: 0, color: '#f472b6' },
  scaune_gaming_negru_albastru: { label: 'Scaun Gaming Negru/Albastru', qty: 0, color: '#34d399' },
  scaune_ergonomic_negru: { label: 'Scaun Birou Negru Ergonomic', qty: 0, color: '#94a3b8' },
  scaun_ergonomic_negru_inchis: { label: 'Scaun Ergonomic Negru Închis', qty: 0, color: '#475569' },
  scaune_ergonomic_gri: { label: 'Scaun Ergonomic Gri', qty: 0, color: '#64748b' },
  leagane_electrice: { label: 'Leagăn Electric Bebeluși', qty: 0, color: '#f472b6' },
  birou_maro: { label: 'Birou Scandinav Maro', qty: 59, color: '#a16207' },
  baby_monitor: { label: 'Baby Monitor Video', qty: 24, color: '#38bdf8' },
  sw_befit: { label: 'Smartwatch BeFIT', qty: 7, color: '#14b8a6' },
  masa_gradina_set: { label: 'Masă Grădină / Set Mobilier', qty: 20, color: '#65a30d' },
  microfon_lav: { label: 'Microfoane Lavalieră', qty: 10, color: '#e879f9' },
  tarc_180_simplu: { label: 'Țarc 150x180cm Simplu', qty: 0, color: '#fbbf24' },
  tarc_180_complet: { label: 'Țarc 180x150cm cu Covoraș+Bile', qty: 0, color: '#f59e0b' },
  tarc_120_simplu: { label: 'Țarc 120cm Simplu', qty: 0, color: '#d97706' },
  tarc_120_complet: { label: 'Țarc 120cm cu Covoraș+Bile', qty: 0, color: '#b45309' },
  p_X5: { label: 'Casti wireless audio Rohs® Bluetooth 5.0,', qty: 1, color: '#64748b' },
  p_TK_K802: { label: 'Monitor fetal Doppler pentru gravide, Dete', qty: 1, color: '#64748b' },
  p_LGHY_02442: { label: 'Aparat curatare cu ultrasunete, Polipropil', qty: 20, color: '#64748b' },
  p_3in1usbcable001: { label: 'Cablu incarcare rapida 3in1, Nylon, USB/Mi', qty: 32, color: '#64748b' },
  p_1098: { label: 'Suzeta pentru diversificarea alimentatiei', qty: 4, color: '#64748b' },
  p_Jv_cable_3pcs_white: { label: 'Pachet de 3 Cablu de date, incarcare compa', qty: 244, color: '#64748b' },
  p_09_WXMLTE: { label: 'Sonerie video inteligenta, SmartHOME RoHS', qty: 4, color: '#64748b' },
  p_SB55: { label: 'Ceas smartwatch RoHS®,UltraSLIM,Notificari', qty: 40, color: '#64748b' },
  p_SB39: { label: 'Sonerie inteligenta Spy® Pro Wifi cu camer', qty: 2, color: '#64748b' },
  p_Ro99: { label: 'Cablu date si incarcare rapida SuperFastCh', qty: 2, color: '#64748b' },
  p_Cam11: { label: 'Set - Camera auto dubla Full HD,BlackBox®,', qty: 1, color: '#64748b' },
  p_hub2: { label: 'Port HUB USB 3.0-NC-13, 5 GBps 4 Porturi,3', qty: 29, color: '#64748b' },
  p_safe10: { label: 'Scaun metalic de gradina pliant Rohs Home,', qty: 80, color: '#64748b' },
  p_9789739016568: { label: 'Ceas smartwatch si bratara fitness,RoHS®,', qty: 58, color: '#64748b' },
  p_safe345: { label: 'Scaun de masa HappyKID 4 pozitii inclinare', qty: 3, color: '#64748b' },
  p_safe490: { label: 'Ceas smartwatch si bratara fitness, RoHS®,', qty: 47, color: '#64748b' },
  p_safe545: { label: 'Router Wireless pentru cartela SIM 4G, 3in', qty: 231, color: '#64748b' },
  p_safe3411: { label: 'Camera auto de bord DVR duala RoHS® Safety', qty: 1, color: '#64748b' },
  p_safe123111: { label: 'Rucsac multifunctional 3 in 1, Rezistent l', qty: 499, color: '#64748b' },
  p_00205286: { label: 'Cablu Audio Hama, jack 3.5 mm, stereo, 1.5', qty: 3, color: '#64748b' },
  p_USB_AX55Nano: { label: 'Adaptor Wireless ASUS USB-AX55 Nano, AX180', qty: 7, color: '#64748b' },
  p_4719072698683: { label: 'Mousepad, MSI, cauciuc, negru/gri', qty: 29, color: '#64748b' },
  p_PCE_N15: { label: 'ASUS PCE-N15 Wireless-N300 Adapter, IEEE 8', qty: 27, color: '#64748b' },
  p_1243C002: { label: 'Toner Canon, Galben, 2.200 pagini', qty: 1, color: '#64748b' },
  p_00200708: { label: 'Cablu VGA Hama, Full HD 1080 p, 3 m', qty: 9, color: '#64748b' },
  p_4047443477019: { label: 'Geanta pentru laptop, 13,3-14,1, Negru', qty: 1, color: '#64748b' },
  p_00200707: { label: 'Cablu VGA Hama, Full HD 1080 p, 1.5 m', qty: 4, color: '#64748b' },
  p_Q6472A: { label: 'Toner HP Q6472A Galben', qty: 1, color: '#64748b' },
  p_HAMA_53050: { label: 'Surubelnita HAMA cu 7 biti, SL 2.0, 2.4, 3', qty: 1, color: '#64748b' },
  p_00200627: { label: 'Cablu micro-USB Hama USB 3.0, 5 Gbit/s, 1.', qty: 2, color: '#64748b' },
  p_BS0617B001AA: { label: 'Cartus Canon CL-41 Color', qty: 1, color: '#64748b' },
  p_P71_09032: { label: 'Licenta antivirus, Norton 360 pentru gamin', qty: 2, color: '#64748b' },
  p_HAMA_200348: { label: 'Adaptor HDMI Hama, Mufa Micro-HDMI ™ - Muf', qty: 3, color: '#64748b' },
  p_safe3233: { label: 'Ansamblu de joaca pentru pisici, HAPPYpets', qty: 2, color: '#64748b' },
  p_4007249541666: { label: 'Mousepad Velvet, Hama, Poliester, 22 x 18', qty: 3, color: '#64748b' },
  p_Rohs_5: { label: 'Birou Gaming ROHSpacer 120x60 cm, Blat Car', qty: 2, color: '#64748b' },
  p_Rohs_123211: { label: 'Birou Calculator 120x60x74cm, Design Moder', qty: 2, color: '#64748b' },
  p_rohs12332: { label: 'Birou pentru calculator cu raft HomeOFFICE', qty: 89, color: '#64748b' },
  p_ROHS1233: { label: 'Birou pentru calculator cu raft HomeOFFICE', qty: 54, color: '#64748b' },
  p_troler1: { label: 'Troler copii 2 în 1 cu rucsac inclus, mode', qty: 100, color: '#64748b' },
};

// Mapare SKU cunoscut -> reguli scadere
const SKU_MAP = {
  safe1: [{ key: 'bariere_200', qty: 1 }],
  '16177': [{ key: 'bariere_200', qty: 1 }],
  s1455: [{ key: 'bariere_200', qty: 1 }],
  'rohs-9': [{ key: 'bariere_160', qty: 1 }],
  safe2: [{ key: 'bariere_180', qty: 1 }],
  safe3: [{ key: 'bariere_140', qty: 1 }],
  set1: [{ key: 'bariere_200', qty: 2 }, { key: 'bariere_160', qty: 1 }],
  set2: [{ key: 'bariere_200', qty: 2 }, { key: 'bariere_180', qty: 1 }],
  set3: [{ key: 'bariere_200', qty: 3 }],
  set4: [{ key: 'bariere_200', qty: 2 }, { key: 'bariere_140', qty: 1 }],
  con1: [], Con2: [],
  'Rohs-99': [{ key: 'scaune_gaming_negru_rosu', qty: 1 }],
  safe67888: [{ key: 'scaune_gaming_negru_albastru', qty: 1 }],
  ExtremeRXBlue: [{ key: 'scaune_gaming_negru_albastru', qty: 1 }],
  safe334: [{ key: 'scaune_ergonomic_negru', qty: 1 }],
  SC221: [{ key: 'scaun_ergonomic_negru_inchis', qty: 1 }],
  scaun11: [{ key: 'scaune_ergonomic_negru', qty: 1 }],
  Sc111: [{ key: 'scaune_ergonomic_gri', qty: 1 }],
  'leagan-1': [{ key: 'leagane_electrice', qty: 1 }],
  'Sb190': [{ key: 'leagane_electrice', qty: 1 }],
  'Happy1': [{ key: 'leagane_electrice', qty: 1 }],
  'Rohs122113': [{ key: 'birou_maro', qty: 1 }],
  'Sku14567': [{ key: 'birou_maro', qty: 1 }],
  'Sb123': [{ key: 'baby_monitor', qty: 1 }],
  'Rohs11': [{ key: 'baby_monitor', qty: 1 }],
  '1999': [{ key: 'sw_befit', qty: 1 }],
  'Sb59': [{ key: 'sw_befit', qty: 1 }],
  'Masa12': [{ key: 'masa_gradina_set', qty: 1 }],
  'sb123455': [{ key: 'masa_gradina_set', qty: 1 }],
  's131': [{ key: 'microfon_lav', qty: 1 }],
  'safe312': [{ key: 'microfon_lav', qty: 1 }],
  'X5': [{ key: 'p_X5', qty: 1 }],
  'TK-K802': [{ key: 'p_TK_K802', qty: 1 }],
  'LGHY-02442': [{ key: 'p_LGHY_02442', qty: 1 }],
  '3in1usbcable001': [{ key: 'p_3in1usbcable001', qty: 1 }],
  '1098': [{ key: 'p_1098', qty: 1 }],
  'Jv-cable-3pcs-white': [{ key: 'p_Jv_cable_3pcs_white', qty: 1 }],
  '09-WXMLTE': [{ key: 'p_09_WXMLTE', qty: 1 }],
  'SB55': [{ key: 'p_SB55', qty: 1 }],
  'SB39': [{ key: 'p_SB39', qty: 1 }],
  'Ro99': [{ key: 'p_Ro99', qty: 1 }],
  'Cam11': [{ key: 'p_Cam11', qty: 1 }],
  'hub2': [{ key: 'p_hub2', qty: 1 }],
  'safe10': [{ key: 'p_safe10', qty: 1 }],
  '9789739016568': [{ key: 'p_9789739016568', qty: 1 }],
  'safe345': [{ key: 'p_safe345', qty: 1 }],
  'safe567': [{ key: 'tarc_180_simplu', qty: 1 }],
  'safe490': [{ key: 'p_safe490', qty: 1 }],
  'safe545': [{ key: 'p_safe545', qty: 1 }],
  'safe3411': [{ key: 'p_safe3411', qty: 1 }],
  'safe123111': [{ key: 'p_safe123111', qty: 1 }],
  '00205286': [{ key: 'p_00205286', qty: 1 }],
  'USB-AX55Nano': [{ key: 'p_USB_AX55Nano', qty: 1 }],
  '4719072698683': [{ key: 'p_4719072698683', qty: 1 }],
  'PCE-N15': [{ key: 'p_PCE_N15', qty: 1 }],
  '1243C002': [{ key: 'p_1243C002', qty: 1 }],
  '00200708': [{ key: 'p_00200708', qty: 1 }],
  '4047443477019': [{ key: 'p_4047443477019', qty: 1 }],
  '00200707': [{ key: 'p_00200707', qty: 1 }],
  'Q6472A': [{ key: 'p_Q6472A', qty: 1 }],
  'HAMA-53050': [{ key: 'p_HAMA_53050', qty: 1 }],
  '00200627': [{ key: 'p_00200627', qty: 1 }],
  'BS0617B001AA': [{ key: 'p_BS0617B001AA', qty: 1 }],
  'P71-09032': [{ key: 'p_P71_09032', qty: 1 }],
  'HAMA-200348': [{ key: 'p_HAMA_200348', qty: 1 }],
  'safe3233': [{ key: 'p_safe3233', qty: 1 }],
  '4007249541666': [{ key: 'p_4007249541666', qty: 1 }],
  'Rohs-5': [{ key: 'p_Rohs_5', qty: 1 }],
  'Rohs-123211': [{ key: 'p_Rohs_123211', qty: 1 }],
  'rohs12332': [{ key: 'p_rohs12332', qty: 1 }],
  'ROHS1233': [{ key: 'p_ROHS1233', qty: 1 }],
  'tarc2': [{ key: 'tarc_180_complet', qty: 1 }],
  'tarc3': [{ key: 'tarc_120_simplu', qty: 1 }],
  'tarc33': [{ key: 'tarc_120_complet', qty: 1 }],
  'troler1': [{ key: 'p_troler1', qty: 1 }],
};

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock (
      key TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      qty INTEGER NOT NULL,
      color TEXT
    );
    CREATE TABLE IF NOT EXISTS processed_orders (
      order_id TEXT PRIMARY KEY,
      processed_at TIMESTAMPTZ DEFAULT now(),
      kind TEXT,
      detail JSONB
    );
    CREATE TABLE IF NOT EXISTS restocked_returns (
      order_id TEXT PRIMARY KEY,
      restocked_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS learned_skus (
      sku TEXT PRIMARY KEY,
      rules JSONB NOT NULL,
      learned_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS journal (
      id SERIAL PRIMARY KEY,
      ts TIMESTAMPTZ DEFAULT now(),
      type TEXT,
      descr TEXT,
      qty INTEGER
    );
    CREATE TABLE IF NOT EXISTS stock_adjustments (
      id SERIAL PRIMARY KEY,
      stock_key TEXT NOT NULL,
      delta INTEGER NOT NULL,
      note TEXT,
      ts TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS meta (
      k TEXT PRIMARY KEY,
      v TEXT
    );
    CREATE TABLE IF NOT EXISTS sales_log (
      id SERIAL PRIMARY KEY,
      order_id TEXT,
      sold_at TIMESTAMPTZ,
      stock_key TEXT,
      qty INTEGER,
      channel TEXT,
      value_lei NUMERIC DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS return_dispositions (
      order_id TEXT PRIMARY KEY,
      decision TEXT,            -- 'restock' | 'olx' | 'scrap' | 'pending'
      value_lei NUMERIC DEFAULT 0,
      detail JSONB,
      decided_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  // Migrari sigure (daca tabelul exista deja fara coloanele noi)
  await pool.query(`ALTER TABLE sales_log ADD COLUMN IF NOT EXISTS channel TEXT;`).catch(()=>{});
  await pool.query(`ALTER TABLE sales_log ADD COLUMN IF NOT EXISTS value_lei NUMERIC DEFAULT 0;`).catch(()=>{});
  // Index unic: previne duplicate la nivel de DB
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS sales_log_uniq ON sales_log(order_id, stock_key);`).catch(()=>{});

  // Seed stock daca tabelul e gol
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM stock');
  if (rows[0].n === 0) {
    for (const [key, s] of Object.entries(SEED_STOCK)) {
      await pool.query('INSERT INTO stock(key,label,qty,color) VALUES($1,$2,$3,$4)', [key, s.label, s.qty, s.color]);
    }
    console.log('Stock seeded');
  }
}

async function getStock() {
  const { rows } = await pool.query('SELECT * FROM stock ORDER BY key');
  return rows;
}

async function adjustStock(key, delta) {
  await pool.query('UPDATE stock SET qty = GREATEST(0, qty + $1) WHERE key=$2', [delta, key]);
}

async function isProcessed(orderId) {
  const { rows } = await pool.query('SELECT 1 FROM processed_orders WHERE order_id=$1', [String(orderId)]);
  return rows.length > 0;
}

async function markProcessed(orderId, kind, detail) {
  await pool.query(
    'INSERT INTO processed_orders(order_id,kind,detail) VALUES($1,$2,$3) ON CONFLICT (order_id) DO NOTHING',
    [String(orderId), kind, detail ? JSON.stringify(detail) : null]
  );
}

async function isRestocked(orderId) {
  const { rows } = await pool.query('SELECT 1 FROM restocked_returns WHERE order_id=$1', [String(orderId)]);
  return rows.length > 0;
}

async function markRestocked(orderId) {
  await pool.query('INSERT INTO restocked_returns(order_id) VALUES($1) ON CONFLICT DO NOTHING', [String(orderId)]);
}

async function getLearned(sku) {
  const { rows } = await pool.query('SELECT rules FROM learned_skus WHERE sku=$1', [sku]);
  return rows.length ? rows[0].rules : null;
}

async function saveLearned(sku, rules) {
  await pool.query(
    'INSERT INTO learned_skus(sku,rules) VALUES($1,$2) ON CONFLICT (sku) DO UPDATE SET rules=$2',
    [sku, JSON.stringify(rules)]
  );
}

async function addJournal(type, descr, qty) {
  await pool.query('INSERT INTO journal(type,descr,qty) VALUES($1,$2,$3)', [type, descr, qty]);
}

async function getJournal(limit = 50) {
  const { rows } = await pool.query('SELECT * FROM journal ORDER BY id DESC LIMIT $1', [limit]);
  return rows;
}

async function logSale(orderId, soldAt, key, qty, channel, valueLei) {
  // Previne duplicate: daca aceasta combinatie order+stock_key exista deja, nu mai adauga
  const { rows } = await pool.query(
    'SELECT 1 FROM sales_log WHERE order_id=$1 AND stock_key=$2', [String(orderId), key]
  );
  if (rows.length > 0) return; // deja logat
  await pool.query(
    'INSERT INTO sales_log(order_id,sold_at,stock_key,qty,channel,value_lei) VALUES($1,$2,$3,$4,$5,$6)',
    [String(orderId), soldAt, key, qty, channel || 'necunoscut', valueLei || 0]
  );
}

// Consum pe ultimele N zile pentru predictie
async function getVelocity(days = 30) {
  const { rows } = await pool.query(
    `SELECT stock_key, COALESCE(SUM(qty),0)::int AS total
     FROM sales_log WHERE sold_at >= now() - ($1 || ' days')::interval
     GROUP BY stock_key`, [days]
  );
  const map = {};
  rows.forEach(r => map[r.stock_key] = r.total);
  return map;
}

async function getMeta(k) {
  const { rows } = await pool.query('SELECT v FROM meta WHERE k=$1', [k]);
  return rows.length ? rows[0].v : null;
}

async function setMeta(k, v) {
  await pool.query('INSERT INTO meta(k,v) VALUES($1,$2) ON CONFLICT (k) DO UPDATE SET v=$2', [k, String(v)]);
}

// ====== METRICI DE BUSINESS (din comenzile reale) ======

// Sumar vanzari pe interval: nr comenzi, valoare totala, valoare medie
async function getSalesSummary(days) {
  const { rows } = await pool.query(
    `SELECT COUNT(DISTINCT order_id)::int AS orders,
            COALESCE(SUM(value_lei),0)::numeric AS revenue
     FROM (SELECT DISTINCT order_id, value_lei FROM sales_log
           WHERE sold_at >= now() - ($1||' days')::interval) t`, [days]
  );
  const orders = rows[0].orders;
  const revenue = +rows[0].revenue;
  return { days, orders, revenue, avgOrder: orders ? +(revenue/orders).toFixed(2) : 0 };
}

// Top produse dupa bucati si valoare
async function getTopProducts(days, limit = 10) {
  const { rows } = await pool.query(
    `SELECT stock_key, SUM(qty)::int AS units, COALESCE(SUM(value_lei),0)::numeric AS revenue
     FROM sales_log WHERE sold_at >= now() - ($1||' days')::interval
     GROUP BY stock_key ORDER BY units DESC LIMIT $2`, [days, limit]
  );
  return rows.map(r => ({ key: r.stock_key, units: r.units, revenue: +r.revenue }));
}

// Vanzari pe canal
async function getChannelStats(days) {
  const { rows } = await pool.query(
    `SELECT channel, COUNT(DISTINCT order_id)::int AS orders, COALESCE(SUM(value_lei),0)::numeric AS revenue
     FROM sales_log WHERE sold_at >= now() - ($1||' days')::interval
     GROUP BY channel ORDER BY revenue DESC`, [days]
  );
  return rows.map(r => ({ channel: r.channel, orders: r.orders, revenue: +r.revenue }));
}

// Comenzi pe zi (pentru tendinta)
async function getDailyOrders(days) {
  const { rows } = await pool.query(
    `SELECT DATE(sold_at) AS day, COUNT(DISTINCT order_id)::int AS orders, COALESCE(SUM(value_lei),0)::numeric AS revenue
     FROM sales_log WHERE sold_at >= now() - ($1||' days')::interval
     GROUP BY DATE(sold_at) ORDER BY day`, [days]
  );
  return rows.map(r => ({ day: r.day, orders: r.orders, revenue: +r.revenue }));
}

// Pret mediu de vanzare per produs (pentru valoarea stocului)
async function getAvgPrices() {
  const { rows } = await pool.query(
    `SELECT stock_key, CASE WHEN SUM(qty)>0 THEN SUM(value_lei)/SUM(qty) ELSE 0 END AS avg_price
     FROM sales_log GROUP BY stock_key`
  );
  const map = {};
  rows.forEach(r => map[r.stock_key] = +(+r.avg_price).toFixed(2));
  return map;
}

// Sumar pe LUNA CALENDARISTICA curenta - bulletproof
async function getMonthSummary() {
  const { rows } = await pool.query(
    `SELECT COUNT(DISTINCT order_id)::int AS orders,
            COALESCE(SUM(value_lei),0)::numeric AS revenue
     FROM sales_log
     WHERE sold_at >= date_trunc('month', now())`
  );
  const orders = rows[0].orders, revenue = +rows[0].revenue;
  return { orders, revenue, avgOrder: orders ? +(revenue/orders).toFixed(2) : 0 };
}

// Vanzari pe zi in luna curenta
async function getDailyThisMonth() {
  const { rows } = await pool.query(
    `SELECT DATE(sold_at) AS day, COUNT(DISTINCT order_id)::int AS orders, COALESCE(SUM(value_lei),0)::numeric AS revenue
     FROM sales_log WHERE sold_at >= date_trunc('month', now())
     GROUP BY DATE(sold_at) ORDER BY day`
  );
  return rows.map(r => ({ day: r.day, orders: r.orders, revenue: +r.revenue }));
}

// Top produse luna curenta
async function getTopProductsMonth(limit = 10) {
  const { rows } = await pool.query(
    `SELECT stock_key, SUM(qty)::int AS units, COALESCE(SUM(value_lei),0)::numeric AS revenue
     FROM sales_log WHERE sold_at >= date_trunc('month', now())
     GROUP BY stock_key ORDER BY units DESC LIMIT $1`, [limit]
  );
  return rows.map(r => ({ key: r.stock_key, units: r.units, revenue: +r.revenue }));
}

// Canale luna curenta
async function getChannelStatsMonth() {
  const { rows } = await pool.query(
    `SELECT channel, COUNT(DISTINCT order_id)::int AS orders, COALESCE(SUM(value_lei),0)::numeric AS revenue
     FROM sales_log WHERE sold_at >= date_trunc('month', now())
     GROUP BY channel ORDER BY revenue DESC`
  );
  return rows.map(r => ({ channel: r.channel, orders: r.orders, revenue: +r.revenue }));
}

// Ajustari NIR (se adauga PESTE stocul din Easy Sales)
async function addAdjustment(stockKey, delta, note) {
  await pool.query('INSERT INTO stock_adjustments(stock_key, delta, note) VALUES($1,$2,$3)', [stockKey, delta, note || 'NIR']);
  await addJournal(delta >= 0 ? 'nir' : 'corectie', `${note || 'NIR'} → ${stockKey}`, delta);
}

// Total ajustari per categorie
async function getAdjustments() {
  const { rows } = await pool.query('SELECT stock_key, COALESCE(SUM(delta),0)::int AS total FROM stock_adjustments GROUP BY stock_key');
  const map = {};
  rows.forEach(r => map[r.stock_key] = r.total);
  return map;
}

module.exports = {
  pool, init, SEED_STOCK, SKU_MAP,
  getStock, adjustStock, isProcessed, markProcessed,
  isRestocked, markRestocked, getLearned, saveLearned,
  addJournal, getJournal, logSale, getVelocity, getMeta, setMeta,
  getSalesSummary, getTopProducts, getChannelStats, getDailyOrders, getAvgPrices,
  getMonthSummary, getDailyThisMonth, getTopProductsMonth, getChannelStatsMonth,
  addAdjustment, getAdjustments
};
