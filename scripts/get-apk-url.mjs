import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  region: "auto",
  endpoint: "https://02fdd21955d981c8fa46d89b7caf119b.r2.cloudflarestorage.com",
  credentials: {
    accessKeyId: "7f1586c49240666bf78b693b4b985ae3",
    secretAccessKey: "d7cd60a1b7bb49a6f5d329caf1e32611ef40547a0072d5228337f8dfecee0c36",
  },
});

// 1 year expiry (max for presigned URLs is 7 days with temp creds, but with permanent keys it's longer)
// R2 supports up to 7 days (604800 seconds) for presigned URLs
const url = await getSignedUrl(
  s3,
  new GetObjectCommand({
    Bucket: "intranet-storage",
    Key: "capoasis-app.apk",
    ResponseContentDisposition: 'attachment; filename="CapOasis.apk"',
  }),
  { expiresIn: 604800 } // 7 days max
);

console.log("Presigned URL:", url);
