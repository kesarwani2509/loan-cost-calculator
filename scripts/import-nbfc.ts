/**
 * scripts/import-nbfc.ts
 *
 * Imports the RBI NBFC Excel files into the nbfc_registry table.
 *
 * Usage:
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/import-nbfc.ts
 *
 * Reads:
 *   data/nbfc/rbi-registered-YYYY-MM-DD.xlsx
 *   data/nbfc/rbi-cancelled-YYYY-MM-DD.xlsx
 */

import { readdirSync } from "fs";
import { join } from "path";
import * as XLSX from "xlsx";
import { serverClient } from "../lib/db/supabase";

function normaliseName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findLatestFile(dir: string, prefix: string): string {
  const files = readdirSync(dir)
    .filter((f) => f.toLowerCase().startsWith(prefix.toLowerCase()) && f.match(/\.(xlsx|xls)$/i))
    .sort()
    .reverse();
  if (!files.length) throw new Error(`No file matching ${prefix}*.xlsx in ${dir}`);
  return join(dir, files[0]);
}

function readAsOnDate(wb: XLSX.WorkBook, sourceFile: string): string {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });
  for (const row of rows.slice(0, 5)) {
    for (const cell of row) {
      const s = String(cell);
      const m = s.match(/(\w+\s+\d{1,2},\s*\d{4}|\d{1,2}[\/\-\s]\w+[\/\-\s]\d{4})/i);
      if (m) {
        const parsed = new Date(m[0]);
        if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
      }
    }
  }
  const filenameDate = sourceFile.match(/(\d{4}-\d{2}-\d{2})/);
  if (filenameDate) return filenameDate[1];
  throw new Error(`Could not determine the RBI as-on date from workbook or filename: ${sourceFile}`);
}

async function main() {
  const dataDir = join(process.cwd(), "data", "nbfc");
  const supabase = serverClient();

  // 1. Registered list
  const registeredPath = findLatestFile(dataDir, "rbi-registered");
  console.log("Reading Registered:", registeredPath);
  const registeredWb = XLSX.readFile(registeredPath);
  const asOnDate = readAsOnDate(registeredWb, registeredPath);
  console.log("Detected As-on Date:", asOnDate);

  const registeredSheet = registeredWb.Sheets[registeredWb.SheetNames[0]];
  // RBI excel headers start at row index 1 (range: 1)
  const registeredRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(registeredSheet, {
    defval: "",
    range: 1,
  });

  console.log(`Found ${registeredRows.length} registered rows in sheet.`);

  type RegistryRecord = {
    name_raw: string; name_normalised: string; regional_office: string | null;
    classification: string | null; registration_number: string | null; cin: string | null;
    status: "active" | "cancelled"; as_on_date: string; source_file: string; imported_at: string;
  };
  const registeredMap = new Map<string, RegistryRecord>();
  const importedAt = new Date().toISOString();

  for (const row of registeredRows) {
    const rawName = String(row["NBFC Name"] || row["Name of the company"] || row["Name"] || "").trim();
    if (!rawName) continue;
    const norm = normaliseName(rawName);
    if (!norm) continue;

    registeredMap.set(norm, {
      name_raw: rawName,
      name_normalised: norm,
      regional_office: String(row["Regional Office"] || "").trim() || null,
      classification: String(row["Classification"] || "").trim() || null,
      registration_number: String(row["Registration No."] || row["Registration Number"] || "").trim() || null,
      cin: String(row["Corporate Identification Number"] || row["CIN"] || "").trim() || null,
      status: "active",
      as_on_date: asOnDate,
      source_file: registeredPath.split(/[\\/]/).pop() ?? registeredPath,
      imported_at: importedAt,
    });
  }

  // 2. Cancelled list
  const cancelledPath = findLatestFile(dataDir, "rbi-cancelled");
  console.log("Reading Cancelled:", cancelledPath);
  const cancelledWb = XLSX.readFile(cancelledPath);
  const cancelledSheet = cancelledWb.Sheets[cancelledWb.SheetNames[0]];
  const cancelledRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(cancelledSheet, {
    defval: "",
    range: 1,
  });

  console.log(`Found ${cancelledRows.length} cancelled rows in sheet.`);

  for (const row of cancelledRows) {
    const rawName = String(row["Name of the company"] || row["NBFC Name"] || row["Name"] || "").trim();
    if (!rawName) continue;
    const norm = normaliseName(rawName);
    if (!norm) continue;

    const existing = registeredMap.get(norm);
    if (existing) {
      existing.status = "cancelled";
      existing.source_file = cancelledPath.split(/[\\/]/).pop() ?? cancelledPath;
      existing.imported_at = importedAt;
    } else {
      registeredMap.set(norm, {
        name_raw: rawName,
        name_normalised: norm,
        regional_office: String(row["Regional Office"] || "").trim() || null,
        classification: null,
        registration_number: null,
        cin: null,
        status: "cancelled",
        as_on_date: asOnDate,
        source_file: cancelledPath.split(/[\\/]/).pop() ?? cancelledPath,
        imported_at: importedAt,
      });
    }
  }

  const allRecords = Array.from(registeredMap.values());
  console.log(`Total unique NBFC records to import/upsert: ${allRecords.length}`);

  const BATCH_SIZE = 500;
  for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
    const batch = allRecords.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("nbfc_registry")
      .upsert(batch, { onConflict: "name_normalised" });

    if (error) {
      console.error(`Error upserting batch at ${i}:`, error);
      throw error;
    }
    console.log(`  Imported ${Math.min(i + BATCH_SIZE, allRecords.length)} / ${allRecords.length}`);
  }

  console.log("NBFC import completed successfully!");
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
