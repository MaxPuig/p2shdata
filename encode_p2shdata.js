import garlicore from 'bitcore-lib-grlc';

let example_op_return = createOpReturn('opreturn.net', '/p2shdata', 1, 'garlicoin', 'png', 'example_data', { vin_start: 0, vin_end: 255, encoding: '64' });
console.log(example_op_return.toString());

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
    let filesize = data.length.toString(16).padStart(8, '0');
    if (filesize.length > 4 * 2) throw new Error('Filesize is too long. Max 4 bytes.');
    let final_assembly_script = assembly_script.encoding ? '05' : '03'; // length of assembly script
    final_assembly_script += 'dc' + assembly_script.vin_start.toString(16).padStart(2, '0') + assembly_script.vin_end.toString(16).padStart(2, '0'); // data location
    assembly_script.vin_start = parseInt(assembly_script.vin_start, 16);
    assembly_script.vin_end = parseInt(assembly_script.vin_end);
    if (assembly_script.vin_start > assembly_script.vin_end) throw new Error('Vin start must be less than vin end.');
    if (assembly_script.vin_start < 0 || assembly_script.vin_start > 255) throw new Error('Vin start must be between 0 and 255.');
    if (assembly_script.vin_end < 0 || assembly_script.vin_end > 255) throw new Error('Vin end must be between 0 and 255.');
    if (assembly_script.encoding)
        final_assembly_script += assembly_script.encoding ? 'ec' + assembly_script.encoding : ''; // encoding type
    if (!['64', '16', '10', 'f8', undefined].includes(assembly_script.encoding)) {
        throw new Error('Encoding must be type string -> "16": hex, "10": decimal, "64": base64, "f8": UTF-8 or undefined for ASCII.');
    }
    final_assembly_script = final_assembly_script.padEnd(24, '0');
    let datahash160 = garlicore.crypto.Hash.sha256ripemd160(Buffer.from(data, 'hex')).toString('hex');
    let op_codes = '6a4c50'; // OP_RETURN + OP_PUSHDATA1 + 80
    let opreturn_string = op_codes + site + protocol + version + filename + filetype + filesize + final_assembly_script + datahash160;
    let opreturn_buffer = Buffer.from(opreturn_string);
    return opreturn_buffer;
}

function asciiToHex(str) { return Buffer.from(str).toString('hex'); }