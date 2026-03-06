import { Injectable, inject } from '@angular/core';
import { PlotlyService } from 'angular-plotly.js';
import { GeneData, ProjectMetadata } from '../models';

/**
 * Service for exporting heatmap visualizations and data in various formats.
 */
@Injectable({ providedIn: 'root' })
export class ExportService {
  private plotlyService = inject(PlotlyService);

  /**
   * Exports the Plotly heatmap as a PNG image using PlotlyService.
   */
  async exportHeatmapAsPng(plotlyElement: HTMLElement, filename = 'heatmap.png'): Promise<void> {
    const Plotly = await this.plotlyService.getPlotly();
    const gd = plotlyElement.querySelector('.js-plotly-plot') as any;
    if (!gd) {
      throw new Error('Plotly graph not found');
    }

    await Plotly.downloadImage(gd, {
      format: 'png',
      width: 1600,
      height: 1200,
      filename: filename.replace('.png', '')
    });
  }

  /**
   * Exports the Plotly heatmap as an SVG image using PlotlyService.
   */
  async exportHeatmapAsSvg(plotlyElement: HTMLElement, filename = 'heatmap.svg'): Promise<void> {
    const Plotly = await this.plotlyService.getPlotly();
    const gd = plotlyElement.querySelector('.js-plotly-plot') as any;
    if (!gd) {
      throw new Error('Plotly graph not found');
    }

    await Plotly.downloadImage(gd, {
      format: 'svg',
      width: 1600,
      height: 1200,
      filename: filename.replace('.svg', '')
    });
  }

  /**
   * Exports gene data as CSV.
   */
  exportAsCsv(genes: GeneData[], projects: ProjectMetadata[], filename = 'heatmap_data.csv'): void {
    const headers = ['Uniprot ID', 'Gene', ...projects.map(p => p.projectName)];
    const rows = genes.map(gene => {
      const values = [
        gene.uniprotId,
        gene.gene,
        ...gene.log2fcs.map(v => v !== null ? v.toString() : '')
      ];
      return values.map(v => this.escapeCsvValue(v)).join(',');
    });

    const csvContent = [headers.map(h => this.escapeCsvValue(h)).join(','), ...rows].join('\n');
    this.downloadFile(csvContent, filename, 'text/csv');
  }

  /**
   * Copies gene list to clipboard.
   */
  async copyGeneListToClipboard(genes: GeneData[], format: 'genes' | 'uniprotIds' | 'both' = 'genes'): Promise<void> {
    let text: string;

    switch (format) {
      case 'genes':
        text = genes.map(g => g.gene).join('\n');
        break;
      case 'uniprotIds':
        text = genes.map(g => g.uniprotId).join('\n');
        break;
      case 'both':
        text = genes.map(g => `${g.uniprotId}\t${g.gene}`).join('\n');
        break;
    }

    await navigator.clipboard.writeText(text);
  }

  /**
   * Exports filtered data as TSV (preserves original format better).
   */
  exportAsTsv(genes: GeneData[], projects: ProjectMetadata[], filename = 'heatmap_data.tsv'): void {
    const headers = ['Uniprot ID', 'Gene', ...projects.map(p => p.projectName)];
    const rows = genes.map(gene => {
      const values = [
        gene.uniprotId,
        gene.gene,
        ...gene.log2fcs.map(v => v !== null ? v.toString() : '')
      ];
      return values.join('\t');
    });

    const tsvContent = [headers.join('\t'), ...rows].join('\n');
    this.downloadFile(tsvContent, filename, 'text/tab-separated-values');
  }

  private escapeCsvValue(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
