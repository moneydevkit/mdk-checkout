export const MAINNET_MDK_BASE_URL = 'https://moneydevkit.com/rpc'
export const SIGNET_MDK_BASE_URL = 'https://staging.moneydevkit.com/rpc'

export const MAINNET_MDK_NODE_OPTIONS = {
  network: 'mainnet',
  vssUrl: 'https://vss.moneydevkit.com/vss',
  esploraUrl: 'https://esplora.moneydevkit.com/api',
  rgsUrl: 'https://rapidsync.lightningdevkit.org/snapshot/v2',
  lspNodeId: '02a63339cc6b913b6330bd61b2f469af8785a6011a6305bb102298a8e76697473b',
  lspAddress: 'lsp.moneydevkit.com:9735',
} as const

export const SIGNET_MDK_NODE_OPTIONS = {
  network: 'signet',
  vssUrl: 'https://vss.staging.moneydevkit.com/vss',
  esploraUrl: 'https://mutinynet.com/api',
  rgsUrl: 'https://rgs.mutinynet.com/snapshot',
  lspNodeId: '03fd9a377576df94cc7e458471c43c400630655083dee89df66c6ad38d1b7acffd',
  lspAddress: 'lsp.staging.moneydevkit.com:9735',
} as const
