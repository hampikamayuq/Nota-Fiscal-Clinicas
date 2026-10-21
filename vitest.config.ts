import { defineConfig } from 'vitest/config';

// Dois arquivos de teste usam (e truncam) o mesmo banco de teste; um por vez.
export default defineConfig({ test: { fileParallelism: false } });
