I built BridgeTrace to answer a frustrating Web3 question:

“My USDC left the source chain. Why hasn’t it arrived?”

A successful burn is only one step. Even a ready Circle attestation doesn’t mean the destination receive transaction happened.

BridgeTrace turns a CCTP V2 source transaction hash into a clear report:

→ Source burn confirmed?
→ Circle attestation ready?
→ Destination message received?

It shows the evidence behind each stage, suggests the next step, and lets you export a JSON report or copy a support summary.

The first version supports Ethereum ↔ Base, including Sepolia testnets. No wallet connection required. I verified a real completed testnet transfer and added 20 automated tests for delivery, expiry, and missing-data cases.

The 15-second walkthrough below uses clearly labeled simulated samples.

Try it: https://bridgetrace-rohit.speedy-elf-6136.chatgpt.site
Source: https://github.com/rohitguta2432/bridgetrace

If you’ve handled cross-chain support, which missing piece would make this more useful?

#Web3 #BuildInPublic #OpenSource #USDC #Ethereum #Base
