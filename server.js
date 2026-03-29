// server.js - Meme Maker Backend with Working MongoDB Connection
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();

// ============ CONFIGURATION ============
const PORT = 5000;
const SESSION_SECRET = 'meme-maker-secret-2024';

// Create upload directories
const uploadDirs = ['./uploads', './uploads/profiles', './uploads/memes'];
uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// ============ MIDDLEWARE ============
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));
app.use(express.json());
app.use('/uploads', express.static('uploads'));

app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24,
        httpOnly: true
    }
}));

// ============ DATABASE MODELS ============
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
    texts: [{
        content: String,
        x: Number,
        y: Number,
        fontSize: Number,
        color: String
    }],
    likes: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Meme = mongoose.model('Meme', memeSchema);

// ============ MULTER CONFIGURATION ============
const imageStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './uploads/memes');
    },
    filename: (req, file, cb) => {
        cb(null, 'meme-' + Date.now() + path.extname(file.originalname));
    }
});

const profileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './uploads/profiles');
    },
    filename: (req, file, cb) => {
        cb(null, 'profile-' + Date.now() + path.extname(file.originalname));
    }
});

const uploadImage = multer({ storage: imageStorage, limits: { fileSize: 5 * 1024 * 1024 } });
const uploadProfile = multer({ storage: profileStorage, limits: { fileSize: 2 * 1024 * 1024 } });

// ============ TEMPLATES ============
const templates = [
    { id: 1, url: '/templates/drake.jpg', name: 'Drake' },
    { id: 2, url: '/templates/distracted.jpg', name: 'Distracted Boyfriend' },
    { id: 3, url: '/templates/disaster.jpg', name: 'Disaster Girl' },
    { id: 4, url: '/templates/change.jpg', name: 'Change My Mind' }
];

// ============ API ROUTES ============

// Test route
app.get('/api/test', (req, res) => {
    res.json({ message: 'Meme Maker API is running!' });
});

// Get templates
app.get('/api/templates', (req, res) => {
    res.json(templates);
});

// Upload image
app.post('/api/upload', uploadImage.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }
    res.json({ url: `/uploads/memes/${req.file.filename}` });
});

// ============ AUTH ROUTES ============

// Register
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username, email, password: hashedPassword });
        await user.save();

        req.session.userId = user._id;
        req.session.username = user.username;

        res.status(201).json({
            message: 'User created successfully',
            user: { id: user._id, username: user.username, email: user.email }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: error.message });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        req.session.userId = user._id;
        req.session.username = user.username;

        res.json({
            message: 'Login successful',
            user: { id: user._id, username: user.username, email: user.email }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Guest login
app.post('/api/guest-login', (req, res) => {
    const guestId = 'guest-' + Date.now();
    req.session.userId = guestId;
    req.session.username = 'Guest';
    req.session.isGuest = true;
    
    res.json({
        message: 'Guest login successful',
        user: { id: guestId, username: 'Guest', isGuest: true }
    });
});

// Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Logout successful' });
});

// Get current user
app.get('/api/me', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ message: 'Not authenticated' });
    }
    
    try {
        if (req.session.isGuest) {
            return res.json({ id: req.session.userId, username: 'Guest', isGuest: true });
        }
        
        const user = await User.findById(req.session.userId).select('-password');
        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Update profile
app.put('/api/profile', uploadProfile.single('profilePicture'), async (req, res) => {
    try {
        if (req.session.isGuest) {
            return res.status(403).json({ message: 'Guests cannot update profile' });
        }
        
        const updates = {};
        if (req.body.username) updates.username = req.body.username;
        if (req.body.email) updates.email = req.body.email;
        if (req.file) updates.profilePicture = req.file.filename;
        
        const user = await User.findByIdAndUpdate(req.session.userId, updates, { new: true }).select('-password');
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ============ MEME ROUTES ============

// Save meme
app.post('/api/memes', async (req, res) => {
    try {
        if (!req.session.userId || req.session.isGuest) {
            return res.status(403).json({ message: 'Please login to save memes' });
        }
        
        const meme = new Meme({
            userId: req.session.userId,
            ...req.body
        });
        
        await meme.save();
        res.status(201).json(meme);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get user's memes
app.get('/api/my-memes', async (req, res) => {
    try {
        if (!req.session.userId || req.session.isGuest) {
            return res.json([]);
        }
        
        const memes = await Meme.find({ userId: req.session.userId }).sort({ createdAt: -1 });
        res.json(memes);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get trending memes
app.get('/api/trending', async (req, res) => {
    try {
        const memes = await Meme.find().sort({ likes: -1, views: -1 }).limit(10).populate('userId', 'username');
        res.json(memes);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Like a meme
app.post('/api/memes/:id/like', async (req, res) => {
    try {
        const meme = await Meme.findById(req.params.id);
        if (!meme) return res.status(404).json({ message: 'Meme not found' });
        
        meme.likes += 1;
        await meme.save();
        res.json({ likes: meme.likes });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// AI Caption Suggestion
app.post('/api/ai-caption', (req, res) => {
    const suggestions = [
        "When you realize it's Monday tomorrow 😂",
        "That moment when...",
        "Expectation vs Reality",
        "Me explaining my meme to grandma",
        "POV: You're trying to be productive",
        "Nobody: \nMe:",
        "This is fine 🔥",
        "I understood that reference!",
        "Math is math!",
        "Why are you running? WHY ARE YOU RUNNING?"
    ];
    
    const randomSuggestions = suggestions.sort(() => 0.5 - Math.random()).slice(0, 5);
    res.json({ suggestions: randomSuggestions });
});

// ============ DATABASE CONNECTION ============
// USING YOUR WORKING CONNECTION STRING
const MONGODB_URI = 'mongodb+srv://meme_user:test123@cluster0.d8es2s1.mongodb.net/meme-maker?retryWrites=true&w=majority';

console.log('🎨 Meme Maker Backend Starting...');
console.log('🔄 Connecting to MongoDB Atlas...');
console.log('📊 Database: meme-maker');

mongoose.connect(MONGODB_URI)
.then(() => {
    console.log('✅ MongoDB Atlas connected successfully!');
    console.log('🎉 Meme Maker database is ready!');
    app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
        console.log(`📁 Uploads folder: ${path.join(__dirname, 'uploads')}`);
        console.log('\n✨ Meme Maker is ready!');
        console.log('📍 Frontend should run on: http://localhost:3000');
        console.log('📍 Test API: http://localhost:5000/api/test');
    });
})
.catch(err => {
    console.error('❌ MongoDB connection error:', err);
    console.log('\n💡 Check your connection string in server.js');
    process.exit(1);
});