import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { SMTPServer } from "smtp-server";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { PORTS, AUTOMATION_DIRECTORIES } from "../constants/environment.constant.ts";

export const startFakeSmtpServer = async (): Promise<SMTPServer> => {
  await mkdir(AUTOMATION_DIRECTORIES.MAIL, { recursive: true });
  await mkdir(AUTOMATION_DIRECTORIES.SMTP_TLS, { recursive: true });
  const keyPath = join(AUTOMATION_DIRECTORIES.SMTP_TLS, "key.pem");
  const certPath = join(AUTOMATION_DIRECTORIES.SMTP_TLS, "cert.pem");
  const certificate = spawnSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost,IP:127.0.0.1",
    ],
    { stdio: "ignore" },
  );
  if (certificate.status !== 0) {
    throw new Error("Unable to create disposable SMTP TLS certificate");
  }

  const server = new SMTPServer({
    key: await readFile(keyPath),
    cert: await readFile(certPath),
    disabledCommands: ["AUTH"],
    onRcptTo: (address, _session, callback) => {
      if (address.address === "qa-rejected@example.test") {
        callback(Object.assign(new Error("Test recipient rejected"), { responseCode: 550 }));
        return;
      }
      callback();
    },
    onData: (stream, _session, callback) => {
      const chunks: Buffer[] = [];
      stream.on("data", chunk => chunks.push(Buffer.from(chunk)));
      stream.on("error", callback);
      stream.on("end", () => {
        writeFile(`${AUTOMATION_DIRECTORIES.MAIL}/${randomUUID()}.eml`, Buffer.concat(chunks))
          .then(() => callback())
          .catch(callback);
      });
    },
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORTS.SMTP, "127.0.0.1", resolve);
  });

  return server;
};
