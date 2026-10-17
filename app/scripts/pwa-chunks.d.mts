// Os tipos de pwa-chunks.mjs para o vite.config.ts: o tsconfig.node.json não lê JavaScript.
export declare const AUTH_CHUNKS: string;
export declare function isAuthChunk(moduleIds: readonly string[]): boolean;
export declare function chunkFileName(chunk: { moduleIds: readonly string[] }): string;
