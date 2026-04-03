export interface InsertedSD {
  id: string;
  /** This SD appears in the unit stream immediately after this unit ID */
  afterUnitId: string;
  text: string;
  characters: string[];
  stageType?: "entrance" | "exit" | "business" | "delivery";
  isSong?: boolean;
  isDance?: boolean;
}
