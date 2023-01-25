# P2SHDATA
Read/Write files to the blockchain using opreturn.net's P2SHDATA protocol.

P2SHDATA is a protocol to store data contained in pay-to-script-hash (p2sh) scriptsigs.
> All work published in this repository is an interpretation of the P2SHDATA protocol as described by [opreturn.net/p2shdata](https://opreturn.net/p2shdata). The author of this repository is not affiliated with opreturn.net.

## Usage
- Have node.js and npm installed
  - You can install them from [here](https://nodejs.org/en/download/)
- Clone this repository `git clone https://github.com/MaxPuig/p2shdata.git`
- Install dependencies `npm install`
- If you want to decode a file in a transaction:
  - Change the `txid` variable in `decode_p2shdata.js`
  - Run the file: `node decode_p2shdata.js`
  - See the file in the `data` folder
- If you want to encode and publish a file to the blockchain
  - Work in progress, stay tuned!