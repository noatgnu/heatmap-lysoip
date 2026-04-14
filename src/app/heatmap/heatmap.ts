import { Component, input, computed, signal, effect, untracked, ElementRef, viewChild, output, HostListener, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { PlotlyModule } from 'angular-plotly.js';
import { GeneData, ProjectMetadata } from '../models';

@Component({
  selector: 'app-heatmap',
  standalone: true,
  imports: [PlotlyModule, FormsModule, DragDropModule],
  templateUrl: './heatmap.html',
  styleUrl: './heatmap.scss'
})
export class HeatmapComponent {
  private el = inject(ElementRef);

  genes = input.required<GeneData[]>();
  projects = input.required<ProjectMetadata[]>();
  allProjects = input.required<ProjectMetadata[]>();
  tabTitle = input<string>('');
  flippedProjectIds = input<Set<string>>(new Set());
  selectedGeneIds = input<Set<string>>(new Set());
  summaryDisplayMode = input<'number' | 'proportion'>('proportion');
  isSwapped = input<boolean>(false);
  labelIncrease = input<string>('Increase activity');
  labelDecrease = input<string>('Decrease activity');
  log2fcCutoff = input<number | null>(null);
  confidenceCutoff = input<number | null>(null);
  maskSubThreshold = input<boolean>(true);

  geneHovered = output<string | null>();
  geneSelected = output<string>();
  exportRequested = output<{ scope: 'all' | 'highlighted', format: 'csv' | 'tsv' }>();

  plotContainer = viewChild<ElementRef<HTMLElement>>('plotContainer');
  topScrollContainer = viewChild<ElementRef<HTMLElement>>('topScrollContainer');

  revision = signal(0);
  isSticky = signal(false);
  stickyWidth = signal(0);
  stickyLeft = signal(0);
  toolbarOffset = signal(64);

  manualGeneOrder = signal<string[]>([]);
  showOrderModal = signal(false);
  bulkOrderText = signal('');
  selectedSortProjectId = signal<string>('');

  orderedGenes = computed(() => {
    const currentGenes = this.genes();
    const order = this.manualGeneOrder();
    if (order.length === 0) return currentGenes;
    const orderMap = new Map(order.map((id, index) => [id, index]));
    return [...currentGenes].sort((a, b) => {
      const idxA = orderMap.has(a.uniprotId) ? orderMap.get(a.uniprotId)! : 1000000;
      const idxB = orderMap.has(b.uniprotId) ? orderMap.get(b.uniprotId)! : 1000000;
      return idxA - idxB;
    });
  });

  orderByExperiment(projectId: string, direction: 'asc' | 'desc') {
    const allProjs = this.allProjects();
    const projIdx = allProjs.findIndex(p => p.projectId === projectId);
    if (projIdx === -1) return;

    const flippedIds = this.flippedProjectIds();
    const isFlipped = flippedIds.has(projectId);

    const sortedGenes = [...this.genes()].sort((a, b) => {
      let valA = a.log2fcs[projIdx];
      let valB = b.log2fcs[projIdx];

      if (valA !== null && isFlipped) valA *= -1;
      if (valB !== null && isFlipped) valB *= -1;

      // Nulls go to the end
      if (valA === null && valB === null) return 0;
      if (valA === null) return 1;
      if (valB === null) return -1;

      return direction === 'asc' ? valA - valB : valB - valA;
    });

    this.manualGeneOrder.set(sortedGenes.map(g => g.uniprotId));
  }

  @HostListener('window:scroll', [])
  onWindowScroll() {
    const rect = this.el.nativeElement.getBoundingClientRect();
    const shouldBeSticky = rect.top < 0 && rect.bottom > 150;
    
    if (rect.top < 0) {
      const offset = Math.min(Math.abs(rect.top) + 80, rect.height - 180);
      this.toolbarOffset.set(offset);
    } else {
      this.toolbarOffset.set(64);
    }

    if (shouldBeSticky !== this.isSticky() || shouldBeSticky) {
      this.isSticky.set(shouldBeSticky);
      this.stickyWidth.set(this.el.nativeElement.offsetWidth);
      this.stickyLeft.set(rect.left);
    }
  }

  @HostListener('window:resize', [])
  onWindowResize() {
    const rect = this.el.nativeElement.getBoundingClientRect();
    this.stickyWidth.set(this.el.nativeElement.offsetWidth);
    this.stickyLeft.set(rect.left);
  }

  getPlotElement(): HTMLElement | null {
    return this.plotContainer()?.nativeElement ?? null;
  }

  graphConfig = computed(() => ({
    displaylogo: false,
    displayModeBar: false,
    responsive: true,
    toImageButtonOptions: {
      format: 'svg',
      filename: 'heatmap_export',
      height: this.graphData().layout.height,
      width: this.graphData().layout.width,
      scale: 1
    }
  }));

  downloadSvg() {
    const plotly = (window as any).Plotly;
    const element = this.getPlotElement()?.querySelector('.js-plotly-plot');
    if (plotly && element) {
      plotly.downloadImage(element, {
        format: 'svg',
        width: this.graphData().layout.width,
        height: this.graphData().layout.height,
        filename: 'heatmap_export'
      });
    }
  }

  zoomIn() {
    this.updateZoom(0.8);
  }

  zoomOut() {
    this.updateZoom(1.2);
  }

  private updateZoom(factor: number) {
    const plotly = (window as any).Plotly;
    const element = this.getPlotElement()?.querySelector('.js-plotly-plot');
    if (!plotly || !element) return;

    const layout = (element as any).layout;
    const xRange = layout.xaxis.range;
    const yRange = layout.yaxis.range;

    if (xRange && yRange) {
      const xCenter = (xRange[0] + xRange[1]) / 2;
      const xSpan = (xRange[1] - xRange[0]) * factor;
      const yCenter = (yRange[0] + yRange[1]) / 2;
      const ySpan = (yRange[1] - yRange[0]) * factor;

      plotly.relayout(element, {
        'xaxis.range': [xCenter - xSpan / 2, xCenter + xSpan / 2],
        'yaxis.range': [yCenter - ySpan / 2, yCenter + ySpan / 2]
      });
    }
  }

  resetZoom() {
    const plotly = (window as any).Plotly;
    const element = this.getPlotElement()?.querySelector('.js-plotly-plot');
    if (plotly && element) {
      plotly.relayout(element, {
        'xaxis.autorange': true,
        'yaxis.autorange': true
      });
    }
  }

  private isSyncing = false;
  onTopScroll() {
    if (this.isSyncing) return;
    const top = this.topScrollContainer()?.nativeElement;
    const main = this.plotContainer()?.nativeElement;
    if (top && main) {
      this.isSyncing = true;
      main.scrollLeft = top.scrollLeft;
      requestAnimationFrame(() => this.isSyncing = false);
    }
  }

  onMainScroll() {
    if (this.isSyncing) return;
    const top = this.topScrollContainer()?.nativeElement;
    const main = this.plotContainer()?.nativeElement;
    if (top && main) {
      this.isSyncing = true;
      top.scrollLeft = main.scrollLeft;
      requestAnimationFrame(() => this.isSyncing = false);
    }
  }

  onHover(event: any) {
    if (event?.points?.[0]) {
      const p = event.points[0];
      const genes = this.orderedGenes();
      const swapped = this.isSwapped();
      let geneIdx = -1;
      
      if (swapped) {
        geneIdx = p.x !== undefined ? (p.x as number) : -1;
      } else {
        geneIdx = p.y !== undefined ? (p.y as number) : -1;
      }

      if (genes[geneIdx]) {
        this.geneHovered.emit(genes[geneIdx].uniprotId);
      }
    }
  }

  onUnhover() {
    this.geneHovered.emit(null);
  }

  onClick(event: any) {
    if (event?.points?.[0]) {
      const p = event.points[0];
      const genes = this.orderedGenes();
      const swapped = this.isSwapped();
      let geneIdx = -1;
      
      if (swapped) {
        geneIdx = p.x !== undefined ? (p.x as number) : -1;
      } else {
        geneIdx = p.y !== undefined ? (p.y as number) : -1;
      }

      if (genes[geneIdx]) {
        this.geneSelected.emit(genes[geneIdx].uniprotId);
      }
    }
  }

  constructor() {
    effect(() => {
      this.graphData();
      untracked(() => this.revision.update(r => r + 1));
    });
  }

  graphData = computed(() => {
    const genes = this.orderedGenes();
    const projs = this.projects();
    const allProjs = this.allProjects();
    const swapped = this.isSwapped();
    const flippedIds = this.flippedProjectIds();
    const log2fcCut = this.log2fcCutoff();
    const confCut = this.confidenceCutoff();
    const shouldMask = this.maskSubThreshold();

    if (genes.length === 0 || projs.length === 0) return { data: [], layout: { height: 600, width: 800 } };

    const projIndices = projs.map((p: ProjectMetadata) => allProjs.indexOf(p));
    const geneCoords = genes.map((_, i) => i);
    const geneLabels = genes.map((g: GeneData) => `<${g.uniprotId}><${g.gene}>`);
    const projCoords = projs.map((_, i) => i);
    const projLabels = projs.map((p: ProjectMetadata) => p.projectName);

    let xCoords, yCoords, xLabels, yLabels, z, customdata;

    if (!swapped) {
      xLabels = projLabels;
      yLabels = geneLabels;
      xCoords = projCoords;
      yCoords = geneCoords;
      z = genes.map((g: GeneData) =>
        projs.map((p: ProjectMetadata, projIdx: number) => {
          const allProjIdx = projIndices[projIdx];
          let val = g.log2fcs[allProjIdx];
          const conf = g.confidences[allProjIdx];
          
          if (val !== null) {
            const passesLog2fc = log2fcCut === null || log2fcCut <= 0 || Math.abs(val) >= log2fcCut;
            const passesConf = confCut === null || confCut <= 0 || (conf !== null && conf >= confCut);
            if (shouldMask && (!passesLog2fc || !passesConf)) return null;
            if (flippedIds.has(p.projectId)) val *= -1;
          }
          return val;
        })
      );
      customdata = genes.map((g: GeneData) =>
        projs.map((_, projIdx: number) => {
          const allProjIdx = projIndices[projIdx];
          return {
            conf: g.confidences[allProjIdx],
            gene: g.gene,
            proj: projs[projIdx].projectName,
            rawLog2fc: g.log2fcs[allProjIdx]
          };
        })
      );
    } else {
      xLabels = geneLabels;
      yLabels = projLabels;
      xCoords = geneCoords;
      yCoords = projCoords;
      z = projs.map((p: ProjectMetadata, projIdx: number) =>
        genes.map((g: GeneData) => {
          const allProjIdx = projIndices[projIdx];
          let val = g.log2fcs[allProjIdx];
          const conf = g.confidences[allProjIdx];

          if (val !== null) {
            const passesLog2fc = log2fcCut === null || log2fcCut <= 0 || Math.abs(val) >= log2fcCut;
            const passesConf = confCut === null || confCut <= 0 || (conf !== null && conf >= confCut);
            if (!passesLog2fc || !passesConf) return null;
            if (flippedIds.has(p.projectId)) val *= -1;
          }
          return val;
        })
      );
      customdata = projs.map((_, projIdx: number) =>
        genes.map((g: GeneData) => {
          const allProjIdx = projIndices[projIdx];
          return {
            conf: g.confidences[allProjIdx],
            gene: g.gene,
            proj: projs[projIdx].projectName,
            rawLog2fc: g.log2fcs[allProjIdx]
          };
        })
      );
    }

    const perGeneSummary = genes.map((g: GeneData) => {
      let increase = 0;
      let decrease = 0;
      let total = 0;
      projIndices.forEach((allProjIdx, projIdx) => {
        let val = g.log2fcs[allProjIdx];
        if (val !== null) {
          total++;
          const projId = projs[projIdx].projectId;
          if (flippedIds.has(projId)) {
            val *= -1;
          }
          if (val > 0) increase++;
          else if (val < 0) decrease++;
        }
      });
      return { increase, decrease, total };
    });

    let maxAbs = 0;
    z.forEach((row: (number | null)[]) => row.forEach((val: number | null) => {
      if (val !== null) {
        const absVal = Math.abs(val);
        if (absVal > maxAbs) maxAbs = absVal;
      }
    }));
    if (maxAbs === 0) maxAbs = 1;

    const cellSize = swapped ? 30 : 25;
    const maxProjNameLen = Math.max(...projLabels.map(n => n.length));
    const maxGeneNameLen = Math.max(...geneLabels.map(n => n.length));

    let leftMargin, topMargin, bottomMargin, rightMargin;
    if (!swapped) {
      leftMargin = Math.max(250, maxGeneNameLen * 8 + 20);
      topMargin = Math.max(200, maxProjNameLen * 8 + 20);
      bottomMargin = 100;
      rightMargin = 120;
    } else {
      leftMargin = Math.max(400, maxProjNameLen * 9 + 80);
      topMargin = 200;
      bottomMargin = 200;
      rightMargin = 50;
    }

    const plotWidth = xCoords.length * cellSize;
    const plotHeight = yCoords.length * cellSize;
    const width = plotWidth + leftMargin + rightMargin;
    const height = plotHeight + topMargin + bottomMargin;

    const colorbarXStart = 0.5 - (120 / width);
    const colorbarXEnd = 0.5 + (120 / width);

    const annotations: any[] = [
      {
        x: colorbarXStart,
        y: 0,
        yshift: !swapped ? -65 : -155,
        xshift: -10,
        xref: 'paper',
        yref: 'paper',
        xanchor: 'right',
        text: this.labelDecrease(),
        showarrow: false,
        font: { size: 10, color: 'rgb(5, 48, 97)' }
      },
      {
        x: colorbarXEnd,
        y: 0,
        yshift: !swapped ? -65 : -155,
        xshift: 10,
        xref: 'paper',
        yref: 'paper',
        xanchor: 'left',
        text: this.labelIncrease(),
        showarrow: false,
        font: { size: 10, color: 'rgb(103, 0, 31)' }
      }
    ];

    perGeneSummary.forEach((s, i) => {
      let upText = `↑${s.increase}`;
      let downText = `↓${s.decrease}`;
      if (this.summaryDisplayMode() === 'proportion' && s.total > 0) {
        upText = `↑${Math.round((s.increase / s.total) * 100)}%`;
        downText = `↓${Math.round((s.decrease / s.total) * 100)}%`;
      }
      
      if (!swapped) {
        annotations.push({
          x: 1,
          y: yCoords[i],
          xshift: 10,
          xref: 'paper',
          yref: 'y',
          text: upText,
          showarrow: false,
          font: { size: 9, color: 'rgb(103, 0, 31)' },
          xanchor: 'left'
        });
        annotations.push({
          x: 1,
          y: yCoords[i],
          xshift: 45,
          xref: 'paper',
          yref: 'y',
          text: downText,
          showarrow: false,
          font: { size: 9, color: 'rgb(5, 48, 97)' },
          xanchor: 'left'
        });
      } else {
        const isStaggered = i % 2 !== 0;
        const staggerOffset = isStaggered ? -40 : 0;
        annotations.push({
          x: xCoords[i],
          y: 0,
          yshift: -12 + staggerOffset,
          xref: 'x',
          yref: 'paper',
          text: upText,
          showarrow: false,
          font: { size: 8, color: 'rgb(103, 0, 31)' },
          yanchor: 'top'
        });
        annotations.push({
          x: xCoords[i],
          y: 0,
          yshift: -24 + staggerOffset,
          xref: 'x',
          yref: 'paper',
          text: downText,
          showarrow: false,
          font: { size: 8, color: 'rgb(5, 48, 97)' },
          yanchor: 'top'
        });
      }
    });

    const shapes: any[] = [];
    const selected = this.selectedGeneIds();
    genes.forEach((g, i) => {
      if (selected.has(g.uniprotId)) {
        if (!swapped) {
          shapes.push({
            type: 'rect',
            xref: 'paper',
            yref: 'y',
            x0: -0.02,
            x1: 0,
            y0: yCoords[i] - 0.5,
            y1: yCoords[i] + 0.5,
            fillcolor: 'rgba(79, 70, 229, 0.6)',
            line: { width: 0 }
          });
        } else {
          shapes.push({
            type: 'rect',
            xref: 'x',
            yref: 'paper',
            x0: xCoords[i] - 0.5,
            x1: xCoords[i] + 0.5,
            y0: 1,
            y1: 1.02,
            fillcolor: 'rgba(79, 70, 229, 0.6)',
            line: { width: 0 }
          });
        }
      }
    });

    return {
      data: [
        {
          z: z,
          x: xCoords,
          y: yCoords,
          customdata: customdata,
          hovertemplate:
            '<b>Protein:</b> %{customdata.gene}<br>' +
            '<b>Experiment:</b> %{customdata.proj}<br>' +
            '<b>Log2FC:</b> %{customdata.rawLog2fc:.3f}<br>' +
            '<b>Confidence:</b> %{customdata.conf:.3f}<extra></extra>',
          type: 'heatmap',
          hoverongaps: false,
          colorscale: [
            [0, 'rgb(5, 48, 97)'],
            [0.25, 'rgb(67, 147, 195)'],
            [0.5, 'rgb(255, 255, 255)'],
            [0.75, 'rgb(214, 96, 77)'],
            [1, 'rgb(103, 0, 31)']
          ],
          zmin: -maxAbs,
          zmax: maxAbs,
          zauto: false,
          xgap: 1,
          ygap: 1,
          colorbar: {
            title: '',
            orientation: 'h',
            lenmode: 'pixels',
            len: 200,
            thicknessmode: 'pixels',
            thickness: 12,
            xanchor: 'center',
            x: 0.5,
            yanchor: 'top',
            y: 0,
            ypad: !swapped ? 20 : 100,
            tickvals: [-maxAbs, 0, maxAbs],
            ticktext: [(-maxAbs).toFixed(1), '0', maxAbs.toFixed(1)],
            tickfont: { size: 9 }
          }
        }
      ],
      layout: {
        title: '',
        margin: { l: leftMargin, b: bottomMargin, t: topMargin, r: rightMargin },
        xaxis: {
          tickangle: 90,
          side: 'top',
          fixedrange: false,
          zeroline: false,
          showgrid: false,
          constrain: 'domain',
          scaleanchor: 'y',
          scaleratio: 1,
          tickvals: xCoords,
          ticktext: xLabels,
          dtick: 1
        },
        yaxis: {
          autorange: 'reversed',
          fixedrange: false,
          scaleanchor: 'x',
          scaleratio: 1,
          zeroline: false,
          showgrid: false,
          constrain: 'domain',
          tickvals: yCoords,
          ticktext: yLabels,
          dtick: 1
        },
        shapes: shapes,
        annotations: annotations,
        plot_bgcolor: '#ccc',
        paper_bgcolor: 'white',
        width: width,
        height: height
      }
    };
  });

  toggleOrderModal() {
    this.showOrderModal.update(v => !v);
    if (this.showOrderModal()) {
      this.bulkOrderText.set(this.orderedGenes().map(g => g.gene).join('\n'));
    }
  }

  dropGene(event: CdkDragDrop<GeneData[]>) {
    const current = [...this.orderedGenes()];
    moveItemInArray(current, event.previousIndex, event.currentIndex);
    this.manualGeneOrder.set(current.map(g => g.uniprotId));
  }

  applyBulkOrder() {
    const lines = this.bulkOrderText().split(/[\n,]/).map(s => s.trim().toLowerCase()).filter(s => s);
    const allGenes = this.genes();
    const newOrderIds: string[] = [];
    lines.forEach(term => {
      const match = allGenes.find(g => g.gene.toLowerCase() === term || g.uniprotId.toLowerCase() === term);
      if (match && !newOrderIds.includes(match.uniprotId)) {
        newOrderIds.push(match.uniprotId);
      }
    });
    // Add remaining genes that weren't in the bulk list
    allGenes.forEach(g => {
      if (!newOrderIds.includes(g.uniprotId)) {
        newOrderIds.push(g.uniprotId);
      }
    });
    this.manualGeneOrder.set(newOrderIds);
    this.showOrderModal.set(false);
  }

  clearManualOrder() {
    this.manualGeneOrder.set([]);
    this.showOrderModal.set(false);
  }
}
