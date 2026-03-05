import { Component, OnInit, inject, signal, computed, effect, input } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { CurtainFilterComponent } from '../curtain-filter/curtain-filter';
import { HeatmapComponent } from '../heatmap/heatmap';
import { GeneData, ProjectMetadata } from '../models';

@Component({
  selector: 'app-explorer',
  standalone: true,
  imports: [FormsModule, DragDropModule, CurtainFilterComponent, HeatmapComponent, RouterLink],
  templateUrl: './explorer.html',
  styleUrl: './explorer.scss'
})
export class ExplorerComponent implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  dataset = input.required<'lysoip' | 'wcl'>();

  isLoading = signal(true);
  searchTerm = signal('');
  projects = signal<ProjectMetadata[]>([]);
  allGenes = signal<GeneData[]>([]);
  selectedGeneIds = signal<Set<string>>(new Set());
  
  selectedOrgans = signal<Set<string>>(new Set());
  selectedProteins = signal<Set<string>>(new Set());
  selectedMutations = signal<Set<string>>(new Set());

  sortStack = signal<('organ' | 'protein' | 'mutation')[]>(['organ', 'protein', 'mutation']);

  setPreset(preset: 'organ' | 'mutation' | 'protein') {
    if (preset === 'organ') this.sortStack.set(['organ', 'protein', 'mutation']);
    else if (preset === 'mutation') this.sortStack.set(['mutation', 'organ', 'protein']);
    else if (preset === 'protein') this.sortStack.set(['protein', 'mutation', 'organ']);
  }

  constructor() {    effect(() => {
      const ds = this.dataset();
      this.selectedOrgans.set(new Set());
      this.selectedProteins.set(new Set());
      this.selectedMutations.set(new Set());
      this.loadData(ds);
    });

    effect(() => {
      const queryParams = {
        genes: Array.from(this.selectedGeneIds()).join(',') || null,
        organs: Array.from(this.selectedOrgans()).join(',') || null,
        proteins: Array.from(this.selectedProteins()).join(',') || null,
        mutations: Array.from(this.selectedMutations()).join(',') || null,
        sort: this.sortStack().join(',')
      };
      this.router.navigate([this.dataset()], {
        queryParams,
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    });
  }

  loadData(type: 'lysoip' | 'wcl') {
    this.isLoading.set(true);
    const fileName = type === 'lysoip' 
      ? 'zzz-FinalDestination_LysoIP_summary_FORMATTED_ForFiltering_20240708.txt'
      : 'zzz-FinalDestination_WCL_summary_FORMATTED_Forfiltering_20240708.txt';

    this.http.get(fileName, { responseType: 'text' })
      .subscribe((content: string) => {
        this.parseData(content);
        
        const params = this.route.snapshot.queryParams;
        if (!params['genes'] && this.selectedGeneIds().size === 0) {
          const lrrk2 = this.allGenes().find((g: GeneData) => g.gene.toLowerCase() === 'lrrk2');
          if (lrrk2) {
            this.selectedGeneIds.set(new Set([lrrk2.uniprotId]));
          }
        }
        
        this.isLoading.set(false);
      });
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

  searchResults = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    if (term.length < 2) return [];
    return this.allGenes()
      .filter((g: GeneData) => g.searchString.includes(term))
      .slice(0, 10);
  });

  displayedGenes = computed(() => {
    const selected = this.selectedGeneIds();
    return this.allGenes().filter((g: GeneData) => selected.has(g.uniprotId));
  });

  filteredProjects = computed(() => {
    const projs = this.projects();
    const sOrgans = this.selectedOrgans();
    const sProteins = this.selectedProteins();
    const sMutations = this.selectedMutations();
    const stack = this.sortStack();

    let filtered = projs.filter((p: ProjectMetadata) => {
      const organMatch = sOrgans.size === 0 || sOrgans.has(p.organ);
      const proteinMatch = sProteins.size === 0 || sProteins.has(p.protein);
      const mutationMatch = sMutations.size === 0 || sMutations.has(p.mutation);
      return organMatch && proteinMatch && mutationMatch;
    });

    return [...filtered].sort((a: ProjectMetadata, b: ProjectMetadata) => {
      const organPriority: Record<string, number> = { 'mefs': 1, 'lung': 2, 'brain': 3, 'a549': 4 };
      const mutationPriority: Record<string, number> = {
        'r1441c (vs wt)': 1,
        'r1441c': 1,
        'r1441c + mli2': 2,
        'g2019s (vs wt)': 3,
        'g2019s': 3,
        'd620n (vs wt)': 4,
        'd620n': 4,
        'd620n + mli2': 5,
        'ko (vs wt)': 6,
        'ko': 6,
        'wt': 7
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
        
        if (cmp !== 0) return cmp;
      }
      return 0;
    });
  });

  toggleFilter(type: 'organ' | 'protein' | 'mutation', value: string) {
    const map = {
      organ: this.selectedOrgans,
      protein: this.selectedProteins,
      mutation: this.selectedMutations
    };
    const target = map[type];
    target.update((set: Set<string>) => {
      const newSet = new Set(set);
      if (newSet.has(value)) newSet.delete(value);
      else newSet.add(value);
      return newSet;
    });
  }

  drop(event: CdkDragDrop<string[]>) {
    this.sortStack.update((stack: ('organ' | 'protein' | 'mutation')[]) => {
      const newStack = [...stack];
      moveItemInArray(newStack, event.previousIndex, event.currentIndex);
      return newStack;
    });
  }

  copyUrl() {
    navigator.clipboard.writeText(window.location.href);
  }

  clearAllProteins() {
    this.selectedGeneIds.set(new Set());
  }

  resetToDefault() {
    this.selectedOrgans.set(new Set());
    this.selectedProteins.set(new Set());
    this.selectedMutations.set(new Set());
    this.sortStack.set(['organ', 'protein', 'mutation']);
    this.searchTerm.set('');
    
    const lrrk2 = this.allGenes().find((g: GeneData) => g.gene.toLowerCase() === 'lrrk2');
    if (lrrk2) {
      this.selectedGeneIds.set(new Set([lrrk2.uniprotId]));
    } else {
      this.selectedGeneIds.set(new Set());
    }
  }

  ngOnInit() {
    this.initializeFromUrl();
  }

  private initializeFromUrl() {
    const params = this.route.snapshot.queryParams;
    if (params['genes']) {
      this.selectedGeneIds.set(new Set(params['genes'].split(',')));
    } else {
      const lrrk2 = this.allGenes().find((g: GeneData) => g.gene.toLowerCase() === 'lrrk2');
      if (lrrk2) this.selectedGeneIds.set(new Set([lrrk2.uniprotId]));
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
  }

  removeGene(uniprotId: string) {
    this.selectedGeneIds.update((set: Set<string>) => {
      const newSet = new Set(set);
      newSet.delete(uniprotId);
      return newSet;
    });
  }

  parseData(content: string) {
    const rows = this.parseTSV(content);
    if (rows.length < 3) return;

    const row1 = rows[0];
    const row2 = rows[1];

    const projects: ProjectMetadata[] = [];
    for (let i = 6; i < row1.length; i += 3) {
      const projectId = row1[i];
      let fullProjectName = (row2[i] || '').trim();
      if (!projectId && !fullProjectName) continue;

      let projectName = fullProjectName.replace(/^\d{8}[_0-9]*\s*/, '');
      projectName = projectName.replace(/\n/g, ' ');

      let organ = 'Other';
      if (projectName.toLowerCase().includes('brain')) organ = 'Brain';
      else if (projectName.toLowerCase().includes('lung')) organ = 'Lung';
      else if (projectName.toLowerCase().includes('mefs')) organ = 'MEFs';
      else if (projectName.toLowerCase().includes('a549')) organ = 'A549';

      let protein = 'Other';
      if (projectName.toLowerCase().includes('vps35')) protein = 'VPS35';
      else if (projectName.toLowerCase().includes('lrrk2')) protein = 'LRRK2';
      else if (projectName.toLowerCase().includes('gba')) protein = 'GBA';

      let mutation = 'Other';
      const mutMatch = projectName.match(/(D620N|R1441C|G2019S|KO|D409V|E326K|L444P|N370S)/i);
      if (mutMatch) {
        mutation = mutMatch[0].toUpperCase();
      }
      
      const isMLi2 = projectName.toLowerCase().includes('mli2');
      if (isMLi2) {
        mutation = mutation === 'Other' ? 'MLi2' : mutation + ' + MLi2';
      }

      if (projectName.toLowerCase().includes('wt')) {
        if (mutation === 'Other') mutation = 'WT';
        else if (!isMLi2) mutation = mutation + ' (vs WT)';
      }

      projects.push({
        projectId: (projectId || '').trim(),
        projectName,
        log2fcIndex: i + 1,
        organ,
        protein,
        mutation
      });
    }

    const genes: GeneData[] = [];
    for (let i = 3; i < rows.length; i++) {
      const r = rows[i];
      if (r.length < 2) continue;
      const uniprotId = (r[0] || '').trim();
      const gene = (r[1] || '').trim();
      if (!uniprotId && !gene) continue;

      const log2fcs = projects.map((p: ProjectMetadata) => {
        const valStr = r[p.log2fcIndex];
        const val = parseFloat(valStr);
        return isNaN(val) ? null : val;
      });

      genes.push({
        uniprotId,
        gene,
        log2fcs,
        searchString: `${uniprotId} ${gene}`.toLowerCase()
      });
    }

    this.projects.set(projects);
    this.allGenes.set(genes);
  }

  parseTSV(content: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === '\t' && !inQuotes) {
        currentRow.push(currentCell);
        currentCell = '';
      } else if (char === '\n' && !inQuotes) {
        if (currentCell.endsWith('\r')) {
          currentCell = currentCell.slice(0, -1);
        }
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }

    if (currentCell || currentRow.length > 0) {
      currentRow.push(currentCell);
      rows.push(currentRow);
    }

    return rows;
  }
}
