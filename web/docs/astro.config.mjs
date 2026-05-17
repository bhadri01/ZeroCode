import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mdx from '@astrojs/mdx';

// docs is served under /docs from web/dist/docs by zerocode-api's ServeDir mount.
// `base` ensures all internal links + asset URLs include the /docs prefix.
export default defineConfig({
  base: '/docs/',
  outDir: './dist',
  trailingSlash: 'ignore',
  integrations: [
    starlight({
      title: 'ZeroCode',
      description: 'Self-hosted, sandboxed code execution for 41 languages.',
      social: {
        github: 'https://github.com/bhadri01/ZeroCode',
      },
      editLink: {
        baseUrl: 'https://github.com/bhadri01/ZeroCode/edit/main/web/docs/',
      },
      // Override the right-side icon area to prepend text links back to
      // / and /playground.html. The HeaderLinks override is the SOLE path
      // back out of the docs surface — sidebar back-out links were tried
      // but Starlight's sidebar normalizer strips file extensions and
      // base-prefixes path-style `link` values, so `/playground.html`
      // became `/docs/playground` (404). The header override emits raw
      // <a> tags that Astro leaves alone.
      components: {
        SocialIcons: './src/components/HeaderLinks.astro',
      },
      sidebar: [
        {
          label: 'Getting started',
          items: [
            { label: 'Quickstart', slug: 'quickstart' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'REST API', slug: 'api' },
            { label: 'SDKs', slug: 'sdks' },
            { label: 'Languages', slug: 'languages' },
          ],
        },
        {
          label: 'Operations',
          items: [
            { label: 'Architecture', slug: 'architecture' },
            { label: 'Deployment', slug: 'deployment' },
            { label: 'Observability', slug: 'observability' },
            { label: 'Security', slug: 'security' },
          ],
        },
        {
          label: 'Project',
          items: [
            { label: 'Changelog', slug: 'changelog' },
          ],
        },
      ],
      customCss: ['./src/styles/tokens.css'],
    }),
    mdx(),
  ],
});
