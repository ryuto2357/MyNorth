import * as d3 from 'd3';
import { initChat } from './old_chat.js';

const width = window.innerWidth;
const height = window.innerHeight;

const HOST = "localhost";
const PORT = "5001";
const PROJECT = "mynorthhub"; // Found in firebase.json or Firebase console
const REGION = "us-central1";
const FUNCTION_NAME = "constellationApi";

const BASE_URL = `http://${HOST}:${PORT}/${PROJECT}/${REGION}/${FUNCTION_NAME}`;
const TEST_USER_ID = "FkNqVdJkVXUKTrErRvD204mNI3q2"; 

let nodes = [];
let links = [];
let clusters = [];

// style functions
const getNodeRadius = (node) => {
  // Size based on seniority and importance
  if (node.seniority_level === 0) return 15; // Root/North Star
  if (node.seniority_level === 1) return 12; // Major topics
  return 10; // Atomic tasks
};

const getNodeColor = (node) => {
  // Color by status and familiarity
  if (node.status === 'WITHERING') return '#FF6B6B'; // Red (low health)
  if (node.status === 'ARCHIVED') return '#95A5A6'; // Gray
  
  // Active nodes: color by familiarity score
  const familiarity = node.metadata?.familiarity_score || 0;
  if (familiarity >= 8) return '#2ECC71'; // Green (expert)
  if (familiarity >= 5) return '#F39C12'; // Orange (intermediate)
  return '#3498DB'; // Blue (novice)
};

const shouldShowLabel = (node, zoomLevel) => {
  // Always show root and major topic labels
  if (node.seniority_level <= 1) return true;
  
  // Show atomic task labels only when zoomed in
  return zoomLevel > 1.5;
};

/**
 * Generates nodes, links, AND cluster centers.
 * @param {number} width - Viewport width (for positioning clusters)
 * @param {number} height - Viewport height
 * @param {number} n - Total number of nodes
 * @param {number} k - Number of clusters (topics)
 */

async function initGraph() {
  const response = await fetch(`${BASE_URL}/graph/${TEST_USER_ID}`);
  const data = await response.json();
  
  nodes = data.nodes;
  links = data.links.map(l => ({
    ...l,
    source: l.source_id, // Map database field to D3 expectation
    target: l.target_id
  }));
  
  // Re-run the simulation logic with real data
  renderSimulation();
}

const svg = d3.select("#sandbox")
    .append("svg")
    .attr("viewBox", [0, 0, width, height]);

const container = svg.append("g");

const zoom = d3.zoom()
  .scaleExtent([0.5, 5])
  .on("zoom", (event) => {
    // 1. Pan and Scale the entire container
    // (Make sure you are selecting 'container', not 'g')
    container.attr("transform", event.transform);

    // 2. Evaluate label visibility based on the current zoom level (k)
    label.style("opacity", d => {
      // Pass the node data 'd' and current zoom 'event.transform.k'
      // into your logic function
      const isVisible = shouldShowLabel(d, event.transform.k);
      
      return isVisible ? 1 : 0; // 1 = visible, 0 = hidden
    });
  });

svg.call(zoom);

const drag = d3.drag()
  .on("start", (event, d) => {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  })
  .on("drag", (event, d) => {
    d.fx = event.x;
    d.fy = event.y;
  })
  .on("end", (event, d) => {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null; // Release fixed position
    d.fy = null;
  });

// Links
let link = container.append("g")
  .attr("stroke", "#999")
  .attr("stroke-opacity", 0.6)
  .selectAll("line")
  .data(links)
  .join("line");

// Nodes (Circles)
let node = container.append("g")
  .selectAll("circle")
  .data(nodes)
  .join("circle")
  .attr("stroke", "#fff")
  .attr("stroke-width", 1.5)
  // IMPLEMENTATION OF YOUR FUNCTIONS:
  .attr("r", d => getNodeRadius(d)) 
  .attr("fill", d => getNodeColor(d))
  .call(drag);

// Labels (Text)
let label = container.append("g")
  .attr("font-family", "sans-serif")
  .attr("font-size", 10)
  .attr("pointer-events", "none") // Don't let text capture mouse clicks
  .selectAll("text")
  .data(nodes)
  .join("text")
  .text(d => d.label)
  .attr("dx", 0)
  .attr("dy", d => getNodeRadius(d) + 12); // Position text below the node

const simulation = d3.forceSimulation(nodes)
  .force("link", d3.forceLink(links).id(d => d.id).distance(d => {
    const sourceLevel = d.source.seniority_level;
    const targetLevel = d.target.seniority_level;
    
    // Root to Major: Long distance (spread out)
    if (sourceLevel === 0 && targetLevel === 1) return 200;
    
    // Major to Subtopic: Medium distance
    if (sourceLevel === 1 && targetLevel === 2) return 120;
    
    // Subtopic to Atomic: Short distance (keep close)
    if (sourceLevel === 2) return 80;
    
    return 150; // Default
  }).strength(d => {
    // Stronger links for parent-child, weaker for cross-references
    if (d.relation_type === 'PARENT_OF') return 1.0;
    if (d.relation_type === 'SYNAPSE') return 0.1; // Weak dotted lines
    return 0.5;
  })
)
  .force("charge", d3.forceManyBody().strength(d => {
    // Stronger repulsion for senior nodes (they need more space)
    if (d.seniority_level === 0) return -800; // Root nodes push hard
    if (d.seniority_level === 1) return -400; // Major topics push moderately
    return -150; // Atomic tasks have weak repulsion
  }).distanceMax(500)
)
  .force("center", d3.forceCenter(width / 2, height / 2)
  .strength(0.05) // Gentle centering (doesn't override other forces))
)
  .force("collision", d3.forceCollide().radius(d => {
    // Collision radius = visual radius × 1.75 (creates white space)
    return getNodeRadius(d) * 1.75;
  }).strength(1.0).iterations(2)
)
  .force("x", d3.forceX(d => {
    const cluster = clusters.find(c => c.id === d.cluster_id);
    return cluster ? cluster.x : width / 2;
  }).strength(0.05)
)
  .force("y", d3.forceY(d => {
    const cluster = clusters.find(c => c.id === d.cluster_id);
    return cluster ? cluster.y : height / 2;
  }).strength(0.05)
);

