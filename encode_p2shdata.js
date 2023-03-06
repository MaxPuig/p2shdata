import garlicore from 'bitcore-lib-grlc';
import { ElectrumClient } from '@samouraiwallet/electrum-client';
const client = new ElectrumClient(50002, 'services.garlicoin.ninja', 'tls');
import fs from 'fs';

//////////////////////////////// EDIT ////////////////////////////////
const password = 'password'; // This password will be the PrivateKey for the origin address. You'll have to fund it
const origin_address_funded = false; // Is the above address funded? (Run once with false, to get the address, then fund it and run again with true)
const multiple_addresses_funded = false; // This should only be true if all the addresses are funded. (Usually false unless an error happens)
let multiple_addresses_funded_txid = ''; // This should be blank. If the above is true, place in the transaction ID of the transaction that funded all the addresses.
const destination_address = 'GNT5zFdyyXRrW8QQLHsAF4F5PZ3E397zg1'; // Where all the grlc will be sent.
const origin_address_fee = 100_000; // 0.001 GRLC
const destination_address_fee = 1_000_000; // 0.01 GRLC

const file = fs.readFileSync('./upload/grlc.png', 'hex'); // location of the file to upload
const filename = 'grlc';
const filetype = 'png';
const encoding = '64'; // hex: "16", decimal: "10", base64: "64", UTF-8: "f8" or ASCII: undefined.
const salt = 69;
const site = 'maxpuig.com'; // opreturn.net
const protocol = '/p2shdata';
const version = 1;
//////////////////////////////// EDIT ////////////////////////////////


const privateKey = new garlicore.PrivateKey(garlicore.crypto.BN.fromBuffer(garlicore.crypto.Hash.sha256(Buffer.from(password))));
const origin_address = privateKey.toAddress();
const origin_address_string = origin_address.toString();
if (!origin_address_funded) {
    console.log('Fund this address:', origin_address_string);
    process.exit();
}

const chunks = file.match(/.{1,1000}/g); // 500 byte chunks
if(chunks.length > 176) throw new Error('File is too large. Max 88 kB.');
const assembly_script = {
    vin_start: 0,
    vin_end: chunks.length - 1,
    encoding
}
const op_return = createOpReturn(site, protocol, version, filename, filetype, file, assembly_script);
const address_and_redeemscript = getAddressesAndRedeemScripts(chunks, salt);

main();

async function main() {
    try {
        if (!multiple_addresses_funded) {
            connectToElectrum();
            let utxos_temp = await client.blockchainAddress_listunspent(origin_address_string);
            let total_amount_temp = 0;
            utxos_temp = utxos_temp.map(utxo => {
                total_amount_temp += utxo.value;
                return new garlicore.Transaction.UnspentOutput({
                    "txId": utxo.tx_hash,
                    "outputIndex": utxo.tx_pos,
                    "address": origin_address_string,
                    "script": new garlicore.Script(origin_address),
                    "satoshis": utxo.value,
                })
            });
            if(total_amount_temp < origin_address_fee) throw new Error('Insufficient funds in origin address');
            total_amount_temp -= origin_address_fee; // fee
            let tx_temp = new garlicore.Transaction();
            tx_temp.from(utxos_temp);
            for (let pair of address_and_redeemscript) {
                tx_temp.to(pair.address, Math.round(total_amount_temp / address_and_redeemscript.length));
            }
            tx_temp.change(destination_address);
            tx_temp.sign(privateKey);
            let serialized_tx_temp = tx_temp.toString();
            console.log('Broadcasting transaction...');
            multiple_addresses_funded_txid = await client.blockchainTransaction_broadcast(serialized_tx_temp);
            console.log('Transaction ID funding all the addresses:', multiple_addresses_funded_txid);
            client.close();
            console.log('Waiting 10 seconds for the transaction to be confirmed...');
            await sleep(10000);
        }
        connectToElectrum();
        let utxos_addresses = await client.blockchainTransaction_get(multiple_addresses_funded_txid);
        utxos_addresses = garlicore.Transaction(utxos_addresses).toObject().outputs;
        let tx = new garlicore.Transaction();
        let total_amount = 0;
        for (let i = 0; i < utxos_addresses.length; i++) {
            total_amount += utxos_addresses[i].satoshis;
            let utxo = new garlicore.Transaction.UnspentOutput({
                "txId": multiple_addresses_funded_txid,
                "outputIndex": i,
                "address": address_and_redeemscript[i].address,
                "script": utxos_addresses[i].script,
                "satoshis": utxos_addresses[i].satoshis,
            });
            tx.from(utxo);
        }
        tx.to(destination_address, total_amount - destination_address_fee);
        tx.addData(op_return);
        tx.uncheckedSerialize();
        for (let i = 0; i < tx.inputs.length; i++) {
            tx.inputs[i].setScript(address_and_redeemscript[i].unlockingScript);
        }
        let serialized_tx = tx.toString();
        console.log('Broadcasting transaction...');
        let txid = await client.blockchainTransaction_broadcast(serialized_tx);
        console.log('Transaction ID:', txid);
        client.close();

    } catch (e) {
        client.close();
        console.log(e);
    }
}

