import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import * as p from "@clack/prompts";
import minimist from "minimist";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import open from "open";
import clipboard from "clipboardy";
import setCookieParser, { Cookie } from "set-cookie-parser";
import { generateMnemonic as generateBip39Mnemonic } from "bip39";
import { contract } from "@moneydevkit/api-contract";
import type { ContractRouterClient } from "@orpc/contract";
import type {
	BootstrapOnboardingResponse,
	StartDeviceAuthResponse,
} from "@moneydevkit/api-contract";
import { setTimeout as delay } from "node:timers/promises";
import { deriveProjectName, resolveEnvTarget } from "./utils/env-target.js";
import { detectNextJsProject } from "./utils/nextjs-detector.js";
import { scaffoldNextJs } from "./scaffold/nextjs.js";

type Flags = {
	json: boolean;
	noClipboard: boolean;
	noOpen: boolean;
	scaffoldNextjs?: boolean;
	baseUrl?: string;
	envFile?: string;
	projectName?: string;
	manualLogin?: string;
	forceNewWebhook?: boolean;
	webhookUrl?: string;
};

const DEFAULT_BASE_URL = "https://moneydevkit.com";
const DEFAULT_ENV_FILE = ".env.local";

class CookieJar {
	private store = new Map<string, string>();

	constructor(initial?: string) {
		if (initial) {
			this.add(initial);
		}
	}

	add(input: string | string[]) {
		const cookies = Array.isArray(input) ? input : [input];
		for (const line of cookies) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			const parsed = setCookieParser.parse(trimmed);
			const handle = (cookie: Cookie) => {
				if (cookie?.name && cookie.value !== undefined) {
					this.store.set(cookie.name, cookie.value);
				}
			};
			if (Array.isArray(parsed)) {
				for (const cookie of parsed) {
					handle(cookie);
				}
			} else if (parsed && typeof parsed === "object") {
				handle(parsed);
			}
		}
	}

	header(): string | undefined {
		if (this.store.size === 0) return undefined;
		return Array.from(this.store.entries())
			.map(([name, value]) => `${name}=${value}`)
			.join("; ");
	}
}

function parseFlags(argv: string[]): Flags {
	const result = minimist(argv, {
		boolean: ["json", "no-clipboard", "no-open", "force-new-webhook", "scaffold-nextjs"],
		string: [
			"base-url",
			"env-target",
			"project-name",
			"manual-login",
			"webhook-url",
		],
		alias: {
			json: "j",
		},
		default: {
			"no-clipboard": false,
			"no-open": false,
			json: false,
			"force-new-webhook": false,
			"scaffold-nextjs": false,
		},
	});

return {
	json: Boolean(result.json),
	noClipboard: Boolean(result["no-clipboard"]),
	noOpen: Boolean(result["no-open"]),
	scaffoldNextjs: Boolean(result["scaffold-nextjs"]),
	baseUrl: result["base-url"],
	envFile: result["env-target"],
		projectName:
			typeof result["project-name"] === "string"
				? result["project-name"]
				: undefined,
		manualLogin:
			typeof result["manual-login"] === "string"
				? result["manual-login"]
				: undefined,
		forceNewWebhook: Boolean(result["force-new-webhook"]),
		webhookUrl:
			typeof result["webhook-url"] === "string"
				? result["webhook-url"]
				: undefined,
	};
}

function normalizeDirectory(dir: string): string {
	if (path.isAbsolute(dir)) return dir;
	return path.resolve(process.cwd(), dir);
}

function ensureDirectoryExists(dir: string) {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
}

function readEnvFile(filePath: string): Map<string, string> {
	const env = new Map<string, string>();
	if (!fs.existsSync(filePath)) {
		return env;
	}
	const contents = fs.readFileSync(filePath, "utf8");
	for (const line of contents.split(/\r?\n/)) {
		if (!line || line.startsWith("#")) continue;
		const [key, ...rest] = line.split("=");
		if (!key) continue;
		env.set(key.trim(), rest.join("=").trim());
	}
	return env;
}

function renderEnvPreview(
	_original: Map<string, string>,
	updates: Record<string, string>,
): string {
	const lines: string[] = ["Writing the following values:", ""];
	for (const [key, value] of Object.entries(updates)) {
		lines.push(`  ${key}=${value}`);
	}
	return lines.join("\n");
}

