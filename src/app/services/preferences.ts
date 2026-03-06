import { Injectable, signal } from '@angular/core';

export type SortCriterion = 'organ' | 'protein' | 'mutation' | 'knockout' | 'treatment';

export interface FilterPreset {
  id: string;
  name: string;
  dataset: 'lysoip' | 'wcl';
  geneIds: string[];
  organs: string[];
  proteins: string[];
  mutations: string[];
  knockouts: string[];
  treatments: string[];
  fractions: string[];
  sortStack: SortCriterion[];
  flippedProjectIds: string[];
  createdAt: number;
}

const STORAGE_KEY = 'heatmap_presets';
const MAX_PRESETS = 10;

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
      // Storage full or unavailable
    }
  }

  savePreset(
    name: string,
    dataset: 'lysoip' | 'wcl',
    geneIds: Set<string>,
    organs: Set<string>,
    proteins: Set<string>,
    mutations: Set<string>,
    knockouts: Set<string>,
    treatments: Set<string>,
    fractions: Set<string>,
    sortStack: SortCriterion[],
    flippedProjectIds: Set<string>
  ): FilterPreset {
    const preset: FilterPreset = {
      id: crypto.randomUUID(),
      name,
      dataset,
      geneIds: Array.from(geneIds),
      organs: Array.from(organs),
      proteins: Array.from(proteins),
      mutations: Array.from(mutations),
      knockouts: Array.from(knockouts),
      treatments: Array.from(treatments),
      fractions: Array.from(fractions),
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

  getPresetsForDataset(dataset: 'lysoip' | 'wcl'): FilterPreset[] {
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
}
