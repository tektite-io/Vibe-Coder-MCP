/**
 * Semantic information extraction and compression utilities
 * Preserves meaningful content while respecting character limits
 */

export interface CommentContext {
  type: 'file' | 'class' | 'method' | 'property' | 'function' | 'import';
  name?: string;
  parentClass?: string;
}

export interface EnhancedContext {
  structural: CommentContext;
  domains: string[];
  confidence: number;
}

/**
 * Automatically detect context from comment content and structure
 */
export function detectFullContext(comment: string, structuralContext?: CommentContext): EnhancedContext {
  const domains = [
    ...detectDomainContext(comment),
    ...detectNamingContext(structuralContext?.name),
    ...detectNamingContext(structuralContext?.parentClass)
  ];

  return {
    structural: structuralContext || { type: 'function' },
    domains: [...new Set(domains)], // Remove duplicates
    confidence: calculateContextConfidence(comment, domains)
  };
}

/**
 * Detect domain context from comment content
 */
function detectDomainContext(comment: string): string[] {
  const contexts: string[] = [];
  const lowerComment = comment.toLowerCase();

  // Authentication domain
  if (/\b(auth|login|password|token|session|credential|jwt|oauth|signin|signup|logout)\b/.test(lowerComment)) {
    contexts.push('authentication');
  }

  // Database domain
  if (/\b(database|db|query|sql|table|record|entity|repository|orm|migration|schema)\b/.test(lowerComment)) {
    contexts.push('database');
  }

  // API domain
  if (/\b(api|endpoint|request|response|http|rest|graphql|route|controller)\b/.test(lowerComment)) {
    contexts.push('api');
  }

  // Cache domain
  if (/\b(cache|redis|memory|store|expire|ttl|invalidate|evict)\b/.test(lowerComment)) {
    contexts.push('cache');
  }

  // Service domain
  if (/\b(service|manager|handler|processor|worker|job|task)\b/.test(lowerComment)) {
    contexts.push('service');
  }

  // Validation domain
  if (/\b(validate|validation|verify|check|sanitize|clean|format)\b/.test(lowerComment)) {
    contexts.push('validation');
  }

  // File/IO domain
  if (/\b(file|directory|path|read|write|upload|download|stream)\b/.test(lowerComment)) {
    contexts.push('file');
  }

  return contexts;
}

/**
 * Detect context from naming patterns
 */
function detectNamingContext(name?: string): string[] {
  if (!name) return [];

  const contexts: string[] = [];
  const lowerName = name.toLowerCase();

  // Authentication patterns
  if (/auth|login|password|token|session|jwt|credential/.test(lowerName)) {
    contexts.push('authentication');
  }

  // Database patterns
  if (/repository|dao|entity|model|query|db|table|record/.test(lowerName)) {
    contexts.push('database');
  }

  // API patterns
  if (/controller|router|endpoint|handler|middleware/.test(lowerName)) {
    contexts.push('api');
  }

  // Service patterns
  if (/service|manager|processor|worker|job/.test(lowerName)) {
    contexts.push('service');
  }

  // Cache patterns
  if (/cache|redis|memory|store/.test(lowerName)) {
    contexts.push('cache');
  }

  return contexts;
}

/**
 * Calculate confidence score for context detection
 */
function calculateContextConfidence(comment: string, domains: string[]): number {
  if (domains.length === 0) return 0.1;

  const wordCount = comment.split(/\s+/).length;
  const domainTermCount = domains.length;

  // Higher confidence for more domain terms relative to comment length
  return Math.min(0.9, (domainTermCount / wordCount) * 2);
}

/**
 * Extract semantic keywords from comment text with enhanced context
 */
