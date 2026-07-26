// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import { unified } from '@astrojs/markdown-remark';
import rehypePhotoLinks from './src/plugins/rehype-photo-links.mjs';

// https://astro.build/config
export default defineConfig({
  integrations: [react()],
  markdown: {
    // `defaultColor: false` keeps Shiki's colours out of inline styles, where
    // they would beat the stylesheet. The pane renders every token in ink, so
    // nothing reads them today; the themes stay configured because that is the
    // one edit needed to bring highlighting back.
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false
    },
    processor: unified({ rehypePlugins: [rehypePhotoLinks] })
  }
});