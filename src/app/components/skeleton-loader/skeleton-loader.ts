import { Component, input } from '@angular/core';

/**
 * Skeleton loader component for better perceived performance during data loading.
 * Displays animated placeholder shapes that match the expected content layout.
 */
@Component({
  selector: 'app-skeleton-loader',
  standalone: true,
  template: `
    <div class="animate-pulse">
      @switch (variant()) {
        @case ('heatmap') {
          <div class="bg-gray-50 rounded border border-dashed border-gray-300 p-4">
            <div class="flex gap-4">
              <div class="flex-1">
                <div class="h-6 bg-gray-200 rounded w-48 mb-4"></div>
                <div class="space-y-2">
                  @for (i of [1,2,3,4,5,6,7,8]; track i) {
                    <div class="flex gap-2">
                      <div class="h-4 bg-gray-200 rounded w-24"></div>
                      <div class="flex-1 flex gap-1">
                        @for (j of [1,2,3,4,5,6,7,8,9,10]; track j) {
                          <div class="h-4 bg-gray-200 rounded flex-1"></div>
                        }
                      </div>
                    </div>
                  }
                </div>
              </div>
              <div class="w-6 flex flex-col gap-1">
                @for (i of [1,2,3,4,5]; track i) {
                  <div class="h-8 bg-gray-200 rounded"></div>
                }
              </div>
            </div>
          </div>
        }
        @case ('search') {
          <div class="space-y-2 p-2">
            @for (i of [1,2,3,4,5]; track i) {
              <div class="h-8 bg-gray-200 rounded"></div>
            }
          </div>
        }
        @case ('filter') {
          <div class="space-y-2 p-2">
            @for (i of [1,2,3,4]; track i) {
              <div class="flex items-center gap-2">
                <div class="h-4 w-4 bg-gray-200 rounded"></div>
                <div class="h-4 bg-gray-200 rounded flex-1"></div>
              </div>
            }
          </div>
        }
        @case ('tags') {
          <div class="flex flex-wrap gap-2">
            @for (i of [1,2,3,4,5,6,7,8]; track i) {
              <div class="h-6 bg-gray-200 rounded-full" [style.width.px]="60 + (i % 3) * 20"></div>
            }
          </div>
        }
        @default {
          <div class="space-y-3">
            @for (i of rows(); track i) {
              <div class="h-4 bg-gray-200 rounded" [style.width.%]="90 - (i % 3) * 10"></div>
            }
          </div>
        }
      }
    </div>
  `
})
export class SkeletonLoaderComponent {
  variant = input<'heatmap' | 'search' | 'filter' | 'tags' | 'default'>('default');
  rows = input<number[]>([1, 2, 3]);
}
