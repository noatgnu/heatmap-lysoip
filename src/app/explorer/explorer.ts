import { Component, OnInit, inject, signal, computed, effect, input, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { CurtainFilterComponent } from '../curtain-filter/curtain-filter';
import { HeatmapComponent } from '../heatmap/heatmap';
import { SkeletonLoaderComponent } from '../components/skeleton-loader/skeleton-loader';
import { FilterChipsComponent, FilterChip } from '../components/filter-chips/filter-chips';
import { CollapsibleSectionComponent } from '../components/collapsible-section/collapsible-section';
import { GeneData, ProjectMetadata } from '../models';
import { DataService } from '../services/data.service';
import { ExportService } from '../services/export.service';
import { PreferencesService } from '../services/preferences';

@Component({
  selector: 'app-explorer',
  standalone: true,
  imports: [FormsModule, DragDropModule, ScrollingModule, CurtainFilterComponent, HeatmapComponent, SkeletonLoaderComponent, FilterChipsComponent, CollapsibleSectionComponent, RouterLink],
  templateUrl: './explorer.html',
  styleUrl: './explorer.scss'
})
export class ExplorerComponent implements OnInit {
  private dataService = inject(DataService);
  private exportService = inject(ExportService);
  private preferencesService = inject(PreferencesService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  heatmapComponent = viewChild(HeatmapComponent);

  dataset = input.required<'lysoip' | 'wcl'>();
  currentDataset = signal<'lysoip' | 'wcl'>('lysoip');

  isLoading = signal(true);
  searchTerm = signal('');
  highlightedIndex = signal(-1);
  hoveredGeneId = signal<string | null>(null);
  projects = signal<ProjectMetadata[]>([]);
  allGenes = signal<GeneData[]>([]);
  selectedGeneIds = signal<Set<string>>(new Set());
  
  selectedOrgans = signal<Set<string>>(new Set());
  selectedProteins = signal<Set<string>>(new Set());
  selectedMutations = signal<Set<string>>(new Set());
  selectedKnockouts = signal<Set<string>>(new Set());
  selectedTreatments = signal<Set<string>>(new Set());
  selectedFractions = signal<Set<string>>(new Set());
  flippedProjectIds = signal<Set<string>>(new Set());
  
  sortStack = signal<('organ' | 'protein' | 'mutation' | 'knockout' | 'treatment' | 'fraction')[]>(['organ', 'protein', 'mutation', 'knockout', 'treatment', 'fraction']);

  private defaultGenes = [
    'TMEM175', 'OGA', 'NOD2', 'USP30', 'STING1', 'ATP13A2', 'MCOLN1', 'TLR2', 'GPNMB', 'GCG',
    'MAPT', 'PARP1', 'BECN1', 'CACNA1D', 'TREM2', 'NFE2L2', 'GBAP1', 'TGM2', 'VPS35', 'CTSB',
    'CDK5', 'GRN', 'FYN', 'NR4A2', 'PSAP', 'SYNJ1', 'FBXO7', 'VPS13C', 'GALC', 'SCARB2',
    'HMOX1', 'TFEB', 'ZNF746', 'PARK7', 'DNAJC6', 'KLK6', 'USP15', 'CD38', 'RAB32', 'SMPD1',
    'RILPL1', 'HLA-DRB5', 'SOD1', 'AIMP2', 'CSNK2B', 'RIT2', 'DYRK1A', 'TRAP1', 'SPTLC2', 'NPC1',
    'GPR37', 'TMEM230', 'KANSL1', 'DNAJC13', 'EIF2AK1', 'PAM', 'MPTP', 'CD84', 'NLRP12'
  ];

  constructor() {
    effect(() => {
      const ds = this.dataset();
      this.currentDataset.set(ds);
      this.selectedOrgans.set(new Set());
      this.selectedProteins.set(new Set());
      this.selectedMutations.set(new Set());
      this.selectedKnockouts.set(new Set());
      this.selectedTreatments.set(new Set());
      this.selectedFractions.set(new Set());
      this.flippedProjectIds.set(new Set());
      this.loadData(ds);
    });

    effect(() => {
      const queryParams = {
        genes: Array.from(this.selectedGeneIds()).join(',') || null,
        organs: Array.from(this.selectedOrgans()).join(',') || null,
        proteins: Array.from(this.selectedProteins()).join(',') || null,
        mutations: Array.from(this.selectedMutations()).join(',') || null,
        knockouts: Array.from(this.selectedKnockouts()).join(',') || null,
        treatments: Array.from(this.selectedTreatments()).join(',') || null,
        fractions: Array.from(this.selectedFractions()).join(',') || null,
        flipped: Array.from(this.flippedProjectIds()).join(',') || null,
        sort: this.sortStack().join(',')
      };
      this.router.navigate([this.currentDataset()], {
        queryParams,
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    });
  }

  setPreset(preset: 'organ' | 'mutation' | 'protein' | 'treatment' | 'fraction' | 'knockout') {
    if (preset === 'organ') this.sortStack.set(['organ', 'protein', 'mutation', 'knockout', 'treatment', 'fraction']);
    else if (preset === 'mutation') this.sortStack.set(['mutation', 'treatment', 'fraction', 'organ', 'protein', 'knockout']);
    else if (preset === 'protein') this.sortStack.set(['protein', 'mutation', 'knockout', 'treatment', 'fraction', 'organ']);
    else if (preset === 'treatment') this.sortStack.set(['treatment', 'mutation', 'fraction', 'organ', 'protein', 'knockout']);
    else if (preset === 'fraction') this.sortStack.set(['fraction', 'organ', 'protein', 'mutation', 'treatment', 'knockout']);
    else if (preset === 'knockout') this.sortStack.set(['knockout', 'mutation', 'treatment', 'fraction', 'organ', 'protein']);
  }

  loadData(type: 'lysoip' | 'wcl') {
    this.isLoading.set(true);

    this.dataService.loadDataset(type).subscribe(({ projects, genes }) => {
      this.projects.set(projects);
      this.allGenes.set(genes);

      const params = this.route.snapshot.queryParams;

      if (!params['flipped']) {
        const idsToFlip = new Set<string>();
        projects.forEach(p => {
          if (this.isDefaultFlip(p)) {
            idsToFlip.add(p.projectId);
          }
        });
        if (idsToFlip.size > 0) {
          this.flippedProjectIds.set(idsToFlip);
        }
      }

      if (!params['genes'] && this.selectedGeneIds().size === 0) {
        this.applyDefaultGenes();
      }

      this.isLoading.set(false);
    });
  }

  private applyDefaultGenes() {
    const ids = new Set<string>();
    const lowerDefault = this.defaultGenes.map(g => g.toLowerCase());
    this.allGenes().forEach((gene: GeneData) => {
      if (lowerDefault.includes(gene.gene.toLowerCase())) {
        ids.add(gene.uniprotId);
      }
    });
    this.selectedGeneIds.set(ids);
  }

  applyCurtainFilter(data: string) {
    const geneTerms = data.split(/[\n,]/).map((s: string) => s.trim().toLowerCase()).filter((s: string) => s);
    const matchedIds = new Set<string>();
    
    this.allGenes().forEach((gene: GeneData) => {
      if (geneTerms.includes(gene.gene.toLowerCase()) || geneTerms.includes(gene.uniprotId.toLowerCase())) {
        matchedIds.add(gene.uniprotId);
      }
    });

    if (matchedIds.size > 0) {
      this.selectedGeneIds.update((set: Set<string>) => {
        const newSet = new Set(set);
        matchedIds.forEach((id: string) => newSet.add(id));
        return newSet;
      });
    }
  }

  organs = computed(() => Array.from(new Set(this.projects().map((p: ProjectMetadata) => p.organ))).sort());
  proteins = computed(() => Array.from(new Set(this.projects().map((p: ProjectMetadata) => p.protein))).sort());
  mutations = computed(() => Array.from(new Set(this.projects().map((p: ProjectMetadata) => p.mutation))).sort());
  knockouts = computed(() => Array.from(new Set(this.projects().map((p: ProjectMetadata) => p.knockout))).sort());
  treatments = computed(() => Array.from(new Set(this.projects().map((p: ProjectMetadata) => p.treatment))).sort());
  fractions = computed(() => Array.from(new Set(this.projects().map((p: ProjectMetadata) => p.fraction))).sort());

  activeFilterChips = computed((): FilterChip[] => {
    const chips: FilterChip[] = [];
    this.selectedOrgans().forEach(v => chips.push({ type: 'organ', value: v }));
    this.selectedProteins().forEach(v => chips.push({ type: 'protein', value: v }));
    this.selectedMutations().forEach(v => chips.push({ type: 'mutation', value: v }));
    this.selectedKnockouts().forEach(v => chips.push({ type: 'knockout' as any, value: v }));
    this.selectedTreatments().forEach(v => chips.push({ type: 'treatment', value: v }));
    this.selectedFractions().forEach(v => chips.push({ type: 'fraction' as any, value: v }));
    return chips;
  });

  searchResults = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    if (term.length < 2) return [];
    return this.allGenes()
      .filter((g: GeneData) => g.searchString.includes(term))
      .slice(0, 10);
  });

  displayedGenes = computed(() => {
    const selected = this.selectedGeneIds();
    const flipped = this.flippedProjectIds();
    const allProjs = this.projects();

    return this.allGenes()
      .filter((g: GeneData) => selected.has(g.uniprotId))
      .map(g => {
        const log2fcs = g.log2fcs.map((val, idx) => {
          if (val === null) return null;
          const projId = allProjs[idx].projectId;
          return flipped.has(projId) ? val * -1 : val;
        });
        return { ...g, log2fcs };
      });
  });

  filteredProjects = computed(() => {
    const projs = this.projects();
    const sOrgans = this.selectedOrgans();
    const sProteins = this.selectedProteins();
    const sMutations = this.selectedMutations();
    const sKnockouts = this.selectedKnockouts();
    const sTreatments = this.selectedTreatments();
    const sFractions = this.selectedFractions();
    const stack = this.sortStack();

    let filtered = projs.filter((p: ProjectMetadata) => {
      const organMatch = sOrgans.size === 0 || sOrgans.has(p.organ);
      const proteinMatch = sProteins.size === 0 || sProteins.has(p.protein);
      const mutationMatch = sMutations.size === 0 || sMutations.has(p.mutation);
      const knockoutMatch = sKnockouts.size === 0 || sKnockouts.has(p.knockout);
      const treatmentMatch = sTreatments.size === 0 || sTreatments.has(p.treatment);
      const fractionMatch = sFractions.size === 0 || sFractions.has(p.fraction);
      return organMatch && proteinMatch && mutationMatch && knockoutMatch && treatmentMatch && fractionMatch;
    });

    return [...filtered].sort((a: ProjectMetadata, b: ProjectMetadata) => {
      const organPriority: Record<string, number> = { 'mefs': 1, 'lung': 2, 'brain': 3, 'a549': 4 };
      const mutationPriority: Record<string, number> = {
        'r1441c': 1,
        'g2019s': 2,
        'd620n': 3,
        'd409v': 4,
        'e326k': 5,
        'l444p': 6,
        'n370s': 7,
        'none': 8,
        'wt': 9
      };
      const knockoutPriority: Record<string, number> = {
        'none': 1,
        'ko': 2
      };
      const treatmentPriority: Record<string, number> = {
        'none': 1,
        'mli2': 2
      };
      const fractionPriority: Record<string, number> = {
        'lyso': 1,
        'mito': 2,
        'wcl': 3
      };
      
      for (const criterion of stack) {
        let cmp = 0;
        if (criterion === 'organ') {
          const pA = organPriority[a.organ.toLowerCase()] || 99;
          const pB = organPriority[b.organ.toLowerCase()] || 99;
          cmp = pA - pB;
          if (cmp === 0) cmp = a.organ.localeCompare(b.organ);
        }
        else if (criterion === 'protein') cmp = a.protein.localeCompare(b.protein);
        else if (criterion === 'mutation') {
          const pA = mutationPriority[a.mutation.toLowerCase()] || 99;
          const pB = mutationPriority[b.mutation.toLowerCase()] || 99;
          cmp = pA - pB;
          if (cmp === 0) cmp = a.mutation.localeCompare(b.mutation);
        }
        else if (criterion === 'knockout') {
          const pA = knockoutPriority[a.knockout.toLowerCase()] || 99;
          const pB = knockoutPriority[b.knockout.toLowerCase()] || 99;
          cmp = pA - pB;
          if (cmp === 0) cmp = a.knockout.localeCompare(b.knockout);
        }
        else if (criterion === 'treatment') {
          const pA = treatmentPriority[a.treatment.toLowerCase()] || 99;
          const pB = treatmentPriority[b.treatment.toLowerCase()] || 99;
          cmp = pA - pB;
          if (cmp === 0) cmp = a.treatment.localeCompare(b.treatment);
        }
        else if (criterion === 'fraction') {
          const pA = fractionPriority[a.fraction.toLowerCase()] || 99;
          const pB = fractionPriority[b.fraction.toLowerCase()] || 99;
          cmp = pA - pB;
          if (cmp === 0) cmp = a.fraction.localeCompare(b.fraction);
        }
        
        if (cmp !== 0) return cmp;
      }
      return 0;
    });
  });

  toggleFilter(type: 'organ' | 'protein' | 'mutation' | 'knockout' | 'treatment' | 'fraction', value: string) {
    const map = {
      organ: this.selectedOrgans,
      protein: this.selectedProteins,
      mutation: this.selectedMutations,
      knockout: this.selectedKnockouts,
      treatment: this.selectedTreatments,
      fraction: this.selectedFractions
    };
    const target = map[type];
    target.update((set: Set<string>) => {
      const newSet = new Set(set);
      if (newSet.has(value)) newSet.delete(value);
      else newSet.add(value);
      return newSet;
    });
  }

  toggleFlip(projectId: string) {
    this.flippedProjectIds.update(set => {
      const newSet = new Set(set);
      if (newSet.has(projectId)) newSet.delete(projectId);
      else newSet.add(projectId);
      return newSet;
    });
  }

  isDefaultFlip(p: ProjectMetadata): boolean {
    const name = p.projectName.toLowerCase();
    const isMli2 = name.includes('dmso') && name.includes('mli2');
    const isKo = name.includes('ko') && name.includes('wt');
    return isMli2 || isKo;
  }

  drop(event: CdkDragDrop<string[]>) {
    this.sortStack.update((stack: ('organ' | 'protein' | 'mutation' | 'knockout' | 'treatment' | 'fraction')[]) => {
      const newStack = [...stack];
      moveItemInArray(newStack, event.previousIndex, event.currentIndex);
      return newStack;
    });
  }

  copyUrl() {
    navigator.clipboard.writeText(window.location.href);
  }

  async exportAsPng() {
    const heatmap = this.heatmapComponent();
    if (heatmap) {
      const element = heatmap.getPlotElement();
      if (element) {
        const filename = `heatmap_${this.currentDataset()}_${new Date().toISOString().slice(0, 10)}`;
        await this.exportService.exportHeatmapAsPng(element, filename);
      }
    }
  }

  exportAsCsv() {
    const filename = `heatmap_${this.currentDataset()}_${new Date().toISOString().slice(0, 10)}.csv`;
    this.exportService.exportAsCsv(this.displayedGenes(), this.filteredProjects(), filename);
  }

  async copyGeneList() {
    await this.exportService.copyGeneListToClipboard(this.displayedGenes(), 'genes');
  }

  clearAllProteins() {
    this.selectedGeneIds.set(new Set());
  }

  resetToDefault() {
    this.selectedOrgans.set(new Set());
    this.selectedProteins.set(new Set());
    this.selectedMutations.set(new Set());
    this.selectedKnockouts.set(new Set());
    this.selectedTreatments.set(new Set());
    this.selectedFractions.set(new Set());
    
    const idsToFlip = new Set<string>();
    this.projects().forEach(p => {
      if (this.isDefaultFlip(p)) {
        idsToFlip.add(p.projectId);
      }
    });
    this.flippedProjectIds.set(idsToFlip);

    this.sortStack.set(['organ', 'protein', 'mutation', 'knockout', 'treatment', 'fraction']);
    this.searchTerm.set('');
    this.applyDefaultGenes();
  }

  ngOnInit() {
    this.initializeFromUrl();
  }

  private initializeFromUrl() {
    const params = this.route.snapshot.queryParams;
    if (params['genes']) {
      this.selectedGeneIds.set(new Set(params['genes'].split(',')));
    } else {
      this.applyDefaultGenes();
    }
    
    if (params['organs']) {
      this.selectedOrgans.set(new Set(params['organs'].split(',')));
    }

    if (params['proteins']) {
      this.selectedProteins.set(new Set(params['proteins'].split(',')));
    }
    
    if (params['mutations']) {
      this.selectedMutations.set(new Set(params['mutations'].split(',')));
    }

    if (params['knockouts']) {
      this.selectedKnockouts.set(new Set(params['knockouts'].split(',')));
    }

    if (params['treatments']) {
      this.selectedTreatments.set(new Set(params['treatments'].split(',')));
    }

    if (params['fractions']) {
      this.selectedFractions.set(new Set(params['fractions'].split(',')));
    }

    if (params['flipped']) {
      this.flippedProjectIds.set(new Set(params['flipped'].split(',')));
    }
    
    if (params['sort']) {
      this.sortStack.set(params['sort'].split(',') as any);
    }
  }

  addGene(gene: GeneData) {
    this.selectedGeneIds.update((set: Set<string>) => {
      const newSet = new Set(set);
      newSet.add(gene.uniprotId);
      return newSet;
    });
    this.searchTerm.set('');
    this.highlightedIndex.set(-1);
  }

  removeGene(uniprotId: string) {
    this.selectedGeneIds.update((set: Set<string>) => {
      const newSet = new Set(set);
      newSet.delete(uniprotId);
      return newSet;
    });
  }

  trackByUniprotId(_index: number, gene: GeneData): string {
    return gene.uniprotId;
  }

  onGeneHovered(uniprotId: string | null) {
    this.hoveredGeneId.set(uniprotId);
  }

  removeFilterChip(chip: FilterChip) {
    this.toggleFilter(chip.type as any, chip.value);
  }

  clearAllFilters() {
    this.selectedOrgans.set(new Set());
    this.selectedProteins.set(new Set());
    this.selectedMutations.set(new Set());
    this.selectedKnockouts.set(new Set());
    this.selectedTreatments.set(new Set());
    this.selectedFractions.set(new Set());
  }

  onSearchKeydown(event: KeyboardEvent) {
    const results = this.searchResults();
    const currentIndex = this.highlightedIndex();

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (results.length > 0) {
          this.highlightedIndex.set(
            currentIndex < results.length - 1 ? currentIndex + 1 : 0
          );
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (results.length > 0) {
          this.highlightedIndex.set(
            currentIndex > 0 ? currentIndex - 1 : results.length - 1
          );
        }
        break;
      case 'Enter':
        event.preventDefault();
        if (currentIndex >= 0 && currentIndex < results.length) {
          this.addGene(results[currentIndex]);
        }
        break;
      case 'Escape':
        event.preventDefault();
        this.searchTerm.set('');
        this.highlightedIndex.set(-1);
        break;
    }
  }

}
