import os from 'os';
import type { NextConfig } from 'next';

function getAllowedDevOrigins(): string[] {
  const origins = new Set<string>(['*.dev.coze.site', 'localhost', '127.0.0.1']);

  for (const networkInterface of Object.values(os.networkInterfaces())) {
    for (const address of networkInterface ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        origins.add(address.address);
      }
    }
  }

  return Array.from(origins);
}

const nextConfig: NextConfig = {
  // outputFileTracingRoot: path.resolve(__dirname, '../../'),  // Uncomment and add 'import path from "path"' if needed
  /* config options here */
  allowedDevOrigins: getAllowedDevOrigins(),
  devIndicators: false,
  serverExternalPackages: ['better-sqlite3', 'sqlite-vec', 'sqlite-vec-windows-x64'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lf-coze-web-cdn.coze.cn',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
