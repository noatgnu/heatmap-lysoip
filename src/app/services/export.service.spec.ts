import { TestBed } from '@angular/core/testing';
import { ExportService } from './export.service';
import { GeneData, ProjectMetadata } from '../models';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlotlyService } from 'angular-plotly.js';

describe('ExportService', () => {
  let service: ExportService;

  const mockGenes: GeneData[] = [
    { uniprotId: 'P12345', gene: 'TP53', log2fcs: [1.5, -0.8, null], searchString: 'p12345 tp53' },
    { uniprotId: 'Q67890', gene: 'BRCA1', log2fcs: [2.1, 0.5, 1.2], searchString: 'q67890 brca1' }
  ];

  const mockProjects: ProjectMetadata[] = [
    { projectId: '1', projectName: 'Project A', log2fcIndex: 7, organ: 'Brain', protein: 'LRRK2', mutation: 'WT', knockout: 'None', treatment: 'None', fraction: 'Lyso', date: '20210101' },
    { projectId: '2', projectName: 'Project B', log2fcIndex: 10, organ: 'Lung', protein: 'VPS35', mutation: 'D620N', knockout: 'None', treatment: 'None', fraction: 'Lyso', date: '20210102' },
    { projectId: '3', projectName: 'Project C', log2fcIndex: 13, organ: 'MEFs', protein: 'LRRK2', mutation: 'R1441C', knockout: 'None', treatment: 'MLi2', fraction: 'Lyso', date: '20210103' }
  ];

  const mockPlotlyService = {
    getPlotly: () => Promise.resolve({
      downloadImage: vi.fn().mockResolvedValue(undefined)
    })
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ExportService,
        { provide: PlotlyService, useValue: mockPlotlyService }
      ]
    });
    service = TestBed.inject(ExportService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('exportAsCsv', () => {
    it('should generate CSV content with headers and data', () => {
      const downloadSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');

      service.exportAsCsv(mockGenes, mockProjects, 'test.csv');

      expect(downloadSpy).toHaveBeenCalled();
      expect(revokeSpy).toHaveBeenCalled();
    });
  });

  describe('exportAsTsv', () => {
    it('should generate TSV content', () => {
      const downloadSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');

      service.exportAsTsv(mockGenes, mockProjects, 'test.tsv');

      expect(downloadSpy).toHaveBeenCalled();
      expect(revokeSpy).toHaveBeenCalled();
    });
  });

  describe('copyGeneListToClipboard', () => {
    beforeEach(() => {
      if (!navigator.clipboard) {
        (navigator as any).clipboard = {
          writeText: vi.fn().mockResolvedValue(undefined)
        };
      } else {
        vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
      }
    });

    it('should copy gene names to clipboard', async () => {
      await service.copyGeneListToClipboard(mockGenes, 'genes');
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('TP53\nBRCA1');
    });

    it('should copy uniprot IDs to clipboard', async () => {
      await service.copyGeneListToClipboard(mockGenes, 'uniprotIds');
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('P12345\nQ67890');
    });

    it('should copy both to clipboard', async () => {
      await service.copyGeneListToClipboard(mockGenes, 'both');
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('P12345\tTP53\nQ67890\tBRCA1');
    });
  });
});
