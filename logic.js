// logic.js - rezolvare produse + procesare comenzi
const fetch = require('node-fetch');
const db = require('./db');

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// Cuvinte cheie -> reguli (fallback inainte de AI)
function inferFromName(name) {
  name = (name || '').toLowerCase();
  const r = [];
  
  // BARIERE PAT - verificam sa contina "bariera/bariere/pat/protectie" + dimensiunea
  const isBarrier = name.includes('barier') || name.includes('protectie pat') || name.includes('protecție pat') || name.includes('baby bear');
  if (isBarrier || name.includes('set') && (name.includes('200') || name.includes('160') || name.includes('180') || name.includes('140'))) {
    if (name.includes('3x200') || name.includes('3 x 200')) { r.push({ key: 'bariere_200', qty: 3 }); }
    else if (name.includes('2x200') && name.includes('160')) { r.push({ key: 'bariere_200', qty: 2 }); r.push({ key: 'bariere_160', qty: 1 }); }
    else if (name.includes('2x200') && name.includes('180')) { r.push({ key: 'bariere_200', qty: 2 }); r.push({ key: 'bariere_180', qty: 1 }); }
    else if (name.includes('2x200') && name.includes('140')) { r.push({ key: 'bariere_200', qty: 2 }); r.push({ key: 'bariere_140', qty: 1 }); }
    else if (name.includes('200')) r.push({ key: 'bariere_200', qty: 1 });
    else if (name.includes('160')) r.push({ key: 'bariere_160', qty: 1 });
    else if (name.includes('180')) r.push({ key: 'bariere_180', qty: 1 });
    else if (name.includes('140')) r.push({ key: 'bariere_140', qty: 1 });
  }
  
  // SCAUNE GAMING
  if (name.includes('gaming') && !name.includes('birou gaming')) {
    if (name.includes('albastr') || name.includes('blue')) r.push({ key: 'scaune_gaming_negru_albastru', qty: 1 });
    else if (name.includes('rosu') || name.includes('roșu') || name.includes('red')) r.push({ key: 'scaune_gaming_negru_rosu', qty: 1 });
    else r.push({ key: 'scaune_gaming_negru_albastru', qty: 1 });
  }
  
  // SCAUNE ERGONOMICE / BIROU
  if (r.length === 0 && (name.includes('ergonomic') || (name.includes('scaun') && name.includes('birou')))) {
    if (name.includes('negru inchis') || name.includes('negru închis') || name.includes('dark')) r.push({ key: 'scaun_ergonomic_negru_inchis', qty: 1 });
    else if (name.includes('gri') || name.includes('grey') || name.includes('gray')) r.push({ key: 'scaune_ergonomic_gri', qty: 1 });
    else r.push({ key: 'scaune_ergonomic_negru', qty: 1 });
  }
  
  // LEAGANE ELECTRICE
  if (r.length === 0 && (name.includes('leagan') || name.includes('leagăn')) && (name.includes('electric') || name.includes('bebelus') || name.includes('bebeluș'))) {
    r.push({ key: 'leagane_electrice', qty: 1 });
  }
  
  // BABY MONITOR
  if (r.length === 0 && (name.includes('baby monitor') || name.includes('monitor bebe') || (name.includes('monitor') && name.includes('video') && name.includes('bebe')))) {
    r.push({ key: 'baby_monitor', qty: 1 });
  }
  
  // BIROU SCANDINAV
  if (r.length === 0 && (name.includes('birou') && (name.includes('scandinav') || name.includes('homeoffice') || name.includes('home office') || name.includes('calculator')))) {
    if (name.includes('maro') && name.includes('dark')) r.push({ key: 'birou_maro_dark', qty: 1 });
    else if (name.includes('maro')) r.push({ key: 'birou_maro', qty: 1 });
    else if (name.includes('alb')) r.push({ key: 'birou_alb', qty: 1 });
  }
  
  // TARC DE JOACA
  if (r.length === 0 && (name.includes('tarc') || name.includes('țarc')) && name.includes('joaca')) {
    r.push({ key: 'p_safe567', qty: 1 });  // default tarc
  }
  
  // MICROFON LAVALIERA
  if (r.length === 0 && name.includes('microfon') && (name.includes('lavalier') || name.includes('wireless') || name.includes('2 in 1'))) {
    r.push({ key: 'microfon_lav', qty: 1 });
  }
  
  // ROUTER 4G
  if (r.length === 0 && name.includes('router') && (name.includes('4g') || name.includes('sim'))) {
    r.push({ key: 'p_safe545', qty: 1 });
  }
  
  // TROLER COPII
  if (r.length === 0 && name.includes('troler') && name.includes('copii')) {
    r.push({ key: 'p_troler1', qty: 1 });
  }
  
  // RUCSAC
  if (r.length === 0 && name.includes('rucsac') && (name.includes('multifunctional') || name.includes('business') || name.includes('laptop'))) {
    r.push({ key: 'p_safe123111', qty: 1 });
  }
  
  return r;
}

