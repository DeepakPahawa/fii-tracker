export const SCHEME_CODES: Record<string, number>;
export function getHistory(symbol: string): Promise<unknown>;
export function historyHandler(req: { url?: string }, res: { writeHead(status: number, headers: Record<string, string>): void; end(body: string): void }): Promise<void>;
