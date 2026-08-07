/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,

  // Ships as plain files so the site can be hosted anywhere free, with no
  // server to meter or rate-limit. Everything dynamic already lives in
  // Supabase — the pages only read from it in the browser.
  output: 'export',

  // GitHub Pages serves /about as /about/index.html, so emit that shape
  trailingSlash: true,

  // no server means no on-demand image optimiser
  images: { unoptimized: true },
};