simulation
  .alphaDecay(0.02) // Slower decay = smoother settling
  .alphaMin(0.001) // Stop when movement is minimal
  .velocityDecay(0.4); // Friction coefficient

simulation.on("tick", () => {
  // Only update positions, not full re-render
  node
    .attr("cx", d => d.x)
    .attr("cy", d => d.y);
  
  link
    .attr("x1", d => d.source.x)
    .attr("y1", d => d.source.y)
    .attr("x2", d => d.target.x)
    .attr("y2", d => d.target.y);

  label
    .attr("x", d => d.x)
    .attr("y", d => d.y);
});

function renderSimulation() {
  // 1. Update Links (Lines)
  link = link
    .data(links, d => d.id || `${d.source.id || d.source}-${d.target.id || d.target}`)
    .join("line")
    // Keep dynamic relation styling (from protocol), but rely on parent <g> for base color/opacity
    .attr("stroke-width", d => d.relation_type === 'PARENT_OF' ? 2 : 1)
    .attr("stroke-dasharray", d => d.relation_type === 'SYNAPSE' ? "4,4" : "0");

  // 2. Update Nodes (Circles)
  node = node
    .data(nodes, d => d.id)
    .join("circle")
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5)
    .attr("r", d => getNodeRadius(d))
    .attr("fill", d => getNodeColor(d))
    .attr("cursor", "pointer") // Visual cue that it's clickable
    .on("click", async (event, d) => {
      // Check if the node has an attached file
      if (!d.file_path) {
        console.log("No file attached to this node.");
        return;
      }

      try {
        // Fetch the markdown content using the linked ID
        const res = await fetch(`${BASE_URL}/users/${TEST_USER_ID}/files/${d.file_path}`);
        const fileData = await res.json();

        // Set the title
        document.getElementById('mdViewerTitle').innerText = d.label;

        // Parse Markdown to HTML and sanitize it
        const rawHtml = marked.parse(fileData.content);
        const safeHtml = DOMPurify.sanitize(rawHtml);

        // Inject and show modal
        document.getElementById('mdViewerBody').innerHTML = safeHtml;
        const viewerModal = new bootstrap.Modal(document.getElementById('mdViewerModal'));
        viewerModal.show();
      } catch (error) {
        console.error("Error loading node file:", error);
      }
    })
    .call(drag); // Re-attach drag behavior to new nodes

  // 3. Update Labels (Text)
  label = label
    .data(nodes, d => d.id)
    .join("text")
    .text(d => d.label)
    .attr("dx", 0)
    .attr("dy", d => getNodeRadius(d) + 12);

  // 4. Update and Restart Simulation
  simulation.nodes(nodes);
  simulation.force("link").links(links);
  
  // "Alpha" is the heat of the simulation. 1 restarts the movement.
  simulation.alpha(1).restart();
}

initGraph();


/**
 * Manually trigger Node Creation Protocol
 */
window.debugCreateNode = async () => {
  const label = document.getElementById('nodeLabel').value;
  const level = parseInt(document.getElementById('nodeLevel').value);
  const fileInput = document.getElementById('nodeFile');

  let filePathId = null;

  // 1. If a file was uploaded, read it and send to the files API first
  if (fileInput.files.length > 0) {
    const file = fileInput.files[0];
    const textContent = await file.text();

    const fileRes = await fetch(`${BASE_URL}/users/${TEST_USER_ID}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: textContent, filename: file.name })
    });
    
    const fileData = await fileRes.json();
    filePathId = fileData.file_id; // Capture the new Firestore Document ID
  }

  const response = await fetch(`${BASE_URL}/users/${TEST_USER_ID}/nodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label: label,
      seniority_level: level, // 0=Root, 1=Major, 2=Atomic
      cluster_id: 'debug-cluster',
      status: 'ACTIVE', // Default status per protocol
      file_path: filePathId
    })
  });

  const newNode = await response.json();
  console.log("Node Created in Firestore:", newNode);
  
  // Refreshes the D3 graph to show the new node
  if (typeof initGraph === "function") initGraph(); 
};

/**
 * Manually trigger Node Linking Protocol
 */
window.debugCreateLink = async () => {
  const sourceId = document.getElementById('sourceId').value;
  const targetId = document.getElementById('targetId').value;
  const relationType = document.getElementById('linkType').value;

  const response = await fetch(`${BASE_URL}/users/${TEST_USER_ID}/links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_id: sourceId,
      target_id: targetId,
      relation_type: relationType // PARENT_OF (solid) or SYNAPSE (dotted)
    })
  });

  const result = await response.json();
  console.log("Link Created in Firestore:", result);
  
  // Refreshes the D3 graph to show the new connection
  if (typeof initGraph === "function") initGraph();
};

initChat(() => {
    console.log("Chat activity detected potential node changes. Refreshing graph...");
    initGraph();
});