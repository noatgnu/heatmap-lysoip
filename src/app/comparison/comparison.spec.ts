import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ComparisonComponent } from './comparison';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from '../app.routes';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { importProvidersFrom } from '@angular/core';
import { PlotlyModule, PlotlyService } from 'angular-plotly.js';
import * as PlotlyJS from 'plotly.js-dist-min';
import { DataService } from '../services/data.service';
import { of } from 'rxjs';

describe('ComparisonComponent', () => {
  let component: ComparisonComponent;
  let fixture: ComponentFixture<ComparisonComponent>;

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
      imports: [ComparisonComponent],
      providers: [
        provideHttpClient(),
        provideRouter(routes),
        { provide: DataService, useValue: mockDataService },
        { provide: PlotlyService, useValue: mockPlotlyService },
        importProvidersFrom(PlotlyModule.forRoot(PlotlyJS))
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ComparisonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have initial state set correctly', () => {
    expect(component.selectedGeneIds().size).toBe(0);
  });
});
