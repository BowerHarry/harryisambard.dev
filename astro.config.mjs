// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import { unified } from '@astrojs/markdown-remark';
import rehypePhotoLinks from './src/plugins/rehype-photo-links.mjs';

// https://astro.build/config
export default defineConfig({
  integrations: [react()],
  markdown: {
    // The document pane is ink only, so highlighting would render every token
    // the same colour anyway. Turning it off keeps the markup plain.
    syntaxHighlight: false,
    processor: unified({ rehypePlugins: [rehypePhotoLinks] })
  }
});