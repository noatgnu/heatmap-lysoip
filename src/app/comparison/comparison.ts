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

  lysoipOnlySearchTerm = signal('');
  selectedLysoipOnlyIds = signal<Set<string>>(new Set());

  wclOnlySearchTerm = signal('');
  selectedWclOnlyIds = signal<Set<string>>(new Set());
  log2fcCutoff = signal<number | null>(null);
  confidenceCutoff = signal<number | null>(null);

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

  lysoipOnlyGenes = computed(() => {
    const lysoip = this.lysoipData();
    const wcl = this.wclData();
    if (!lysoip || !wcl) return [];

    const wclIds = new Set(wcl.genes.map(g => g.uniprotId));
    return lysoip.genes.filter(g => !wclIds.has(g.uniprotId));
  });

  wclOnlyGenes = computed(() => {
    const lysoip = this.lysoipData();
    const wcl = this.wclData();
    if (!lysoip || !wcl) return [];

    const lysoipIds = new Set(lysoip.genes.map(g => g.uniprotId));
    return wcl.genes.filter(g => !lysoipIds.has(g.uniprotId));
  });

  displayedLysoipGenes = computed(() => {
    const data = this.lysoipData();
    if (!data) return [];
    const selected = this.selectedGeneIds();
    return data.genes
      .filter(g => selected.has(g.uniprotId))
      .filter(g => this.passesCutoffs(g));
  });

  displayedWclGenes = computed(() => {
    const data = this.wclData();
    if (!data) return [];
    const selected = this.selectedGeneIds();
    return data.genes
      .filter(g => selected.has(g.uniprotId))
      .filter(g => this.passesCutoffs(g));
  });

  displayedLysoipOnlyGenes = computed(() => {
    const selected = this.selectedLysoipOnlyIds();
    return this.lysoipOnlyGenes()
      .filter(g => selected.has(g.uniprotId))
      .filter(g => this.passesCutoffs(g));
  });

  displayedWclOnlyGenes = computed(() => {
    const selected = this.selectedWclOnlyIds();
    return this.wclOnlyGenes()
      .filter(g => selected.has(g.uniprotId))
      .filter(g => this.passesCutoffs(g));
  });

  private passesCutoffs(gene: GeneData): boolean {
    const log2fcCut = this.log2fcCutoff();
    const confCut = this.confidenceCutoff();
    const hasLog2fcCutoff = log2fcCut !== null && log2fcCut > 0;
    const hasConfCutoff = confCut !== null && confCut > 0;

    if (!hasLog2fcCutoff && !hasConfCutoff) return true;

    return gene.log2fcs.some((val, idx) => {
      if (val === null) return false;
      const passesLog2fc = !hasLog2fcCutoff || Math.abs(val) >= log2fcCut!;
      const conf = gene.confidences[idx];
      const passesConf = !hasConfCutoff || (conf !== null && conf >= confCut!);
      return passesLog2fc && passesConf;
    });
  }

  lysoipProjects = computed(() => this.lysoipData()?.projects ?? []);
  wclProjects = computed(() => this.wclData()?.projects ?? []);

  lysoipLrrk2Projects = computed(() =>
    this.lysoipProjects().filter(p => !p.projectName.toUpperCase().includes('GBA'))
  );
  lysoipGbaProjects = computed(() =>
    this.lysoipProjects().filter(p => p.projectName.toUpperCase().includes('GBA'))
  );

  wclLrrk2Projects = computed(() =>
    this.wclProjects().filter(p => !p.projectName.toUpperCase().includes('GBA'))
  );
  wclGbaProjects = computed(() =>
    this.wclProjects().filter(p => p.projectName.toUpperCase().includes('GBA'))
  );

  searchResults = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    if (term.length < 2) return [];
    return this.commonGenes()
      .filter(g => g.searchString.includes(term))
      .slice(0, 10);
  });

  lysoipOnlySearchResults = computed(() => {
    const term = this.lysoipOnlySearchTerm().toLowerCase().trim();
    if (term.length < 2) return [];
    return this.lysoipOnlyGenes()
      .filter(g => g.searchString.includes(term))
      .slice(0, 10);
  });

  wclOnlySearchResults = computed(() => {
    const term = this.wclOnlySearchTerm().toLowerCase().trim();
    if (term.length < 2) return [];
    return this.wclOnlyGenes()
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

  addLysoipOnlyGene(gene: GeneData) {
    this.selectedLysoipOnlyIds.update(set => {
      const newSet = new Set(set);
      newSet.add(gene.uniprotId);
      return newSet;
    });
    this.lysoipOnlySearchTerm.set('');
  }

  removeLysoipOnlyGene(uniprotId: string) {
    this.selectedLysoipOnlyIds.update(set => {
      const newSet = new Set(set);
      newSet.delete(uniprotId);
      return newSet;
    });
  }

  clearLysoipOnlyGenes() {
    this.selectedLysoipOnlyIds.set(new Set());
  }

  addWclOnlyGene(gene: GeneData) {
    this.selectedWclOnlyIds.update(set => {
      const newSet = new Set(set);
      newSet.add(gene.uniprotId);
      return newSet;
    });
    this.wclOnlySearchTerm.set('');
  }

  removeWclOnlyGene(uniprotId: string) {
    this.selectedWclOnlyIds.update(set => {
      const newSet = new Set(set);
      newSet.delete(uniprotId);
      return newSet;
    });
  }

  clearWclOnlyGenes() {
    this.selectedWclOnlyIds.set(new Set());
  }

  setLog2fcCutoff(value: string) {
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) {
      this.log2fcCutoff.set(null);
    } else {
      this.log2fcCutoff.set(num);
    }
  }

  clearLog2fcCutoff() {
    this.log2fcCutoff.set(null);
  }

  setConfidenceCutoff(value: string) {
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) {
      this.confidenceCutoff.set(null);
    } else {
      this.confidenceCutoff.set(num);
    }
  }

  clearConfidenceCutoff() {
    this.confidenceCutoff.set(null);
  }
}
