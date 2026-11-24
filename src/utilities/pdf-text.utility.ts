import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export const firstPdfPageText = async (bytes: Buffer): Promise<string> => {
  const document = await getDocument({ data: new Uint8Array(bytes) }).promise;
  try {
    const page = await document.getPage(1);
    const content = await page.getTextContent();
    return content.items.map((item): string => ("str" in item ? item.str : "")).join(" ");
  } finally {
    await document.destroy();
  }
};
