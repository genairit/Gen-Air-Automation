export const readPort = (name: string, value: string | null, fallback: number): number => {
  const port = Number(value ?? fallback);
  const isInteger = Number.isInteger(port);
  const isBelowMinimum = port < 1024;
  const exceedsMaximum = port > 65535;

  if (!isInteger || isBelowMinimum || exceedsMaximum) {
    throw new Error(`${name} must be an integer port between 1024 and 65535`);
  }

  return port;
};
