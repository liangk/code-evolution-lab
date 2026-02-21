import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';

export interface DetectorConfig {
  enabled?: boolean;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  customPatterns?: string[];
}

export interface CodeEvolutionConfig {
  extends?: string;
  ignore?: string[];
  detectors?: {
    'n1-query'?: DetectorConfig;
    'inefficient-loop'?: DetectorConfig;
    'memory-leak'?: DetectorConfig;
    'large-payload'?: DetectorConfig;
    [key: string]: DetectorConfig | undefined;
  };
  severity?: {
    minReportLevel?: 'low' | 'medium' | 'high' | 'critical';
    failOn?: 'low' | 'medium' | 'high' | 'critical';
  };
  output?: {
    format?: 'text' | 'json' | 'sarif';
    file?: string;
  };
  dbPatterns?: {
    orm?: string;
    methods?: string[];
  }[];
}

const CONFIG_FILES = [
  '.codeevolutionrc.json',
  '.codeevolutionrc',
  'codeevolution.config.json',
];

export class ConfigLoader {
  private config: CodeEvolutionConfig = {};
  private configPath: string | null = null;

  load(startDir: string = process.cwd()): CodeEvolutionConfig {
    this.configPath = this.findConfigFile(startDir);
    
    if (this.configPath) {
      this.config = this.parseConfigFile(this.configPath);
      
      if (this.config.extends) {
        const baseConfig = this.loadExtendedConfig(this.config.extends);
        this.config = this.mergeConfigs(baseConfig, this.config);
      }
    }

    return this.config;
  }

  getConfigPath(): string | null {
    return this.configPath;
  }

  private findConfigFile(startDir: string): string | null {
    let currentDir = resolve(startDir);
    const root = dirname(currentDir);

    while (currentDir !== root) {
      for (const configFile of CONFIG_FILES) {
        const configPath = resolve(currentDir, configFile);
        if (existsSync(configPath)) {
          return configPath;
        }
      }
      currentDir = dirname(currentDir);
    }

    return null;
  }

  private parseConfigFile(configPath: string): CodeEvolutionConfig {
    try {
      const content = readFileSync(configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.warn(`Warning: Failed to parse config file ${configPath}: ${(error as Error).message}`);
      return {};
    }
  }

  private loadExtendedConfig(extendsPath: string): CodeEvolutionConfig {
    if (!this.configPath) return {};

    const basePath = resolve(dirname(this.configPath), extendsPath);
    if (!existsSync(basePath)) {
      console.warn(`Warning: Extended config not found: ${basePath}`);
      return {};
    }

    return this.parseConfigFile(basePath);
  }

  private mergeConfigs(base: CodeEvolutionConfig, override: CodeEvolutionConfig): CodeEvolutionConfig {
    return {
      ...base,
      ...override,
      ignore: [...(base.ignore || []), ...(override.ignore || [])],
      detectors: { ...base.detectors, ...override.detectors },
      severity: { ...base.severity, ...override.severity },
      output: { ...base.output, ...override.output },
      dbPatterns: [...(base.dbPatterns || []), ...(override.dbPatterns || [])],
    };
  }

  isDetectorEnabled(detectorName: string): boolean {
    const normalized = this.normalizeDetectorName(detectorName);
    const detectorConfig = this.config.detectors?.[normalized];
    return detectorConfig?.enabled !== false;
  }

  getDetectorConfig(detectorName: string): DetectorConfig | undefined {
    const normalized = this.normalizeDetectorName(detectorName);
    return this.config.detectors?.[normalized];
  }

  getCustomDbPatterns(): { orm: string; methods: string[] }[] {
    return (this.config.dbPatterns || []).filter(
      (p): p is { orm: string; methods: string[] } => !!p.orm && Array.isArray(p.methods)
    );
  }

  getIgnorePatterns(): string[] {
    return this.config.ignore || [];
  }

  getMinReportLevel(): string {
    return this.config.severity?.minReportLevel || 'low';
  }

  getFailOn(): string {
    return this.config.severity?.failOn || 'low';
  }

  getOutputFormat(): string {
    return this.config.output?.format || 'text';
  }

  getOutputFile(): string | null {
    return this.config.output?.file || null;
  }

  private normalizeDetectorName(name: string): string {
    return name.toLowerCase()
      .replace(/\s+/g, '-')
      .replace('detector', '')
      .replace(/^-|-$/g, '')
      .trim();
  }
}

export default new ConfigLoader();
