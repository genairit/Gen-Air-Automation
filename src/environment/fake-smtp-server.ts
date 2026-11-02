import { randomUUID } from "node:crypto";
import { SMTPServer } from "smtp-server";
import { mkdir, writeFile } from "node:fs/promises";
import { PORTS, AUTOMATION_DIRECTORIES } from "../constants/environment.constant.ts";

export const startFakeSmtpServer = async (): Promise<SMTPServer> => {
  await mkdir(AUTOMATION_DIRECTORIES.MAIL, { recursive: true });

  const server = new SMTPServer({
    disabledCommands: ["AUTH", "STARTTLS"],
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
