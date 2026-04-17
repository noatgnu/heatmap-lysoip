export interface ProjectMetadata {
  projectId: string;
  projectName: string;
  log2fcIndex: number;
  date: string;
  [key: string]: any;
}

export interface GeneData {
  uniprotId: string;
  gene: string;
  log2fcs: (number | null)[];
  confidences: (number | null)[];
  searchString: string;
}

export interface RankItem {
  uniprotId: string;
  gene: string;
  score: number;
  increase: number;
  decrease: number;
  total: number;
}

export interface HeatmapTab {
  id: string;
  name: string;
  geneIds: string[];
  log2fcCutoff: number | null;
  confidenceCutoff: number | null;
  selectedProjectIds: string[];
  filterState: Record<string, string[]>;
  flippedProjectIds: string[];
  sortStack: string[];
  manualProjectOrder: string[];
  manualGeneOrder: string[];
  maskSubThreshold: boolean;
  colorMin?: number | null;
  colorMax?: number | null;
  cellSize?: number | null;
  labelFontSize?: number;
}

export interface HeatmapSession {
  version: number;
  dataset: string;
  tabs: HeatmapTab[];
  activeTabId: string;
  rankCutoff: number;
  summaryDisplayMode?: 'number' | 'proportion';
  isHeatmapSwapped?: boolean;
  geneSortOrder?: 'none' | 'increase' | 'decrease';
  createdAt: number;
}
