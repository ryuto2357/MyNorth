const express = require('express');
const admin = require('firebase-admin');
const path = require('path');

admin.initializeApp({
  credential: admin.credential.applicationDefault() 
});

const db = admin.firestore();
const app = express();
app.use(express.json());
exports.api = functions.https.onRequest(app);

app.get('/api/graph', async (req, res) => {
    const snapshot = await db.collection('nodes').get();
    const nodes = [];
    const links = [];

    snapshot.forEach(doc => {
        const data = doc.data();
        // Add node
        nodes.push({ id: doc.id, label: data.label, content: data.content });
        
        // Add links based on neighbors
        if (data.neighbors) {
            data.neighbors.forEach(neighborId => {
                links.push({ source: doc.id, target: neighborId });
            });
        }
    });

    res.json({ nodes, links });
});

app.post('/nodes', async (req, res) => {
    const { label, content } = req.body;
    const newNode = {
        label,
        content,
        neighbors: [],
        createdAt: new Date().toISOString()
    };
    
    const doc = await db.collection('nodes').add(newNode);
    res.json({ id: doc.id, ...newNode });
});

app.post('/links', async (req, res) => {
    const { sourceId, targetId } = req.body;
    
    // Use a batch to ensure both nodes update, or neither does
    const batch = db.batch();
    const sourceRef = db.collection('nodes').doc(sourceId);
    const targetRef = db.collection('nodes').doc(targetId);

    // Atomically add the IDs to the neighbors arrays
    batch.update(sourceRef, {
        neighbors: admin.firestore.FieldValue.arrayUnion(targetId)
    });
    batch.update(targetRef, {
        neighbors: admin.firestore.FieldValue.arrayUnion(sourceId)
    });

    await batch.commit();
    res.json({ success: true, message: "Nodes linked" });
});

const PORT = process.env.PORT || 8080;
app.use(express.static(path.join(__dirname, 'public')));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));