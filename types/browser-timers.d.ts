declare function setTimeout(handler: (...args: unknown[]) => void, timeout?: number, ...args: unknown[]): number;

declare global {
  interface Window {
    setTimeout(handler: (...args: unknown[]) => void, timeout?: number, ...args: unknown[]): NodeJS.Timeout;
  }
}

export {};
