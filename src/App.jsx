// ============================================================
// HAMOVI — النظام الكامل مع Supabase Auth
// ملف: src/App.jsx (استبدل به ملفك الحالي)
// ============================================================
// متطلبات:
//   npm install @supabase/supabase-js
// متغيرات .env:
//   VITE_SUPABASE_URL=https://xxxx.supabase.co
//   VITE_SUPABASE_ANON_KEY=eyJhbGci...
// ============================================================

import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { createClient } from "@supabase/supabase-js";

// ---- Supabase Client ----
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ---- Auth Context ----
const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);

// ============================================================
// UTILITIES
// ============================================================
const generateId = () => `${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
const today = () => new Date().toISOString().slice(0, 10);
const formatCurrency = (n) => `${(n || 0).toLocaleString("ar-MA")} د.م`;
const formatDate = (d) => d ? new Date(d).toLocaleDateString("ar-MA") : "—";

const ORDER_STATUSES = ["جديد","تأكيد المقاسات","في القص","في الخياطة","في الطرز/العقاد","في التشطيب","جاهز للتسليم","تم الشحن","تم التسليم","ملغي"];
const STATUS_COLORS = {
  "جديد":"#3b82f6","تأكيد المقاسات":"#f59e0b","في القص":"#8b5cf6",
  "في الخياطة":"#ec4899","في الطرز/العقاد":"#f97316","في التشطيب":"#06b6d4",
  "جاهز للتسليم":"#22c55e","تم الشحن":"#84cc16","تم التسليم":"#10b981","ملغي":"#ef4444"
};
const CUSTOMER_TYPES = ["زبون فردي","تاجر جملة","عريس","VIP"];
const CLOTH_TYPES = ["جلابة","قفطان","جبادور","بلغة فاسية","فرجية/ركابية","سروال قندريسي"];
const FABRIC_TYPES = ["شعرة حرة","سوسدي","مليفة","حبة فاسية","بزيوية","وزانية","سدى فسدى","وزانية صوف","حرير","قطيفة"];
const PAYMENT_STATUSES = ["غير مدفوع","عربون مدفوع","مدفوع كامل"];
const USER_ROLES = { admin:"مدير", sales:"موظف مبيعات", tailor:"خياط", accountant:"محاسب" };

const waMessages = {
  confirm: (name, num, total, adv) =>
    `السلام عليكم ${name} 🌙\n\nتم استلام طلبكم في *HAMOVI*\nرقم الطلب: *${num}*\nالإجمالي: *${formatCurrency(total)}*\nالعربون: *${formatCurrency(adv)}*\nالمتبقي: *${formatCurrency(total - adv)}*\n\nمدة الإنجاز: 25-30 يوماً إن شاء الله 🏅`,
  measures: (name) => `السلام عليكم ${name} 🌙\n\nنحتاج المقاسات التالية:\n📏 الطول الكامل\n📏 الأكتاف\n📏 المادة\n📏 الربع\n📏 رأس الكم\n📏 القب\n📏 الطول المطلوب للجلابة\n\nشكراً 🙏`,
  payment: (name, amt) => `السلام عليكم ${name} 🌙\n\nتذكير بالمبلغ المتبقي: *${formatCurrency(amt)}*\n\nشكراً لتعاملكم مع *HAMOVI* 🏅`,
  ready: (name, num) => `السلام عليكم ${name} 🌙\n\n🎉 طلبكم رقم *${num}* جاهز للاستلام!\n\n*HAMOVI* - الأناقة المغربية الفاخرة 🏅`,
  shipped: (name) => `السلام عليكم ${name} 🌙\n\n📦 تم شحن طلبكم!\nنتمنى أن يصلكم في أحسن حال.\n*HAMOVI* 🏅`,
  followup: (name) => `السلام عليكم ${name} 🌙\n\nنأمل أن طلبكم من *HAMOVI* نال إعجابكم.\nيسعدنا دائماً خدمتكم 🌿`,
};

const sendWA = (phone, msg) => {
  const p = phone?.replace(/\D/g, "");
  if (!p) return alert("رقم الهاتف غير موجود");
  window.open(`https://wa.me/${p}?text=${encodeURIComponent(msg)}`, "_blank");
};

