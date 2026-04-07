import { Component, input, output } from '@angular/core';
export interface FilterChip {
  type: 'organ' | 'protein' | 'mutation' | 'treatment' | 'project';
  value: string;
}
/**
 * Displays active filters as removable chips for quick visibility and management.
 */
@Component({
  selector: 'app-filter-chips',
  standalone: true,
  templateUrl: './filter-chips.html',
  styleUrl: './filter-chips.scss'
})
export class FilterChipsComponent {
  chips = input.required<FilterChip[]>();
  removeFilter = output<FilterChip>();
  clearAll = output<void>();
  getChipClass(type: FilterChip['type']): string {
    const classes: Record<FilterChip['type'], string> = {
      organ: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
      protein: 'bg-blue-100 text-blue-800 border border-blue-200',
      mutation: 'bg-amber-100 text-amber-800 border border-amber-200',
      treatment: 'bg-purple-100 text-purple-800 border border-purple-200',
      project: 'bg-indigo-100 text-indigo-800 border border-indigo-200'
    };
    return classes[type] || 'bg-gray-100 text-gray-800';
  }
}
