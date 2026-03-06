import { Component, OnInit, inject, signal, output, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

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
export class CurtainFilterComponent implements OnInit {
  private http = inject(HttpClient);
  private baseUrl = 'https://curtain-backend.omics.quest';

  categories = signal<string[]>([]);
  selectedCategory = signal<string>('');
  filters = signal<DataFilterList[]>([]);
  filterSearchTerm = signal<string>('');
  isLoadingFilters = signal(false);

  pageSize = 10;
  currentPage = signal(0);

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
  }

  onCategoryChange(category: string) {
    this.selectedCategory.set(category);
    this.currentPage.set(0);
    this.filters.set([]);
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
  }
}
