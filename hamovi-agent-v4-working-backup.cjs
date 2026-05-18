// ============================================================
// HAMOVI AI Agent — v4.0 (OpenRouter + Claude 3.5 Sonnet)
// ============================================================

const express = require('express');
const twilio = require('twilio');
const https = require('https');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ============================================================
// LOAD .env MANUALLY
// ============================================================
function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) return;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    });
    console.log('✅ .env loaded');
  } catch (e) {
    console.log('⚠️  No .env file, using system env vars');
  }
}
loadEnv();

// ============================================================
// CONFIG
// ============================================================
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const OWNER_PHONE        = process.env.YOUR_WA_NUMBER;
const TWILIO_WA          = process.env.TWILIO_WA_NUMBER;

console.log('\n🔑 ENV CHECK:');
console.log('OPENROUTER_API_KEY:', OPENROUTER_API_KEY ? `✅ ${OPENROUTER_API_KEY.slice(0,12)}...` : '❌ MISSING');
console.log('TWILIO_SID:',        TWILIO_ACCOUNT_SID  ? `✅ ${TWILIO_ACCOUNT_SID.slice(0,8)}...`  : '❌ MISSING');

// ============================================================
// OPENROUTER API CALL (direct HTTPS — no SDK)
// ============================================================
async function callAI(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages,
      max_tokens: 300,
      temperature: 0.75
    });

    const options = {
      hostname: 'openrouter.ai',
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://hamovi.com',
        'X-Title': 'HAMOVI AI Concierge',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          console.log('📡 OpenRouter status:', res.statusCode);

          if (parsed.error) {
            reject(new Error(`OpenRouter: ${parsed.error.message || JSON.stringify(parsed.error)}`));
          } else if (!parsed.choices || !parsed.choices[0]) {
            reject(new Error(`No choices returned: ${data.slice(0, 300)}`));
          } else {
            resolve(parsed.choices[0].message.content);
          }
        } catch (e) {
          reject(new Error(`Parse error: ${e.message} | Raw: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', e => reject(new Error(`HTTPS error: ${e.message}`)));
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout (30s)'));
    });
    req.write(body);
    req.end();
  });
}

// ============================================================
// TWILIO NOTIFICATION
// ============================================================
async function notifyOwner(message) {
  try {
    if (!OWNER_PHONE || !TWILIO_WA || !TWILIO_ACCOUNT_SID) return;
    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    await client.messages.create({ body: message, from: TWILIO_WA, to: OWNER_PHONE });
    console.log('📲 Owner notified');
  } catch (e) {
    console.log('⚠️  Owner notification failed:', e.message);
  }
}

// ============================================================
// SYSTEM PROMPT — HAMOVI Luxury Concierge
// ============================================================
const SYSTEM_PROMPT = `You are HAMOVI Concierge, a premium Moroccan atelier assistant.

You help customers choose luxury Moroccan menswear: djellaba, jabador, caftan, balgha, farjiya, wedding outfits, wholesale orders, measurements, shipping, and custom tailoring.

Reply in the customer's language: Arabic, Moroccan Darija, French, or English.
Keep replies short, elegant, human, and premium — max 3-4 sentences.
Ask one smart follow-up question at a time.
Never sound robotic. Never use bullet points or numbered lists.
Use ✦ or 🌙 very sparingly and only when natural.

HAMOVI Products & Prices:
- Djellaba (جلابة): from 800 MAD
- Jabador (جبادور): from 1,200 MAD
- Caftan (قفطان): from 1,500 MAD
- Farjiya/Rakabiya (فرجية): from 1,000 MAD
- Qandrissi trousers (قندريسي): from 400 MAD
- Balgha Fassia (بلغة فاسية): from 300 MAD

Fabrics: sha'ra horra (شعرة حرة), sousdi (سوسدي), malifa (مليفة), hba fassia (حبة فاسية), bziwiya (بزيوية), wazaniya (وزانية), harir (حرير), qatifa (قطيفة)

Tailoring time: 25-30 days
Payment: deposit upfront + rest on delivery or shipping
Shipping: Morocco 2-3 days | International 5-10 days
Countries served: Morocco, France, Belgium, Netherlands, Spain, Canada, Saudi Arabia, UAE and more

If the customer wants to place an order, collect naturally one at a time:
name → country → outfit type → occasion → fabric preference → color → budget → measurements

Measurements needed: full height, shoulders, chest (mada), waist (rub'), sleeve head (ras el koum), collar (qob), desired length

Only transfer to human if customer explicitly asks for a human agent.`;

// ============================================================
// HELPERS
// ============================================================
function detectIntent(text) {
  const t = text.toLowerCase();
  if (/سلام|مرحبا|أهلا|صباح|مساء|hello|bonjour|hi\b|salam|labas/.test(t)) return 'greeting';
  if (/جلابة|djellaba|jellaba/.test(t)) return 'jalaba';
  if (/جبادور|jabador/.test(t)) return 'jabador';
  if (/قفطان|caftan|kaftan/.test(t)) return 'caftan';
  if (/عريس|زواج|عرس|فرح|mariage|wedding/.test(t)) return 'wedding';
  if (/جملة|تاجر|wholesale|gros/.test(t)) return 'wholesale';
  if (/قماش|شعرة|سوسدي|مليفة|tissu|fabric/.test(t)) return 'fabric';
  if (/سعر|كم|بشحال|ثمن|prix|price|cost/.test(t)) return 'price';
  if (/شحن|توصيل|livraison|shipping|delivery/.test(t)) return 'shipping';
  if (/مقاس|قياس|mesure|size|taille/.test(t)) return 'measurements';
  if (/تكلم|مسؤول|بشر|humain|human|person/.test(t)) return 'human';
  return 'general';
}

function detectLang(text) {
  if (/واش|بغيت|كيفاش|بزاف|مزيان|خويا|صاحبي|غيتصل/.test(text)) return 'darija';
  if (/[أ-ي]/.test(text)) return 'ar';
  if (/bonjour|merci|voulez|comment|prix|livraison/.test(text.toLowerCase())) return 'fr';
  return 'en';
}

function fallbackMsg(lang, errorType) {
  const msgs = {
    quota: {
      ar: 'رصيد الخدمة منتهي، يرجى التواصل مع الإدارة ✦',
      darija: 'الرصيد خلص، تواصل مع الإدارة ✦',
      fr: 'Quota épuisé. Contactez l\'admin. ✦',
      en: 'Quota exceeded. Contact admin. ✦'
    },
    auth: {
      ar: 'مفتاح API غير صحيح ✦',
      darija: 'المفتاح غلط ✦',
      fr: 'Clé API invalide. ✦',
      en: 'Invalid API key. ✦'
    },
    timeout: {
      ar: 'انتهت المهلة، يرجى إعادة المحاولة ✦',
      darija: 'تأخر الرد، عاود المحاولة ✦',
      fr: 'Délai dépassé, réessayez. ✦',
      en: 'Timeout, please retry. ✦'
    },
    general: {
      ar: 'عذراً على الانقطاع ✦\nسيتواصل معكم مستشارنا قريباً 🌙',
      darija: 'سماح علينا ✦\nالمستشار ديالنا غيتصل بيك 🌙',
      fr: 'Désolé pour la gêne. Notre conseiller vous contactera. ✦',
      en: 'Sorry for the inconvenience. Our advisor will contact you. ✦'
    }
  };
  return (msgs[errorType] || msgs.general)[lang] || msgs.general.ar;
}

// ============================================================
// MEMORY & RATE LIMIT
// ============================================================
const conversations = {};
const rateLimits = {};

function isRateLimited(phone) {
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
  console.log('📥 WEBHOOK');

  const from    = req.body.From;
  const body    = req.body.Body?.trim();
  const waName  = req.body.ProfileName || 'Customer';

  console.log(`📱 From: ${from}`);
  console.log(`👤 Name: ${waName}`);
  console.log(`💬 Message: "${body}"`);

  if (!from || !body) {
    return res.type('text/xml').send('<Response></Response>');
  }

  const intent = detectIntent(body);
  const lang   = detectLang(body);
  console.log(`🎯 Intent: ${intent} | Lang: ${lang}`);

  // Rate limit
  if (isRateLimited(from)) {
    console.log('🚫 Rate limited');
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message({ ar:'يرجى الانتظار قليلاً ✦', darija:'عيط شوية ✦', fr:'Veuillez patienter. ✦', en:'Please wait a moment. ✦' }[lang]);
    return res.type('text/xml').send(twiml.toString());
  }

  // Init conversation
  if (!conversations[from]) conversations[from] = [];

  // Human handoff
  if (intent === 'human') {
    notifyOwner(`🆘 HAMOVI — طلب بشري\nالرقم: ${from}\nالاسم: ${waName}\nالرسالة: ${body}`);
    const reply = {
      ar: 'شكراً لتواصلكم ✦\nسيتصل بكم مستشارنا قريباً 🌙',
      darija: 'شكراً ✦\nالمستشار ديالنا غيتصل بيك دابا 🌙',
      fr: 'Merci ✦\nNotre conseiller vous contactera très prochainement.',
      en: 'Thank you ✦\nOur advisor will contact you shortly.'
    }[lang];
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(reply);
    return res.type('text/xml').send(twiml.toString());
  }

  // Add message to history
  conversations[from].push({ role: 'user', content: body });
  if (conversations[from].length > 12) {
    conversations[from] = conversations[from].slice(-12);
  }

  let reply = '';

  if (!OPENROUTER_API_KEY) {
    console.error('❌ OPENROUTER_API_KEY missing!');
    reply = fallbackMsg(lang, 'auth');
  } else {
    try {
      console.log('\n🤖 Calling OpenRouter (Claude 3.5 Sonnet)...');

      reply = await callAI([
        { role: 'system', content: SYSTEM_PROMPT },
        ...conversations[from]
      ]);

      console.log(`✅ Reply: "${reply.slice(0, 100)}..."`);
      conversations[from].push({ role: 'assistant', content: reply });

      // Notify owner on qualified lead
      const orderIntents = ['jalaba', 'jabador', 'caftan', 'wedding', 'wholesale'];
      if (conversations[from].length === 8 && orderIntents.includes(intent)) {
        notifyOwner(`✦ HAMOVI — عميل مؤهل\nالرقم: ${from}\nالاسم: ${waName}\nالاهتمام: ${intent}`);
      }

    } catch (error) {
      console.error('❌ AI Error:', error.message);

      let errorType = 'general';
      if (error.message.includes('quota') || error.message.includes('billing') || error.message.includes('credits')) errorType = 'quota';
      else if (error.message.includes('401') || error.message.includes('403') || error.message.includes('key')) errorType = 'auth';
      else if (error.message.includes('timeout') || error.message.includes('Timeout')) errorType = 'timeout';

      reply = fallbackMsg(lang, errorType);
    }
  }

  console.log(`📤 Sending: "${reply.slice(0, 80)}..."`);
  console.log('═'.repeat(50) + '\n');

  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(reply);
  res.type('text/xml').send(twiml.toString());
});

// ============================================================
// ROUTES
// ============================================================
app.get('/health', (req, res) => res.json({
  status: '✦ HAMOVI Agent v4.0 Online',
  model: 'openai/gpt-4o-mini via OpenRouter',
  openrouter: OPENROUTER_API_KEY ? `✅ ${OPENROUTER_API_KEY.slice(0,12)}...` : '❌ MISSING',
  conversations: Object.keys(conversations).length,
  uptime: `${Math.round(process.uptime())}s`
}));

app.get('/test-ai', async (req, res) => {
  try {
    console.log('\n🧪 Testing OpenRouter...');
    const reply = await callAI([
      { role: 'system', content: 'You are HAMOVI AI assistant.' },
      { role: 'user', content: 'Say "HAMOVI v4 OpenRouter OK" in Arabic in one sentence.' }
    ]);
    res.json({ success: true, model: 'gpt-4o-mini', reply });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

app.get('/dashboard', (req, res) => {
  const data = Object.entries(conversations).map(([phone, msgs]) => ({
    phone,
    messages: msgs.length,
    last: msgs[msgs.length - 1]?.content?.slice(0, 100) || ''
  }));
  res.json({ total: data.length, conversations: data });
});

app.delete('/reset/:phone', (req, res) => {
  const phone = decodeURIComponent(req.params.phone);
  delete conversations[phone];
  res.json({ reset: phone });
});

// ============================================================
// START
// ============================================================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log('\n✦━━━━━━━━━━━━━━━━━━━━━━━━━━━━━✦');
  console.log('  HAMOVI AI Agent v4.0');
  console.log('  Claude 3.5 Sonnet via OpenRouter');
  console.log('✦━━━━━━━━━━━━━━━━━━━━━━━━━━━━━✦');
  console.log(`🚀 http://localhost:${PORT}`);
  console.log(`🧪 Test AI: http://localhost:${PORT}/test-ai`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
  console.log('✦━━━━━━━━━━━━━━━━━━━━━━━━━━━━━✦\n');
});
