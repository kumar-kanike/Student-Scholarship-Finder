import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

const type = process.env.PROJECT_TYPE;
const configs = {
  grievance: { collection: 'grievances', actions: 'comments', public: false, initial: 'open' },
  food: { collection: 'donations', actions: 'claims', public: true, initial: 'available' },
  healthcare: { collection: 'appointments', actions: 'medicalRecords', public: false, initial: 'pending' },
  scholarship: { collection: 'scholarships', actions: 'applications', public: true, initial: 'active' },
};
const config = configs[type];
if (!config) throw new Error('Set PROJECT_TYPE to grievance, food, healthcare, or scholarship.');
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters.');
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(v => v.trim()) }));
app.use(express.json({ limit: '64kb' }));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 250, standardHeaders: 'draft-7', legacyHeaders: false }));

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true, maxlength: 254 },
  passwordHash: { type: String, required: true },
}, { timestamps: true });
const resourceSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  status: { type: String, default: config.initial, index: true },
  claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, collection: config.collection });
const actionSchema = new mongoose.Schema({
  resourceId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true, collection: config.actions });

const User = mongoose.models.User || mongoose.model('User', userSchema, 'users');
const Resource = mongoose.models.Resource || mongoose.model('Resource', resourceSchema, config.collection);
const Action = mongoose.models.Action || mongoose.model('Action', actionSchema, config.actions);
const isId = value => mongoose.Types.ObjectId.isValid(value);
const dto = doc => ({ id: String(doc._id), ...doc.data, status: doc.status, createdAt: doc.createdAt, updatedAt: doc.updatedAt });

function auth(req, res, next) {
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!isId(payload.sub)) throw new Error('Invalid token subject');
    req.user = { id: payload.sub };
    next();
  } catch {
    res.status(401).json({ message: 'Please sign in to continue.' });
  }
}
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.get('/', (_req, res) => res.json({ name: process.env.APP_NAME || 'Project API', status: 'ok' }));
app.get('/api/health', wrap(async (_req, res) => {
  await mongoose.connection.db.admin().ping();
  res.json({ status: 'ok', database: 'connected', project: type });
}));
app.post('/api/auth/register', wrap(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (name.length < 2 || name.length > 80) return res.status(400).json({ message: 'Enter a name between 2 and 80 characters.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Enter a valid email address.' });
  if (password.length < 8 || password.length > 72) return res.status(400).json({ message: 'Password must be 8-72 characters.' });
  const exists = await User.findOne({ email }).lean();
  if (exists) return res.status(409).json({ message: 'An account with this email already exists.' });
  const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12) });
  res.status(201).json({ token: jwt.sign({ sub: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1d' }), user: { id: String(user._id), name, email } });
}));
app.post('/api/auth/login', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.passwordHash))) return res.status(401).json({ message: 'Email or password is incorrect.' });
  res.json({ token: jwt.sign({ sub: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1d' }), user: { id: String(user._id), name: user.name, email: user.email } });
}));
app.get('/api/profile', auth, wrap(async (req, res) => {
  const user = await User.findById(req.user.id).select('name email').lean();
  if (!user) return res.status(404).json({ message: 'Account not found.' });
  res.json({ id: String(user._id), name: user.name, email: user.email });
}));

const requiredFields = {
  grievance: ['title', 'category', 'location', 'description'],
  food: ['foodName', 'quantity', 'unit', 'pickupAddress', 'expiryDate'],
  healthcare: ['patientName', 'phone', 'doctorName', 'appointmentDate', 'village', 'reason'],
  scholarship: ['scholarshipName', 'provider', 'educationLevel', 'amount', 'deadline', 'eligibility'],
};
function validateData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'Provide valid form data.';
  for (const field of requiredFields[type]) {
    const value = data[field];
    if (value === undefined || value === null || String(value).trim() === '') return `The ${field} field is required.`;
    if (String(value).length > 2000) return `The ${field} field is too long.`;
  }
  if (type === 'food' && (!Number.isFinite(Number(data.quantity)) || Number(data.quantity) <= 0)) return 'Quantity must be greater than zero.';
  if (type === 'scholarship' && (!Number.isFinite(Number(data.amount)) || Number(data.amount) < 0)) return 'Award amount must be zero or greater.';
  return null;
}
app.get('/api/items', ...(config.public ? [] : [auth]), wrap(async (req, res) => {
  const filter = config.public ? { status: { $ne: 'archived' } } : { ownerId: req.user.id };
  const items = await Resource.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  res.json(items.map(dto));
}));
app.post('/api/items', auth, wrap(async (req, res) => {
  const error = validateData(req.body.data);
  if (error) return res.status(400).json({ message: error });
  const item = await Resource.create({ ownerId: req.user.id, data: req.body.data, status: config.initial });
  res.status(201).json(dto(item));
}));
app.post('/api/items/:id/action', auth, wrap(async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ message: 'Item not found.' });
  const item = await Resource.findById(req.params.id);
  if (!item) return res.status(404).json({ message: 'Item not found.' });
  if (type === 'food') {
    if (String(item.ownerId) === req.user.id) return res.status(403).json({ message: 'You cannot claim your own donation.' });
    if (item.status !== 'available') return res.status(409).json({ message: 'This donation is no longer available.' });
    item.status = 'claimed'; item.claimedBy = req.user.id; await item.save();
    await Action.create({ resourceId: item._id, userId: req.user.id, data: { status: 'claimed' } });
  } else if (type === 'scholarship') {
    const already = await Action.findOne({ resourceId: item._id, userId: req.user.id });
    if (already) return res.status(409).json({ message: 'You have already applied to this scholarship.' });
    await Action.create({ resourceId: item._id, userId: req.user.id, data: { applicantName: req.body.applicantName || '', institution: req.body.institution || '', statement: req.body.statement || '' } });
  } else if (type === 'grievance') {
    const message = String(req.body.message || '').trim();
    if (!message || message.length > 1000) return res.status(400).json({ message: 'Comment must contain 1-1000 characters.' });
    await Action.create({ resourceId: item._id, userId: req.user.id, data: { message } });
  } else {
    return res.status(400).json({ message: 'This item does not support that action.' });
  }
  res.status(201).json({ message: type === 'food' ? 'Donation claimed.' : type === 'scholarship' ? 'Application submitted.' : 'Comment added.' });
}));
app.get('/api/actions', auth, wrap(async (req, res) => {
  const actions = await Action.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(100).lean();
  res.json(actions.map(a => ({ id: String(a._id), resourceId: String(a.resourceId), data: a.data, createdAt: a.createdAt })));
}));
app.use((req, res) => res.status(404).json({ message: 'Route not found.' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  if (err?.code === 11000) return res.status(409).json({ message: 'An account with this email already exists.' });
  res.status(500).json({ message: 'Unexpected server error.' });
});

async function start() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB });
  app.listen(Number(process.env.PORT || 5000), '0.0.0.0', () => console.log(`${process.env.APP_NAME || type} API listening on port ${process.env.PORT || 5000}`));
}
start().catch(error => { console.error('API startup failed:', error.message); process.exit(1); });
