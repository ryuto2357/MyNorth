import ForceGraph from 'force-graph';

// 1. Initialize Graph
const Graph = ForceGraph()
    (document.getElementById('graph-container'))
    .backgroundColor('#0b0b0b')
    .nodeColor(() => '#9b59b6') // Purple nodes like Obsidian
    .nodeLabel('label')         // Hover text
    .linkColor(() => '#555')    // Grey links
    .nodeRelSize(6)             // Base node size
    .onNodeClick(handleNodeClick);

// 2. Fetch Data & Render
async function loadGraph() {
    const res = await fetch('/api/graph');
    const data = await res.json();
    
    // The library handles the physics simulation automatically
    Graph.graphData(data);
}

// 3. Handle Node Click (View Note)
function handleNodeClick(node) {
    // Zoom to node (Physics feature)
    Graph.centerAt(node.x, node.y, 1000);
    Graph.zoom(3, 2000);

    // Show details in Sidebar
    document.getElementById('create-section').style.display = 'none';
    document.getElementById('node-details').style.display = 'block';
    
    document.getElementById('detail-label').innerText = node.label;
    document.getElementById('detail-id').innerText = node.id;
    document.getElementById('detail-content').value = node.content;
}

// 4. Create Node Logic
async function createNode() {
    const label = document.getElementById('new-label').value;
    const content = document.getElementById('new-content').value;

    if (!label) return alert("Please enter a title");

    await fetch('/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, content })
    });

    // Clear form and reload graph
    document.getElementById('new-label').value = '';
    document.getElementById('new-content').value = '';
    loadGraph();
}

// Reset Sidebar View
document.getElementById('btn-close').addEventListener('click', () => {
    document.getElementById('node-details').style.display = 'none';
    document.getElementById('create-section').style.display = 'block';
    Graph.zoomToFit(1000); // Reset zoom
});

// Initial Load
loadGraph();