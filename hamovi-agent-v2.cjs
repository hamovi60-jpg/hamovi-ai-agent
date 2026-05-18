// ============================================================
// HAMOVI AI Agent — Premium Version 2.0
// خياطة مغربية فاخرة — مساعد ذكي راقٍ
// ============================================================
// npm install express twilio openai @supabase/supabase-js dotenv
// ============================================================

require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ---- Clients ----
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

// ---- Rate Limiting ----
const rateLimits = {};
const MAX_MESSAGES_PER_MINUTE = 5;

function isRateLimited(phone) {
  const now = Date.now();
  if (!rateLimits[phone]) rateLimits[phone] = [];
  rateLimits[phone] = rateLimits[phone].filter(t => now - t < 60000);
  if (rateLimits[phone].length >= MAX_MESSAGES_PER_MINUTE) return true;
  rateLimits[phone].push(now);
  return false;
}

// ---- In-Memory Conversation Store ----
const conversations = {};
const customerProfiles = {};

// ============================================================
// SYSTEM PROMPT — شخصية HAMOVI الفاخرة
// ============================================================
const SYSTEM_PROMPT = `أنت مستشار Atelier HAMOVI، بيت الخياطة المغربية الفاخرة في فاس العتيقة.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
شخصيتك:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- هادئ، واثق، دافئ، راقٍ — كموظف استقبال في دار أزياء باريسية
- تجمع بين أصالة الحرفة المغربية وأناقة الـ atelier الحديث
- تتكلم بعربية فصحى خفيفة طبيعية، أو دارجة راقية، أو فرنسية أو إنجليزية حسب العميل
- لست روبوتاً — كلامك يشعر بالدفء والاهتمام الحقيقي
- تذكر اسم العميل وتستخدمه بشكل طبيعي

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
أسلوبك:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- جمل قصيرة ومباشرة، لا تتجاوز 3-4 جمل
- لا قوائم مرقمة أو نقاط متعددة
- استخدم ✦ أو 🌙 بشكل نادر وراقٍ فقط
- لا تكرر نفسك أبداً
- سؤال واحد فقط في كل رسالة
- لا تبدأ بـ "بالطبع" أو "بكل سرور" — هذا روبوتي

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
معلومات HAMOVI:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
المنتجات الرئيسية:
• الجلابة المغربية (djellaba): تبدأ من 800 درهم
• الجبادور (jabador): من 1,200 درهم  
• القفطان الرجالي (caftan): من 1,500 درهم
• الفرجية / الركابية: من 1,000 درهم
• سروال قندريسي: من 400 درهم
• البلغة الفاسية: من 300 درهم

الأقمشة الفاخرة:
شعرة حرة، سوسدي، مليفة، حبة فاسية، بزيوية، وزانية، سدى فسدى، وزانية صوف، حرير، قطيفة

مدة الخياطة: 25 إلى 30 يوماً
الدفع: عربون مقدم + الباقي عند الجاهزية أو الشحن
الشحن: داخل المغرب 2-3 أيام | خارج المغرب 5-10 أيام
نعمل مع: المغرب، فرنسا، بلجيكا، هولندا، إسبانيا، كندا، السعودية، الإمارات وأكثر

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
مهمتك:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. رحب بشكل فاخر وطبيعي (مرة واحدة فقط)
2. افهم ما يريد العميل بسؤال واحد ذكي
3. اجمع تدريجياً: الاسم، الدولة، نوع اللباس، المناسبة، الميزانية
4. اقترح القماش والتصميم المناسب
5. عند الاهتمام الجدي: "سيتواصل معكم مستشارنا خلال ساعات ✦"
6. للمقاسات: اطلب الطول الكامل، الأكتاف، المادة، الربع، رأس الكم، القب

للأسعار: أعطِ نطاقاً تقريبياً "يبدأ من X حسب القماش والتطريز"
عند عدم الفهم: "سيتواصل معكم مستشارنا ✦" — لا تخترع إجابات

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
الردود حسب اللغة:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- إذا كتب بالعربية → رد بالعربية
- إذا كتب بالدارجة → رد بالدارجة الراقية
- إذا كتب بالفرنسية → رد بالفرنسية
- إذا كتب بالإنجليزية → رد بالإنجليزية
- إذا خلط → رد بلغته الأساسية`;

