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

// Fetch the full graph for a specific user
app.get('/api/users/:userId/graph', async (req, res) => {
    const { userId } = req.params;

    // Path changes to nested sub-collections
    const nodesRef = db.collection('users').doc(userId).collection('nodes');
    const linksRef = db.collection('users').doc(userId).collection('links');

    const [nodesSnapshot, linksSnapshot] = await Promise.all([
        nodesRef.get(),
        linksRef.get()
    ]);

    const nodes = nodesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const links = linksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    res.json({ nodes, links });
});

// Create a node following the Node Creation Protocol
app.post('/api/users/:userId/nodes', async (req, res) => {
    const { userId } = req.params;
    const { label, parent_id, seniority_level, cluster_id } = req.body;
    
    // Structure following node_template.md protocols
    const newNode = {
        label,
        parent_id: parent_id || null,
        cluster_id: cluster_id || 'general',
        seniority_level: seniority_level || 2, // 0=Root, 1=Major, 2=Atomic
        status: 'ACTIVE',
        metadata: {
            familiarity_score: 0,
            learning_progress: 0,
            last_updated: new Date().toISOString() // Protocol timestamp
        },
        createdAt: new Date().toISOString()
    };
    
    const docRef = await db.collection('users').doc(userId).collection('nodes').add(newNode);
    res.json({ id: docRef.id, ...newNode });
});

app.post('/api/users/:userId/links', async (req, res) => {
    const { userId } = req.params;
    const { source_id, target_id, relation_type } = req.body;

    const newLink = {
        source_id,
        target_id,
        relation_type: relation_type || 'SYNAPSE', //
        strength: relation_type === 'PARENT_OF' ? 1.0 : 0.1, // Strength logic from protocol
        created_at: new Date().toISOString()
    };

    const docRef = await db.collection('users').doc(userId).collection('links').add(newLink);
    res.json({ id: docRef.id, ...newLink });
});

const PORT = process.env.PORT || 8080;
app.use(express.static(path.join(__dirname, 'public')));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));