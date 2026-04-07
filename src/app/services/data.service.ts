import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap, map, switchMap } from 'rxjs';
import { GeneData, ProjectMetadata } from '../models';

export type DatasetType = string;

export interface DatasetConfig {
  id: string;
  name: string;
  file: string;
  idRow: number;
  nameRow: number;
  dataStartRow: number;
  experimentStartCol: number;
  stride: number;
}

export interface CategorizationRule {
  pattern: string;
  value?: string;
  useCaptureGroup?: boolean;
  isFallback?: boolean;
}

export interface CategorizationConfig {
  key: string;
  label: string;
  rules: CategorizationRule[];
  default: string;
  priorities?: Record<string, number>;
}

export interface AppConfig {
  datasets: DatasetConfig[];
  categorization: CategorizationConfig[];
}

export interface ParsedData {
  projects: ProjectMetadata[];
  genes: GeneData[];
}

@Injectable({ providedIn: 'root' })
export class DataService {
  private http = inject(HttpClient);
  private cache = new Map<string, ParsedData>();
  private config: AppConfig | null = null;

  isLoading = signal(false);

  loadConfig(): Observable<AppConfig> {
    if (this.config) return of(this.config);
    return this.http.get<AppConfig>('config.json').pipe(
      tap(config => this.config = config)
    );
  }

  getConfig(): AppConfig | null {
    return this.config;
  }

  loadDataset(type: string): Observable<ParsedData> {
    const cached = this.cache.get(type);
    if (cached) return of(cached);

    return this.loadConfig().pipe(
      switchMap((config: AppConfig) => {
        const dsConfig = config.datasets.find((d: DatasetConfig) => d.id === type);
        if (!dsConfig) throw new Error(`Dataset ${type} not found in config`);

        this.isLoading.set(true);
        // Map public/ path to just filename if it's served from root, or keep as is.
        // Assuming the app is served such that 'public/' files are at root.
        const fileName = dsConfig.file.replace(/^public\//, '');

        return this.http.get(fileName, { responseType: 'text' }).pipe(
          map(content => this.parseData(content, dsConfig, config.categorization)),
          tap(data => {
            this.cache.set(type, data);
            this.isLoading.set(false);
          })
        );
      })
    );
  }

  parseData(content: string, dsConfig: DatasetConfig, catConfigs: CategorizationConfig[]): ParsedData {
    const rows = this.parseTSV(content);
    if (rows.length <= Math.max(dsConfig.idRow, dsConfig.nameRow, dsConfig.dataStartRow)) {
      return { projects: [], genes: [] };
    }

    const idRow = rows[dsConfig.idRow];
    const nameRow = rows[dsConfig.nameRow];

    const projects: ProjectMetadata[] = [];
    for (let i = dsConfig.experimentStartCol; i < idRow.length; i += dsConfig.stride) {
      const projectId = idRow[i];
      let fullProjectName = (nameRow[i] || '').trim();
      if (!projectId && !fullProjectName) continue;

      let projectName = fullProjectName.replace(/\n/g, ' ').trim();
      projectName = projectName.replace(/ko vs wt/gi, 'WT vs KO');

      let date = '';
      const dateAtEndMatch = projectName.match(/\(Date\s*(\d{8})\)/i);
      if (dateAtEndMatch) date = dateAtEndMatch[1];
      else {
        const dateAtStartMatch = projectName.match(/^(\d{8})/);
        if (dateAtStartMatch) date = dateAtStartMatch[1];
      }

      const categorization: Record<string, string> = {};
      catConfigs.forEach(cat => {
        let value = '';
        for (const rule of cat.rules) {
          if (rule.isFallback) continue;
          const match = projectName.match(new RegExp(rule.pattern, 'i'));
          if (match) {
            if (rule.useCaptureGroup && match[1]) {
              value = match[1].toUpperCase();
            } else if (rule.value) {
              value = rule.value;
            } else {
              value = match[0].toUpperCase();
            }
            break;
          }
        }
        
        if (!value) {
          for (const rule of cat.rules) {
            if (rule.isFallback && new RegExp(rule.pattern, 'i').test(projectName)) {
              value = rule.value || cat.default;
              break;
            }
          }
        }
        categorization[cat.key] = value || cat.default;
      });

      projects.push({
        projectId: (projectId || '').trim() || `proj-${i}`,
        projectName,
        log2fcIndex: i + 1,
        organ: categorization['organ'] || 'Other',
        protein: categorization['protein'] || 'Other',
        mutation: categorization['mutation'] || 'None',
        knockout: categorization['knockout'] || 'None',
        treatment: categorization['treatment'] || 'None',
        fraction: categorization['fraction'] || (content.includes('LysoIP') ? 'Lyso' : 'WCL'),
        date,
        ...categorization
      });
    }

    const genes: GeneData[] = [];
    for (let i = dsConfig.dataStartRow; i < rows.length; i++) {
      const r = rows[i];
      if (r.length < 2) continue;
      const uniprotId = (r[0] || '').trim();
      let gene = (r[1] || '').trim();
      
      if (!uniprotId && !gene) continue;
      if (!gene && uniprotId) gene = uniprotId;

      const log2fcs = projects.map((p: ProjectMetadata) => {
        const valStr = r[p.log2fcIndex];
        const val = parseFloat(valStr);
        return isNaN(val) ? null : val;
      });

      const confidences = projects.map((p: ProjectMetadata) => {
        const valStr = r[p.log2fcIndex - 1];
        const val = parseFloat(valStr);
        return isNaN(val) ? null : val;
      });

      genes.push({
        uniprotId,
        gene,
        log2fcs,
        confidences,
        searchString: `${uniprotId} ${gene}`.toLowerCase()
      });
    }

    return { projects, genes };
  }


  /**
   * Detects the column stride between projects (2 or 3 columns per project).
   * LysoIP has 3 columns per project (Conf, Log2FC, IP enrich).
   * WCL has 2 columns per project (Conf, Log2FC).
   */
  private detectColumnStride(projectIdRow: string[]): number {
    if (projectIdRow.length > 8) {
      const col8 = (projectIdRow[8] || '').trim();
      if (col8 && /^\d/.test(col8)) {
        return 2;
      }
    }
    return 3;
  }

  /**
   * Parses TSV content handling quoted cells and tabs.
   */
  parseTSV(content: string): string[][] {
    if (!content || content.length === 0) {
      return [];
    }

    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === '\t' && !inQuotes) {
        currentRow.push(currentCell);
        currentCell = '';
      } else if (char === '\n' && !inQuotes) {
        if (currentCell.endsWith('\r')) {
          currentCell = currentCell.slice(0, -1);
        }
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }

    if (currentCell || currentRow.length > 0) {
      currentRow.push(currentCell);
      rows.push(currentRow);
    }

    return rows;
  }
}
