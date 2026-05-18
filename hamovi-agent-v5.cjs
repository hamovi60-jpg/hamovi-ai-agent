// ============================================================
// HAMOVI AI Agent — v5.0
// Enhanced Personality + Buying Intent + Supabase Logging
// ============================================================

const express = require('express');
const twilio  = require('twilio');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ============================================================
// LOAD .env
// ============================================================
function loadEnv() {
  try {
    const content = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    content.split('\n').forEach(line => {
      const t = line.trim();
      if (!t || t.startsWith('#')) return;
      const i = t.indexOf('=');
      if (i === -1) return;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    });
    console.log('✅ .env loaded');
  } catch { console.log('⚠️  No .env, using system env'); }
}
loadEnv();

// ============================================================
// CONFIG
// ============================================================
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const TWILIO_SID     = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN   = process.env.TWILIO_AUTH_TOKEN;
const OWNER_PHONE    = process.env.YOUR_WA_NUMBER;
const TWILIO_WA      = process.env.TWILIO_WA_NUMBER;
const SUPABASE_URL   = process.env.SUPABASE_URL   || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

console.log('\n🔑 ENV:');
console.log('OPENROUTER:', OPENROUTER_KEY ? `✅ ${OPENROUTER_KEY.slice(0,14)}...` : '❌ MISSING');
console.log('TWILIO:',    TWILIO_SID      ? `✅ ${TWILIO_SID.slice(0,8)}...`      : '❌ MISSING');
console.log('SUPABASE:',  SUPABASE_URL    ? '✅ configured' : '⚠️  optional — not set');

// ============================================================
// SUPABASE REST (no SDK, no WebSocket)
// ============================================================
function sbRequest(method, table, body, query = '') {
  return new Promise(resolve => {
    if (!SUPABASE_URL || !SUPABASE_KEY) return resolve(null);
    try {
      const u    = new URL(`${SUPABASE_URL}/rest/v1/${table}${query}`);
      const data = body ? JSON.stringify(body) : null;
      const opts = {
        hostname: u.hostname,
        path:     u.pathname + u.search,
        method,
        headers: {
          'apikey':        SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type':  'application/json',
          'Prefer':        method === 'POST' ? 'return=representation' : 'return=minimal'
        }
      };
      if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);

      const req = https.request(opts, res => {
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(null); } });
      });
      req.on('error', () => resolve(null));
      req.setTimeout(8000, () => { req.destroy(); resolve(null); });
      if (data) req.write(data);
      req.end();
    } catch { resolve(null); }
  });
}

// Save customer (upsert by phone)
async function saveCustomer(phone, name) {
  try {
    // Check if exists
    const existing = await sbRequest('GET', 'conversations',
      null, `?wa_phone=eq.${encodeURIComponent(phone)}&limit=1`);
    if (existing && existing.length > 0) return existing[0].id;

    const created = await sbRequest('POST', 'conversations', {
      wa_phone: phone, wa_name: name, status: 'active', messages_count: 0
    });
    return created && created[0] ? created[0].id : null;
  } catch { return null; }
}

// Save message
async function saveMsg(convId, phone, role, content, intent) {
  try {
    if (!convId) return;
    await sbRequest('POST', 'messages', {
      conversation_id: convId, wa_phone: phone,
      role, content, intent: intent || 'general'
    });
    await sbRequest('PATCH', 'conversations',
      { last_intent: intent, updated_at: new Date().toISOString() },
      `?wa_phone=eq.${encodeURIComponent(phone)}`
    );
  } catch {}
}

// ============================================================
// OPENROUTER (Claude 3.5 Sonnet)
// ============================================================
async function callAI(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'anthropic/claude-3.5-sonnet',
      messages,
      max_tokens: 300,
      temperature: 0.72
    });

    const opts = {
      hostname: 'openrouter.ai',
      path:     '/api/v1/chat/completions',
      method:   'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'HTTP-Referer':  'https://hamovi.com',
        'X-Title':       'HAMOVI AI Concierge',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const p = JSON.parse(data);
          console.log('📡 OpenRouter status:', res.statusCode);
          if (p.error) reject(new Error(`OpenRouter: ${p.error.message || JSON.stringify(p.error)}`));
          else if (!p.choices?.[0]) reject(new Error(`No choices: ${data.slice(0,200)}`));
          else resolve(p.choices[0].message.content);
        } catch (e) { reject(new Error(`Parse: ${e.message}`)); }
      });
    });
    req.on('error', e => reject(new Error(`HTTPS: ${e.message}`)));
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

