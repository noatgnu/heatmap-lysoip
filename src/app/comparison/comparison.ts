import { Component, inject, signal, computed, effect } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { HeatmapComponent } from '../heatmap/heatmap';
import { SkeletonLoaderComponent } from '../components/skeleton-loader/skeleton-loader';
import { DataService, ParsedData } from '../services/data.service';
import { GeneData, ProjectMetadata } from '../models';

/**
 * Side-by-side comparison view for LysoIP and WCL datasets.
 */
@Component({
  selector: 'app-comparison',
  standalone: true,
  imports: [RouterLink, HeatmapComponent, SkeletonLoaderComponent],
  templateUrl: './comparison.html'
})
export class ComparisonComponent {
  private dataService = inject(DataService);

  isLoading = signal(true);

  lysoipData = signal<ParsedData | null>(null);
  wclData = signal<ParsedData | null>(null);

  searchTerm = signal('');
  selectedGeneIds = signal<Set<string>>(new Set());

  private defaultGenes = [
    'TMEM175', 'OGA', 'NOD2', 'USP30', 'STING1', 'ATP13A2', 'MCOLN1', 'TLR2', 'GPNMB',
    'MAPT', 'PARP1', 'BECN1', 'TREM2', 'VPS35', 'CTSB', 'LRRK2', 'GBA'
  ];

  constructor() {
    this.loadBothDatasets();
  }

  private loadBothDatasets() {
    this.isLoading.set(true);

    forkJoin({
      lysoip: this.dataService.loadDataset('lysoip'),
      wcl: this.dataService.loadDataset('wcl')
    }).subscribe(({ lysoip, wcl }) => {
      this.lysoipData.set(lysoip);
      this.wclData.set(wcl);
      this.applyDefaultGenes(lysoip.genes);
      this.isLoading.set(false);
    });
  }

  private applyDefaultGenes(genes: GeneData[]) {
    const ids = new Set<string>();
    const lowerDefault = this.defaultGenes.map(g => g.toLowerCase());
    genes.forEach((gene: GeneData) => {
      if (lowerDefault.includes(gene.gene.toLowerCase())) {
        ids.add(gene.uniprotId);
      }
    });
    this.selectedGeneIds.set(ids);
  }

  commonGenes = computed(() => {
    const lysoip = this.lysoipData();
    const wcl = this.wclData();
    if (!lysoip || !wcl) return [];

    const lysoipIds = new Set(lysoip.genes.map(g => g.uniprotId));
    return wcl.genes.filter(g => lysoipIds.has(g.uniprotId));
  });

  displayedLysoipGenes = computed(() => {
    const data = this.lysoipData();
    if (!data) return [];
    const selected = this.selectedGeneIds();
    return data.genes.filter(g => selected.has(g.uniprotId));
  });

  displayedWclGenes = computed(() => {
    const data = this.wclData();
    if (!data) return [];
    const selected = this.selectedGeneIds();
    return data.genes.filter(g => selected.has(g.uniprotId));
  });

  lysoipProjects = computed(() => this.lysoipData()?.projects ?? []);
  wclProjects = computed(() => this.wclData()?.projects ?? []);

  searchResults = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    if (term.length < 2) return [];
    return this.commonGenes()
      .filter(g => g.searchString.includes(term))
      .slice(0, 10);
  });

  addGene(gene: GeneData) {
    this.selectedGeneIds.update(set => {
      const newSet = new Set(set);
      newSet.add(gene.uniprotId);
      return newSet;
    });
    this.searchTerm.set('');
  }

  removeGene(uniprotId: string) {
    this.selectedGeneIds.update(set => {
      const newSet = new Set(set);
      newSet.delete(uniprotId);
      return newSet;
    });
  }

  clearAllGenes() {
    this.selectedGeneIds.set(new Set());
  }
}
