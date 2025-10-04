const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { default: fetch } = require('node-fetch');
const app = express();
const PORT = 3000;
const OLLAMA_API_URL = 'http://localhost:11434/api/generate'; // Adresse de l'API locale d'Ollama
const AI_MODEL = 'gemma:2b'; // nom du model

// --- Configuration du Serveur et CORS ---
app.use(bodyParser.json());

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
        db.run(`CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    }
});

// --- LOGIQUE DE L'IA (APPEL OLLAMA) --- 

async function generateResponse(message) { 
    try {
        const response = await fetch(OLLAMA_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: AI_MODEL,
                prompt: message, // On envoie le message de l'utilisateur
                stream: false, 
            }),
        });

        if (!response.ok) {
            console.error(`Erreur Ollama: ${response.status} ${response.statusText}`);
            return "Désolé, l'API Ollama locale a rencontré une erreur.";
        }

        const data = await response.json();
        
        // La réponse du modèle Ollama
        return data.response.trim(); 

    } catch (error) {
        console.error("Erreur de connexion à Ollama:", error.message);
        return "Erreur : Le service Ollama n'est pas démarré ou n'est pas accessible sur localhost:11434.";
    }
}


// --- API Routes (Points de communication) ---

// POST /api/chat :  La route est  ASYNCHRONE pour attentre les reponse de l'api ollama
app.post('/api/chat', async (req, res) => { 
    const { message, sessionId } = req.body;
    if (!message || !sessionId) {
        return res.status(400).json({ error: "Message et ID de session requis." });
    }
    
    // Le serveur attend la réponse de l'IA (Ollama)
    const aiResponse = await generateResponse(message);

    // Sauvegarde des messages dans la base de données
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

// GET /api/sessions (Pas de changement)
app.get('/api/sessions', (req, res) => {
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

// GET /api/session/:sessionId (Pas de changement)
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