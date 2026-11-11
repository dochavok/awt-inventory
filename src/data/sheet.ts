// The printable character sheet (EX-1 to EX-3): first as data
// (SheetDocument), then laid out as a PDF with pdf-lib, on the phone itself.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatLocal } from "../platform/time";
import type { Character, Entry, ItemEntry, ReferenceData, SkillEntry, Title } from "../rules/types";
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
}

/** The user's own time zone, for dates shown to them (NF-8). */
function localZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** A date as the user's calendar shows it, e.g. 2026-06-13. */
function localDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: localZone() }).format(new Date(iso));
}

export function buildSheet(
  characters: SheetInput[],
  ref: ReferenceData,
  options: { createdAt: string; includeSkillText: boolean; showSkillText: boolean },
): SheetDocument {
  return {
    createdAt: options.createdAt,
    pageFooter: `Created ${formatLocal(options.createdAt, localZone())}`,
    characters: characters.map(({ character, entries, titles }) => {
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
          // Card text only when ticked, and only once the game's owner has agreed (EX-1, SK-2).
          if (options.includeSkillText && options.showSkillText && skill?.text !== undefined) line.text = skill.text;
          return line;
        })
        .sort(byName);
      const page: SheetDocument["characters"][number] = {
        name: character.name,
        className: character.className,
        level: character.level,
        equipped: [],
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

  constructor(
    private readonly doc: PDFDocument,
    private readonly size: readonly [number, number],
    private readonly fonts: { regular: PDFFont; bold: PDFFont },
  ) {}

  newPage(): void {
    this.page = this.doc.addPage([this.size[0], this.size[1]]);
    this.pages.push(this.page);
    this.y = this.size[1] - MARGIN;
  }

  private room(height: number): void {
    if (this.y - height < MARGIN + LINE * 2) this.newPage();
  }

  /** Text the standard fonts can't draw becomes "?", so a character's odd symbol never stops the sheet. */
  private drawable(text: string, font: PDFFont): string {
    let out = "";
    for (const ch of text.replace(/→/g, "->").replace(/×/g, "x").replace(/\t/g, " ")) {
      try {
        font.widthOfTextAtSize(ch, BODY);
        out += ch;
      } catch {
        out += "?";
      }
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
        if (line !== "" && font.widthOfTextAtSize(next, size) > width) {
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
      this.page.drawText(line, { x: MARGIN + indent, y: this.y, size, font, color: rgb(0, 0, 0) });
    }
  }

  footer(text: string): void {
    const total = this.pages.length;
    this.pages.forEach((page, i) => {
      const line = this.drawable(`${text} · Page ${i + 1} of ${total}`, this.fonts.regular);
      page.drawText(line, { x: MARGIN, y: MARGIN / 2, size: 9, font: this.fonts.regular, color: rgb(0.3, 0.3, 0.3) });
    });
  }
}

export async function renderPdf(sheet: SheetDocument, options: PrintOptions): Promise<PdfFile> {
  const doc = await PDFDocument.create();
  doc.setTitle(fileStem(sheet));
  doc.setCreator("AWT Inventory");
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
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

/** "Rowan 2026-06-13", or "AWT characters 2026-06-13" for several (EX-2). */
function fileStem(sheet: SheetDocument): string {
  const only = sheet.characters.length === 1 ? sheet.characters[0]!.name : "AWT characters";
  const safe = only.replace(/[\\/:*?"<>|]+/g, "-").trim() || "Character";
  return `${safe} ${localDate(sheet.createdAt)}`;
}
