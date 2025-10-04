const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3000;

// --- Configuration du Serveur et CORS ---
app.use(bodyParser.json());

// Permet au frontend d'accéder (CORS)
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    next();
});

// --- Base de Données SQLite (initialisation) ---

const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite3'), (err) => {
    if (err) {
        console.error("Erreur DB:", err.message);
    } else {
        console.log('Connecté à la DB SQLite.');
        // Création de la table 'history' si elle n'existe pas
        db.run(`CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    }
});

// --- Logique de l'IA (AI INT) ---

function generateResponse(message) {
    message = message.toLowerCase().trim();

    // 1. Règle de politesse
    if (message.includes("bonjour") || message.includes("salut")) {
        return "Bonjour ! Je suis AI INT. Quel est votre question ?";
    }
    // 2. Règle factuelle
    if (message.includes("heure")) {
        return `Il est actuellement ${new Date().toLocaleTimeString()}.`;
    }
    // 3. Règle spécifique au projet
    if (message.includes("projet") || message.includes("int") || message.includes("role")) {
        return "AI INT est un prototype d'assistant full-stack développé avec Node.js et SQLite.";
    }
    // 4. Réponse par défaut
    return "Je ne suis qu'un petit modèle ! Pouvez-vous essayer une question différente ?";
}


// --- API Routes (Points de communication) ---

// POST /api/chat : Pour envoyer un message dans une session spécifique
app.post('/api/chat', (req, res) => {
    const { message, sessionId } = req.body;
    if (!message || !sessionId) {
        return res.status(400).json({ error: "Message et ID de session requis." });
    }

    const aiResponse = generateResponse(message);

    // Sauvegarde du message utilisateur et de l'IA dans la session
    db.serialize(() => {
        db.run("INSERT INTO history (session_id, role, content) VALUES (?, ?, ?)", [sessionId, "user", message]);
        db.run("INSERT INTO history (session_id, role, content) VALUES (?, ?, ?)", [sessionId, "ai", aiResponse], (err) => {
            if (err) {
                console.error("Erreur sauvegarde IA:", err.message);
            }
            res.json({ response: aiResponse });
        });
    });
});

// GET /api/sessions : Récupère la liste de toutes les sessions
app.get('/api/sessions', (req, res) => {
    // Sélectionne l'ID unique de la session et le premier message pour le titre
    const sql = `
        SELECT 
            session_id,
            (SELECT content FROM history AS h2 WHERE h2.session_id = h1.session_id AND h2.role = 'user' ORDER BY timestamp ASC LIMIT 1) AS title
        FROM 
            history AS h1
        GROUP BY 
            session_id
        ORDER BY 
            MAX(timestamp) DESC;
    `;

    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// GET /api/session/:sessionId : Récupère l'historique d'une session spécifique
app.get('/api/session/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId;
    db.all("SELECT role, content FROM history WHERE session_id = ? ORDER BY timestamp ASC", [sessionId], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// --- Servir le Frontend ---
app.use(express.static(path.join(__dirname, '..', 'frontend')));


// Démarrage du serveur
app.listen(PORT, () => {
    console.log(`Serveur AI INT démarré sur http://localhost:${PORT}`);
});