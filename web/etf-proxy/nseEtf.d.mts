export function isMarketOpen(now?: number): boolean;
export function getQuotes(symbols: string[]): Promise<unknown>;
export function etfHandler(req: { url?: string }, res: { writeHead(status: number, headers: Record<string, string>): void; end(body: string): void }): Promise<void>;
