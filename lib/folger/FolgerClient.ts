import { promises as fs } from "fs";
import path from "path";

const DRACOR_BASE = "https://dracor.org/api/v1/corpora/shake/plays";

export async function fetchPlayXml(playId: string): Promise<string> {
  const play = PLAYS.find((p) => p.id === playId);
  if (!play) throw new Error(`Unknown play ID: "${playId}"`);

  // Try local submodule first (unless flagged as absent from shakedracor)
  if (!play.noLocal) {
    const filename = play.localFile ?? play.slug;
    const localPath = path.join(
      process.cwd(),
      "shakedracor",
      "tei",
      `${filename}.xml`
    );
    try {
      return await fs.readFile(localPath, "utf-8");
    } catch {
      console.warn(
        `[FolgerClient] Submodule file missing for "${filename}", fetching from DraCor`
      );
    }
  }

  // Live DraCor fallback (also used for TNK which is not in shakedracor)
  const url = `${DRACOR_BASE}/${play.slug}/tei`;
  const res = await fetch(url, {
    next: { revalidate: 86400 },
  });
  if (!res.ok) {
    throw new Error(
      `Failed to fetch TEI for "${playId}" (${play.slug}): ${res.status} ${res.statusText}`
    );
  }
  return res.text();
}

export interface PlayMeta {
  id: string;
  slug: string;       // DraCor API slug (used for live fallback URL)
  title: string;
  localFile?: string; // shakedracor filename without .xml (if different from slug)
  noLocal?: boolean;  // true = not in shakedracor submodule, always use DraCor API
}

/** All 38 Shakespeare plays — 37 from DraCor corpus + TNK from Folger Digital Texts (normalized by scripts/normalize-folger-tei.py), all mirrored locally in shakedracor/tei/ */
export const PLAYS: PlayMeta[] = [
  { id: "AWW", slug: "alls-well-that-ends-well", title: "All's Well That Ends Well" },
  { id: "Ant", slug: "antony-and-cleopatra", title: "Antony and Cleopatra" },
  { id: "AYL", slug: "as-you-like-it", title: "As You Like It" },
  { id: "Err", slug: "the-comedy-of-errors", title: "The Comedy of Errors" },
  { id: "Cor", slug: "coriolanus", title: "Coriolanus" },
  { id: "Cym", slug: "cymbeline", title: "Cymbeline" },
  { id: "Ham", slug: "hamlet", title: "Hamlet" },
  { id: "1H4", slug: "henry-iv-part-i", localFile: "henry-iv-part-1", title: "Henry IV, Part 1" },
  { id: "2H4", slug: "henry-iv-part-ii", localFile: "henry-iv-part-2", title: "Henry IV, Part 2" },
  { id: "H5", slug: "henry-v", title: "Henry V" },
  { id: "1H6", slug: "henry-vi-part-i", localFile: "henry-vi-part-1", title: "Henry VI, Part 1" },
  { id: "2H6", slug: "henry-vi-part-ii", localFile: "henry-vi-part-2", title: "Henry VI, Part 2" },
  { id: "3H6", slug: "henry-vi-part-iii", localFile: "henry-vi-part-3", title: "Henry VI, Part 3" },
  { id: "H8", slug: "henry-viii", title: "Henry VIII" },
  { id: "JC", slug: "julius-caesar", title: "Julius Caesar" },
  { id: "Jn", slug: "king-john", title: "King John" },
  { id: "Lr", slug: "king-lear", title: "King Lear" },
  { id: "LLL", slug: "loves-labours-lost", localFile: "loves-labors-lost", title: "Love's Labour's Lost" },
  { id: "Mac", slug: "macbeth", title: "Macbeth" },
  { id: "MM", slug: "measure-for-measure", title: "Measure for Measure" },
  { id: "MV", slug: "the-merchant-of-venice", title: "The Merchant of Venice" },
  { id: "Wiv", slug: "the-merry-wives-of-windsor", title: "The Merry Wives of Windsor" },
  { id: "MND", slug: "a-midsummer-nights-dream", title: "A Midsummer Night's Dream" },
  { id: "Ado", slug: "much-ado-about-nothing", title: "Much Ado About Nothing" },
  { id: "Oth", slug: "othello", title: "Othello" },
  { id: "Per", slug: "pericles", title: "Pericles" },
  { id: "R2", slug: "richard-ii", title: "Richard II" },
  { id: "R3", slug: "richard-iii", title: "Richard III" },
  { id: "Rom", slug: "romeo-and-juliet", title: "Romeo and Juliet" },
  { id: "Shr", slug: "the-taming-of-the-shrew", title: "The Taming of the Shrew" },
  { id: "Tmp", slug: "the-tempest", title: "The Tempest" },
  { id: "Tim", slug: "timon-of-athens", title: "Timon of Athens" },
  { id: "Tit", slug: "titus-andronicus", title: "Titus Andronicus" },
  { id: "Tro", slug: "troilus-and-cressida", title: "Troilus and Cressida" },
  { id: "TN", slug: "twelfth-night", title: "Twelfth Night" },
  { id: "TGV", slug: "the-two-gentlemen-of-verona", localFile: "two-gentlemen-of-verona", title: "The Two Gentlemen of Verona" },
  { id: "TNK", slug: "the-two-noble-kinsmen", title: "The Two Noble Kinsmen" },
  { id: "WT", slug: "the-winters-tale", title: "The Winter's Tale" },
];
