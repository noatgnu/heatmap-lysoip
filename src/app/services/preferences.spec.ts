import { TestBed } from '@angular/core/testing';
import { PreferencesService, FilterPreset, SortCriterion } from './preferences';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('PreferencesService', () => {
  let service: PreferencesService;
  let mockStorage: Record<string, string>;

  const defaultSortStack: SortCriterion[] = ['organ', 'protein', 'mutation', 'knockout', 'treatment'];

  beforeEach(() => {
    mockStorage = {};

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
      return mockStorage[key] || null;
    });

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => {
      mockStorage[key] = value;
    });

    TestBed.configureTestingModule({});
    service = TestBed.inject(PreferencesService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start with empty presets', () => {
    expect(service.presets()).toEqual([]);
  });

  describe('savePreset', () => {
    it('should save a new preset', () => {
      const preset = service.savePreset(
        'Test Preset',
        'lysoip',
        new Set(['P12345', 'Q67890']),
        new Set(['Brain']),
        new Set(['LRRK2']),
        new Set(['R1441C']),
        new Set(['none']),
        new Set(['none']),
        new Set(['lyso']),
        defaultSortStack,
        new Set(['1'])
      );

      expect(preset.name).toBe('Test Preset');
      expect(preset.dataset).toBe('lysoip');
      expect(preset.geneIds).toEqual(['P12345', 'Q67890']);
      expect(preset.organs).toEqual(['Brain']);
      expect(preset.proteins).toEqual(['LRRK2']);
      expect(preset.mutations).toEqual(['R1441C']);
      expect(preset.knockouts).toEqual(['none']);
      expect(preset.treatments).toEqual(['none']);
      expect(preset.fractions).toEqual(['lyso']);
      expect(preset.sortStack).toEqual(defaultSortStack);
      expect(preset.flippedProjectIds).toEqual(['1']);
      expect(service.presets().length).toBe(1);
    });

    it('should persist to localStorage', () => {
      service.savePreset(
        'Test',
        'wcl',
        new Set(),
        new Set(),
        new Set(),
        new Set(),
        new Set(),
        new Set(),
        new Set(),
        defaultSortStack,
        new Set()
      );

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'heatmap_presets',
        expect.any(String)
      );
    });

    it('should limit to 10 presets', () => {
      for (let i = 0; i < 12; i++) {
        service.savePreset(
          `Preset ${i}`,
          'lysoip',
          new Set(),
          new Set(),
          new Set(),
          new Set(),
          new Set(),
          new Set(),
          new Set(),
          defaultSortStack,
          new Set()
        );
      }

      expect(service.presets().length).toBe(10);
      expect(service.presets()[0].name).toBe('Preset 11');
    });
  });

  describe('deletePreset', () => {
    it('should delete a preset by id', () => {
      const preset = service.savePreset(
        'To Delete',
        'lysoip',
        new Set(),
        new Set(),
        new Set(),
        new Set(),
        new Set(),
        new Set(),
        new Set(),
        defaultSortStack,
        new Set()
      );

      service.deletePreset(preset.id);

      expect(service.presets().length).toBe(0);
    });
  });

  describe('getPreset', () => {
    it('should return preset by id', () => {
      const saved = service.savePreset(
        'Find Me',
        'lysoip',
        new Set(),
        new Set(),
        new Set(),
        new Set(),
        new Set(),
        new Set(),
        new Set(),
        defaultSortStack,
        new Set()
      );

      const found = service.getPreset(saved.id);

      expect(found?.name).toBe('Find Me');
    });

    it('should return undefined for unknown id', () => {
      expect(service.getPreset('unknown')).toBeUndefined();
    });
  });

  describe('getPresetsForDataset', () => {
    it('should filter presets by dataset', () => {
      service.savePreset('LysoIP 1', 'lysoip', new Set(), new Set(), new Set(), new Set(), new Set(), new Set(), new Set(), defaultSortStack, new Set());
      service.savePreset('WCL 1', 'wcl', new Set(), new Set(), new Set(), new Set(), new Set(), new Set(), new Set(), defaultSortStack, new Set());
      service.savePreset('LysoIP 2', 'lysoip', new Set(), new Set(), new Set(), new Set(), new Set(), new Set(), new Set(), defaultSortStack, new Set());

      const lysoipPresets = service.getPresetsForDataset('lysoip');
      const wclPresets = service.getPresetsForDataset('wcl');

      expect(lysoipPresets.length).toBe(2);
      expect(wclPresets.length).toBe(1);
    });
  });

  describe('clearAllPresets', () => {
    it('should remove all presets', () => {
      service.savePreset('One', 'lysoip', new Set(), new Set(), new Set(), new Set(), new Set(), new Set(), new Set(), defaultSortStack, new Set());
      service.savePreset('Two', 'wcl', new Set(), new Set(), new Set(), new Set(), new Set(), new Set(), new Set(), defaultSortStack, new Set());

      service.clearAllPresets();

      expect(service.presets().length).toBe(0);
    });
  });

  describe('renamePreset', () => {
    it('should rename a preset', () => {
      const preset = service.savePreset(
        'Old Name',
        'lysoip',
        new Set(),
        new Set(),
        new Set(),
        new Set(),
        new Set(),
        new Set(),
        new Set(),
        defaultSortStack,
        new Set()
      );

      service.renamePreset(preset.id, 'New Name');

      expect(service.getPreset(preset.id)?.name).toBe('New Name');
    });
  });

  describe('loadFromStorage', () => {
    it('should load presets from localStorage on init', () => {
      const existingPresets: FilterPreset[] = [
        {
          id: 'existing-1',
          name: 'Existing',
          dataset: 'lysoip',
          geneIds: ['P12345'],
          organs: [],
          proteins: [],
          mutations: [],
          knockouts: [],
          treatments: [],
          fractions: [],
          sortStack: defaultSortStack,
          flippedProjectIds: [],
          createdAt: Date.now()
        }
      ];
      mockStorage['heatmap_presets'] = JSON.stringify(existingPresets);

      const newService = new PreferencesService();

      expect(newService.presets().length).toBe(1);
      expect(newService.presets()[0].name).toBe('Existing');
    });
  });
});
