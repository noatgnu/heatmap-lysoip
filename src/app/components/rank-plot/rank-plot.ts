import { Component, input, computed, signal, output } from '@angular/core';
import { PlotlyModule } from 'angular-plotly.js';
import { RankItem } from '../../models';

@Component({
  selector: 'app-rank-plot',
  standalone: true,
  imports: [PlotlyModule],
  templateUrl: './rank-plot.html',
  styleUrl: './rank-plot.scss'
})
export class RankPlotComponent {
  data = input.required<RankItem[]>();
  selectedGeneIds = input<Set<string>>(new Set());
  title = input<string>('Protein Rank Plot');
  uiRevision = input<any>(0);
  
  genesSelected = output<string[]>();

  currentXRange = signal<any>(null);
  currentYRange = signal<any>(null);

  graphConfig = {
    displaylogo: false,
    responsive: true,
    toImageButtonOptions: {
      format: 'svg',
      filename: 'rank_plot',
      height: 600,
      width: 800,
      scale: 1
    }
  };

  graphData = computed(() => {
    const rawData = this.data();
    const selected = this.selectedGeneIds();
    if (rawData.length === 0) return { data: [], layout: {} };

    const sorted = [...rawData].sort((a, b) => b.score - a.score);
    
    const selectedTraces = sorted.filter(d => selected.has(d.uniprotId));
    const unselectedTraces = sorted.filter(d => !selected.has(d.uniprotId));

    const createTraceData = (data: RankItem[], isSelected: boolean) => {
      const x = data.map(d => sorted.indexOf(d) + 1);
      const y = data.map(d => d.score);
      const ids = data.map(d => d.uniprotId);
      const text = data.map(d => `${d.uniprotId} | ${d.gene}<br>Score: ${d.score.toFixed(2)}<br>Inc: ${d.increase}, Dec: ${d.decrease}, Total: ${d.total}`);
      const colors = y.map(val => val >= 0 ? 'rgb(103, 0, 31)' : 'rgb(5, 48, 97)');
      
      return {
        x: x,
        y: y,
        text: text,
        customdata: ids,
        name: isSelected ? 'Selected Proteins' : 'Unselected Proteins',
        mode: 'markers',
        type: 'scatter',
        hoverinfo: 'text',
        showlegend: true,
        marker: {
          color: colors,
          size: isSelected ? 12 : 6,
          symbol: isSelected ? 'diamond' : 'circle',
          opacity: isSelected ? 1.0 : 0.5,
          line: {
            color: '#000',
            width: isSelected ? 2 : 0
          }
        }
      };
    };

    const xRange = this.currentXRange();
    const yRange = this.currentYRange();

    return {
      data: [
        createTraceData(unselectedTraces, false),
        createTraceData(selectedTraces, true)
      ],
      layout: {
        title: {
          text: this.title(),
          font: { size: 12, color: '#374151' },
          x: 0.5,
          xanchor: 'center',
          y: 0.95
        },
        uirevision: this.uiRevision(),
        margin: { l: 50, b: 80, t: 80, r: 20 },
        hovermode: 'closest',
        dragmode: 'zoom',
        showlegend: true,
        legend: {
          orientation: 'h',
          yanchor: 'top',
          y: -0.2,
          xanchor: 'center',
          x: 0.5,
          font: { size: 10 }
        },
        xaxis: {          title: 'Rank',
          showgrid: true,
          gridcolor: '#f3f4f6',
          range: xRange || undefined,
          autorange: xRange ? false : true
        },
        yaxis: {
          title: 'Proportion (Inc - Dec) / Total',
          zeroline: true,
          zerolinecolor: '#9ca3af',
          zerolinewidth: 1,
          showgrid: true,
          gridcolor: '#f3f4f6',
          range: yRange || undefined,
          autorange: yRange ? false : true
        },
        plot_bgcolor: 'white',
        paper_bgcolor: 'white',
        height: 350
      }
    };
  });

  onRelayout(event: any) {
    if (event['xaxis.range[0]'] !== undefined && event['xaxis.range[1]'] !== undefined) {
      this.currentXRange.set([event['xaxis.range[0]'], event['xaxis.range[1]']]);
    }
    if (event['yaxis.range[0]'] !== undefined && event['yaxis.range[1]'] !== undefined) {
      this.currentYRange.set([event['yaxis.range[0]'], event['yaxis.range[1]']]);
    }

    if (event['xaxis.autorange'] === true) {
      this.currentXRange.set(null);
    }
    if (event['yaxis.autorange'] === true) {
      this.currentYRange.set(null);
    }
  }

  onPlotClick(event: any) {
    const point = event?.points?.[0];
    if (point?.customdata) {
      this.genesSelected.emit([point.customdata]);
    }
  }

  onPlotSelected(event: any) {
    if (event?.points && event.points.length > 0) {
      const selectedIds = event.points
        .map((p: any) => p.customdata)
        .filter((id: any) => id);
      
      if (selectedIds.length > 0) {
        this.genesSelected.emit(selectedIds);
      }
    }
  }
}
