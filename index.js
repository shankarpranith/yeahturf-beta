const express = require('express');
const path = require('path');
const admin = require('firebase-admin');

// --- FIREBASE SETUP ---
// Ensure serviceAccountKey.json is in the 'server' folder
const serviceAccount = require('./serviceAccountKey.json');

// Initialize the App
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Get a reference to the database
const db = admin.firestore();

// --- APP SETUP ---
const app = express();

// View Engine Setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware (Translators)
app.use(express.urlencoded({ extended: true })); 
app.use(express.json());
app.use(express.static('public')); // Serve CSS/Images

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

// --- CONTACT FORM SUBMISSION ---
app.post('/submit-contact', (req, res) => {
    const formData = req.body;
    console.log('--- NEW CONTACT FORM SUBMISSION ---');
    console.log('Name:', formData.name);
    console.log('Email:', formData.email);
    console.log('Message:', formData.message);
    
    res.send(`
        <body style="font-family: system-ui; text-align: center; padding-top: 50px;">
            <h1>Thank you, ${formData.name}!</h1>
            <p>We received your message and will get back to you soon.</p>
            <a href="/" style="font-weight: bold; color: #10B981;">&larr; Go Back Home</a>
        </body>
    `);
});

// ==========================================
//           GAME ROUTES (CRUD)
// ==========================================

// 1. SHOW 'Create Game' Form
app.get('/games/new', (req, res) => {
    res.render('create-game');
});

// 2. HANDLE 'Create Game' Submission
app.post('/games', async (req, res) => {
    try {
        const newGame = {
            title: req.body.title,
            sport: req.body.sport,
            location: req.body.location,
            date: req.body.date,
            time: req.body.time,
            playersNeeded: parseInt(req.body.playersNeeded),
            secretCode: req.body.secretCode, 
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('games').add(newGame);
        res.redirect('/games');
    } catch (error) {
        console.error("Error adding game: ", error);
        res.status(500).send("Error saving game");
    }
});

// 3. LIST Games (With Search & Filter)
app.get('/games', async (req, res) => {
    try {
        const sportFilter = req.query.sport;
        const searchQuery = req.query.search;

        let snapshot = await db.collection('games').orderBy('createdAt', 'desc').get();
        
        let gamesList = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Filter by Sport button
        if (sportFilter) {
            gamesList = gamesList.filter(game => game.sport === sportFilter);
        }

        // Filter by Search Text
        if (searchQuery) {
            const lowerSearch = searchQuery.toLowerCase();
            gamesList = gamesList.filter(game => 
                game.title.toLowerCase().includes(lowerSearch) ||
                game.location.toLowerCase().includes(lowerSearch) ||
                game.sport.toLowerCase().includes(lowerSearch)
            );
        }

        res.render('upcoming-games', { 
            games: gamesList,
            isSearching: !!searchQuery 
        });

    } catch (error) {
        console.error("Error getting games: ", error);
        res.status(500).send("Error getting games");
    }
});

// 4. DELETE Game (Secure Version)
app.post('/games/delete/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const userCode = req.query.code;

        const gameRef = db.collection('games').doc(id);
        const doc = await gameRef.get();

        if (!doc.exists) return res.send("Game not found.");

        const gameData = doc.data();

        if (gameData.secretCode === userCode) {
            await gameRef.delete();
            res.redirect('/games');
        } else {
            res.send(`
                <h1>WRONG CODE!</h1>
                <p>You entered: ${userCode}</p>
                <a href="/games">Go Back</a>
            `);
        }
    } catch (error) {
        console.error("Error deleting game: ", error);
        res.status(500).send("Error deleting game");
    }
});

// 5. JOIN Game logic
app.post('/games/join/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const gameRef = db.collection('games').doc(id);
        const doc = await gameRef.get();

        if (!doc.exists) return res.send("Game not found");

        const game = doc.data();

        if (game.playersNeeded > 0) {
            const newCount = game.playersNeeded - 1;
            await gameRef.update({ playersNeeded: newCount });
        }
        res.redirect('/games');

    } catch (error) {
        console.error("Error joining game: ", error);
        res.status(500).send("Error joining game");
    }
});

// ==========================================
//           PLAYER ROUTES (CRUD)
// ==========================================

// 1. SHOW 'Create Player' Form
app.get('/players/new', (req, res) => {
    res.render('create-player');
});

// 2. HANDLE 'Create Player' Submission
app.post('/players', async (req, res) => {
    try {
        const newPlayer = {
            name: req.body.name,
            primarySport: req.body.primarySport,
            skillLevel: req.body.skillLevel,
            location: req.body.location,
            availability: req.body.availability,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('players').add(newPlayer);
        res.redirect('/players');
    } catch (error) {
        console.error("Error adding player: ", error);
        res.status(500).send("Error creating player card");
    }
});

// 3. LIST all Players
app.get('/players', async (req, res) => {
    try {
        const snapshot = await db.collection('players').get();
        const playersList = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        res.render('find-players', { players: playersList });
    } catch (error) {
        console.error("Error getting players: ", error);
        res.status(500).send("Error loading players");
    }
});

// ==========================================
//             START SERVER
// ==========================================

// Use the environment port (for Cloud) OR 3000 (for Localhost)
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});