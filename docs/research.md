# Problem research and source provenance

BridgeTrace addresses uncertainty about which stage of a CCTP transfer needs attention.

Circle exposes confirmation, attestation, and receive steps separately. This creates a narrow product opportunity: translate evidence into a report a user can understand and attach to a support request. This is a hypothesis supported by protocol documentation, not proof of customer demand or uniqueness. The first version concentrates on two EVM chains so it can validate on-chain receipt evidence reliably.

Primary sources reviewed October 6, 2026:

- [Supported chains and domains](https://developers.circle.com/cctp/concepts/supported-chains-and-domains) — Ethereum domain 0 and Base domain 6.
- [CCTP contract addresses](https://developers.circle.com/cctp/references/contract-addresses) — environment-specific TokenMessenger V2 and MessageTransmitter V2 contracts.
- [Get messages V2 API](https://developers.circle.com/api-reference/cctp/all/get-messages-v2) — `complete` describes attestation readiness, decoded fields, and optional destination forwarding hints.
- [Technical guide](https://developers.circle.com/cctp/references/technical-guide) — message format, burn/attestation/receive workflow.
- [Finality and confirmations](https://developers.circle.com/cctp/concepts/finality-and-block-confirmations) — why source inclusion does not immediately produce an attestation.
- [Resolve a stuck attestation](https://developers.circle.com/cctp/howtos/resolve-stuck-attestation) — recovery context linked through the originating app, not automatically executed here.
- [MessageTransmitter V2 source](https://github.com/circlefin/evm-cctp-contracts/blob/master/src/v2/MessageTransmitterV2.sol) and [base implementation](https://github.com/circlefin/evm-cctp-contracts/blob/master/src/v2/BaseMessageTransmitter.sol) — `usedNonces(bytes32)`, reserved zero nonce, receipt event ABI, and receive processing.
- [TokenMessenger V2 source](https://github.com/circlefin/evm-cctp-contracts/blob/master/src/v2/TokenMessengerV2.sol) — mint processing and expiration block comparison.

## Public test fixture

`tests/fixtures/circle-completed-testnet.json` was fetched from Circle’s sandbox messages endpoint for source domain 6 and this public burn hash:

`0xfd179416c444f9cbd834af4e8b41db4e0712ae145f3a0ad729ede20b9eb0f66f`

[Base Sepolia source transaction](https://base-sepolia.blockscout.com/tx/0xfd179416c444f9cbd834af4e8b41db4e0712ae145f3a0ad729ede20b9eb0f66f) · [Ethereum Sepolia destination transaction](https://eth-sepolia.blockscout.com/tx/0x4a8fb915dd9f12535865f8db8de055f083b1dcbd6fcb749c9ee9974f6818c7ba)

The public source burned 15 USDC. The destination was independently checked through its receipt/event and a live nonce lookup. Unit tests construct deterministic receipts around this fixture and mutate evidence to exercise failure states; they do not submit transactions. The dashboard examples are separate fictional sample data.
