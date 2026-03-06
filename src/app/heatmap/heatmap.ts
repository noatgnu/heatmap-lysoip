import { Component, input, computed, signal, effect, untracked, ElementRef, viewChild, output } from '@angular/core';
import { PlotlyModule } from 'angular-plotly.js';
import { GeneData, ProjectMetadata } from '../models';

@Component({
  selector: 'app-heatmap',
  standalone: true,
  imports: [PlotlyModule],
  template: `
    <div #plotContainer class="w-full overflow-x-auto overflow-y-auto max-h-[800px] border border-gray-200 rounded bg-white">
      @if (genes().length > 0 && projects().length > 0) {
        <plotly-plot
          [data]="graphData().data"
          [layout]="graphData().layout"
          [revision]="revision()"
          [useResizeHandler]="true"
          [style]="{position: 'relative', width: '100%', height: (graphData().layout.height || 800) + 'px'}"
          (hover)="onHover($event)"
          (unhover)="onUnhover()"
        ></plotly-plot>
      } @else {
        <div class="flex flex-col justify-center items-center h-[600px] text-gray-400">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span>No data available for the current selection.</span>
        </div>
      }
    </div>
  `
})
export class HeatmapComponent {
  genes = input.required<GeneData[]>();
  projects = input.required<ProjectMetadata[]>();
  allProjects = input.required<ProjectMetadata[]>();

  geneHovered = output<string | null>();

  plotContainer = viewChild<ElementRef<HTMLElement>>('plotContainer');

  revision = signal(0);

  getPlotElement(): HTMLElement | null {
    return this.plotContainer()?.nativeElement ?? null;
  }

  onHover(event: any) {
    if (event?.points?.[0]?.y) {
      const yLabel = event.points[0].y as string;
      const match = yLabel.match(/<([^>]+)>/);
      if (match) {
        this.geneHovered.emit(match[1]);
      }
    }
  }

  onUnhover() {
    this.geneHovered.emit(null);
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

    if (genes.length === 0 || projs.length === 0) return { data: [], layout: { height: 800 } };

    const projIndices = projs.map((p: ProjectMetadata) => allProjs.indexOf(p));
    const x = projs.map((p: ProjectMetadata) => p.projectName);
    const y = genes.map((g: GeneData) => `<${g.uniprotId}><${g.gene}>`);
    const z = genes.map((g: GeneData) => projIndices.map((idx: number) => g.log2fcs[idx]));

    let maxAbs = 0;
    z.forEach((row: (number | null)[]) => row.forEach((val: number | null) => {
      if (val !== null) {
        const absVal = Math.abs(val);
        if (absVal > maxAbs) maxAbs = absVal;
      }
    }));
    
    if (maxAbs === 0) maxAbs = 1;

    return {
      data: [
        {
          z: z,
          x: x,
          y: y,
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
            title: 'Log2 FC',
            lenmode: 'pixels',
            len: 300,
            thicknessmode: 'pixels',
            thickness: 20,
            yanchor: 'top',
            y: 1,
            xpad: 40
          }
        }
      ],
      layout: {
        title: 'Heatmap - Log2 FC',
        margin: { l: 200, b: 100, t: 400, r: 100 },
        xaxis: { 
          tickangle: 90, 
          side: 'top',
          fixedrange: false,
          zeroline: false,
          showgrid: false,
          constrain: 'domain'
        },
        yaxis: { 
          autorange: 'reversed',
          fixedrange: false,
          scaleanchor: 'x',
          scaleratio: 1,
          zeroline: false,
          showgrid: false,
          constrain: 'domain'
        },
        plot_bgcolor: '#ccc',
        paper_bgcolor: 'white',
        height: Math.max(800, genes.length * 25 + 450)
      }
    };
  });
}
