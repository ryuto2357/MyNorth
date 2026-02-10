import * as d3 from 'd3';

const width = window.innerWidth;
const height = window.innerHeight;

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
  const familiarity = node.metadata.familiarity_score;
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
const generateClusteredData = (width, height, n, k = 3) => {
  const nodes = [];
  const links = [];
  const clusters = [];

  // 1. GENERATE CLUSTERS (The Gravity Wells)
  // We arrange them in a circle around the center of the screen
  const radius = Math.min(width, height) * 0.25; // Clusters sit 25% out from center
  const center = { x: width / 2, y: height / 2 };

  for (let i = 0; i < k; i++) {
    const angle = (i / k) * 2 * Math.PI; // Evenly distribute angles
    clusters.push({
      id: `cluster-${i}`,
      label: `Domain ${i + 1}`,
      x: center.x + radius * Math.cos(angle), // Polar to Cartesian conversion
      y: center.y + radius * Math.sin(angle)
    });
  }

  // 2. GENERATE NODES
  // We need at least one Level 0 node per cluster to act as the anchor
  clusters.forEach((cluster, i) => {
    // A. Create the Cluster "Anchor" (Seniority 0)
    const anchorId = `anchor-${i}`;
    nodes.push({
      id: anchorId,
      cluster_id: cluster.id,
      seniority_level: 0, // Will sit at radius 0 (center of cluster)
      status: 'ACTIVE',
      label: `${cluster.label} Lead`,
      metadata: { familiarity_score: 10 }
    });

    // B. Create Major Topics (Seniority 1)
    const majorCount = 3;
    for (let m = 0; m < majorCount; m++) {
      const majorId = `major-${i}-${m}`;
      nodes.push({
        id: majorId,
        cluster_id: cluster.id,
        seniority_level: 1, // Will orbit at radius 150
        status: 'ACTIVE',
        label: `Topic ${m + 1}`,
        metadata: { familiarity_score: Math.floor(Math.random() * 8) + 2 }
      });
      // Link to the anchor
      links.push({ source: anchorId, target: majorId });

      // C. Create Atomic Tasks (Seniority 2)
      // Distribute remaining n nodes across these sub-topics
      const taskCount = Math.floor((n - k - (k * majorCount)) / (k * majorCount));
      for (let t = 0; t < taskCount; t++) {
        const taskId = `task-${i}-${m}-${t}`;
        nodes.push({
          id: taskId,
          cluster_id: cluster.id,
          seniority_level: 2, // Will orbit at radius 250
          status: Math.random() > 0.8 ? 'WITHERING' : 'ACTIVE',
          label: `Task ${t + 1}`,
          metadata: { familiarity_score: Math.floor(Math.random() * 10) }
        });
        links.push({ source: majorId, target: taskId });
      }
    }
  });

  return { nodes, links, clusters };
};

const { nodes, links, clusters } = generateClusteredData(window.innerWidth, window.innerHeight, 60, 3);

d3.select("#sandbox").selectAll("*").remove();

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
const link = container.append("g")
  .attr("stroke", "#999")
  .attr("stroke-opacity", 0.6)
  .selectAll("line")
  .data(links)
  .join("line");

// Nodes (Circles)
const node = container.append("g")
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
const label = container.append("g")
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