// ============================================================
// HOOK: useDB — generic realtime table hook
// ============================================================
function useDB(table, query = "*", orderCol = "created_at", asc = false) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data: rows, error: err } = await supabase
      .from(table).select(query).order(orderCol, { ascending: asc });
    if (err) setError(err.message);
    else setData(rows || []);
    setLoading(false);
  }, [table]);

  useEffect(() => {
    fetch();
    // Realtime subscription
    const channel = supabase.channel(`rt_${table}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, fetch)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetch]);

  const insert = async (row) => {
    const { error: e } = await supabase.from(table).insert(row);
    if (e) throw e;
    await fetch();
  };

  const update = async (id, row) => {
    const { error: e } = await supabase.from(table).update(row).eq("id", id);
    if (e) throw e;
    await fetch();
  };

  const remove = async (id) => {
    const { error: e } = await supabase.from(table).delete().eq("id", id);
    if (e) throw e;
    await fetch();
  };

  return { data, loading, error, refetch: fetch, insert, update, remove };
}

// ============================================================
// STYLES
// ============================================================
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@300;400;600;700;900&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --gold: #c9a84c; --gold-light: #e8c96d; --gold-dark: #9a7a30;
    --gold-glow: rgba(201,168,76,0.2);
    --black: #080808; --dark: #0f0f0f; --dark2: #161616; --dark3: #1e1e1e; --dark4: #252525;
    --border: rgba(201,168,76,0.18); --border-bright: rgba(201,168,76,0.45);
    --text: #e8e0d0; --text-muted: #8a8070;
    --red: #ef4444; --green: #22c55e; --blue: #3b82f6;
    --radius: 12px; --shadow-gold: 0 0 24px rgba(201,168,76,0.12);
  }
  body { font-family: 'Cairo', sans-serif; background: var(--black); color: var(--text); direction: rtl; }
  
  /* ---- AUTH ---- */
  .auth-wrap {
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: var(--black);
    background-image: radial-gradient(ellipse at 20% 50%, rgba(201,168,76,0.04) 0%, transparent 60%),
                      radial-gradient(ellipse at 80% 20%, rgba(201,168,76,0.03) 0%, transparent 50%);
  }
  .auth-card {
    background: var(--dark2); border: 1px solid var(--border-bright);
    border-radius: 20px; padding: 48px 40px; width: 100%; max-width: 420px;
    box-shadow: 0 24px 60px rgba(0,0,0,0.8), var(--shadow-gold);
    animation: fadeIn 0.4s ease;
  }
  .auth-logo { text-align: center; margin-bottom: 36px; }
  .auth-logo h1 { font-family: 'Amiri', serif; font-size: 2.4rem; color: var(--gold); letter-spacing: 5px; text-shadow: 0 0 30px var(--gold-glow); }
  .auth-logo p { font-size: 0.7rem; color: var(--text-muted); letter-spacing: 3px; margin-top: 4px; }
  .auth-divider { color: var(--gold-dark); font-size: 1.2rem; text-align: center; margin: 8px 0 24px; }
  .auth-error { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); color: #ef4444; padding: 10px 14px; border-radius: 8px; font-size: 0.85rem; margin-bottom: 16px; }
  
  /* ---- LAYOUT ---- */
  .app { display: flex; min-height: 100vh; }
  .sidebar {
    width: 255px; min-width: 255px; background: var(--dark);
    border-left: 1px solid var(--border); position: fixed; top: 0; right: 0; bottom: 0;
    z-index: 100; display: flex; flex-direction: column; overflow-y: auto;
    transition: transform 0.3s ease;
  }
  .sidebar-logo { padding: 26px 20px; border-bottom: 1px solid var(--border); text-align: center; }
  .sidebar-logo h1 { font-family: 'Amiri', serif; font-size: 1.9rem; color: var(--gold); letter-spacing: 4px; }
  .sidebar-logo p { font-size: 0.6rem; color: var(--text-muted); letter-spacing: 2px; margin-top: 2px; }
  .nav-section { padding: 14px 16px 3px; font-size: 0.58rem; color: var(--text-muted); letter-spacing: 2px; text-transform: uppercase; }
  .nav-item { display: flex; align-items: center; gap: 9px; padding: 9px 18px; cursor: pointer; transition: all 0.2s; color: var(--text-muted); font-size: 0.84rem; border-right: 3px solid transparent; }
  .nav-item:hover { background: var(--dark2); color: var(--text); }
  .nav-item.active { background: var(--dark3); color: var(--gold); border-right-color: var(--gold); }
  .sidebar-footer { padding: 14px 18px; border-top: 1px solid var(--border); font-size: 0.7rem; color: var(--text-muted); }
  .main { flex: 1; margin-right: 255px; display: flex; flex-direction: column; min-height: 100vh; }
  .topbar { background: var(--dark); border-bottom: 1px solid var(--border); padding: 0 22px; height: 58px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 50; }
  .topbar-title { font-size: 1.05rem; font-weight: 700; }
  .content { flex: 1; padding: 22px; }
  
  /* ---- CARDS ---- */
  .card { background: var(--dark2); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; transition: border-color 0.2s, box-shadow 0.2s; }
  .card:hover { border-color: var(--border-bright); }
  .card-title { font-size: 0.72rem; color: var(--text-muted); margin-bottom: 6px; }
  .card-value { font-size: 1.55rem; font-weight: 700; color: var(--gold); }
  .card-sub { font-size: 0.72rem; color: var(--text-muted); margin-top: 4px; }
  .gold-top { border-top: 2px solid var(--gold); }
  
  /* ---- GRID ---- */
  .g4 { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; }
  .g3 { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; }
  .g2 { display: grid; grid-template-columns: repeat(2,1fr); gap: 14px; }
  
  /* ---- SECTION HEADER ---- */
  .sec-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
  .sec-title { font-size: 1.15rem; font-weight: 700; }
  .sec-title span { color: var(--gold); }
  
  /* ---- BUTTONS ---- */
  .btn { display: inline-flex; align-items: center; gap: 5px; padding: 8px 15px; border-radius: 8px; cursor: pointer; font-family: 'Cairo', sans-serif; font-size: 0.84rem; font-weight: 600; border: none; transition: all 0.2s; }
  .btn-gold { background: var(--gold); color: var(--black); }
  .btn-gold:hover { background: var(--gold-light); }
  .btn-outline { background: transparent; border: 1px solid var(--border-bright); color: var(--gold); }
  .btn-outline:hover { background: var(--gold-glow); }
  .btn-danger { background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3); color: #ef4444; }
  .btn-danger:hover { background: rgba(239,68,68,0.22); }
  .btn-green { background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.3); color: #22c55e; }
  .btn-wa { background: #25D366; color: white; }
  .btn-wa:hover { background: #128C7E; }
  .btn-sm { padding: 4px 10px; font-size: 0.74rem; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  
  /* ---- TABLE ---- */
  .tbl-wrap { overflow-x: auto; border-radius: var(--radius); border: 1px solid var(--border); }
  table { width: 100%; border-collapse: collapse; }
  th { background: var(--dark3); color: var(--gold); font-size: 0.78rem; padding: 11px 14px; text-align: right; border-bottom: 1px solid var(--border); white-space: nowrap; }
  td { padding: 11px 14px; font-size: 0.84rem; border-bottom: 1px solid rgba(201,168,76,0.07); white-space: nowrap; }
  tr:hover td { background: var(--dark3); }
  tr:last-child td { border-bottom: none; }
  
  /* ---- BADGE ---- */
  .badge { display: inline-block; padding: 2px 9px; border-radius: 20px; font-size: 0.68rem; font-weight: 700; white-space: nowrap; }
  .badge-gold { background: rgba(201,168,76,0.13); color: var(--gold); border: 1px solid var(--border); }
  .badge-red { background: rgba(239,68,68,0.13); color: #ef4444; }
  .badge-green { background: rgba(34,197,94,0.13); color: #22c55e; }
  .badge-gray { background: rgba(255,255,255,0.05); color: var(--text-muted); }
  
  /* ---- FORM ---- */
  .fg { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .fg-full { grid-column: 1 / -1; }
  .fgroup { display: flex; flex-direction: column; gap: 5px; }
  .flabel { font-size: 0.76rem; color: var(--text-muted); font-weight: 600; }
  .finput, .fselect, .ftextarea {
    background: var(--dark3); border: 1px solid var(--border);
    border-radius: 8px; padding: 9px 11px; color: var(--text);
    font-family: 'Cairo', sans-serif; font-size: 0.88rem;
    transition: border-color 0.2s; width: 100%;
  }
  .finput:focus, .fselect:focus, .ftextarea:focus { outline: none; border-color: var(--gold); }
  .finput::placeholder { color: var(--text-muted); }
  .ftextarea { resize: vertical; min-height: 76px; }
  .fselect option { background: var(--dark3); }
  
  /* ---- MODAL ---- */
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 16px; backdrop-filter: blur(4px); }
  .modal { background: var(--dark2); border: 1px solid var(--border-bright); border-radius: 16px; width: 100%; max-width: 680px; max-height: 90vh; overflow-y: auto; box-shadow: 0 24px 60px rgba(0,0,0,0.8), 0 0 40px var(--gold-glow); }
  .modal-hd { padding: 18px 22px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; background: var(--dark2); z-index: 1; }
  .modal-title { font-size: 1.05rem; font-weight: 700; color: var(--gold); }
  .modal-body { padding: 22px; }
  .modal-ft { padding: 14px 22px; border-top: 1px solid var(--border); display: flex; gap: 9px; justify-content: flex-end; }
  .modal-close { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.2rem; }
  
  /* ---- MISC ---- */
  .alert { padding: 10px 14px; border-radius: 8px; font-size: 0.83rem; margin-bottom: 10px; }
  .alert-warn { background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3); color: #f59e0b; }
  .alert-danger { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); color: #ef4444; }
  .alert-info { background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.3); color: #60a5fa; }
  .alert-success { background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3); color: #22c55e; }
  .sbselect { background: var(--dark3); border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px; color: var(--text); font-family: 'Cairo', sans-serif; font-size: 0.76rem; cursor: pointer; }
  .sbar { background: var(--dark3); border: 1px solid var(--border); border-radius: 8px; padding: 7px 13px; color: var(--text); font-family: 'Cairo', sans-serif; font-size: 0.87rem; width: 230px; }
  .sbar:focus { outline: none; border-color: var(--gold); }
  .sbar::placeholder { color: var(--text-muted); }
  .tabs { display: flex; gap: 3px; margin-bottom: 18px; border-bottom: 1px solid var(--border); }
  .tab { padding: 9px 17px; cursor: pointer; font-size: 0.83rem; color: var(--text-muted); border-bottom: 2px solid transparent; margin-bottom: -1px; transition: all 0.2s; }
  .tab.active { color: var(--gold); border-bottom-color: var(--gold); }
  .empty { text-align: center; padding: 50px 20px; color: var(--text-muted); }
  .empty .ico { font-size: 2.8rem; margin-bottom: 10px; }
  .role-badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 0.68rem; font-weight: 700; background: rgba(201,168,76,0.1); color: var(--gold); border: 1px solid var(--border); }
  .spinner { display: inline-block; width: 18px; height: 18px; border: 2px solid var(--border); border-top-color: var(--gold); border-radius: 50%; animation: spin 0.7s linear infinite; }
  
  /* MOBILE */
  .mob-btn { display: none; background: none; border: none; color: var(--gold); font-size: 1.3rem; cursor: pointer; padding: 6px; }
  @media (max-width: 860px) {
    .sidebar { transform: translateX(100%); }
    .sidebar.open { transform: translateX(0); }
    .main { margin-right: 0; }
    .g4 { grid-template-columns: repeat(2,1fr); }
    .g3 { grid-template-columns: repeat(2,1fr); }
    .fg { grid-template-columns: 1fr; }
    .mob-btn { display: block; }
    .sbar { width: 150px; }
  }
  @media (max-width: 500px) {
    .g4, .g3, .g2 { grid-template-columns: 1fr; }
    .content { padding: 14px; }
  }
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: var(--dark); }
  ::-webkit-scrollbar-thumb { background: var(--border-bright); border-radius: 3px; }
  
  .fade-in { animation: fadeIn 0.28s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; } }
  @keyframes spin { to { transform: rotate(360deg); } }
  
  .flex { display: flex; } .items-center { align-items: center; }
  .gap-2 { gap: 8px; } .gap-3 { gap: 12px; }
  .mt-4 { margin-top: 16px; } .mt-2 { margin-top: 8px; }
  .mb-4 { margin-bottom: 16px; } .mb-2 { margin-bottom: 8px; }
  .w-full { width: 100%; } .text-gold { color: var(--gold); }
  .text-red { color: var(--red); } .text-green { color: var(--green); }
  .text-muted { color: var(--text-muted); } .font-bold { font-weight: 700; }
  .text-center { text-align: center; } .flex-col { flex-direction: column; }
  .flex-wrap { flex-wrap: wrap; } .jc-between { justify-content: space-between; }
`;

// ============================================================
// UI COMPONENTS
// ============================================================
const Spinner = () => <div className="spinner" />;
const EmptyState = ({ icon, msg }) => <div className="empty"><div className="ico">{icon}</div><p>{msg}</p></div>;

const Modal = ({ title, children, onClose, footer }) => (
  <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="modal fade-in">
      <div className="modal-hd">
        <span className="modal-title">✦ {title}</span>
        <button className="modal-close" onClick={onClose}>✕</button>
      </div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-ft">{footer}</div>}
    </div>
  </div>
);

const StatCard = ({ icon, label, value, sub, color }) => (
  <div className="card gold-top">
    <div className="card-title">{icon} {label}</div>
    <div className="card-value" style={color ? { color } : {}}>{value}</div>
    {sub && <div className="card-sub">{sub}</div>}
  </div>
);

const StatusBadge = ({ status }) => {
  const c = STATUS_COLORS[status] || "#888";
  return <span className="badge" style={{ background:`${c}1a`, color:c, border:`1px solid ${c}40` }}>{status}</span>;
};

// ============================================================
// AUTH PAGE
// ============================================================
const AuthPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const login = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) setError(err.message === "Invalid login credentials" ? "البريد الإلكتروني أو كلمة المرور غير صحيحة" : err.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">
          <h1>HAMOVI</h1>
          <p>الأناقة المغربية الفاخرة</p>
          <div className="auth-divider">❖ ❖ ❖</div>
        </div>
        {error && <div className="auth-error">⚠️ {error}</div>}
        <form onSubmit={login}>
          <div className="fgroup mb-4">
            <label className="flabel">البريد الإلكتروني</label>
            <input className="finput" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@hamovi.ma" required dir="ltr" />
          </div>
          <div className="fgroup mb-4">
            <label className="flabel">كلمة المرور</label>
            <input className="finput" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required dir="ltr" />
          </div>
          <button className="btn btn-gold w-full" type="submit" disabled={loading} style={{justifyContent:"center",fontSize:"1rem",padding:"11px"}}>
            {loading ? <><Spinner /> جارٍ الدخول...</> : "🔑 دخول"}
          </button>
        </form>
      </div>
    </div>
  );
};

// ============================================================
// USERS MANAGEMENT (Admin only)
// ============================================================
const UsersPage = () => {
  const { data: profiles, loading, insert, update } = useDB("profiles", "*", "full_name", true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ email:"", password:"", full_name:"", role:"sales" });
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState("");

  const createUser = async () => {
    setCreating(true); setErr("");
    try {
      const { data, error } = await supabase.auth.signUp({
        email: form.email, password: form.password,
        options: { data: { full_name: form.full_name } }
      });
      if (error) throw error;
      // تحديث الدور
      if (data.user) {
        await supabase.from("profiles").update({ role: form.role, full_name: form.full_name }).eq("id", data.user.id);
      }
      setModal(false);
    } catch (e) { setErr(e.message); }
    finally { setCreating(false); }
  };

  if (loading) return <div className="text-center mt-4"><Spinner /></div>;

  return (
    <div className="fade-in">
      <div className="sec-header">
        <div className="sec-title">إدارة <span>المستخدمين</span></div>
        <button className="btn btn-gold" onClick={() => { setForm({email:"",password:"",full_name:"",role:"sales"}); setErr(""); setModal(true); }}>+ مستخدم جديد</button>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>الاسم</th><th>الدور</th><th>الحالة</th><th>إجراءات</th></tr></thead>
          <tbody>
            {profiles.map(p => (
              <tr key={p.id}>
                <td className="font-bold">{p.full_name || "—"}</td>
                <td><span className="role-badge">{USER_ROLES[p.role] || p.role}</span></td>
                <td><span className={`badge ${p.is_active ? "badge-green" : "badge-red"}`}>{p.is_active ? "نشط" : "موقوف"}</span></td>
                <td>
                  <div className="flex gap-2">
                    {Object.entries(USER_ROLES).map(([r, l]) => (
                      <button key={r} className="btn btn-sm btn-outline" style={{fontSize:"0.68rem"}} onClick={() => update(p.id, { role: r })}>
                        {l}
                      </button>
                    ))}
                    <button className="btn btn-sm btn-danger" onClick={() => update(p.id, { is_active: !p.is_active })}>
                      {p.is_active ? "إيقاف" : "تفعيل"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && (
        <Modal title="مستخدم جديد" onClose={() => setModal(false)}
          footer={<><button className="btn btn-gold" onClick={createUser} disabled={creating}>{creating ? <><Spinner /> جارٍ...</> : "إنشاء"}</button><button className="btn btn-outline" onClick={() => setModal(false)}>إلغاء</button></>}>
          {err && <div className="alert alert-danger mb-4">⚠️ {err}</div>}
          <div className="fg">
            <div className="fgroup"><label className="flabel">الاسم الكامل</label><input className="finput" value={form.full_name} onChange={e=>setForm(p=>({...p,full_name:e.target.value}))} /></div>
            <div className="fgroup"><label className="flabel">البريد الإلكتروني</label><input className="finput" type="email" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} dir="ltr" /></div>
            <div className="fgroup"><label className="flabel">كلمة المرور</label><input className="finput" type="password" value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))} dir="ltr" /></div>
            <div className="fgroup">
              <label className="flabel">الدور</label>
              <select className="fselect" value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))}>
                {Object.entries(USER_ROLES).map(([r,l]) => <option key={r} value={r}>{l}</option>)}
              </select>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ============================================================
