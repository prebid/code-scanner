import { Readable , Writable} from 'node:stream';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Buffer } from 'node:buffer';

class WriteToBuffer extends Writable {
  _write(chunk, encoding, callback) {
    if (this._data == null) {
      this._data = Buffer.from(chunk)
    } else {
      this._data = Buffer.concat([this._data, Buffer.from(chunk)]);
    }
    callback();
  }
  toString() {
    return this._data.toString('base64')
  }
}

export async function encode(str) {
  const read = new Readable();
  const write = new WriteToBuffer()
  const gzip = createGzip();
  const pipe = pipeline(read, gzip, write);
  read.push(str);
  read.push(null);
  await pipe;
  return write.toString();
}