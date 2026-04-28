export const MAINNET_NODE_OPTIONS = {
  network: 'mainnet' as const,
  vssUrl: 'https://vss.moneydevkit.com/vss',
  esploraUrl: 'https://esplora.moneydevkit.com/api',
  rgsUrl: 'https://rapidsync.lightningdevkit.org/snapshot/v2',
  lspNodeId: '02a63339cc6b913b6330bd61b2f469af8785a6011a6305bb102298a8e76697473b',
  lspAddress: 'lsp.moneydevkit.com:9735',
  scoringParamOverrides: {
    // 100x default. Willing to spend 102.4 sats to avoid an extra hop
    basePenaltyMsat: 102400,
    // Temporary. Rest are upstream LDK defaults to override our own forked values
    basePenaltyAmountMultiplierMsat: 131_072,
    liquidityPenaltyMultiplierMsat: 0,
    liquidityPenaltyAmountMultiplierMsat: 0,
    manualNodePenalties: {},
    antiProbingPenaltyMsat: 250,
    consideredImpossiblePenaltyMsat: 100_000_000_000,
    historicalLiquidityPenaltyMultiplierMsat: 10_000,
    historicalLiquidityPenaltyAmountMultiplierMsat: 1_250,
    linearSuccessProbability: false,
    probingDiversityPenaltyMsat: 0,
  },
}

export const SIGNET_NODE_OPTIONS = {
  network: 'signet' as const,
  vssUrl: 'https://vss.staging.moneydevkit.com/vss',
  esploraUrl: 'https://mutinynet.com/api',
  rgsUrl: 'https://rgs.mutinynet.com/snapshot',
  lspNodeId: '03fd9a377576df94cc7e458471c43c400630655083dee89df66c6ad38d1b7acffd',
  lspAddress: 'lsp.staging.moneydevkit.com:9735',
  scoringParamOverrides: {},
}

export type Network = 'mainnet' | 'signet'

export function getNodeOptions(network: Network) {
  return network === 'signet' ? SIGNET_NODE_OPTIONS : MAINNET_NODE_OPTIONS
}
