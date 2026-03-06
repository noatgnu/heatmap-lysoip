import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FilterChipsComponent, FilterChip } from './filter-chips';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('FilterChipsComponent', () => {
  let component: FilterChipsComponent;
  let fixture: ComponentFixture<FilterChipsComponent>;

  const mockChips: FilterChip[] = [
    { type: 'organ', value: 'Brain' },
    { type: 'protein', value: 'LRRK2' },
    { type: 'mutation', value: 'R1441C' }
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FilterChipsComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(FilterChipsComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('chips', mockChips);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display all chips', () => {
    const chips = fixture.nativeElement.querySelectorAll('span.rounded-full');
    expect(chips.length).toBe(3);
  });

  it('should emit removeFilter when chip is removed', () => {
    const emitSpy = vi.spyOn(component.removeFilter, 'emit');
    const removeButtons = fixture.nativeElement.querySelectorAll('button');
    removeButtons[0].click();
    expect(emitSpy).toHaveBeenCalledWith(mockChips[0]);
  });

  it('should show clear all button when multiple chips', () => {
    const clearAllButton = fixture.nativeElement.querySelector('button.underline');
    expect(clearAllButton).toBeTruthy();
    expect(clearAllButton.textContent).toContain('Clear all');
  });

  it('should emit clearAll when clear all is clicked', () => {
    const emitSpy = vi.spyOn(component.clearAll, 'emit');
    const clearAllButton = fixture.nativeElement.querySelector('button.underline');
    clearAllButton.click();
    expect(emitSpy).toHaveBeenCalled();
  });

  it('should not render when chips array is empty', () => {
    fixture.componentRef.setInput('chips', []);
    fixture.detectChanges();
    const container = fixture.nativeElement.querySelector('.flex');
    expect(container).toBeFalsy();
  });

  it('should apply correct colors for different filter types', () => {
    expect(component.getChipClass('organ')).toContain('emerald');
    expect(component.getChipClass('protein')).toContain('blue');
    expect(component.getChipClass('mutation')).toContain('amber');
  });
});