function writeEnvFile(
	filePath: string,
	existing: Map<string, string>,
	updates: Record<string, string>,
) {
	for (const [key, value] of Object.entries(updates)) {
		existing.set(key, value);
	}
	const content =
		Array.from(existing.entries())
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, value]) => `${key}=${value}`)
			.join(os.EOL) + os.EOL;
	fs.writeFileSync(filePath, content, "utf8");
}

function ensureEnvFileExists(filePath: string) {
	const dir = path.dirname(filePath);
	ensureDirectoryExists(dir);
	if (!fs.existsSync(filePath)) {
		fs.writeFileSync(filePath, "", "utf8");
	}
}

function resolveLocalEnvPath(options: {
	organizationId?: string;
	apiKeyId?: string;
}): string | undefined {
	const organization = options.organizationId?.trim();
	const apiKey = options.apiKeyId?.trim();
	if (!organization || !apiKey) {
		return undefined;
	}
	const homeDir = os.homedir();
	return path.join(homeDir, ".mdk", organization, apiKey, ".env");
}

function isValidHttpUrl(value?: string): boolean {
	if (!value) return false;
	try {
		const parsed = new URL(value);
		return parsed.protocol === "https:" || parsed.protocol === "http:";
	} catch {
		return false;
	}
}

function createRpcClient(
	baseUrl: string,
	jar: CookieJar,
): ContractRouterClient<typeof contract> {
	const link = new RPCLink({
		url: `${baseUrl.replace(/\/$/, "")}/rpc`,
		headers: () => {
			const cookieHeader = jar.header();
			return cookieHeader ? { Cookie: cookieHeader } : {};
		},
		fetch: async (input, init) => {
			const response = await fetch(input, init);
			const setCookie = response.headers.getSetCookie?.() ?? [];
			if (setCookie.length > 0) {
				jar.add(setCookie);
			}
			return response;
		},
	});

	return createORPCClient(link) as ContractRouterClient<typeof contract>;
}

async function runDeviceFlow(options: {
	flags: Flags;
	baseUrl: string;
	cookies: CookieJar;
	projectName?: string;
	webhookUrl: string;
}): Promise<{
	device: StartDeviceAuthResponse;
	bootstrapToken: string;
	credentials: BootstrapOnboardingResponse;
	mnemonic: string;
}> {
	const client = createRpcClient(options.baseUrl, options.cookies);
const manualSessionCookie = options.flags.manualLogin;
const webhookUrl = options.webhookUrl;

const device = await client.onboarding.startDeviceAuth({
    clientDisplayName: options.projectName,
    webhookUrl,
    forceNewWebhook: options.flags.forceNewWebhook,
});

	if (manualSessionCookie) {
		const response = await fetch(
			`${options.baseUrl.replace(/\/$/, "")}/api/cli/device/authorize`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Cookie: manualSessionCookie,
				},
				body: JSON.stringify({
					code: device.userCode,
					forceNewWebhook: options.flags.forceNewWebhook ?? false,
				}),
			},
		);

		if (!response.ok) {
			const body = (await response.json().catch(() => ({}))) as {
				error?: string;
			};
			throw new Error(
				body.error ??
					`Manual authorize failed with status ${response.status}`,
			);
		}
	} else {
        if (!options.flags.json) {
            p.note(
                [
                    `Device code: ${device.userCode}`,
                    `Domain: ${webhookUrl}`,
                    "Open the authorization page, click Authorize, then return to this terminal.",
                ].join("\n"),
                "Authorize this device",
            );
        }

		if (!options.flags.noOpen && !options.flags.json) {
			try {
				await open(device.verificationUri, { wait: false });
			} catch (error) {
				console.warn(
					`Unable to open browser automatically (${(error as Error).message}).`,
				);
				console.warn(`Open this URL manually: ${device.verificationUri}`);
			}
		} else if (!options.flags.json) {
			console.log(`Open this URL in your browser: ${device.verificationUri}`);
		}

		const spinner = options.flags.json ? null : p.spinner();
		spinner?.start("Waiting for authorization...");

		const deadline = Date.now() + device.expiresIn * 1000;
		let bootstrapToken: string | undefined;

		while (Date.now() < deadline) {
			const poll = await client.onboarding.pollDeviceAuth({
				deviceCode: device.deviceCode,
			});

			if (poll.status === "authorized") {
				bootstrapToken = poll.bootstrapToken;
				spinner?.stop("Device authorized.");
				break;
			}

			if (poll.status === "expired") {
				spinner?.stop("Device code expired.");
				throw new Error("Device code expired before authorization.");
			}

			if (poll.status === "denied") {
				spinner?.stop("Authorization denied.");
				throw new Error("Authorization was denied in the dashboard.");
			}

        const secondsLeft = Math.max(
            0,
            Math.floor((deadline - Date.now()) / 1000),
        );
        spinner?.message(
            `Waiting for authorization (${secondsLeft}s remaining)`,
			);
			await delay(device.interval * 1000);
		}

		if (!bootstrapToken) {
			throw new Error("Timed out waiting for authorization.");
		}

        const credentials = await client.onboarding.bootstrap({
            bootstrapToken,
            projectName: options.projectName,
            webhookUrl,
            forceNewWebhook: options.flags.forceNewWebhook,
		});

		const mnemonic = generateBip39Mnemonic(128);

		return {
			device,
			bootstrapToken,
			credentials,
			mnemonic,
		};
	}

	// Manual path: poll once to get the bootstrap token.
	const pollResult = await client.onboarding.pollDeviceAuth({
		deviceCode: device.deviceCode,
	});

	if (pollResult.status !== "authorized") {
		throw new Error(
			`Unable to obtain bootstrap token (status: ${pollResult.status}).`,
		);
	}

	const credentials = await client.onboarding.bootstrap({
		bootstrapToken: pollResult.bootstrapToken,
		projectName: options.projectName,
		webhookUrl,
		forceNewWebhook: options.flags.forceNewWebhook,
	});

	const mnemonic = generateBip39Mnemonic(128);

	return {
		device,
		bootstrapToken: pollResult.bootstrapToken,
		credentials,
		mnemonic,
	};
}