// DASHBOARD
// ============================================================
const Dashboard = () => {
  const { data: orders } = useDB("orders");
  const { data: inventory } = useDB("inventory");
  const { data: debts } = useDB("debts");

  const todayD = new Date(); todayD.setHours(0,0,0,0);
  const totalSales = orders.filter(o=>o.payment_status==="مدفوع كامل").reduce((s,o)=>s+(o.total||0),0);
  const newOrders = orders.filter(o=>o.status==="جديد").length;
  const inProd = orders.filter(o=>["في القص","في الخياطة","في الطرز/العقاد","في التشطيب"].includes(o.status)).length;
  const late = orders.filter(o=>o.delivery_date&&new Date(o.delivery_date)<todayD&&!["تم التسليم","ملغي"].includes(o.status)).length;
  const ready = orders.filter(o=>o.status==="جاهز للتسليم").length;
  const custDebts = debts.filter(d=>d.direction==="لنا").reduce((s,d)=>s+((d.amount||0)-(d.paid||0)),0);
  const lowStock = inventory.filter(i=>i.quantity<(i.low_stock_threshold||5)).length;
  const recent = [...orders].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,6);

  return (
    <div className="fade-in">
      {late > 0 && <div className="alert alert-danger mb-4">⚠️ {late} طلب{late>1?"ات":""} متأخرة عن موعد التسليم!</div>}
      {ready > 0 && <div className="alert alert-success mb-4">✅ {ready} طلب{ready>1?"ات":""} جاهزة للتسليم</div>}
      {lowStock > 0 && <div className="alert alert-warn mb-4">📦 {lowStock} صنف في المخزون بكمية منخفضة</div>}
      <div className="g4 mb-4">
        <StatCard icon="💰" label="إجمالي المبيعات" value={formatCurrency(totalSales)} />
        <StatCard icon="🆕" label="طلبات جديدة" value={newOrders} color="var(--blue)" />
        <StatCard icon="✂️" label="قيد الإنتاج" value={inProd} color="var(--gold)" />
        <StatCard icon="✅" label="جاهز للتسليم" value={ready} color="var(--green)" />
      </div>
      <div className="g4 mb-4">
        <StatCard icon="⏰" label="طلبات متأخرة" value={late} color={late>0?"var(--red)":"var(--green)"} />
        <StatCard icon="💳" label="ديون على العملاء" value={formatCurrency(custDebts)} color="var(--red)" />
        <StatCard icon="📦" label="أصناف المخزون" value={inventory.length} sub={lowStock>0?`${lowStock} منخفض`:"جيد"} />
        <StatCard icon="📋" label="إجمالي الطلبات" value={orders.length} />
      </div>
      <div className="g2">
        <div>
          <div className="sec-header mb-4 mt-4"><div className="sec-title">آخر <span>الطلبات</span></div></div>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>رقم</th><th>العميل</th><th>الحالة</th><th>المبلغ</th></tr></thead>
              <tbody>
                {recent.length === 0 && <tr><td colSpan={4}><EmptyState icon="📋" msg="لا توجد طلبات" /></td></tr>}
                {recent.map(o=>(
                  <tr key={o.id}>
                    <td className="text-gold font-bold">#{o.order_num}</td>
                    <td>{o.customer_name}</td>
                    <td><StatusBadge status={o.status} /></td>
                    <td>{formatCurrency(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <div className="sec-header mb-4 mt-4"><div className="sec-title">توزيع <span>الحالات</span></div></div>
          <div className="flex flex-col gap-2">
            {ORDER_STATUSES.map(s=>{
              const count = orders.filter(o=>o.status===s).length;
              return (
                <div key={s} className="card" style={{padding:"9px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <StatusBadge status={s} />
                  <span style={{fontWeight:700,color:count>0?"var(--gold)":"var(--text-muted)"}}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// CUSTOMERS
// ============================================================
const Customers = () => {
  const { data: customers, loading, insert, update, remove } = useDB("customers", "*", "created_at", false);
  const { data: orders } = useDB("orders", "customer_id", "created_at", false);
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState(null);
  const [form, setForm] = useState({ name:"", phone:"", whatsapp:"", country:"المغرب", city:"", type:"زبون فردي", notes:"" });

  const filtered = customers.filter(c => c.name?.includes(search) || c.phone?.includes(search) || c.city?.includes(search));

  const save = async () => {
    if (!form.name) return alert("الاسم مطلوب");
    try {
      if (modal === "add") await insert({ name:form.name, phone:form.phone, whatsapp:form.whatsapp, country:form.country, city:form.city, type:form.type, notes:form.notes });
      else await update(form.id, { name:form.name, phone:form.phone, whatsapp:form.whatsapp, country:form.country, city:form.city, type:form.type, notes:form.notes });
      setModal(null);
    } catch(e) { alert(e.message); }
  };

  const del = async (id) => { if (confirm("حذف هذا العميل؟")) await remove(id); };
  const custOrders = (id) => orders.filter(o=>o.customer_id===id).length;

  if (loading) return <div className="text-center mt-4"><Spinner /></div>;

  return (
    <div className="fade-in">
      <div className="sec-header">
        <div className="sec-title">إدارة <span>العملاء</span></div>
        <div className="flex gap-2">
          <input className="sbar" placeholder="🔍 بحث..." value={search} onChange={e=>setSearch(e.target.value)} />
          <button className="btn btn-gold" onClick={() => { setForm({name:"",phone:"",whatsapp:"",country:"المغرب",city:"",type:"زبون فردي",notes:""}); setModal("add"); }}>+ عميل جديد</button>
        </div>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>الاسم</th><th>الهاتف</th><th>المدينة</th><th>النوع</th><th>الطلبات</th><th>إجراءات</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={6}><EmptyState icon="👥" msg="لا يوجد عملاء" /></td></tr>}
            {filtered.map(c=>(
              <tr key={c.id}>
                <td className="font-bold">{c.name}</td>
                <td dir="ltr">{c.phone}</td>
                <td>{c.city}، {c.country}</td>
                <td><span className="badge badge-gold">{c.type}</span></td>
                <td>{custOrders(c.id)}</td>
                <td>
                  <div className="flex gap-2">
                    <button className="btn btn-sm btn-outline" onClick={() => setView(c)}>👁</button>
                    <button className="btn btn-sm btn-outline" onClick={() => { setForm(c); setModal("edit"); }}>✏️</button>
                    <button className="btn btn-sm btn-wa" onClick={() => sendWA(c.whatsapp||c.phone, `السلام عليكم ${c.name} 🌙\n`)}>📱</button>
                    <button className="btn btn-sm btn-danger" onClick={() => del(c.id)}>🗑</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(modal==="add"||modal==="edit") && (
        <Modal title={modal==="add"?"عميل جديد":"تعديل عميل"} onClose={() => setModal(null)}
          footer={<><button className="btn btn-gold" onClick={save}>💾 حفظ</button><button className="btn btn-outline" onClick={() => setModal(null)}>إلغاء</button></>}>
          <div className="fg">
            {[["name","الاسم الكامل"],["phone","الهاتف"],["whatsapp","واتساب"],["city","المدينة"],["country","الدولة"]].map(([k,l])=>(
              <div className="fgroup" key={k}><label className="flabel">{l}</label><input className="finput" value={form[k]||""} onChange={e=>setForm(p=>({...p,[k]:e.target.value}))} /></div>
            ))}
            <div className="fgroup">
              <label className="flabel">النوع</label>
              <select className="fselect" value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))}>
                {CUSTOMER_TYPES.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="fgroup fg-full"><label className="flabel">ملاحظات</label><textarea className="ftextarea" value={form.notes||""} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} /></div>
          </div>
        </Modal>
      )}
      {view && (
        <Modal title={`ملف: ${view.name}`} onClose={() => setView(null)}>
          <div className="g2 mb-4">
            {[["الاسم","name"],["الهاتف","phone"],["واتساب","whatsapp"],["الدولة","country"],["المدينة","city"],["النوع","type"]].map(([l,k])=>(
              <div key={k}><div className="card-title">{l}</div><div style={{fontWeight:600}}>{view[k]||"—"}</div></div>
            ))}
          </div>
          {view.notes && <div className="alert alert-info mb-4">📝 {view.notes}</div>}
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-wa btn-sm" onClick={() => sendWA(view.whatsapp||view.phone, waMessages.measures(view.name))}>📏 طلب مقاسات</button>
            <button className="btn btn-wa btn-sm" onClick={() => sendWA(view.whatsapp||view.phone, waMessages.followup(view.name))}>🌟 متابعة</button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ============================================================
// ORDERS
// ============================================================
const Orders = () => {
  const { data: orders, loading, insert, update, remove } = useDB("orders", "*", "created_at", false);
  const { data: customers } = useDB("customers", "id,name,phone,whatsapp", "name", true);
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("الكل");
  const [view, setView] = useState(null);
  const [saving, setSaving] = useState(false);

  const df = { customer_id:"", customer_name:"", phone:"", whatsapp:"", order_type:"خياطة حسب الطلب", cloth_type:"جلابة", fabric:"شعرة حرة", color:"", stitch_type:"", total:0, advance:0, payment_status:"غير مدفوع", status:"جديد", order_date:today(), delivery_date:"", notes:"" };
  const [form, setForm] = useState(df);

  const filtered = orders.filter(o => {
    const ms = o.customer_name?.includes(search) || String(o.order_num||"").includes(search);
    const mst = filterStatus === "الكل" || o.status === filterStatus;
    return ms && mst;
  });

  const save = async () => {
    if (!form.customer_name) return alert("اسم العميل مطلوب");
    setSaving(true);
    try {
      const payload = { customer_id:form.customer_id||null, customer_name:form.customer_name, phone:form.phone, whatsapp:form.whatsapp, order_type:form.order_type, cloth_type:form.cloth_type, fabric:form.fabric, color:form.color, stitch_type:form.stitch_type, total:+form.total, advance:+form.advance, payment_status:form.payment_status, status:form.status, order_date:form.order_date, delivery_date:form.delivery_date||null, notes:form.notes };
      if (modal === "add") await insert(payload);
      else await update(form.id, payload);
      setModal(null);
    } catch(e) { alert(e.message); }
    setSaving(false);
  };

  const changeStatus = async (id, status) => { try { await update(id, { status }); } catch(e) { alert(e.message); } };
  const del = async (id) => { if (confirm("حذف الطلب؟")) await remove(id); };

  const todayD = new Date(); todayD.setHours(0,0,0,0);
  const isLate = o => o.delivery_date && new Date(o.delivery_date) < todayD && !["تم التسليم","ملغي"].includes(o.status);

  if (loading) return <div className="text-center mt-4"><Spinner /></div>;

  return (
    <div className="fade-in">
      <div className="sec-header">
        <div className="sec-title">إدارة <span>الطلبات</span></div>
        <div className="flex gap-2 items-center flex-wrap">
          <select className="sbselect" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
            <option>الكل</option>
            {ORDER_STATUSES.map(s=><option key={s}>{s}</option>)}
          </select>
          <input className="sbar" placeholder="🔍 بحث..." value={search} onChange={e=>setSearch(e.target.value)} />
          <button className="btn btn-gold" onClick={() => { setForm(df); setModal("add"); }}>+ طلب جديد</button>
        </div>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>رقم</th><th>العميل</th><th>اللباس</th><th>الحالة</th><th>الدفع</th><th>المبلغ</th><th>الباقي</th><th>التسليم</th><th>إجراءات</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={9}><EmptyState icon="📋" msg="لا توجد طلبات" /></td></tr>}
            {filtered.map(o=>(
              <tr key={o.id} style={isLate(o)?{background:"rgba(239,68,68,0.04)"}:{}}>
                <td className="text-gold font-bold">#{o.order_num}</td>
                <td>{o.customer_name} {isLate(o)&&"⚠️"}</td>
                <td>{o.cloth_type}</td>
                <td>
                  <select className="sbselect" value={o.status} onChange={e=>changeStatus(o.id,e.target.value)} style={{background:`${STATUS_COLORS[o.status]}1a`,color:STATUS_COLORS[o.status]}}>
                    {ORDER_STATUSES.map(s=><option key={s}>{s}</option>)}
                  </select>
                </td>
                <td><span className={`badge ${o.payment_status==="مدفوع كامل"?"badge-green":o.payment_status==="عربون مدفوع"?"badge-gold":"badge-red"}`}>{o.payment_status}</span></td>
                <td>{formatCurrency(o.total)}</td>
                <td className={((o.total||0)-(o.advance||0))>0?"text-red":"text-green"}>{formatCurrency((o.total||0)-(o.advance||0))}</td>
                <td style={{color:isLate(o)?"var(--red)":"var(--text)"}}>{formatDate(o.delivery_date)}</td>
                <td>
                  <div className="flex gap-2">
                    <button className="btn btn-sm btn-outline" onClick={() => setView(o)}>👁</button>
                    <button className="btn btn-sm btn-outline" onClick={() => { setForm(o); setModal("edit"); }}>✏️</button>
                    <button className="btn btn-sm btn-danger" onClick={() => del(o.id)}>🗑</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(modal==="add"||modal==="edit") && (
        <Modal title={modal==="add"?"طلب جديد":"تعديل طلب"} onClose={() => setModal(null)}
          footer={<><button className="btn btn-gold" onClick={save} disabled={saving}>{saving?<><Spinner /> جارٍ...</>:"💾 حفظ"}</button><button className="btn btn-outline" onClick={() => setModal(null)}>إلغاء</button></>}>
          <div className="fg">
            <div className="fgroup">
              <label className="flabel">العميل</label>
              <select className="fselect" value={form.customer_id||""} onChange={e=>{const c=customers.find(x=>x.id===e.target.value);setForm(p=>({...p,customer_id:e.target.value,customer_name:c?.name||"",phone:c?.phone||"",whatsapp:c?.whatsapp||c?.phone||""}));}}>
                <option value="">-- اختر عميل --</option>
                {customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="fgroup"><label className="flabel">أو اكتب الاسم</label><input className="finput" value={form.customer_name||""} onChange={e=>setForm(p=>({...p,customer_name:e.target.value}))} /></div>
            <div className="fgroup"><label className="flabel">نوع الطلب</label><select className="fselect" value={form.order_type} onChange={e=>setForm(p=>({...p,order_type:e.target.value}))}>{["جاهز","خياطة حسب الطلب","جملة"].map(t=><option key={t}>{t}</option>)}</select></div>
            <div className="fgroup"><label className="flabel">نوع اللباس</label><select className="fselect" value={form.cloth_type} onChange={e=>setForm(p=>({...p,cloth_type:e.target.value}))}>{CLOTH_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
            <div className="fgroup"><label className="flabel">نوع القماش</label><select className="fselect" value={form.fabric} onChange={e=>setForm(p=>({...p,fabric:e.target.value}))}>{FABRIC_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
            <div className="fgroup"><label className="flabel">اللون</label><input className="finput" value={form.color||""} onChange={e=>setForm(p=>({...p,color:e.target.value}))} /></div>
            <div className="fgroup"><label className="flabel">نوع الخياطة</label><input className="finput" value={form.stitch_type||""} onChange={e=>setForm(p=>({...p,stitch_type:e.target.value}))} /></div>
            <div className="fgroup"><label className="flabel">الحالة</label><select className="fselect" value={form.status} onChange={e=>setForm(p=>({...p,status:e.target.value}))}>{ORDER_STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
            <div className="fgroup"><label className="flabel">الإجمالي (د.م)</label><input className="finput" type="number" value={form.total||""} onChange={e=>setForm(p=>({...p,total:+e.target.value}))} /></div>
            <div className="fgroup"><label className="flabel">العربون (د.م)</label><input className="finput" type="number" value={form.advance||""} onChange={e=>setForm(p=>({...p,advance:+e.target.value}))} /></div>
            <div className="fgroup"><label className="flabel">حالة الدفع</label><select className="fselect" value={form.payment_status} onChange={e=>setForm(p=>({...p,payment_status:e.target.value}))}>{PAYMENT_STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
            <div className="fgroup"><label className="flabel">تاريخ الطلب</label><input className="finput" type="date" value={form.order_date||today()} onChange={e=>setForm(p=>({...p,order_date:e.target.value}))} /></div>
            <div className="fgroup"><label className="flabel">تاريخ التسليم</label><input className="finput" type="date" value={form.delivery_date||""} onChange={e=>setForm(p=>({...p,delivery_date:e.target.value}))} /></div>
            <div className="fgroup fg-full"><label className="flabel">ملاحظات</label><textarea className="ftextarea" value={form.notes||""} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} /></div>
          </div>
        </Modal>
      )}
      {view && (
        <Modal title={`طلب #${view.order_num}`} onClose={() => setView(null)}>
          <div className="g2 mb-4">
            {[["العميل",view.customer_name],["اللباس",view.cloth_type],["القماش",view.fabric],["اللون",view.color||"—"],["الإجمالي",formatCurrency(view.total)],["العربون",formatCurrency(view.advance)],["الباقي",formatCurrency((view.total||0)-(view.advance||0))],["التسليم",formatDate(view.delivery_date)]].map(([l,v])=>(
              <div key={l}><div className="card-title">{l}</div><div style={{fontWeight:600}}>{v}</div></div>
            ))}
          </div>
          <div className="flex gap-2 mb-4 flex-wrap">
            <StatusBadge status={view.status} />
            <span className={`badge ${view.payment_status==="مدفوع كامل"?"badge-green":view.payment_status==="عربون مدفوع"?"badge-gold":"badge-red"}`}>{view.payment_status}</span>
          </div>
          {view.notes && <div className="alert alert-info mb-4">📝 {view.notes}</div>}
          <div style={{fontWeight:700,color:"var(--gold)",marginBottom:8}}>رسائل واتساب</div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-wa btn-sm" onClick={() => sendWA(view.whatsapp||view.phone, waMessages.confirm(view.customer_name,view.order_num,view.total,view.advance))}>✅ تأكيد</button>
            <button className="btn btn-wa btn-sm" onClick={() => sendWA(view.whatsapp||view.phone, waMessages.measures(view.customer_name))}>📏 مقاسات</button>
            <button className="btn btn-wa btn-sm" onClick={() => sendWA(view.whatsapp||view.phone, waMessages.payment(view.customer_name,(view.total||0)-(view.advance||0)))}>💰 تذكير دفع</button>
            <button className="btn btn-wa btn-sm" onClick={() => sendWA(view.whatsapp||view.phone, waMessages.ready(view.customer_name,view.order_num))}>🎉 جاهز</button>
            <button className="btn btn-wa btn-sm" onClick={() => sendWA(view.whatsapp||view.phone, waMessages.shipped(view.customer_name))}>📦 شحن</button>
            <button className="btn btn-wa btn-sm" onClick={() => sendWA(view.whatsapp||view.phone, waMessages.followup(view.customer_name))}>🌟 متابعة</button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ============================================================
// NAVIGATION
// ============================================================
const NAV = [
  { section:"الرئيسية", items:[{id:"dashboard",icon:"🏠",label:"لوحة التحكم",roles:["admin","sales","accountant"]}]},
  { section:"إدارة الأعمال", items:[
    {id:"orders",icon:"📋",label:"الطلبات",roles:["admin","sales","tailor"]},
    {id:"customers",icon:"👥",label:"العملاء",roles:["admin","sales"]},
  ]},
  { section:"المالية", items:[
    {id:"debts",icon:"💳",label:"الديون",roles:["admin","accountant"]},
    {id:"reports",icon:"📊",label:"التقارير",roles:["admin","accountant"]},
  ]},
  { section:"الإدارة", items:[
    {id:"users",icon:"👤",label:"المستخدمون",roles:["admin"]},
  ]},
];

const PAGE_TITLES = {
  dashboard:"لوحة التحكم", orders:"إدارة الطلبات",
  customers:"إدارة العملاء", debts:"الديون",
  reports:"التقارير", users:"إدارة المستخدمين",
};

// ============================================================
// MAIN APP
// ============================================================
export default function HamoviApp() {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [profile, setProfile] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadProfile(session.user.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
      if (session) loadProfile(session.user.id);
      else setProfile(null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (uid) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", uid).single();
    setProfile(data);
  };

  const signOut = () => supabase.auth.signOut();

  // Loading
  if (session === undefined) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#080808"}}>
      <style>{styles}</style>
      <div className="text-center"><div className="spinner" style={{width:40,height:40,borderWidth:3}} /><p className="mt-4 text-gold">جارٍ التحميل...</p></div>
    </div>
  );

  // Auth
  if (!session) return <><style>{styles}</style><AuthPage /></>;

  const canSee = (roles) => !roles || !profile || roles.includes(profile?.role);

  const renderPage = () => {
    switch(page) {
      case "dashboard": return <Dashboard />;
      case "orders": return <Orders />;
      case "customers": return <Customers />;
      case "users": return profile?.role === "admin" ? <UsersPage /> : <div className="empty"><div className="ico">🚫</div><p>غير مصرح لك</p></div>;
      default: return <Dashboard />;
    }
  };

  const dateStr = new Date().toLocaleDateString("ar-MA",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
  const { data: orders } = { data: [] }; // placeholder for badge count

  return (
    <>
      <style>{styles}</style>
      <AuthContext.Provider value={{ session, profile, signOut }}>
        <div className="app">
          {sidebarOpen && <div onClick={() => setSidebarOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99}} />}
          <aside className={`sidebar ${sidebarOpen?"open":""}`}>
            <div className="sidebar-logo">
              <div style={{color:"var(--gold-dark)",fontSize:"0.9rem"}}>✦ ✦ ✦</div>
              <h1>HAMOVI</h1>
              <p>الأناقة المغربية الفاخرة</p>
            </div>
            <nav style={{flex:1, padding:"10px 0"}}>
              {NAV.map(sec => (
                <div key={sec.section}>
                  <div className="nav-section">{sec.section}</div>
                  {sec.items.filter(i => canSee(i.roles)).map(item => (
                    <div key={item.id} className={`nav-item ${page===item.id?"active":""}`} onClick={() => { setPage(item.id); setSidebarOpen(false); }}>
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              ))}
            </nav>
            <div className="sidebar-footer">
              <div style={{fontWeight:600,color:"var(--text)",marginBottom:4}}>{profile?.full_name || "—"}</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span className="role-badge">{USER_ROLES[profile?.role] || "مستخدم"}</span>
                <button className="btn btn-sm btn-danger" onClick={signOut}>خروج</button>
              </div>
            </div>
          </aside>
          <main className="main">
            <div className="topbar">
              <div className="flex gap-2 items-center">
                <button className="mob-btn" onClick={() => setSidebarOpen(true)}>☰</button>
                <div className="topbar-title">{PAGE_TITLES[page]}</div>
              </div>
              <div style={{fontSize:"0.72rem",color:"var(--text-muted)"}}>{dateStr}</div>
            </div>
            <div className="content">{renderPage()}</div>
          </main>
        </div>
      </AuthContext.Provider>
    </>
  );
}
