import { Injectable, signal } from '@angular/core';
export interface SelectionHistoryEntry {
  id: string;
  dataset: string;
  geneIds: string[];
  timestamp: number;
}
const STORAGE_KEY = 'heatmap_selection_history';
const MAX_HISTORY = 20;
@Injectable({
  providedIn: 'root'
})
export class HistoryService {
  private historySignal = signal<SelectionHistoryEntry[]>([]);
  readonly history = this.historySignal.asReadonly();
  constructor() {
    this.loadFromStorage();
  }
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.historySignal.set(JSON.parse(stored));
      }
    } catch {
      this.historySignal.set([]);
    }
  }
  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.historySignal()));
    } catch {}
  }
  addToHistory(dataset: string, geneIds: string[]): void {
    if (geneIds.length === 0) return;
    const current = this.historySignal();
    if (current.length > 0) {
      const last = current[0];
      const sameIds = last.geneIds.length === geneIds.length && 
                      last.geneIds.every(id => geneIds.includes(id));
      if (sameIds && last.dataset === dataset) return;
    }
    const entry: SelectionHistoryEntry = {
      id: Math.random().toString(36).substring(2, 9),
      dataset,
      geneIds: [...geneIds],
      timestamp: Date.now()
    };
    this.historySignal.update(h => [entry, ...h].slice(0, MAX_HISTORY));
    this.saveToStorage();
  }
  getHistoryForDataset(dataset: string): SelectionHistoryEntry[] {
    return this.historySignal().filter(h => h.dataset === dataset);
  }
  clearHistory(): void {
    this.historySignal.set([]);
    this.saveToStorage();
  }
}
