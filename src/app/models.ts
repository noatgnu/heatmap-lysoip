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
}
