import { Component, input, output, signal, viewChild, ElementRef, AfterViewInit, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-col w-full">
      <div class="relative flex items-end bg-gray-100 border-b border-gray-300">
        @if (canScrollLeft()) {
          <button (click)="scrollBy(-200)" class="flex-shrink-0 z-10 h-8 w-6 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-500 border-r border-gray-300 transition-colors">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
          </button>
        }
        <div #scrollContainer
             class="flex items-end gap-1 overflow-x-auto no-scrollbar px-2 pt-2 flex-1"
             (scroll)="onScroll()">
          @for (tab of tabs(); track tab[idField()]) {
            <div (click)="tabChange.emit(tab[idField()])"
                 [class.bg-white]="activeId() === tab[idField()]"
                 [class.text-indigo-600]="activeId() === tab[idField()]"
                 [class.bg-gray-200]="activeId() !== tab[idField()]"
                 [class.text-gray-500]="activeId() !== tab[idField()]"
                 class="px-4 py-2 rounded-t-lg text-[10px] font-bold uppercase tracking-wider cursor-pointer border-t border-x border-gray-300 flex items-center gap-2 transition-all min-w-[120px] max-w-[200px] flex-shrink-0 group shadow-sm">
              <span class="truncate">{{ tab[labelField()] }}</span>
              @if (tab[idField()] !== 'default') {
                <button (click)="onRemove($event, tab[idField()])" class="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all p-0.5 rounded-full hover:bg-gray-300 flex-shrink-0">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              }
            </div>
          }
          @if (showAdd()) {
            <button (click)="tabAdd.emit()" class="mb-2 ml-2 p-1 rounded-full bg-gray-200 text-gray-500 hover:bg-indigo-600 hover:text-white transition-all shadow-sm flex-shrink-0">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
            </button>
          }
        </div>
        @if (canScrollRight()) {
          <button (click)="scrollBy(200)" class="flex-shrink-0 z-10 h-8 w-6 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-500 border-l border-gray-300 transition-colors">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
          </button>
        }
      </div>
      <div class="p-4 bg-white border-x border-b border-gray-200 rounded-b-lg shadow-sm">
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: [`
    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  `]
})
export class TabsComponent implements AfterViewInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);

  tabs = input.required<any[]>();
  activeId = input.required<string>();
  idField = input<string>('id');
  labelField = input<string>('name');
  showAdd = input<boolean>(true);

  tabChange = output<string>();
  tabRemove = output<string>();
  tabAdd = output<void>();

  scrollContainer = viewChild<ElementRef<HTMLElement>>('scrollContainer');
  canScrollLeft = signal(false);
  canScrollRight = signal(false);

  private resizeObserver?: ResizeObserver;

  ngAfterViewInit() {
    const el = this.scrollContainer()?.nativeElement;
    if (!el) return;
    this.updateScrollState();
    this.resizeObserver = new ResizeObserver(() => {
      this.updateScrollState();
      this.cdr.detectChanges();
    });
    this.resizeObserver.observe(el);
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
  }

  onScroll() {
    this.updateScrollState();
  }

  private updateScrollState() {
    const el = this.scrollContainer()?.nativeElement;
    if (!el) return;
    this.canScrollLeft.set(el.scrollLeft > 0);
    this.canScrollRight.set(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }

  scrollBy(px: number) {
    const el = this.scrollContainer()?.nativeElement;
    if (el) el.scrollBy({ left: px, behavior: 'smooth' });
  }

  onRemove(event: Event, id: string) {
    event.stopPropagation();
    this.tabRemove.emit(id);
  }
}
