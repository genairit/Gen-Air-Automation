import { expect } from "@playwright/test";
import type { Locator } from "@playwright/test";

export const warningMessage = (checkbox: Locator): Locator =>
  checkbox.locator("xpath=ancestor::label").locator('[dir="rtl"]').last();

export const expectWarningGeometry = async (checkbox: Locator): Promise<void> => {
  const label = checkbox.locator("xpath=ancestor::label");
  const message = warningMessage(checkbox);
  await expect(message).toHaveCSS("direction", "rtl");
  await expect(message).toHaveCSS("text-align", "start");
  const geometry = await label.evaluate(element => {
    const input = element.querySelector("input");
    const text = element.querySelector('[dir="rtl"]');
    if (!input || !text) {
      throw new Error("Missing warning input or message");
    }

    const range = document.createRange();
    range.selectNodeContents(text);
    const firstLine = range.getClientRects()[0];
    if (!firstLine) {
      throw new Error("Missing rendered first message line");
    }

    const control = input.getBoundingClientRect();
    const bounds = element.getBoundingClientRect();
    const row = element.parentElement;
    if (!row) {
      throw new Error("Missing outer warning row");
    }

    const rowStyle = getComputedStyle(row);
    const rowBounds = row.getBoundingClientRect();
    const rowContentRight =
      rowBounds.right - parseFloat(rowStyle.paddingRight) - parseFloat(rowStyle.borderRightWidth);
    return {
      right: control.right,
      textRight: firstLine.right,
      lineTop: firstLine.top,
      controlCenter: control.top + control.height / 2,
      lineBottom: firstLine.bottom,
      labelRight: bounds.right,
      rowContentRight,
      overflow: element.scrollWidth > element.clientWidth + 1,
    };
  });
  expect(Math.abs(geometry.labelRight - geometry.rowContentRight)).toBeLessThanOrEqual(1);
  expect(geometry.right).toBeGreaterThan(geometry.textRight);
  expect(Math.abs(geometry.labelRight - geometry.right)).toBeLessThanOrEqual(12);
  expect(geometry.controlCenter).toBeGreaterThanOrEqual(geometry.lineTop);
  expect(geometry.controlCenter).toBeLessThanOrEqual(geometry.lineBottom);
  expect(geometry.overflow).toBe(false);
};

export const expectLatinWordOrder = async (message: Locator, words: string[]): Promise<void> => {
  const positions = await message.evaluate((element, expectedWords) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes = Array.from({ length: element.textContent?.length ?? 0 }, () =>
      walker.nextNode(),
    ).filter((node): node is Text => node instanceof Text);
    return expectedWords.map(word => {
      const node = nodes.find(candidate => candidate.data.includes(word));
      if (!node) {
        throw new Error(`Missing rendered word ${word}`);
      }

      const range = document.createRange();
      const start = node.data.indexOf(word);
      range.setStart(node, start);
      range.setEnd(node, start + word.length);
      const bounds = range.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y };
    });
  }, words);
  for (const [index, position] of positions.entries()) {
    const previous = positions[index - 1] ?? null;
    if (!previous) {
      continue;
    }

    const sameLine = Math.abs(position.y - previous.y) < 2;
    expect(sameLine ? position.x > previous.x : position.y > previous.y).toBe(true);
  }
};
