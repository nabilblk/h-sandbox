import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invoiceTotal } from './invoice.mjs';

test('applies discount before shipping', () => assert.equal(invoiceTotal(10000, 20, 500), 8500));
test('rounds discounted cents once', () => assert.equal(invoiceTotal(1999, 15, 250), 1949));
test('handles no discount', () => assert.equal(invoiceTotal(2400, 0, 300), 2700));
test('a full discount still charges shipping', () => assert.equal(invoiceTotal(5000, 100, 400), 400));
