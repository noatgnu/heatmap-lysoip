import { Component, input, computed, signal, effect, untracked, ElementRef, viewChild, output, HostListener, inject } from '@angular/core';
import { PlotlyModule } from 'angular-plotly.js';
import { GeneData, ProjectMetadata } from '../models';

@Component({
  selector: 'app-heatmap',
  standalone: true,
  imports: [PlotlyModule],
  template: `
    <div class="w-full bg-white relative group">
      <!-- Floating Custom Toolbar -->
      <div 
        class="absolute right-4 top-16 z-[110] flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
      >
        <div class="bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg shadow-lg p-1.5 flex flex-col gap-1">
          <button (click)="zoomIn()" title="Zoom In" class="p-1.5 hover:bg-indigo-50 text-gray-600 hover:text-indigo-600 rounded transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"/></svg>
          </button>
          <button (click)="zoomOut()" title="Zoom Out" class="p-1.5 hover:bg-indigo-50 text-gray-600 hover:text-indigo-600 rounded transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7"/></svg>
          </button>
          <div class="h-px bg-gray-100 mx-1"></div>
          <button (click)="resetZoom()" title="Reset View" class="p-1.5 hover:bg-indigo-50 text-gray-600 hover:text-indigo-600 rounded transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          </button>
          <button (click)="downloadSvg()" title="Download SVG" class="p-1.5 hover:bg-indigo-50 text-gray-600 hover:text-indigo-600 rounded transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
          </button>
        </div>
      </div>

      <div
        #topScrollContainer
        [style.position]="isSticky() ? 'fixed' : 'relative'"
        [style.top]="isSticky() ? '0' : '0'"
        [style.width.px]="isSticky() ? stickyWidth() : null"
        [style.z-index]="isSticky() ? 100 : 10"
        [style.left.px]="isSticky() ? stickyLeft() : null"
        class="overflow-x-auto overflow-y-hidden bg-gray-100 border-b border-gray-200 top-scrollbar"
        style="height: 14px;"
        (scroll)="onTopScroll()"
      >
        <div [style.width.px]="graphData().layout.width" style="height: 1px;"></div>
      </div>

      <div
        #plotContainer
        class="w-full overflow-x-auto overflow-y-auto text-center main-plot-area"
        (scroll)="onMainScroll()"
      >
        <div class="inline-block" [style.width.px]="graphData().layout.width">
          @if (genes().length > 0 && projects().length > 0) {
            <plotly-plot
              [data]="graphData().data"
              [layout]="graphData().layout"
              [config]="graphConfig()"
              [revision]="revision()"
              [useResizeHandler]="true"
              [style]="{display: 'inline-block', width: graphData().layout.width + 'px', height: (graphData().layout.height || 600) + 'px'}"
              (hover)="onHover($event)"
              (unhover)="onUnhover()"
              (plotlyClick)="onClick($event)"
            ></plotly-plot>
          } @else {
            <div class="flex flex-col justify-center items-center h-[400px] text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2-0 00-2-2H5a2 2-0 00-2 2v6a2 2(0 002 2h2a2 2-0 002-2m0 0V5a2 2-0 012-2h2a2 2-0 012 2v10m-6 0a2 2-0 002 2h2a2 2-0 002-2m0 0V5a2 2-0 012-2h2a2 2-0 012 2v14a2 2-0 01-2 2h-2a2 2-0 01-2-2z" />
              </svg>
              <span>No data available for the current selection.</span>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .top-scrollbar::-webkit-scrollbar {
      height: 10px;
    }
    .top-scrollbar::-webkit-scrollbar-track {
      background: #f1f1f1;
    }
    .top-scrollbar::-webkit-scrollbar-thumb {
      background: #bbb;
      border-radius: 5px;
    }
    .top-scrollbar::-webkit-scrollbar-thumb:hover {
      background: #999;
    }
  `]
})
export class HeatmapComponent {
  private el = inject(ElementRef);

  genes = input.required<GeneData[]>();
  projects = input.required<ProjectMetadata[]>();
  allProjects = input.required<ProjectMetadata[]>();
  selectedGeneIds = input<Set<string>>(new Set());
  summaryDisplayMode = input<'number' | 'proportion'>('proportion');
  isSwapped = input<boolean>(false);

  geneHovered = output<string | null>();
  geneSelected = output<string>();

  plotContainer = viewChild<ElementRef<HTMLElement>>('plotContainer');
  topScrollContainer = viewChild<ElementRef<HTMLElement>>('topScrollContainer');

  revision = signal(0);
  isSticky = signal(false);
  stickyWidth = signal(0);
  stickyLeft = signal(0);

  @HostListener('window:scroll', [])
  onWindowScroll() {
    const rect = this.el.nativeElement.getBoundingClientRect();
    const shouldBeSticky = rect.top < 0 && rect.bottom > 150;

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
      const genes = this.genes();
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
      const genes = this.genes();
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
    const genes = this.genes();
    const projs = this.projects();
    const allProjs = this.allProjects();
    const swapped = this.isSwapped();

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
        projs.map((_, projIdx: number) => g.log2fcs[projIndices[projIdx]])
      );
      customdata = genes.map((g: GeneData) =>
        projs.map((_, projIdx: number) => ({
          conf: g.confidences[projIndices[projIdx]],
          gene: g.gene,
          proj: projs[projIdx].projectName
        }))
      );
    } else {
      xLabels = geneLabels;
      yLabels = projLabels;
      xCoords = geneCoords;
      yCoords = projCoords;
      z = projs.map((_, projIdx: number) =>
        genes.map((g: GeneData) => g.log2fcs[projIndices[projIdx]])
      );
      customdata = projs.map((_, projIdx: number) =>
        genes.map((g: GeneData) => ({
          conf: g.confidences[projIndices[projIdx]],
          gene: g.gene,
          proj: projs[projIdx].projectName
        }))
      );
    }

    const perGeneSummary = genes.map((g: GeneData) => {
      let increase = 0;
      let decrease = 0;
      let total = 0;
      projIndices.forEach(projIdx => {
        const val = g.log2fcs[projIdx];
        if (val !== null) {
          total++;
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

    const colorbarXStart = 0.5 - (100 / width);
    const colorbarXEnd = 0.5 + (100 / width);

    const annotations: any[] = [
      {
        x: colorbarXStart,
        y: 0,
        yshift: !swapped ? -60 : -150,
        xref: 'paper',
        yref: 'paper',
        xanchor: 'right',
        text: 'Decrease activity',
        showarrow: false,
        font: { size: 10, color: 'rgb(5, 48, 97)' }
      },
      {
        x: colorbarXEnd,
        y: 0,
        yshift: !swapped ? -60 : -150,
        xref: 'paper',
        yref: 'paper',
        xanchor: 'left',
        text: 'Increase activity',
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
          // Highlight row on the left axis
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
          // Highlight column on the top axis
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
            '<b>Log2FC:</b> %{z:.3f}<br>' +
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
          autorange: !swapped ? true : 'reversed',
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
}
