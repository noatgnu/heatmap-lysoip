import { Component, OnInit, inject, signal, computed, effect, input, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { CurtainFilterComponent } from '../curtain-filter/curtain-filter';
import { HeatmapComponent } from '../heatmap/heatmap';
import { RankPlotComponent } from '../components/rank-plot/rank-plot';
import { SkeletonLoaderComponent } from '../components/skeleton-loader/skeleton-loader';
import { FilterChipsComponent, FilterChip } from '../components/filter-chips/filter-chips';
import { CollapsibleSectionComponent } from '../components/collapsible-section/collapsible-section';
import { FindGenePipe } from '../pipes/find-gene.pipe';
import { GeneData, ProjectMetadata, RankItem } from '../models';
import { DataService } from '../services/data.service';
import { ExportService } from '../services/export.service';
import { PreferencesService, FilterPreset, SortCriterion } from '../services/preferences';

@Component({
  selector: 'app-explorer',
  standalone: true,
  imports: [FormsModule, DragDropModule, ScrollingModule, CurtainFilterComponent, HeatmapComponent, RankPlotComponent, SkeletonLoaderComponent, FilterChipsComponent, CollapsibleSectionComponent, RouterLink, FindGenePipe],
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

  dataset = input.required<'lysoip' | 'wcl'>();
  currentDataset = signal<'lysoip' | 'wcl'>('lysoip');

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

  selectedOrgans = signal<Set<string>>(new Set());
  selectedProteins = signal<Set<string>>(new Set());
  selectedMutations = signal<Set<string>>(new Set());
  selectedKnockouts = signal<Set<string>>(new Set());
  selectedTreatments = signal<Set<string>>(new Set());
  selectedFractions = signal<Set<string>>(new Set());
  selectedProjectIds = signal<Set<string>>(new Set());
  flippedProjectIds = signal<Set<string>>(new Set());
  summaryDisplayMode = signal<'number' | 'proportion'>('proportion');
  isHeatmapSwapped = signal<boolean>(false);
  log2fcCutoff = signal<number | null>(null);
  confidenceCutoff = signal<number | null>(null);
  rankCutoff = signal<number>(10);
  geneSortOrder = signal<'none' | 'increase' | 'decrease'>('none');
  showOnlySelectedInRankPlot = signal<boolean>(false);
  selectedHeatmapProtein = signal<GeneData | null>(null);
  uiRevision = signal<number>(0);

  onHeatmapGeneSelected(uniprotId: string) {
    const gene = this.allGenes().find(g => g.uniprotId === uniprotId);
    if (gene) {
      this.selectedHeatmapProtein.set(gene);
    }
  }

  openProteinInNewTab(gene: GeneData) {
    const log2fcCut = this.log2fcCutoff();
    const confCut = this.confidenceCutoff();
    const queryParams = new URLSearchParams({
      genes: gene.uniprotId,
      organs: Array.from(this.selectedOrgans()).join(','),
      proteins: Array.from(this.selectedProteins()).join(','),
      mutations: Array.from(this.selectedMutations()).join(','),
      knockouts: Array.from(this.selectedKnockouts()).join(','),
      treatments: Array.from(this.selectedTreatments()).join(','),
      fractions: Array.from(this.selectedFractions()).join(','),
      projects: Array.from(this.selectedProjectIds()).join(','),
      flipped: Array.from(this.flippedProjectIds()).join(','),
      swapped: this.isHeatmapSwapped() ? 'true' : '',
      cutoff: log2fcCut ? log2fcCut.toString() : '',
      conf: confCut ? confCut.toString() : ''
    });

    const url = `${window.location.origin}${window.location.pathname}?${queryParams.toString()}`;
    window.open(url, '_blank');
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
      this.selectedOrgans.set(new Set());
      this.selectedProteins.set(new Set());
      this.selectedMutations.set(new Set());
      this.selectedKnockouts.set(new Set());
      this.selectedTreatments.set(new Set());
      this.selectedFractions.set(new Set());
      this.selectedProjectIds.set(new Set());
      this.flippedProjectIds.set(new Set());
      this.log2fcCutoff.set(null);
      this.confidenceCutoff.set(null);
      this.loadData(ds);
    });

    effect(() => {
      const log2fcCut = this.log2fcCutoff();
      const confCut = this.confidenceCutoff();
      const queryParams = {
        genes: Array.from(this.selectedGeneIds()).join(',') || null,
        organs: Array.from(this.selectedOrgans()).join(',') || null,
        proteins: Array.from(this.selectedProteins()).join(',') || null,
        mutations: Array.from(this.selectedMutations()).join(',') || null,
        knockouts: Array.from(this.selectedKnockouts()).join(',') || null,
        treatments: Array.from(this.selectedTreatments()).join(',') || null,
        fractions: Array.from(this.selectedFractions()).join(',') || null,
        projects: Array.from(this.selectedProjectIds()).join(',') || null,
        flipped: Array.from(this.flippedProjectIds()).join(',') || null,
        mode: this.summaryDisplayMode() === 'proportion' ? null : 'number',
        swapped: this.isHeatmapSwapped() ? 'true' : null,
        sort: this.sortStack().join(','),
        cutoff: log2fcCut !== null && log2fcCut > 0 ? log2fcCut.toString() : null,
        conf: confCut !== null && confCut > 0 ? confCut.toString() : null
      };
      this.router.navigate([this.currentDataset()], {
        queryParams,
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    });
  }

  setPreset(preset: 'organ' | 'mutation' | 'protein' | 'treatment' | 'fraction' | 'knockout') {
    if (preset === 'organ') this.sortStack.set(['organ', 'protein', 'mutation', 'knockout', 'treatment']);
    else if (preset === 'mutation') this.sortStack.set(['mutation', 'treatment', 'organ', 'protein', 'knockout']);
    else if (preset === 'protein') this.sortStack.set(['protein', 'mutation', 'knockout', 'treatment', 'organ']);
    else if (preset === 'treatment') this.sortStack.set(['treatment', 'mutation', 'organ', 'protein', 'knockout']);
    else if (preset === 'knockout') this.sortStack.set(['knockout', 'mutation', 'treatment', 'organ', 'protein']);
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
    const sOrgans = this.selectedOrgans();
    const sProteins = this.selectedProteins();
    const sMutations = this.selectedMutations();
    const sKnockouts = this.selectedKnockouts();
    const sTreatments = this.selectedTreatments();
    const sFractions = this.selectedFractions();
    const sProjectIds = this.selectedProjectIds();
    const stack = this.sortStack();

    let filtered = projs.filter((p: ProjectMetadata) => {
      const projectMatch = sProjectIds.size === 0 || sProjectIds.has(p.projectId);
      const organMatch = sOrgans.size === 0 || sOrgans.has(p.organ);
      const proteinMatch = sProteins.size === 0 || sProteins.has(p.protein);
      const mutationMatch = sMutations.size === 0 || sMutations.has(p.mutation);
      const knockoutMatch = sKnockouts.size === 0 || sKnockouts.has(p.knockout);
      const treatmentMatch = sTreatments.size === 0 || sTreatments.has(p.treatment);
      const fractionMatch = sFractions.size === 0 || sFractions.has(p.fraction);
      return projectMatch && organMatch && proteinMatch && mutationMatch && knockoutMatch && treatmentMatch && fractionMatch;
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
      return a.date.localeCompare(b.date);
    });
  });

  gbaProjects = computed(() =>
    this.filteredProjects().filter(p => p.projectName.toUpperCase().includes('GBA'))
  );

  nonGbaProjects = computed(() =>
    this.filteredProjects().filter(p => !p.projectName.toUpperCase().includes('GBA'))
  );

  lrrk2Summary = computed(() => this.calculateHeatmapSummary(this.nonGbaProjects()));
  gbaSummary = computed(() => this.calculateHeatmapSummary(this.gbaProjects()));

  lrrk2RankData = computed(() => this.calculateRankData(this.nonGbaProjects()));
  gbaRankData = computed(() => this.calculateRankData(this.gbaProjects()));

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

  toggleFilter(type: 'organ' | 'protein' | 'mutation' | 'knockout' | 'treatment' | 'fraction' | 'project', value: string) {
    const map = {
      organ: this.selectedOrgans,
      protein: this.selectedProteins,
      mutation: this.selectedMutations,
      knockout: this.selectedKnockouts,
      treatment: this.selectedTreatments,
      fraction: this.selectedFractions,
      project: this.selectedProjectIds
    };
    const target = (map as any)[type];
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
    this.selectedOrgans.set(new Set());
    this.selectedProteins.set(new Set());
    this.selectedMutations.set(new Set());
    this.selectedKnockouts.set(new Set());
    this.selectedTreatments.set(new Set());
    this.selectedFractions.set(new Set());
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
    if (chip.type === 'project') {
      const p = this.projects().find(p => p.projectName === chip.value);
      if (p) this.toggleFilter('project', p.projectId);
    } else {
      this.toggleFilter(chip.type as any, chip.value);
    }
  }

  clearAllFilters() {
    this.selectedOrgans.set(new Set());
    this.selectedProteins.set(new Set());
    this.selectedMutations.set(new Set());
    this.selectedKnockouts.set(new Set());
    this.selectedTreatments.set(new Set());
    this.selectedFractions.set(new Set());
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
      this.selectedOrgans(),
      this.selectedProteins(),
      this.selectedMutations(),
      this.selectedKnockouts(),
      this.selectedTreatments(),
      this.selectedFractions(),
      this.sortStack(),
      this.flippedProjectIds()
    );

    this.presetName.set('');
    this.showPresetInput.set(false);
  }

  loadPreset(preset: FilterPreset) {
    this.selectedGeneIds.set(new Set(preset.geneIds));
    this.selectedOrgans.set(new Set(preset.organs));
    this.selectedProteins.set(new Set(preset.proteins));
    this.selectedMutations.set(new Set(preset.mutations));
    this.selectedKnockouts.set(new Set(preset.knockouts || []));
    this.selectedTreatments.set(new Set(preset.treatments || []));
    this.selectedFractions.set(new Set(preset.fractions || []));
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
