import { Component, input, signal, effect } from '@angular/core';
/**
 * Collapsible section wrapper for compact desktop UI.
 * Allows sections to be collapsed to save vertical space.
 */
@Component({
  selector: 'app-collapsible-section',
  standalone: true,
  template: `
    <div class="bg-white shadow rounded-lg">
      <button
        (click)="toggle()"
        class="w-full px-4 py-3 flex justify-between items-center hover:bg-gray-50 transition-colors rounded-t-lg"
        [class.rounded-b-lg]="!isOpen()"
      >
        <h4 class="text-sm font-bold text-gray-900 uppercase tracking-wider">{{ title() }}</h4>
        <svg
          class="w-4 h-4 text-gray-500 transition-transform duration-200"
          [class.rotate-180]="isOpen()"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      @if (isOpen()) {
        <div class="px-4 pb-4 pt-2 border-t border-gray-100">
          <ng-content></ng-content>
        </div>
      }
    </div>
  `
})
export class CollapsibleSectionComponent {
  title = input.required<string>();
  defaultOpen = input<boolean>(true);
  isOpen = signal(true);
  private initialized = false;
  constructor() {
    effect(() => {
      const defaultValue = this.defaultOpen();
      if (!this.initialized) {
        this.isOpen.set(defaultValue);
        this.initialized = true;
      }
    });
  }
  toggle() {
    this.isOpen.update(v => !v);
  }
}
