import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import session from 'express-session';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize DMXAPI client (OpenAI-compatible)
const dmxai = new OpenAI({
    baseURL: 'https://ssvip.dmxapi.com/v1',
    apiKey: process.env.DMXAPI_KEY,
});

// Create upload directories
const uploadDirs = ['./uploads', './uploads/profiles', './uploads/memes', './uploads/templates', './uploads/gifs'];
uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Middleware
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static('uploads'));
app.use(session({
    secret: 'meme-maker-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ========== SCHEMAS ==========
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true, minlength: 3 },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true, minlength: 6 },
    profilePicture: { type: String, default: 'default-avatar.png' },
    createdAt: { type: Date, default: Date.now }
});

const memeSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    imageUrl: { type: String, required: true },
    title: { type: String, default: 'My Meme' },
    texts: [{ content: String, x: Number, y: Number, fontSize: Number, color: String }],
    likes: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

const templateSchema = new mongoose.Schema({
    name: String,
    imageUrl: String,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});

const gifMemeSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    gifUrl: { type: String, required: true },
    title: { type: String, default: 'My GIF Meme' },
    texts: [{ content: String, x: Number, y: Number, fontSize: Number, color: String }],
    likes: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Meme = mongoose.model('Meme', memeSchema);
const Template = mongoose.model('Template', templateSchema);
const GifMeme = mongoose.model('GifMeme', gifMemeSchema);

// ========== MULTER CONFIGURATIONS ==========
const uploadImage = multer({
    storage: multer.diskStorage({
        destination: './uploads/memes',
        filename: (req, file, cb) => cb(null, 'meme-' + Date.now() + path.extname(file.originalname))
    })
});

const uploadProfile = multer({
    storage: multer.diskStorage({
        destination: './uploads/profiles',
        filename: (req, file, cb) => cb(null, 'profile-' + Date.now() + path.extname(file.originalname))
    })
});

const uploadTemplate = multer({
    storage: multer.diskStorage({
        destination: './uploads/templates',
        filename: (req, file, cb) => cb(null, 'template-' + Date.now() + path.extname(file.originalname))
    })
});

const uploadGif = multer({
    storage: multer.diskStorage({
        destination: './uploads/gifs',
        filename: (req, file, cb) => cb(null, 'gif-' + Date.now() + '.gif')
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'image/gif') {
            cb(null, true);
        } else {
            cb(new Error('Only GIF files are allowed'), false);
        }
    }
});

// ========== FALLBACK CAPTIONS ==========
function getFallbackCaptions() {
    const fallbacks = [
        "When you realize it's Monday tomorrow 😂",
        "That moment when expectations meet reality",
        "POV: You're trying your best",
        "Nobody: ... Me:",
        "This is fine 🔥 Everything is fine",
        "I understood that reference!",
        "Math is math!",
        "Why are you running? WHY ARE YOU RUNNING?",
        "Modern problems require modern solutions",
        "Trust me, I'm an expert",
        "That's what she said!",
        "I'll pretend I didn't see that",
        "My brain trying to remember what I walked into the room for",
        "When the code works but you don't know why",
        "Me explaining my sleep schedule to anyone who asks"
    ];
    return fallbacks.sort(() => 0.5 - Math.random()).slice(0, 5);
}

// ========== AUTH ROUTES ==========
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (await User.findOne({ $or: [{ email }, { username }] })) {
            return res.status(400).json({ message: 'User already exists' });
        }
        const user = new User({ username, email, password: await bcrypt.hash(password, 10) });
        await user.save();
        req.session.userId = user._id;
        req.session.username = user.username;
        res.status(201).json({ user: { id: user._id, username, email } });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        req.session.userId = user._id;
        req.session.username = user.username;
        res.json({ user: { id: user._id, username: user.username, email: user.email } });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/guest-login', (req, res) => {
    const guestId = 'guest-' + Date.now();
    req.session.userId = guestId;
    req.session.username = 'Guest';
    req.session.isGuest = true;
    res.json({ user: { id: guestId, username: 'Guest', isGuest: true } });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Logged out' });
});

app.get('/api/me', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ message: 'Not authenticated' });
    }
    if (req.session.isGuest) {
        return res.json({ id: req.session.userId, username: 'Guest', isGuest: true });
    }
    const user = await User.findById(req.session.userId).select('-password');
    res.json(user);
});

// ========== MEME ROUTES ==========
app.post('/api/upload', uploadImage.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No file' });
    res.json({ url: `/uploads/memes/${req.file.filename}` });
});

app.post('/api/memes', async (req, res) => {
    if (!req.session.userId || req.session.isGuest) {
        return res.status(403).json({ message: 'Login to save' });
    }
    const meme = new Meme({ userId: req.session.userId, ...req.body });
    await meme.save();
    res.status(201).json(meme);
});

app.get('/api/my-memes', async (req, res) => {
    if (!req.session.userId || req.session.isGuest) return res.json([]);
    const memes = await Meme.find({ userId: req.session.userId }).sort({ createdAt: -1 });
    res.json(memes);
});

app.get('/api/trending', async (req, res) => {
    const memes = await Meme.find().sort({ likes: -1, views: -1 }).limit(10).populate('userId', 'username');
    res.json(memes);
});

