const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const path = require('path');

// Models
const User = require('./models/User');
const Quote = require('./models/Quote');

const app = express();

// 1. Database Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB Cloud!'))
  .catch(err => console.log('❌ DB Error:', err));

// 2. Middleware (The "Pipes")
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true })); // Lets us read form data
app.use(express.static(path.join(__dirname, 'public'))); // Serves our CSS
app.use(session({
    secret: process.env.SESSION_SECRET ||'secret-vibe-key',
    resave: false,
    saveUninitialized: false
}));

// 2. Passport Config (The Security Guard)
passport.use(new LocalStrategy(async (username, password, done) => {
    const user = await User.findOne({ username });
    if (!user) return done(null, false, { message: 'User not found' });
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return done(null, false, { message: 'Wrong password' });
    
    return done(null, user);
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    const user = await User.findById(id);
    done(null, user);
});

app.use(passport.initialize());
app.use(passport.session());

// 3. Auth Routes
app.post('/register', async (req, res) => {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    await User.create({ username: req.body.username, password: hashedPassword });
    res.redirect('/login');
});

app.post('/login', passport.authenticate('local', {
    successRedirect: '/',        // This sends them back to the main feed
    failureRedirect: '/login',   // This sends them back to login if they fail
    failureFlash: false          // Set to true only if you use connect-flash
}));

app.get('/login', (req, res) => res.render('login'));
app.get('/register', (req, res) => res.render('register'));
app.get('/logout', (req, res) => {
    req.logout(() => {
        res.redirect('/');
    });
});

app.get('/user/:username', async (req, res) => {
    const profileUser = await User.findOne({ username: req.params.username });
    if (!profileUser) return res.status(404).send("User not found");

    const userQuotes = await Quote.find({ postedBy: profileUser._id })
        .populate('originalQuote') // Fetch the source data
        .populate('postedBy')
        .sort({ createdAt: -1 });

    res.render('profile', { profileUser, quotes: userQuotes, user: req.user || null });
});

// 3. Routes (The "Pages")
app.get('/', async (req, res) => {
    // Filter: { isRepost: { $ne: true } } means "isRepost is not equal to true"
    const quotes = await Quote.find({ isRepost: { $ne: true } })
        .populate('postedBy')
        .populate({
            path: 'comments.user',
            select: 'username'
        })
        .sort({ createdAt: -1 });
    
    res.render('index', { quotes, user: req.user || null });
});

// Post a Quote Logic
app.post('/post-quote', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/login'); // Shield!
    
    await Quote.create({ 
        text: req.body.text, 
        authorName: req.body.authorName,
        postedBy: req.user._id // Ties the quote to the logged-in user
    });
    res.redirect('/');
});

// Like Logic
app.post('/like/:id', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/login');

    const quote = await Quote.findById(req.params.id);
    
    // Check if user already liked it (The Twitter Vibe)
    const index = quote.likes.indexOf(req.user._id);
    if (index === -1) {
        quote.likes.push(req.user._id); // Like
    } else {
        quote.likes.splice(index, 1); // Unlike
    }

    await quote.save();
    const redirectTo = req.get('referer') || '/';
    res.redirect(redirectTo);
});

app.post('/repost/:id', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/login');

    const quoteId = req.params.id;
    const userId = req.user._id;

    const originalQuote = await Quote.findById(quoteId);
    if (!originalQuote) {
        const r = req.get('referer') || '/';
        return res.redirect(r);
    }

    const alreadyReposted = originalQuote.reposts.includes(userId);

    if (alreadyReposted) {
        await Quote.findByIdAndUpdate(quoteId, { $pull: { reposts: userId } });
        await Quote.findOneAndDelete({ originalQuote: quoteId, postedBy: userId });
    } else {
        await Quote.findByIdAndUpdate(quoteId, { $addToSet: { reposts: userId } });
        
        // Create the copy AND link it to the original
        await Quote.create({
            text: originalQuote.text,
            authorName: originalQuote.authorName,
            postedBy: userId,
            isRepost: true,
            originalQuote: quoteId // This is the magic link
        });
    }
    const redirectToRepost = req.get('referer') || '/';
    res.redirect(redirectToRepost);
});

app.post('/delete/:id', async (req, res) => {
    const quote = await Quote.findById(req.params.id);
    // Only allow deletion if the logged-in user owns the quote
    if (req.isAuthenticated() && quote.postedBy.equals(req.user._id)) {
        await Quote.findByIdAndDelete(req.params.id);
    }
    const r = req.get('referer') || '/';
    res.redirect(r);
});

app.post('/comment/:id', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/login');

    const quote = await Quote.findById(req.params.id);
    quote.comments.push({
        user: req.user._id,
        text: req.body.commentText
    });
    
    await quote.save();
    const redirectToComment = req.get('referer') || '/';
    res.redirect(redirectToComment);
});

const PORT = process.env.PORT || 3000; // Use the service's port OR 3000 locally
app.listen(PORT, () => console.log(`🚀 Live on port ${PORT}`));