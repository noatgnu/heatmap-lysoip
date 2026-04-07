import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HeatmapComponent } from './heatmap';
import { describe, it, expect, beforeEach } from 'vitest';
import { importProvidersFrom } from '@angular/core';
import { PlotlyModule } from 'angular-plotly.js';
import * as PlotlyJS from 'plotly.js-dist-min';
describe('HeatmapComponent', () => {
  let component: HeatmapComponent;
  let fixture: ComponentFixture<HeatmapComponent>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HeatmapComponent],
      providers: [
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
  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
