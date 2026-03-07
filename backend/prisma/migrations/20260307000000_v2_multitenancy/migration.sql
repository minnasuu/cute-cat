-- V2.0 Migration: Multi-tenancy with User/Team/TeamCat

-- Drop old tables
DROP TABLE IF EXISTS "WorkflowRun";
DROP TABLE IF EXISTS "Assistant";
DROP TABLE IF EXISTS "Workflow";

-- CreateTable: User
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "avatar" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "aiQuota" INTEGER NOT NULL DEFAULT 100,
    "aiUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateTable: EmailVerification
CREATE TABLE "EmailVerification" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailVerification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmailVerification_email_code_idx" ON "EmailVerification"("email", "code");

-- CreateTable: Team
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Team_ownerId_idx" ON "Team"("ownerId");

-- CreateTable: TeamCat
CREATE TABLE "TeamCat" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "templateId" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "description" TEXT,
    "catColors" JSONB NOT NULL,
    "systemPrompt" TEXT,
    "skills" JSONB NOT NULL,
    "aiModel" TEXT,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "maxTokens" INTEGER NOT NULL DEFAULT 2048,
    "accent" TEXT NOT NULL DEFAULT '#8DB889',
    "item" TEXT NOT NULL DEFAULT 'clipboard',
    "messages" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TeamCat_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TeamCat_teamId_idx" ON "TeamCat"("teamId");

-- CreateTable: Workflow (v2)
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '📋',
    "description" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "cron" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Workflow_teamId_idx" ON "Workflow"("teamId");

-- CreateTable: WorkflowRun (v2)
CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT,
    "teamId" TEXT NOT NULL,
    "triggeredBy" TEXT,
    "workflowName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "steps" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "totalDuration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WorkflowRun_teamId_idx" ON "WorkflowRun"("teamId");
CREATE INDEX "WorkflowRun_workflowId_idx" ON "WorkflowRun"("workflowId");

-- CreateTable: AICallLog
CREATE TABLE "AICallLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "catId" TEXT,
    "skillId" TEXT,
    "model" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "duration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AICallLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AICallLog_userId_idx" ON "AICallLog"("userId");
CREATE INDEX "AICallLog_teamId_idx" ON "AICallLog"("teamId");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamCat" ADD CONSTRAINT "TeamCat_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AICallLog" ADD CONSTRAINT "AICallLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AICallLog" ADD CONSTRAINT "AICallLog_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
