import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HeatmapComponent } from './heatmap';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { importProvidersFrom } from '@angular/core';
import { PlotlyModule, PlotlyService } from 'angular-plotly.js';
import * as PlotlyJS from 'plotly.js-dist-min';
import { ProjectMetadata, GeneData } from '../models';
describe('HeatmapComponent', () => {
  let component: HeatmapComponent;
  let fixture: ComponentFixture<HeatmapComponent>;

  const mockPlotlyService = {
    getPlotly: () => Promise.resolve({
      newPlot: vi.fn(),
      react: vi.fn(),
      redraw: vi.fn(),
      purge: vi.fn()
    })
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HeatmapComponent],
      providers: [
        { provide: PlotlyService, useValue: mockPlotlyService },
        importProvidersFrom(PlotlyModule.forRoot(PlotlyJS))
      ]
    })
    .compileComponents();
    fixture = TestBed.createComponent(HeatmapComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('genes', []);
    fixture.componentRef.setInput('projects', []);
    fixture.componentRef.setInput('allProjects', []);
    fixture.detectChanges();
  });
  it('should mask sub-threshold values in the z-matrix while preserving customdata', () => {
    // 1. Setup data
    const mockProjects: ProjectMetadata[] = [
      { projectId: 'p1', projectName: 'Exp 1', log2fcIndex: 1, date: '' }
    ];
    // Gene 1: Passes (FC 0.8, Conf 5.0)
    // Gene 2: Fails Log2FC (FC 0.2, Conf 5.0)
    // Gene 3: Fails Conf (FC 0.8, Conf 0.5)
    const mockGenes: GeneData[] = [
      { uniprotId: 'G1', gene: 'G1', log2fcs: [0.8], confidences: [5.0], searchString: '' },
      { uniprotId: 'G2', gene: 'G2', log2fcs: [0.2], confidences: [5.0], searchString: '' },
      { uniprotId: 'G3', gene: 'G3', log2fcs: [0.8], confidences: [0.5], searchString: '' }
    ];

    fixture.componentRef.setInput('projects', mockProjects);
    fixture.componentRef.setInput('allProjects', mockProjects);
    fixture.componentRef.setInput('genes', mockGenes);
    fixture.componentRef.setInput('log2fcCutoff', 0.5);
    fixture.componentRef.setInput('confidenceCutoff', 1.3);
    
    fixture.detectChanges();

    const data = component.graphData();
    const zMatrix = data.data[0].z as (number | null)[][];
    const customData = data.data[0].customdata as any[][];

    // Assertions
    expect(zMatrix[0][0]).toBe(0.8); // Gene 1 passes
    expect(zMatrix[1][0]).toBeNull(); // Gene 2 fails FC
    expect(zMatrix[2][0]).toBeNull(); // Gene 3 fails Conf

    // Raw data should still be in customData for hover
    expect(customData[1][0].rawLog2fc).toBe(0.2);
    expect(customData[2][0].conf).toBe(0.5);
  });
});
