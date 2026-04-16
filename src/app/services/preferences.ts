import { Injectable, signal } from '@angular/core';
export type SortCriterion = string;
export interface FilterPreset {
  id: string;
  name: string;
  dataset: string;
  geneIds: string[];
  filterState: Record<string, string[]>;
  sortStack: SortCriterion[];
  flippedProjectIds: string[];
  createdAt: number;
}
const STORAGE_KEY = 'heatmap_presets';
const MAX_PRESETS = 100;
/**
 * Service for persisting filter presets to localStorage.
 */
@Injectable({
  providedIn: 'root'
})
export class PreferencesService {
  private presetsSignal = signal<FilterPreset[]>([]);
  readonly presets = this.presetsSignal.asReadonly();
  constructor() {
    this.loadFromStorage();
  }
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as FilterPreset[];
        this.presetsSignal.set(parsed);
      }
    } catch {
      this.presetsSignal.set([]);
    }
  }
  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.presetsSignal()));
    } catch {
    }
  }
  savePreset(
    name: string,
    dataset: string,
    geneIds: Set<string>,
    filterState: Map<string, Set<string>>,
    sortStack: SortCriterion[],
    flippedProjectIds: Set<string>
  ): FilterPreset {
    const filterStateRecord: Record<string, string[]> = {};
    filterState.forEach((values, key) => {
      filterStateRecord[key] = Array.from(values);
    });
    const preset: FilterPreset = {
      id: crypto.randomUUID(),
      name,
      dataset,
      geneIds: Array.from(geneIds),
      filterState: filterStateRecord,
      sortStack: [...sortStack],
      flippedProjectIds: Array.from(flippedProjectIds),
      createdAt: Date.now()
    };
    this.presetsSignal.update(presets => {
      const updated = [preset, ...presets].slice(0, MAX_PRESETS);
      return updated;
    });
    this.saveToStorage();
    return preset;
  }
  deletePreset(id: string): void {
    this.presetsSignal.update(presets => presets.filter(p => p.id !== id));
    this.saveToStorage();
  }
  getPreset(id: string): FilterPreset | undefined {
    return this.presetsSignal().find(p => p.id === id);
  }
  getPresetsForDataset(dataset: string): FilterPreset[] {
    return this.presetsSignal().filter(p => p.dataset === dataset);
  }
  clearAllPresets(): void {
    this.presetsSignal.set([]);
    this.saveToStorage();
  }
  renamePreset(id: string, newName: string): void {
    this.presetsSignal.update(presets =>
      presets.map(p => (p.id === id ? { ...p, name: newName } : p))
    );
    this.saveToStorage();
  }

  exportSession(): void {
    const data = JSON.stringify(this.presetsSignal(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `heatmap_session_${date}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async importSession(file: File): Promise<FilterPreset[]> {
    try {
      const text = await file.text();
      const importedPresets = JSON.parse(text) as FilterPreset[];
      if (!Array.isArray(importedPresets)) {
        throw new Error('Invalid format');
      }
      
      this.presetsSignal.update(existing => {
        const existingIds = new Set(existing.map(p => p.id));
        const newPresets = importedPresets.filter(p => !existingIds.has(p.id));
        return [...newPresets, ...existing].slice(0, MAX_PRESETS);
      });
      this.saveToStorage();
      return importedPresets;
    } catch (e) {
      console.error('Session import failed', e);
      throw e;
    }
  }
}
