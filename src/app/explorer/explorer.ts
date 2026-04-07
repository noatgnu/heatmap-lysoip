import { Component, OnInit, inject, signal, computed, effect, input, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { TitleCasePipe } from '@angular/common';
import { CurtainFilterComponent } from '../curtain-filter/curtain-filter';
import { HeatmapComponent } from '../heatmap/heatmap';
import { RankPlotComponent } from '../components/rank-plot/rank-plot';
import { SkeletonLoaderComponent } from '../components/skeleton-loader/skeleton-loader';
import { FilterChipsComponent, FilterChip } from '../components/filter-chips/filter-chips';
import { CollapsibleSectionComponent } from '../components/collapsible-section/collapsible-section';
import { FindGenePipe } from '../pipes/find-gene.pipe';
import { GeneData, ProjectMetadata, RankItem } from '../models';
import { DataService, AppConfig } from '../services/data.service';
import { ExportService } from '../services/export.service';
import { PreferencesService, FilterPreset, SortCriterion } from '../services/preferences';

@Component({
  selector: 'app-explorer',
  standalone: true,
  imports: [FormsModule, DragDropModule, ScrollingModule, CurtainFilterComponent, HeatmapComponent, RankPlotComponent, SkeletonLoaderComponent, FilterChipsComponent, CollapsibleSectionComponent, RouterLink, FindGenePipe, TitleCasePipe],
  templateUrl: './explorer.html',
  styleUrl: './explorer.scss'
})
export class ExplorerComponent implements OnInit {
  private dataService = inject(DataService);
  private exportService = inject(ExportService);
  private preferencesService = inject(PreferencesService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  protected readonly Math = Math;

  heatmapComponent = viewChild(HeatmapComponent);

  dataset = input.required<string>();
  currentDataset = signal<string>('');
  config = signal<AppConfig | null>(null);

  isLoading = signal(true);
  searchTerm = signal('');
  geneFilterTerm = signal('');
  highlightedIndex = signal(-1);
  hoveredGeneId = signal<string | null>(null);
  projects = signal<ProjectMetadata[]>([]);
  allGenes = signal<GeneData[]>([]);
  selectedGeneIds = signal<Set<string>>(new Set());
  pendingBulkSelection = signal<string[] | null>(null);
  isBulkReplacing = signal<boolean>(false);

  filterState = signal<Map<string, Set<string>>>(new Map());
  selectedProjectIds = signal<Set<string>>(new Set());
  flippedProjectIds = signal<Set<string>>(new Set());

  getFilterSet(key: string): Set<string> {
    return this.filterState().get(key) || new Set();
  }

  toggleFilter(type: string, value: string) {
    if (type === 'project') {
      this.selectedProjectIds.update(set => {
        const newSet = new Set(set);
        if (newSet.has(value)) newSet.delete(value);
        else newSet.add(value);
        return newSet;
      });
      return;
    }

    this.filterState.update(map => {
      const newMap = new Map(map);
      const set = new Set(newMap.get(type) || []);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      newMap.set(type, set);
      return newMap;
    });
  }

  summaryDisplayMode = signal<'number' | 'proportion'>('proportion');
  isHeatmapSwapped = signal<boolean>(false);
  log2fcCutoff = signal<number | null>(null);
  confidenceCutoff = signal<number | null>(null);
  rankCutoff = signal<number>(10);
  geneSortOrder = signal<'none' | 'increase' | 'decrease'>('none');
  showOnlySelectedInRankPlot = signal<boolean>(false);
  selectedHeatmapProteins = signal<Map<string, GeneData>>(new Map());
  uiRevision = signal<number>(0);

  firstSelectedGene = computed(() => {
    const values = this.selectedHeatmapProteins().values();
    return values.next().value;
  });

  onHeatmapGeneSelected(uniprotId: string) {
    const gene = this.allGenes().find(g => g.uniprotId === uniprotId);
    if (gene) {
      this.selectedHeatmapProteins.update(map => {
        const newMap = new Map(map);
        if (newMap.has(uniprotId)) {
          newMap.delete(uniprotId);
        } else {
          newMap.set(uniprotId, gene);
        }
        return newMap;
      });
    }
  }

  clearHeatmapSelection() {
    this.selectedHeatmapProteins.set(new Map());
  }

  isolateSelectedHeatmapProteins() {
    const selected = this.selectedHeatmapProteins();
    if (selected.size > 0) {
      this.selectedGeneIds.set(new Set(selected.keys()));
      this.selectedHeatmapProteins.set(new Map());
      this.geneFilterTerm.set('');
    }
  }

  openComparisonInNewTab() {
    const selected = this.selectedHeatmapProteins();
    if (selected.size === 0) return;

    const log2fcCut = this.log2fcCutoff();
    const confCut = this.confidenceCutoff();
    const queryParams: any = {
      genes: Array.from(selected.keys()).join(','),
      projects: Array.from(this.selectedProjectIds()).join(','),
      flipped: Array.from(this.flippedProjectIds()).join(','),
      swapped: this.isHeatmapSwapped() ? 'true' : '',
      cutoff: log2fcCut ? log2fcCut.toString() : '',
      conf: confCut ? confCut.toString() : ''
    };

    this.filterState().forEach((set, key) => {
      if (set.size > 0) queryParams[key] = Array.from(set).join(',');
    });

    const url = `${window.location.origin}${window.location.pathname}?${new URLSearchParams(queryParams).toString()}`;
    window.open(url, '_blank');
  }

  removeHeatmapSelection(uniprotId: string) {
    this.selectedHeatmapProteins.update(map => {
      const newMap = new Map(map);
      newMap.delete(uniprotId);
      return newMap;
    });
  }

  sortStack = signal<SortCriterion[]>(['organ', 'protein', 'mutation', 'knockout', 'treatment']);

  showPresetInput = signal(false);
  presetName = signal('');

  currentPresets = computed(() => this.preferencesService.getPresetsForDataset(this.currentDataset()));

  private defaultGenes = [
    'TMEM175', 'OGA', 'NOD2', 'USP30', 'STING1', 'ATP13A2', 'MCOLN1', 'TLR2', 'GPNMB', 'GCG',
    'MAPT', 'PARP1', 'BECN1', 'CACNA1D', 'TREM2', 'NFE2L2', 'GBAP1', 'TGM2', 'VPS35', 'CTSB',
    'CDK5', 'GRN', 'FYN', 'NR4A2', 'PSAP', 'SYNJ1', 'FBXO7', 'VPS13C', 'GALC', 'SCARB2',
    'HMOX1', 'TFEB', 'ZNF746', 'PARK7', 'DNAJC6', 'KLK6', 'USP15', 'CD38', 'RAB32', 'SMPD1',
    'RILPL1', 'HLA-DRB5', 'SOD1', 'AIMP2', 'CSNK2B', 'RIT2', 'DYRK1A', 'TRAP1', 'SPTLC2', 'NPC1',
    'GPR37', 'TMEM230', 'KANSL1', 'DNAJC13', 'EIF2AK1', 'PAM', 'MPTP', 'CD84', 'NLRP12', 'LUZP1'
  ];

  effectiveHighlightedIds = computed(() => {
    const selected = this.selectedGeneIds();
    const pending = this.pendingBulkSelection();
    if (!pending) return selected;
    
    if (this.isBulkReplacing()) {
      return new Set(pending);
    }

    const combined = new Set(selected);
    pending.forEach(id => combined.add(id));
    return combined;
  });

  constructor() {
    effect(() => {
      const ds = this.dataset();
      this.currentDataset.set(ds);
      this.filterState.set(new Map());
      this.selectedProjectIds.set(new Set());
      this.flippedProjectIds.set(new Set());
      this.log2fcCutoff.set(null);
      this.confidenceCutoff.set(null);
      this.loadData(ds);
    });

    effect(() => {
      const log2fcCut = this.log2fcCutoff();
      const confCut = this.confidenceCutoff();
      const queryParams: any = {
        genes: Array.from(this.selectedGeneIds()).join(',') || null,
        projects: Array.from(this.selectedProjectIds()).join(',') || null,
        flipped: Array.from(this.flippedProjectIds()).join(',') || null,
        mode: this.summaryDisplayMode() === 'proportion' ? null : 'number',
        swapped: this.isHeatmapSwapped() ? 'true' : null,
        sort: this.sortStack().join(','),
        cutoff: log2fcCut !== null && log2fcCut > 0 ? log2fcCut.toString() : null,
        conf: confCut !== null && confCut > 0 ? confCut.toString() : null
      };

      this.filterState().forEach((set, key) => {
        if (set.size > 0) queryParams[key] = Array.from(set).join(',');
      });

      this.router.navigate([this.currentDataset()], {
        queryParams,
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    });
  }

  setPreset(preset: string) {
    if (preset === 'organ') this.sortStack.set(['organ', 'protein', 'mutation', 'knockout', 'treatment']);
    else if (preset === 'mutation') this.sortStack.set(['mutation', 'treatment', 'organ', 'protein', 'knockout']);
    else if (preset === 'protein') this.sortStack.set(['protein', 'mutation', 'knockout', 'treatment', 'organ']);
    else if (preset === 'treatment') this.sortStack.set(['treatment', 'mutation', 'organ', 'protein', 'knockout']);
    else if (preset === 'knockout') this.sortStack.set(['knockout', 'mutation', 'treatment', 'organ', 'protein']);
  }

  loadData(type: string) {
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
      const geneParts = gene.gene.toLowerCase().split(';').map(p => p.trim());
      if (geneParts.some(p => lowerDefault.includes(p))) {
        ids.add(gene.uniprotId);
      }
    });
    this.selectedGeneIds.set(ids);
  }

  applyCurtainFilter(data: string) {
    const geneTerms = data.split(/[\n,]/).map((s: string) => s.trim().toLowerCase()).filter((s: string) => s);
    const matchedIds = new Set<string>();

    this.allGenes().forEach((gene: GeneData) => {
      const gParts = gene.gene.toLowerCase().split(';').map(p => p.trim());
      const uParts = gene.uniprotId.toLowerCase().split(';').map(p => p.trim());

      const match = gParts.some(p => geneTerms.includes(p)) ||
                    uParts.some(p => geneTerms.includes(p));

      if (match) {
        matchedIds.add(gene.uniprotId);
      }
    });

    if (matchedIds.size === 1) {
      this.selectedGeneIds.update((set: Set<string>) => {
        const newSet = new Set(set);
        newSet.add(Array.from(matchedIds)[0]);
        return newSet;
      });
    } else if (matchedIds.size > 1) {
      this.pendingBulkSelection.set(Array.from(matchedIds));
    }
  }

  getUniqueValues(key: string): string[] {
    return Array.from(new Set(this.projects().map((p: any) => p[key]))).sort();
  }

  activeFilterChips = computed((): FilterChip[] => {
    const chips: FilterChip[] = [];
    this.filterState().forEach((set, key) => {
      set.forEach(v => chips.push({ type: key as any, value: v }));
    });
    this.selectedProjectIds().forEach(v => {
      const p = this.projects().find(p => p.projectId === v);
      if (p) chips.push({ type: 'project' as any, value: p.projectName });
    });
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
    const log2fcCut = this.log2fcCutoff();
    const confCut = this.confidenceCutoff();
    const sortOrder = this.geneSortOrder();
    const filterTerm = this.geneFilterTerm().toLowerCase().trim();
    const filteredProjIndices = new Set(this.filteredProjects().map(p => allProjs.indexOf(p)));

    const genes = this.allGenes()
      .filter((g: GeneData) => selected.has(g.uniprotId))
      .filter((g: GeneData) => {
        if (!filterTerm) return true;
        return g.gene.toLowerCase().includes(filterTerm) || g.uniprotId.toLowerCase().includes(filterTerm);
      })
      .map(g => {
        const log2fcs = g.log2fcs.map((val, idx) => {
          if (val === null) return null;
          const projId = allProjs[idx].projectId;
          return flipped.has(projId) ? val * -1 : val;
        });
        return { ...g, log2fcs };
      })
      .filter(g => {
        const hasLog2fcCutoff = log2fcCut !== null && log2fcCut > 0;
        const hasConfCutoff = confCut !== null && confCut > 0;
        if (!hasLog2fcCutoff && !hasConfCutoff) return true;

        return g.log2fcs.some((val, idx) => {
          if (!filteredProjIndices.has(idx)) return false;
          if (val === null) return false;

          const passesLog2fc = !hasLog2fcCutoff || Math.abs(val) >= log2fcCut!;
          const conf = g.confidences[idx];
          const passesConf = !hasConfCutoff || (conf !== null && conf >= confCut!);

          return passesLog2fc && passesConf;
        });
      });

    if (sortOrder === 'none') return genes;

    return [...genes].sort((a, b) => {
      const countA = this.countDirectionForGene(a, filteredProjIndices, log2fcCut, confCut, sortOrder);
      const countB = this.countDirectionForGene(b, filteredProjIndices, log2fcCut, confCut, sortOrder);
      return countB - countA;
    });
  });

  private countDirectionForGene(
    gene: GeneData,
    projIndices: Set<number>,
    log2fcCut: number | null,
    confCut: number | null,
    direction: 'increase' | 'decrease'
  ): number {
    let count = 0;
    gene.log2fcs.forEach((val, idx) => {
      if (!projIndices.has(idx) || val === null) return;

      const conf = gene.confidences[idx];
      const passesConf = confCut === null || confCut <= 0 || (conf !== null && conf >= confCut);
      const passesLog2fc = log2fcCut === null || log2fcCut <= 0 || Math.abs(val) >= log2fcCut;

      if (passesConf && passesLog2fc) {
        if (direction === 'increase' && val > 0) count++;
        else if (direction === 'decrease' && val < 0) count++;
      }
    });
    return count;
  }

  filteredProjects = computed(() => {
    const projs = this.projects();
    const fState = this.filterState();
    const sProjectIds = this.selectedProjectIds();
    const stack = this.sortStack();

    let filtered = projs.filter((p: any) => {
      const projectMatch = sProjectIds.size === 0 || sProjectIds.has(p.projectId);
      
      let categorizationMatch = true;
      fState.forEach((selectedValues, key) => {
        if (selectedValues.size > 0 && !selectedValues.has(p[key])) {
          categorizationMatch = false;
        }
      });

      return projectMatch && categorizationMatch;
    });

    return [...filtered].sort((a: any, b: any) => {
      for (const criterion of stack) {
        if (!a[criterion] || !b[criterion]) continue;
        const cmp = a[criterion].toString().localeCompare(b[criterion].toString());
        if (cmp !== 0) return cmp;
      }
      return (a.date || '').localeCompare(b.date || '');
    });
  });

  projectGroups = computed(() => {
    const projs = this.filteredProjects();
    const config = this.config();
    if (!config || projs.length === 0) return [];

    // Group by the first available category
    const groupKey = config.categorization[0].key;
    const groups = new Map<string, ProjectMetadata[]>();
    
    projs.forEach(p => {
      const val = (p as any)[groupKey] || 'Other';
      if (!groups.has(val)) groups.set(val, []);
      groups.get(val)!.push(p);
    });

    return Array.from(groups.entries()).map(([name, projects]) => ({
      name,
      projects,
      summary: this.calculateHeatmapSummary(projects),
      rankData: this.calculateRankData(projects)
    }));
  });

  private calculateRankData(projects: ProjectMetadata[]): RankItem[] {
    const allGenes = this.allGenes();
    const allProjs = this.projects();
    const flipped = this.flippedProjectIds();
    const selectedIds = this.selectedGeneIds();
    const showOnlySelected = this.showOnlySelectedInRankPlot();
    const projIndices = projects.map(p => allProjs.indexOf(p));

    if (projIndices.length === 0) return [];

    const minTotal = Math.ceil(projIndices.length * (this.rankCutoff() / 100));

    return allGenes
      .filter(g => !showOnlySelected || selectedIds.has(g.uniprotId))
      .map(g => {
        let increase = 0;
        let decrease = 0;
        let total = 0;

        projIndices.forEach(idx => {
          let val = g.log2fcs[idx];
          if (val !== null) {
            total++;
            const projId = allProjs[idx].projectId;
            if (flipped.has(projId)) val *= -1;

            if (val > 0) increase++;
            else if (val < 0) decrease++;
          }
        });

        const score = total > 0 ? (increase - decrease) / total : 0;

        return {
          uniprotId: g.uniprotId,
          gene: g.gene,
          score,
          increase,
          decrease,
          total
        };
      }).filter(item => item.total > minTotal);
  }

  selectGenesFromPlot(uniprotIds: string[]) {
    if (uniprotIds.length === 1) {
      this.selectedGeneIds.update(set => {
        const newSet = new Set(set);
        newSet.add(uniprotIds[0]);
        return newSet;
      });
    } else if (uniprotIds.length > 1) {
      this.pendingBulkSelection.set(uniprotIds);
    }
  }

  confirmBulkAdd() {
    const ids = this.pendingBulkSelection();
    if (ids) {
      this.selectedGeneIds.update(set => {
        const newSet = new Set(set);
        ids.forEach(id => newSet.add(id));
        return newSet;
      });
    }
    this.pendingBulkSelection.set(null);
  }

  confirmBulkReplace() {
    const ids = this.pendingBulkSelection();
    if (ids) {
      this.selectedGeneIds.set(new Set([...ids]));
      this.geneFilterTerm.set('');
    }
    this.pendingBulkSelection.set(null);
  }

  cancelBulkSelection() {
    this.pendingBulkSelection.set(null);
    this.isBulkReplacing.set(false);
  }

  private calculateHeatmapSummary(projects: ProjectMetadata[]): { increase: number; decrease: number; total: number } {
    const genes = this.displayedGenes();
    const allProjs = this.projects();
    const log2fcCut = this.log2fcCutoff();
    const confCut = this.confidenceCutoff();
    const projIndices = new Set(projects.map(p => allProjs.indexOf(p)));

    let increase = 0;
    let decrease = 0;
    let total = 0;

    genes.forEach(g => {
      g.log2fcs.forEach((val, idx) => {
        if (!projIndices.has(idx) || val === null) return;

        const conf = g.confidences[idx];
        const passesConf = confCut === null || confCut <= 0 || (conf !== null && conf >= confCut);
        const passesLog2fc = log2fcCut === null || log2fcCut <= 0 || Math.abs(val) >= log2fcCut;

        if (passesConf && passesLog2fc) {
          total++;
          if (val > 0) increase++;
          else if (val < 0) decrease++;
        }
      });
    });

    return { increase, decrease, total };
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
    const isMli2 = name.includes('dmso vs mli2') || name.includes('mli2 vs dmso') ||
                   name.includes('dmso-mli2') || name.includes('mli2-dmso');
    const isKo = name.includes('ko vs wt') || name.includes('wt vs ko') ||
                 name.includes('ko-wt') || name.includes('wt-ko');
    return isMli2 || isKo;
  }

  drop(event: CdkDragDrop<string[]>) {
    this.sortStack.update((stack: SortCriterion[]) => {
      const newStack = [...stack];
      moveItemInArray(newStack, event.previousIndex, event.currentIndex);
      return newStack;
    });
  }

  copyUrl() {
    const url = window.location.href;
    const maxLength = 2000;
    
    navigator.clipboard.writeText(url).then(() => {
      if (url.length > maxLength) {
        alert(`Warning: The current URL is very long (${url.length} characters). It may not work correctly when shared.`);
      }
    });
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

  exportProteinListCsv() {
    const filename = `protein_list_${this.currentDataset()}_${new Date().toISOString().slice(0, 10)}`;
    this.exportService.exportProteinList(this.displayedGenes(), 'csv', filename);
  }

  exportProteinListTsv() {
    const filename = `protein_list_${this.currentDataset()}_${new Date().toISOString().slice(0, 10)}`;
    this.exportService.exportProteinList(this.displayedGenes(), 'tsv', filename);
  }

  async copyGeneList() {
    await this.exportService.copyGeneListToClipboard(this.displayedGenes(), 'genes');
  }

  clearAllProteins() {
    this.selectedGeneIds.set(new Set());
  }

  resetToDefault() {
    this.filterState.set(new Map());
    this.selectedProjectIds.set(new Set());
    this.log2fcCutoff.set(null);
    this.confidenceCutoff.set(null);
    this.geneSortOrder.set('none');

    const idsToFlip = new Set<string>();
    this.projects().forEach(p => {
      if (this.isDefaultFlip(p)) {
        idsToFlip.add(p.projectId);
      }
    });
    this.flippedProjectIds.set(idsToFlip);

    this.sortStack.set(['organ', 'protein', 'mutation', 'knockout', 'treatment']);
    this.searchTerm.set('');
    this.applyDefaultGenes();
  }

  ngOnInit() {
    this.dataService.loadConfig().subscribe(config => {
      this.config.set(config);
      this.initializeFromUrl();
    });
  }

  private initializeFromUrl() {
    const params = this.route.snapshot.queryParams;
    const config = this.config();
    if (params['genes']) {
      this.selectedGeneIds.set(new Set(params['genes'].split(',')));
    } else {
      this.applyDefaultGenes();
    }

    if (config) {
      config.categorization.forEach(cat => {
        if (params[cat.key]) {
          this.filterState.update(map => {
            const newMap = new Map(map);
            newMap.set(cat.key, new Set(params[cat.key].split(',')));
            return newMap;
          });
        }
      });
    }

    if (params['projects']) {
      this.selectedProjectIds.set(new Set(params['projects'].split(',')));
    }

    if (params['flipped']) {
      this.flippedProjectIds.set(new Set(params['flipped'].split(',')));
    }

    if (params['swapped'] === 'true') {
      this.isHeatmapSwapped.set(true);
    }

    if (params['sort']) {
      this.sortStack.set(params['sort'].split(',') as any);
    }

    if (params['cutoff']) {
      const val = parseFloat(params['cutoff']);
      if (!isNaN(val) && val > 0) {
        this.log2fcCutoff.set(val);
      }
    }

    if (params['conf']) {
      const val = parseFloat(params['conf']);
      if (!isNaN(val) && val > 0) {
        this.confidenceCutoff.set(val);
      }
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
    this.toggleFilter(chip.type, chip.value);
  }

  clearAllFilters() {
    this.filterState.set(new Map());
    this.selectedProjectIds.set(new Set());
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

  togglePresetInput() {
    this.showPresetInput.update(v => !v);
    if (!this.showPresetInput()) {
      this.presetName.set('');
    }
  }

  saveCurrentPreset() {
    const name = this.presetName().trim();
    if (!name) return;

    this.preferencesService.savePreset(
      name,
      this.currentDataset(),
      this.selectedGeneIds(),
      this.getFilterSet('organ'),
      this.getFilterSet('protein'),
      this.getFilterSet('mutation'),
      this.getFilterSet('knockout'),
      this.getFilterSet('treatment'),
      this.getFilterSet('fraction'),
      this.sortStack(),
      this.flippedProjectIds()
    );

    this.presetName.set('');
    this.showPresetInput.set(false);
  }

  loadPreset(preset: FilterPreset) {
    this.selectedGeneIds.set(new Set(preset.geneIds));
    this.filterState.update(map => {
      const newMap = new Map(map);
      if (preset.organs) newMap.set('organ', new Set(preset.organs));
      if (preset.proteins) newMap.set('protein', new Set(preset.proteins));
      if (preset.mutations) newMap.set('mutation', new Set(preset.mutations));
      if (preset.knockouts) newMap.set('knockout', new Set(preset.knockouts));
      if (preset.treatments) newMap.set('treatment', new Set(preset.treatments));
      if (preset.fractions) newMap.set('fraction', new Set(preset.fractions));
      return newMap;
    });
    this.sortStack.set([...preset.sortStack]);
    this.flippedProjectIds.set(new Set(preset.flippedProjectIds));
  }

  deletePreset(preset: FilterPreset) {
    this.preferencesService.deletePreset(preset.id);
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

  setGeneSortOrder(order: 'none' | 'increase' | 'decrease') {
    this.geneSortOrder.set(order);
  }
}
