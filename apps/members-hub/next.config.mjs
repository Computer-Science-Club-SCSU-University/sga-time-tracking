/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@workspace/ui"],
  output: 'standalone',
  outputFileTracingRoot: process.cwd(),
  eslint: { ignoreDuringBuilds: true },
}

export default nextConfig
