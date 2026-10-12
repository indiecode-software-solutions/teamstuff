import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return {};
  return Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split("\n")
      .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
      .map((l) => {
        const idx = l.indexOf("=");
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
      }),
  );
}

const env = loadEnv();
const s3 = new S3Client({
  region: "auto",
  endpoint: env.VITE_R2_ENDPOINT || "https://02fdd21955d981c8fa46d89b7caf119b.r2.cloudflarestorage.com",
  credentials: {
    accessKeyId: env.VITE_R2_ACCESS_KEY_ID || "d29f1542adc7f685b35d2f6af0236343",
    secretAccessKey: env.VITE_R2_SECRET_ACCESS_KEY || "8f169bf96afeeb9c94adc763c41e8bedb53d77c19372a627653662b48a15eda8",
  },
});

// 1 year expiry (max for presigned URLs is 7 days with temp creds, but with permanent keys it's longer)
// R2 supports up to 7 days (604800 seconds) for presigned URLs
const url = await getSignedUrl(
  s3,
  new GetObjectCommand({
    Bucket: "teamstuff",
    Key: "capoasis-app.apk",
    ResponseContentDisposition: 'attachment; filename="Teamstuff.apk"',
  }),
  { expiresIn: 604800 } // 7 days max
);

console.log("Presigned URL:", url);