export function extractSemanticKeywords(comment: string, context?: CommentContext): string[] {
  const keywords: string[] = [];
  
  // Extract action verbs (creates, handles, manages, etc.)
  const actionVerbs = comment.match(/\b(creates?|handles?|manages?|processes?|validates?|generates?|calculates?|performs?|executes?|returns?|gets?|sets?|builds?|parses?|formats?|converts?|transforms?|filters?|sorts?|searches?|finds?|loads?|saves?|updates?|deletes?|removes?|adds?|inserts?)\b/gi);
  if (actionVerbs) {
    keywords.push(...actionVerbs.map(verb => verb.toLowerCase()));
  }
  
  // Extract domain-specific terms
  const domainTerms = extractDomainTerms(comment, context);
  keywords.push(...domainTerms);
  
  // Extract purpose indicators with following words
  const purposeMatches = comment.match(/\b(for|to|that|which)\s+(\w+(?:\s+\w+){0,2})/gi);
  if (purposeMatches) {
    purposeMatches.forEach(match => {
      const words = match.split(/\s+/).slice(1); // Remove 'for', 'to', etc.
      keywords.push(...words.map(word => word.toLowerCase()));
    });
  }
  
  // Extract important nouns (likely domain concepts)
  const importantNouns = comment.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)*\b/g);
  if (importantNouns) {
    keywords.push(...importantNouns.map(noun => noun.toLowerCase()));
  }
  
  return [...new Set(keywords)]; // Remove duplicates
}

/**
 * Compress comment content while preserving semantic meaning
 */
