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
  it('should identify default flip projects correctly', () => {
    const mockProjects: ProjectMetadata[] = [
      { projectId: '1', projectName: 'Control vs DMSO-MLi2', log2fcIndex: 7, organ: 'Brain', protein: 'LRRK2', mutation: 'WT', knockout: 'None', treatment: 'None', fraction: 'Lyso', date: '20210101' },
      { projectId: '2', projectName: 'WildType vs KO-WT', log2fcIndex: 10, organ: 'Lung', protein: 'VPS35', mutation: 'D620N', knockout: 'KO', treatment: 'None', fraction: 'Lyso', date: '20210102' },
      { projectId: '3', projectName: 'Complex WT-KO-Something', log2fcIndex: 13, organ: 'MEFs', protein: 'LRRK2', mutation: 'R1441C', knockout: 'None', treatment: 'None', fraction: 'Lyso', date: '20210103' }
    ];
    expect(component.isDefaultFlip(mockProjects[0])).toBe(true);
    expect(component.isDefaultFlip(mockProjects[1])).toBe(true);
    expect(component.isDefaultFlip(mockProjects[2])).toBe(false);
  });
});
