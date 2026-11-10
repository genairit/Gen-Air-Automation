import { join } from "node:path";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { createLogger } from "../utilities/logger.utility.ts";

const entry = pathToFileURL(join(process.cwd(), "dist/handlers/quotation-pdf.handler.js"));
const { renderQuotationPdf } = await import(entry.href);
const token = process.env.GEN_AIR_PDF_WORKER_TOKEN;
const port = Number(process.env.GEN_AIR_PDF_WORKER_PORT);
const logger = createLogger("PDF Worker Harness");

createServer(async (request, response) => {
  if (request.url === "/health/live") {
    response.writeHead(200).end(process.env.GEN_AIR_PDF_WORKER_RUN_ID);
    return;
  }
  if (request.url !== "/render/quotation-pdf" || request.method !== "POST") {
    response.writeHead(404).end();
    return;
  }
  if (request.headers.authorization !== `Bearer ${token}`) {
    response.writeHead(401).end();
    return;
  }
  try {
    const body = [];
    for await (const chunk of request) {
      body.push(chunk);
    }
    const payload = JSON.parse(Buffer.concat(body).toString("utf8"));
    const result = await renderQuotationPdf(payload);
    response.writeHead(200, { "content-type": "application/pdf" });
    response.end(Buffer.from(result.pdfBase64, "base64"));
  } catch (error) {
    logger.error("PDF render failed", { error });
    response.writeHead(500).end("PDF render failed");
  }
}).listen(port, "127.0.0.1");
