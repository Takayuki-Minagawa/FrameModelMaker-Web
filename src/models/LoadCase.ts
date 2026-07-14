export enum LoadCaseType {
  Dead = 'dead',
  Live = 'live',
  Wind = 'wind',
  Seismic = 'seismic',
  Temperature = 'temperature',
  Other = 'other',
}

/** 荷重配列の添字に依存しない、安定ID付きの荷重ケース。 */
export class LoadCase {
  id: string;
  name: string;
  type: string;
  memo: string;

  constructor(
    id: string,
    name: string,
    type: string = LoadCaseType.Other,
    memo: string = '',
  ) {
    this.id = id;
    this.name = name;
    this.type = type;
    this.memo = memo;
  }
}
