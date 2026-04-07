import { Component, OnInit, inject, signal, output, computed, OnDestroy, HostListener, ElementRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, switchMap, of } from 'rxjs';
export interface DataFilterList {
  id: number;
  name: string;
  data: string;
  default: boolean;
}
@Component({
  selector: 'app-curtain-filter',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './curtain-filter.html',
  styleUrl: './curtain-filter.scss'
})
export class CurtainFilterComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private el = inject(ElementRef);
  private baseUrl = 'https://curtain.proteo.info/api';
  categories = signal<string[]>([]);
  selectedCategory = signal<string>('');
  filters = signal<DataFilterList[]>([]);
  filterSearchTerm = signal<string>('');
  isLoadingFilters = signal(false);
  globalSearchTerm = signal<string>('');
  globalSearchResults = signal<DataFilterList[]>([]);
  isGlobalSearching = signal(false);
  private searchSubject = new Subject<string>();
  pageSize = 10;
  currentPage = signal(0);
  @HostListener('document:click', ['$event'])
  onClick(event: MouseEvent) {
    if (!this.el.nativeElement.contains(event.target)) {
      this.globalSearchResults.set([]);
    }
  }
  filteredFilters = computed(() => {
    const term = this.filterSearchTerm().toLowerCase().trim();
    const all = this.filters();
    if (!term) return all;
    return all.filter(f => f.name.toLowerCase().includes(term));
  });
  pagedFilters = computed(() => {
    const filters = this.filteredFilters();
    if (!Array.isArray(filters)) return [];
    const start = this.currentPage() * this.pageSize;
    return filters.slice(start, start + this.pageSize);
  });
  totalPages = computed(() => {
    const filters = this.filteredFilters();
    return Array.isArray(filters) ? Math.ceil(filters.length / this.pageSize) : 0;
  });
  filterSelected = output<string>();
  ngOnInit() {
    this.http.get<string[]>(`${this.baseUrl}/data_filter_list/get_all_category/`)
      .subscribe(cats => this.categories.set(cats.sort()));
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(term => {
        if (term.length < 2) return of({results: []});
        this.isGlobalSearching.set(true);
        return this.http.get<{results: DataFilterList[]}>(`${this.baseUrl}/data_filter_list/?name=${encodeURIComponent(term)}`);
      })
    ).subscribe({
      next: (data) => {
        this.globalSearchResults.set(Array.isArray(data.results) ? data.results : []);
        this.isGlobalSearching.set(false);
      },
      error: () => {
        this.globalSearchResults.set([]);
        this.isGlobalSearching.set(false);
      }
    });
  }
  ngOnDestroy() {
    this.searchSubject.complete();
  }
  onGlobalSearchChange(term: string) {
    this.globalSearchTerm.set(term);
    this.searchSubject.next(term);
  }
  onCategoryChange(category: string) {
    this.selectedCategory.set(category);
    this.currentPage.set(0);
    this.filters.set([]);
    this.globalSearchTerm.set('');
    this.globalSearchResults.set([]);
    if (category) {
      this.isLoadingFilters.set(true);
      this.http.get<{results: DataFilterList[]}>(`${this.baseUrl}/data_filter_list/?category=${encodeURIComponent(category)}`)
        .subscribe({
          next: (data) => {
            this.filters.set(Array.isArray(data.results) ? data.results : []);
            this.isLoadingFilters.set(false);
          },
          error: () => {
            this.filters.set([]);
            this.isLoadingFilters.set(false);
          }
        });
    }
  }
  getProteinCount(data: string): number {
    if (!data) return 0;
    return data.split(/[\n,]/).map(s => s.trim()).filter(s => s).length;
  }
  nextPage() {
    if (this.currentPage() < this.totalPages() - 1) {
      this.currentPage.update(p => p + 1);
    }
  }
  prevPage() {
    if (this.currentPage() > 0) {
      this.currentPage.update(p => p - 1);
    }
  }
  selectFilter(filter: DataFilterList) {
    this.filterSelected.emit(filter.data);
    this.globalSearchTerm.set('');
    this.globalSearchResults.set([]);
  }
}
