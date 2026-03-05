import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { describe, it, expect, beforeEach } from 'vitest';
import { importProvidersFrom } from '@angular/core';
import { PlotlyModule } from 'angular-plotly.js';
import * as PlotlyJS from 'plotly.js-dist-min';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideHttpClient(),
        provideRouter(routes),
        importProvidersFrom(PlotlyModule.forRoot(PlotlyJS))
      ]
    }).compileComponents();
  });

  it('should parse exactly 30 comparisons from LysoIP content', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    
    const mockContent = 
      'Project #\t\tAZ\t"PD\n(GWAS)"\t"LRRK2\nPathway"\tLyso\t1\t\t\t2\t\t\t3\t\t\t3---2\t\t\t4\t\t\t5\t\t\t6\t\t\t6---2\t\t\t7\t\t\t8\t\t\t9\t\t\t09----02\t\t\t10\t\t\t11\t\t\t12\t\t\t13\t\t\t14\t\t\t18\t\t\t20\t\t\t20---2\t\t\t24\t\t\t999 - DV\t\t\t999 - EK\t\t\t999 - LP\t\t\t999 - NS\t\t\t999 - KO\t\t\t998 - DV\t\t\t998 - EK\t\t\t998 - LP\t\t\t998 - NS\t\n' +
      'Project Name\t\t\t\t\t"20210407_Brain"\t\t\t"20210726_Lung"\t\t\t"20211217_MEFs"\t\t\t"20240324_MEFs"\t\t\t"20230501_Brain"\t\t\t"20230215_Lung"\t\t\t"20220731_MEFs"\t\t\t"20240324_MEFs"\t\t\t"20201224_Brain"\t\t\t"20210331_Lung"\t\t\t"20210514_MEFs"\t\t\t"20240502_MEFs"\t\t\t"20230601_Brain"\t\t\t"20230507_Lung"\t\t\t"20240619_MEFs"\t\t\t"20220301_Brain"\t\t\t"20220210_Lung"\t\t\t"20220210_MEFs"\t\t\t"20240503_MEFs"\t\t\t"20220701_A549"\t\t\t"20220701_A549"\t\t\t"20220701_A549"\t\t\t"20220701_A549"\t\t\t"20220701_A549"\t\t\t"20220814_A549"\t\t\t"20220814_A549"\t\t\t"20220814_A549"\t\t\t"20220814_A549"\t\n' +
      'Row3\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\n' +
      'P12345\tGENE1\t\t\t\t\t0.1\t0.2\t0.3\t0.4\t0.5\t0.6\t0.7\t0.8\t0.9\t1.0\t1.1\t1.2\t1.3\t1.4\t1.5\t1.6\t1.7\t1.8\t1.9\t2.0\t2.1\t2.2\t2.3\t2.4\t2.5\t2.6\t2.7\t2.8\t2.9\t3.0\t3.1\t3.2\t3.3\t3.4\t3.5\t3.6\t3.7\t3.8\t3.9\t4.0\t4.1\t4.2\t4.3\t4.4\t4.5\t4.6\t4.7\t4.8\t4.9\t5.0\t5.1\t5.2\t5.3\t5.4\t5.5\t5.6\t5.7\t5.8\t5.9\t6.0\t6.1\t6.2\t6.3\t6.4\t6.5\t6.6\t6.7\t6.8\t6.9\t7.0\t7.1\t7.2\t7.3\t7.4\t7.5\t7.6\t7.7\t7.8\t7.9\t8.0\t8.1\t8.2\t8.3\t8.4\t8.5\t8.6\t8.7\t8.8\t8.9\t9.0\t9.1\t9.2\t9.3\t9.4\t9.5\t9.6';

    app.parseData(mockContent);
    expect(app.projects().length).toBe(30);
  });
});
