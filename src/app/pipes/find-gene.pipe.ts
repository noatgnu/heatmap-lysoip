import { Pipe, PipeTransform } from '@angular/core';
import { GeneData } from '../models';

@Pipe({
  name: 'findGene',
  standalone: true
})
export class FindGenePipe implements PipeTransform {
  transform(genes: GeneData[], uniprotId: string | null): GeneData | undefined {
    if (!genes || !uniprotId) return undefined;
    return genes.find(g => g.uniprotId === uniprotId);
  }
}
