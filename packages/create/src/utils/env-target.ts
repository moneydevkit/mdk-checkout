import path from "node:path";

export type EnvTargetResolution = {
  projectDir: string;
  envFile: string;
  providedExplicitly: boolean;
};

export function resolveEnvTarget(options: {
  explicitTarget?: string;
  overrideTarget?: string;
  cwd: string;
  defaultFilename: string;
}): EnvTargetResolution {
  const { explicitTarget, overrideTarget, cwd, defaultFilename } = options;
  const rawTarget = explicitTarget ?? overrideTarget ?? defaultFilename;
  const hasPathSeparator = rawTarget.includes("/") || rawTarget.includes("\\");

  let projectDir = cwd;
  let envFile = path.basename(rawTarget);
  let providedExplicitly = Boolean(explicitTarget);

  if (path.isAbsolute(rawTarget)) {
    projectDir = path.dirname(rawTarget);
    envFile = path.basename(rawTarget);
    providedExplicitly = true;
  } else if (hasPathSeparator) {
    const relativeDir = path.dirname(rawTarget);
    if (relativeDir && relativeDir !== "." && relativeDir !== "") {
      projectDir = path.resolve(cwd, relativeDir);
      envFile = path.basename(rawTarget);
      providedExplicitly = true;
    }
  }

  return {
    projectDir: path.resolve(projectDir),
    envFile,
    providedExplicitly,
  };
}

export function deriveProjectName(input: string | undefined, webhookUrl: string): string {
  const trimmed = input?.trim();
  if (trimmed) {
    return trimmed;
  }
  return webhookUrl;
}
