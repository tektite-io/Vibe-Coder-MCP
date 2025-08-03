/**
 * PRD Integration Service
 *
 * Integrates with the existing prd-generator tool to provide project context
 * for task decomposition. Handles PRD discovery, parsing, and context integration
 * with error handling and caching.
 */

import fs from 'fs/promises';
import path from 'path';
import logger from '../../../logger.js';
import type { PRDInfo, ParsedPRD } from '../types/artifact-types.js';
import { UnifiedSecurityEngine, createDefaultSecurityConfig } from '../core/unified-security-engine.js';

/**
 * PRD parsing result
 */
export interface PRDResult {
  /** Success status */
  success: boolean;
  /** Parsed PRD data */
  prdData?: ParsedPRD;
  /** Error message if parsing failed */
  error?: string;
  /** Parsing time in milliseconds */
  parsingTime?: number;
}

/**
 * PRD integration configuration
 */
interface PRDIntegrationConfig {
  /** Maximum age of PRD before considering it stale (in milliseconds) */
  maxAge: number;
  /** Whether to cache PRD results */
  enableCaching: boolean;
  /** Maximum number of cached PRDs */
  maxCacheSize: number;
  /** Performance monitoring enabled */
  enablePerformanceMonitoring: boolean;
}

/**
 * PRD metadata information
 */
export interface PRDMetadata {
  /** PRD file path */
  filePath: string;
  /** Project path */
  projectPath: string;
  /** Creation timestamp */
  createdAt: Date;
  /** File size in bytes */
  fileSize: number;
  /** PRD version */
  version: string;
  /** Performance metrics */
  performanceMetrics: {
    parsingTime: number;
    fileSize: number;
    featureCount: number;
    sectionCount: number;
  };
}

/**
 * PRD validation result
 */
export interface PRDValidationResult {
  /** Whether the PRD is valid */
  isValid: boolean;
  /** Validation errors */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
  /** Completeness score (0-1) */
  completenessScore: number;
  /** Validation timestamp */
  validatedAt: Date;
}

/**
 * PRD data types for API requests
 */
export type PRDDataType =
  | 'overview'
  | 'features'
  | 'technical'
  | 'constraints'
  | 'metadata'
  | 'full_content';

/**
 * PRD Integration Service implementation
 */
export class PRDIntegrationService {
  private static instance: PRDIntegrationService;
  private config: PRDIntegrationConfig;
  private prdCache = new Map<string, PRDInfo>();
  private performanceMetrics = new Map<string, PRDMetadata['performanceMetrics']>();
  private securityEngine: UnifiedSecurityEngine | null = null;

  private constructor() {
    this.config = {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      enableCaching: true,
      maxCacheSize: 50,
      enablePerformanceMonitoring: true
    };

    logger.debug('PRD integration service initialized');
  }

  /**
   * Get or initialize the security engine
   */
  private async getSecurityEngine(): Promise<UnifiedSecurityEngine> {
    if (!this.securityEngine) {
      const config = createDefaultSecurityConfig();
      this.securityEngine = UnifiedSecurityEngine.getInstance(config);
      await this.securityEngine.initialize();
    }
    return this.securityEngine;
  }

  /**
   * Get singleton instance
   */
  static getInstance(): PRDIntegrationService {
    if (!PRDIntegrationService.instance) {
      PRDIntegrationService.instance = new PRDIntegrationService();
    }
    return PRDIntegrationService.instance;
  }

