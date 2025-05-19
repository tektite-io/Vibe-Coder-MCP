import { GraphEdge, GraphNode } from './graphBuilder.js';
import { ClassInfo } from './codeMapModel.js'; // For class diagram members
import {
  extractMethodCallSequences,
  extractParticipants,
  generateSequenceDiagram,
  optimizeSequenceDiagram
} from './sequenceDiagramGenerator.js';

function sanitizeMermaidLabel(label: string): string {
  // Replace characters that might break Mermaid syntax or display poorly.
  // Keep it simple: remove quotes, backticks, and limit length.
  return label.replace(/["`]/g, "'").replace(/\n/g, ' ').substring(0, 80);
}

export function generateMermaidFileDependencyDiagram(nodes: GraphNode[], edges: GraphEdge[]): string {
  if (edges.length === 0 && nodes.length === 0) return 'graph LR\n  subgraph "File Dependencies"\n    Empty["No dependencies found"]\n  end';
  let mermaidString = 'graph LR\n  subgraph "File Dependencies"\n';
  nodes.forEach(node => {
    const label = sanitizeMermaidLabel(node.label || node.id);
    mermaidString += `    ${node.id}["${label}"]\n`;
  });
  edges.forEach(edge => {
    mermaidString += `    ${edge.from} -->|${edge.label || 'depends'}| ${edge.to}\n`;
  });
  mermaidString += '  end';
  return mermaidString;
}

export function generateMermaidClassDiagram(nodes: GraphNode[], edges: GraphEdge[], allClassInfos: ClassInfo[]): string {
  if (edges.length === 0 && nodes.length === 0) return 'classDiagram\n  class Empty~"No classes or inheritance found"~';

  let mermaidString = 'classDiagram\n';
  const classInfoMap = new Map<string, ClassInfo>();
  allClassInfos.forEach(ci => classInfoMap.set(ci.name, ci)); // Assuming simple name is enough for lookup here

  nodes.filter(n => n.type === 'class').forEach(node => {
    const className = node.id.includes('::') ? node.id.split('::')[1] : node.id; // Get raw class name
    const classInfo = classInfoMap.get(className);
    const label = sanitizeMermaidLabel(node.label || node.id);
    mermaidString += `  class ${node.id}["${label}"] {\n`;
    if (classInfo) {
      // Add properties (if any)
      (classInfo.properties || []).forEach(prop => {
        const propComment = sanitizeMermaidLabel(prop.comment || prop.name);
        mermaidString += `    +${prop.type || 'any'} ${prop.name} : ${propComment}\n`;
      });
      // Add methods
      classInfo.methods.forEach(method => {
        const methodComment = sanitizeMermaidLabel(method.comment || method.name);
        mermaidString += `    +${method.name}(${method.signature.substring(method.name.length)}) : ${methodComment}\n`;
      });
    }
    mermaidString += `  }\n`;
  });

  edges.forEach(edge => {
    // Mermaid uses <|-- for inheritance
    mermaidString += `  ${edge.from} <|-- ${edge.to} : ${sanitizeMermaidLabel(edge.label || 'inherits')}\n`;
  });
  return mermaidString;
}

export function generateMermaidFunctionCallDiagram(nodes: GraphNode[], edges: GraphEdge[]): string {
  if (edges.length === 0 && nodes.length === 0) return 'graph LR\n  subgraph "Function Calls (Heuristic)"\n    Empty["No calls detected or mapped"]\n  end';
  // Using a simple graph for now, sequence diagrams can be complex from static analysis
  let mermaidString = 'graph LR\n  subgraph "Function Calls (Heuristic)"\n';
   nodes.filter(n => n.type === 'function' || n.type === 'method').forEach(node => {
    const label = sanitizeMermaidLabel(node.label || node.id);
    mermaidString += `    ${node.id}["${label}"]\n`;
  });
  edges.forEach(edge => {
    mermaidString += `    ${edge.from} -->|${edge.label || 'calls?'}| ${edge.to}\n`;
  });
  mermaidString += '  end';
  return mermaidString;
}

/**
 * Generates a Mermaid sequence diagram from function/method call nodes and edges.
 * @param nodes Function and method nodes
 * @param edges Call edges between functions/methods
 * @param maxCalls Maximum number of calls to include in the sequence
 * @param maxParticipants Maximum number of participants to include in the diagram
 * @returns Mermaid sequence diagram string
 */
export function generateMermaidSequenceDiagram(
  nodes: GraphNode[],
  edges: GraphEdge[],
  maxCalls: number = 20,
  maxParticipants: number = 10
): string {
  if (edges.length === 0 && nodes.length === 0) {
    return 'sequenceDiagram\n  Note over System: No method calls detected';
  }

  // Extract method call sequences
  const methodCalls = extractMethodCallSequences(nodes, edges, maxCalls);

  // If no method calls were extracted, return an empty diagram
  if (methodCalls.length === 0) {
    return 'sequenceDiagram\n  Note over System: No method calls detected';
  }

  // Extract participants
  const participants = extractParticipants(methodCalls, nodes);

  // Generate the sequence diagram
  const diagram = generateSequenceDiagram(methodCalls, participants);

  // Optimize the diagram for readability
  const optimizedDiagram = optimizeSequenceDiagram(diagram, maxParticipants);

  return optimizedDiagram;
}