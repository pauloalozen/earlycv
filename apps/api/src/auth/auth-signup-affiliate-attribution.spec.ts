import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { Test } from "@nestjs/testing";

import { DatabaseModule } from "../database/database.module";
import { DatabaseService } from "../database/database.service";
import { PosthogIntegrationModule } from "../posthog-integration/posthog-integration.module";
import { AuthModule } from "./auth.module";
import { AuthService } from "./auth.service";

type DeleteManyDelegate = {
  deleteMany: (args?: unknown) => Promise<unknown>;
};

async function deleteUserByEmail(database: DatabaseService, email: string) {
  await (database.user as unknown as DeleteManyDelegate).deleteMany({
    where: { email },
  });
}

async function createModule() {
  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule, PosthogIntegrationModule, AuthModule],
  }).compile();
  return {
    database: moduleRef.get(DatabaseService),
    service: moduleRef.get(AuthService),
  };
}

async function createActiveCode(database: DatabaseService) {
  const partner = await database.affiliatePartner.create({
    data: {
      name: `Criador ${randomUUID()}`,
      slug: `criador-${randomUUID()}`,
      status: "active",
    },
  });
  const campaign = await database.affiliateCampaign.create({
    data: {
      name: "Campanha Atribuição",
      status: "active",
    },
  });
  return database.affiliateCode.create({
    data: {
      campaignId: campaign.id,
      partnerId: partner.id,
      code: `SIGNUP${randomUUID().slice(0, 8).toUpperCase()}`,
      status: "active",
    },
  });
}

test("register persists signupAffiliateCodeId when a valid affiliate code is provided", async () => {
  const { database, service } = await createModule();
  const code = await createActiveCode(database);
  const email = `signup-attr+${randomUUID()}@earlycv.dev`;

  try {
    await service.register({
      email,
      password: "Super-secret-123",
      name: "Usuária Atribuída",
      affiliateCode: code.code,
    });

    const user = await database.user.findUnique({
      where: { email },
      select: { signupAffiliateCodeId: true },
    });
    assert.equal(user?.signupAffiliateCodeId, code.id);
  } finally {
    await deleteUserByEmail(database, email);
  }
});

test("register never blocks signup on an invalid affiliate code, and leaves attribution null", async () => {
  const { database, service } = await createModule();
  const email = `signup-attr-invalid+${randomUUID()}@earlycv.dev`;

  try {
    const result = await service.register({
      email,
      password: "Super-secret-123",
      name: "Usuária Sem Cupom",
      affiliateCode: "CODIGO-INEXISTENTE",
    });
    assert.equal(result.user.email, email);

    const user = await database.user.findUnique({
      where: { email },
      select: { signupAffiliateCodeId: true },
    });
    assert.equal(user?.signupAffiliateCodeId, null);
  } finally {
    await deleteUserByEmail(database, email);
  }
});

test("register without an affiliate code leaves attribution null", async () => {
  const { database, service } = await createModule();
  const email = `signup-attr-none+${randomUUID()}@earlycv.dev`;

  try {
    await service.register({
      email,
      password: "Super-secret-123",
      name: "Usuária Direta",
    });

    const user = await database.user.findUnique({
      where: { email },
      select: { signupAffiliateCodeId: true },
    });
    assert.equal(user?.signupAffiliateCodeId, null);
  } finally {
    await deleteUserByEmail(database, email);
  }
});