async function main() {
	const flags = parseFlags(process.argv.slice(2));
	const jsonMode = flags.json;

	if (!jsonMode) {
		p.intro("Money Dev Kit – @moneydevkit/create");
	}

	const baseUrl = flags.baseUrl ?? DEFAULT_BASE_URL;
	const cookies = new CookieJar(flags.manualLogin);

	const envFileOverride = process.env.MDK_ENV_FILE;
	const envResolution = resolveEnvTarget({
		explicitTarget: flags.envFile,
		overrideTarget: envFileOverride,
		cwd: process.cwd(),
		defaultFilename: DEFAULT_ENV_FILE,
	});
	const { providedExplicitly } = envResolution;
	let projectDir = envResolution.projectDir;
	let envFile = envResolution.envFile;

	if (!providedExplicitly && !jsonMode && !flags.envFile) {
		const dirPrompt = await p.text({
			message: "Where should we store your MDK credentials?",
			initialValue: projectDir,
		});

		if (p.isCancel(dirPrompt)) {
			p.cancel("Aborted.");
			process.exit(1);
		}
		projectDir = dirPrompt;
	}

	projectDir = normalizeDirectory(projectDir);
	ensureDirectoryExists(projectDir);

	if (!flags.envFile && !envFileOverride && !jsonMode) {
		const envPrompt = await p.text({
			message: "Env file to update",
			initialValue: envFile,
		});

		if (p.isCancel(envPrompt)) {
			p.cancel("Aborted.");
			process.exit(1);
		}
		envFile = envPrompt.trim() || DEFAULT_ENV_FILE;
	}

	const envPath = path.join(projectDir, envFile);
	const existingEnvValues = readEnvFile(envPath);
	const mnemonicAlreadySet = existingEnvValues.get("MDK_MNEMONIC")?.trim();

	if (mnemonicAlreadySet) {
		const warningMessage =
			"We found MDK_MNEMONIC already set in your project. Your mnemonic is the key to your wallet. If you've already deployed and taken payments with this mnemonic and change it, you will lose access to your funds. If you want to generate a new mnemonic, delete MDK_MNEMONIC from your .env and try again.";

		if (jsonMode) {
			console.error(
				JSON.stringify(
					{
						status: "error",
						error: { message: warningMessage },
					},
					null,
					2,
				),
			);
		} else {
			p.cancel(warningMessage);
		}

		process.exit(1);
	}

	let webhookUrl = flags.webhookUrl?.trim();
	if ((!webhookUrl || !isValidHttpUrl(webhookUrl)) && jsonMode) {
		throw new Error("Provide a valid --webhook-url when running in --json mode.");
	}

	while (!webhookUrl) {
		const webhookInput = await p.text({
			message: "Domain for your application",
			initialValue: "https://",
			placeholder: "https://yourapp.com",
			validate: (value) =>
				isValidHttpUrl(value?.trim())
					? undefined
					: "Enter a valid http(s) URL (e.g. https://yourapp.com)",
		});

		if (p.isCancel(webhookInput)) {
			p.cancel("Aborted.");
			process.exit(1);
		}

		webhookUrl = webhookInput.trim();
	}

	let projectName = flags.projectName?.trim();
	if (!projectName && !jsonMode) {
		const namePrompt = await p.text({
			message: "Project name (used for the generated API key)",
			placeholder: "Optional: e.g. My Next.js Store",
		});
		if (p.isCancel(namePrompt)) {
			p.cancel("Aborted.");
			process.exit(1);
		}
		projectName = namePrompt.trim() || undefined;
	}

	projectName = deriveProjectName(projectName, webhookUrl);

	const nextJsDetection = detectNextJsProject(projectDir);
	let shouldScaffoldNextJs = false;

	if (flags.scaffoldNextjs) {
		if (nextJsDetection.found) {
			if (nextJsDetection.versionIsSupported) {
				shouldScaffoldNextJs = true;
			} else {
				console.warn(
					`Next.js version ${nextJsDetection.nextVersion ?? "unknown"} detected, but @moneydevkit/nextjs requires Next.js 15+. Skipping installation and scaffolding.`,
				);
			}
		} else {
			console.warn(
				"No NextJS app found, skipping @moneydevkit/nextjs installation. Please install manually.",
			);
		}
	} else if (!jsonMode && nextJsDetection.found) {
		if (!nextJsDetection.versionIsSupported) {
			console.warn(
				`Next.js version ${nextJsDetection.nextVersion ?? "unknown"} detected, but @moneydevkit/nextjs requires Next.js 15+. Skipping scaffolding prompt.`,
			);
		} else {
			const scaffoldPrompt = await p.confirm({
				message: `Next.js application detected at ${
					nextJsDetection.rootDir ?? projectDir
				} (version ${nextJsDetection.nextVersion ?? "unknown"}). Install and scaffold @moneydevkit/nextjs?`,
				initialValue: true,
			});

			if (p.isCancel(scaffoldPrompt)) {
				p.cancel("Aborted.");
				process.exit(1);
			}

			shouldScaffoldNextJs = Boolean(scaffoldPrompt);
		}
	}

	try {
		const result = await runDeviceFlow({
			flags,
			baseUrl,
			cookies,
			projectName,
			webhookUrl,
		});

		const updates: Record<string, string> = {
			MDK_ACCESS_TOKEN: result.credentials.apiKey,
			MDK_MNEMONIC: result.mnemonic,
		};

		ensureEnvFileExists(envPath);
		const existingEnv = readEnvFile(envPath);
		const preview = renderEnvPreview(existingEnv, updates);

		writeEnvFile(envPath, existingEnv, updates);

		const localEnvPath = resolveLocalEnvPath({
			organizationId: result.credentials.organizationId,
			apiKeyId: result.credentials.apiKeyId,
		});
		if (localEnvPath) {
			ensureEnvFileExists(localEnvPath);
			const localEnv = readEnvFile(localEnvPath);
			writeEnvFile(localEnvPath, localEnv, updates);
		}

		if (!jsonMode) {
			p.note(preview, "Env file updated");
		}

        if (!flags.noClipboard) {
            await clipboard.write(
				[`MDK_ACCESS_TOKEN=${updates.MDK_ACCESS_TOKEN}`, `MDK_MNEMONIC=${updates.MDK_MNEMONIC}`].join(
					"\n",
				),
			);
		}

		let scaffoldSummary: Awaited<ReturnType<typeof scaffoldNextJs>> | null =
			null;

		if (shouldScaffoldNextJs && nextJsDetection.found) {
			try {
				scaffoldSummary = await scaffoldNextJs({
					detection: nextJsDetection,
					jsonMode,
				});

				if (!jsonMode && scaffoldSummary) {
					const lines = [
						scaffoldSummary.installedPackage
							? `Installed @moneydevkit/nextjs with ${scaffoldSummary.packageManager}.`
							: scaffoldSummary.installSkipped
								? "@moneydevkit/nextjs already installed; skipped package install."
								: "Skipped @moneydevkit/nextjs installation.",
					];

						if (scaffoldSummary.config) {
							const cfg = scaffoldSummary.config;
							if (cfg.status === "created") {
								lines.push(`Created ${cfg.path} with withMdkCheckout().`);
								if (cfg.backupPath) {
									lines.push(`Created backup at ${cfg.backupPath}.`);
								}
							} else if (cfg.status === "updated") {
								lines.push(`Updated ${cfg.path} with withMdkCheckout().`);
								if (cfg.backupPath) {
									lines.push(`Created backup at ${cfg.backupPath}.`);
								}
							} else {
								lines.push(
									`Could not update ${cfg.path} automatically (${cfg.reason ?? "unknown reason"}).`,
								);
							}
						}

					if (scaffoldSummary.addedFiles.length > 0) {
						lines.push(
							`Added: ${scaffoldSummary.addedFiles
								.map((p) => path.relative(projectDir, p))
								.join(", ")}`,
						);
					}

					if (scaffoldSummary.skippedFiles.length > 0) {
						lines.push(
							`Skipped existing files: ${scaffoldSummary.skippedFiles
								.map((p) => path.relative(projectDir, p))
								.join(", ")}`,
						);
					}

					p.note(lines.join("\n"), "Next.js scaffolding");
				}

				if (scaffoldSummary?.warnings.length) {
					for (const warning of scaffoldSummary.warnings) {
						console.warn(warning);
					}
				}
			} catch (error) {
				const message =
					error instanceof Error ? error.message : String(error);
				if (jsonMode) {
					console.error(
						JSON.stringify(
							{
								status: "error",
								error: {
									message: `Next.js scaffolding failed: ${message}`,
								},
							},
							null,
							2,
						),
					);
				} else {
					console.warn(`Next.js scaffolding failed: ${message}`);
				}
			}
		}

		const summary = {
			projectDir,
			envFile: envPath,
			apiKeyPreview: result.credentials.apiKeyPreview,
			webhookId: result.credentials.webhookId,
			organizationId: result.credentials.organizationId,
			webhookUrl: result.credentials.webhookUrl,
			mnemonic: updates.MDK_MNEMONIC,
			scaffoldedNextjs: Boolean(scaffoldSummary),
		};

        if (jsonMode) {
            console.log(
                JSON.stringify(
                    {
                        status: "success",
                        data: {
							envFile: envPath,
							apiKeyId: result.credentials.apiKeyId,
							apiKeyPreview: result.credentials.apiKeyPreview,
							webhookId: result.credentials.webhookId,
							webhookSecret: result.credentials.webhookSecret,
							webhookUrl: result.credentials.webhookUrl,
							organizationId: result.credentials.organizationId,
							mnemonic: updates.MDK_MNEMONIC,
							scaffoldedNextjs: Boolean(scaffoldSummary),
						},
					},
					null,
					2,
                ),
            );
        } else {
            p.outro(
                [
                    "Authorized successfully!",
                    `• Credentials written to ${envPath}`,
                    `• Webhook ID: ${result.credentials.webhookId}`,
                    `• Organization: ${result.credentials.organizationId}`,
                    flags.noClipboard
                        ? "Clipboard copy skipped (--no-clipboard)."
                        : "Secrets copied to clipboard.",
                    "Return to your project and continue development.",
                ].join("\n"),
            );
        }

        return summary;
	} catch (error) {
		if (jsonMode) {
			console.error(
				JSON.stringify(
					{
						status: "error",
						error: {
							message:
								error instanceof Error ? error.message : String(error),
						},
					},
					null,
					2,
				),
			);
		} else {
			p.cancel(
				error instanceof Error ? error.message : `Unexpected error: ${error}`,
			);
		}
		process.exit(1);
	}
}

void main();
