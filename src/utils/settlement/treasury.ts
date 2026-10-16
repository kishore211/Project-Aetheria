// The treasury's books: what each village's gold did over the last minute.
//
// Write-only from the simulation's point of view. Economy, trade and the
// feeding rounds record flows here as they happen; nothing in the simulation
// reads them back, so the books can never change what happens in a world.
// The windows read them through `describeVillage` and `publishSummaries`.

/** One economy round's worth of gold movements in one village. */
export interface TreasuryFlows {
  /** Gold paid to soldiers as wages. */
  wages: number;
  /** Gold spent at the market. */
  purchases: number;
  /** Gold spent on court festivals. */
  festivals: number;
  /** Gold taken in: the lord's tax, meals, ore brought up, and trade. */
  income: number;
  /** Units the market delivered, by good. */
  bought: { wood: number; stone: number; food: number };
}

/** Rounds in the rolling window: twelve economy rounds of five seconds, a minute. */
export const TREASURY_WINDOW_ROUNDS = 12;

const emptyFlows = (): TreasuryFlows => ({
  wages: 0, purchases: 0, festivals: 0, income: 0, bought: { wood: 0, stone: 0, food: 0 },
});

interface VillageBooks {
  /** Oldest round first; the last entry is the round in progress. */
  rounds: TreasuryFlows[];
  /** Soldiers the treasury could not pay in the most recent round. */
  unpaidSoldiers: number;
}

/** A village's last minute, summed over the window. */
export interface TreasuryMinute extends TreasuryFlows {
  unpaidSoldiers: number;
}

export class TreasuryLedger {
  private books = new Map<string, VillageBooks>();

  /** The round in progress for a village, opened on first use. */
  private current(villageId: string): TreasuryFlows {
    let book = this.books.get(villageId);
    if (!book) {
      book = { rounds: [emptyFlows()], unpaidSoldiers: 0 };
      this.books.set(villageId, book);
    }
    return book.rounds[book.rounds.length - 1];
  }

  /** Gold paid to soldiers this round. */
  wages(villageId: string, gold: number): void { this.current(villageId).wages += gold; }

  /** Gold spent at the market this round, and the units it bought. */
  purchase(villageId: string, gold: number, good: 'wood' | 'stone' | 'food', units: number): void {
    const round = this.current(villageId);
    round.purchases += gold;
    round.bought[good] += units;
  }

  /** Gold spent on a festival this round. */
  festival(villageId: string, gold: number): void { this.current(villageId).festivals += gold; }

  /** Gold taken in this round. */
  income(villageId: string, gold: number): void { this.current(villageId).income += gold; }

  /** How many soldiers went unpaid in the latest round. */
  setUnpaid(villageId: string, soldiers: number): void {
    this.current(villageId);
    this.books.get(villageId)!.unpaidSoldiers = soldiers;
  }

  /**
   * Close the round in progress and open the next, for every village the
   * economy knows of. Called once per economy round. Books of villages that
   * no longer exist are dropped.
   */
  rotate(liveVillageIds: Iterable<string>): void {
    const live = new Set(liveVillageIds);
    for (const [villageId, book] of this.books) {
      if (!live.has(villageId)) {
        this.books.delete(villageId);
        continue;
      }
      book.rounds.push(emptyFlows());
      if (book.rounds.length > TREASURY_WINDOW_ROUNDS) book.rounds.shift();
    }
  }

  /** A village's last minute of gold movements. Zeroes when it has no books. */
  minute(villageId: string): TreasuryMinute {
    const total: TreasuryMinute = { ...emptyFlows(), bought: { wood: 0, stone: 0, food: 0 }, unpaidSoldiers: 0 };
    const book = this.books.get(villageId);
    if (!book) return total;
    for (const round of book.rounds) {
      total.wages += round.wages;
      total.purchases += round.purchases;
      total.festivals += round.festivals;
      total.income += round.income;
      total.bought.wood += round.bought.wood;
      total.bought.stone += round.bought.stone;
      total.bought.food += round.bought.food;
    }
    total.unpaidSoldiers = book.unpaidSoldiers;
    return total;
  }
}