// ============================================================
// INTENT DETECTION
// ============================================================
const INTENTS = {
  greeting: ['سلام', 'مرحبا', 'أهلا', 'صباح', 'مساء', 'hello', 'bonjour', 'hi', 'salam', 'labas'],
  jalaba: ['جلابة', 'جلابيب', 'djellaba', 'jellaba'],
  jabador: ['جبادور', 'jabador'],
  caftan: ['قفطان', 'كفطان', 'caftan', 'kaftan'],
  wedding: ['عريس', 'زواج', 'عرس', 'فرح', 'mariage', 'wedding', 'فرح', 'خطوبة'],
  wholesale: ['جملة', 'تاجر', 'كميات', 'wholesale', 'gros'],
  fabric: ['قماش', 'أقمشة', 'شعرة', 'سوسدي', 'مليفة', 'tissu', 'fabric'],
  price: ['سعر', 'كم', 'بشحال', 'ثمن', 'prix', 'price', 'cost', 'تكلفة'],
  shipping: ['شحن', 'توصيل', 'livraison', 'shipping', 'delivery'],
  measurements: ['مقاس', 'مقاسات', 'قياس', 'mesure', 'size', 'taille'],
  human: ['تكلم', 'مسؤول', 'شخص', 'بشر', 'humain', 'person', 'مدير'],
  vip: ['VIP', 'خاص', 'مميز', 'premium', 'luxury'],
};

function detectIntent(text) {
  const lower = text.toLowerCase();
  for (const [intent, keywords] of Object.entries(INTENTS)) {
    if (keywords.some(k => lower.includes(k.toLowerCase()))) return intent;
  }
  return 'general';
}