function getAddressesAndRedeemScripts(chunks, salt) {
    const info = [];
    for (let chunk of chunks) {
        let op_codes_start;
        let unlockingScript;
        if (chunk.length < 76 * 2) {
            op_codes_start = (chunk.length / 2).toString(16).padStart(2, '0'); // OP_PUSH(1-75)
        } else if (chunk.length < 256 * 2) {
            op_codes_start = '4c' + (chunk.length / 2).toString(16).padStart(2, '0'); // OP_PUSHDATA1 + (75-255)
        } else {
            op_codes_start = '4d' + decimalToHexLittleEndian(chunk.length / 2); // OP_PUSHDATA2 + (256-500) (little endian)
        }
        const saltHex = salt.toString(16).padStart(16, '0'); // convert salt to hex and pad it to 8 bytes
        if (saltHex.length > 16) throw new Error('Salt must be maximum of 8 bytes hex.');
        const op_codes_end = '08' + saltHex + '6d51'; // OP_PUSH8 + salt + OP_2DROP OP_1
        const redeemscript = Buffer.from(op_codes_start + chunk + op_codes_end, 'hex');
        const hash160 = garlicore.crypto.Hash.sha256ripemd160(redeemscript);
        const address = garlicore.Address.fromScriptHash(hash160).toString();
        if (redeemscript.length < 76) {
            unlockingScript = new garlicore.Script(redeemscript.length.toString(16).padStart(2, '0') + redeemscript.toString('hex'));
        } else if (redeemscript.length < 255) {
            unlockingScript = new garlicore.Script(Buffer.from('4c' + redeemscript.length.toString(16).padStart(2, '0') + redeemscript.toString('hex'), 'hex'));
        } else {
            unlockingScript = new garlicore.Script('4d' + decimalToHexLittleEndian(redeemscript.length) + redeemscript.toString('hex'));
        }
        info.push({ address, redeemscript, unlockingScript });
    }
    return info;
}

function createOpReturn(site, protocol, version, filename, filetype, data, assembly_script = {
    vin_start: 0,
    vin_end: 255,
    encoding: '16',
}) {
    // OP_RETURN <site> <protocol> <version> <filename> <filetype> <filesize> <assembly_script> <datahash160>
    site = asciiToHex(site).padStart(24, '0');
    if (site.length > 12 * 2) throw new Error('Site name is too long. Max 12 bytes.');
    protocol = asciiToHex(protocol).padEnd(20, '0');
    if (protocol.length > 10 * 2) throw new Error('Protocol is too long. Max 10 bytes.');
    version = version.toString(16).padStart(4, '0');
    if (version.length > 2 * 2) throw new Error('Version is too long. Max 2 bytes.');
    filename = asciiToHex(filename).padStart(32, '0');
    if (filename.length > 16 * 2) throw new Error('Filename is too long. Max 16 bytes.');
    filetype = asciiToHex(filetype).padStart(8, '0');
    if (filetype.length > 4 * 2) throw new Error('Filetype is too long. Max 4 bytes.');
    let filesize = (data.length / 2).toString(16).padStart(8, '0');
    if ((filesize.length / 2) > 4 * 2) throw new Error('Filesize is too long. Max 4 bytes.');
    let final_assembly_script = assembly_script.encoding ? '05' : '03'; // length of assembly script
    final_assembly_script += 'dc' + assembly_script.vin_start.toString(16).padStart(2, '0') + assembly_script.vin_end.toString(16).padStart(2, '0'); // data location
    if (assembly_script.vin_start > assembly_script.vin_end) throw new Error('Vin start must be less than vin end.');
    if (assembly_script.vin_start < 0 || assembly_script.vin_start > 255) throw new Error('Vin start must be between 0 and 255.');
    if (assembly_script.vin_end < 0 || assembly_script.vin_end > 255) throw new Error('Vin end must be between 0 and 255.');
    if (assembly_script.encoding)
        final_assembly_script += assembly_script.encoding ? 'ec' + assembly_script.encoding : ''; // encoding type
    if (!['64', '16', '10', 'f8', undefined].includes(assembly_script.encoding))
        throw new Error('Encoding must be type string -> "16": hex, "10": decimal, "64": base64, "f8": UTF-8 or undefined for ASCII.');
    final_assembly_script = final_assembly_script.padEnd(24, '0');
    let datahash160 = garlicore.crypto.Hash.sha256ripemd160(Buffer.from(data, 'hex')).toString('hex');
    let opreturn_string = site + protocol + version + filename + filetype + filesize + final_assembly_script + datahash160;
    let opreturn_buffer = Buffer.from(opreturn_string, 'hex');
    return opreturn_buffer;
}

function asciiToHex(str) { return Buffer.from(str).toString('hex'); }

function decimalToHexLittleEndian(decimal) {
    let hexString = decimal.toString(16).padStart(4, "0");
    let bytes = hexString.match(/.{1,2}/g);
    bytes.reverse();
    let newHexString = bytes.join('');
    return newHexString;
}

function connectToElectrum() {
    try {
        client.initElectrum(
            { client: 'electrum-client-js', version: ['1.2', '1.4'] },
            { retryPeriod: 5000, maxRetry: 10, pingPeriod: 5000 }
        );
    } catch (error) {
        console.log(error);
    }
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }