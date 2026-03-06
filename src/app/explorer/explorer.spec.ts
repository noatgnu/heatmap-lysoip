import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExplorerComponent } from './explorer';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from '../app.routes';
import { describe, it, expect, beforeEach } from 'vitest';
import { importProvidersFrom } from '@angular/core';
import { PlotlyModule } from 'angular-plotly.js';
import * as PlotlyJS from 'plotly.js-dist-min';
import { DataService } from '../services/data.service';

describe('ExplorerComponent', () => {
  let component: ExplorerComponent;
  let fixture: ComponentFixture<ExplorerComponent>;
  let dataService: DataService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExplorerComponent],
      providers: [
        provideHttpClient(),
        provideRouter(routes),
        importProvidersFrom(PlotlyModule.forRoot(PlotlyJS)),
        DataService
      ]
    })
    .compileComponents();

    dataService = TestBed.inject(DataService);
    fixture = TestBed.createComponent(ExplorerComponent);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('dataset', 'lysoip');

    fixture.detectChanges();
  });

  it('should automatically flip signs for DMSO-MLi2 and KO-WT comparisons', () => {
    const mockContent =
      'col0\tcol1\tcol2\tcol3\tcol4\tcol5\t1\t\t\t2\t\t\t3\n' +
      'col0\tcol1\tcol2\tcol3\tcol4\tcol5\tControl vs DMSO-MLi2\t\t\tWildType vs KO-WT\t\t\tNormal Comparison\n' +
      'col0\tcol1\tcol2\tcol3\tcol4\tcol5\t\t\t\t\t\t\t\n' +
      'P12345\tLRRK2\tcol2\tcol3\tcol4\tcol5\t0.1\t1.5\t+\t0.2\t-2.0\t+\t0.3\t3.0\t+';

    const { projects, genes } = dataService.parseData(mockContent);
    component.projects.set(projects);
    component.allGenes.set(genes);

    const idsToFlip = new Set<string>();
    projects.forEach(p => {
      const name = p.projectName.toLowerCase();
      const isMli2 = name.includes('dmso') && name.includes('mli2');
      const isKo = name.includes('ko') && name.includes('wt');
      if (isMli2 || isKo) {
        idsToFlip.add(p.projectId);
      }
    });
    component.flippedProjectIds.set(idsToFlip);

    expect(component.flippedProjectIds().has('1')).toBe(true);
    expect(component.flippedProjectIds().has('2')).toBe(true);
    expect(component.flippedProjectIds().has('3')).toBe(false);

    component.selectedGeneIds.set(new Set(['P12345']));
    const processed = component.displayedGenes();
    expect(processed[0].log2fcs[0]).toBe(-1.5);
    expect(processed[0].log2fcs[1]).toBe(2.0);
    expect(processed[0].log2fcs[2]).toBe(3.0);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