export function compressSemanticContent(comment: string, keywords: string[]): string {
  let compressed = comment;
  
  // Remove common redundant phrases
  compressed = compressed
    .replace(/\bthis (function|method|class|property|file|module|component)\b/gi, '')
    .replace(/\bis used (to|for)\b/gi, '')
    .replace(/\bprovides? (a|an|the)?\s*/gi, '')
    .replace(/\breturn[s]?\s+(a|an|the)\s+/gi, 'returns ')
    .replace(/\brepresents? (a|an|the)?\s*/gi, '')
    .replace(/\bcontains? (a|an|the)?\s*/gi, 'has ')
    .replace(/\bimplements? (a|an|the)?\s*/gi, 'implements ')
    .replace(/\bdefines? (a|an|the)?\s*/gi, 'defines ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // If still too long, prioritize sentences with keywords
  if (compressed.length > 50) {
    const sentences = compressed.split(/[.!?]+/);
    if (sentences.length > 1) {
      const prioritized = sentences
        .map(sentence => ({
          text: sentence.trim(),
          score: calculateSemanticScore(sentence, keywords),
          length: sentence.trim().length
        }))
        .filter(item => item.text.length > 0)
        .sort((a, b) => {
          // Prioritize by semantic score, then by brevity
          if (b.score !== a.score) return b.score - a.score;
          return a.length - b.length;
        });
      
      if (prioritized.length > 0) {
        compressed = prioritized[0].text;
      }
    }
  }
  
  return compressed;
}

/**
 * Pure semantic keyword selection without truncation
 */
export function selectBestKeywords(comment: string, maxLength: number, context?: CommentContext): string {
  if (comment.length <= maxLength) return comment;

  // Detect context automatically
  const enhancedContext = detectFullContext(comment, context);

  // Extract keywords with context awareness
  const keywords = extractSemanticKeywords(comment, context);

  // Prioritize keywords by context relevance
  const prioritizedKeywords = prioritizeKeywordsByContext(keywords, enhancedContext.domains);

  // Apply domain-specific abbreviations
  const abbreviatedKeywords = applyContextAbbreviations(prioritizedKeywords, enhancedContext.domains);

  // Select keywords that fit within length limit
  return selectKeywordsWithinLimit(abbreviatedKeywords, maxLength);
}

/**
 * Prioritize keywords based on detected context domains
 */
function prioritizeKeywordsByContext(keywords: string[], domains: string[]): string[] {
  const priorityMap: Record<string, string[]> = {
    authentication: ['auth', 'login', 'token', 'session', 'credential', 'jwt', 'oauth', 'user'],
    database: ['query', 'sql', 'table', 'record', 'entity', 'db', 'repository', 'data'],
    api: ['http', 'request', 'response', 'endpoint', 'rest', 'post', 'get', 'route'],
    cache: ['cache', 'redis', 'memory', 'expire', 'ttl', 'store', 'key'],
    service: ['service', 'manager', 'handler', 'processor', 'worker', 'job'],
    validation: ['validate', 'verify', 'check', 'sanitize', 'format', 'clean'],
    file: ['file', 'path', 'read', 'write', 'upload', 'download', 'stream']
  };

  return keywords.sort((a, b) => {
    const scoreA = calculateKeywordContextScore(a, domains, priorityMap);
    const scoreB = calculateKeywordContextScore(b, domains, priorityMap);
    return scoreB - scoreA;
  });
}

/**
 * Calculate context relevance score for a keyword
 */
function calculateKeywordContextScore(keyword: string, domains: string[], priorityMap: Record<string, string[]>): number {
  let score = 0;

  for (const domain of domains) {
    const domainKeywords = priorityMap[domain] || [];
    if (domainKeywords.includes(keyword.toLowerCase())) {
      score += 2; // High priority for domain-specific terms
    }
  }

  // Base score for action verbs
  if (/^(creates?|handles?|manages?|processes?|validates?|generates?|gets?|sets?)$/i.test(keyword)) {
    score += 1;
  }

  return score;
}

/**
 * Apply context-specific abbreviations
 */
function applyContextAbbreviations(keywords: string[], domains: string[]): string[] {
  const abbreviations: Record<string, string> = {
    authentication: 'auth',
    configuration: 'config',
    database: 'db',
    repository: 'repo',
    validation: 'valid',
    management: 'mgmt',
    processing: 'proc',
    generation: 'gen',
    initialization: 'init'
  };

  return keywords.map(keyword => {
    const lower = keyword.toLowerCase();
    return abbreviations[lower] || keyword;
  });
}

/**
 * Select keywords that fit within the character limit
 */
function selectKeywordsWithinLimit(keywords: string[], maxLength: number): string {
  if (keywords.length === 0) return '';

  const selected: string[] = [];
  let currentLength = 0;

  for (const keyword of keywords) {
    const newLength = currentLength + (selected.length > 0 ? 1 : 0) + keyword.length; // +1 for space

    if (newLength <= maxLength) {
      selected.push(keyword);
      currentLength = newLength;
    } else {
      break;
    }
  }

  return selected.join(' ');
}

/**
 * Extract domain-specific terms based on context
 */
function extractDomainTerms(comment: string, context?: CommentContext): string[] {
  const terms: string[] = [];
  
  // Programming-specific terms
  const progTerms = comment.match(/\b(API|HTTP|HTTPS|REST|GraphQL|JSON|XML|YAML|database|DB|cache|auth|authentication|authorization|config|configuration|util|utility|helper|service|controller|model|view|component|module|library|framework|middleware|router|handler|processor|manager|builder|factory|adapter|wrapper|decorator|observer|strategy|command|query|repository|entity|DTO|DAO)\b/gi);
  if (progTerms) {
    terms.push(...progTerms.map(term => term.toLowerCase()));
  }
  
  // Context-specific terms
  if (context?.type === 'class') {
    const classTerms = comment.match(/\b(manager|handler|processor|builder|factory|adapter|wrapper|controller|service|repository|entity|model|view|component)\b/gi);
    if (classTerms) {
      terms.push(...classTerms.map(term => term.toLowerCase()));
    }
  }
  
  if (context?.type === 'method' || context?.type === 'function') {
    const functionTerms = comment.match(/\b(validate|process|handle|manage|create|build|parse|format|convert|transform|filter|sort|search|find|load|save|update|delete|remove|add|insert|get|set|fetch|send|receive|execute|run|start|stop|init|initialize|cleanup|destroy)\b/gi);
    if (functionTerms) {
      terms.push(...functionTerms.map(term => term.toLowerCase()));
    }
  }
  
  // File type specific terms
  if (context?.type === 'file') {
    const fileTerms = comment.match(/\b(test|spec|config|configuration|utility|helper|service|controller|model|view|component|module|library|types|interface|constants|enum)\b/gi);
    if (fileTerms) {
      terms.push(...fileTerms.map(term => term.toLowerCase()));
    }
  }
  
  return terms;
}

/**
 * Calculate semantic score based on keyword presence
 */
function calculateSemanticScore(sentence: string, keywords: string[]): number {
  let score = 0;
  const lowerSentence = sentence.toLowerCase();
  
  keywords.forEach(keyword => {
    if (lowerSentence.includes(keyword)) {
      score += 1;
    }
  });
  
  // Bonus for action verbs at the beginning
  if (/^\s*(creates?|handles?|manages?|processes?|validates?|generates?|calculates?|performs?|executes?|returns?|gets?|sets?)/i.test(sentence)) {
    score += 0.5;
  }
  
  return score;
}