// ============================================================
// TWILIO OWNER NOTIFICATION
// ============================================================
async function notifyOwner(msg) {
  try {
    if (!OWNER_PHONE || !TWILIO_WA || !TWILIO_SID) return;
    await twilio(TWILIO_SID, TWILIO_TOKEN).messages.create({
      body: msg, from: TWILIO_WA, to: OWNER_PHONE
    });
    console.log('📲 Owner notified');
  } catch (e) { console.log('⚠️  Notify failed:', e.message); }
}

// ============================================================
// SYSTEM PROMPT — HAMOVI Premium Concierge
// ============================================================
const SYSTEM_PROMPT = `أنت مستشار Atelier HAMOVI، بيت الخياطة المغربية الفاخرة في فاس العتيقة.

شخصيتك:
- هادئ، واثق، دافئ — مثل مستشار في دار أزياء فاخرة
- تتكلم بلغة العميل: عربية، دارجة، فرنسية، أو إنجليزية
- لا تبدو روبوتاً أبداً — كلامك طبيعي وأنيق
- تذكر ما قاله العميل وتبني عليه

أسلوبك:
- جمل قصيرة ومباشرة — لا تتجاوز 3 جمل
- لا قوائم ولا نقاط
- سؤال واحد فقط في كل رسالة
- لا تقل "بالطبع" أو "بكل سرور"

منتجات HAMOVI:
جلابة (من 800 درهم)، جبادور (من 1200)، قفطان (من 1500)، فرجية (من 1000)، قندريسي (من 400)، بلغة فاسية (من 300)

أقمشة فاخرة: شعرة حرة، سوسدي، مليفة، حبة فاسية، بزيوية، وزانية، حرير، قطيفة

الخياطة: 25-30 يوماً | الشحن: المغرب 2-3 أيام | الخارج 5-10 أيام
الدفع: عربون مقدم + الباقي عند الجاهزية

مهمتك:
1. رحب بشكل فاخر وطبيعي
2. افهم ما يريده العميل بسؤال واحد ذكي
3. اجمع تدريجياً: الاسم، الدولة، نوع اللباس، المناسبة، القماش، اللون، الميزانية
4. عند الاهتمام الجدي بالطلب: قل "سيتواصل معكم مستشارنا قريباً ✦"
5. للمقاسات اطلب: الطول، الأكتاف، المادة، الربع، رأس الكم، القب، طول الجلابة`;

// ============================================================
// INTENT DETECTION
// ============================================================
function detectIntent(text) {
  const t = text.toLowerCase();
  // Buying intent — HIGH PRIORITY
  if (/أريد الطلب|أريد الشراء|كيف أدفع|كيف أطلب|عايز نطلب|bghit nchri|je veux commander|how to order|i want to buy/.test(t)) return 'buying';
  if (/سعر|كم|بشحال|ثمن|prix|price|cost|تكلفة/.test(t)) return 'price';
  // Greetings
  if (/سلام|مرحبا|أهلا|صباح|مساء|hello|bonjour|hi\b|salam|labas/.test(t)) return 'greeting';
  // Products
  if (/جلابة|djellaba|jellaba/.test(t)) return 'jalaba';
  if (/جبادور|jabador/.test(t)) return 'jabador';
  if (/قفطان|caftan|kaftan/.test(t)) return 'caftan';
  if (/عريس|زواج|عرس|فرح|mariage|wedding/.test(t)) return 'wedding';
  if (/جملة|تاجر|wholesale|gros/.test(t)) return 'wholesale';
  if (/قماش|شعرة|سوسدي|مليفة|tissu|fabric/.test(t)) return 'fabric';
  if (/شحن|توصيل|livraison|shipping|delivery/.test(t)) return 'shipping';
  if (/مقاس|قياس|mesure|size|taille/.test(t)) return 'measurements';
  if (/تكلم|مسؤول|بشر|humain|human|person/.test(t)) return 'human';
  return 'general';
}

function detectLang(text) {
  if (/واش|بغيت|كيفاش|بزاف|مزيان|خويا|صاحبي|غيتصل|عيط/.test(text)) return 'darija';
  if (/[أ-ي]/.test(text)) return 'ar';
  if (/bonjour|merci|voulez|comment|prix|livraison/.test(text.toLowerCase())) return 'fr';
  return 'en';
}

