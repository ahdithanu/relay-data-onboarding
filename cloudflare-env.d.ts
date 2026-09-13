declare namespace Cloudflare {
  interface Env {
    RELAY_ENCRYPTION_KEY?: string;
    RELAY_DESTINATION_ORIGINS?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
