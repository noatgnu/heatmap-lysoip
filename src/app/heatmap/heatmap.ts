import { Component, input, computed, signal, effect, untracked, ElementRef, viewChild, output } from '@angular/core';
import { PlotlyModule } from 'angular-plotly.js';
import { GeneData, ProjectMetadata } from '../models';

@Component({
  selector: 'app-heatmap',
  standalone: true,
  imports: [PlotlyModule],
  template: `
    <div #plotContainer class="w-full overflow-x-auto overflow-y-auto border border-gray-200 rounded bg-white text-center">
      @if (genes().length > 0 && projects().length > 0) {
        <plotly-plot
          [data]="graphData().data"
          [layout]="graphData().layout"
          [revision]="revision()"
          [useResizeHandler]="true"
          [style]="{display: 'inline-block', width: graphData().layout.width + 'px', height: (graphData().layout.height || 600) + 'px'}"
          (hover)="onHover($event)"
          (unhover)="onUnhover()"
        ></plotly-plot>
      } @else {
        <div class="flex flex-col justify-center items-center h-[400px] text-gray-400">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2-0 00-2-2H5a2 2-0 00-2 2v6a2 2(0 002 2h2a2 2-0 002-2m0 0V5a2 2-0 012-2h2a2 2-0 012 2v14a2 2-0 01-2 2h-2a2 2-0 01-2-2z" />
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
  summaryDisplayMode = input<'number' | 'proportion'>('proportion');

  geneHovered = output<string | null>();

  plotContainer = viewChild<ElementRef<HTMLElement>>('plotContainer');

  revision = signal(0);

  getPlotElement(): HTMLElement | null {
    return this.plotContainer()?.nativeElement ?? null;
  }

  onHover(event: any) {
    if (event?.points?.[0]?.x !== undefined) {
      const idx = event.points[0].x as number;
      const genes = this.genes();
      if (genes[idx]) {
        this.geneHovered.emit(genes[idx].uniprotId);
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
    const displayMode = this.summaryDisplayMode();

    if (genes.length === 0 || projs.length === 0) return { data: [], layout: { height: 600, width: 800 } };

    const projIndices = projs.map((p: ProjectMetadata) => allProjs.indexOf(p));

    const xCoords = genes.map((_, i) => i);
    const xLabels = genes.map((g: GeneData) => `<${g.uniprotId}><${g.gene}>`);
    const y = projs.map((p: ProjectMetadata) => p.projectName);

    const z = projs.map((_p: ProjectMetadata, projIdx: number) =>
      genes.map((g: GeneData) => g.log2fcs[projIndices[projIdx]])
    );

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

    const maxProjectNameLength = Math.max(...y.map(name => name.length));
    const leftMargin = Math.max(400, maxProjectNameLength * 9 + 80);
    const topMargin = 200;
    const bottomMargin = 140;
    const rightMargin = 50;

    const cellSize = 25;
    const plotWidth = genes.length * cellSize;
    const plotHeight = projs.length * cellSize;

    const width = plotWidth + leftMargin + rightMargin;
    const height = plotHeight + topMargin + bottomMargin;

    return {
      data: [
        {
          z: z,
          x: xCoords,
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
            ypad: 55,
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
          type: 'category',
          dtick: 1
        },
        annotations: [
          {
            x: 0.25,
            y: 0,
            yshift: -115,
            xref: 'paper',
            yref: 'paper',
            text: 'Decrease activity',
            showarrow: false,
            font: { size: 10, color: 'rgb(5, 48, 97)' }
          },
          {
            x: 0.75,
            y: 0,
            yshift: -115,
            xref: 'paper',
            yref: 'paper',
            text: 'Increase activity',
            showarrow: false,
            font: { size: 10, color: 'rgb(103, 0, 31)' }
          },
          ...perGeneSummary.flatMap((s, i) => {
            let upText = `↑${s.increase}`;
            let downText = `↓${s.decrease}`;
            if (this.summaryDisplayMode() === 'proportion' && s.total > 0) {
              upText = `↑${Math.round((s.increase / s.total) * 100)}%`;
              downText = `↓${Math.round((s.decrease / s.total) * 100)}%`;
            }
            return [
              {
                x: xCoords[i],
                y: 0,
                yshift: -15,
                xref: 'x',
                yref: 'paper',
                text: upText,
                showarrow: false,
                font: { size: 9, color: 'rgb(103, 0, 31)' },
                yanchor: 'top'
              },
              {
                x: xCoords[i],
                y: 0,
                yshift: -30,
                xref: 'x',
                yref: 'paper',
                text: downText,
                showarrow: false,
                font: { size: 9, color: 'rgb(5, 48, 97)' },
                yanchor: 'top'
              }
            ];
          })
        ],
        plot_bgcolor: '#ccc',
        paper_bgcolor: 'white',
        width: width,
        height: height
      }
    };
  });
}