  /**
   * Parse PRD for a project
   */
  async parsePRD(prdFilePath: string): Promise<PRDResult> {
    const startTime = Date.now();

    try {
      logger.info({ prdFilePath }, 'Starting PRD parsing');

      // Validate PRD file path
      await this.validatePRDPath(prdFilePath);

      // Read PRD content
      const prdContent = await fs.readFile(prdFilePath, 'utf-8');

      // Parse PRD content
      const prdData = await this.parsePRDContent(prdContent, prdFilePath);

      const parsingTime = Date.now() - startTime;

      // Update cache
      if (this.config.enableCaching) {
        await this.updatePRDCache(prdFilePath);
      }

      logger.info({
        prdFilePath,
        parsingTime,
        featureCount: prdData.features.length
      }, 'PRD parsing completed successfully');

      return {
        success: true,
        prdData,
        parsingTime
      };

    } catch (error) {
      const parsingTime = Date.now() - startTime;
      logger.error({ err: error, prdFilePath }, 'PRD parsing failed with exception');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        parsingTime
      };
    }
  }

  /**
   * Detect existing PRD for a project
   */
  async detectExistingPRD(projectPath?: string): Promise<PRDInfo | null> {
    try {
      // Check cache first
      if (this.config.enableCaching && projectPath && this.prdCache.has(projectPath)) {
        const cached = this.prdCache.get(projectPath)!;

        // Verify file still exists
        try {
          await fs.access(cached.filePath);
          return cached;
        } catch {
          // File no longer exists, remove from cache
          this.prdCache.delete(projectPath);
        }
      }

      // Look for PRD files in the output directory
      const prdFiles = await this.findPRDFiles(projectPath);

      if (prdFiles.length === 0) {
        return null;
      }

      // Get the most recent PRD
      const mostRecent = prdFiles.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

      // Update cache
      if (this.config.enableCaching && projectPath) {
        this.prdCache.set(projectPath, mostRecent);
      }

      return mostRecent;

    } catch (error) {
      logger.warn({ err: error, projectPath }, 'Failed to detect existing PRD');
      return null;
    }
  }

  /**
   * Validate PRD file path with security checks
   */
  private async validatePRDPath(prdFilePath: string): Promise<void> {
    try {
      // Use unified security engine for path validation
      const securityEngine = await this.getSecurityEngine();
      const validationResponse = await securityEngine.validatePath(prdFilePath, 'read');

      if (!validationResponse.success) {
        throw new Error(`Security validation failed: ${validationResponse.error?.message || 'Unknown error'}`);
      }

      const validationResult = validationResponse.data;
      if (!validationResult.isValid) {
        throw new Error(`Security validation failed: ${validationResult.error || 'Path validation failed'}`);
      }

      // Log any security warnings
      if (validationResult.warnings && validationResult.warnings.length > 0) {
        logger.warn({
          prdFilePath,
          warnings: validationResult.warnings
        }, 'PRD path validation warnings');
      }

      // Additional PRD-specific validation
      if (!prdFilePath.endsWith('.md')) {
        throw new Error('PRD file must be a Markdown file (.md)');
      }

    } catch (error) {
      logger.error({ err: error, prdFilePath }, 'PRD path validation failed');
      throw new Error(`Invalid PRD file path: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Update PRD cache
   */
  private async updatePRDCache(prdFilePath: string): Promise<void> {
    try {
      const stats = await fs.stat(prdFilePath);
      const fileName = path.basename(prdFilePath);
      
      // Extract project name and creation date from filename
      const { projectName, createdAt } = this.extractPRDMetadataFromFilename(fileName);

      const prdInfo: PRDInfo = {
        filePath: prdFilePath,
        fileName,
        createdAt,
        projectName,
        fileSize: stats.size,
        isAccessible: true,
        lastModified: stats.mtime
      };

      // Use project name as cache key
      this.prdCache.set(projectName, prdInfo);

      // Maintain cache size limit
      if (this.prdCache.size > this.config.maxCacheSize) {
        const oldestKey = this.prdCache.keys().next().value;
        if (oldestKey) {
          this.prdCache.delete(oldestKey);
        }
      }

    } catch (error) {
      logger.warn({ err: error, prdFilePath }, 'Failed to update PRD cache');
    }
  }

  /**
   * Split compound words into individual parts for better matching
   * Examples:
   * - "kidzhealth" → ["kidz", "health"] → ["kids", "health"]
   * - "HealthCompanion" → ["Health", "Companion"]
   * - "web-app" → ["web", "app"]
   */
  private splitCompoundWord(word: string): string[] {
    // First, split by common boundaries
    const parts = word.split(/(?=[A-Z])|[-_]|(?<=[a-z])(?=[0-9])/);
    
    // Then handle special cases like 'kidz' → 'kids'
    const normalizedParts = parts.map(part => {
      // Convert 'z' to 's' at end of words for common misspellings
      if (part.endsWith('z') && part.length > 2) {
        const withoutZ = part.slice(0, -1);
        // Check if it looks like a pluralization (vowel before z)
        if (/[aeiou]$/.test(withoutZ)) {
          return withoutZ + 's';
        }
      }
      return part;
    });
    
    // Also generate space-separated version
    const spacedVersion = word
      .replace(/([a-z])([A-Z])/g, '$1 $2')  // camelCase
      .replace(/([a-z])z([a-z])/g, '$1s $2') // kidz → kids
      .toLowerCase();
    
    // Return unique parts
    const allParts = [...normalizedParts, ...spacedVersion.split(' ')];
    return Array.from(new Set(allParts.filter(p => p.length > 0)));
  }

  /**
   * Extract metadata from PRD filename
   */
  private extractPRDMetadataFromFilename(fileName: string): { projectName: string; createdAt: Date } {
    // Expected format: YYYY-MM-DDTHH-mm-ss-sssZ-project-name-prd.md
    const match = fileName.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)-(.+)-prd\.md$/);

    if (match) {
      const [, timestamp, projectSlug] = match;
      const createdAt = new Date(timestamp.replace(/-/g, ':').replace(/T(\d{2}):(\d{2}):(\d{2}):(\d{3})Z/, 'T$1:$2:$3.$4Z'));
      const projectName = projectSlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

      return { projectName, createdAt };
    }

    // Fallback for non-standard filenames
    return {
      projectName: fileName.replace(/-prd\.md$/, '').replace(/-/g, ' '),
      createdAt: new Date()
    };
  }

  /**
   * Find existing PRD files for a project
   */
  private async findPRDFiles(projectPath?: string): Promise<PRDInfo[]> {
    try {
      // Get the output directory from environment or default
      const outputBaseDir = process.env.VIBE_CODER_OUTPUT_DIR || path.join(process.cwd(), 'VibeCoderOutput');
      const prdOutputDir = path.join(outputBaseDir, 'prd-generator');

      // Check if output directory exists
      try {
        await fs.access(prdOutputDir);
      } catch {
        return []; // No output directory means no PRDs
      }

      // Find all .md files in the output directory
      const files = await fs.readdir(prdOutputDir, { withFileTypes: true });
      const prdFiles: PRDInfo[] = [];

      for (const file of files) {
        if (file.isFile() && file.name.endsWith('-prd.md')) {
          const filePath = path.join(prdOutputDir, file.name);

          try {
            const stats = await fs.stat(filePath);
            const { projectName, createdAt } = this.extractPRDMetadataFromFilename(file.name);

            // If projectPath is specified, filter by project name or project ID
            if (projectPath) {
              // Handle both project ID (PID-EDUPLAY-ADVENTURES-001) and project name matching
              const projectPathLower = projectPath.toLowerCase();
              const projectNameLower = projectName.toLowerCase();
              
              // Check if projectPath is a project ID (starts with PID-)
              if (projectPathLower.startsWith('pid-')) {
                // For project IDs, be more lenient with matching
                // Try multiple matching strategies
                const projectIdParts = projectPathLower.replace('pid-', '').split('-');
                
                // Strategy 1: Check if any significant part matches with enhanced fuzzy matching
                const hasMatchingParts = projectIdParts.some(part => {
                  if (part.length <= 2) {
                    logger.debug({ part, reason: 'too_short' }, 'Skipping PRD match for short part');
                    return false;
                  }
                  
                  // Try exact match
                  if (projectNameLower.includes(part)) {
                    logger.debug({ 
                      part, 
                      projectName: projectNameLower, 
                      matchType: 'exact' 
                    }, 'PRD match found via exact match');
                    return true;
                  }
                  
                  // Use the helper function to split compound words
                  const splitParts = this.splitCompoundWord(part);
                  logger.debug({ 
                    originalPart: part, 
                    splitParts,
                    projectName: projectNameLower 
                  }, 'Attempting fuzzy PRD match with split parts');
                  
                  // Check if any of the split parts match
                  for (const splitPart of splitParts) {
                    if (splitPart.length > 1 && projectNameLower.includes(splitPart.toLowerCase())) {
                      logger.debug({ 
                        originalPart: part,
                        matchedPart: splitPart,
                        projectName: projectNameLower,
                        matchType: 'split_part' 
                      }, 'PRD match found via split part');
                      return true;
                    }
                  }
                  
                  // Check if ALL parts of a compound word are present (for cases like "kids health")
                  const compoundParts = splitParts.filter(p => p.length > 2);
                  if (compoundParts.length > 1) {
                    const allPartsMatch = compoundParts.every(word => 
                      projectNameLower.includes(word.toLowerCase())
                    );
                    if (allPartsMatch) {
                      logger.debug({ 
                        originalPart: part,
                        matchedParts: compoundParts,
                        projectName: projectNameLower,
                        matchType: 'all_compound_parts' 
                      }, 'PRD match found via all compound parts');
                      return true;
                    }
                  }
                  
                  logger.debug({ 
                    part, 
                    splitParts,
                    projectName: projectNameLower,
                    reason: 'no_match' 
                  }, 'No PRD match found for part');
                  return false;
                });
                
                // Strategy 2: Check if this is a platform-based project (common terms)
                const isPlatformProject = projectNameLower.includes('platform') ||
                                         projectNameLower.includes('web') ||
                                       projectNameLower.includes('based');
                
                // Strategy 3: Check if the project ID contains common educational terms
                const hasEducationalTerms = projectIdParts.some(part => 
                  ['edu', 'play', 'game', 'learn', 'platform'].includes(part)
                );
                
                // Log matching decision
                logger.debug({ 
                  projectId: projectPathLower,
                  projectName: projectNameLower,
                  hasMatchingParts,
                  isPlatformProject,
                  hasEducationalTerms,
                  strategies: {
                    fuzzyMatch: hasMatchingParts,
                    platformMatch: isPlatformProject,
                    educationalMatch: hasEducationalTerms
                  }
                }, 'PRD matching strategies evaluated');
                
                // Accept if any strategy matches
                if (!hasMatchingParts && !isPlatformProject && !hasEducationalTerms) {
                  logger.debug({ 
                    projectId: projectPathLower,
                    fileName: file.name,
                    reason: 'no_strategy_matched' 
                  }, 'Skipping PRD file - no matching strategy succeeded');
                  continue;
                }
              } else {
                // Traditional project name matching
                const expectedProjectName = path.basename(projectPath).toLowerCase();
                if (!projectNameLower.includes(expectedProjectName)) {
                  continue;
                }
              }
            }

            prdFiles.push({
              filePath,
              fileName: file.name,
              createdAt,
              projectName,
              fileSize: stats.size,
              isAccessible: true,
              lastModified: stats.mtime
            });

          } catch (error) {
            logger.warn({ err: error, fileName: file.name }, 'Failed to process PRD file');

            // Add as inaccessible file
            const { projectName, createdAt } = this.extractPRDMetadataFromFilename(file.name);
            prdFiles.push({
              filePath: path.join(prdOutputDir, file.name),
              fileName: file.name,
              createdAt,
              projectName,
              fileSize: 0,
              isAccessible: false,
              lastModified: new Date()
            });
          }
        }
      }

      return prdFiles;

    } catch (error) {
      logger.error({ err: error, projectPath }, 'Failed to find PRD files');
      return [];
    }
  }

  /**
   * Parse PRD content from markdown
   */
  private async parsePRDContent(content: string, filePath: string): Promise<ParsedPRD> {
    const startTime = Date.now();

    try {
      // Validate file path before accessing file system
      const securityEngine = await this.getSecurityEngine();
      const validationResponse = await securityEngine.validatePath(filePath, 'read');
      
      if (!validationResponse.success) {
        throw new Error(`Security validation failed: ${validationResponse.error?.message || 'Unknown error'}`);
      }
      
      const validationResult = validationResponse.data;
      if (!validationResult.isValid) {
        throw new Error(`Security validation failed: ${validationResult.error || 'Path validation failed'}`);
      }

      const lines = content.split('\n');
      const fileName = path.basename(filePath);
      const { projectName, createdAt } = this.extractPRDMetadataFromFilename(fileName);
      const stats = await fs.stat(validationResult.normalizedPath || filePath);

      // Initialize parsed PRD structure
      const parsedPRD: ParsedPRD = {
        metadata: {
          filePath,
          projectName,
          createdAt,
          fileSize: stats.size
        },
        overview: {
          description: '',
          businessGoals: [],
          productGoals: [],
          successMetrics: []
        },
        targetAudience: {
          primaryUsers: [],
          demographics: [],
          userNeeds: []
        },
        features: [],
        technical: {
          techStack: [],
          architecturalPatterns: [],
          performanceRequirements: [],
          securityRequirements: [],
          scalabilityRequirements: []
        },
        constraints: {
          timeline: [],
          budget: [],
          resources: [],
          technical: []
        }
      };

      // Parse content sections
      let currentSection = '';
      let currentSubsection = '';
      let featureId = 1;
      let currentFeature: ParsedPRD['features'][0] | null = null;
      let inUserStory = false;
      let inAcceptanceCriteria = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Detect main sections
        if (line.startsWith('# ')) {
          currentSection = line.substring(2).toLowerCase();
          currentSubsection = '';
          currentFeature = null;
          continue;
        }

        // Detect subsections
        if (line.startsWith('## ')) {
          currentSubsection = line.substring(3).toLowerCase();
          currentFeature = null;
          continue;
        }

        // Detect sub-subsections (features in ### format)
        if (line.startsWith('### ')) {
          const subsectionTitle = line.substring(4);
          currentSubsection = subsectionTitle.toLowerCase();
          
          // Check if this is a feature section (e.g., "### 4.1. Core Content Delivery")
          if (currentSection.includes('feature') || currentSection.includes('functionality')) {
            const featureMatch = subsectionTitle.match(/^(\d+\.?\d*\.?)\s*(.+)$/);
            if (featureMatch) {
              const [, , featureTitle] = featureMatch;
              currentFeature = {
                id: `F${featureId.toString().padStart(3, '0')}`,
                title: featureTitle.trim(),
                description: '',
                userStories: [],
                acceptanceCriteria: [],
                priority: 'medium'
              };
              parsedPRD.features.push(currentFeature);
              featureId++;
              inUserStory = false;
              inAcceptanceCriteria = false;
            }
          }
          continue;
        }

        // Parse user story and acceptance criteria sections
        if (currentFeature && line.startsWith('**')) {
          if (line.toLowerCase().includes('user story:')) {
            inUserStory = true;
            inAcceptanceCriteria = false;
            continue;
          } else if (line.toLowerCase().includes('acceptance criteria:')) {
            inUserStory = false;
            inAcceptanceCriteria = true;
            continue;
          } else if (line.toLowerCase().includes('description:')) {
            inUserStory = false;
            inAcceptanceCriteria = false;
            continue;
          }
        }

        // Parse feature content
        if (currentFeature) {
          if (inUserStory && line.length > 0) {
            currentFeature.userStories.push(line);
          } else if (inAcceptanceCriteria && line.startsWith('- ')) {
            currentFeature.acceptanceCriteria.push(line.substring(2));
          } else if (!inUserStory && !inAcceptanceCriteria && line.length > 0 && !line.startsWith('**')) {
            if (currentFeature.description) {
              currentFeature.description += ' ';
            }
            currentFeature.description += line;
          }
        }

        // Parse content based on current section (for non-feature sections)
        if (!currentFeature) {
          this.parsePRDSection(line, currentSection, currentSubsection, parsedPRD, featureId);
        }

        // Also check for the old format (- **Feature:**)
        if (currentSection.includes('feature') && line.startsWith('- **') && line.includes(':**')) {
          const match = line.match(/- \*\*(.+?):\*\*\s*(.+)/);
          if (match) {
            const [, title, description] = match;
            currentFeature = {
              id: `F${featureId.toString().padStart(3, '0')}`,
              title: title.trim(),
              description: description.trim(),
              userStories: [],
              acceptanceCriteria: [],
              priority: 'medium'
            };
            parsedPRD.features.push(currentFeature);
            featureId++;
          }
        }
      }

      // Record performance metrics
      if (this.config.enablePerformanceMonitoring) {
        const parsingTime = Date.now() - startTime;
        this.performanceMetrics.set(filePath, {
          parsingTime,
          fileSize: stats.size,
          featureCount: parsedPRD.features.length,
          sectionCount: 5 // overview, target audience, features, technical, constraints
        });
      }

      logger.info({
        filePath,
        featureCount: parsedPRD.features.length,
        features: parsedPRD.features.map(f => ({ id: f.id, title: f.title }))
      }, 'PRD content parsed successfully');

      return parsedPRD;

    } catch (error) {
      logger.error({ err: error, filePath }, 'Failed to parse PRD content');
      throw error;
    }
  }

  /**
   * Parse individual PRD section content
   */
  private parsePRDSection(
    line: string,
    section: string,
    subsection: string,
    parsedPRD: ParsedPRD,
    featureId: number
  ): void {
    if (!line || line.startsWith('#')) return;

    // Parse based on section and subsection
    if (section.includes('introduction') || section.includes('overview') || section.includes('comprehensive app prd')) {
      if (subsection.includes('description') && line.length > 10 && !line.startsWith('- ')) {
        parsedPRD.overview.description += line + ' ';
      } else if (line.startsWith('- ')) {
        if (subsection.includes('business') && subsection.includes('goal')) {
          parsedPRD.overview.businessGoals.push(line.substring(2));
        } else if (subsection.includes('product') && subsection.includes('goal')) {
          parsedPRD.overview.productGoals.push(line.substring(2));
        } else if (subsection.includes('success') && subsection.includes('metric')) {
          parsedPRD.overview.successMetrics.push(line.substring(2));
        }
      }
      // Handle direct content under main section
      if (!subsection && line.length > 10 && !line.startsWith('- ') && !line.startsWith('#')) {
        parsedPRD.overview.description += line + ' ';
      }
    }

    if (section.includes('target') || section.includes('audience')) {
      if (line.startsWith('- ')) {
        if (subsection.includes('user') || subsection.includes('primary')) {
          parsedPRD.targetAudience.primaryUsers.push(line.substring(2));
        } else if (subsection.includes('demographic')) {
          parsedPRD.targetAudience.demographics.push(line.substring(2));
        } else if (subsection.includes('need')) {
          parsedPRD.targetAudience.userNeeds.push(line.substring(2));
        }
      }
    }

    if (section.includes('feature') || section.includes('functionality')) {
      if (line.startsWith('- **') && line.includes(':**')) {
        // New feature
        const match = line.match(/- \*\*(.+?):\*\*\s*(.+)/);
        if (match) {
          const [, title, description] = match;
          parsedPRD.features.push({
            id: `F${featureId.toString().padStart(3, '0')}`,
            title: title.trim(),
            description: description.trim(),
            userStories: [],
            acceptanceCriteria: [],
            priority: 'medium'
          });
        }
      } else if (line.startsWith('  - ') && parsedPRD.features.length > 0) {
        // Feature details
        const lastFeature = parsedPRD.features[parsedPRD.features.length - 1];
        if (subsection.includes('story') || subsection.includes('user')) {
          lastFeature.userStories.push(line.substring(4));
        } else if (subsection.includes('criteria') || subsection.includes('acceptance')) {
          lastFeature.acceptanceCriteria.push(line.substring(4));
        }
      }
    }

    if (section.includes('technical') || section.includes('technology')) {
      if (line.startsWith('- ')) {
        if (subsection.includes('stack') || subsection.includes('technology')) {
          parsedPRD.technical.techStack.push(line.substring(2));
        } else if (subsection.includes('pattern') || subsection.includes('architecture')) {
          parsedPRD.technical.architecturalPatterns.push(line.substring(2));
        } else if (subsection.includes('performance')) {
          parsedPRD.technical.performanceRequirements.push(line.substring(2));
        } else if (subsection.includes('security')) {
          parsedPRD.technical.securityRequirements.push(line.substring(2));
        } else if (subsection.includes('scalability')) {
          parsedPRD.technical.scalabilityRequirements.push(line.substring(2));
        }
      }
    }

    if (section.includes('constraint') || section.includes('limitation')) {
      if (line.startsWith('- ')) {
        if (subsection.includes('timeline') || subsection.includes('schedule')) {
          parsedPRD.constraints.timeline.push(line.substring(2));
        } else if (subsection.includes('budget') || subsection.includes('cost')) {
          parsedPRD.constraints.budget.push(line.substring(2));
        } else if (subsection.includes('resource') || subsection.includes('team')) {
          parsedPRD.constraints.resources.push(line.substring(2));
        } else if (subsection.includes('technical')) {
          parsedPRD.constraints.technical.push(line.substring(2));
        }
      }
    }
  }

  /**
   * Get PRD metadata
   */
  async getPRDMetadata(prdFilePath: string): Promise<PRDMetadata> {
    try {
      // Validate PRD file path first
      await this.validatePRDPath(prdFilePath);

      const stats = await fs.stat(prdFilePath);
      const fileName = path.basename(prdFilePath);
      const { createdAt } = this.extractPRDMetadataFromFilename(fileName);

      // Get performance metrics if available
      const performanceMetrics = this.performanceMetrics.get(prdFilePath) || {
        parsingTime: 0,
        fileSize: stats.size,
        featureCount: 0,
        sectionCount: 0
      };

      return {
        filePath: prdFilePath,
        projectPath: '', // Will be determined by caller
        createdAt,
        fileSize: stats.size,
        version: '1.0', // Default version
        performanceMetrics
      };

    } catch (error) {
      logger.error({ err: error, prdFilePath }, 'Failed to get PRD metadata');
      throw error;
    }
  }

  /**
   * Clear PRD cache
   */
  clearCache(): void {
    this.prdCache.clear();
    this.performanceMetrics.clear();
    logger.info('PRD integration cache cleared');
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<PRDIntegrationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.debug({ config: this.config }, 'PRD integration configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): PRDIntegrationConfig {
    return { ...this.config };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): Map<string, PRDMetadata['performanceMetrics']> {
    return new Map(this.performanceMetrics);
  }
}