function fallback(lang, type = 'general') {
  const msgs = {
    quota:   { ar:'رصيد الخدمة منتهٍ ✦', darija:'الرصيد خلص ✦', fr:'Quota épuisé ✦', en:'Quota exceeded ✦' },
    auth:    { ar:'مفتاح API غير صحيح ✦', darija:'المفتاح غلط ✦', fr:'Clé invalide ✦', en:'Invalid key ✦' },
    timeout: { ar:'انتهت المهلة، حاول مجدداً ✦', darija:'تأخر الرد، عاود ✦', fr:'Délai dépassé ✦', en:'Timeout, retry ✦' },
    general: {
      ar:     'عذراً على الانقطاع ✦\nسيتواصل معكم مستشارنا قريباً 🌙',
      darija: 'سماح علينا ✦\nالمستشار غيتصل بيك 🌙',
      fr:     'Désolé. Notre conseiller vous contactera. ✦',
      en:     'Sorry. Our advisor will contact you shortly. ✦'
    }
  };
  return (msgs[type]||msgs.general)[lang] || msgs.general.ar;
}

// ============================================================
// MEMORY & RATE LIMIT
// ============================================================
const conversations = {}; // phone → [{role,content}]
const rateLimits    = {}; // phone → [timestamps]
const convIds       = {}; // phone → supabase conv id

function rateLimit(phone) {
  const now = Date.now();
  if (!rateLimits[phone]) rateLimits[phone] = [];
  rateLimits[phone] = rateLimits[phone].filter(t => now - t < 60000);
  if (rateLimits[phone].length >= 8) return true;
  rateLimits[phone].push(now);
  return false;
}

// ============================================================
// WEBHOOK
// ============================================================
app.post('/webhook', async (req, res) => {
  console.log('\n' + '═'.repeat(50));

  const from   = req.body.From;
  const body   = req.body.Body?.trim();
  const waName = req.body.ProfileName || 'Customer';

  console.log(`📱 ${from} | ${waName}`);
  console.log(`💬 "${body}"`);

  if (!from || !body) {
    return res.type('text/xml').send('<Response></Response>');
  }

  const intent = detectIntent(body);
  const lang   = detectLang(body);
  console.log(`🎯 intent=${intent} lang=${lang}`);

  // Supabase — save customer (non-blocking)
  if (!convIds[from]) {
    saveCustomer(from, waName).then(id => {
      if (id) { convIds[from] = id; console.log(`🗄️  Supabase conv: ${id}`); }
    }).catch(() => {});
  }

  // Rate limit
  if (rateLimit(from)) {
    const msg = {ar:'يرجى الانتظار ✦',darija:'عيط شوية ✦',fr:'Patientez. ✦',en:'Please wait. ✦'}[lang];
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(msg);
    return res.type('text/xml').send(twiml.toString());
  }

  // Init conversation
  if (!conversations[from]) conversations[from] = [];

  // Save user message to Supabase (non-blocking)
  saveMsg(convIds[from], from, 'user', body, intent).catch(() => {});

  // ---- BUYING INTENT ----
  if (intent === 'buying') {
    console.log('🛒 BUYING INTENT detected — notifying owner');

    const buyMsg = {
      ar:     'ممتاز! ✦\nسيتواصل معكم مستشارنا خلال دقائق لإتمام طلبكم 🌙',
      darija: 'مزيان ✦\nالمستشار ديالنا غيتصل بيك دابا باش يكمل معاك الطلب 🌙',
      fr:     'Parfait ✦\nNotre conseiller vous contactera dans quelques minutes pour finaliser votre commande.',
      en:     'Great ✦\nOur advisor will contact you within minutes to complete your order.'
    }[lang];

    notifyOwner(
      `🛒 HAMOVI — نية شراء!\n` +
      `الرقم: ${from}\n` +
      `الاسم: ${waName}\n` +
      `الرسالة: "${body}"\n` +
      `اللغة: ${lang}\n` +
      `⚡ يرجى التواصل فوراً`
    );

    conversations[from].push({ role: 'user', content: body });
    conversations[from].push({ role: 'assistant', content: buyMsg });
    saveMsg(convIds[from], from, 'assistant', buyMsg, 'buying').catch(() => {});

    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(buyMsg);
    return res.type('text/xml').send(twiml.toString());
  }

  // ---- PRICE INTENT ----
  if (intent === 'price') {
    const priceNote = `\n[ملاحظة: العميل يسأل عن السعر — أعطِ نطاقاً تقريبياً وحفّزه على الطلب بأسلوب راقٍ]`;
    conversations[from].push({ role: 'user', content: body });

    try {
      const reply = await callAI([
        { role: 'system', content: SYSTEM_PROMPT + priceNote },
        ...conversations[from]
      ]);
      conversations[from].push({ role: 'assistant', content: reply });
      saveMsg(convIds[from], from, 'assistant', reply, 'price').catch(() => {});

      const twiml = new twilio.twiml.MessagingResponse();
      twiml.message(reply);
      return res.type('text/xml').send(twiml.toString());
    } catch (e) {
      console.error('❌ AI Error (price):', e.message);
    }
  }

  // ---- HUMAN HANDOFF ----
  if (intent === 'human') {
    notifyOwner(`🆘 HAMOVI — طلب بشري\nالرقم: ${from}\nالاسم: ${waName}\nالرسالة: "${body}"`);
    const reply = {
      ar:     'شكراً لتواصلكم ✦\nسيتصل بكم مستشارنا قريباً 🌙',
      darija: 'شكراً ✦\nالمستشار ديالنا غيتصل بيك دابا 🌙',
      fr:     'Merci ✦\nNotre conseiller vous appellera très prochainement.',
      en:     'Thank you ✦\nOur advisor will contact you shortly.'
    }[lang];

    conversations[from].push({ role: 'user', content: body });
    conversations[from].push({ role: 'assistant', content: reply });
    saveMsg(convIds[from], from, 'assistant', reply, 'human').catch(() => {});

    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(reply);
    return res.type('text/xml').send(twiml.toString());
  }

  // ---- GENERAL AI RESPONSE ----
  conversations[from].push({ role: 'user', content: body });
  if (conversations[from].length > 12) {
    conversations[from] = conversations[from].slice(-12);
  }

  let reply = '';

  if (!OPENROUTER_KEY) {
    console.error('❌ OPENROUTER_API_KEY missing');
    reply = fallback(lang, 'auth');
  } else {
    try {
      console.log('🤖 Calling OpenRouter...');
      reply = await callAI([
        { role: 'system', content: SYSTEM_PROMPT },
        ...conversations[from]
      ]);
      console.log(`✅ "${reply.slice(0, 80)}..."`);
      conversations[from].push({ role: 'assistant', content: reply });
      saveMsg(convIds[from], from, 'assistant', reply, intent).catch(() => {});

      // Notify owner on qualified lead (message 6)
      const orderIntents = ['jalaba','jabador','caftan','wedding','wholesale'];
      if (conversations[from].length === 6 && orderIntents.includes(intent)) {
        notifyOwner(`✦ HAMOVI — عميل مهتم\nالرقم: ${from}\nالاسم: ${waName}\nالاهتمام: ${intent}`);
      }

    } catch (error) {
      console.error('❌ AI Error:', error.message);
      let type = 'general';
      if (/quota|billing|credits/.test(error.message))  type = 'quota';
      if (/401|403|key/.test(error.message))             type = 'auth';
      if (/[Tt]imeout/.test(error.message))              type = 'timeout';
      reply = fallback(lang, type);
    }
  }

  console.log(`📤 "${reply.slice(0,60)}..."`);
  console.log('═'.repeat(50) + '\n');

  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(reply);
  res.type('text/xml').send(twiml.toString());
});

