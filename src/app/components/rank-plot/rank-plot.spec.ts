import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RankPlotComponent } from './rank-plot';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { importProvidersFrom } from '@angular/core';
import { PlotlyModule, PlotlyService } from 'angular-plotly.js';
import * as PlotlyJS from 'plotly.js-dist-min';

describe('RankPlotComponent', () => {
  let component: RankPlotComponent;
  let fixture: ComponentFixture<RankPlotComponent>;

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
      imports: [RankPlotComponent],
      providers: [
        { provide: PlotlyService, useValue: mockPlotlyService },
        importProvidersFrom(PlotlyModule.forRoot(PlotlyJS))
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(RankPlotComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('data', []);
    fixture.componentRef.setInput('selectedGeneIds', new Set());
    await fixture.whenStable();
  });
  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
