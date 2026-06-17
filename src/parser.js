import { Transform } from 'node:stream';

export function compile(rawPattern) {
  const pattern = rawPattern.toLowerCase().split('.');

  function* parser() {
    let pos = 0;
    let start = null;
    let advance = false;
    let counter = 0;
    while (true) {
      const token = yield;

      function matches() {
        return (pattern[pos] === '*' && /^[\w-]+$/.test(token))  || token === pattern[pos];
      }

      if (token === '.') {
        if (advance) {
          advance = false;
          pos++;
        }
      } else {
        advance = false;
        if (!matches()) {
          pos = 0;
        }
        if (matches()) {
          if (pos === 0) {
            start = counter;
          } else if (pos === pattern.length - 1) {
            return start;
          }
          advance = true;
        }
      }
      counter++;
    }
  }

  return function () {
    const pat = parser();
    pat.next();
    return pat;
  };
}

export function lineCounter() {
  let line = 1;
  let col = 1;
  let seq = 0;
  const tokenStarts = [];

  function* counter() {
    while (true) {
      const token = yield [line, col];
      tokenStarts.push([line, col]);
      if (token === '\n') {
        line++;
        col = 1;
      } else {
        col += token.length;
      }
      seq++;
    }
  }

  const cnt = counter();
  cnt.next();
  return {
    next: (token) => cnt.next(token),
    startOf: (tokenIndex) => tokenStarts[tokenIndex],
  };
}

export function combine(patterns, getPattern = (pat) => pat.pattern()) {

  function* parser() {
    const pats = patterns.map(getPattern);
    const counter = lineCounter();

    while (true) {
      const token = yield;
      const [endLine, endColumn] = counter.next(token).value;
      for (let i = 0; i < pats.length; i++) {
        const next = pats[i].next(token);
        if (next.done) {
          const [startLine, startColumn] = counter.startOf(next.value);
          return {
            match: patterns[i],
            position: {
              startLine, startColumn, endLine, endColumn
            }
          };
        }
      }
    }
  }

  return function () {
    const prs = parser();
    prs.next();
    return prs;
  };
}

export class BinaryStream extends Error {
}

export class Tokenize extends Transform {
  last = null;

  constructor() {
    super({ objectMode: true });
  }

  _transform(data, encoding, callback) {
    if (data.includes(0)) {
      callback(new BinaryStream());
      return;
    }
    const tokens = ((this.last ?? '') + data.toString())
      .split(/([.\n]|[^.\n\w-]+)/)
      .filter(token => token !== '')
      .map(token => token.toLowerCase());
    tokens.forEach((token, i) => {
      if (i === tokens.length - 1) {
        this.last = token;
      } else {
        this.push(token);
      }
    });
    callback();
  }

  _flush(callback) {
    if (this.last != null) this.push(this.last);
    callback();
  }
}

export function parse(stream, pattern) {
  return new Promise((resolve, reject) => {
    const scanner = new class extends Transform {
      constructor() {
        super({ objectMode: true });
      }

      _transform(data, encoding, callback) {
        const res = pattern.next(data);
        if (res.done) {
          stream.destroy();
          resolve(res.value);
        }
        callback();
      }

      _flush(callback) {
        resolve(null);
        callback();
      }
    };
    stream
      .on('error', reject)
      .pipe(new Tokenize())
      .on('error', reject)
      .pipe(scanner)
      .on('error', reject);
  });
}
