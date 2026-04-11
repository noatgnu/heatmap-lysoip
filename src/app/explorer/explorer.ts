import { Component, OnInit, inject, signal, computed, effect, input, viewChild, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { Location, DatePipe } from '@angular/common';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { TitleCasePipe } from '@angular/common';
import { CurtainFilterComponent } from '../curtain-filter/curtain-filter';
import { HeatmapComponent } from '../heatmap/heatmap';
import { RankPlotComponent } from '../components/rank-plot/rank-plot';
import { SkeletonLoaderComponent } from '../components/skeleton-loader/skeleton-loader';
import { TabsComponent } from '../components/tabs/tabs';
import { FilterChipsComponent, FilterChip } from '../components/filter-chips/filter-chips';
import { CollapsibleSectionComponent } from '../components/collapsible-section/collapsible-section';
import { FindGenePipe } from '../pipes/find-gene.pipe';
import { GeneData, ProjectMetadata, RankItem, HeatmapTab } from '../models';
import { DataService, AppConfig } from '../services/data.service';
import { ExportService } from '../services/export.service';
import { PreferencesService, FilterPreset, SortCriterion } from '../services/preferences';
import { HistoryService, SelectionHistoryEntry } from '../services/history.service';

@Component({
  selector: 'app-explorer',
  standalone: true,
  imports: [FormsModule, DragDropModule, ScrollingModule, CurtainFilterComponent, HeatmapComponent, RankPlotComponent, SkeletonLoaderComponent, TabsComponent, FilterChipsComponent, CollapsibleSectionComponent, RouterLink, FindGenePipe, TitleCasePipe, DatePipe],
  templateUrl: './explorer.html',
  styleUrl: './explorer.scss'
})
export class ExplorerComponent implements OnInit {
  private dataService = inject(DataService);
  private exportService = inject(ExportService);
  private preferencesService = inject(PreferencesService);
  protected historyService = inject(HistoryService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private location = inject(Location);

  protected readonly Math = Math;
  protected readonly Array = Array;

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
  manualProjectOrder = signal<ProjectMetadata[]>([]);
  isInitialized = signal(false);

  tabs = signal<HeatmapTab[]>([]);
  activeTabId = signal<string>('default');
  showHistoryDropdown = signal(false);
  subsetCriteria = signal<Map<string, 'up' | 'down' | 'none'>>(new Map());
  isSwitching = signal(false);

  selectionHistory = computed(() => this.historyService.getHistoryForDataset(this.currentDataset()));

  getFilterSet(key: string): Set<string> {
    return this.filterState().get(key) || new Set();
  }

  toggleSubsetCriterion(projectId: string, direction: 'up' | 'down') {
    this.subsetCriteria.update(map => {
      const newMap = new Map(map);
      const current = newMap.get(projectId) || 'none';
      if (current === direction) {
        newMap.set(projectId, 'none');
      } else {
        newMap.set(projectId, direction);
      }
      return newMap;
    });
  }

  clearSubsetCriteria() {
    this.subsetCriteria.set(new Map());
  }

  createCustomSubset(groupProjects: ProjectMetadata[], mode: 'intersection' | 'union') {
    const criteria = this.subsetCriteria();
    const activeProjects = groupProjects.filter(p => {
      const val = criteria.get(p.projectId);
      return val && val !== 'none';
    });
    if (activeProjects.length === 0) return;

    const log2fcCut = this.log2fcCutoff() || 0;
    const confCut = this.confidenceCutoff() || 0;
    const allProjs = this.projects();
    const flipped = this.flippedProjectIds();

    const subset = this.allGenes().filter(g => {
      const matchResults = activeProjects.map(p => {
        const idx = allProjs.indexOf(p);
        let val = g.log2fcs[idx];
        const conf = g.confidences[idx];
        if (val === null || conf === null) return false;
        if (flipped.has(p.projectId)) val *= -1;
        
        const targetDir = criteria.get(p.projectId);
        const passesLog2fc = Math.abs(val) >= log2fcCut;
        const passesConf = conf >= confCut;
        const correctDirection = targetDir === 'up' ? val > 0 : val < 0;
        return passesLog2fc && passesConf && correctDirection;
      });
      return mode === 'intersection' ? matchResults.every(r => r) : matchResults.some(r => r);
    });

    if (subset.length > 0) {
      const names = activeProjects.map(p => {
        const dir = criteria.get(p.projectId) === 'up' ? '↑' : '↓';
        return `${p.projectName}${dir}`;
      }).join(mode === 'intersection' ? ' & ' : ' | ');
      this.createTab(subset.map(g => g.uniprotId), `${mode === 'intersection' ? '∩' : '∪'} ${names} (${subset.length})`);
    }
  }

  createTab(geneIds: string[], name?: string) {
    const id = Math.random().toString(36).substring(2, 9);
    const tabName = name || `Subset (${geneIds.length})`;
    const newTab: HeatmapTab = { id, name: tabName, geneIds };
    this.tabs.update(t => [...t, newTab]);
    this.activeTabId.set(id);
  }

  switchTab(tabId: string) {
    this.activeTabId.set(tabId);
  }

  removeTab(tabId: string, event?: Event) {
    if (event) event.stopPropagation();
    if (tabId === 'default') return;
    const currentTabs = this.tabs();
    const index = currentTabs.findIndex(t => t.id === tabId);
    const newTabs = currentTabs.filter(t => t.id !== tabId);
    this.tabs.set(newTabs);
    if (this.activeTabId() === tabId) {
      const nextIndex = Math.min(index, newTabs.length - 1);
      this.activeTabId.set(newTabs[nextIndex]?.id || 'default');
    }
  }

  dropExperiment(event: CdkDragDrop<ProjectMetadata[]>) {
    this.manualProjectOrder.update(projects => {
      const newOrder = [...projects];
      moveItemInArray(newOrder, event.previousIndex, event.currentIndex);
      return newOrder;
    });
  }

  clearManualSort() {
    this.manualProjectOrder.set([]);
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

  selectedHeatmapProteinIds = computed(() => new Set(this.selectedHeatmapProteins().keys()));
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
      const activeId = this.activeTabId();
      if (activeId === 'default') {
        this.selectedGeneIds.set(new Set(selected.keys()));
      } else {
        this.tabs.update(tabs => tabs.map(t => 
          t.id === activeId ? { ...t, geneIds: Array.from(selected.keys()) } : t
        ));
      }
      this.selectedHeatmapProteins.set(new Map());
      this.geneFilterTerm.set('');
    }
  }

  openSelectionInInternalTab() {
    const selected = this.selectedHeatmapProteins();
    if (selected.size > 0) {
      this.createTab(Array.from(selected.keys()));
      this.selectedHeatmapProteins.set(new Map());
      this.geneFilterTerm.set('');
    }
  }

  openComparisonInNewTab() {
    const selected = this.selectedHeatmapProteins();
    if (selected.size === 0) return;
    const log2fcCut = this.log2fcCutoff();
    const confCut = this.confidenceCutoff();
    const urlTree = this.router.createUrlTree(['/', this.currentDataset()], {
      queryParams: {
        genes: Array.from(selected.keys()).join(','),
        cutoff: log2fcCut ? log2fcCut.toString() : null,
        conf: confCut ? confCut.toString() : null
      }
    });
    const serializedUrl = this.router.serializeUrl(urlTree);
    const fullUrl = window.location.origin + window.location.pathname + this.location.prepareExternalUrl(serializedUrl);
    window.open(fullUrl, '_blank');
  }

  exportHighlightedProteins(format: 'csv' | 'tsv') {
    const selected = Array.from(this.selectedHeatmapProteins().values());
    if (selected.length === 0) return;
    const filename = `highlighted_proteins_${this.currentDataset()}_${new Date().toISOString().slice(0, 10)}`;
    this.exportService.exportProteinList(selected, format, filename);
  }

  removeHeatmapSelection(uniprotId: string) {
    this.selectedHeatmapProteins.update(map => {
      const newMap = new Map(map);
      newMap.delete(uniprotId);
      return newMap;
    });
  }

  createConsistentTab(groupProjects: ProjectMetadata[], direction: 'increase' | 'decrease') {
    const log2fcCut = this.log2fcCutoff() || 0;
    const confCut = this.confidenceCutoff() || 0;
    const allProjs = this.projects();
    const flipped = this.flippedProjectIds();
    const projIndices = groupProjects.map(p => allProjs.indexOf(p));

    const subset = this.allGenes().filter(g => {
      if (projIndices.length === 0) return false;
      return projIndices.every(idx => {
        let val = g.log2fcs[idx];
        const conf = g.confidences[idx];
        if (val === null || conf === null) return false;
        const projId = allProjs[idx].projectId;
        if (flipped.has(projId)) val *= -1;
        const passesLog2fc = Math.abs(val) >= log2fcCut;
        const passesConf = conf >= confCut;
        const correctDirection = direction === 'increase' ? val > 0 : val < 0;
        return passesLog2fc && passesConf && correctDirection;
      });
    });

    if (subset.length > 0) {
      this.createTab(subset.map(g => g.uniprotId), `Consistently ${direction === 'increase' ? '↑' : '↓'} (${subset.length})`);
    }
  }

  createUniqueTab(target: ProjectMetadata, groupProjects: ProjectMetadata[], direction: 'increase' | 'decrease') {
    const log2fcCut = this.log2fcCutoff() || 0;
    const confCut = this.confidenceCutoff() || 0;
    const allProjs = this.projects();
    const flipped = this.flippedProjectIds();
    const targetIdx = allProjs.indexOf(target);
    const otherIndices = groupProjects.filter(p => p !== target).map(p => allProjs.indexOf(p));

    const subset = this.allGenes().filter(g => {
      let targetVal = g.log2fcs[targetIdx];
      const targetConf = g.confidences[targetIdx];
      if (targetVal === null || targetConf === null) return false;
      if (flipped.has(target.projectId)) targetVal *= -1;
      
      const targetPasses = Math.abs(targetVal) >= log2fcCut && targetConf >= confCut && (direction === 'increase' ? targetVal > 0 : targetVal < 0);
      if (!targetPasses) return false;

      return otherIndices.every(idx => {
        let v = g.log2fcs[idx];
        const c = g.confidences[idx];
        if (v === null || c === null) return true;
        const projId = allProjs[idx].projectId;
        if (flipped.has(projId)) v *= -1;
        const passes = Math.abs(v) >= log2fcCut && c >= confCut;
        return !passes;
      });
    });

    if (subset.length > 0) {
      this.createTab(subset.map(g => g.uniprotId), `Unique ${direction === 'increase' ? '↑' : '↓'} to ${target.projectName} (${subset.length})`);
    }
  }

  createSharedTab(target: ProjectMetadata, groupProjects: ProjectMetadata[], direction: 'increase' | 'decrease') {
    const log2fcCut = this.log2fcCutoff() || 0;
    const confCut = this.confidenceCutoff() || 0;
    const allProjs = this.projects();
    const flipped = this.flippedProjectIds();
    const targetIdx = allProjs.indexOf(target);
    const otherIndices = groupProjects.filter(p => p !== target).map(p => allProjs.indexOf(p));

    const subset = this.allGenes().filter(g => {
      let targetVal = g.log2fcs[targetIdx];
      const targetConf = g.confidences[targetIdx];
      if (targetVal === null || targetConf === null) return false;
      if (flipped.has(target.projectId)) targetVal *= -1;
      
      const targetPasses = Math.abs(targetVal) >= log2fcCut && targetConf >= confCut && (direction === 'increase' ? targetVal > 0 : targetVal < 0);
      if (!targetPasses) return false;

      return otherIndices.some(idx => {
        let v = g.log2fcs[idx];
        const c = g.confidences[idx];
        if (v === null || c === null) return false;
        const projId = allProjs[idx].projectId;
        if (flipped.has(projId)) v *= -1;
        const passes = Math.abs(v) >= log2fcCut && c >= confCut && (direction === 'increase' ? v > 0 : v < 0);
        return passes;
      });
    });

    if (subset.length > 0) {
      this.createTab(subset.map(g => g.uniprotId), `${target.projectName} Shared ${direction === 'increase' ? '↑' : '↓'} (${subset.length})`);
    }
  }

  groupingPresets = computed(() => {
    const categorization = this.config()?.categorization || [];
    if (categorization.length === 0) return [];
    return categorization.map(cat => {
      const primaryKey = cat.key;
      const others = categorization.filter(c => c.key !== primaryKey).map(c => c.key);
      const stack = [primaryKey, ...others] as SortCriterion[];
      const label = [cat.label, ...categorization.filter(c => c.key !== primaryKey).map(c => c.label)].join(' > ');
      return { label, stack };
    });
  });

  sortStack = signal<SortCriterion[]>([]);
  showPresetInput = signal(false);
  presetName = signal('');
  currentPresets = computed(() => this.preferencesService.getPresetsForDataset(this.currentDataset()));
  hasMultipleDatasets = computed(() => (this.config()?.datasets?.length || 0) > 1);
  currentDatasetConfig = computed(() => this.config()?.datasets.find(d => d.id === this.currentDataset()));

  private defaultGenesFallback = [
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
      untracked(() => {
        this.isInitialized.set(false);
        this.currentDataset.set(ds);
        this.filterState.set(new Map());
        this.selectedProjectIds.set(new Set());
        this.flippedProjectIds.set(new Set());
        this.manualProjectOrder.set([]);
        this.tabs.set([{ id: 'default', name: 'Main Heatmap', geneIds: [] }]);
        this.activeTabId.set('default');
        this.log2fcCutoff.set(null);
        this.confidenceCutoff.set(null);
        this.loadData(ds);
      });
    });

    effect(() => {
      const ids = Array.from(this.selectedGeneIds());
      const dataset = this.currentDataset();
      if (this.isInitialized() && ids.length > 0) {
        untracked(() => {
          this.historyService.addToHistory(dataset, ids);
        });
      }
    });

    effect(() => {
      const projs = this.projects();
      const fState = this.filterState();
      const sProjectIds = this.selectedProjectIds();
      const stack = this.sortStack();
      
      const filtered = projs.filter((p: any) => {
        const projectMatch = sProjectIds.size === 0 || sProjectIds.has(p.projectId);
        let categorizationMatch = true;
        fState.forEach((selectedValues, key) => {
          if (selectedValues.size > 0 && !selectedValues.has(p[key])) categorizationMatch = false;
        });
        return projectMatch && categorizationMatch;
      }).sort((a: any, b: any) => {
        const categorization = this.config()?.categorization || [];
        for (const criterion of stack) {
          const cat = categorization.find(c => c.key === criterion);
          const priorities = cat?.priorities || {};
          const valA = (a[criterion] || '').toString();
          const valB = (b[criterion] || '').toString();
          const pA = priorities[valA] || priorities[valA.toUpperCase()] || 99;
          const pB = priorities[valB] || priorities[valB.toUpperCase()] || 99;
          let cmp = pA - pB;
          if (cmp === 0) cmp = valA.localeCompare(valB);
          if (cmp !== 0) return cmp;
        }
        return (a.date || '').localeCompare(b.date || '');
      });

      untracked(() => {
        const currentManual = this.manualProjectOrder();
        if (currentManual.length === 0) {
          this.manualProjectOrder.set(filtered);
        } else {
          const filteredIds = new Set(filtered.map(p => p.projectId));
          let newManual = currentManual.filter(p => filteredIds.has(p.projectId));
          const manualIds = new Set(newManual.map(p => p.projectId));
          filtered.forEach(p => {
            if (!manualIds.has(p.projectId)) newManual.push(p);
          });
          this.manualProjectOrder.set(newManual);
        }
      });
    });

    effect(() => {
      if (!this.isInitialized()) return;
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

  setPreset(stack: SortCriterion[]) {
    this.sortStack.set([...stack]);
  }

  loadData(type: string) {
    this.isLoading.set(true);
    this.dataService.loadDataset(type).subscribe(({ projects, genes }) => {
      this.projects.set(projects);
      this.allGenes.set(genes);
      
      const params = this.route.snapshot.queryParams;
      const dsConfig = this.currentDatasetConfig();

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
        this.applyDefaultGenes(dsConfig?.defaultGenes);
      }

      if (!params['cutoff'] && dsConfig?.defaultLog2fcCutoff !== undefined) {
        this.log2fcCutoff.set(dsConfig.defaultLog2fcCutoff);
      }
      if (!params['conf'] && dsConfig?.defaultConfidenceCutoff !== undefined) {
        this.confidenceCutoff.set(dsConfig.defaultConfidenceCutoff);
      }

      if (!params['sort']) {
        const categorization = this.config()?.categorization || [];
        this.sortStack.set(categorization.map(c => c.key) as SortCriterion[]);
      }

      this.isLoading.set(false);
    });
  }

  private applyDefaultGenes(genesFromConfig?: string[]) {
    const ids = new Set<string>();
    const defaultList = genesFromConfig || this.defaultGenesFallback;
    const lowerDefault = defaultList.map(g => g.toLowerCase());
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
      const id = Array.from(matchedIds)[0];
      const activeId = this.activeTabId();
      if (activeId === 'default') {
        this.selectedGeneIds.update((set: Set<string>) => {
          const newSet = new Set(set);
          newSet.add(id);
          return newSet;
        });
      } else {
        this.tabs.update(tabs => tabs.map(t => 
          t.id === activeId ? { ...t, geneIds: Array.from(new Set([...t.geneIds, id])) } : t
        ));
      }
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
    const globalSelected = this.selectedGeneIds();
    const activeId = this.activeTabId();
    const activeTab = this.tabs().find(t => t.id === activeId);
    const sourceIds = (activeId === 'default' || !activeTab) ? globalSelected : new Set(activeTab.geneIds);
    
    if (sourceIds.size === 0) return [];

    const allProjs = this.projects();
    const log2fcCut = this.log2fcCutoff();
    const confCut = this.confidenceCutoff();
    const sortOrder = this.geneSortOrder();
    const filterTerm = this.geneFilterTerm().toLowerCase().trim();
    const filteredProjIndices = new Set(this.filteredProjects().map(p => allProjs.indexOf(p)));
    const flippedIds = this.flippedProjectIds();

    // 1. Get base genes from stable source (no mapping to keep objects stable)
    const genes = this.allGenes().filter(g => sourceIds.has(g.uniprotId));

    // 2. Apply search filter
    const termFiltered = filterTerm 
      ? genes.filter(g => g.gene.toLowerCase().includes(filterTerm) || g.uniprotId.toLowerCase().includes(filterTerm))
      : genes;

    // 3. Apply significance filter (NON-DESTRUCTIVE - just for display)
    const filtered = termFiltered.filter(g => {
      const hasLog2fcCutoff = log2fcCut !== null && log2fcCut > 0;
      const hasConfCutoff = confCut !== null && confCut > 0;
      if (!hasLog2fcCutoff && !hasConfCutoff) return true;

      return g.log2fcs.some((val, idx) => {
        if (!filteredProjIndices.has(idx) || val === null) return false;
        
        let v = val;
        if (flippedIds.has(allProjs[idx].projectId)) v *= -1;
        
        const passesLog2fc = !hasLog2fcCutoff || Math.abs(v) >= log2fcCut!;
        const conf = g.confidences[idx];
        const passesConf = !hasConfCutoff || (conf !== null && conf >= confCut!);
        return passesLog2fc && passesConf;
      });
    });

    // 4. Sort
    if (sortOrder === 'none') return filtered;
    return [...filtered].sort((a, b) => {
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
    const flippedIds = this.flippedProjectIds();
    const projs = this.projects();

    gene.log2fcs.forEach((val, idx) => {
      if (!projIndices.has(idx) || val === null) return;
      const conf = gene.confidences[idx];
      const passesConf = confCut === null || confCut <= 0 || (conf !== null && conf >= confCut);
      const passesLog2fc = log2fcCut === null || log2fcCut <= 0 || Math.abs(val) >= log2fcCut;
      
      if (passesConf && passesLog2fc) {
        let v = val;
        if (flippedIds.has(projs[idx].projectId)) v *= -1;
        if (direction === 'increase' && v > 0) count++;
        else if (direction === 'decrease' && v < 0) count++;
      }
    });
    return count;
  }

  filteredProjects = computed(() => {
    const projs = this.projects();
    const fState = this.filterState();
    const sProjectIds = this.selectedProjectIds();
    const stack = this.sortStack();
    const manualOrder = this.manualProjectOrder();
    
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

    if (manualOrder.length > 0) {
      const filteredIds = new Set(filtered.map(p => p.projectId));
      return manualOrder.filter(p => filteredIds.has(p.projectId));
    }

    return [...filtered].sort((a: any, b: any) => {
      const categorization = this.config()?.categorization || [];
      for (const criterion of stack) {
        const cat = categorization.find(c => c.key === criterion);
        const priorities = cat?.priorities || {};
        const valA = (a[criterion] || '').toString();
        const valB = (b[criterion] || '').toString();
        const pA = priorities[valA] || priorities[valA.toUpperCase()] || 99;
        const pB = priorities[valB] || priorities[valB.toUpperCase()] || 99;
        let cmp = pA - pB;
        if (cmp === 0) cmp = valA.localeCompare(valB);
        if (cmp !== 0) return cmp;
      }
      return (a.date || '').localeCompare(b.date || '');
    });
  });

  projectGroups = computed(() => {
    const projs = this.filteredProjects();
    const config = this.config();
    if (!config || projs.length === 0) return [];
    const groupKey = config.categorization[0].key;
    const groups = new Map<string, ProjectMetadata[]>();
    projs.forEach(p => {
      const val = (p as any)[groupKey] || 'Other';
      if (!groups.has(val)) groups.set(val, []);
      groups.get(val)!.push(p);
    });
    return Array.from(groups.entries()).map(([name, projects]) => ({
      name,
      projects
    })).sort((a, b) => {
      const cat = config.categorization[0];
      const priorities = cat.priorities || {};
      const pA = priorities[a.name] || priorities[a.name.toUpperCase()] || 99;
      const pB = priorities[b.name] || priorities[b.name.toUpperCase()] || 99;
      return pA - pB;
    });
  });

  groupRankData = computed(() => {
    const groups = this.projectGroups();
    const dataMap = new Map<string, RankItem[]>();
    groups.forEach(group => {
      dataMap.set(group.name, this.calculateRankData(group.projects));
    });
    return dataMap;
  });

  groupSummaries = computed(() => {
    const groups = this.projectGroups();
    const genes = this.displayedGenes();
    const dataMap = new Map<string, { increase: number; decrease: number; total: number }>();
    groups.forEach(group => {
      dataMap.set(group.name, this.calculateHeatmapSummary(group.projects, genes));
    });
    return dataMap;
  });

  private calculateRankData(projects: ProjectMetadata[]): RankItem[] {
    const allGenes = this.allGenes();
    const allProjs = this.projects();
    const flipped = this.flippedProjectIds();
    const selectedIds = this.selectedGeneIds();
    const showOnlySelected = this.showOnlySelectedInRankPlot();
    const log2fcCut = this.log2fcCutoff();
    const confCut = this.confidenceCutoff();
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
            const conf = g.confidences[idx];
            const passesConf = confCut === null || confCut <= 0 || (conf !== null && conf >= confCut);
            const passesLog2fc = log2fcCut === null || log2fcCut <= 0 || Math.abs(val) >= log2fcCut;
            if (passesConf && passesLog2fc) {
              total++;
              const projId = allProjs[idx].projectId;
              if (flipped.has(projId)) val *= -1;
              if (val > 0) increase++;
              else if (val < 0) decrease++;
            }
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

  private calculateHeatmapSummary(projects: ProjectMetadata[], genes: GeneData[]): { increase: number; decrease: number; total: number } {
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

  selectGenesFromPlot(uniprotIds: string[]) {
    if (uniprotIds.length === 1) {
      const id = uniprotIds[0];
      const activeId = this.activeTabId();
      if (activeId === 'default') {
        this.selectedGeneIds.update(set => {
          const newSet = new Set(set);
          newSet.add(id);
          return newSet;
        });
      } else {
        this.tabs.update(tabs => tabs.map(t => 
          t.id === activeId ? { ...t, geneIds: Array.from(new Set([...t.geneIds, id])) } : t
        ));
      }
    } else if (uniprotIds.length > 1) {
      this.pendingBulkSelection.set(uniprotIds);
    }
  }

  confirmBulkAdd() {
    const ids = this.pendingBulkSelection();
    if (ids) {
      const activeId = this.activeTabId();
      if (activeId === 'default') {
        this.selectedGeneIds.update(set => {
          const newSet = new Set(set);
          ids.forEach(id => newSet.add(id));
          return newSet;
        });
      } else {
        this.tabs.update(tabs => tabs.map(t => 
          t.id === activeId ? { ...t, geneIds: Array.from(new Set([...t.geneIds, ...ids])) } : t
        ));
      }
    }
    this.pendingBulkSelection.set(null);
  }

  confirmBulkReplace() {
    const ids = this.pendingBulkSelection();
    if (ids) {
      const activeId = this.activeTabId();
      if (activeId === 'default') {
        this.selectedGeneIds.set(new Set([...ids]));
      } else {
        this.tabs.update(tabs => tabs.map(t => 
          t.id === activeId ? { ...t, geneIds: [...ids] } : t
        ));
      }
      this.geneFilterTerm.set('');
    }
    this.pendingBulkSelection.set(null);
  }

  cancelBulkSelection() {
    this.pendingBulkSelection.set(null);
    this.isBulkReplacing.set(false);
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
    const activeId = this.activeTabId();
    if (activeId === 'default') {
      this.selectedGeneIds.set(new Set());
    } else {
      this.tabs.update(tabs => tabs.map(t => 
        t.id === activeId ? { ...t, geneIds: [] } : t
      ));
    }
  }

  resetToDefault() {
    const dsConfig = this.currentDatasetConfig();
    this.filterState.set(new Map());
    this.selectedProjectIds.set(new Set());
    this.log2fcCutoff.set(dsConfig?.defaultLog2fcCutoff ?? null);
    this.confidenceCutoff.set(dsConfig?.defaultConfidenceCutoff ?? null);
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
    this.applyDefaultGenes(dsConfig?.defaultGenes);
  }

  ngOnInit() {
    this.dataService.loadConfig().subscribe(config => {
      this.config.set(config);
      this.initializeFromUrl();
      this.isInitialized.set(true);
    });
  }

  private initializeFromUrl() {
    const params = this.route.snapshot.queryParams;
    const config = this.config();
    const dsConfig = this.currentDatasetConfig();

    if (params['genes']) {
      this.selectedGeneIds.set(new Set(params['genes'].split(',')));
    } else {
      this.applyDefaultGenes(dsConfig?.defaultGenes);
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
    } else if (dsConfig?.defaultLog2fcCutoff !== undefined) {
      this.log2fcCutoff.set(dsConfig.defaultLog2fcCutoff);
    }

    if (params['conf']) {
      const val = parseFloat(params['conf']);
      if (!isNaN(val) && val > 0) {
        this.confidenceCutoff.set(val);
      }
    } else if (dsConfig?.defaultConfidenceCutoff !== undefined) {
      this.confidenceCutoff.set(dsConfig.defaultConfidenceCutoff);
    }
  }

  addGene(gene: GeneData) {
    const activeId = this.activeTabId();
    if (activeId === 'default') {
      this.selectedGeneIds.update((set: Set<string>) => {
        const newSet = new Set(set);
        newSet.add(gene.uniprotId);
        return newSet;
      });
    } else {
      this.tabs.update(tabs => tabs.map(t => 
        t.id === activeId ? { ...t, geneIds: Array.from(new Set([...t.geneIds, gene.uniprotId])) } : t
      ));
    }
    this.searchTerm.set('');
    this.highlightedIndex.set(-1);
  }

  removeGene(uniprotId: string) {
    const activeId = this.activeTabId();
    if (activeId === 'default') {
      this.selectedGeneIds.update((set: Set<string>) => {
        const newSet = new Set(set);
        newSet.delete(uniprotId);
        return newSet;
      });
    } else {
      this.tabs.update(tabs => tabs.map(t => 
        t.id === activeId ? { ...t, geneIds: t.geneIds.filter(id => id !== uniprotId) } : t
      ));
    }
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
      this.filterState(),
      this.sortStack(),
      this.flippedProjectIds()
    );
    this.presetName.set('');
    this.showPresetInput.set(false);
  }

  loadPreset(preset: FilterPreset) {
    this.selectedGeneIds.set(new Set(preset.geneIds));
    this.filterState.set(new Map(
      Object.entries(preset.filterState).map(([key, val]) => [key, new Set(val)])
    ));
    this.sortStack.set([...preset.sortStack]);
    this.flippedProjectIds.set(new Set(preset.flippedProjectIds));
  }

  loadHistoryEntry(entry: SelectionHistoryEntry) {
    this.selectedGeneIds.set(new Set(entry.geneIds));
    this.showHistoryDropdown.set(false);
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
