const {onRequest} = require("firebase-functions/https");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

// API for Graph Data and Management
exports.constellationApi = onRequest({
  cors: true, 
}, async (req, res) => {
  const pathParts = req.path.split('/').filter(p => p !== '');

  try {
    // GET /graph/:userId -> Fetch full user graph
    if (req.method === 'GET' && pathParts[0] === 'graph') {
      const userId = pathParts[1] || 'default-user';
      
      const nodesRef = db.collection('users').doc(userId).collection('nodes');
      const linksRef = db.collection('users').doc(userId).collection('links');

      const [nodesSnap, linksSnap] = await Promise.all([nodesRef.get(), linksRef.get()]);

      const nodes = nodesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const links = linksSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      return res.status(200).json({ nodes, links });
    }

    // POST /users/:userId/files -> Upload a Markdown file
    if (req.method === 'POST' && pathParts[0] === 'users' && pathParts[2] === 'files' && !pathParts[3]) {
      const userId = pathParts[1];
      const { content, filename } = req.body;

      const newFile = {
        user_id: userId,
        filename: filename,
        content: content,
        created_at: FieldValue.serverTimestamp()
      };

      const docRef = await db.collection('files').add(newFile);
      return res.status(201).json({ file_id: docRef.id });
    }

    // GET /users/:userId/files/:fileId -> Fetch a Markdown file by ID
    if (req.method === 'GET' && pathParts[0] === 'users' && pathParts[2] === 'files' && pathParts[3]) {
      const fileId = pathParts[3];
      const doc = await db.collection('files').doc(fileId).get();
      
      if (!doc.exists) {
        return res.status(404).json({ error: "File not found" });
      }
      return res.status(200).json(doc.data());
    }

    // POST /users/:userId/nodes -> Create new node
    if (req.method === 'POST' && pathParts[0] === 'users' && pathParts[2] === 'nodes') {
      const userId = pathParts[1];
      const { label, seniority_level, cluster_id, status, file_path } = req.body;

      const newNode = {
        label,
        seniority_level: seniority_level ?? 2,
        cluster_id: cluster_id || 'general',
        status: status || 'ACTIVE',
        file_path: file_path || null,
        metadata: {
          familiarity_score: 0,
          learning_progress: 0,
          last_updated: new Date().toISOString()
        },
        created_at: FieldValue.serverTimestamp()
      };

      const docRef = await db.collection('users').doc(userId).collection('nodes').add(newNode);
      return res.status(201).json({ id: docRef.id, ...newNode });
    }

    // POST /users/:userId/links -> Create new link
    if (req.method === 'POST' && pathParts[0] === 'users' && pathParts[2] === 'links') {
      const userId = pathParts[1];
      const { source_id, target_id, relation_type } = req.body;

      const newLink = {
        source_id,
        target_id,
        relation_type: relation_type || 'SYNAPSE',
        strength: relation_type === 'PARENT_OF' ? 1.0 : 0.1,
        created_at: FieldValue.serverTimestamp()
      };

      const docRef = await db.collection('users').doc(userId).collection('links').add(newLink);
      return res.status(201).json({ id: docRef.id, ...newLink });
    }

    return res.status(404).send("Endpoint not found");

  } catch (error) {
    console.error("Constellation Error:", error);
    return res.status(500).json({ error: error.message });
  }
});