async function askAI(name, sku) {
  if (!ANTHROPIC_KEY) return null;
  try {
    const keys = Object.keys(db.SEED_STOCK).map(k => `${k} = ${db.SEED_STOCK[k].label}`).join('\n');
    const sys = `Mapezi produse de marketplace la stoc fizic de baze. Produse disponibile:
${keys}
Reguli: Set 2x200+1x160 => 2x bariere_200 + 1x bariere_160. Set 3x200 => 3x bariere_200. Barieră simplă 200cm => 1x bariere_200. Gaming albastru => scaune_gaming_negru_albastru; gaming roșu => scaune_gaming_negru_rosu.
Răspunzi DOAR JSON: {"rules":[{"key":"bariere_200","qty":2}],"uncertain":false}. Dacă nu ești sigur: {"rules":[],"uncertain":true}.`;
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 300, system: sys,
        messages: [{ role: 'user', content: `Produs: "${name}" (SKU: ${sku || 'lipsă'}). Ce scade?` }]
      })
    });
    const data = await resp.json();
    let txt = (data.content?.[0]?.text || '').replace(/```json|```/g, '').trim();
    return JSON.parse(txt);
  } catch (e) { return null; }
}

// Rezolva un produs: SKU cunoscut -> invatat -> cuvinte cheie -> AI
async function resolveProduct(p) {
  if (db.SKU_MAP[p.sku]) return { rules: db.SKU_MAP[p.sku], review: false };
  const learned = await db.getLearned(p.sku);
  if (learned) return { rules: learned, review: false };
  const kw = inferFromName(p.name);
  if (kw.length) return { rules: kw, review: false };
  const ai = await askAI(p.name, p.sku);
  if (ai && ai.rules && ai.rules.length) {
    if (p.sku) await db.saveLearned(p.sku, ai.rules);
    return { rules: ai.rules, review: !!ai.uncertain };
  }
  return { rules: [], review: true };
}

function classify(status) {
  const s = (status || '').toLowerCase().trim();
  // Retur / anulare (romaneste + engleza) - produsul se intoarce sau nu pleaca
  const returnWords = ['returned','retur','returnat','returnată','returnata','refused','refuzat','refuzată'];
  const cancelWords = ['cancel','canceled','cancelled','anulat','anulată','anulata'];
  if (returnWords.some(x => s.includes(x))) return 'return';
  if (cancelWords.some(x => s.includes(x))) return 'return';
  // Statusuri care NU sunt vanzari valide
  const ignoreWords = ['draft','ciorna','ciornă','nefinalizat','nefinalizată','nefinalizata','incomplet','incompletă','incompleta','eroare','erori','error'];
  if (ignoreWords.some(x => s.includes(x))) return 'ignore';
  // Vanzare reala: Noua, Primita, In procesare, Finalizata, Completed
  return 'sale';
}

function extractProducts(o) {
  const raw = o.products || o.order_products || [];
  return raw.map(p => ({
    sku: p.sku || p.product_sku || '',
    name: p.name || p.original_name || p.product_name || '',
    qty: parseInt(p.quantity || p.qty || 1)
  })).filter(p => p.name || p.sku);
}

module.exports = { resolveProduct, classify, extractProducts, inferFromName };
