import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExplorerComponent } from './explorer';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from '../app.routes';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { importProvidersFrom } from '@angular/core';
import { PlotlyModule } from 'angular-plotly.js';
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

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExplorerComponent],
      providers: [
        provideHttpClient(),
        provideRouter(routes),
        { provide: DataService, useValue: mockDataService },
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

  it('should automatically flip signs for DMSO-MLi2 and KO-WT comparisons', () => {
    // Manually trigger the logic that would normally be inside parseData and loadData subscription
    const mockProjects: ProjectMetadata[] = [
      { projectId: '1', projectName: 'Control vs DMSO-MLi2', log2fcIndex: 7, organ: 'Brain', protein: 'LRRK2', mutation: 'WT', knockout: 'None', treatment: 'None', fraction: 'Lyso' },
      { projectId: '2', projectName: 'WildType vs KO-WT', log2fcIndex: 10, organ: 'Lung', protein: 'VPS35', mutation: 'D620N', knockout: 'KO', treatment: 'None', fraction: 'Lyso' },
      { projectId: '3', projectName: 'Normal Comparison', log2fcIndex: 13, organ: 'MEFs', protein: 'LRRK2', mutation: 'R1441C', knockout: 'None', treatment: 'None', fraction: 'Lyso' }
    ];

    const mockGenes: GeneData[] = [
      { uniprotId: 'P12345', gene: 'LRRK2', log2fcs: [1.5, -2.0, 3.0], searchString: 'p12345 lrrk2' }
    ];

    component.projects.set(mockProjects);
    component.allGenes.set(mockGenes);
    
    const idsToFlip = new Set<string>();
    mockProjects.forEach(p => {
      if (component.isDefaultFlip(p)) {
        idsToFlip.add(p.projectId);
      }
    });
    component.flippedProjectIds.set(idsToFlip);

    expect(component.flippedProjectIds().has('1')).toBe(true); // DMSO-MLi2
    expect(component.flippedProjectIds().has('2')).toBe(true); // KO-WT
    expect(component.flippedProjectIds().has('3')).toBe(false); // Normal

    // Verify processed values
    component.selectedGeneIds.set(new Set(['P12345']));
    const processed = component.displayedGenes();
    expect(processed[0].log2fcs[0]).toBe(-1.5); // Flipped from 1.5
    expect(processed[0].log2fcs[1]).toBe(2.0);  // Flipped from -2.0
    expect(processed[0].log2fcs[2]).toBe(3.0);  // Unchanged
  });
});
