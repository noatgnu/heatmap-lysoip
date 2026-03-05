import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExplorerComponent } from './explorer';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from '../app.routes';
import { describe, it, expect, beforeEach } from 'vitest';
import { importProvidersFrom } from '@angular/core';
import { PlotlyModule } from 'angular-plotly.js';
import * as PlotlyJS from 'plotly.js-dist-min';

describe('ExplorerComponent', () => {
  let component: ExplorerComponent;
  let fixture: ComponentFixture<ExplorerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExplorerComponent],
      providers: [
        provideHttpClient(),
        provideRouter(routes),
        importProvidersFrom(PlotlyModule.forRoot(PlotlyJS))
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ExplorerComponent);
    component = fixture.componentInstance;
    
    // Mock dataset input
    fixture.componentRef.setInput('dataset', 'lysoip');
    
    fixture.detectChanges();
  });

  it('should automatically flip signs for DMSO-MLi2 and KO-WT comparisons', () => {
    const mockContent = 
      'Project #\t\tAZ\t"PD\n(GWAS)"\t"LRRK2\nPathway"\tLyso\t1\t\t\t2\t\t\t3\n' +
      'Project Name\t\t\t\t\t"Control vs DMSO-MLi2"\t\t\t"WildType vs KO-WT"\t\t\t"Normal Comparison"\n' +
      'Row3\t\t\t\t\t\t\t\t\t\t\t\t\n' +
      'P12345\tLRRK2\t\t\t\t\t0.1\t1.5\t+\t0.2\t-2.0\t+\t0.3\t3.0\t+';

    component.parseData(mockContent);
    
    // Simulate the logic inside loadData subscription
    const idsToFlip = new Set<string>();
    component.projects().forEach(p => {
      const name = p.projectName.toLowerCase();
      const isMli2 = name.includes('dmso') && name.includes('mli2');
      const isKo = name.includes('ko') && name.includes('wt');
      if (isMli2 || isKo) {
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
