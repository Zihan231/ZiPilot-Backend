-- Platform / Applied via become free text so users can add their own options.
-- Converted in place (USING ::text) so existing values are kept; the index on (userId, platform) is preserved.
ALTER TABLE "Application" ALTER COLUMN "platform" DROP DEFAULT;
ALTER TABLE "Application" ALTER COLUMN "platform" TYPE TEXT USING "platform"::text;
ALTER TABLE "Application" ALTER COLUMN "platform" SET DEFAULT 'LINKEDIN';

ALTER TABLE "Application" ALTER COLUMN "appliedVia" DROP DEFAULT;
ALTER TABLE "Application" ALTER COLUMN "appliedVia" TYPE TEXT USING "appliedVia"::text;
ALTER TABLE "Application" ALTER COLUMN "appliedVia" SET DEFAULT 'WEBSITE';

ALTER TABLE "WishlistJob" ALTER COLUMN "platform" DROP DEFAULT;
ALTER TABLE "WishlistJob" ALTER COLUMN "platform" TYPE TEXT USING "platform"::text;
ALTER TABLE "WishlistJob" ALTER COLUMN "platform" SET DEFAULT 'LINKEDIN';

DROP TYPE "AppliedVia";
DROP TYPE "Platform";

-- Resume version is no longer used.
ALTER TABLE "Application" DROP COLUMN "resumeVersion";

-- New job / contact fields.
ALTER TABLE "Application" ADD COLUMN "companyWebsite" TEXT,
ADD COLUMN "jobReference" TEXT;

ALTER TABLE "WishlistJob" ADD COLUMN "appliedVia" TEXT,
ADD COLUMN "companyWebsite" TEXT,
ADD COLUMN "jobReference" TEXT,
ADD COLUMN "recruiterName" TEXT,
ADD COLUMN "recruiterEmail" TEXT,
ADD COLUMN "recruiterLinkedin" TEXT;

-- Per-user custom choices for Platform / Applied via.
ALTER TABLE "User" ADD COLUMN "customOptions" JSONB;
