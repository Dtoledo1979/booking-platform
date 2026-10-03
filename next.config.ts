import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets phones on the local network use the dev server (hot reload
  // included). Development only; has no effect on production builds.
  allowedDevOrigins: ["192.168.1.143"],
};

export default nextConfig;
