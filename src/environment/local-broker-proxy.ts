import type { Server, Socket } from "node:net";
import { createServer, createConnection } from "node:net";
import type { IOwnedBrokerProxy } from "../interfaces/owned-process.interface.ts";

export const reserveLoopbackPort = async (): Promise<number> => {
  const server = createServer();
  await new Promise<void>((resolve, reject): void => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Could not reserve a loopback proxy port");
  }

  await new Promise<void>((resolve, reject): Server =>
    server.close((error): void => (error ? reject(error) : resolve())),
  );
  return address.port;
};

export const startLocalBrokerProxy = async (
  port: number,
  upstream: URL,
): Promise<IOwnedBrokerProxy> => {
  if (!["127.0.0.1", "localhost", "[::1]"].includes(upstream.hostname)) {
    throw new Error("Recovery QA requires a disposable loopback broker");
  }

  const sockets = new Set<Socket>();
  const server = createServer((client): void => {
    const target = createConnection({
      host: upstream.hostname,
      port: Number(upstream.port || 5672),
    });
    sockets.add(client);
    sockets.add(target);
    client.on("error", (): Socket => target.destroy());
    target.on("error", (): Socket => client.destroy());
    client.on("close", (): void => {
      sockets.delete(client);
      target.destroy();
    });
    target.on("close", (): void => {
      sockets.delete(target);
      client.destroy();
    });
    client.pipe(target);
    target.pipe(client);
  });
  const proxy = Object.assign(server, {
    destroyConnections: (): void => sockets.forEach((socket): Socket => socket.destroy()),
  });
  await new Promise<void>((resolve, reject): void => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return proxy;
};
