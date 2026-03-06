import { Component, input, output } from '@angular/core';

export interface FilterChip {
  type: 'organ' | 'protein' | 'mutation';
  value: string;
}

/**
 * Displays active filters as removable chips for quick visibility and management.
 */
@Component({
  selector: 'app-filter-chips',
  standalone: true,
  template: `
    @if (chips().length > 0) {
      <div class="flex flex-wrap gap-2 py-2">
        <span class="text-xs font-medium text-gray-500 self-center">Active Filters:</span>
        @for (chip of chips(); track chip.type + chip.value) {
          <span
            [class]="getChipClass(chip.type)"
            class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
          >
            <span class="capitalize">{{ chip.type }}:</span>&nbsp;{{ chip.value }}
            <button
              type="button"
              (click)="removeFilter.emit(chip)"
              class="flex-shrink-0 ml-1.5 h-4 w-4 rounded-full inline-flex items-center justify-center hover:bg-white/20 focus:outline-none transition-colors"
            >
              <span class="sr-only">Remove {{ chip.type }} filter</span>
              <svg class="h-2 w-2" stroke="currentColor" fill="none" viewBox="0 0 8 8">
                <path stroke-linecap="round" stroke-width="1.5" d="M1 1l6 6m0-6L1 7" />
              </svg>
            </button>
          </span>
        }
        @if (chips().length > 1) {
          <button
            (click)="clearAll.emit()"
            class="text-xs font-medium text-gray-500 hover:text-gray-700 underline transition-colors"
          >
            Clear all
          </button>
        }
      </div>
    }
  `
})
export class FilterChipsComponent {
  chips = input.required<FilterChip[]>();

  removeFilter = output<FilterChip>();
  clearAll = output<void>();

  getChipClass(type: 'organ' | 'protein' | 'mutation'): string {
    const classes: Record<string, string> = {
      organ: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
      protein: 'bg-blue-100 text-blue-800 border border-blue-200',
      mutation: 'bg-amber-100 text-amber-800 border border-amber-200'
    };
    return classes[type] || 'bg-gray-100 text-gray-800';
  }
}
