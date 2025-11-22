const express = require('express');
const path = require('path');
const admin = require('firebase-admin');

// --- FIREBASE SETUP ---
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// --- APP SETUP ---
const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true })); 
app.use(express.json());
app.use(express.static('public')); 

// ==========================================
//                ROUTES
// ==========================================

// --- BASIC PAGES ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/about', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'about.html'));
});
app.get('/services', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'services.html'));
});
app.get('/contact', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'contact.html'));
});

// --- AUTH ROUTES ---
app.get('/signup', (req, res) => {
    res.render('signup');
});

app.get('/login', (req, res) => {
    res.render('login');
});

// --- GAME ROUTES ---

// 1. Show 'Create Game' Form
app.get('/games/new', (req, res) => {
    res.render('create-game');
});

// 2. Handle 'Create Game' Submission
app.post('/games', async (req, res) => {
    try {
        const newGame = {
            title: req.body.title,
            sport: req.body.sport,
            location: req.body.location,
            date: req.body.date,
            time: req.body.time,
            playersNeeded: parseInt(req.body.playersNeeded),
            
            // Save Creator Info
            createdBy: req.body.createdBy,
            creatorEmail: req.body.creatorEmail,
            
            // Initialize empty roster
            roster: [],
            
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('games').add(newGame);
        res.redirect('/games');
    } catch (error) {
        console.error("Error creating game:", error);
        res.status(500).send("Error saving game");
    }
});

// 3. List Games (With Search & Filter)
app.get('/games', async (req, res) => {
    try {
        const sportFilter = req.query.sport;
        const searchQuery = req.query.search;

        let snapshot = await db.collection('games').orderBy('createdAt', 'desc').get();
        
        let gamesList = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        if (sportFilter) {
            gamesList = gamesList.filter(g => g.sport === sportFilter);
        }

        if (searchQuery) {
            const lower = searchQuery.toLowerCase();
            gamesList = gamesList.filter(g => 
                g.title.toLowerCase().includes(lower) || 
                g.location.toLowerCase().includes(lower)
            );
        }

        res.render('upcoming-games', { games: gamesList, isSearching: !!searchQuery });
    } catch (error) {
        console.error("Error listing games:", error);
        res.status(500).send("Error getting games");
    }
});

// 4. Delete Game (No PIN needed anymore)
app.post('/games/delete/:id', async (req, res) => {
    try {
        const id = req.params.id;
        // Simple delete (we trust the frontend Auth check for now)
        await db.collection('games').doc(id).delete();
        res.redirect('/games');
    } catch (error) {
        console.error("Error deleting game:", error);
        res.status(500).send("Error deleting game");
    }
});

// 5. JOIN Game (With Name & Phone)
app.post('/games/join/:id', async (req, res) => {
    try {
        const id = req.params.id;
        
        // Create the player object from the Modal Form
        const newPlayer = {
            name: req.body.name || "Guest",
            phone: req.body.phone || ""
        };
        
        const gameRef = db.collection('games').doc(id);
        const doc = await gameRef.get();

        if (!doc.exists) return res.send("Game not found");

        const game = doc.data();
        const currentRoster = game.roster || [];

        // Check if player name is already in the list
        const alreadyJoined = currentRoster.some(p => p.name === newPlayer.name);

        if (alreadyJoined) {
             return res.redirect('/games');
        }

        if (game.playersNeeded > 0) {
            await gameRef.update({ 
                playersNeeded: admin.firestore.FieldValue.increment(-1),
                roster: admin.firestore.FieldValue.arrayUnion(newPlayer) 
            });
        }
        
        res.redirect('/games');

    } catch (error) {
        console.error("Error joining game: ", error);
        res.status(500).send("Error joining game");
    }
});

// --- PLAYER ROUTES ---
app.get('/players/new', (req, res) => {
    res.render('create-player');
});

app.post('/players', async (req, res) => {
    try {
        await db.collection('players').add({
            ...req.body,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        res.redirect('/players');
    } catch (error) {
        res.status(500).send("Error adding player");
    }
});

app.get('/players', async (req, res) => {
    try {
        const snapshot = await db.collection('players').get();
        const playersList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.render('find-players', { players: playersList });
    } catch (error) {
        res.status(500).send("Error loading players");
    }
});

// --- START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});