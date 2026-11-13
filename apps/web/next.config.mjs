/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // deployments/testnet.json lives at the repo root, outside this package.
  experimental: { externalDir: true },
};