app.post('/api/memes/:id/like', async (req, res) => {
    const meme = await Meme.findById(req.params.id);
    if (!meme) return res.status(404).json({ message: 'Not found' });
    meme.likes += 1;
    await meme.save();
    res.json({ likes: meme.likes });
});

// ========== AI CAPTION GENERATION (DMXAPI) ==========
app.post('/api/ai-caption-vision', async (req, res) => {
    try {
        const { imageBase64, customPrompt } = req.body;
        
        // If no API key, use fallback
        if (!process.env.DMXAPI_KEY) {
            console.log('DMXAPI key not configured, using fallback captions');
            return res.json({ success: false, suggestions: getFallbackCaptions() });
        }
        
        // If no image, use text-only prompt
        let prompt = customPrompt || `Generate 5 funny, creative meme captions. 
        
Requirements:
- Each caption short (under 15 words)
- Make them clever and relatable
- Return ONLY the 5 captions, one per line
- Do not number them
- Do not add any extra text or explanations`;

        let response;
        
        if (imageBase64) {
            // Vision request with image
            response = await dmxai.chat.completions.create({
                model: 'glm-4.1v-thinking-flash',
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: customPrompt || `Analyze this image and generate 5 funny, creative meme captions. Consider what's happening, expressions, objects, and any text visible. Return ONLY the 5 captions, one per line, no numbers, no extra text.`
                            },
                            {
                                type: 'image_url',
                                image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
                            }
                        ]
                    }
                ],
                max_tokens: 300,
            });
        } else {
            // Text-only request
            response = await dmxai.chat.completions.create({
                model: 'kimi-k2.5-free',
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 300,
            });
        }
        
        const text = response.choices[0].message.content;
        
        // Parse the response into individual captions
        let suggestions = text.split('\n')
            .filter(line => line.trim().length > 0 && line.trim().length < 100)
            .map(line => line.replace(/^\d+\.\s*/, '').replace(/^-\s*/, '').replace(/^\*\s*/, '').trim())
            .slice(0, 5);
        
        if (suggestions.length < 2) {
            suggestions = getFallbackCaptions();
        }
        
        res.json({ success: true, suggestions });
        
    } catch (error) {
        console.error('DMXAPI Error:', error.message);
        // Fallback to random captions
        res.json({ success: false, suggestions: getFallbackCaptions() });
    }
});

// ========== TEMPLATE ROUTES ==========
app.get('/api/templates', async (req, res) => {
    if (!req.session.userId || req.session.isGuest) return res.json([]);
    const templates = await Template.find({ userId: req.session.userId }).sort({ createdAt: -1 });
    res.json(templates.map(t => ({ id: t._id, url: t.imageUrl, name: t.name })));
});

app.post('/api/templates/upload', uploadTemplate.single('image'), async (req, res) => {
    if (!req.session.userId || req.session.isGuest) {
        return res.status(401).json({ message: 'Login required' });
    }
    if (!req.file) return res.status(400).json({ message: 'No file' });
    const { name } = req.body;
    const template = new Template({
        name: name || 'Custom Template',
        imageUrl: `/uploads/templates/${req.file.filename}`,
        userId: req.session.userId
    });
    await template.save();
    res.status(201).json({ template: { id: template._id, name: template.name, url: template.imageUrl } });
});

app.delete('/api/templates/:id', async (req, res) => {
    if (!req.session.userId || req.session.isGuest) {
        return res.status(401).json({ message: 'Login required' });
    }
    const template = await Template.findById(req.params.id);
    if (!template) return res.status(404).json({ message: 'Not found' });
    if (template.userId.toString() !== req.session.userId) {
        return res.status(403).json({ message: 'Not yours' });
    }
    const filePath = path.join(__dirname, template.imageUrl);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await template.deleteOne();
    res.json({ message: 'Deleted' });
});

// ========== GIF MEME ROUTES ==========
app.post('/api/upload-gif', uploadGif.single('gif'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No GIF file uploaded' });
    res.json({ url: `/uploads/gifs/${req.file.filename}`, type: 'gif' });
});

app.post('/api/gif-memes', async (req, res) => {
    if (!req.session.userId || req.session.isGuest) {
        return res.status(403).json({ message: 'Login to save GIF memes' });
    }
    const gifMeme = new GifMeme({ userId: req.session.userId, ...req.body });
    await gifMeme.save();
    res.status(201).json(gifMeme);
});

app.get('/api/my-gif-memes', async (req, res) => {
    if (!req.session.userId || req.session.isGuest) return res.json([]);
    const gifMemes = await GifMeme.find({ userId: req.session.userId }).sort({ createdAt: -1 });
    res.json(gifMemes);
});

app.post('/api/gif-memes/:id/like', async (req, res) => {
    const gifMeme = await GifMeme.findById(req.params.id);
    if (!gifMeme) return res.status(404).json({ message: 'GIF meme not found' });
    gifMeme.likes += 1;
    await gifMeme.save();
    res.json({ likes: gifMeme.likes });
});

// ========== HEALTH CHECK ==========
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ========== DATABASE CONNECTION ==========
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/meme-maker')
    .then(() => {
        console.log('✅ MongoDB connected');
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📁 Uploads directory: ${path.join(__dirname, 'uploads')}`);
            console.log(`🤖 DMXAPI: ${process.env.DMXAPI_KEY ? 'Configured ✅' : 'Not configured ⚠️'}`);
        });
    })
    .catch(err => console.error('MongoDB connection error:', err));