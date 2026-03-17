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
  title = input<string>('Protein Rank Plot');
  
  geneSelected = output<string>();

  graphData = computed(() => {
    const rawData = this.data();
    if (rawData.length === 0) return { data: [], layout: {} };

    const sorted = [...rawData].sort((a, b) => b.score - a.score);
    
    const x = sorted.map((_, i) => i + 1);
    const y = sorted.map(d => d.score);
    const text = sorted.map(d => `<${d.uniprotId}><${d.gene}><br>Score: ${d.score.toFixed(2)}<br>Inc: ${d.increase}, Dec: ${d.decrease}, Total: ${d.total}`);
    
    const colors = y.map(val => val >= 0 ? 'rgb(103, 0, 31)' : 'rgb(5, 48, 97)');

    return {
      data: [
        {
          x: x,
          y: y,
          text: text,
          mode: 'markers',
          type: 'scatter',
          hoverinfo: 'text',
          marker: {
            color: colors,
            size: 6,
            opacity: 0.7
          }
        }
      ],
      layout: {
        title: {
          text: this.title(),
          font: { size: 14, color: '#374151' }
        },
        margin: { l: 50, b: 40, t: 40, r: 20 },
        hovermode: 'closest',
        xaxis: {
          title: 'Rank',
          showgrid: true,
          gridcolor: '#f3f4f6'
        },
        yaxis: {
          title: 'Proportion (Inc - Dec) / Total',
          zeroline: true,
          zerolinecolor: '#9ca3af',
          zerolinewidth: 1,
          showgrid: true,
          gridcolor: '#f3f4f6',
          range: [-1.1, 1.1]
        },
        plot_bgcolor: 'white',
        paper_bgcolor: 'white',
        height: 300,
        autosize: true
      }
    };
  });

  onPlotClick(event: any) {
    if (event?.points?.[0]?.text) {
      const match = event.points[0].text.match(/<([^>]+)>/);
      if (match) {
        this.geneSelected.emit(match[1]);
      }
    }
  }
}
