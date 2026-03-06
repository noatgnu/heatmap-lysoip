import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap, map } from 'rxjs';
import { GeneData, ProjectMetadata } from '../models';

export type DatasetType = 'lysoip' | 'wcl';

export interface ParsedData {
  projects: ProjectMetadata[];
  genes: GeneData[];
}

/**
 * Service responsible for loading and parsing proteomics TSV data files.
 * Provides caching to avoid redundant network requests.
 */
@Injectable({ providedIn: 'root' })
export class DataService {
  private http = inject(HttpClient);
  private cache = new Map<DatasetType, ParsedData>();

  isLoading = signal(false);

  private readonly fileNames: Record<DatasetType, string> = {
    lysoip: 'zzz-FinalDestination_LysoIP_summary_FORMATTED_ForFiltering_20240708.txt',
    wcl: 'zzz-FinalDestination_WCL_summary_FORMATTED_Forfiltering_20240708.txt'
  };

  /**
   * Loads and parses dataset, returning cached data if available.
   */
  loadDataset(type: DatasetType): Observable<ParsedData> {
    const cached = this.cache.get(type);
    if (cached) {
      return of(cached);
    }

    this.isLoading.set(true);
    const fileName = this.fileNames[type];

    return this.http.get(fileName, { responseType: 'text' }).pipe(
      map(content => this.parseData(content)),
      tap(data => {
        this.cache.set(type, data);
        this.isLoading.set(false);
      })
    );
  }

  /**
   * Clears the cache for a specific dataset or all datasets.
   */
  clearCache(type?: DatasetType): void {
    if (type) {
      this.cache.delete(type);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Checks if a dataset is already cached.
   */
  isCached(type: DatasetType): boolean {
    return this.cache.has(type);
  }

  /**
   * Parses TSV content into structured project and gene data.
   */
  parseData(content: string): ParsedData {
    const rows = this.parseTSV(content);
    if (rows.length < 3) {
      return { projects: [], genes: [] };
    }

    const row1 = rows[0];
    const row2 = rows[1];

    const projects: ProjectMetadata[] = [];
    for (let i = 6; i < row1.length; i += 3) {
      const projectId = row1[i];
      let fullProjectName = (row2[i] || '').trim();
      if (!projectId && !fullProjectName) continue;

      let projectName = fullProjectName.replace(/^\d{8}[_0-9]*\s*/, '');
      projectName = projectName.replace(/\n/g, ' ');
      projectName = projectName.replace(/\s*\([^)]*\+[^)]*\)/g, '').trim();

      let organ = 'Other';
      if (projectName.toLowerCase().includes('brain')) organ = 'Brain';
      else if (projectName.toLowerCase().includes('lung')) organ = 'Lung';
      else if (projectName.toLowerCase().includes('mefs')) organ = 'MEFs';
      else if (projectName.toLowerCase().includes('a549')) organ = 'A549';

      let protein = 'Other';
      if (projectName.toLowerCase().includes('vps35')) protein = 'VPS35';
      else if (projectName.toLowerCase().includes('lrrk2')) protein = 'LRRK2';
      else if (projectName.toLowerCase().includes('gba')) protein = 'GBA';

      let mutation = 'Other';
      const mutMatch = projectName.match(/(D620N|R1441C|G2019S|KO|D409V|E326K|L444P|N370S)/i);
      if (mutMatch) {
        mutation = mutMatch[0].toUpperCase();
      }

      const isMLi2 = projectName.toLowerCase().includes('mli2');
      if (isMLi2) {
        mutation = mutation === 'Other' ? 'MLi2' : mutation + ' + MLi2';
      }

      if (projectName.toLowerCase().includes('wt')) {
        if (mutation === 'Other') mutation = 'WT';
        else if (!isMLi2) mutation = mutation + ' (vs WT)';
      }

      projects.push({
        projectId: (projectId || '').trim(),
        projectName,
        log2fcIndex: i + 1,
        organ,
        protein,
        mutation
      });
    }

    const genes: GeneData[] = [];
    for (let i = 3; i < rows.length; i++) {
      const r = rows[i];
      if (r.length < 2) continue;
      const uniprotId = (r[0] || '').trim();
      const gene = (r[1] || '').trim();
      if (!uniprotId && !gene) continue;

      const log2fcs = projects.map((p: ProjectMetadata) => {
        const valStr = r[p.log2fcIndex];
        const val = parseFloat(valStr);
        return isNaN(val) ? null : val;
      });

      genes.push({
        uniprotId,
        gene,
        log2fcs,
        searchString: `${uniprotId} ${gene}`.toLowerCase()
      });
    }

    return { projects, genes };
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
