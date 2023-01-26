import { ElectrumClient } from '@samouraiwallet/electrum-client';
import garlicore from 'bitcore-lib-grlc';
import fs from 'fs';
const client = new ElectrumClient(50002, 'services.garlicoin.ninja', 'tls');

const txid = '1aee8058f206821dbaefd2ddec9dcbb5b71655c6627eaec33b5805fa61ed496a'; // base64 garlicoin.png
// const txid = '1e882dbb3206cbc3d2699a2e01fedb9204797f43efacd8453dcaeb318f772223'; // base64 garlic5.jpg
// const txid = '1cd21c912628bcfc9c7f95389b4eb0f8b4a452b4c3803376932f0a2e270c3818'; // ASCII Loewenbraeu.txt
// const txid = '3db2de399ddf2f97f82848b5df68d11486e497134b04d4f88344dfd117c6cb58'; // ASCII  elements.txt
// const txid = '4abfe3c11b1a0eef9c4df61363ebebff14e581a1bc30e47543a0ae30a66e5d3f'; // base64  opreturn_logo.png

main();

async function main() {
    connectToElectrum();
    let rawTx = await client.blockchainTransaction_get(txid);
    let tx = garlicore.Transaction(rawTx).toObject();
    let title = tx.outputs.filter((vout) => { return vout.satoshis == 0 })[0].script;
    let data_array = tx.inputs.map((vin) => { return vin.script });
    let data = '';
    for (let chunk of data_array) {
        if (chunk.startsWith('4d')) { // deletes the first 6 and the last 11 bytes (OP_CODES)
            chunk = chunk.slice(12);
            data += chunk.slice(0, -22);
        } else if (chunk.startsWith('4c')) { // deletes the first 4 and the last 11 bytes (OP_CODES)
            chunk = chunk.slice(8);
            data += chunk.slice(0, -22);
        } else { // deletes the first 2 and the last 11 bytes (OP_CODES)
            chunk = chunk.slice(4);
            data += chunk.slice(0, -22);
        }
    }
    let decodedTitle = decodeTitle(title);
    console.log(decodedTitle);
    // ripemd160(sha256) hash of the data
    let hash160 = garlicore.crypto.Hash.sha256ripemd160(Buffer.from(data, 'hex')).toString('hex');
    console.log('hash160 match:', hash160 == decodedTitle.datahash160);
    fs.mkdir('./data/', { recursive: true }, function (err) { // create data folder and save file
        if (err) return cb(err);
        fs.writeFile('./data/' + decodedTitle.filename + '.' + decodedTitle.filetype, Buffer.from(data, "hex"), () => {
            console.log(`File saved: ./data/${decodedTitle.filename}.${decodedTitle.filetype}`);
        });
    });

    client.close();
}

function decodeTitle(vout_string) {
    let hex = vout_string.slice(6); // remove the first 3 bytes (OP_CODES)
    let site = hexToAscii(hex.slice(0, 24)).replace(/\x00/g, '');
    let protocol = hexToAscii(hex.slice(24, 44)).replace(/\x00/g, '');
    let version = hexToDecimal(hex.slice(44, 48));
    let filename = hexToAscii(hex.slice(48, 80)).replace(/\x00/g, '');
    let filetype = hexToAscii(hex.slice(80, 88)).replace(/\x00/g, '');
    let filesize = hexToDecimal(hex.slice(88, 96));
    let assembly_script = hex.slice(96, 120);
    let datahash160 = hex.slice(120, 160);
    let info = { site, protocol, version, filename, filetype, filesize, assembly_script, datahash160 };
    info.assembly_script = decodeAssemblyScript(assembly_script);
    return info;
}

function decodeAssemblyScript(entire_assembly_script) {
    let assembly_script_length = hexToDecimal(entire_assembly_script.slice(0, 2));
    let script = entire_assembly_script.slice(2, assembly_script_length * 2 + 2);
    let data_location = script.slice(0, 6);
    let first_vin = hexToDecimal(script.slice(2, 4));
    let last_vin = hexToDecimal(script.slice(4, 6));
    let encoding_type = 'ASCII';
    let encoding;
    if (script.includes('ec')) {
        encoding = script.slice(6, 10);
        encoding_type = encoding.slice(2, 4);
        if (encoding_type == '64') {
            encoding_type = 'base64';
        } else if (encoding_type == '10') {
            encoding_type = 'base10';
        } else if (encoding_type == 'f8') {
            encoding_type = 'UTF-8';
        } else {
            encoding_type = 'ASCII';
        }
    }
    let info = { entire_assembly_script, assembly_script_length, script, data_location, first_vin, last_vin, encoding_type };
    if (encoding) info.encoding = encoding;
    return info;
}

function hexToAscii(hex) { return Buffer.from(hex, 'hex').toString(); }

function hexToDecimal(hex) { return parseInt(hex, 16); }

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