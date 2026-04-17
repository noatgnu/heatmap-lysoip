import { Component, OnInit, inject, signal, computed, effect, input, viewChild, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { Location, DatePipe, TitleCasePipe } from '@angular/common';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { CurtainFilterComponent } from '../curtain-filter/curtain-filter';
import { HeatmapComponent } from '../heatmap/heatmap';
import { RankPlotComponent } from '../components/rank-plot/rank-plot';
import { SkeletonLoaderComponent } from '../components/skeleton-loader/skeleton-loader';
import { TabsComponent } from '../components/tabs/tabs';
import { FilterChipsComponent, FilterChip } from '../components/filter-chips/filter-chips';
import { CollapsibleSectionComponent } from '../components/collapsible-section/collapsible-section';
import { FindGenePipe } from '../pipes/find-gene.pipe';
import { GeneData, ProjectMetadata, RankItem, HeatmapTab, HeatmapSession } from '../models';
import { DataService, AppConfig } from '../services/data.service';
import { ExportService } from '../services/export.service';
import { FilterPreset, SortCriterion } from '../services/preferences';
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
  manualGeneOrder = signal<string[]>([]);
  activeSubsetGroupId = signal<string | null>(null);
  isInitialized = signal(false);

  tabs = signal<HeatmapTab[]>([]);
  activeTabId = signal<string>('default');
  showHistoryDropdown = signal(false);
  subsetCriteria = signal<Map<string, 'up' | 'down' | 'none'>>(new Map());
  subsetLog2fc = signal<number | null>(null);
  subsetConfidence = signal<number | null>(null);
  isSwitching = signal(false);

  displayColorMin = signal<number | null>(null);
  displayColorMax = signal<number | null>(null);
  displayCellSize = signal<number | null>(null);
  displayLabelFontSize = signal<number>(9);

  toggleSubsetBuilder(groupId: string, event: Event) {
    event.stopPropagation();
    this.activeSubsetGroupId.update(current => current === groupId ? null : groupId);
  }

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
    this.subsetLog2fc.set(null);
    this.subsetConfidence.set(null);
  }

  createCustomSubset(groupProjects: ProjectMetadata[], mode: 'intersection' | 'union' | 'exclusive') {
    const criteria = this.subsetCriteria();
    const activeProjects = groupProjects.filter(p => {
      const val = criteria.get(p.projectId);
      return val && val !== 'none';
    });
    if (activeProjects.length === 0) return;

    const log2fcCut = this.subsetLog2fc() ?? this.log2fcCutoff() ?? 0;
    const confCut = this.subsetConfidence() ?? this.confidenceCutoff() ?? 0;
    
    const allProjs = this.projects();
    const flipped = this.flippedProjectIds();
    const allVisibleProjects = this.filteredProjects();

    const subset = this.allGenes().filter(g => {
      const activeMatchResults = activeProjects.map(p => {
        const idx = allProjs.indexOf(p);
        let val = g.log2fcs[idx];
        const conf = g.confidences[idx];
        if (val === null || conf === null) return false;
        if (flipped.has(p.projectId)) val *= -1;
        
        const targetDir = criteria.get(p.projectId);
        const passesThresholds = Math.abs(val) >= log2fcCut && conf >= confCut;
        const correctDirection = targetDir === 'up' ? val > 0 : val < 0;
        return passesThresholds && correctDirection;
      });

      const passActive = mode === 'union' 
        ? activeMatchResults.some(r => r) 
        : activeMatchResults.every(r => r);

      if (!passActive) return false;

      if (mode === 'exclusive') {
        const nonActiveProjects = allVisibleProjects.filter(p => !activeProjects.find(ap => ap.projectId === p.projectId));
        const targetDirs = new Set(activeProjects.map(p => criteria.get(p.projectId)));

        const matchesDirectionElsewhere = nonActiveProjects.some(p => {
          const idx = allProjs.indexOf(p);
          let val = g.log2fcs[idx];
          const conf = g.confidences[idx];
          if (val === null || conf === null) return false;
          if (flipped.has(p.projectId)) val *= -1;
          
          const passesThresholds = Math.abs(val) >= log2fcCut && conf >= confCut;
          if (!passesThresholds) return false;

          if (val > 0 && targetDirs.has('up')) return true;
          if (val < 0 && targetDirs.has('down')) return true;
          return false;
        });
        
        return !matchesDirectionElsewhere;
      }

      return true;
    });

    if (subset.length > 0) {
      const names = activeProjects.map(p => {
        const dir = criteria.get(p.projectId) === 'up' ? '↑' : '↓';
        return `${p.projectName}${dir}`;
      }).join(mode === 'union' ? ' | ' : ' & ');
      
      const prefix = mode === 'intersection' ? '∩' : (mode === 'exclusive' ? '!' : '∪');
      const suffix = mode === 'exclusive' ? ' (Unique)' : '';
      const cutInfo = (this.subsetLog2fc() || this.subsetConfidence()) ? ` [FC:${log2fcCut}, C:${confCut}]` : '';
      
      this.createTab(subset.map(g => g.uniprotId), `${prefix} ${names}${cutInfo}${suffix} (${subset.length})`, log2fcCut, confCut);
    }
  }

  private getFilterStateAsRecord(): Record<string, string[]> {
    const record: Record<string, string[]> = {};
    this.filterState().forEach((set, key) => {
      if (set.size > 0) record[key] = Array.from(set);
    });
    return record;
  }

  createTab(geneIds: string[], name?: string, log2fcCut?: number | null, confCut?: number | null) {
    const id = Math.random().toString(36).substring(2, 9);
    const tabName = name || `Subset (${geneIds.length})`;
    const newTab: HeatmapTab = {
      id,
      name: tabName,
      geneIds,
      log2fcCutoff: log2fcCut ?? null,
      confidenceCutoff: confCut ?? null,
      selectedProjectIds: Array.from(this.selectedProjectIds()),
      filterState: this.getFilterStateAsRecord(),
      flippedProjectIds: Array.from(this.flippedProjectIds()),
      sortStack: [...this.sortStack()],
      manualProjectOrder: this.manualProjectOrder().map(p => p.projectId),
      manualGeneOrder: [...this.manualGeneOrder()],
      maskSubThreshold: this.maskSubThreshold()
    };
    this.tabs.update(t => [...t, newTab]);
    this.switchTab(id);
  }

  switchTab(tabId: string) {
    this.isSwitching.set(true);
    const currentId = this.activeTabId();
    this.tabs.update(tabs => tabs.map(t =>
      t.id === currentId ? { ...t, colorMin: this.displayColorMin(), colorMax: this.displayColorMax(), cellSize: this.displayCellSize(), labelFontSize: this.displayLabelFontSize() } : t
    ));
    setTimeout(() => {
      this.activeTabId.set(tabId);
      const newTab = this.tabs().find(t => t.id === tabId);
      this.displayColorMin.set(newTab?.colorMin ?? null);
      this.displayColorMax.set(newTab?.colorMax ?? null);
      this.displayCellSize.set(newTab?.cellSize ?? null);
      this.displayLabelFontSize.set(newTab?.labelFontSize ?? 9);
      this.isSwitching.set(false);
    }, 50);
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
      this.switchTab(newTabs[nextIndex]?.id || 'default');
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
  rankCutoff = signal<number>(0);
  geneSortOrder = signal<'none' | 'increase' | 'decrease'>('none');
  showOnlySelectedInRankPlot = signal<boolean>(false);
  maskSubThreshold = signal<boolean>(true);

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

  onExportRequested(event: { scope: 'all' | 'highlighted', format: 'csv' | 'tsv' }) {
    if (event.scope === 'highlighted') {
      this.exportHighlightedProteins(event.format);
    } else {
      const genes = this.displayedGenes();
      if (genes.length === 0) return;
      const filename = `heatmap_proteins_${this.currentDataset()}_${new Date().toISOString().slice(0, 10)}`;
      this.exportService.exportProteinList(genes, event.format, filename);
    }
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
      this.createTab(subset.map(g => g.uniprotId), `Consistently ${direction === 'increase' ? '↑' : '↓'} (${subset.length})`, log2fcCut, confCut);
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
      this.createTab(subset.map(g => g.uniprotId), `Unique ${direction === 'increase' ? '↑' : '↓'} to ${target.projectName} (${subset.length})`, log2fcCut, confCut);
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
      this.createTab(subset.map(g => g.uniprotId), `${target.projectName} Shared ${direction === 'increase' ? '↑' : '↓'} (${subset.length})`, log2fcCut, confCut);
    }
  }

  globalSelectedGenes = computed(() => {
    const ids = this.selectedGeneIds();
    return this.allGenes().filter(g => ids.has(g.uniprotId));
  });

  activeTabGeneIds = computed(() => {
    const globalSelected = this.selectedGeneIds();
    const activeId = this.activeTabId();
    const activeTab = this.tabs().find(t => t.id === activeId);
    return (activeId === 'default' || !activeTab) ? globalSelected : new Set(activeTab.geneIds);
  });

  effectiveLog2fcCutoff = computed(() => {
    const globalCut = this.log2fcCutoff() || 0;
    const activeId = this.activeTabId();
    const activeTab = this.tabs().find(t => t.id === activeId);
    const tabCut = (activeTab?.log2fcCutoff) || 0;
    return Math.max(globalCut, tabCut);
  });

  effectiveConfidenceCutoff = computed(() => {
    const globalCut = this.confidenceCutoff() || 0;
    const activeId = this.activeTabId();
    const activeTab = this.tabs().find(t => t.id === activeId);
    const tabCut = (activeTab?.confidenceCutoff) || 0;
    return Math.max(globalCut, tabCut);
  });

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
        this.tabs.set([{
          id: 'default',
          name: 'Main Heatmap',
          geneIds: [],
          log2fcCutoff: null,
          confidenceCutoff: null,
          selectedProjectIds: [],
          filterState: {},
          flippedProjectIds: [],
          sortStack: [],
          manualProjectOrder: [],
          manualGeneOrder: [],
          maskSubThreshold: true
        }]);
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
        conf: confCut !== null && confCut > 0 ? confCut.toString() : null,
        mask: this.maskSubThreshold() ? null : "false",
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
      if (!params['rankCutoff'] && dsConfig?.defaultRankCutoff !== undefined) {
        this.rankCutoff.set(dsConfig.defaultRankCutoff);
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
      this.selectedGeneIds.update((set: Set<string>) => {
        const newSet = new Set(set);
        newSet.add(id);
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
    const activeIds = this.activeTabGeneIds();
    if (activeIds.size === 0) return [];

    const allProjs = this.projects();
    const log2fcCut = this.effectiveLog2fcCutoff();
    const confCut = this.effectiveConfidenceCutoff();
    const sortOrder = this.geneSortOrder();
    const filterTerm = this.geneFilterTerm().toLowerCase().trim();
    const filteredProjIndices = new Set(this.filteredProjects().map(p => allProjs.indexOf(p)));
    const flippedIds = this.flippedProjectIds();

    const genes = this.allGenes().filter(g => activeIds.has(g.uniprotId));

    const termFiltered = filterTerm 
      ? genes.filter(g => g.gene.toLowerCase().includes(filterTerm) || g.uniprotId.toLowerCase().includes(filterTerm))
      : genes;

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

    if (this.manualGeneOrder().length > 0) {
      const orderMap = new Map(this.manualGeneOrder().map((id, index) => [id, index]));
      return [...filtered].sort((a, b) => {
        const idxA = orderMap.has(a.uniprotId) ? orderMap.get(a.uniprotId)! : 1000000;
        const idxB = orderMap.has(b.uniprotId) ? orderMap.get(b.uniprotId)! : 1000000;
        return idxA - idxB;
      });
    }

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
        if (selectedValues.size > 0 && !selectedValues.has(p[key])) categorizationMatch = false;
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
    const showOnlySelected = this.showOnlySelectedInRankPlot();
    const globalIds = this.selectedGeneIds();
    const dataMap = new Map<string, RankItem[]>();
    
    groups.forEach(group => {
      dataMap.set(group.name, this.calculateRankData(group.projects, showOnlySelected ? globalIds : undefined));
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

  private calculateRankData(projects: ProjectMetadata[], limitToIds?: Set<string>): RankItem[] {
    const allGenes = this.allGenes();
    const allProjs = this.projects();
    const flipped = this.flippedProjectIds();
    const log2fcCut = this.log2fcCutoff();
    const confCut = this.confidenceCutoff();
    const projIndices = projects.map(p => allProjs.indexOf(p));
    if (projIndices.length === 0) return [];

    const minTotal = Math.ceil(projIndices.length * (this.rankCutoff() / 100));

    return allGenes
      .filter(g => !limitToIds || limitToIds.has(g.uniprotId))
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
    const projs = this.projects();
    const flippedIds = this.flippedProjectIds();
    const log2fcCut = this.effectiveLog2fcCutoff();
    const confCut = this.effectiveConfidenceCutoff();
    const projIndices = projects.map(p => projs.indexOf(p));
    
    let increase = 0;
    let decrease = 0;
    let total = 0;
    
    genes.forEach(g => {
      projIndices.forEach(idx => {
        if (idx === -1) return;
        let val = g.log2fcs[idx];
        const conf = g.confidences[idx];
        if (val === null || conf === null) return;
        const passesConf = confCut === null || confCut <= 0 || (conf >= confCut);
        const passesLog2fc = log2fcCut === null || log2fcCut <= 0 || Math.abs(val) >= log2fcCut;
        if (passesConf && passesLog2fc) {
          total++;
          if (flippedIds.has(projs[idx].projectId)) val *= -1;
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
      this.selectedGeneIds.update(set => {
        const newSet = new Set(set);
        newSet.add(id);
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

  toggleFlip(projectId: string) {
    this.flippedProjectIds.update(set => {
      const newSet = new Set(set);
      if (newSet.has(projectId)) newSet.delete(projectId);
      else newSet.add(projectId);
      return newSet;
    });
  }

  isDefaultFlip(p: ProjectMetadata): boolean {
    const dsConfig = this.currentDatasetConfig();
    const patterns = dsConfig?.defaultFlipPatterns || [];
    const name = p.projectName.toLowerCase();
    return patterns.some(pattern => name.includes(pattern.toLowerCase()));
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
    const dsConfig = this.currentDatasetConfig();
    this.filterState.set(new Map());
    this.selectedProjectIds.set(new Set());
    this.log2fcCutoff.set(dsConfig?.defaultLog2fcCutoff ?? null);
    this.confidenceCutoff.set(dsConfig?.defaultConfidenceCutoff ?? null);
    this.rankCutoff.set(dsConfig?.defaultRankCutoff ?? 0);
    this.geneSortOrder.set('none');
    this.maskSubThreshold.set(true);
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

    if (params['mask'] === 'false') {
      this.maskSubThreshold.set(false);
    }

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

  loadHistoryEntry(entry: SelectionHistoryEntry) {
    this.selectedGeneIds.set(new Set(entry.geneIds));
    this.showHistoryDropdown.set(false);
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

  private buildDefaultTab(): HeatmapTab {
    return {
      id: 'default',
      name: 'Main Heatmap',
      geneIds: Array.from(this.selectedGeneIds()),
      log2fcCutoff: this.log2fcCutoff(),
      confidenceCutoff: this.confidenceCutoff(),
      selectedProjectIds: Array.from(this.selectedProjectIds()),
      filterState: this.getFilterStateAsRecord(),
      flippedProjectIds: Array.from(this.flippedProjectIds()),
      sortStack: [...this.sortStack()],
      manualProjectOrder: this.manualProjectOrder().map(p => p.projectId),
      manualGeneOrder: [...this.manualGeneOrder()],
      maskSubThreshold: this.maskSubThreshold(),
      colorMin: this.displayColorMin(),
      colorMax: this.displayColorMax(),
      cellSize: this.displayCellSize(),
      labelFontSize: this.displayLabelFontSize()
    };
  }

  exportSession() {
    const existingTabs = this.tabs();
    const activeId = this.activeTabId();
    const tabs = existingTabs.map(t => {
      if (t.id === 'default') return this.buildDefaultTab();
      if (t.id === activeId) return { ...t, colorMin: this.displayColorMin(), colorMax: this.displayColorMax(), cellSize: this.displayCellSize(), labelFontSize: this.displayLabelFontSize() };
      return t;
    });
    const session: HeatmapSession = {
      version: 1,
      dataset: this.currentDataset(),
      tabs,
      activeTabId: this.activeTabId(),
      rankCutoff: this.rankCutoff(),
      summaryDisplayMode: this.summaryDisplayMode(),
      isHeatmapSwapped: this.isHeatmapSwapped(),
      geneSortOrder: this.geneSortOrder(),
      createdAt: Date.now()
    };
    const data = JSON.stringify(session, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `heatmap_session_${this.currentDataset()}_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  onImportSession(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const imported = JSON.parse(content);

          if (imported.version && imported.tabs) {
            this.loadSession(imported as HeatmapSession);
          } else if (Array.isArray(imported)) {
            const presets = imported as FilterPreset[];
            presets.forEach(p => {
              this.createTab(p.geneIds, p.name);
            });
          }
        } catch (err) {
          console.error('Import failed', err);
          alert('Failed to import session. Please ensure the file is a valid JSON.');
        }
      };
      reader.readAsText(file);
      input.value = '';
    }
  }

  loadSession(session: HeatmapSession) {
    const hasDefault = session.tabs.some(t => t.id === 'default');
    const tabs = hasDefault ? session.tabs : [
      { id: 'default', name: 'Main Heatmap', geneIds: [], log2fcCutoff: null, confidenceCutoff: null, selectedProjectIds: [], filterState: {}, flippedProjectIds: [], sortStack: [], manualProjectOrder: [], manualGeneOrder: [], maskSubThreshold: true },
      ...session.tabs
    ];
    this.tabs.set(tabs);

    const tabExists = tabs.some(t => t.id === session.activeTabId);
    this.activeTabId.set(tabExists ? session.activeTabId : 'default');

    this.rankCutoff.set(session.rankCutoff ?? 0);
    if (session.summaryDisplayMode !== undefined) this.summaryDisplayMode.set(session.summaryDisplayMode);
    if (session.isHeatmapSwapped !== undefined) this.isHeatmapSwapped.set(session.isHeatmapSwapped);
    if (session.geneSortOrder !== undefined) this.geneSortOrder.set(session.geneSortOrder);

    const defaultTab = tabs.find(t => t.id === 'default');
    if (defaultTab) {
      this.selectedGeneIds.set(new Set(defaultTab.geneIds || []));
      this.log2fcCutoff.set(defaultTab.log2fcCutoff ?? null);
      this.confidenceCutoff.set(defaultTab.confidenceCutoff ?? null);
      this.selectedProjectIds.set(new Set(defaultTab.selectedProjectIds || []));
      const filterState = new Map<string, Set<string>>();
      Object.entries(defaultTab.filterState || {}).forEach(([k, v]) => filterState.set(k, new Set(v)));
      this.filterState.set(filterState);
      this.flippedProjectIds.set(new Set(defaultTab.flippedProjectIds || []));
      this.sortStack.set((defaultTab.sortStack || []) as SortCriterion[]);
      this.maskSubThreshold.set(defaultTab.maskSubThreshold ?? true);
      const allProjs = this.projects();
      const projMap = new Map(allProjs.map(p => [p.projectId, p]));
      const mProjs = (defaultTab.manualProjectOrder || []).map(id => projMap.get(id)).filter((p): p is ProjectMetadata => !!p);
      this.manualProjectOrder.set(mProjs);
      this.manualGeneOrder.set(defaultTab.manualGeneOrder || []);
    }

    const activeTab = tabs.find(t => t.id === (tabExists ? session.activeTabId : 'default'));
    this.displayColorMin.set(activeTab?.colorMin ?? null);
    this.displayColorMax.set(activeTab?.colorMax ?? null);
    this.displayCellSize.set(activeTab?.cellSize ?? null);
    this.displayLabelFontSize.set(activeTab?.labelFontSize ?? 9);
  }
}
