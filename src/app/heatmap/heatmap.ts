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
          [config]="graphConfig()"
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
  isSwapped = input<boolean>(false);

  geneHovered = output<string | null>();

  plotContainer = viewChild<ElementRef<HTMLElement>>('plotContainer');

  revision = signal(0);

  getPlotElement(): HTMLElement | null {
    return this.plotContainer()?.nativeElement ?? null;
  }

  graphConfig = computed(() => ({
    displaylogo: false,
    responsive: true,
    toImageButtonOptions: {
      format: 'svg',
      filename: 'heatmap_export',
      height: this.graphData().layout.height,
      width: this.graphData().layout.width,
      scale: 1
    }
  }));

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

    let xCoords, yCoords, xLabels, yLabels, z;

    if (!swapped) {
      xLabels = projLabels;
      yLabels = geneLabels;
      xCoords = projCoords;
      yCoords = geneCoords;
      z = genes.map((g: GeneData) => 
        projs.map((_, projIdx: number) => g.log2fcs[projIndices[projIdx]])
      );
    } else {
      xLabels = geneLabels;
      yLabels = projLabels;
      xCoords = geneCoords;
      yCoords = projCoords;
      z = projs.map((_, projIdx: number) =>
        genes.map((g: GeneData) => g.log2fcs[projIndices[projIdx]])
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

    const cellSize = 25;
    const maxProjNameLen = Math.max(...projLabels.map(n => n.length));
    const maxGeneNameLen = Math.max(...geneLabels.map(n => n.length));

    let leftMargin, topMargin, bottomMargin, rightMargin;
    
    if (!swapped) {
      leftMargin = Math.max(250, maxGeneNameLen * 8 + 20);
      topMargin = Math.max(200, maxProjNameLen * 8 + 20);
      bottomMargin = 100;
      rightMargin = 50;
    } else {
      leftMargin = Math.max(400, maxProjNameLen * 9 + 80);
      topMargin = 200;
      bottomMargin = 140;
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
        yshift: !swapped ? -60 : -105,
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
        yshift: !swapped ? -60 : -105,
        xref: 'paper',
        yref: 'paper',
        xanchor: 'left',
        text: 'Increase activity',
        showarrow: false,
        font: { size: 10, color: 'rgb(103, 0, 31)' }
      }
    ];

    if (swapped) {
      perGeneSummary.forEach((s, i) => {
        let upText = `↑${s.increase}`;
        let downText = `↓${s.decrease}`;
        if (this.summaryDisplayMode() === 'proportion' && s.total > 0) {
          upText = `↑${Math.round((s.increase / s.total) * 100)}%`;
          downText = `↓${Math.round((s.decrease / s.total) * 100)}%`;
        }
        annotations.push({
          x: xCoords[i],
          y: 0,
          yshift: -15,
          xref: 'x',
          yref: 'paper',
          text: upText,
          showarrow: false,
          font: { size: 9, color: 'rgb(103, 0, 31)' },
          yanchor: 'top'
        });
        annotations.push({
          x: xCoords[i],
          y: 0,
          yshift: -30,
          xref: 'x',
          yref: 'paper',
          text: downText,
          showarrow: false,
          font: { size: 9, color: 'rgb(5, 48, 97)' },
          yanchor: 'top'
        });
      });
    }

    return {
      data: [
        {
          z: z,
          x: xCoords,
          y: yCoords,
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
            ypad: !swapped ? 20 : 55,
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
        annotations: annotations,
        plot_bgcolor: '#ccc',
        paper_bgcolor: 'white',
        width: width,
        height: height
      }
    };
  });
}
