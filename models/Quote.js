const mongoose = require('mongoose');

const QuoteSchema = new mongoose.Schema({
    text: { type: String, required: true },
    authorName: String,
    postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    reposts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    
    // THE CRITICAL NEW FIELDS
    isRepost: { type: Boolean, default: false },
    originalQuote: { type: mongoose.Schema.Types.ObjectId, ref: 'Quote' }, 
    
    comments: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        text: String,
        createdAt: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Quote', QuoteSchema);