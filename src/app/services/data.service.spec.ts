import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { DataService, DatasetType } from './data.service';

describe('DataService', () => {
  let service: DataService;
  let httpMock: HttpTestingController;

  const mockTsvContent = `col0\tcol1\tcol2\tcol3\tcol4\tcol5\tPRJ001\t\t\tPRJ002\t\t
col0\tcol1\tcol2\tcol3\tcol4\tcol5\tBrain LRRK2 R1441C vs WT\t\t\tLung VPS35 D620N vs WT\t\t
col0\tcol1\tcol2\tcol3\tcol4\tcol5\t\t\t\t\t\t
Q9Y6K1\tTP53\tcol2\tcol3\tcol4\tcol5\tval6\t1.5\tval8\tval9\t-0.8\tval11
P04637\tBRCA1\tcol2\tcol3\tcol4\tcol5\tval6\t2.3\tval8\tval9\t1.2\tval11`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        DataService
      ]
    });
    service = TestBed.inject(DataService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should load and parse lysoip dataset', () => {
    let result: any;
    service.loadDataset('lysoip').subscribe(data => {
      result = data;
    });

    const req = httpMock.expectOne('zzz-FinalDestination_LysoIP_summary_FORMATTED_ForFiltering_20240708.txt');
    expect(req.request.method).toBe('GET');
    req.flush(mockTsvContent);

    expect(result).toBeTruthy();
    expect(result.projects.length).toBe(2);
    expect(result.genes.length).toBe(2);
  });

  it('should load and parse wcl dataset', () => {
    let result: any;
    service.loadDataset('wcl').subscribe(data => {
      result = data;
    });

    const req = httpMock.expectOne('zzz-FinalDestination_WCL_summary_FORMATTED_Forfiltering_20240708.txt');
    expect(req.request.method).toBe('GET');
    req.flush(mockTsvContent);

    expect(result).toBeTruthy();
  });

  it('should cache datasets after loading', () => {
    service.loadDataset('lysoip').subscribe();
    const req = httpMock.expectOne('zzz-FinalDestination_LysoIP_summary_FORMATTED_ForFiltering_20240708.txt');
    req.flush(mockTsvContent);

    expect(service.isCached('lysoip')).toBe(true);

    let callCount = 0;
    service.loadDataset('lysoip').subscribe(() => {
      callCount++;
    });

    expect(callCount).toBe(1);
    httpMock.expectNone('zzz-FinalDestination_LysoIP_summary_FORMATTED_ForFiltering_20240708.txt');
  });

  it('should clear cache for specific dataset', () => {
    service.loadDataset('lysoip').subscribe();
    httpMock.expectOne('zzz-FinalDestination_LysoIP_summary_FORMATTED_ForFiltering_20240708.txt').flush(mockTsvContent);

    expect(service.isCached('lysoip')).toBe(true);
    service.clearCache('lysoip');
    expect(service.isCached('lysoip')).toBe(false);
  });

  it('should clear all caches', () => {
    service.loadDataset('lysoip').subscribe();
    httpMock.expectOne('zzz-FinalDestination_LysoIP_summary_FORMATTED_ForFiltering_20240708.txt').flush(mockTsvContent);

    service.loadDataset('wcl').subscribe();
    httpMock.expectOne('zzz-FinalDestination_WCL_summary_FORMATTED_Forfiltering_20240708.txt').flush(mockTsvContent);

    expect(service.isCached('lysoip')).toBe(true);
    expect(service.isCached('wcl')).toBe(true);

    service.clearCache();

    expect(service.isCached('lysoip')).toBe(false);
    expect(service.isCached('wcl')).toBe(false);
  });

  describe('parseTSV', () => {
    it('should parse tab-separated values', () => {
      const content = 'a\tb\tc\n1\t2\t3';
      const result = service.parseTSV(content);
      expect(result).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
    });

    it('should handle quoted cells with newlines', () => {
      const content = 'a\t"b\nc"\td';
      const result = service.parseTSV(content);
      expect(result).toEqual([['a', 'b\nc', 'd']]);
    });

    it('should handle empty content', () => {
      const result = service.parseTSV('');
      expect(result).toEqual([]);
    });
  });

  describe('parseData', () => {
    it('should extract project metadata correctly', () => {
      const result = service.parseData(mockTsvContent);

      expect(result.projects[0].organ).toBe('Brain');
      expect(result.projects[0].protein).toBe('LRRK2');
      expect(result.projects[0].mutation).toBe('R1441C (vs WT)');

      expect(result.projects[1].organ).toBe('Lung');
      expect(result.projects[1].protein).toBe('VPS35');
      expect(result.projects[1].mutation).toBe('D620N (vs WT)');
    });

    it('should extract gene data correctly', () => {
      const result = service.parseData(mockTsvContent);

      expect(result.genes[0].uniprotId).toBe('Q9Y6K1');
      expect(result.genes[0].gene).toBe('TP53');
      expect(result.genes[0].log2fcs[0]).toBe(1.5);
      expect(result.genes[0].log2fcs[1]).toBe(-0.8);

      expect(result.genes[1].uniprotId).toBe('P04637');
      expect(result.genes[1].gene).toBe('BRCA1');
    });

    it('should return empty arrays for insufficient rows', () => {
      const result = service.parseData('a\tb\n1\t2');
      expect(result.projects).toEqual([]);
      expect(result.genes).toEqual([]);
    });
  });
});
