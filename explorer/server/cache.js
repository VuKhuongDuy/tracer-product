'use strict';
// Cache block đã tóm tắt theo số. Block bất biến nên cache vĩnh viễn trong RAM.
const store = new Map();

module.exports = {
  get: (n) => store.get(n),
  set: (n, v) => store.set(n, v),
  has: (n) => store.has(n),
};
