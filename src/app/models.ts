export interface ProjectMetadata {
  projectId: string;
  projectName: string;
  log2fcIndex: number;
  organ: string;
  protein: string;
  mutation: string;
  treatment: string;
}

export interface GeneData {
  uniprotId: string;
  gene: string;
  log2fcs: (number | null)[];
  searchString: string;
}
