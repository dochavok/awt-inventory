// The printable character sheet (EX-1 to EX-3): first as data
// (SheetDocument), then laid out as a PDF with pdf-lib, on the phone itself.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatLocal, localDay } from "../platform/time";
import type { Character, Entry, ItemEntry, ReferenceData, SkillEntry, SlotState, Title, Totals } from "../rules/types";
import { totalRows } from "./totals-text";
import type { PdfFile, PrintOptions, SheetDocument } from "./types";
import { categoryName } from "./validate";

/** The categories on the sheet, in the app's order; skills have their own section. */
const SHEET_CATEGORIES = ["weapons", "armor", "allies", "consumables", "items", "components"] as const;

/** Sorts by name, in the user's alphabetical order. */
export const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

export interface SheetInput {
  character: Character;
  /** Entries still in the inventory. */
  entries: Entry[];
  titles: Title[];
  /** The character's totals and slots (GR-7 to GR-12, EQ-5), for the sheet's totals and Equipped list. */
  totals: Totals;
  slots: SlotState;
}

type SheetPage = SheetDocument["characters"][number];

/**
 * EX-1: CM, mitigation, max hearts, combat dice and damage, each with its breakdown and its
 * situational grants (GR-4), as the character's page shows them.
 */
function sheetTotals(totals: Totals): NonNullable<SheetPage["totals"]> {
  const { cm, mitigation, hearts, dice, damage } = totalRows(totals);
  return [cm, mitigation, hearts, dice, damage];
}

/** EX-1: what's equipped, slot by slot in paper-doll order, then the arcane slots (EQ-5, EQ-7). */
function sheetEquipped(slots: SlotState): SheetPage["equipped"] {
  return [
    ...slots.kinds.flatMap((k) =>
      k.slots.flatMap((s) => (s.occupant ? [{ slot: s.label, entry: s.occupant.name }] : [])),
    ),
    ...slots.arcane.occupants.map((o) => ({ slot: "Arcane", entry: o.name })),
  ];
}

/** The user's own time zone, for dates shown to them (NF-8). */
function localZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function buildSheet(
  characters: SheetInput[],
  ref: ReferenceData,
  options: { createdAt: string; includeSkillText: boolean; showSkillText: boolean },
): SheetDocument {
  return {
    createdAt: options.createdAt,
    pageFooter: `Created ${formatLocal(options.createdAt, localZone())}`,
    characters: characters.map(({ character, entries, titles, totals, slots }) => {
      const items = entries.filter((e): e is ItemEntry => e.category !== "skills");
      const skills = entries
        .filter((e): e is SkillEntry => e.category === "skills")
        .map((e) => {
          const skill = ref.skills.find((s) => s.id === e.skillId);
          const line: SheetDocument["characters"][number]["skills"][number] = {
            name: skill?.name ?? e.skillId,
            usage: skill?.usage ?? "",
            tier: skill?.tier ?? "normal",
          };
          // Card text only when ticked, and only while card text is turned on (EX-1, SK-2).
          if (options.includeSkillText && options.showSkillText && skill?.text !== undefined) line.text = skill.text;
          return line;
        })
        .sort(byName);
      const page: SheetDocument["characters"][number] = {
        name: character.name,
        className: character.className,
        level: character.level,
        totals: sheetTotals(totals),
        equipped: sheetEquipped(slots),
        categories: SHEET_CATEGORIES.map((category) => ({
          category,
          entries: items
            .filter((e) => e.category === category)
            .sort(byName)
            .map((e) => ({ name: e.name, quantity: e.quantity })),
        })),
        skills,
        titles: [...titles]
          .sort(byName)
          .map((t) => (t.description ? { name: t.name, description: t.description } : { name: t.name })),
      };
      if (character.notes !== undefined) page.notes = character.notes;
      return page;
    }),
  };
}

// ---------------------------------------------------------------- PDF

/** Page sizes in points (EX-1). */
const PAPER = { letter: [612, 792], a4: [595.28, 841.89] } as const;
const MARGIN = 48;
const BODY = 11;
const LINE = 15;

