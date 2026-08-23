import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@opensearch-project/opensearch", "exceljs", "bcryptjs"],
};

export default nextConfig;
