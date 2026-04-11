import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-col w-full">
      <div class="bg-gray-100 px-2 pt-2 flex items-end gap-1 overflow-x-auto no-scrollbar border-b border-gray-300">
        @for (tab of tabs(); track tab[idField()]) {
          <div (click)="tabChange.emit(tab[idField()])" 
               [class.bg-white]="activeId() === tab[idField()]" 
               [class.text-indigo-600]="activeId() === tab[idField()]" 
               [class.bg-gray-200]="activeId() !== tab[idField()]" 
               [class.text-gray-500]="activeId() !== tab[idField()]" 
               class="px-4 py-2 rounded-t-lg text-[10px] font-bold uppercase tracking-wider cursor-pointer border-t border-x border-gray-300 flex items-center gap-2 transition-all min-w-[120px] max-w-[200px] group shadow-sm">
            <span class="truncate">{{ tab[labelField()] }}</span>
            @if (tab[idField()] !== 'default') {
              <button (click)="onRemove($event, tab[idField()])" class="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all p-0.5 rounded-full hover:bg-gray-300">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            }
          </div>
        }
        @if (showAdd()) {
          <button (click)="tabAdd.emit()" class="mb-2 ml-2 p-1 rounded-full bg-gray-200 text-gray-500 hover:bg-indigo-600 hover:text-white transition-all shadow-sm">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
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
export class TabsComponent {
  tabs = input.required<any[]>();
  activeId = input.required<string>();
  idField = input<string>('id');
  labelField = input<string>('name');
  showAdd = input<boolean>(true);

  tabChange = output<string>();
  tabRemove = output<string>();
  tabAdd = output<void>();

  onRemove(event: Event, id: string) {
    event.stopPropagation();
    this.tabRemove.emit(id);
  }
}