// ============================================================
// SUPABASE HELPERS
// ============================================================
async function saveConversation(phone, role, content, intent) {
  try {
    // Find or create conversation
    let { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .eq('wa_phone', phone)
      .single();

    if (!conv) {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({ wa_phone: phone, status: 'active' })
        .select('id')
        .single();
      conv = newConv;
    }

    if (conv) {
      await supabase.from('messages').insert({
        conversation_id: conv.id,
        wa_phone: phone,
        role,
        content,
        intent
      });

      await supabase.from('conversations').update({
        last_intent: intent,
        updated_at: new Date().toISOString()
      }).eq('id', conv.id);
    }
  } catch (err) {
    console.log('Supabase save error (non-critical):', err.message);
  }
}

async function saveCustomerProfile(phone, data) {
  try {
    await supabase.from('conversations').upsert({
      wa_phone: phone,
      ...data,
      updated_at: new Date().toISOString()
    }, { onConflict: 'wa_phone' });
  } catch (err) {
    console.log('Profile save error (non-critical):', err.message);
  }
}

async function notifyOwner(phone, name, intent, message) {
  try {
    const ownerPhone = process.env.YOUR_WA_NUMBER;
    if (!ownerPhone) return;

    const notifMsg = `✦ HAMOVI — عميل مهتم\nالرقم: ${phone}\nالاسم: ${name || 'غير محدد'}\nالاهتمام: ${intent}\nآخر رسالة: ${message}`;

    await twilioClient.messages.create({
      body: notifMsg,
      from: process.env.TWILIO_WA_NUMBER,
      to: ownerPhone
    });
  } catch (err) {
    console.log('Owner notification error:', err.message);
  }
}

// ============================================================
// WELCOME FLOW
// ============================================================
function getWelcomeMessage(lang = 'ar') {
  const messages = {
    ar: `السلام عليكم ومرحباً بكم في Atelier HAMOVI 🌙

بيت الخياطة المغربية الفاخرة في فاس العتيقة.

كيف يمكنني مساعدتكم اليوم؟`,
    fr: `Bienvenue chez Atelier HAMOVI ✦

Maison de couture marocaine de prestige à Fès.

Comment puis-je vous aider?`,
    en: `Welcome to Atelier HAMOVI ✦

Morocco's finest traditional tailoring house in Fès.

How may I assist you today?`,
    darija: `مرحبا بيك في Atelier HAMOVI 🌙

دار الخياطة المغربية الفاخرة فاس.

بأش نقدر نعاونك؟`
  };
  return messages[lang] || messages.ar;
}

function detectLanguage(text) {
  if (/[أ-ي]/.test(text)) {
    if (/واش|بغيت|كيفاش|بزاف|مزيان|خويا|صاحبي/.test(text)) return 'darija';
    return 'ar';
  }
  if (/bonjour|merci|voulez|comment|prix|livraison/.test(text.toLowerCase())) return 'fr';
  if (/hello|thank|want|price|ship|size/.test(text.toLowerCase())) return 'en';
  return 'ar';
}

// ============================================================
// EXTRACT CUSTOMER DATA
// ============================================================
function extractCustomerData(message, profile) {
  const updates = { ...profile };

  // Extract name
  const nameMatch = message.match(/(?:أنا|اسمي|اسم|je suis|my name is|i am)\s+([^\s،,\.]+)/i);
  if (nameMatch && !updates.name) updates.name = nameMatch[1];

  // Extract country
  const countries = ['المغرب', 'فرنسا', 'France', 'بلجيكا', 'Belgique', 'هولندا', 'إسبانيا', 'كندا', 'Canada', 'السعودية', 'الإمارات', 'UAE', 'Qatar', 'قطر'];
  const foundCountry = countries.find(c => message.includes(c));
  if (foundCountry && !updates.country) updates.country = foundCountry;

  // Extract order type
  const orderTypes = { 'جلابة': 'jalaba', 'جبادور': 'jabador', 'قفطان': 'caftan', 'فرجية': 'farjiya', 'عريس': 'wedding' };
  for (const [type] of Object.entries(orderTypes)) {
    if (message.includes(type) && !updates.orderType) {
      updates.orderType = type;
      break;
    }
  }

  return updates;
}

// ============================================================
// MAIN MESSAGE HANDLER
// ============================================================
async function handleMessage(phone, waName, userMessage) {
  const intent = detectIntent(userMessage);
  const lang = detectLanguage(userMessage);

  console.log(`\n📱 ${phone} | ${waName}`);
  console.log(`💬 "${userMessage}"`);
  console.log(`🎯 Intent: ${intent} | Lang: ${lang}`);

  // Initialize conversation
  if (!conversations[phone]) conversations[phone] = [];
  if (!customerProfiles[phone]) customerProfiles[phone] = { name: waName, phone };

  // Update customer profile
  customerProfiles[phone] = extractCustomerData(userMessage, customerProfiles[phone]);

  // Rate limiting
  if (isRateLimited(phone)) {
    return lang === 'fr'
      ? "Vous envoyez trop de messages. Veuillez patienter une minute."
      : "يرجى الانتظار قليلاً قبل إرسال رسالة أخرى.";
  }

  // Human handoff
  if (intent === 'human' || conversations[phone].length > 20) {
    await saveConversation(phone, 'user', userMessage, intent);
    await notifyOwner(phone, customerProfiles[phone].name, 'needs_human', userMessage);
    await saveCustomerProfile(phone, { ...customerProfiles[phone], status: 'handed_off' });

    const handoff = {
      ar: `شكراً لتواصلكم مع HAMOVI ✦\n\nسيتصل بكم مستشارنا في أقرب وقت إن شاء الله 🌙`,
      fr: `Merci de contacter HAMOVI ✦\n\nNotre conseiller vous contactera très prochainement.`,
      en: `Thank you for contacting HAMOVI ✦\n\nOur advisor will reach you shortly.`,
      darija: `شكراً على تواصلك مع HAMOVI ✦\n\nالمستشار ديالنا غيتصل بيك قريباً 🌙`
    };
    return handoff[lang] || handoff.ar;
  }

  // Welcome flow for new customers
  const isNew = conversations[phone].length === 0;
  if (isNew && intent === 'greeting') {
    const welcome = getWelcomeMessage(lang);
    conversations[phone].push({ role: 'assistant', content: welcome });
    await saveConversation(phone, 'assistant', welcome, 'greeting');
    return welcome;
  }

  // Add to conversation history
  conversations[phone].push({ role: 'user', content: userMessage });
  await saveConversation(phone, 'user', userMessage, intent);

  // Keep last 12 messages only
  if (conversations[phone].length > 12) {
    conversations[phone] = conversations[phone].slice(-12);
  }

  // Build context
  const profile = customerProfiles[phone];
  const contextNote = profile.name || profile.country || profile.orderType
    ? `\n[ملف العميل: الاسم=${profile.name || '?'}, الدولة=${profile.country || '?'}, الطلب=${profile.orderType || '?'}]`
    : '';

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT + contextNote },
        ...conversations[phone]
      ],
      max_tokens: 280,
      temperature: 0.75,
    });

    const reply = response.choices[0].message.content;
    conversations[phone].push({ role: 'assistant', content: reply });
    await saveConversation(phone, 'assistant', reply, intent);

    // Notify owner for qualified leads (after 3+ messages with order intent)
    const orderIntents = ['jalaba', 'jabador', 'caftan', 'wedding', 'wholesale', 'vip'];
    if (conversations[phone].length === 6 && orderIntents.includes(intent)) {
      await notifyOwner(phone, profile.name, profile.orderType || intent, userMessage);
      await saveCustomerProfile(phone, { ...profile, status: 'qualified', last_intent: intent });
    }

    console.log(`✅ Reply: "${reply.slice(0, 60)}..."`);
    return reply;

  } catch (error) {
    console.error('❌ OpenAI Error:', error.message);

    // Specific error handling
    if (error.message?.includes('quota') || error.message?.includes('billing')) {
      return lang === 'fr'
        ? "Service temporairement indisponible. Notre conseiller vous contactera. ✦"
        : "الخدمة متوقفة مؤقتاً. سيتواصل معكم مستشارنا ✦";
    }

    const fallback = {
      ar: `عذراً على الانقطاع ✦\nسيتواصل معكم مستشارنا قريباً 🌙`,
      fr: `Désolé pour la gêne ✦\nNotre conseiller vous contactera.`,
      en: `Sorry for the inconvenience ✦\nOur advisor will contact you shortly.`,
      darija: `سماح علينا ✦\nالمستشار ديالنا غيتصل بيك قريباً 🌙`
    };
    return fallback[lang] || fallback.ar;
  }
}

