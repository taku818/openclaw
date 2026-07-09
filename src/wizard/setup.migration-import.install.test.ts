// Setup migration import install tests cover acknowledgement forwarding for installable providers.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "./prompts.js";

const ensureOnboardingPluginInstalled = vi.hoisted(() =>
  vi.fn(
    async ({ cfg }: { acknowledgeNonClawHubInstall?: boolean; cfg: Record<string, unknown> }) => ({
      cfg: { ...cfg, installedMigrationProvider: true },
      installed: true,
      status: "installed" as const,
    }),
  ),
);

vi.mock("../commands/onboarding-plugin-install.js", async () => {
  const actual = await vi.importActual<typeof import("../commands/onboarding-plugin-install.js")>(
    "../commands/onboarding-plugin-install.js",
  );
  return {
    ...actual,
    ensureOnboardingPluginInstalled,
  };
});

const migrationProvider = vi.hoisted(() => ({
  id: "codex",
  label: "Codex",
  plan: vi.fn(async () => ({ actions: [] })),
  apply: vi.fn(async (ctx: { config: Record<string, unknown> }) => ({ config: ctx.config })),
}));

const migrationRuntime = vi.hoisted(() => ({
  ensureStandaloneMigrationProviderRegistryLoaded: vi.fn(),
  resolvePluginMigrationProvider: vi.fn(() =>
    ensureOnboardingPluginInstalled.mock.calls.length > 0 ? migrationProvider : undefined,
  ),
  resolvePluginMigrationProviders: vi.fn(() => []),
}));

vi.mock("../plugins/migration-provider-runtime.js", () => migrationRuntime);

const testPaths = vi.hoisted(() => {
  const suffix = `${process.pid}-${Date.now()}`;
  return {
    stateDir: `/tmp/openclaw-migration-import-state-${suffix}`,
    workspaceDir: `/tmp/openclaw-migration-import-workspace-${suffix}`,
  };
});

vi.mock("../plugins/manifest-contract-eligibility.js", () => ({
  listAvailableManifestContractPlugins: () => [],
  loadManifestContractSnapshot: () => ({}),
}));

const catalogEntry = vi.hoisted(() => ({ id: "codex" }));

vi.mock("../plugins/official-external-plugin-catalog.js", () => ({
  getOfficialExternalPluginCatalogManifest: () => ({
    contracts: { migrationProviders: ["codex"] },
  }),
  listOfficialExternalPluginCatalogEntries: () => [catalogEntry],
  resolveOfficialExternalPluginId: () => "codex",
  resolveOfficialExternalPluginInstall: () => ({ npmSpec: "@openclaw/codex" }),
  resolveOfficialExternalPluginLabel: () => "Codex",
}));

vi.mock("../commands/onboard-config.js", () => ({
  applyLocalSetupWorkspaceConfig: (cfg: Record<string, unknown>, workspace: string) => ({
    ...cfg,
    agents: { defaults: { workspace } },
  }),
  applySkipBootstrapConfig: (cfg: Record<string, unknown>) => cfg,
}));

vi.mock("../commands/onboard-helpers.js", () => ({
  DEFAULT_WORKSPACE: "/tmp/workspace",
  applyWizardMetadata: (cfg: Record<string, unknown>) => cfg,
}));

vi.mock("../commands/migrate/apply.js", () => ({
  createPreMigrationBackup: vi.fn(async () => undefined),
}));

vi.mock("../commands/migrate/context.js", () => ({
  buildMigrationReportDir: () => "/tmp/report",
  createMigrationLogger: () => ({ debug: vi.fn() }),
}));

vi.mock("../commands/migrate/output.js", () => ({
  assertApplySucceeded: vi.fn(),
  assertConflictFreePlan: vi.fn(),
  formatMigrationPreview: () => ["preview"],
  formatMigrationResult: () => ["result"],
}));

vi.mock("../config/paths.js", () => ({
  resolveStateDir: () => testPaths.stateDir,
}));

const { runSetupMigrationImport } = await import("./setup.migration-import.js");

function createPrompter(): WizardPrompter {
  return {
    confirm: vi.fn(async () => true),
    note: vi.fn(async () => undefined),
    outro: vi.fn(async () => undefined),
    select: vi.fn(),
    text: vi.fn(),
  } as unknown as WizardPrompter;
}

describe("runSetupMigrationImport installable providers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards non-ClawHub install acknowledgement into installable migration providers", async () => {
    await runSetupMigrationImport({
      opts: {
        acceptRisk: true,
        acknowledgeNonClawHubInstall: true,
        importFrom: "codex",
        importSource: "/tmp/codex-source",
        nonInteractive: true,
        workspace: testPaths.workspaceDir,
      },
      baseConfig: {},
      detections: [],
      prompter: createPrompter(),
      runtime: {} as RuntimeEnv,
      commitConfigFile: vi.fn(async (cfg) => cfg),
    });

    expect(ensureOnboardingPluginInstalled).toHaveBeenCalledOnce();
    const [installRequest] = ensureOnboardingPluginInstalled.mock.calls[0] ?? [];
    expect(installRequest?.acknowledgeNonClawHubInstall).toBe(true);
  });
});
