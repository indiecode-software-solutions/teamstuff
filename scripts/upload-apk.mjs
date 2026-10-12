import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync } from "fs";

const s3 = new S3Client({
  region: "auto",
  endpoint: "https://02fdd21955d981c8fa46d89b7caf119b.r2.cloudflarestorage.com",
  credentials: {
    accessKeyId: "7f1586c49240666bf78b693b4b985ae3",
    secretAccessKey: "d7cd60a1b7bb49a6f5d329caf1e32611ef40547a0072d5228337f8dfecee0c36",
  },
});

const apk = readFileSync("android/app/build/outputs/apk/debug/app-debug.apk");

const cmd = new PutObjectCommand({
  Bucket: "intranet-storage",
  Key: "capoasis-app.apk",
  Body: apk,
  ContentType: "application/vnd.android.package-archive",
  // Note: R2 public access is controlled via bucket settings, not ACL
});

const res = await s3.send(cmd);
console.log("Upload done:", res.$metadata.httpStatusCode);
