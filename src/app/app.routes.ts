import { Routes } from '@angular/router';

export const routes: Routes = [
  { 
    path: ':dataset', 
    loadComponent: () => import('./explorer/explorer').then(m => m.ExplorerComponent) 
  },
  { 
    path: '', 
    redirectTo: 'lysoip', 
    pathMatch: 'full' 
  }
];
