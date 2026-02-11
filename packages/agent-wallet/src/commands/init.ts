import * as bip39 from 'bip39'
import { configExists, loadConfig, saveConfig, generateWalletId, type WalletConfig } from '../config.js'
import type { Network } from '../mdk-config.js'

export interface InitOptions {
  show?: boolean
  network?: Network
}

export function init(options: InitOptions): void {
  if (options.show) {
    const config = loadConfig()
    if (!config) {
      console.log(JSON.stringify({ error: 'Not initialized' }))
      process.exit(1)
    }

    // Redact mnemonic for display
    const words = config.mnemonic.split(' ')
    const redacted = words.slice(0, 2).join(' ') + ' ... ' + words.slice(-2).join(' ')

    console.log(
      JSON.stringify({
        mnemonic: redacted,
        network: config.network,
        walletId: config.walletId,
      })
    )
    return
  }

  if (configExists()) {
    console.log(JSON.stringify({ error: 'Already initialized. Use --show to view config.' }))
    process.exit(1)
  }

  const mnemonic = bip39.generateMnemonic(128) // 12 words
  const network: Network = options.network ?? 'mainnet'
  const walletId = generateWalletId()

  const config: WalletConfig = {
    mnemonic,
    network,
    walletId,
  }

  saveConfig(config)

  console.log(
    JSON.stringify({
      status: 'initialized',
      network,
      walletId,
      mnemonic,
    })
  )

  console.error('\n⚠️  IMPORTANT: Save your mnemonic securely. It cannot be recovered.')
}
