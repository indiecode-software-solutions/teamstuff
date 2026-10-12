// Configures the Cloudflare R2 CORS policies to allow web app uploads.
// Usage: node scripts/configure-r2-cors.mjs
import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";
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
const accessKeyId = env.VITE_R2_ACCESS_KEY_ID;
const secretAccessKey = env.VITE_R2_SECRET_ACCESS_KEY;
const endpoint = env.VITE_R2_ENDPOINT;
const bucketName = env.VITE_R2_BUCKET_NAME || "intranet-storage";

if (!accessKeyId || !secretAccessKey || !endpoint) {
  console.error("Missing R2 credentials in .env");
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

const corsRules = {
  CORSRules: [
    {
      AllowedHeaders: ["*"],
      AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
      AllowedOrigins: ["https://www.yoovaventures.com", "http://localhost:3000", "http://localhost:5173"],
      ExposeHeaders: ["ETag"],
      MaxAgeSeconds: 3000,
    },
  ],
};

try {
  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucketName,
      CORSConfiguration: corsRules,
    })
  );
  console.log(`Successfully configured CORS for bucket "${bucketName}"`);
} catch (err) {
  console.error("Error setting CORS configuration on R2 bucket:", err);
  process.exit(1);
}
