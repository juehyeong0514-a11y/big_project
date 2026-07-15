-- AlterTable
ALTER TABLE "CompetencyReport" ADD COLUMN "strengths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "CompetencyReport" ADD COLUMN "improvementAreas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "CompetencyReport" ADD COLUMN "recommendations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
