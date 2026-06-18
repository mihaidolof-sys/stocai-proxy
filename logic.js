// logic.js - rezolvare produse + procesare comenzi
const fetch = require('node-fetch');
const db = require('./db');

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// Cuvinte cheie -> reguli (fallback inainte de AI)
function inferFromName(name) {
  name = (name || '').toLowerCase();
  const r = [];
  if (name.includes('3x200') || name.includes('3 x 200')) r.push({ key: 'bariere_200', qty: 3 });
  else if (name.includes('2x200') && name.includes('160')) { r.push({ key: 'bariere_200', qty: 2 }); r.push({ key: 'bariere_160', qty: 1 }); }
  else if (name.includes('2x200') && name.includes('180')) { r.push({ key: 'bariere_200', qty: 2 }); r.push({ key: 'bariere_180', qty: 1 }); }
  else if (name.includes('2x200') && name.includes('140')) { r.push({ key: 'bariere_200', qty: 2 }); r.push({ key: 'bariere_140', qty: 1 }); }
  else if (name.includes('200')) r.push({ key: 'bariere_200', qty: 1 });
  else if (name.includes('160')) r.push({ key: 'bariere_160', qty: 1 });
  else if (name.includes('180')) r.push({ key: 'bariere_180', qty: 1 });
  else if (name.includes('140')) r.push({ key: 'bariere_140', qty: 1 });
  if (name.includes('gaming') && (name.includes('albastr') || name.includes('blue'))) r.push({ key: 'scaune_gaming_negru_albastru', qty: 1 });
  else if (name.includes('gaming') && (name.includes('rosu') || name.includes('roșu') || name.includes('red'))) r.push({ key: 'scaune_gaming_negru_rosu', qty: 1 });
  else if (name.includes('gaming')) r.push({ key: 'scaune_gaming_negru_albastru', qty: 1 });
  if (name.includes('ergonomic') && name.includes('gri')) r.push({ key: 'scaune_ergonomic_gri', qty: 1 });
  else if (name.includes('ergonomic') || name.includes('birou')) r.push({ key: 'scaune_ergonomic_negru', qty: 1 });
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
