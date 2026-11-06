import { useEffect, useState } from 'react';
import './App.css';

const config = {
  "title": "Student Scholarship Finder",
  "short": "Discover scholarship opportunities, compare eligibility and deadlines, and submit applications from one place.",
  "noun": "Scholarship",
  "fields": [
    {
      "name": "scholarshipName",
      "label": "Scholarship name",
      "type": "text"
    },
    {
      "name": "provider",
      "label": "Provider / organization",
      "type": "text"
    },
    {
      "name": "educationLevel",
      "label": "Education level",
      "type": "select:Class 10|Class 12|Diploma|Undergraduate|Postgraduate"
    },
    {
      "name": "amount",
      "label": "Award amount (INR)",
      "type": "number"
    },
    {
      "name": "deadline",
      "label": "Application deadline",
      "type": "date"
    },
    {
      "name": "eligibility",
      "label": "Eligibility criteria",
      "type": "textarea"
    }
  ],
  "actionLabel": "Apply",
  "type": "scholarship"
};
const blank = Object.fromEntries(config.fields.map(f => [f.name, '']));
const API = import.meta.env.VITE_API_URL || '';
async function request(path, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}), ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Request failed (${response.status})`);
  return data;
}
function App() {
  const [token, setToken] = useState(() => localStorage.getItem('scholarship_token') || '');
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState('login');
  const [auth, setAuth] = useState({ name: '', email: '', password: '' });
  const [form, setForm] = useState(blank);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [comment, setComment] = useState({});
  async function load(access = token) {
    const [profile, rows] = await Promise.all([
      request('/api/profile', { token: access }),
      request('/api/items', { token: access }),
    ]);
    setUser(profile); setItems(rows);
  }
  useEffect(() => { if (token) load().catch(e => { setError(e.message); localStorage.removeItem('scholarship_token'); setToken(''); }); }, [token]);
  async function submitAuth(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const result = await request(mode === 'register' ? '/api/auth/register' : '/api/auth/login', { method: 'POST', body: JSON.stringify(auth) });
      localStorage.setItem('scholarship_token', result.token); setUser(result.user); setToken(result.token);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function submitItem(e) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      await request('/api/items', { method: 'POST', token, body: JSON.stringify({ data: form }) });
      setForm(blank); await load(); setNotice(`${config.noun} submitted successfully.`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function doAction(item) {
    let payload = {};
    if (config.type === 'grievance') {
      const message = comment[item.id] || '';
      if (!message.trim()) return setError('Write a comment first.');
      payload = { message };
    }
    if (config.type === 'scholarship') payload = { applicantName: user?.name, institution: '', statement: 'Application submitted through the Student Scholarship Finder.' };
    try {
      await request(`/api/items/${item.id}/action`, { method: 'POST', token, body: JSON.stringify(payload) });
      setComment({ ...comment, [item.id]: '' }); await load(); setNotice(config.type === 'food' ? 'Donation claimed.' : config.type === 'scholarship' ? 'Application submitted.' : 'Comment added.');
    } catch (e) { setError(e.message); }
  }
  function logout() { localStorage.removeItem('scholarship_token'); setToken(''); setUser(null); setItems([]); }
  if (!token) return <main className="auth"><section className="auth-card"><div className="brand-mark">◎</div><p className="eyebrow">COMMUNITY PLATFORM</p><h1>{config.title}</h1><p className="muted">{config.short}</p><form onSubmit={submitAuth}>
    {mode === 'register' && <label>Your name<input required value={auth.name} onChange={e=>setAuth({...auth,name:e.target.value})}/></label>}
    <label>Email<input type="email" required value={auth.email} onChange={e=>setAuth({...auth,email:e.target.value})}/></label>
    <label>Password<input type="password" minLength="8" required value={auth.password} onChange={e=>setAuth({...auth,password:e.target.value})}/></label>
    <button disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
  </form><p className="switch">{mode === 'login' ? 'New user?' : 'Already registered?'} <button className="link" onClick={()=>{setMode(mode === 'login' ? 'register' : 'login');setError('')}}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p>{error && <p className="error">{error}</p>}</section></main>;
  return <main className="shell"><header><div><span className="eyebrow">COMMUNITY PLATFORM</span><h1>{config.title}</h1><p>{config.short}</p></div><div className="user"><span>{user?.name || 'Account'}</span><button className="outline" onClick={logout}>Sign out</button></div></header>
    {error && <p className="error banner">{error}</p>}{notice && <p className="notice banner">{notice}</p>}
    <section className="layout"><form className="panel" onSubmit={submitItem}><span className="eyebrow">NEW SUBMISSION</span><h2>Create {config.noun.toLowerCase()}</h2>
      {config.fields.map(f => <label key={f.name}>{f.label}{f.type.startsWith('select:') ? <select required value={form[f.name]} onChange={e=>setForm({...form,[f.name]:e.target.value})}><option value="">Choose…</option>{f.type.slice(7).split('|').map(v=><option key={v}>{v}</option>)}</select> : f.type === 'textarea' ? <textarea required rows="3" value={form[f.name]} onChange={e=>setForm({...form,[f.name]:e.target.value})}/> : <input required type={f.type} min={f.type === 'number' ? '1' : undefined} value={form[f.name]} onChange={e=>setForm({...form,[f.name]:e.target.value})}/>}</label>)}
      <button disabled={busy}>{busy ? 'Saving…' : `Submit ${config.noun}`}</button>
    </form><section className="panel"><div className="list-heading"><div><span className="eyebrow">LATEST RECORDS</span><h2>{config.type === 'food' ? 'Available donations' : config.type === 'scholarship' ? 'Scholarship opportunities' : config.type === 'healthcare' ? 'Your appointment requests' : 'Your grievances'}</h2></div><span className="count">{items.length}</span></div>
      {items.length === 0 ? <div className="empty"><b>No records yet</b><p>New submissions will appear here.</p></div> : <div className="items">{items.map(item=><article className="item" key={item.id}><div className="item-head"><span className="status">{item.status}</span><small>{new Date(item.createdAt).toLocaleString()}</small></div><h3>{item.data[config.fields[0].name]}</h3><dl>{config.fields.slice(1).map(f=><div key={f.name}><dt>{f.label}</dt><dd>{item.data[f.name]}</dd></div>)}</dl>
        {config.actionLabel && (config.type === 'grievance' ? <div className="action"><input placeholder="Add a comment…" value={comment[item.id] || ''} onChange={e=>setComment({...comment,[item.id]:e.target.value})}/><button className="small" onClick={()=>doAction(item)}>Comment</button></div> : <button className="small" disabled={config.type === 'food' && item.status !== 'available'} onClick={()=>doAction(item)}>{config.actionLabel}</button>)}
      </article>)}</div>}
    </section></section><footer>Built with React, Node.js, Express and MongoDB Atlas. Keep personal information private.</footer>
  </main>;
}
export default App;