/** Lays text out down the pages, starting a new page when one is full. */
class Writer {
  page!: PDFPage;
  y = 0;
  readonly pages: PDFPage[] = [];
  /** fontFor's answers, by the text's font and then the character. */
  private readonly chosen = new Map<PDFFont, Map<string, PDFFont | undefined>>();

  constructor(
    private readonly doc: PDFDocument,
    private readonly size: readonly [number, number],
    private readonly fonts: { regular: PDFFont; bold: PDFFont; symbol: PDFFont },
  ) {}

  newPage(): void {
    this.page = this.doc.addPage([this.size[0], this.size[1]]);
    this.pages.push(this.page);
    this.y = this.size[1] - MARGIN;
  }

  private room(height: number): void {
    if (this.y - height < MARGIN + LINE * 2) this.newPage();
  }

  /**
   * The pieces of a line, each with the font that draws it: the text's own font, or the
   * standard Symbol font for what only it has, such as the ♥ in card text.
   */
  private runs(line: string, font: PDFFont): { text: string; font: PDFFont }[] {
    const runs: { text: string; font: PDFFont }[] = [];
    for (const ch of line) {
      const chFont = this.fontFor(ch, font) ?? font;
      const last = runs[runs.length - 1];
      if (last?.font === chFont) last.text += ch;
      else runs.push({ text: ch, font: chFont });
    }
    return runs;
  }

  private width(line: string, font: PDFFont, size: number): number {
    return this.runs(line, font).reduce((sum, run) => sum + run.font.widthOfTextAtSize(run.text, size), 0);
  }

  private draw(page: PDFPage, line: string, at: { x: number; y: number; size: number; font: PDFFont; grey?: boolean }) {
    let x = at.x;
    const color = at.grey ? rgb(0.3, 0.3, 0.3) : rgb(0, 0, 0);
    for (const run of this.runs(line, at.font)) {
      page.drawText(run.text, { x, y: at.y, size: at.size, font: run.font, color });
      x += run.font.widthOfTextAtSize(run.text, at.size);
    }
  }

  /** Which font draws a character: the text's own, else Symbol, else none. Worked out once per font and character. */
  private fontFor(ch: string, font: PDFFont): PDFFont | undefined {
    let known = this.chosen.get(font);
    if (!known) this.chosen.set(font, (known = new Map()));
    if (!known.has(ch))
      known.set(
        ch,
        [font, this.fonts.symbol].find((f) => encodes(f, ch)),
      );
    return known.get(ch);
  }

  /** Text no standard font can draw becomes "?", so a character's odd symbol never stops the sheet. */
  private drawable(text: string, font: PDFFont): string {
    let out = "";
    for (const ch of text.replace(/→/g, "->").replace(/×/g, "x").replace(/\t/g, " ")) {
      out += this.fontFor(ch, font) ? ch : "?";
    }
    return out;
  }

  /** Words wrapped to the page's width; line breaks in the text are kept. */
  private wrap(text: string, font: PDFFont, size: number, indent: number): string[] {
    const width = this.size[0] - MARGIN * 2 - indent;
    const lines: string[] = [];
    for (const paragraph of this.drawable(text, font).split(/\r?\n/)) {
      let line = "";
      for (const word of paragraph.split(" ")) {
        const next = line === "" ? word : `${line} ${word}`;
        if (line !== "" && this.width(next, font, size) > width) {
          lines.push(line);
          line = word;
        } else line = next;
      }
      lines.push(line);
    }
    return lines;
  }

  text(text: string, options: { bold?: boolean; size?: number; indent?: number; gap?: number } = {}): void {
    const font = options.bold ? this.fonts.bold : this.fonts.regular;
    const size = options.size ?? BODY;
    const indent = options.indent ?? 0;
    const height = Math.max(LINE, size * 1.3);
    this.y -= options.gap ?? 0;
    for (const line of this.wrap(text, font, size, indent)) {
      this.room(height);
      this.y -= height;
      this.draw(this.page, line, { x: MARGIN + indent, y: this.y, size, font });
    }
  }

