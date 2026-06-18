import { Writable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';


export function compile(rawPattern) {
  const pattern = rawPattern.toLowerCase().split('.');

  function* parser() {
    const matching = new Map();
    let counter = 0;
    let match = null;

    while (true) {
      const token = yield match;
      match = null;

      function matches(i) {
        return pattern[i] === '*' || token.text.toLowerCase() === pattern[i];
      }

      if (token.type === Token.ALPHANUMERIC) {
        matching.set(counter, -1);
        for (let [start, pos] of matching.entries()) {
          if (matches(pos + 1)) {
            pos++;
            if (pos === pattern.length - 1) {
              match = start;
              matching.delete(start);
            } else {
              matching.set(start, pos);
            }
          } else {
            matching.delete(start);
          }
        }
      } else {
        if (token.text !== '.') matching.clear();
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
    const matches = [];

    while (true) {
      const token = yield matches;
      matches.length = 0;
      const [endLine, endColumn] = counter.next(token.text).value;
      for (let i = 0; i < pats.length; i++) {
        if (pats[i] == null) continue;
        const result = pats[i].next(token);
        if (result.value != null) {
          const [startLine, startColumn] = counter.startOf(result.value);
          matches.push({
            match: patterns[i],
            position: {
              startLine, startColumn, endLine, endColumn
            }
          });
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

export class Token {
  static BREAK = 2;
  static ALPHANUMERIC = 3;
  static OTHER = 4;

  constructor(type, text) {
    this.type = type;
    this.text = text;
  }

  static pattern() {
    return /(([\n.])|([\w-]+)|([^.\n\w-]+))/g
  }

  static from(match) {
    const type = match[this.BREAK] ? this.BREAK
      : match[this.ALPHANUMERIC] ? this.ALPHANUMERIC
        : this.OTHER
    return new this(type, match[0]);
  }
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
    const text = (this.last?.text ?? '') + data.toString();
    const pat = Token.pattern();
    let token;
    do {
      if (token != null) {
        this.push(token);
      }
      token = Token.from(pat.exec(text));
    } while (pat.lastIndex < text.length);
    this.last = token;
    callback();
  }

  _flush(callback) {
    if (this.last != null) this.push(this.last);
    callback();
  }
}

export async function parse(stream, pattern) {
  let done = false;
  const matches = [];
  const scanner = new Writable({
    objectMode: true,
    write(chunk, encoding, callback) {
      if (!done) {
        const result = pattern.next(chunk);
        done = result.done;
        if (result.value) {
          matches.push(...(Array.isArray(result.value) ? result.value : [result.value]));
        }
      }
      callback();
    }
  });
  await pipeline(stream, new Tokenize(), scanner);
  return matches;
}
