import { expect } from 'chai';
import { BinaryStream, Token, combine, compile, lineCounter, Tokenize, parse } from '../src/parser.js';
import { Writable, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Buffer } from 'node:buffer';
import assert from 'node:assert';

describe('parser', () => {
  function feed(target, tokens, tokenize = true) {
    let next;
    for (const token of tokens) {
      if (next != null) {
        expect(next.done).to.be.false;
      }
      next = target.next(tokenize ? Token.from(Token.pattern().exec(token)) : token);
    }
    return next;
  }

  describe('compile', () => {

    it('can match', () => {
      const pat = compile('test.com')();
      const result = feed(pat, ['test', '.', 'com']);
      expect(result.value).to.eql(0);
    });

    it('can match single tokens', () => {
      const pat = compile('test')();
      const result = feed(pat, ['filler', 'test']);
      expect(result.value).to.eql(1);
    })

    it('can match in middle of stream', () => {
      const pat = compile('test.com')();
      const result = feed(pat, ['not', '\n', 'relevant', '\r', 'test', '.', 'com']);
      expect(result.value).to.eql(4);
    });

    it('can match after partial match', () => {
      const pat = compile('test.com')();
      const result = feed(pat, ['test', '.', '\n', 'test', '.', 'com']);
      expect(result.value).to.eql(3);
    });

    it('can match overlapping patterns', () => {
      const pat = compile('*.*.com')();
      let result = feed(pat, ['test', '.', 'com', '.', 'com']);
      expect(result.value).to.eql(0);
      result = feed(pat, ['.', 'com']);
      expect(result.value).to.eql(2);
    })

    it('stops matching on a false start', () => {
      const pat = compile('test.com')();
      const result = feed(pat, ['test', 'not', '.', 'com']);
      expect(result.value).to.be.null;
    })

    it('can match during a match', () => {
      const pat = compile('test.com')();
      const result = feed(pat, ['test', '.', 'test', '.', 'com']);
      expect(result.value).to.eql(2);
    });

    it('can match multiple occurrences', () => {
      const pat = compile('test.com')();
      let result = feed(pat, ['test', '.', 'com']);
      expect(result.value).to.eql(0);
      result = feed(pat, ['filler', 'test', '.', 'com']);
      expect(result.value).to.eql(4);
    })

    it('can match star', () => {
      const pat = compile('*.test.com')();
      const result = feed(pat, ['sub', '.', 'test', '.', 'sub', '.', 'test', '.', 'com']);
      expect(result.value).to.eql(4);
    });

    it('does not match star on non-alphanumeric tokens', () => {
      const pat = compile('*.test.com')();
      const result = feed(pat, ['?', '.', 'test', '.', 'com']);
      expect(result.value).to.be.null;
    })
  });
  describe('lineCounter', () => {
    let counter;
    beforeEach(() => {
      counter = lineCounter();
    });
    it('yields line and column', () => {
      expect(counter.next('').value).to.eql([1, 1]);
      expect(counter.next('a').value).to.eql([1, 2]);
      expect(counter.next('\n').value).to.eql([2, 1]);
    });
    it('keeps track of tokens position', () => {
      feed(counter, ['first line', '\n', 'second', 'line', '\n', 'third line'], false);
      expect(counter.startOf(3)).to.eql([2, 7]);
    });
  });
  describe('combine', () => {
    it('matches when any pattern matches', () => {
      const patterns = [
        {
          id: 1,
          pattern: compile('test.com.au'),
        },
        {
          id: 2,
          pattern: compile('test.com'),
        }
      ];
      const combined = combine(patterns)();
      const result = feed(combined, ['test', '.', 'com']);
      expect(result.done).to.be.false;
      expect(result.value[0].match.id).to.equal(2);
    });
    it('keeps track of lines and columns', () => {
      const patterns = [{ pattern: compile('test.com') }];
      const combined = combine(patterns)();
      const result = feed(combined, ['ignore', '\n', 'ignore', '\r', 'test', '.', 'com']);
      expect(result.done).to.be.false;
      expect(result.value).to.eql([{
        match: patterns[0],
        position: {
          startLine: 2,
          startColumn: 8,
          endLine: 2,
          endColumn: 16
        }
      }]);
    });
    it('keeps matching for all patterns', () => {
      const combined = combine([
        {id: 1, pattern: compile('test.com')},
        {id: 2, pattern: compile('test.com.au')},
      ])();

      let result = feed(combined, ['filler', '?', 'test', '.', 'com']);
      expect(result.value.length).to.eql(1);
      expect(result.value[0].match.id).to.eql(1);
      result = feed(combined, ['.', 'au']);
      expect(result.value.length).to.eql(1);
      expect(result.value[0].match.id).to.eql(2);
    });

    it('can match multiple patterns simultaneously', () => {
      const patterns = [
        {id: 1, pattern: compile('test.com')},
        {id: 2, pattern: compile('test.com')}
      ];
      const combined = combine(patterns)();
      const result = feed(combined, ['test', '.', 'com']);
      expect(result.value.map(({match}) => match)).to.eql(patterns);
      expect(result.value[0].location).to.eql(result.value[1].location);
    })
  });

  class DummyReader extends Readable {
    constructor(data) {
      super();
      this.data = data;
      this.i = 0;
    }

    _read() {
      this.push(this.data[this.i++] ?? null);
    }
  }

  describe('tokenize', () => {
    class DummyWriter extends Writable {
      constructor() {
        super({ objectMode: true });
      }

      chunks = [];

      _write(chunk, encoding, callback) {
        this.chunks.push(chunk);
        callback();
      }
    }

    async function pipe(data) {
      const source = new DummyReader(data);
      const dest = new DummyWriter();
      await pipeline(source, new Tokenize(), dest);
      return dest.chunks;
    }

    it('splits non-alphanumeric characters', async () => {
      expect(await pipe([Buffer.from('test.com', 'utf8')])).to.eql([
        new Token(Token.ALPHANUMERIC, 'test'),
        new Token(Token.BREAK, '.'),
        new Token(Token.ALPHANUMERIC, 'com')
      ]);
    });
    it('always isolates dots and newlines', async () => {
      expect(await pipe([Buffer.from('??.++\n--', 'utf8')])).to.eql([
        new Token(Token.OTHER, '??'),
        new Token(Token.BREAK, '.'),
        new Token(Token.OTHER, '++'),
        new Token(Token.BREAK, '\n'),
        new Token(Token.ALPHANUMERIC, '--')
      ]);
    });
    it('does not split on dashes', async () => {
      expect(await pipe([Buffer.from('test-example.com', 'utf-8')])).to.eql([
        new Token(Token.ALPHANUMERIC, 'test-example'),
        new Token(Token.BREAK, '.'),
        new Token(Token.ALPHANUMERIC, 'com')
      ]);
    });
    it('does not split on chunk boundary', async () => {
      expect(await pipe([Buffer.from('te', 'utf-8'), Buffer.from('st.com', 'utf-8')])).to.eql([
        new Token(Token.ALPHANUMERIC, 'test'),
        new Token(Token.BREAK, '.'),
        new Token(Token.ALPHANUMERIC, 'com')
      ]);
    });
    it('throws on zeroes', async () => {
      try {
        await pipe([Buffer.from([0])]);
        assert.fail('did not throw');
      } catch (e) {
        expect(e).to.be.instanceof(BinaryStream);
      }
    });
  });
  describe('scan', () => {
    it('can scan for patterns', async () => {
      const stream = new DummyReader([Buffer.from('filler\ntest.com\nfiller', 'utf-8'), Buffer.from('hello', 'utf-8')]);
      const pattern = compile('test.com')();
      expect(await parse(stream, pattern)).to.eql([2]);
    });
    it('resolves on no match',  async () => {
      const stream = new DummyReader(Buffer.from('', 'utf-8'));
      const pattern = compile('test.com')();
      expect(await parse(stream, pattern)).to.eql([]);
    })
    it('throws BinaryStream on zeroes', async () => {
      const stream = new DummyReader([Buffer.from([0])]);
      const pattern = compile('test.com')();
      try {
        await parse(stream, pattern);
        assert.fail('did not throw');
      } catch (e) {
        expect(e).to.be.instanceof(BinaryStream);
      }
    });
  });
});

