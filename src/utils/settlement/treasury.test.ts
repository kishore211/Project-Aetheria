import { describe, expect, it } from 'vitest';
import { TREASURY_WINDOW_ROUNDS, TreasuryLedger } from './treasury';

describe('the treasury books', () => {
  it('a village with no books reads as all zeroes', () => {
    const books = new TreasuryLedger();
    expect(books.minute('nowhere')).toEqual({
      wages: 0, purchases: 0, festivals: 0, income: 0, bought: { wood: 0, stone: 0, food: 0 }, unpaidSoldiers: 0,
    });
  });

  it('sums every flow recorded in the round in progress', () => {
    const books = new TreasuryLedger();
    books.wages('a', 1);
    books.wages('a', 0.5);
    books.purchase('a', 20, 'wood', 10);
    books.purchase('a', 10, 'food', 10);
    books.festival('a', 40);
    books.income('a', 3);
    books.setUnpaid('a', 2);

    const minute = books.minute('a');
    expect(minute.wages).toBe(1.5);
    expect(minute.purchases).toBe(30);
    expect(minute.bought).toEqual({ wood: 10, stone: 0, food: 10 });
    expect(minute.festivals).toBe(40);
    expect(minute.income).toBe(3);
    expect(minute.unpaidSoldiers).toBe(2);
  });

  it('keeps each village separate', () => {
    const books = new TreasuryLedger();
    books.income('a', 5);
    books.income('b', 7);
    expect(books.minute('a').income).toBe(5);
    expect(books.minute('b').income).toBe(7);
  });

  it('a minute is the last twelve rounds: older rounds fall out of the window', () => {
    const books = new TreasuryLedger();
    books.wages('a', 100);
    for (let round = 0; round < TREASURY_WINDOW_ROUNDS - 1; round++) books.rotate(['a']);
    // Still inside the window: the first round is the oldest one kept.
    expect(books.minute('a').wages).toBe(100);

    books.wages('a', 1);
    books.rotate(['a']);
    expect(books.minute('a').wages).toBe(1);
  });

  it('closing a round opens an empty one, and the unpaid count is the latest round only', () => {
    const books = new TreasuryLedger();
    books.setUnpaid('a', 4);
    books.income('a', 2);
    books.rotate(['a']);
    books.setUnpaid('a', 1);

    expect(books.minute('a').income).toBe(2);
    expect(books.minute('a').unpaidSoldiers).toBe(1);
  });

  it('drops the books of villages that no longer exist when the round closes', () => {
    const books = new TreasuryLedger();
    books.income('gone', 9);
    books.income('kept', 4);
    books.rotate(['kept']);
    expect(books.minute('gone').income).toBe(0);
    expect(books.minute('kept').income).toBe(4);
  });
});
