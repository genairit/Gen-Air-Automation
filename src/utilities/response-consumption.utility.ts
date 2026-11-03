import type { Page } from "@playwright/test";

interface IConsumptionObserver {
  path: string;
  acknowledge: string;
}

const installConsumptionObserver = ({ path, acknowledge }: IConsumptionObserver) => {
  const requestPaths = new WeakMap<XMLHttpRequest, string>();
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const finishAfterApplicationTurn = () => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      channel.port2.close();
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const signal = Reflect.get(window, acknowledge);
          if (typeof signal === "function") {
            signal();
          }
        }),
      );
    };
    channel.port2.postMessage(null);
  };

  XMLHttpRequest.prototype.open = new Proxy(originalOpen, {
    apply: (target, receiver: unknown, args: unknown[]) => {
      if (receiver instanceof XMLHttpRequest && typeof args[1] === "string") {
        requestPaths.set(receiver, new URL(args[1], location.href).pathname);
      }

      return Reflect.apply(target, receiver, args);
    },
  });
  XMLHttpRequest.prototype.send = new Proxy(originalSend, {
    apply: (target, receiver: unknown, args: unknown[]) => {
      if (receiver instanceof XMLHttpRequest && requestPaths.get(receiver) === path) {
        XMLHttpRequest.prototype.open = originalOpen;
        XMLHttpRequest.prototype.send = originalSend;
        // Observe Axios settlement and scheduled UI commits, not just network delivery.
        receiver.addEventListener("loadend", finishAfterApplicationTurn, { once: true });
      }

      return Reflect.apply(target, receiver, args);
    },
  });
};

export const observeResponseConsumption = async (page: Page, path: string, acknowledge: string) => {
  await page.addInitScript(installConsumptionObserver, { path, acknowledge });
  await page.evaluate(installConsumptionObserver, { path, acknowledge });
};
