require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const OpenAI = require('openai');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Memory بسيطة للمحادثات
const conversations = {};

const SYSTEM_PROMPT = `أنت مستشار Atelier HAMOVI، بيت الخياطة المغربية الفاخرة في فاس.

شخصيتك: هادئ، راقٍ، دافئ، واثق. تتكلم بعربية أصيلة طبيعية.

أسلوبك:
- جمل قصيرة ومباشرة
- لا قوائم طويلة
- استخدم ✦ أو 🌙 بشكل نادر وراقٍ
- لا تكرر نفسك أبداً

HAMOVI متخصص في: الجلابة، القفطان، الجبادور، الفرجية، سروال قندريسي، البلغة الفاسية.
أقمشة: شعرة حرة، سوسدي، مليفة، حبة فاسية، وزانية.
مدة الخياطة: 25-30 يوماً. نشحن للمغرب والخارج.
الأسعار: الجلابة من 800 درهم، الجبادور من 1200 درهم، القفطان من 1500 درهم.

مهمتك:
1. رحب بشكل فاخر وطبيعي
2. بسؤال واحد افهم ما يريد
3. اجمع تدريجياً: الاسم، الدولة، نوع اللباس، الميزانية
4. اقترح القماش المناسب
5. عند الاهتمام: "سيتواصل معكم مستشارنا قريباً ✦"

إذا لم تفهم السؤال: "سيتواصل معكم مستشارنا قريباً ✦"`;

app.post('/webhook', async (req, res) => {
  const from = req.body.From;
  const message = req.body.Body;

  console.log(`رسالة من ${from}: ${message}`);

  // تهيئة المحادثة
  if (!conversations[from]) {
    conversations[from] = [];
  }

  // إضافة رسالة المستخدم
  conversations[from].push({ role: 'user', content: message });

  // الاحتفاظ بآخر 10 رسائل فقط
  if (conversations[from].length > 10) {
    conversations[from] = conversations[from].slice(-10);
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...conversations[from]
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    const reply = response.choices[0].message.content;

    // حفظ رد الـ AI
    conversations[from].push({ role: 'assistant', content: reply });

    // إرسال الرد عبر Twilio
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(reply);

    res.type('text/xml');
    res.send(twiml.toString());

  } catch (error) {
    console.error('خطأ:', error);
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message('عذراً، سيتواصل معكم مستشارنا قريباً ✦');
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'HAMOVI WhatsApp Agent Running ✦' });
});

app.listen(3001, () => {
  console.log('HAMOVI WhatsApp Agent يعمل على المنفذ 3001 ✦');
});