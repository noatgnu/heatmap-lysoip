import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ComparisonComponent } from './comparison';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from '../app.routes';
import { describe, it, expect, beforeEach } from 'vitest';
import { importProvidersFrom } from '@angular/core';
import { PlotlyModule } from 'angular-plotly.js';
import * as PlotlyJS from 'plotly.js-dist-min';

describe('ComparisonComponent', () => {
  let component: ComparisonComponent;
  let fixture: ComponentFixture<ComparisonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ComparisonComponent],
      providers: [
        provideHttpClient(),
        provideRouter(routes),
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

  it('should start in loading state', () => {
    expect(component.isLoading()).toBe(true);
  });

  it('should have empty gene selection initially before data loads', () => {
    expect(component.selectedGeneIds().size).toBe(0);
  });
});