// ============================================================
// ROUTES
// ============================================================
app.get('/health', (_, res) => res.json({
  status:        '✦ HAMOVI Agent v5.0 Online',
  model:         'claude-3.5-sonnet via OpenRouter',
  openrouter:    OPENROUTER_KEY ? `✅ ${OPENROUTER_KEY.slice(0,14)}...` : '❌ MISSING',
  supabase:      SUPABASE_URL   ? '✅ configured' : '⚠️ not set',
  conversations: Object.keys(conversations).length,
  uptime:        `${Math.round(process.uptime())}s`
}));

app.get('/test-ai', async (_, res) => {
  try {
    const reply = await callAI([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: 'قل "HAMOVI v5 جاهز" بجملة واحدة أنيقة.' }
    ]);
    res.json({ success: true, model: 'claude-3.5-sonnet', reply });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

app.get('/dashboard', (_, res) => {
  const data = Object.entries(conversations).map(([phone, msgs]) => ({
    phone,
    messages:    msgs.length,
    supabase_id: convIds[phone] || null,
    last:        msgs[msgs.length-1]?.content?.slice(0,100) || ''
  }));
  res.json({ total: data.length, conversations: data });
});

app.delete('/reset/:phone', (req, res) => {
  const p = decodeURIComponent(req.params.phone);
  delete conversations[p];
  delete convIds[p];
  res.json({ reset: p });
});

// ============================================================
// START
// ============================================================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log('\n✦━━━━━━━━━━━━━━━━━━━━━━━━━━━━━✦');
  console.log('  HAMOVI AI Agent v5.0');
  console.log('  Claude 3.5 · Buying Intent · Supabase');
  console.log('✦━━━━━━━━━━━━━━━━━━━━━━━━━━━━━✦');
  console.log(`🚀 http://localhost:${PORT}`);
  console.log(`🧪 http://localhost:${PORT}/test-ai`);
  console.log(`📊 http://localhost:${PORT}/dashboard`);
  console.log('✦━━━━━━━━━━━━━━━━━━━━━━━━━━━━━✦\n');
});