// ============================================================
// WEBHOOK ROUTE
// ============================================================
app.post('/webhook', async (req, res) => {
  // Respond to Twilio immediately
  res.type('text/xml');

  const from = req.body.From;
  const body = req.body.Body?.trim();
  const profileName = req.body.ProfileName || 'عميل';

  if (!from || !body) {
    return res.send('<Response></Response>');
  }

  try {
    const reply = await handleMessage(from, profileName, body);
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(reply);
    res.send(twiml.toString());
  } catch (err) {
    console.error('Webhook error:', err);
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message('عذراً، سيتواصل معكم مستشارنا قريباً ✦');
    res.send(twiml.toString());
  }
});

// ============================================================
// DASHBOARD API
// ============================================================
app.get('/health', (req, res) => {
  res.json({
    status: '✦ HAMOVI Agent Online',
    conversations: Object.keys(conversations).length,
    uptime: process.uptime()
  });
});

app.get('/dashboard', (req, res) => {
  const data = Object.entries(conversations).map(([phone, msgs]) => ({
    phone,
    profile: customerProfiles[phone] || {},
    messagesCount: msgs.length,
    lastMessage: msgs[msgs.length - 1]?.content?.slice(0, 80) || '',
  }));
  res.json({ total: data.length, conversations: data });
});

app.get('/logs', (req, res) => {
  const logs = Object.entries(conversations).map(([phone, msgs]) => ({
    phone,
    profile: customerProfiles[phone],
    messages: msgs
  }));
  res.json(logs);
});

// Reset conversation (for testing)
app.delete('/conversation/:phone', (req, res) => {
  const phone = decodeURIComponent(req.params.phone);
  delete conversations[phone];
  delete customerProfiles[phone];
  res.json({ deleted: phone });
});

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n✦━━━━━━━━━━━━━━━━━━━━━━━━━━━━✦`);
  console.log(`  HAMOVI AI Agent — Premium v2.0`);
  console.log(`  الأناقة المغربية الفاخرة`);
  console.log(`✦━━━━━━━━━━━━━━━━━━━━━━━━━━━━✦`);
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Webhook: http://localhost:${PORT}/webhook`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`✦━━━━━━━━━━━━━━━━━━━━━━━━━━━━✦\n`);
});
