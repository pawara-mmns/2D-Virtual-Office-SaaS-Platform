# Supabase public database CA

`supabase-prod-ca-2021.crt` is a public root certificate, not a private key.

Downloaded over verified HTTPS from the URL published by the [official Supabase dashboard configuration](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json):

`https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`

SHA-256 fingerprint: `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.

Self-signature and CA basic constraints were validated at download. Expires 26 April 2031. The local server-only connection uses `sslmode=verify-full` with `sslrootcert` pointing to this file, retaining certificate-chain and hostname verification. See [Supabase's SSL connection instructions](https://supabase.com/docs/guides/database/psql).
