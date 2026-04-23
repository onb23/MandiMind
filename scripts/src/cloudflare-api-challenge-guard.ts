import process from "node:process";

type CfResp<T> = { success: boolean; errors: Array<{ message: string }>; result: T };

type Zone = { id: string; name: string };
type Setting = { id: string; value: unknown; editable?: boolean; modified_on?: string };

type RulesetPhase = {
  id: string;
  name: string;
  phase: string;
  rules?: Array<{ id: string; description?: string; expression?: string; action?: string }>;
};

const API_BASE = "https://api.cloudflare.com/client/v4";

const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) {
  console.error("Missing CLOUDFLARE_API_TOKEN");
  process.exit(1);
}

const zoneName = process.env.CLOUDFLARE_ZONE_NAME ?? "mandimind.tech";
const apiHost = process.env.CLOUDFLARE_API_HOST ?? "api.mandimind.tech";
const dryRun = process.argv.includes("--dry-run") || !process.argv.includes("--apply");

async function cf<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const data = (await res.json()) as CfResp<T>;
  if (!data.success) {
    const err = data.errors.map((e) => e.message).join("; ");
    throw new Error(`Cloudflare API error (${path}): ${err}`);
  }
  return data.result;
}

async function getZoneId(name: string): Promise<string> {
  const zones = await cf<Zone[]>(`/zones?name=${encodeURIComponent(name)}&status=active`);
  if (!zones.length) throw new Error(`No active zone found for ${name}`);
  return zones[0].id;
}

async function readSetting(zoneId: string, settingId: string): Promise<Setting> {
  return cf<Setting>(`/zones/${zoneId}/settings/${settingId}`);
}

async function listPhase(zoneId: string, phase: string): Promise<RulesetPhase[]> {
  return cf<RulesetPhase[]>(`/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`);
}

async function main(): Promise<void> {
  const zoneId = await getZoneId(zoneName);
  console.log(`Zone: ${zoneName} (${zoneId})`);
  console.log(`Target API host: ${apiHost}`);

  const settingsToRead = ["browser_check", "security_level", "bot_fight_mode", "super_bot_fight_mode"];
  console.log("\nCurrent zone-wide security settings:");
  for (const settingId of settingsToRead) {
    try {
      const setting = await readSetting(zoneId, settingId);
      console.log(`- ${setting.id}:`, setting.value);
    } catch (err) {
      console.log(`- ${settingId}: unavailable (${(err as Error).message})`);
    }
  }

  console.log("\nCurrent ruleset phases:");
  for (const phase of ["http_request_firewall_custom", "http_request_firewall_managed"]) {
    try {
      const ruleset = await listPhase(zoneId, phase);
      const rules = ruleset?.[0]?.rules ?? [];
      const relevant = rules.filter((r) => {
        const expr = `${r.expression ?? ""} ${r.description ?? ""}`.toLowerCase();
        return expr.includes(apiHost.toLowerCase()) || expr.includes("/api/");
      });
      console.log(`- ${phase}: total ${rules.length} rules, relevant ${relevant.length}`);
      for (const rule of relevant) {
        console.log(`  • ${rule.id} [${rule.action}] ${rule.description ?? "(no description)"}`);
      }
    } catch (err) {
      console.log(`- ${phase}: unavailable (${(err as Error).message})`);
    }
  }

  const recommendation = {
    description: "Bypass interactive challenges for API origin and API routes",
    expression: `(http.host eq \"${apiHost}\") or (http.request.uri.path starts_with \"/api/\")`,
    action: "skip",
    action_parameters: {
      phases: ["http_request_firewall_managed", "http_ratelimit"],
      products: ["bic", "securityLevel", "botFightMode", "superBotFightMode", "waf"],
    },
    enabled: true,
  };

  console.log("\nRecommended custom WAF rule payload:");
  console.log(JSON.stringify(recommendation, null, 2));

  if (dryRun) {
    console.log("\nDry run only. Re-run with --apply to attempt to create this rule in the custom firewall phase entrypoint.");
    return;
  }

  try {
    const existing = await listPhase(zoneId, "http_request_firewall_custom");
    const entrypointId = existing?.[0]?.id;
    if (!entrypointId) {
      throw new Error("No custom firewall phase entrypoint found");
    }

    const updatedRules = [...(existing[0].rules ?? []), recommendation as never];
    await cf(`/zones/${zoneId}/rulesets/${entrypointId}`, {
      method: "PUT",
      body: JSON.stringify({
        description: existing[0].name,
        kind: "zone",
        name: existing[0].name,
        phase: "http_request_firewall_custom",
        rules: updatedRules,
      }),
    });
    console.log("\nApplied: custom firewall rule appended.");
  } catch (err) {
    console.error(`\nApply failed: ${(err as Error).message}`);
    process.exit(2);
  }
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
