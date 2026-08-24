import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/processing/audio": [
      "./schemas/Historia_clinica_medicina_interna_template_editable.docx",
    ],
  },
}

export default nextConfig
