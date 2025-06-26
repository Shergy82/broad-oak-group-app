const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  webpack: (config) => {
    // The `postinstall` script in package.json runs `npm install` in the `functions` directory.
    // This causes the Next.js dev server to restart endlessly.
    // To prevent this, we ignore the `functions` directory from being watched.
    if (!config.watchOptions) {
      config.watchOptions = {};
    }
    const existingIgnored = config.watchOptions.ignored || [];
    const ignoredAsArray = Array.isArray(existingIgnored) ? existingIgnored : [existingIgnored];
    
    config.watchOptions.ignored = [...ignoredAsArray, path.resolve(__dirname, 'functions')];
    return config;
  },
};

module.exports = nextConfig;
