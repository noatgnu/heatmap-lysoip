import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { DataService } from './data.service';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
describe('DataService', () => {
  let service: DataService;
  let httpMock: HttpTestingController;
  const mockTsvContent = `col0\tcol1\tcol2\tcol3\tcol4\tcol5\tPRJ001\t\t\tPRJ002\t\t
col0\tcol1\tcol2\tcol3\tcol4\tcol5\t20210407_ Brain LRRK2 R1441C vs WT (+ = IP-DN)\t\t\t20240324_ MEFs VPS35 D620N-WT - LRRK2-ko\t\t
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
  describe('parseData', () => {
    it('should separate mutation, knockout and extract date correctly', () => {
      const result = service.parseData(mockTsvContent);
      expect(result.projects[0].date).toBe('20210407');
      expect(result.projects[0].organ).toBe('Brain');
      expect(result.projects[0].protein).toBe('LRRK2');
      expect(result.projects[0].mutation).toBe('R1441C');
      expect(result.projects[0].knockout).toBe('None');
      expect(result.projects[1].date).toBe('20240324');
      expect(result.projects[1].organ).toBe('MEFs');
      expect(result.projects[1].protein).toBe('VPS35');
      expect(result.projects[1].mutation).toBe('D620N');
      expect(result.projects[1].knockout).toBe('LRRK2-KO');
    });
    it('should detect treatment correctly', () => {
      const treatmentContent = `col0\tcol1\tcol2\tcol3\tcol4\tcol5\tPRJ001\t\t
col0\tcol1\tcol2\tcol3\tcol4\tcol5\tBrain LRRK2 R1441C DMSO-MLi2\t\t
col0\tcol1\tcol2\tcol3\tcol4\tcol5\t\t\t
Q9Y6K1\tTP53\tcol2\tcol3\tcol4\tcol5\tval6\t1.5\tval8`;
      const result = service.parseData(treatmentContent);
      expect(result.projects[0].treatment).toBe('MLi2');
    });
    it('should extract gene data correctly', () => {
      const result = service.parseData(mockTsvContent);
      expect(result.genes[0].uniprotId).toBe('Q9Y6K1');
      expect(result.genes[0].gene).toBe('TP53');
      expect(result.genes[0].log2fcs[0]).toBe(1.5);
      expect(result.genes[0].log2fcs[1]).toBe(-0.8);
    });
  });
});
