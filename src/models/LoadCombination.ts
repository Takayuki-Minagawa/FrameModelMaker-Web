export interface LoadCombinationTerm {
  loadCaseId: string;
  factor: number;
}

export class LoadCombination {
  id: string;
  name: string;
  terms: LoadCombinationTerm[];
  memo: string;

  constructor(
    id: string,
    name: string,
    terms: LoadCombinationTerm[] = [],
    memo: string = '',
  ) {
    this.id = id;
    this.name = name;
    this.terms = terms.map(term => ({ ...term }));
    this.memo = memo;
  }
}
