import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExplorerComponent } from './explorer';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from '../app.routes';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { importProvidersFrom } from '@angular/core';
import { PlotlyModule, PlotlyService } from 'angular-plotly.js';
import * as PlotlyJS from 'plotly.js-dist-min';
import { DataService } from '../services/data.service';
import { of } from 'rxjs';
import { GeneData, ProjectMetadata } from '../models';
describe('ExplorerComponent', () => {
  let component: ExplorerComponent;
  let fixture: ComponentFixture<ExplorerComponent>;
  const mockDataService = {
    loadDataset: vi.fn().mockImplementation((type) => of({ projects: [], genes: [] })),
    loadConfig: vi.fn().mockReturnValue(of({ datasets: [], categorization: [] })),
    isLoading: vi.fn().mockReturnValue(false)
  };
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
      imports: [ExplorerComponent],
      providers: [
        provideHttpClient(),
        provideRouter(routes),
        { provide: DataService, useValue: mockDataService },
        { provide: PlotlyService, useValue: mockPlotlyService },
        importProvidersFrom(PlotlyModule.forRoot(PlotlyJS))
      ]
    })
    .compileComponents();
    fixture = TestBed.createComponent(ExplorerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('dataset', 'lysoip');
    fixture.detectChanges();
  });
  it('should create', () => {
    expect(component).toBeTruthy();
  });
  it('should identify default flip projects correctly based on config patterns', () => {
    vi.spyOn(component, 'currentDatasetConfig').mockReturnValue({
      id: 'at2org',
      name: 'AT2org',
      file: 'file.txt',
      idRow: 0,
      nameRow: 0,
      dataStartRow: 2,
      experimentStartCol: 5,
      stride: 2,
      defaultFlipPatterns: ['mli2', 'ko']
    });

    const mockProjects: ProjectMetadata[] = [
      { projectId: '1', projectName: 'Control vs DMSO-MLi2', log2fcIndex: 7, date: '20210101' },
      { projectId: '2', projectName: 'WildType vs KO-WT', log2fcIndex: 10, date: '20210102' },
      { projectId: '3', projectName: 'Complex GSK Treatment', log2fcIndex: 13, date: '20210103' }
    ];
    expect(component.isDefaultFlip(mockProjects[0])).toBe(true);
    expect(component.isDefaultFlip(mockProjects[1])).toBe(true);
    expect(component.isDefaultFlip(mockProjects[2])).toBe(false);
  });

  it('should find protein UP in GSK and DOWN in MLi2 when filtering for Exclusive GSK UP', () => {
    // 1. Setup mock data
    const mockProjects: ProjectMetadata[] = [
      { projectId: 'p1', projectName: '7D GSK', log2fcIndex: 1, date: '' },
      { projectId: 'p2', projectName: '7D MLi2', log2fcIndex: 3, date: '' }
    ];
    
    // Protein 1: UP in GSK (0.8), DOWN in MLi2 (-1.5)
    // Protein 2: UP in GSK (0.9), UP in MLi2 (1.2)
    const mockGenes: GeneData[] = [
      { uniprotId: 'Q01147', gene: 'Creb1', log2fcs: [0.8, -1.5], confidences: [5.0, 5.0], searchString: 'q01147 creb1' },
      { uniprotId: 'P12345', gene: 'Other', log2fcs: [0.9, 1.2], confidences: [5.0, 5.0], searchString: 'p12345 other' }
    ];

    component.projects.set(mockProjects);
    component.allGenes.set(mockGenes);
    component.log2fcCutoff.set(0.5);
    component.confidenceCutoff.set(1.3);
    
    // 2. Mock createTab to see what gets through
    const createTabSpy = vi.spyOn(component, 'createTab');

    // 3. Set criteria: GSK UP
    component.toggleSubsetCriterion('p1', 'up');
    
    // 4. Run Exclusive filter
    component.createCustomSubset(mockProjects, 'exclusive');

    // 5. Assertions
    // Only Q01147 should pass because it is UP in GSK and NOT UP in MLi2.
    // P12345 is UP in GSK but also UP in MLi2, so it is NOT unique/exclusive UP.
    expect(createTabSpy).toHaveBeenCalled();
    const callArgs = createTabSpy.mock.calls[0];
    const passedIds = callArgs[0] as string[];
    
    expect(passedIds).toContain('Q01147');
    expect(passedIds).not.toContain('P12345');
    expect(passedIds.length).toBe(1);
  });
});