  footer(text: string): void {
    const total = this.pages.length;
    const font = this.fonts.regular;
    this.pages.forEach((page, i) => {
      const line = this.drawable(`${text} · Page ${i + 1} of ${total}`, font);
      this.draw(page, line, { x: MARGIN, y: MARGIN / 2, size: 9, font, grey: true });
    });
  }
}

/** Whether a standard font can draw a character (its encoding has it). */
function encodes(font: PDFFont, ch: string): boolean {
  try {
    font.widthOfTextAtSize(ch, BODY);
    return true;
  } catch {
    return false;
  }
}

export async function renderPdf(sheet: SheetDocument, options: PrintOptions): Promise<PdfFile> {
  const doc = await PDFDocument.create();
  doc.setTitle(fileStem(sheet));
  doc.setCreator("AWT Inventory");
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    symbol: await doc.embedFont(StandardFonts.Symbol),
  };
  const w = new Writer(doc, PAPER[options.paper], fonts);
  if (sheet.characters.length === 0) {
    w.newPage();
    w.text("No characters to print.");
  }
  for (const c of sheet.characters) {
    // Each character starts on its own page.
    w.newPage();
    w.text(c.name, { bold: true, size: 18 });
    w.text(`${c.className}, level ${c.level}`, { gap: 2 });
    for (const total of c.totals ?? []) {
      const lines = total.lines.map((l) => `${l.label} ${l.value}`).join(", ");
      w.text(`${total.label}: ${total.value}${lines ? ` (${lines})` : ""}`);
      // EX-1, GR-4: under the total, marked as never added to it; each grant starts its own line.
      if (total.situational.length > 0) {
        w.text("Situational, not added in:", { indent: 12, size: 10 });
        for (const line of total.situational) w.text(line, { indent: 24, size: 10 });
      }
    }
    if (c.equipped.length > 0) {
      w.text("Equipped", { bold: true, size: 13, gap: 8 });
      for (const q of c.equipped) w.text(`${q.slot}: ${q.entry}`, { indent: 12 });
    }
    for (const { category, entries } of c.categories) {
      if (entries.length === 0) continue;
      w.text(categoryName(category), { bold: true, size: 13, gap: 8 });
      for (const e of entries) w.text(`${e.quantity} × ${e.name}`, { indent: 12 });
    }
    if (c.skills.length > 0) {
      w.text("Skills", { bold: true, size: 13, gap: 8 });
      for (const s of c.skills) {
        const tier = s.tier === "normal" ? "" : `, ${s.tier === "epic" ? "Epic" : "Legendary"}`;
        w.text(`${s.name} (${s.usage}${tier})`, { indent: 12 });
        if (s.text) w.text(s.text, { indent: 24, size: 10 });
      }
    }
    if (c.titles.length > 0) {
      w.text("Titles", { bold: true, size: 13, gap: 8 });
      for (const t of c.titles) {
        w.text(t.name, { indent: 12 });
        if (t.description) w.text(t.description, { indent: 24, size: 10 });
      }
    }
    if (c.notes) {
      w.text("Notes", { bold: true, size: 13, gap: 8 });
      w.text(c.notes, { indent: 12 });
    }
  }
  // EX-3: every page says when the sheet was made.
  w.footer(sheet.pageFooter);
  const bytes = await doc.save();
  return { fileName: `${fileStem(sheet)}.pdf`, mimeType: "application/pdf", bytes, pageCount: doc.getPageCount() };
}

/**
 * "Rowan-2026-06-13", or "AWT-characters-2026-06-13" for several (EX-2): hyphens
 * in place of spaces, since some browsers turn spaces in a download's name into
 * underscores.
 */
function fileStem(sheet: SheetDocument): string {
  const only = sheet.characters.length === 1 ? sheet.characters[0]!.name : "AWT characters";
  return fileName(only, sheet.createdAt) || `Character-${localDay(sheet.createdAt)}`;
}

/** A download's name (EX-2, EX-4): `words` with hyphens for spaces and characters files can't hold, then the day. */
export function fileName(words: string, at: string): string {
  const safe = words.replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "");
  return safe ? `${safe}-${localDay(at)}` : "";
}
