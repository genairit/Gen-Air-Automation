import {
  EXISTING_DRIVE,
  legacyDriveItem,
  registerLegacyDriveItems,
} from "./existing-drive-fixtures.ts";

import { JENNY_PDF } from "../constants/jenny.constant.ts";

const PAGE_TEXT = [
  "Project mechanical design document, approved for construction.",
  JENNY_PDF.TEXT,
];

const buildTextPdf = (pages: string[]): Buffer => {
  const pageIds = pages.map((_page, index) => 4 + index * 2);
  const pdfObjects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...pages.flatMap((text, index) => {
      const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
      return [
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[index] + 1} 0 R >>`,
        `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
      ];
    }),
  ];
  const header = "%PDF-1.4\n";
  const offsets = [header.length];
  const bodies = pdfObjects.map((object, index) => {
    const body = `${index + 1} 0 obj\n${object}\nendobj\n`;
    offsets.push(offsets[index] + body.length);
    return body;
  });
  const xrefOffset = offsets.pop();
  const xrefEntries = offsets.map(byte => `${String(byte).padStart(10, "0")} 00000 n \n`);
  const xref = `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n${xrefEntries.join("")}`;
  const trailer = `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from([header, ...bodies, xref, trailer].join(""), "ascii");
};

export const JENNY_DRIVE_PDF = buildTextPdf(PAGE_TEXT);

export const registerJennyPdf = async (rootId: string, name: string) => {
  const folder = legacyDriveItem("מפרטים", rootId);
  const file = legacyDriveItem(name, folder.id, EXISTING_DRIVE.PDF);
  const document = { ...file, id: `${JENNY_PDF.FILE_PREFIX}${file.id}` };

  await registerLegacyDriveItems([folder, document]);
  return document;
};
