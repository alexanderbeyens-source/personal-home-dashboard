import { inflateRawSync } from "node:zlib";

// Minimal, dependency-free reader for simple .xlsx files (one sheet, shared strings).
// Only what the issuer's NAV history needs; not a general spreadsheet parser.

const MAX_ENTRY_BYTES = 20 * 1024 * 1024;

export function readZipEntries(buffer) {
  const minimumEnd = Math.max(0, buffer.length - 0xffff - 22);
  let end = -1;
  for (let offset = buffer.length - 22; offset >= minimumEnd; offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      end = offset;
      break;
    }
  }
  if (end < 0) throw new Error("Geen geldig xlsx-bestand.");
  const count = buffer.readUInt16LE(end + 10);
  let pointer = buffer.readUInt32LE(end + 16);
  const entries = new Map();
  for (let index = 0; index < count; index++) {
    if (pointer + 46 > buffer.length || buffer.readUInt32LE(pointer) !== 0x02014b50) throw new Error("Beschadigd xlsx-bestand.");
    const method = buffer.readUInt16LE(pointer + 10);
    const compressedSize = buffer.readUInt32LE(pointer + 20);
    const size = buffer.readUInt32LE(pointer + 24);
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const localOffset = buffer.readUInt32LE(pointer + 42);
    const name = buffer.toString("utf8", pointer + 46, pointer + 46 + nameLength);
    entries.set(name, { method, compressedSize, size, localOffset });
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  return {
    names: [...entries.keys()],
    read(name) {
      const entry = entries.get(name);
      if (!entry) return null;
      if (entry.size > MAX_ENTRY_BYTES) throw new Error("xlsx-onderdeel is te groot.");
      const local = entry.localOffset;
      if (buffer.readUInt32LE(local) !== 0x04034b50) throw new Error("Beschadigd xlsx-bestand.");
      const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
      const data = buffer.subarray(start, start + entry.compressedSize);
      if (entry.method === 0) return data.toString("utf8");
      if (entry.method !== 8) throw new Error("Niet-ondersteunde compressie in xlsx.");
      return inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES }).toString("utf8");
    },
  };
}

function decodeXml(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");
}

function columnIndex(reference) {
  const letters = reference.match(/^[A-Z]+/)?.[0] ?? "A";
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

// Returns the first worksheet as an array of rows (arrays of strings, "" for empty cells).
export function readFirstSheet(buffer) {
  const zip = readZipEntries(buffer);
  const sharedXml = zip.read("xl/sharedStrings.xml") ?? "";
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(([, item]) =>
    decodeXml([...item.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(([, text]) => text).join("")));
  const sheetName = zip.names.find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  if (!sheetName) throw new Error("xlsx bevat geen werkblad.");
  const sheet = zip.read(sheetName);
  const rows = [];
  for (const [, rowXml] of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const [, attributes, inner] of rowXml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const reference = attributes.match(/\br="([A-Z]+\d+)"/)?.[1];
      const type = attributes.match(/\bt="(\w+)"/)?.[1];
      const raw = inner?.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const inline = inner?.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1];
      let value = "";
      if (type === "s" && raw !== undefined) value = shared[Number(raw)] ?? "";
      else if (type === "inlineStr" && inline !== undefined) value = decodeXml(inline);
      else if (raw !== undefined) value = decodeXml(raw);
      const index = reference ? columnIndex(reference) : row.length;
      while (row.length < index) row.push("");
      row[index] = value;
    }
    rows.push(row);
  }
  return rows;
}
