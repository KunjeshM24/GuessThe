/** One row in a pack's archive listing. */
export type ArchiveEntry = {
  /** Game day, YYYY-MM-DD UTC. Always strictly before today. */
  date: string;
  answer: string;
  /** 1-based position within the pack's whole run. */
  number: number;
};

/** A single past puzzle, with everything the entry page shows. */
export type ArchivePuzzle = ArchiveEntry & {
  fact: string | null;
  hints: string[];
  previousDate: string | null;
  nextDate: string | null;
};

export type ArchivePage = {
  total: number;
  entries: ArchiveEntry[];
};

export const ARCHIVE_PAGE_SIZE = 50;
