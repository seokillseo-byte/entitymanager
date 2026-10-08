import type { IntegrationAdapterResult, IntegrationCapability, IntegrationType, ProviderConfig } from "@entitymanager/shared";

const capabilityMap: Record<IntegrationType, IntegrationCapability[]> = {
  ai: ["generate_text"],
  captcha: ["solve_captcha"],
  email: ["send_email", "receive_email"],
  proxy: ["proxy"],
  indexing: ["index_url"]
};

export function buildProviderConfig(input: Omit<ProviderConfig, "capabilities">): ProviderConfig {
  return {
    ...input,
    capabilities: capabilityMap[input.type]
  };
}

export function testIntegrationAdapter(config: ProviderConfig): IntegrationAdapterResult {
  const hasStoredKey = config.keyStatus === "stored" || config.keyStatus === "masked" || config.keyStatus === "secure";
  const isReady = config.isEnabled && hasStoredKey;

  return {
    type: config.type,
    provider: config.provider,
    isReady,
    mode: "dry_run",
    message: isReady
      ? `${config.provider} adapter is configured for dry-run validation.`
      : `${config.provider} adapter needs an enabled setting and stored key before live use.`,
    capabilities: config.capabilities
  };
}
